import { doiUrl } from "../doi";
import { asArray, asBoolean, asHttpUrl, asInteger, asRecord, asString } from "../json";
import { plainTextOrNull, stripMarkup } from "../text";
import {
  ProviderError,
  type Author,
  type OaStatus,
  type Provider,
  type Result,
  type SearchOptions,
  type VenueKind,
  type WorkType,
} from "../types";
import {
  authorFromParts,
  clampLimit,
  defaultFetch,
  doiOf,
  openAccess,
  requestText,
  sourced,
  type Fetch,
} from "./shared";

// Semantic Scholar Graph API, keyless shared pool only.
//
// Verified 2026-10-14 against the official OpenAPI spec
// (api.semanticscholar.org/graph/v1/swagger.json) and live requests:
// - GET /graph/v1/paper/search?query=...&limit=...&fields=... needs no key. Without one
//   you share a pool of requests with every other keyless user (documented as 1000
//   requests per second in total), and in practice this pool answered HTTP 429 to every
//   request made during this check. Such an answer carried no CORS header for a web
//   origin, so a browser cannot even read it: it sees a network error.
// - The result shape below follows the spec (PaperRelevanceSearchBatch -> BasePaper)
//   and was NOT recorded from a live success, because none could be obtained.
// - The AI-written `tldr` summary is deliberately never requested.
// - `limit` is at most 100 per request.

const SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const MAX_LIMIT = 100;
const FIELDS = [
  "title",
  "abstract",
  "year",
  "venue",
  "externalIds",
  "citationCount",
  "isOpenAccess",
  "openAccessPdf",
  "publicationTypes",
  "publicationVenue",
  "authors",
].join(",");

const OA_STATUSES: readonly OaStatus[] = ["gold", "diamond", "hybrid", "green", "bronze", "closed"];
const PREPRINT_SERVERS = /arxiv|biorxiv|medrxiv|ssrn|research square|preprints\.org|chemrxiv|psyarxiv|osf preprints/i;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

const TYPE_MAP: Record<string, WorkType> = {
  review: "review",
  metaanalysis: "review",
  journalarticle: "journal-article",
  casereport: "journal-article",
  clinicaltrial: "journal-article",
  study: "journal-article",
  conference: "conference-paper",
  book: "book",
  booksection: "book-chapter",
  dataset: "dataset",
  editorial: "other",
  lettersandcomments: "other",
  news: "other",
};

function resolveType(types: string[], venue: string | null): { type: WorkType; raw: string | null } {
  const mapped = types.map((raw) => ({ raw, key: normalize(raw) }));
  const review = mapped.find((entry) => TYPE_MAP[entry.key] === "review");
  if (review !== undefined) return { type: "review", raw: review.raw };
  const known = mapped.find((entry) => Object.hasOwn(TYPE_MAP, entry.key));
  if (known !== undefined) return { type: TYPE_MAP[known.key] ?? "unknown", raw: known.raw };
  if (types.length === 0 && venue !== null && PREPRINT_SERVERS.test(venue)) return { type: "preprint", raw: venue };
  return { type: "unknown", raw: types[0] ?? null };
}

export function parseSemanticScholarPaper(raw: unknown, rank: number, listSize: number): Result | null {
  const paper = asRecord(raw);
  const paperId = asString(paper?.paperId);
  if (paper === null || paperId === null) return null;

  const doi = doiOf(asRecord(paper.externalIds)?.DOI);
  const venue = asString(paper.venue) ?? asString(asRecord(paper.publicationVenue)?.name);
  const types = asArray(paper.publicationTypes)
    .map(asString)
    .filter((type): type is string => type !== null);
  const { type, raw: rawType } = resolveType(types, venue);

  const venueType = asString(asRecord(paper.publicationVenue)?.type)?.toLowerCase();
  const kind: VenueKind | null =
    venueType === "journal" ? "journal" : venueType === "conference" ? "conference" : type === "preprint" ? "repository" : null;

  const pdf = asRecord(paper.openAccessPdf);
  const pdfUrl = asHttpUrl(pdf?.url);
  const pdfStatus = asString(pdf?.status)?.toLowerCase();
  const isOpen = asBoolean(paper.isOpenAccess);

  const authors = asArray(paper.authors)
    .map(asRecord)
    .map((author) => authorFromParts(null, null, author?.name))
    .filter((author): author is Author => author !== null);

  return {
    id: doi ?? `semanticscholar:${paperId}`,
    title: stripMarkup(asString(paper.title)),
    authors,
    year: asInteger(paper.year),
    venue,
    venueKind: kind === null ? null : sourced(kind, "semanticscholar", venueType !== undefined ? "publicationVenue.type" : "venue"),
    // This source gives no volume, issue or pages.
    volume: null,
    issue: null,
    pages: null,
    doi,
    url: doi !== null ? doiUrl(doi) : `https://www.semanticscholar.org/paper/${paperId}`,
    abstract: plainTextOrNull(asString(paper.abstract)),
    type,
    rawType: rawType === null ? null : sourced(rawType, "semanticscholar", types.length > 0 ? "publicationTypes" : "venue"),
    citationCount: asInteger(paper.citationCount),
    language: null,
    authorCountries: [],
    openAccess: openAccess(isOpen ?? (pdfUrl !== null ? true : null), {
      status: OA_STATUSES.find((status) => status === pdfStatus) ?? "unknown",
      pdfUrl,
    }),
    retraction: { retracted: null, source: null },
    subjects: [],
    hits: [{ provider: "semanticscholar", id: paperId, rank, listSize, score: null }],
  };
}

export interface SemanticScholarOptions {
  fetch?: Fetch;
}

export function createSemanticScholarProvider(options: SemanticScholarOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;

  return {
    id: "semanticscholar",
    name: "Semantic Scholar",
    // Its relevance search takes plain text: no query syntax is supported (per its API docs).
    syntax: "plain",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const searchText = query.trim();
      if (searchText === "") return [];
      const url = new URL(SEARCH_URL);
      url.searchParams.set("query", searchText);
      url.searchParams.set("limit", String(clampLimit(limit, MAX_LIMIT)));
      url.searchParams.set("fields", FIELDS);

      let text: string;
      try {
        text = await requestText(doFetch, url, "Semantic Scholar", signal);
      } catch (error) {
        // The shared pool is usually busy, and its HTTP 429 answer carries no CORS header, so
        // a browser reports it as a network error. Say what is most likely going on.
        if (error instanceof ProviderError && error.kind === "failed" && error.httpStatus === null && error.message.startsWith("Could not reach")) {
          throw new ProviderError(
            "failed",
            "Semantic Scholar gave no readable answer. Its free shared pool is often busy and refuses requests (HTTP 429), and browsers cannot read that refusal",
            { cause: error },
          );
        }
        throw error;
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch (cause) {
        throw new ProviderError("failed", "Semantic Scholar sent a response that is not valid JSON", { cause });
      }
      const papers = asArray(asRecord(body)?.data);
      return papers
        .map((paper, index) => parseSemanticScholarPaper(paper, index + 1, papers.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
