import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchCache } from "./cache";
import { parseQuery } from "./query";
import { parseConcepts } from "./concepts";
import { DEFAULT_TIMEOUT_MS, fallbackOrder, planQueries, searchProviders, type ProviderUpdate } from "./search";
import { makeResult } from "./testing/make-result";
import { ProviderError, type Provider, type ProviderId, type Result } from "./types";

function provider(
  id: ProviderId,
  behaviour: (query: string) => Promise<Result[]>,
  syntax: Provider["syntax"] = "boolean",
): Provider {
  return { id, name: id, syntax, search: behaviour };
}

/** A provider that never answers and never looks at its cancellation signal. */
const silent = (id: ProviderId): Provider => provider(id, () => new Promise<Result[]>(() => {}));

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
    await searchProviders([{ id: "openalex", name: "OpenAlex", syntax: "boolean", search }], "  sleep  ", {
      limit: 25,
      signal: controller.signal,
    });
    // Each provider gets the trimmed query and the limit, plus a signal of its own that
    // follows the caller's (so a per-provider timeout can cancel just that provider).
    expect(search).toHaveBeenCalledWith("sleep", { limit: 25, signal: expect.any(AbortSignal) });
  });

  it("does not call any provider for a blank query", async () => {
    const search = vi.fn<Provider["search"]>(async () => []);
    const outcome = await searchProviders([{ id: "openalex", name: "OpenAlex", syntax: "boolean", search }], "   ", { limit: 10 });
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

describe("searchProviders: time limits", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("defaults to 15 seconds per provider", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
  });

  it("gives up on a provider that never answers, without holding back the others", async () => {
    const good = makeResult({ id: "10.1000/good" });
    const run = searchProviders([silent("openalex"), provider("crossref", async () => [good])], "q", {
      limit: 5,
      timeoutMs: 3_000,
    });
    await vi.advanceTimersByTimeAsync(3_000);
    const outcome = await run;

    expect(outcome.results).toEqual([good]);
    expect(outcome.statuses).toEqual([
      { provider: "openalex", state: "failed", message: "openalex did not answer within 3 s" },
      { provider: "crossref", state: "ok", count: 1 },
    ]);
  });

  it("does not time out a provider that answers in time", async () => {
    const slowButFine = provider("openalex", () => new Promise<Result[]>((resolve) => setTimeout(() => resolve([makeResult()]), 2_000)));
    const run = searchProviders([slowButFine], "q", { limit: 5, timeoutMs: 3_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await run).statuses).toEqual([{ provider: "openalex", state: "ok", count: 1 }]);
  });

  it("also cancels the slow provider's own request when its time is up", async () => {
    let seen: AbortSignal | undefined;
    const watching: Provider = {
      id: "openalex",
      name: "OpenAlex",
      syntax: "boolean",
      search: (_query, { signal }) => {
        seen = signal;
        return new Promise<Result[]>(() => {});
      },
    };
    const run = searchProviders([watching], "q", { limit: 5, timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(seen?.aborted).toBe(true);
  });

  it("cancels every provider's request when the caller cancels", async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const watching = (id: ProviderId): Provider => ({
      id,
      name: id,
      syntax: "boolean",
      search: (_query, { signal }) => {
        if (signal) signals.push(signal);
        return new Promise<Result[]>(() => {});
      },
    });
    const run = searchProviders([watching("openalex"), watching("crossref")], "q", {
      limit: 5,
      signal: controller.signal,
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(signals.map((s) => s.aborted)).toEqual([false, false]);
    controller.abort();
    expect(signals.map((s) => s.aborted)).toEqual([true, true]);
    await vi.advanceTimersByTimeAsync(1_000);
    await run;
  });

  it("starts out cancelled if the caller had already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    let aborted: boolean | undefined;
    const watching: Provider = {
      id: "openalex",
      name: "OpenAlex",
      syntax: "boolean",
      search: async (_query, { signal }) => {
        aborted = signal?.aborted;
        return [];
      },
    };
    await searchProviders([watching], "q", { limit: 5, signal: controller.signal });
    expect(aborted).toBe(true);
  });
});

describe("searchProviders: progressive results", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  const after = (ms: number, results: Result[]) =>
    new Promise<Result[]>((resolve) => setTimeout(() => resolve(results), ms));

  it("reports each provider the moment it finishes, fastest first", async () => {
    const seen: string[] = [];
    const run = searchProviders(
      [
        provider("openalex", () => after(300, [makeResult({ id: "10.1/slow" })])),
        provider("crossref", () => after(100, [makeResult({ id: "10.1/fast" })])),
        provider("pubmed", async () => {
          throw new ProviderError("rate-limited", "busy");
        }),
      ],
      "q",
      { limit: 5, onProviderDone: (update) => void seen.push(`${update.provider}:${update.status.state}`) },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual(["pubmed:rate-limited"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual(["pubmed:rate-limited", "crossref:ok"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toEqual(["pubmed:rate-limited", "crossref:ok", "openalex:ok"]);

    // The final outcome is still in the order the providers were given.
    const outcome = await run;
    expect(outcome.statuses.map((s) => s.provider)).toEqual(["openalex", "crossref", "pubmed"]);
  });

  it("hands over the results with each update", async () => {
    const updates: ProviderUpdate[] = [];
    const answer = makeResult({ id: "10.1/answer" });
    await searchProviders([provider("openalex", async () => [answer])], "q", { limit: 5, onProviderDone: (u) => void updates.push(u) });
    expect(updates).toEqual([
      { provider: "openalex", status: { provider: "openalex", state: "ok", count: 1 }, results: [answer] },
    ]);
  });

  it("is not broken by a listener that throws", async () => {
    const outcome = await searchProviders([provider("openalex", async () => [makeResult()])], "q", {
      limit: 5,
      onProviderDone: () => {
        throw new Error("listener bug");
      },
    });
    expect(outcome.statuses).toEqual([{ provider: "openalex", state: "ok", count: 1 }]);
  });
});

describe("searchProviders: caching", () => {
  it("answers a repeated search from memory, and says so", async () => {
    const search = vi.fn(async () => [makeResult({ id: "10.1/a" })]);
    const cache = createSearchCache();
    const providers = [{ id: "openalex" as const, name: "OpenAlex", syntax: "boolean" as const, search }];

    const first = await searchProviders(providers, "sleep", { limit: 50, cache });
    const second = await searchProviders(providers, "  sleep ", { limit: 50, cache });

    expect(search).toHaveBeenCalledTimes(1);
    expect(first.statuses).toEqual([{ provider: "openalex", state: "ok", count: 1 }]);
    expect(second.statuses).toEqual([{ provider: "openalex", state: "ok", count: 1, cached: true }]);
    expect(second.results).toEqual(first.results);
  });

  it("also reports a cached answer through the progress callback", async () => {
    const cache = createSearchCache();
    const providers = [provider("openalex", async () => [makeResult()])];
    await searchProviders(providers, "q", { limit: 5, cache });
    const updates: ProviderUpdate[] = [];
    await searchProviders(providers, "q", { limit: 5, cache, onProviderDone: (u) => void updates.push(u) });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toMatchObject({ state: "ok", cached: true });
  });

  it("asks again for a different query or a different number of results", async () => {
    const search = vi.fn(async () => []);
    const cache = createSearchCache();
    const providers = [{ id: "openalex" as const, name: "OpenAlex", syntax: "boolean" as const, search }];
    await searchProviders(providers, "sleep", { limit: 50, cache });
    await searchProviders(providers, "memory", { limit: 50, cache });
    await searchProviders(providers, "sleep", { limit: 100, cache });
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("never remembers a failure, so a retry really retries", async () => {
    let calls = 0;
    const flaky = provider("openalex", async () => {
      calls += 1;
      if (calls === 1) throw new ProviderError("rate-limited", "busy");
      return [makeResult()];
    });
    const cache = createSearchCache();
    const first = await searchProviders([flaky], "q", { limit: 5, cache });
    const second = await searchProviders([flaky], "q", { limit: 5, cache });
    expect(first.statuses[0]?.state).toBe("rate-limited");
    expect(second.statuses[0]).toEqual({ provider: "openalex", state: "ok", count: 1 });
    expect(cache.size).toBe(1);
  });

  it("caches each provider separately", async () => {
    const cache = createSearchCache();
    const a = vi.fn(async () => [makeResult({ id: "10.1/a" })]);
    const b = vi.fn(async () => [makeResult({ id: "10.1/b" })]);
    const providers = [
      { id: "openalex" as const, name: "A", syntax: "boolean" as const, search: a },
      { id: "crossref" as const, name: "B", syntax: "boolean" as const, search: b },
    ];
    await searchProviders(providers, "q", { limit: 5, cache });
    await searchProviders([providers[0] as Provider], "q", { limit: 5, cache });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("works without a cache", async () => {
    const search = vi.fn(async () => []);
    const providers = [{ id: "openalex" as const, name: "OpenAlex", syntax: "boolean" as const, search }];
    await searchProviders(providers, "q", { limit: 5 });
    await searchProviders(providers, "q", { limit: 5 });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe("planQueries", () => {
  const boolean = { id: "openalex" as const, syntax: "boolean" as const };
  const plain = { id: "crossref" as const, syntax: "plain" as const };

  it("writes the query once per provider, in the provider's own syntax", () => {
    const planned = planQueries([boolean, plain], '"memory consolidation" sleep NOT rats');
    expect(planned).toEqual([
      { provider: "openalex", text: '"memory consolidation" AND sleep NOT rats', notes: [] },
      { provider: "crossref", text: expect.any(String), notes: expect.any(Array) },
    ]);
    expect(planned[1]?.text).not.toContain("AND");
    expect(planned[1]?.text).not.toContain("NOT");
    expect(planned[1]?.notes.length).toBeGreaterThan(0);
  });

  it("accepts text or an already parsed query, with the same result", () => {
    const text = "alpha OR beta";
    expect(planQueries([boolean, plain], parseQuery(text))).toEqual(planQueries([boolean, plain], text));
  });

  it("keeps the provider order", () => {
    expect(planQueries([plain, boolean], "sleep").map((p) => p.provider)).toEqual(["crossref", "openalex"]);
  });

  it("adds what a provider's own request does to the notes, after what it could not apply", () => {
    const scoped = { id: "openalex" as const, syntax: "boolean" as const, requestNotes: ["Looks in titles and abstracts only, not in the full text"] };
    const limited = { id: "crossref" as const, syntax: "plain" as const, requestNotes: ["At most 50 results are asked for"] };
    const [first, second] = planQueries([scoped, limited], "How AI understand odor");
    expect(first?.notes).toEqual(["Looks in titles and abstracts only, not in the full text"]);
    expect(second?.notes).toEqual([
      "This source cannot ask for alternatives (“either word”), so it was sent only the words you typed for each concept; results are checked here against every variant",
      "At most 50 results are asked for",
    ]);
  });

  it("keeps the request notes when the search is sent exactly as typed", () => {
    const scoped = { id: "openalex" as const, syntax: "boolean" as const, requestNotes: ["Looks in titles and abstracts only, not in the full text"] };
    const [only] = planQueries([scoped], parseConcepts("what is chaos", { exact: true }));
    expect(only).toEqual({
      provider: "openalex",
      text: "what is chaos",
      notes: ["Sent exactly as typed", "Looks in titles and abstracts only, not in the full text"],
    });
  });

  it("writes PubMed's and Europe PMC's field names into the text that is sent", () => {
    const planned = planQueries(
      [
        { id: "pubmed" as const, syntax: "pubmed" as const },
        { id: "europepmc" as const, syntax: "europepmc" as const },
      ],
      "chaos double pendulum",
    );
    expect(planned.map((p) => p.text)).toEqual([
      '(chaos[tiab] OR chaotic[tiab]) AND "double pendulum"[tiab]',
      '(TITLE_ABS:chaos OR TITLE_ABS:chaotic) AND TITLE_ABS:"double pendulum"',
    ]);
  });
});

describe("searchProviders: what is sent", () => {
  it("sends each provider the query written for it, which is what planQueries reports", async () => {
    const seenBoolean = vi.fn(async () => [] as Result[]);
    const seenPlain = vi.fn(async () => [] as Result[]);
    const providers: Provider[] = [
      { id: "openalex", name: "OpenAlex", syntax: "boolean", search: seenBoolean },
      { id: "crossref", name: "Crossref", syntax: "plain", search: seenPlain },
    ];
    const query = '"memory consolidation" sleep NOT rats';
    await searchProviders(providers, query, { limit: 5 });

    const [openalex, crossref] = planQueries(providers, query);
    expect(seenBoolean).toHaveBeenCalledWith(openalex?.text, expect.anything());
    expect(seenPlain).toHaveBeenCalledWith(crossref?.text, expect.anything());
    expect(openalex?.text).not.toBe(crossref?.text);
  });

  it("accepts a parsed query", async () => {
    const search = vi.fn(async () => [] as Result[]);
    await searchProviders([{ id: "openalex", name: "OpenAlex", syntax: "boolean", search }], parseQuery("alpha beta"), { limit: 5 });
    expect(search).toHaveBeenCalledWith("alpha AND beta", expect.anything());
  });

  it("asks no one when the query has nothing searchable in it", async () => {
    const search = vi.fn(async () => [] as Result[]);
    const providers = [{ id: "openalex" as const, name: "OpenAlex", syntax: "boolean" as const, search }];
    for (const query of ["", "   ", "the of and", "NOT rats"]) {
      expect(await searchProviders(providers, query, { limit: 5 })).toEqual({ results: [], statuses: [] });
    }
    expect(search).not.toHaveBeenCalled();
  });

  it("shares cached answers between spellings that render to the same text", async () => {
    const search = vi.fn(async () => [makeResult({ id: "10.1/a" })]);
    const providers = [{ id: "openalex" as const, name: "OpenAlex", syntax: "boolean" as const, search }];
    const cache = createSearchCache();
    await searchProviders(providers, "sleep   memory", { limit: 5, cache });
    await searchProviders(providers, "sleep AND memory", { limit: 5, cache });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("does not share cached answers between different queries", async () => {
    const search = vi.fn(async () => [] as Result[]);
    const providers = [{ id: "openalex" as const, name: "OpenAlex", syntax: "boolean" as const, search }];
    const cache = createSearchCache();
    await searchProviders(providers, "sleep OR memory", { limit: 5, cache });
    await searchProviders(providers, "sleep AND memory", { limit: 5, cache });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe("searchProviders: a failure of the browser itself", () => {
  const failing = (error: unknown): Provider => ({ id: "openalex", name: "OpenAlex", syntax: "boolean", search: async () => { throw error; } });

  it("marks a failed request (a fetch TypeError) as a network failure", async () => {
    const error = new ProviderError("failed", "Could not reach OpenAlex (network error or request blocked)", { cause: new TypeError("Failed to fetch") });
    const outcome = await searchProviders([failing(error)], "sleep", { limit: 5 });
    expect(outcome.statuses[0]).toEqual({ provider: "openalex", state: "failed", message: error.message, network: true });
  });

  it("does not mark an HTTP error, a rate limit, a cancelled search or an unexpected error", async () => {
    const cases = [
      new ProviderError("failed", "OpenAlex answered HTTP 500", { httpStatus: 500 }),
      new ProviderError("rate-limited", "OpenAlex rate limit (HTTP 429)", { httpStatus: 429, cause: new TypeError("x") }),
      new ProviderError("failed", "Search was cancelled", { cause: new DOMException("aborted", "AbortError") }),
      new Error("boom"),
    ];
    for (const error of cases) {
      const outcome = await searchProviders([failing(error)], "sleep", { limit: 5 });
      expect(outcome.statuses[0]).not.toHaveProperty("network");
    }
  });
});

describe("the fallback pass", () => {
  const found = () => [makeResult({ id: "10.1/a", hits: [{ provider: "openalex", id: "W1", rank: 1, listSize: 1, score: null }] })];
  const openalex = (search: Provider["search"] = async () => found()): Provider => ({ id: "openalex", name: "OpenAlex", syntax: "boolean", search });

  it("marks every hit of every result as found by a fallback pass, when it is one", async () => {
    const outcome = await searchProviders([openalex()], "chaos pendulum", { limit: 5, fallback: true });
    expect(outcome.results[0]?.hits).toEqual([{ provider: "openalex", id: "W1", rank: 1, listSize: 1, score: null, fallback: true }]);
  });

  it("does not mark the results of the strict pass", async () => {
    const outcome = await searchProviders([openalex()], "chaos pendulum", { limit: 5 });
    expect(outcome.results[0]?.hits[0]).not.toHaveProperty("fallback");
  });

  it("asks every provider the query it is given, which is how a pass without one concept is sent", async () => {
    const search = vi.fn(async (_query: string, _options: unknown) => [] as Result[]);
    await searchProviders([openalex(search)], parseConcepts("chaos pendulum motion"), { limit: 5 });
    await searchProviders([openalex(search)], parseConcepts("chaos pendulum"), { limit: 5, fallback: true });
    expect(search.mock.calls.map((call) => call[0])).toEqual(["(chaos OR chaotic) AND pendulum AND motion", "(chaos OR chaotic) AND pendulum"]);
  });
});

describe("fallbackOrder: which concept to drop first", () => {
  const query = parseConcepts("machine learning odor prediction");
  const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));

  it("drops the concept that matches the most works first: it narrows the search least", () => {
    expect(fallbackOrder(query, counts({ b1: 900_000, b2: 40_000, b3: 3_000_000 }))).toEqual(["b3", "b1", "b2"]);
  });

  it("keeps the order typed when counts are equal, and tries a concept with no count last", () => {
    expect(fallbackOrder(query, counts({ b1: 10, b2: 10, b3: 10 }))).toEqual(["b1", "b2", "b3"]);
    expect(fallbackOrder(query, counts({ b2: 5 }))).toEqual(["b2", "b1", "b3"]);
    expect(fallbackOrder(query, counts({}))).toEqual(["b1", "b2", "b3"]);
  });

  it("has nothing to drop in a search of one concept", () => {
    expect(fallbackOrder(parseConcepts("odor"), counts({ b1: 5 }))).toEqual([]);
  });

  it("does not change its input", () => {
    const given = counts({ b1: 1, b2: 2, b3: 3 });
    fallbackOrder(query, given);
    expect([...given]).toEqual([["b1", 1], ["b2", 2], ["b3", 3]]);
  });
});
