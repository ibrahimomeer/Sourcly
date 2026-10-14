import { asArray, asHttpUrl, asInteger, asRecord, asString } from "../json";
import { plainTextOrNull } from "../text";
import type { Provider, Result, SearchOptions } from "../types";
import { clampLimit, defaultFetch, openAccess, requestJson, sourced, type Fetch } from "./shared";

// Verified 2026-10-14 against en.wikipedia.org/w/api.php and the MediaWiki docs:
// - A search with `generator=search` plus `prop=extracts` returns page text in one
//   request. A browser may read the answer only when the request includes
//   `origin=*` (MediaWiki's documented way to allow anonymous cross-origin calls).
// - `extracts` returns at most 20 extracts per request (exlimit), and only when
//   `exintro` is set, so 20 is the cap here: the search itself would return up to 50
//   pages but the others would have no text.
// - Wikipedia is included as an example of a tertiary source, and is labelled as one.

const API_URL = "https://en.wikipedia.org/w/api.php";
const MAX_PAGES = 20;

export function parseWikipediaPage(raw: unknown, rank: number, listSize: number): Result | null {
  const page = asRecord(raw);
  const pageId = asInteger(page?.pageid);
  const title = asString(page?.title);
  if (page === null || pageId === null || title === null) return null;

  const url = asHttpUrl(page.fullurl) ?? `https://en.wikipedia.org/?curid=${pageId}`;

  return {
    id: `wikipedia:${pageId}`,
    title,
    authors: [],
    year: null,
    venue: "Wikipedia",
    venueKind: sourced("other", "wikipedia", "(Wikipedia is an encyclopedia)"),
    doi: null,
    url,
    abstract: plainTextOrNull(asString(page.extract)),
    type: "reference-entry",
    rawType: sourced("encyclopedia article", "wikipedia", "query.pages"),
    citationCount: null,
    language: "en",
    authorCountries: [],
    openAccess: openAccess(true, { url }),
    retraction: { retracted: null, source: null },
    subjects: [],
    hits: [{ provider: "wikipedia", id: String(pageId), rank, listSize, score: null }],
  };
}

export interface WikipediaOptions {
  fetch?: Fetch;
}

export function createWikipediaProvider(options: WikipediaOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;

  return {
    id: "wikipedia",
    name: "Wikipedia",
    syntax: "boolean",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const text = query.trim();
      if (text === "") return [];
      const count = String(clampLimit(limit, MAX_PAGES));

      const url = new URL(API_URL);
      url.searchParams.set("action", "query");
      url.searchParams.set("generator", "search");
      url.searchParams.set("gsrsearch", text);
      url.searchParams.set("gsrlimit", count);
      url.searchParams.set("prop", "extracts|info");
      url.searchParams.set("inprop", "url");
      url.searchParams.set("exintro", "1");
      url.searchParams.set("explaintext", "1");
      url.searchParams.set("exlimit", count);
      url.searchParams.set("format", "json");
      url.searchParams.set("formatversion", "2");
      url.searchParams.set("origin", "*");

      const body = asRecord(await requestJson(doFetch, url, "Wikipedia", signal));
      // The generator returns pages in no particular order; `index` is the search rank.
      const pages = asArray(asRecord(body?.query)?.pages)
        .map(asRecord)
        .filter((page): page is Record<string, unknown> => page !== null)
        .sort((a, b) => (asInteger(a.index) ?? Number.MAX_SAFE_INTEGER) - (asInteger(b.index) ?? Number.MAX_SAFE_INTEGER));
      return pages
        .map((page, index) => parseWikipediaPage(page, index + 1, pages.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
