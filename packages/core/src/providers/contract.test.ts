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
// than its documented page size, and a clear, key-free message for each way a request can fail.

interface Case {
  name: string;
  make: (fetch: Fetch) => Provider;
  host: string;
  /** The query parameter that carries the result count, or null if it is not a parameter. */
  limitParam: string;
  max: number;
  /** Providers that read the query as a search language get plain words only. */
  plain: boolean;
}

const cases: Case[] = [
  { name: "Crossref", make: (fetch) => createCrossrefProvider({ fetch }), host: "api.crossref.org", limitParam: "rows", max: 100, plain: false },
  { name: "Europe PMC", make: (fetch) => createEuropePmcProvider({ fetch }), host: "www.ebi.ac.uk", limitParam: "pageSize", max: 100, plain: false },
  { name: "DOAJ", make: (fetch) => createDoajProvider({ fetch }), host: "doaj.org", limitParam: "pageSize", max: 100, plain: true },
  { name: "DataCite", make: (fetch) => createDataCiteProvider({ fetch }), host: "api.datacite.org", limitParam: "page[size]", max: 100, plain: true },
  { name: "Zenodo", make: (fetch) => createZenodoProvider({ fetch }), host: "zenodo.org", limitParam: "size", max: 25, plain: true },
  { name: "Wikipedia", make: (fetch) => createWikipediaProvider({ fetch }), host: "en.wikipedia.org", limitParam: "gsrlimit", max: 20, plain: true },
  { name: "Semantic Scholar", make: (fetch) => createSemanticScholarProvider({ fetch }), host: "api.semanticscholar.org", limitParam: "limit", max: 100, plain: true },
];

const emptyJson = () => Promise.resolve(Response.json({}));

describe.each(cases)("$name provider contract", ({ name, make, host, limitParam, max, plain }) => {
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

  if (plain) {
    it("sends no request at all for a query with no words in it", async () => {
      const fetchMock = vi.fn<Fetch>(emptyJson);
      expect(await make(fetchMock).search('  "(:)"  ', { limit: 5 })).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reduces the query to plain words before sending it", async () => {
      const fetchMock = vi.fn<Fetch>(emptyJson);
      await make(fetchMock).search('sleep AND (memory): "x"', { limit: 5 });
      const url = decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]));
      expect(url).toContain("sleep AND memory x".replace(/ /g, url.includes("+") ? "+" : " "));
    });
  }
});
