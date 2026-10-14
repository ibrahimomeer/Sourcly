// @sourcly/core: UI-independent logic. Nothing in here touches the DOM.
export * from "./types";
export { doiUrl, normalizeDoi } from "./doi";
export {
  excludedTerms,
  formatQuery,
  isUsable,
  parseQuery,
  queryTerms,
  renderQuery,
  type ParsedQuery,
  type QueryNode,
  type RenderedQuery,
} from "./query";
export { CHECK_TAGS, isCheckTag } from "./checktags";
export { relatedTerms, type RelatedTerm } from "./related";
export { BM25_B, BM25_K1 } from "./bm25";
export { tokenize } from "./tokens";
export { createOpenAlexProvider, type OpenAlexOptions } from "./providers/openalex";
export { createCrossrefProvider, type CrossrefOptions } from "./providers/crossref";
export { createPubmedProvider, type PubmedOptions } from "./providers/pubmed";
export { createEuropePmcProvider, type EuropePmcOptions } from "./providers/europepmc";
export { createDoajProvider, type DoajOptions } from "./providers/doaj";
export { createDataCiteProvider, type DataCiteOptions } from "./providers/datacite";
export { createZenodoProvider, type ZenodoOptions } from "./providers/zenodo";
export { createWikipediaProvider, type WikipediaOptions } from "./providers/wikipedia";
export { createSemanticScholarProvider, type SemanticScholarOptions } from "./providers/semanticscholar";
export {
  DEFAULT_TIMEOUT_MS,
  planQueries,
  searchProviders,
  type ProviderUpdate,
  type SearchOutcome,
  type SearchRunOptions,
  type SentQuery,
} from "./search";
export { createSearchCache, type SearchCache } from "./cache";
export { PROVIDER_PRIORITY, mergeResults } from "./dedupe";
export { applyFilters, defaultFilters, isFiltering, type ResultFilters } from "./filters";
export {
  PEER_REVIEW_STATUSES,
  SOURCE_LEVELS,
  applyOverride,
  classify,
  type Label,
  type LabelOverride,
  type Labels,
  type PeerReviewStatus,
  type SourceLevel,
} from "./classify";
export {
  FACTOR_IDS,
  FACTOR_LABELS,
  NEUTRAL,
  defaultScoringSettings,
  scoreResults,
  type FactorBreakdown,
  type FactorId,
  type FactorSetting,
  type ScoredResult,
  type ScoringContext,
  type ScoringItem,
  type ScoringSettings,
} from "./scoring";
