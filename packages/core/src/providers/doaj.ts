import { doiUrl } from "../doi";
import { asArray, asHttpUrl, asRecord, asString } from "../json";
import { plainTextOrNull, stripMarkup, toLanguageCode, toPlainQuery } from "../text";
import type { Author, Provider, Result, SearchOptions } from "../types";
import {
  authorFromParts,
  clampLimit,
  defaultFetch,
  doiOf,
  openAccess,
  parseYear,
  requestJson,
  sourced,
  type Fetch,
} from "./shared";

// Verified 2026-10-14 against doaj.org:
// - GET /api/search/articles/<query>?pageSize=N returns JSON, needs no key and sends
//   `access-control-allow-origin: *`. DOAJ documents a limit of two requests per
//   second on all API routes.
// - pageSize is capped at 100 (a request for 200 returned 100).
// - The query is read as an Elasticsearch query string, so it is reduced to plain
//   words first (see toPlainQuery).
// - DOAJ lists only open-access journals, so every result is open access.

const SEARCH_URL = "https://doaj.org/api/search/articles/";
const MAX_PAGE_SIZE = 100;

export function parseDoajArticle(raw: unknown, rank: number, listSize: number): Result | null {
  const hit = asRecord(raw);
  const id = asString(hit?.id);
  const bibjson = asRecord(hit?.bibjson);
  if (hit === null || id === null || bibjson === null) return null;

  const identifiers = asArray(bibjson.identifier).map(asRecord);
  const doi = doiOf(identifiers.find((entry) => asString(entry?.type)?.toLowerCase() === "doi")?.id);

  const links = asArray(bibjson.link).map(asRecord);
  const fulltext = links.find((link) => asString(link?.type)?.toLowerCase() === "fulltext");
  const fulltextUrl = asHttpUrl(fulltext?.url);
  const pdfLink = links.find((link) => /pdf/i.test(asString(link?.content_type) ?? ""));

  const journal = asRecord(bibjson.journal);
  const authors = asArray(bibjson.author)
    .map(asRecord)
    .map((author) => authorFromParts(null, null, author?.name))
    .filter((author): author is Author => author !== null);

  return {
    id: doi ?? `doaj:${id}`,
    title: stripMarkup(asString(bibjson.title)),
    authors,
    year: parseYear(bibjson.year),
    venue: asString(journal?.title),
    venueKind: asString(journal?.title) === null ? null : sourced("journal", "doaj", "bibjson.journal"),
    doi,
    url: fulltextUrl ?? (doi !== null ? doiUrl(doi) : null),
    abstract: plainTextOrNull(asString(bibjson.abstract)),
    type: "journal-article",
    rawType: sourced("article", "doaj", "search/articles"),
    citationCount: null,
    language: toLanguageCode(asString(asArray(journal?.language)[0])),
    authorCountries: [],
    openAccess: openAccess(true, {
      status: "gold",
      url: fulltextUrl,
      pdfUrl: asHttpUrl(pdfLink?.url),
    }),
    retraction: { retracted: null, source: null },
    hits: [{ provider: "doaj", id, rank, listSize, score: null }],
  };
}

export interface DoajOptions {
  fetch?: Fetch;
}

export function createDoajProvider(options: DoajOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;

  return {
    id: "doaj",
    name: "DOAJ",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const plain = toPlainQuery(query);
      if (plain === "") return [];
      const url = new URL(`${SEARCH_URL}${encodeURIComponent(plain)}`);
      url.searchParams.set("pageSize", String(clampLimit(limit, MAX_PAGE_SIZE)));

      const body = asRecord(await requestJson(doFetch, url, "DOAJ", signal));
      const hits = asArray(body?.results);
      return hits
        .map((hit, index) => parseDoajArticle(hit, index + 1, hits.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
