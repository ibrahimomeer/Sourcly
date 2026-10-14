import { doiUrl, normalizeDoi } from "../doi";
import { asArray, asBoolean, asInteger, asNumber, asRecord, asString } from "../json";
import {
  ProviderError,
  type OaStatus,
  type Provider,
  type Result,
  type SearchOptions,
  type VenueKind,
  type WorkType,
} from "../types";

// Verified against https://help.openalex.org (Work attributes, Work types) and
// live responses from api.openalex.org on 2026-10-14:
// - GET /works?search=... needs no key and sends `access-control-allow-origin: *`,
//   so it works from any browser origin, including file://.
// - `select` limits fields (root-level only) and `per_page` is capped at 100.
// - Without an API key the daily budget is small (about 100 searches), and the
//   API answers HTTP 429 when it is used up. A free personal key (created at
//   openalex.org/settings/api) raises it; it is sent as the documented `api_key`
//   query parameter, which keeps the request a plain GET with no preflight.
// - An invalid key makes the whole request fail with HTTP 401 ("API key not
//   found"); OpenAlex does not fall back to keyless use.
// - The documented polite-pool `mailto` parameter is not mentioned in the
//   current docs and had no effect on rate-limit headers, so it is not sent.

const WORKS_URL = "https://api.openalex.org/works";
const MAX_PER_PAGE = 100;
/** Guards against a corrupt abstract_inverted_index asking for a huge array. */
const MAX_ABSTRACT_WORDS = 20_000;

const SELECT_FIELDS = [
  "id",
  "doi",
  "title",
  "relevance_score",
  "publication_year",
  "language",
  "type",
  "open_access",
  "cited_by_count",
  "is_retracted",
  "authorships",
  "primary_location",
  "abstract_inverted_index",
];

/** OpenAlex's 25 work types mapped onto ours. Anything missing here becomes "unknown". */
const WORK_TYPES: Record<string, WorkType> = {
  article: "journal-article",
  "data-paper": "journal-article",
  "software-paper": "journal-article",
  review: "review",
  preprint: "preprint",
  "conference-paper": "conference-paper",
  book: "book",
  "book-chapter": "book-chapter",
  "reference-entry": "reference-entry",
  dissertation: "thesis",
  report: "report",
  dataset: "dataset",
  editorial: "other",
  letter: "other",
  erratum: "other",
  retraction: "other",
  "peer-review": "other",
  paratext: "other",
  libguides: "other",
  standard: "other",
  "supplementary-materials": "other",
  software: "other",
  "book-review": "other",
  "conference-abstract": "other",
  // OpenAlex's own catch-all (news items, obituaries, whole issues...). We cannot tell
  // what it is, so it is "unknown" rather than "other".
  other: "unknown",
};

/** OpenAlex source types mapped onto ours. */
const VENUE_KINDS: Record<string, VenueKind> = {
  journal: "journal",
  repository: "repository",
  conference: "conference",
  "ebook platform": "book",
  "book series": "book",
  other: "other",
  metadata: "other",
};

const OA_STATUSES: readonly OaStatus[] = ["gold", "diamond", "hybrid", "green", "bronze", "closed"];

/** Own-property lookup, so a provider value like "constructor" cannot match Object.prototype. */
function lookup<T>(table: Record<string, T>, key: string | null): T | undefined {
  return key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
}

export function mapOpenAlexType(value: string | null): WorkType {
  return lookup(WORK_TYPES, value) ?? "unknown";
}

/**
 * OpenAlex returns abstracts as an inverted index (word -> positions) rather
 * than text. Returns null when there is no usable index.
 */
export function reconstructAbstract(invertedIndex: unknown): string | null {
  const index = asRecord(invertedIndex);
  if (index === null) return null;

  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of asArray(positions)) {
      const slot = asInteger(position);
      if (slot !== null && slot >= 0 && slot < MAX_ABSTRACT_WORDS) words[slot] = word;
    }
  }
  // filter() skips holes, so gaps in the positions do not produce double spaces.
  const text = words.filter(() => true).join(" ");
  return text === "" ? null : text;
}

/**
 * Turns one entry of the `results` array into a Result. Returns null only when
 * the entry is not an object or has no OpenAlex id (so it cannot be identified).
 */
