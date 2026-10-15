/**
 * Search providers. Unpaywall is not listed because it is not searched: it is
 * only used later to look up open-access PDFs for results we already have.
 */
export type ProviderId =
  | "openalex"
  | "crossref"
  | "pubmed"
  | "europepmc"
  | "doaj"
  | "datacite"
  | "zenodo"
  | "wikipedia"
  | "semanticscholar"
  | "arxiv";

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  openalex: "OpenAlex",
  crossref: "Crossref",
  pubmed: "PubMed",
  europepmc: "Europe PMC",
  doaj: "DOAJ",
  datacite: "DataCite",
  zenodo: "Zenodo",
  wikipedia: "Wikipedia",
  semanticscholar: "Semantic Scholar",
  arxiv: "arXiv",
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
  /**
   * A direct link to a free PDF, if a provider names one. Only ever set from a
   * location the provider says is open access, never from a paywalled copy.
   */
  pdfUrl: string | null;
}

export interface RetractionInfo {
  /** null when no provider told us either way. */
  retracted: boolean | null;
  /** Where the answer came from, e.g. "OpenAlex is_retracted". */
  source: string | null;
}

/**
 * What kind of descriptive term a source attached to a work:
 * - "topic": a topic from OpenAlex's classifier;
 * - "keyword": a keyword given by authors or the source;
 * - "mesh": a MeSH (Medical Subject Headings) heading, the controlled vocabulary used by PubMed;
 * - "subject": a broad subject or category (a journal's subject area, a classification).
 */
export type SubjectKind = "topic" | "keyword" | "mesh" | "subject";

/** One descriptive term for a work, and where it came from. */
export interface Subject {
  term: string;
  kind: SubjectKind;
  provider: ProviderId;
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
  /** True when the work was returned by the second, expanded pass of a search and not by the strict first one. */
  expanded?: true;
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
  /**
   * Where in the venue the work is, as the source wrote it, for citations. Null when the source
   * gives none. `pages` is a range ("1272-1278"), a single page, or an article number ("e0173456").
   */
  volume: string | null;
  issue: string | null;
  pages: string | null;
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
  /**
   * Descriptive terms (topics, keywords, MeSH headings) the sources gave the work. They
   * are matched against the query for relevance and mined for "related terms".
   */
  subjects: Subject[];
  /** Which providers returned this result, and at what rank. */
  hits: ProviderHit[];
}

/**
 * How a provider reads a query.
 * - "boolean": AND, OR, NOT, quoted phrases and parentheses.
 * - "boolean-flat": the same, except that a group of alternatives inside a larger search is
 *   ignored by the source, so it is left out and the notes say so (Wikipedia).
 * - "pubmed": boolean, with every word and phrase searched in PubMed's text-word field, which
 *   turns off PubMed's own guessing at synonyms and word forms.
 * - "europepmc": boolean, with every word and phrase searched in the title and abstract only.
 * - "plain": only a list of words.
 * - "plain-spaced": a list of words in which a hyphen is read as a space, because the source
 *   finds nothing for a hyphenated word (Semantic Scholar).
 */
export type QuerySyntax = "boolean" | "boolean-flat" | "pubmed" | "europepmc" | "plain" | "plain-spaced";

export interface SearchOptions {
  /** Maximum number of results to return from one provider. */
  limit: number;
  signal?: AbortSignal;
  /** The expanded pass: ask in the provider's looser way (see `Provider.expandedSyntax`). */
  expanded?: boolean;
}

export interface Provider {
  readonly id: ProviderId;
  readonly name: string;
  /** How this provider reads the query it is given. */
  readonly syntax: QuerySyntax;
  /**
   * What the provider's request does beyond the query text, in plain language (which text it
   * looks in, how many results it asks for). Shown beside the query that was sent.
   */
  readonly requestNotes?: readonly string[];
  /**
   * Set when the provider takes part in the expanded pass that runs when a strict search finds few results
   * that contain every word. It is how the query is written for that pass, and the provider's `search`
   * is called with `expanded: true`. Left out when a second request would only repeat the first.
   */
  readonly expandedSyntax?: QuerySyntax;
  /** Notes about the expanded request, shown beside the query it sent. */
  readonly expandedRequestNotes?: readonly string[];
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

/**
 * What the UI shows per provider after a search. "skipped" means the provider
 * was not asked at all, and `message` says why (for example: browsers cannot
 * call it).
 */
export type ProviderStatus =
  | { provider: ProviderId; state: "ok"; count: number; /** True when the answer came from this visit's cache. */ cached?: boolean }
  | { provider: ProviderId; state: ProviderFailureKind | "skipped"; message: string };
