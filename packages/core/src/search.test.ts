import { describe, expect, it, vi } from "vitest";
import { searchProviders } from "./search";
import { makeResult } from "./testing/make-result";
import { ProviderError, type Provider, type ProviderId, type Result } from "./types";

function provider(id: ProviderId, behaviour: (query: string) => Promise<Result[]>): Provider {
  return { id, name: id, search: behaviour };
}

describe("searchProviders", () => {
  it("collects results and an 'ok' status from every provider that answers", async () => {
    const a = makeResult({ id: "10.1000/a" });
    const b = makeResult({ id: "10.1000/b" });
    const outcome = await searchProviders(
      [provider("openalex", async () => [a]), provider("crossref", async () => [b])],
      "sleep",
      { limit: 10 },
    );
    expect(outcome.results).toEqual([a, b]);
    expect(outcome.statuses).toEqual([
      { provider: "openalex", state: "ok", count: 1 },
      { provider: "crossref", state: "ok", count: 1 },
    ]);
  });

  it("keeps the other providers' results when one fails, and says which failed and how", async () => {
    const good = makeResult({ id: "10.1000/good" });
    const outcome = await searchProviders(
      [
        provider("openalex", async () => {
          throw new ProviderError("rate-limited", "budget used up", { httpStatus: 429 });
        }),
        provider("crossref", async () => [good]),
        provider("pubmed", async () => {
          throw new ProviderError("failed", "HTTP 500", { httpStatus: 500 });
        }),
        provider("arxiv", async () => {
          throw new Error("boom");
        }),
      ],
      "sleep",
      { limit: 10 },
    );

    expect(outcome.results).toEqual([good]);
    expect(outcome.statuses).toEqual([
      { provider: "openalex", state: "rate-limited", message: "budget used up" },
      { provider: "crossref", state: "ok", count: 1 },
      { provider: "pubmed", state: "failed", message: "HTTP 500" },
      { provider: "arxiv", state: "failed", message: "arxiv failed unexpectedly: boom" },
    ]);
  });

  it("reports a provider that returns nothing as ok with a count of 0", async () => {
    const outcome = await searchProviders([provider("openalex", async () => [])], "zzzz", { limit: 10 });
    expect(outcome.statuses).toEqual([{ provider: "openalex", state: "ok", count: 0 }]);
  });

  it("passes the trimmed query and the options to every provider", async () => {
    const search = vi.fn<Provider["search"]>(async () => []);
    const controller = new AbortController();
    await searchProviders([{ id: "openalex", name: "OpenAlex", search }], "  sleep  ", {
      limit: 25,
      signal: controller.signal,
    });
    expect(search).toHaveBeenCalledWith("sleep", { limit: 25, signal: controller.signal });
  });

  it("does not call any provider for a blank query", async () => {
    const search = vi.fn<Provider["search"]>(async () => []);
    const outcome = await searchProviders([{ id: "openalex", name: "OpenAlex", search }], "   ", { limit: 10 });
    expect(search).not.toHaveBeenCalled();
    expect(outcome).toEqual({ results: [], statuses: [] });
  });

  it("runs providers concurrently, not one after another", async () => {
    const order: string[] = [];
    const slow = provider("openalex", async () => {
      order.push("slow:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow:end");
      return [];
    });
    const fast = provider("crossref", async () => {
      order.push("fast");
      return [];
    });
    await searchProviders([slow, fast], "q", { limit: 10 });
    expect(order).toEqual(["slow:start", "fast", "slow:end"]);
  });
});