export function parseOpenAlexWork(raw: unknown, rank: number, listSize: number): Result | null {
  const work = asRecord(raw);
  const openAlexUrl = asString(work?.id);
  if (work === null || openAlexUrl === null) return null;

  const openAlexId = openAlexUrl.replace(/^https?:\/\/openalex\.org\//, "");
  const doi = normalizeDoi(asString(work.doi));

  const location = asRecord(work.primary_location);
  const source = asRecord(location?.source);
  const sourceType = asString(source?.type);
  const typeValue = asString(work.type);

  const openAccess = asRecord(work.open_access);
  const oaStatus = asString(openAccess?.oa_status);
  const isRetracted = asBoolean(work.is_retracted);

  const authorships = asArray(work.authorships).map(asRecord);
  const authorNames = authorships
    .map((authorship) => asString(asRecord(authorship?.author)?.display_name))
    .filter((name): name is string => name !== null);
  const countries = authorships.flatMap((authorship) => asArray(authorship?.countries));

  return {
    id: doi ?? `openalex:${openAlexId}`,
    title: asString(work.title) ?? "",
    authors: authorNames.map((name) => ({ name })),
    year: asInteger(work.publication_year),
    venue: asString(source?.display_name),
    venueKind:
      sourceType === null
        ? null
        : {
            value: lookup(VENUE_KINDS, sourceType) ?? "unknown",
            provider: "openalex",
            field: "primary_location.source.type",
          },
    doi,
    url: asString(location?.landing_page_url) ?? (doi !== null ? doiUrl(doi) : openAlexUrl),
    abstract: reconstructAbstract(work.abstract_inverted_index),
    type: mapOpenAlexType(typeValue),
    rawType: typeValue === null ? null : { value: typeValue, provider: "openalex", field: "type" },
    citationCount: asInteger(work.cited_by_count),
    language: asString(work.language)?.toLowerCase() ?? null,
    authorCountries: [
      ...new Set(
        countries
          .map(asString)
          .filter((code): code is string => code !== null)
          .map((code) => code.toUpperCase()),
      ),
    ].sort(),
    openAccess: {
      isOpen: asBoolean(openAccess?.is_oa),
      status: OA_STATUSES.find((status) => status === oaStatus) ?? "unknown",
      url: asString(openAccess?.oa_url),
    },
    retraction: {
      retracted: isRetracted,
      source: isRetracted === null ? null : "OpenAlex is_retracted (Retraction Watch)",
    },
    hits: [
      {
        provider: "openalex",
        id: openAlexId,
        rank,
        listSize,
        score: asNumber(work.relevance_score),
      },
    ],
  };
}

export interface OpenAlexOptions {
  /** Replaceable for tests. Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /**
   * The user's own OpenAlex API key, if they have one. Optional: without it
   * OpenAlex still answers, within a smaller daily budget. The key is sent only
   * to api.openalex.org and never appears in a ProviderError message.
   */
  apiKey?: string;
}

export function createOpenAlexProvider(options: OpenAlexOptions = {}): Provider {
  const doFetch: typeof globalThis.fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const apiKey = options.apiKey?.trim() ?? "";

  return {
    id: "openalex",
    name: "OpenAlex",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const url = new URL(WORKS_URL);
      url.searchParams.set("search", query);
      url.searchParams.set("per_page", String(Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(limit)))));
      url.searchParams.set("select", SELECT_FIELDS.join(","));
      if (apiKey !== "") url.searchParams.set("api_key", apiKey);

      let response: Response;
      try {
        // No custom headers: a plain GET avoids a CORS preflight request.
        response = await doFetch(url, { signal });
      } catch (cause) {
        throw new ProviderError("failed", describeNetworkFailure(cause), { cause });
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        throw new ProviderError(
          "rate-limited",
          "OpenAlex rate limit or daily budget reached (HTTP 429)" +
            (retryAfter !== null ? `; retry after ${retryAfter} s` : ""),
          { httpStatus: 429 },
        );
      }
      if (apiKey !== "" && (response.status === 401 || response.status === 403)) {
        throw new ProviderError(
          "failed",
          `OpenAlex rejected the API key (HTTP ${response.status}). Check the key, or remove it to search without one`,
          { httpStatus: response.status },
        );
      }
      if (!response.ok) {
        throw new ProviderError("failed", `OpenAlex answered HTTP ${response.status}`, {
          httpStatus: response.status,
        });
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new ProviderError("failed", "OpenAlex sent a response that is not valid JSON", { cause });
      }
      const works = asRecord(body)?.results;
      if (!Array.isArray(works)) {
        throw new ProviderError("failed", "OpenAlex response has no results list");
      }

      return works
        .map((work, index) => parseOpenAlexWork(work, index + 1, works.length))
        .filter((result): result is Result => result !== null);
    },
  };
}

function describeNetworkFailure(cause: unknown): string {
  if (cause instanceof Error && cause.name === "AbortError") return "Search was cancelled";
  return "Could not reach OpenAlex (network error or request blocked)";
}
