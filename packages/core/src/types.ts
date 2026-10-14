/**
 * Search providers. Unpaywall is not listed because it is not searched: it is
 * only used later to look up open-access PDFs for results we already have.
 */
export type ProviderId = "openalex" | "crossref" | "pubmed" | "europepmc" | "arxiv" | "wikipedia";

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  pubmed: "PubMed",
  europepmc: "Europe PMC",
  arxiv: "arXiv",
  wikipedia: "Wikipedia",
};

/**
 * A provider-independent description of what kind of document a result is.
 * Each provider maps its own vocabulary onto this one; the original value is
 * kept in `Result.rawType` so labels can always point back to it.
 */
export type WorkType =
  | "journal-article"
  | "review"
  | "preprint"
  | "conference-paper"
  | "book"
  | "book-chapter"
  | "reference-entry"
  | "thesis"
  | "report"
  | "dataset"
  /** Known, but not research evidence: editorial, letter, erratum, software, ... */
  | "other"
  /** The metadata did not say, or said something we do not recognise. */
  | "unknown";

/** What kind of place a result was published in. */
export type VenueKind = "journal" | "repository" | "conference" | "book" | "other" | "unknown";

export type OaStatus = "gold" | "diamond" | "hybrid" | "green" | "bronze" | "closed" | "unknown";

/** A value together with the provider and metadata field it was read from. */
export interface Sourced<T> {
  value: T;
  provider: ProviderId;
  /** Name of the field in the provider's response, e.g. "type". */
  field: string;
}

export interface Author {
  /** Display name as the provider gave it. */
  name: string;
  /** Present only when the provider gives structured names (e.g. Crossref). */
  family?: string;
  given?: string;
}

export interface OpenAccessInfo {
  /** null when the provider does not say. */
  isOpen: boolean | null;
  status: OaStatus;
  /** Best free-to-read location, if the provider names one. */
  url: string | null;
}

export interface RetractionInfo {
  /** null when no provider told us either way. */
  retracted: boolean | null;
  /** Where the answer came from, e.g. "OpenAlex is_retracted". */
  source: string | null;
}

/** One provider's report that it returned this result. */
export interface ProviderHit {
  provider: ProviderId;
  /** The provider's own identifier for the work. */
  id: string;
  /** 1-based position in that provider's result list (1 = most relevant). */
  rank: number;
  /** How many results that provider returned in total. */
  listSize: number;
  /** The provider's own relevance score, when it gives one. */
  score: number | null;
}

/** The single normalized record every provider produces. */
export interface Result {
  /** Stable identifier: the DOI when there is one, otherwise "<provider>:<id>". */
  id: string;
  /** Empty when the provider gave no title. */
  title: string;
  authors: Author[];
  year: number | null;
  venue: string | null;
  venueKind: Sourced<VenueKind> | null;
  /** Bare, lowercase DOI (no URL prefix), or null. */
  doi: string | null;
  url: string | null;
  abstract: string | null;
  type: WorkType;
  /** The provider's own type value that `type` was derived from. */
  rawType: Sourced<string> | null;
  citationCount: number | null;
  /** ISO 639-1 code as reported by the provider, e.g. "en". */
  language: string | null;
  /** Distinct ISO 3166-1 alpha-2 codes of the authors' affiliation countries. */
  authorCountries: string[];
  openAccess: OpenAccessInfo;
  retraction: RetractionInfo;
  /** Which providers returned this result, and at what rank. */
  hits: ProviderHit[];
}

export interface SearchOptions {
  /** Maximum number of results to return from one provider. */
  limit: number;
  signal?: AbortSignal;
}

export interface Provider {
  readonly id: ProviderId;
  readonly name: string;
  /**
   * Resolves with normalized results, best match first. Throws `ProviderError`
   * when the provider cannot answer; callers decide what to show.
   */
  search(query: string, options: SearchOptions): Promise<Result[]>;
}

export type ProviderFailureKind = "rate-limited" | "failed";

export class ProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly httpStatus: number | null;

  constructor(
    kind: ProviderFailureKind,
    message: string,
    details: { httpStatus?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "ProviderError";
    this.kind = kind;
    this.httpStatus = details.httpStatus ?? null;
  }
}

/** What the UI shows per provider after a search. */
export type ProviderStatus =
  | { provider: ProviderId; state: "ok"; count: number }
  | { provider: ProviderId; state: ProviderFailureKind; message: string };
