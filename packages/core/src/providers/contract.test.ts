import { describe, expect, it, vi } from "vitest";
import { ProviderError, type Provider } from "../types";
import { createCrossrefProvider } from "./crossref";
import { createDataCiteProvider } from "./datacite";
import { createDoajProvider } from "./doaj";
import { createEuropePmcProvider } from "./europepmc";
import { createSemanticScholarProvider } from "./semanticscholar";
import { createWikipediaProvider } from "./wikipedia";
import { createZenodoProvider } from "./zenodo";
import type { Fetch } from "./shared";

// What every provider added after OpenAlex must do the same way: one plain GET, never more
// than its documented page size, send the query exactly as it was given (it arrives already
// written for that provider), and give a clear, key-free message for each way a request can fail.

interface Case {
  name: string;
  make: (fetch: Fetch) => Provider;
  host: string;
  /** The query parameter that carries the result count, or null if it is not a parameter. */
  limitParam: string;
  max: number;
  /** Reads the query back out of the request the provider made. */
  queryOf: (url: URL) => string | null;
}

const cases: Case[] = [
  { name: "Crossref", make: (fetch) => createCrossrefProvider({ fetch }), host: "api.crossref.org", limitParam: "rows", max: 100, queryOf: (url) => url.searchParams.get("query") },
  { name: "Europe PMC", make: (fetch) => createEuropePmcProvider({ fetch }), host: "www.ebi.ac.uk", limitParam: "pageSize", max: 100, queryOf: (url) => url.searchParams.get("query") },
  { name: "DOAJ", make: (fetch) => createDoajProvider({ fetch }), host: "doaj.org", limitParam: "pageSize", max: 100, queryOf: (url) => decodeURIComponent(url.pathname.replace("/api/search/articles/", "")) },
  { name: "DataCite", make: (fetch) => createDataCiteProvider({ fetch }), host: "api.datacite.org", limitParam: "page[size]", max: 100, queryOf: (url) => url.searchParams.get("query") },
  { name: "Zenodo", make: (fetch) => createZenodoProvider({ fetch }), host: "zenodo.org", limitParam: "size", max: 25, queryOf: (url) => url.searchParams.get("q") },
  { name: "Wikipedia", make: (fetch) => createWikipediaProvider({ fetch }), host: "en.wikipedia.org", limitParam: "gsrlimit", max: 20, queryOf: (url) => url.searchParams.get("gsrsearch") },
  { name: "Semantic Scholar", make: (fetch) => createSemanticScholarProvider({ fetch }), host: "api.semanticscholar.org", limitParam: "limit", max: 100, queryOf: (url) => url.searchParams.get("query") },
];

const emptyJson = () => Promise.resolve(Response.json({}));

describe.each(cases)("$name provider contract", ({ name, make, host, limitParam, max, queryOf }) => {
  it("makes one plain GET to its documented host, with no custom headers", async () => {
    const fetchMock = vi.fn<Fetch>(emptyJson);
    await make(fetchMock).search("sleep memory", { limit: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(input)).host).toBe(host);
    expect(init).toEqual({ signal: undefined });
  });

  it(`never asks for more than ${max} results, and never fewer than 1`, async () => {
    const limitOf = async (limit: number) => {
      const fetchMock = vi.fn<Fetch>(emptyJson);
      await make(fetchMock).search("sleep memory", { limit });
      return new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get(limitParam);
    };
    expect(await limitOf(10_000)).toBe(String(max));
    expect(await limitOf(0)).toBe("1");
    expect(await limitOf(7.9)).toBe(String(Math.min(7, max)));
  });

  it("passes the caller's cancellation signal on", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<Fetch>(emptyJson);
    await make(fetchMock).search("sleep", { limit: 5, signal: controller.signal });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it("reports HTTP 429 as rate-limited, with the retry hint when sent", async () => {
    const provider = make(() => Promise.resolve(new Response("{}", { status: 429, headers: { "Retry-After": "12" } })));
    const error = await provider.search("q", { limit: 5 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: "rate-limited", httpStatus: 429 });
    expect((error as Error).message).toContain(name);
    expect((error as Error).message).toContain("retry after 12 s");
  });

  it("reports other HTTP errors as failed", async () => {
    const provider = make(() => Promise.resolve(new Response("{}", { status: 503 })));
    await expect(provider.search("q", { limit: 5 })).rejects.toMatchObject({ kind: "failed", httpStatus: 503, message: `${name} answered HTTP 503` });
  });

  it("reports a network error as failed, naming the provider", async () => {
    const provider = make(() => Promise.reject(new TypeError("Failed to fetch https://example.org/?secret=1")));
    const error = (await provider.search("q", { limit: 5 }).catch((e: unknown) => e)) as ProviderError;
    expect(error.kind).toBe("failed");
    expect(error.message).toContain(name);
    expect(error.message).not.toContain("secret"); // the request address is never repeated
  });

  it("reports an aborted request as cancelled", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    await expect(make(() => Promise.reject(abort)).search("q", { limit: 5 })).rejects.toMatchObject({
      kind: "failed",
      message: "Search was cancelled",
    });
  });

  it("reports a body that is not JSON as failed", async () => {
    const provider = make(() => Promise.resolve(new Response("<html>nope</html>")));
    await expect(provider.search("q", { limit: 5 })).rejects.toMatchObject({ kind: "failed" });
  });

  it("returns no results, rather than failing, for an empty answer", async () => {
    expect(await make(emptyJson).search("sleep", { limit: 5 })).toEqual([]);
  });

  it("sends no request at all for a blank query", async () => {
    const fetchMock = vi.fn<Fetch>(emptyJson);
    expect(await make(fetchMock).search("   ", { limit: 5 })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the query exactly as it is given, without rewriting it", async () => {
    const given = 'sleep AND "memory consolidation" NOT rats';
    const fetchMock = vi.fn<Fetch>(emptyJson);
    await make(fetchMock).search(`  ${given}  `, { limit: 5 });
    expect(queryOf(new URL(String(fetchMock.mock.calls[0]?.[0])))).toBe(given);
  });
});
