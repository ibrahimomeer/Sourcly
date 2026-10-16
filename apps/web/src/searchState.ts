import {
  hardBlocks,
  type ConceptQuery,
  type ProviderId,
  type ProviderStatus,
  type ProviderUpdate,
  type Result,
  type SentQuery,
} from "@sourcly/core";

// The state of a search as results arrive one provider at a time. It is a pure
// reducer so the rules can be tested without a browser or React.

/** One fallback pass: the search again with one concept dropped. Its queries and answers are kept apart from the strict pass's. */
export interface FallbackPassState {
  /** The concept this pass left out. */
  dropped: string;
  /** The query as written for each source asked in this pass: exactly what was sent. */
  sent: SentQuery[];
  order: ProviderId[];
  statuses: ProviderStatus[];
  pending: ProviderId[];
}

/**
 * The fallback of a search. It runs by itself, once, when the strict first pass found fewer than 15 results that
 * match every concept: one pass for each of up to three concepts, the least specific dropped first.
 */
export interface Fallback {
  phase: "searching" | "done";
  /** How many works one source matches for each concept alone (the concept's label, lowercase), when it could be asked. */
  counts: { concept: string; works: number }[];
  passes: FallbackPassState[];
}

export interface ActiveSearch {
  phase: "searching" | "done";
  /** Identifies this search, so a late answer from an older one is ignored. */
  id: number;
  /** What was typed, exactly. */
  query: string;
  /** The query as it was read: concept blocks with their variants, filler words and soft terms. */
  concepts: ConceptQuery;
  /** The concepts the search is about (not optional terms such as the counterargument ones), as typed. Relevance is worked out from these. */
  terms: string[];
  /** The query as written for each source asked: exactly what was sent. */
  sent: SentQuery[];
  /** The providers asked, in the order shown to the user. */
  order: ProviderId[];
  /** Every provider's results so far, not yet de-duplicated. */
  results: Result[];
  statuses: ProviderStatus[];
  /** Providers that have not answered yet. */
  pending: ProviderId[];
  searchedAt: Date | null;
  /** The fallback passes, once they have started. Their results are in `results`, their hits marked as fallback. */
  fallback: Fallback | null;
}

/** True while the strict pass or a fallback pass is still waiting for a source. */
export function isSearching(state: SearchState): boolean {
  return state.phase === "searching" || (state.phase === "done" && state.fallback?.phase === "searching");
}

export type SearchState = { phase: "idle" } | ActiveSearch;

export type SearchAction =
  | { type: "start"; id: number; concepts: ConceptQuery; sent: SentQuery[]; order: ProviderId[]; skipped: ProviderStatus[] }
  | { type: "provider-done"; id: number; update: ProviderUpdate }
  | { type: "finish"; id: number; at: Date }
  | { type: "fallback-start"; id: number }
  | { type: "fallback-counts"; id: number; counts: { concept: string; works: number }[] }
  | { type: "fallback-pass-start"; id: number; dropped: string; sent: SentQuery[]; order: ProviderId[] }
  | { type: "fallback-provider-done"; id: number; update: ProviderUpdate }
  | { type: "fallback-finish"; id: number }
  /** Forget the search, e.g. because the search it was based on has been replaced. */
  | { type: "reset" };

export const idleSearch: SearchState = { phase: "idle" };

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  if (action.type === "reset") return idleSearch;
  if (action.type === "start") {
    return {
      phase: "searching",
      id: action.id,
      query: action.concepts.original,
      concepts: action.concepts,
      terms: hardBlocks(action.concepts).map((block) => block.label),
      sent: action.sent,
      order: action.order,
      results: [],
      // Providers that cannot be asked are reported up front, so a gap is never silent.
      statuses: [...action.skipped],
      pending: action.order,
      searchedAt: null,
      fallback: null,
    };
  }
  // Anything about a search that is no longer the current one is dropped.
  if (state.phase === "idle" || state.id !== action.id) return state;

  if (action.type === "fallback-start") {
    if (state.phase !== "done" || state.fallback !== null) return state;
    return { ...state, fallback: { phase: "searching", counts: [], passes: [] } };
  }
  if (action.type === "fallback-counts") {
    return state.fallback === null ? state : { ...state, fallback: { ...state.fallback, counts: action.counts } };
  }
  if (action.type === "fallback-pass-start") {
    if (state.fallback === null) return state;
    const pass: FallbackPassState = { dropped: action.dropped, sent: action.sent, order: action.order, statuses: [], pending: action.order };
    return { ...state, fallback: { ...state.fallback, passes: [...state.fallback.passes, pass] } };
  }
  if (action.type === "fallback-provider-done") {
    const fallback = state.fallback;
    const last = fallback?.passes[fallback.passes.length - 1];
    if (fallback === null || last === undefined || !last.pending.includes(action.update.provider)) return state;
    const updated: FallbackPassState = {
      ...last,
      statuses: [...last.statuses, action.update.status],
      pending: last.pending.filter((id) => id !== action.update.provider),
    };
    return {
      ...state,
      results: [...state.results, ...action.update.results],
      fallback: { ...fallback, passes: [...fallback.passes.slice(0, -1), updated] },
    };
  }
  if (action.type === "fallback-finish") {
    return state.fallback === null ? state : { ...state, fallback: { ...state.fallback, phase: "done" } };
  }

  if (action.type === "provider-done") {
    const { provider, status, results } = action.update;
    if (!state.pending.includes(provider)) return state;
    return {
      ...state,
      results: [...state.results, ...results],
      statuses: [...state.statuses, status],
      pending: state.pending.filter((id) => id !== provider),
    };
  }
  return { ...state, phase: "done", pending: [], searchedAt: action.at };
}

/** Statuses in the order the providers were asked, with "skipped" ones after them. */
export function orderedStatuses(state: ActiveSearch): ProviderStatus[] {
  const rank = (status: ProviderStatus) => {
    const index = state.order.indexOf(status.provider);
    return index === -1 ? state.order.length : index;
  };
  return [...state.statuses].sort((a, b) => rank(a) - rank(b));
}
