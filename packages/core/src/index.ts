// @sourcly/core: UI-independent logic. Nothing in here touches the DOM.
export * from "./types";
export { doiUrl, normalizeDoi } from "./doi";
export {
  excludedTerms,
  formatQuery,
  isAllCapsTerm,
  isUsable,
  looksLikeQuestion,
  parseQuery,
  queryTerms,
  renderQuery,
  requiredTerms,
  type ParseOptions,
  type ParsedQuery,
  type QueryNode,
  type RenderedQuery,
} from "./query";
export {
  apaChecks,
  apaInlineHtml,
  apaText,
  buildReferenceList,
  formatApa,
  formatApaAuthors,
  journalCase,
  referenceListHtml,
  referenceListText,
  splitName,
  type ApaCitation,
  type ApaEntry,
  type ApaOptions,
  type ApaPart,
} from "./apa";
export {
  PROTOCOL_SCHEMA,
  PROTOCOL_SCHEMA_VERSION,
  buildProtocol,
  protocolFileName,
  protocolJson,
  referencesFileName,
  type ProtocolInput,
  type ProtocolSearch,
  type SearchProtocol,
} from "./protocol";
export {
  MAX_SAVED,
  SAVED_FORMAT_VERSION,
  addSaved,
  canSave,
  isSaved,
  parseSaved,
  removeSaved,
  savedResults,
  serializeSaved,
  toSavedResult,
  type SavedItem,
} from "./saved";
export { CHECK_TAGS, isCheckTag } from "./checktags";
export {
  CRITICISM_TERMS,
  DEFAULT_COUNTER_TERMS,
  MAX_COUNTER_TERM_LENGTH,
  NOTICE_TERMS,
  counterQuery,
  findLexiconMatches,
  findQueryTerms,
  findTerms,
  highlightSegments,
  markText,
  parseCounterTerm,
  usableCounterTerms,
  type CounterTermResult,
  type HighlightGroup,
  type HighlightSegment,
  type MarkedSegment,
  type LexiconMatch,
  type TermMatch,
} from "./counter";
export { NOTICE_LABELS, noticeKind, type NoticeKind } from "./notices";
export { relatedTerms, type RelatedTerm } from "./related";
export { BM25_B, BM25_K1 } from "./bm25";
export { tokenize, type TokenizeOptions } from "./tokens";
export { STOPWORDS } from "./stopwords";
export { createOpenAlexProvider, type OpenAlexOptions } from "./providers/openalex";
export { createCrossrefProvider, type CrossrefOptions } from "./providers/crossref";
export { createPubmedProvider, createPubmedSpellchecker, type PubmedOptions, type Spellchecker } from "./providers/pubmed";
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
export { UNKNOWN_LANGUAGE, countLanguages, languageName, languageOf, type LanguageCount } from "./language";
export {
  MIN_SPELLCHECK_LENGTH,
  RARE_WORD_RESULTS,
  suggestSpelling,
  wordsToSpellcheck,
  type SpellingChange,
  type SpellingSuggestion,
} from "./spelling";
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
  FIELD_WEIGHTS,
  PHRASE_WEIGHTS,
  coverageSpec,
  measureCoverage,
  type Coverage,
  type CoverageSpec,
  type CoverageUnit,
  type MatchField,
  type PairMatch,
  type Tier,
  type UnitMatch,
} from "./coverage";
export {
  FACTOR_IDS,
  FACTOR_LABELS,
  NEUTRAL,
  TERM_MATCHING_MODES,
  defaultScoringSettings,
  scoreResults,
  type FactorBreakdown,
  type FactorId,
  type FactorSetting,
  type ScoredResult,
  type ScoringContext,
  type ScoringItem,
  type ScoringSettings,
  type TermMatching,
} from "./scoring";
