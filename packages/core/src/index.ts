// @sourcly/core: UI-independent logic. Nothing in here touches the DOM.
export * from "./types";
export { doiUrl, normalizeDoi } from "./doi";
export { createOpenAlexProvider, type OpenAlexOptions } from "./providers/openalex";
export { searchProviders, type SearchOutcome } from "./search";
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
  type ScoringItem,
  type ScoringSettings,
} from "./scoring";
