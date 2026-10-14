import { asArray, asHttpUrl, asInteger, asNumber, asRecord, asString } from "../json";
import { plainTextOrNull, stripMarkup } from "../text";
import type { Author, Provider, Result, SearchOptions, VenueKind, WorkType } from "../types";
import {
  authorFromParts,
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
import { doiUrl } from "../doi";

// Verified 2026-10-14 against api.crossref.org and the Crossref REST API docs:
// - GET /works?query=...&rows=...&select=... returns JSON, sends
//   `access-control-allow-origin: *`, and needs no key. The public pool allows a
//   small number of requests per second with one at a time (`x-rate-limit-*`
//   headers); adding `mailto=<address>` moves a request to the faster polite pool.
// - `rows` may be up to 1000; 100 keeps the response small.
// - `select` accepts only the names Crossref lists for this route. `subtype` and
//   `language` are NOT selectable, so posted-content cannot be told apart by
//   subtype and results carry no language.

const WORKS_URL = "https://api.crossref.org/works";
const MAX_ROWS = 100;
const SELECT = [
  "DOI",
  "title",
  "author",
  "issued",
  "container-title",
  "type",
  "is-referenced-by-count",
  "abstract",
  "URL",
  "subject",
  "update-to",
  "updated-by",
  "score",
  "publisher",
  "group-title",
].join(",");

const WORK_TYPES: Record<string, WorkType> = {
  "journal-article": "journal-article",
  "posted-content": "preprint",
  "proceedings-article": "conference-paper",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "book-set": "book",
  "book-series": "book",
  "book-chapter": "book-chapter",
  "book-section": "book-chapter",
  "book-part": "book-chapter",
  "reference-entry": "reference-entry",
  dissertation: "thesis",
  report: "report",
  "report-series": "report",
  dataset: "dataset",
  database: "dataset",
  "peer-review": "other",
  component: "other",
  grant: "other",
  standard: "other",
  "standard-series": "other",
  "journal-issue": "other",
  "journal-volume": "other",
  journal: "other",
  proceedings: "other",
  "proceedings-series": "other",
  "book-track": "other",
  // Crossref's own catch-all: we cannot tell what it is.
  other: "unknown",
};

const VENUE_KINDS: Record<string, VenueKind> = {
  "journal-article": "journal",
  "proceedings-article": "conference",
  "posted-content": "repository",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "reference-entry": "book",
  "book-chapter": "book",
  "book-section": "book",
  "book-part": "book",
};

function lookup<T>(table: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Update records of these types mean the work was withdrawn. */
const WITHDRAWAL_TYPES = new Set(["retraction", "withdrawal"]);

function updateTypes(value: unknown): { type: string; source: string | null }[] {
  return asArray(value)
    .map(asRecord)
    .map((update) => ({ type: asString(update?.type)?.toLowerCase() ?? "", source: asString(update?.source) }))
    .filter((update) => update.type !== "");
}

function updateTargets(value: unknown): { type: string; doi: string | null }[] {
  return asArray(value)
    .map(asRecord)
    .map((update) => ({ type: asString(update?.type)?.toLowerCase() ?? "", doi: doiOf(update?.DOI) }))
    .filter((update) => update.type !== "");
}

export function parseCrossrefWork(raw: unknown, rank: number, listSize: number): Result | null {
  const work = asRecord(raw);
  const doi = doiOf(work?.DOI);
  if (work === null || doi === null) return null;

  const typeValue = asString(work.type);
  const venue = asString(asArray(work["container-title"])[0]) ?? null;
  const publisher = asString(work.publisher);
  const kind = lookup(VENUE_KINDS, typeValue);

  // A notice that retracts another work carries an `update-to` entry of that kind pointing at the
  // other work. Some publishers also put one pointing at the retracted article itself (checked
  // 2026-10-14 on "RETRACTED ARTICLE: ..." records), and that article is research, not a notice.
  const isNotice = updateTargets(work["update-to"]).some(
    (update) => WITHDRAWAL_TYPES.has(update.type) && update.doi !== null && update.doi !== doi,
  );
  const withdrawal = updateTypes(work["updated-by"]).find((update) => WITHDRAWAL_TYPES.has(update.type));

  const authors = asArray(work.author)
    .map(asRecord)
    .map((author) => authorFromParts(author?.family, author?.given, author?.name))
    .filter((author): author is Author => author !== null);

  const dateParts = asArray(asArray(asRecord(work.issued)?.["date-parts"])[0]);

  return {
    id: doi,
    title: stripMarkup(asString(asArray(work.title)[0])),
    authors,
    year: parseYear(dateParts[0]),
    venue: stripMarkup(venue ?? (typeValue === "journal-article" ? null : publisher)) || null,
    venueKind: kind === undefined ? null : sourced(kind, "crossref", "type"),
    doi,
    url: asHttpUrl(work.URL) ?? doiUrl(doi),
    abstract: plainTextOrNull(asString(work.abstract)),
    type: isNotice ? "other" : (lookup(WORK_TYPES, typeValue) ?? "unknown"),
    rawType:
      typeValue === null
        ? null
        : sourced(isNotice ? `${typeValue} (retraction notice)` : typeValue, "crossref", isNotice ? "update-to" : "type"),
    citationCount: asInteger(work["is-referenced-by-count"]),
    language: null,
    authorCountries: [],
    openAccess: openAccess(null),
    retraction:
      withdrawal === undefined
        ? // Crossref only lists withdrawals it knows of, so no entry proves nothing.
          { retracted: null, source: null }
        : {
            retracted: true,
            source: `Crossref updated-by: ${withdrawal.type}${withdrawal.source !== null ? ` (${withdrawal.source})` : ""}`,
          },
    subjects: subjectsFrom("crossref", "subject", asArray(work.subject)),
    hits: [{ provider: "crossref", id: doi, rank, listSize, score: asNumber(work.score) }],
  };
}

export interface CrossrefOptions {
  fetch?: Fetch;
  /**
   * A contact address, sent as `mailto` so Crossref can put the request in its
   * faster "polite" pool. Optional; without it the public pool is used.
   */
  mailto?: string;
}

export function createCrossrefProvider(options: CrossrefOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;
  const mailto = options.mailto?.trim() ?? "";

  return {
    id: "crossref",
    name: "Crossref",
    // Crossref's `query` is free text: it ignores AND, OR, NOT and quotes (checked 2026-10-14).
    syntax: "plain",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const text = query.trim();
      if (text === "") return [];
      const url = new URL(WORKS_URL);
      url.searchParams.set("query", text);
      url.searchParams.set("rows", String(clampLimit(limit, MAX_ROWS)));
      url.searchParams.set("select", SELECT);
      if (mailto !== "") url.searchParams.set("mailto", mailto);

      const body = asRecord(await requestJson(doFetch, url, "Crossref", signal));
      const items = asArray(asRecord(body?.message)?.items);
      return items
        .map((item, index) => parseCrossrefWork(item, index + 1, items.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
