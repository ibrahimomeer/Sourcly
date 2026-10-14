import { doiUrl } from "../doi";
import { asArray, asHttpUrl, asRecord, asString } from "../json";
import { plainTextOrNull, stripMarkup, toLanguageCode } from "../text";
import type { Author, Provider, Result, SearchOptions, WorkType } from "../types";
import {
  authorFromName,
  clampLimit,
  defaultFetch,
  doiOf,
  openAccess,
  parseYear,
  requestJson,
  sourced,
  subjectsFrom,
  type Fetch,
} from "./shared";

// Verified 2026-10-14 against zenodo.org/api and the Zenodo REST docs:
// - GET /api/records?q=...&size=N returns JSON without a token and sends
//   `access-control-allow-origin: *`.
// - Anonymous requests may ask for at most 25 results per page (size=100 is refused
//   with HTTP 400), and search endpoints are limited to 30 requests per minute.
// - q is an Elasticsearch query string whose default operator is OR (72,788 hits for two
//   words, 1,171 with an explicit AND). The query arrives already written for this source
//   (see query.ts) with every AND spelled out.
// - Zenodo holds anything a researcher uploads: papers, datasets, software, slides.

const RECORDS_URL = "https://zenodo.org/api/records";
const MAX_SIZE = 25;

const PUBLICATION_SUBTYPES: Record<string, WorkType> = {
  article: "journal-article",
  preprint: "preprint",
  thesis: "thesis",
  report: "report",
  workingpaper: "report",
  technicalnote: "report",
  book: "book",
  section: "book-chapter",
  conferencepaper: "conference-paper",
};

function mapType(type: string | null, subtype: string | null): WorkType {
  if (type === "dataset") return "dataset";
  if (type === "publication") {
    return subtype !== null && Object.hasOwn(PUBLICATION_SUBTYPES, subtype)
      ? (PUBLICATION_SUBTYPES[subtype] ?? "other")
      : subtype === null
        ? "unknown"
        : "other";
  }
  return type === null ? "unknown" : "other";
}

export function parseZenodoRecord(raw: unknown, rank: number, listSize: number): Result | null {
  const hit = asRecord(raw);
  const metadata = asRecord(hit?.metadata);
  const rawId = hit?.id;
  const id = typeof rawId === "number" || typeof rawId === "string" ? String(rawId) : null;
  if (hit === null || metadata === null || id === null) return null;

  const doi = doiOf(hit.doi ?? metadata.doi);
  const resource = asRecord(metadata.resource_type);
  const type = asString(resource?.type);
  const subtype = asString(resource?.subtype);
  const access = asString(metadata.access_right)?.toLowerCase() ?? null;
  const recordPage = asHttpUrl(asRecord(hit.links)?.self_html);

  const authors = asArray(metadata.creators)
    .map(asRecord)
    .map((creator) => authorFromName(asString(creator?.name) ?? ""))
    .filter((author): author is Author => author !== null);

  return {
    id: doi ?? `zenodo:${id}`,
    title: stripMarkup(asString(hit.title) ?? asString(metadata.title)),
    authors,
    year: parseYear(metadata.publication_date),
    venue: "Zenodo",
    venueKind: sourced("repository", "zenodo", "(Zenodo is a repository)"),
    doi,
    url: recordPage ?? (doi !== null ? doiUrl(doi) : null),
    abstract: plainTextOrNull(asString(metadata.description)),
    type: mapType(type, subtype),
    rawType: type === null ? null : sourced(subtype === null ? type : `${type}/${subtype}`, "zenodo", "metadata.resource_type"),
    citationCount: null,
    language: toLanguageCode(asString(metadata.language)),
    authorCountries: [],
    openAccess: openAccess(
      access === "open" ? true : access === "closed" || access === "restricted" || access === "embargoed" ? false : null,
      { url: access === "open" ? recordPage : null },
    ),
    retraction: { retracted: null, source: null },
    subjects: subjectsFrom("zenodo", "keyword", asArray(metadata.keywords)),
    hits: [{ provider: "zenodo", id, rank, listSize, score: null }],
  };
}

export interface ZenodoOptions {
  fetch?: Fetch;
}

export function createZenodoProvider(options: ZenodoOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;

  return {
    id: "zenodo",
    name: "Zenodo",
    syntax: "boolean",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const text = query.trim();
      if (text === "") return [];
      const url = new URL(RECORDS_URL);
      url.searchParams.set("q", text);
      url.searchParams.set("size", String(clampLimit(limit, MAX_SIZE)));

      const body = asRecord(await requestJson(doFetch, url, "Zenodo", signal));
      const hits = asArray(asRecord(body?.hits)?.hits);
      return hits
        .map((hit, index) => parseZenodoRecord(hit, index + 1, hits.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
