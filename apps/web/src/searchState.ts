import {
  formatQuery,
  requiredTerms,
  type ParsedQuery,
  type ProviderId,
  type ProviderStatus,
  type ProviderUpdate,
  type Result,
  type SentQuery,
} from "@sourcly/core";

// The state of a search as results arrive one provider at a time. It is a pure
// reducer so the rules can be tested without a browser or React.

/**
 * The second, expanded pass of a search. It runs by itself, once, when the strict first pass found fewer than 10
 * results that contain every word. Its queries and answers are kept apart from the first pass's.
 */
export interface Expansion {
  phase: "searching" | "done";
  /** The query as written for each source asked in this pass: exactly what was sent. */
  sent: SentQuery[];
  order: ProviderId[];
  statuses: ProviderStatus[];
  pending: ProviderId[];
}

export interface ActiveSearch {
  phase: "searching" | "done";
  /** Identifies this search, so a late answer from an older one is ignored. */
  id: number;
  /** What was searched for, as tidy text (common words removed). */
  query: string;
  /** The query as it was read, including what was typed and which common words were dropped. */
  parsed: ParsedQuery;
  /** The words the search is about (not optional terms such as the counterargument ones). Relevance and related terms are worked out from these. */
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
  /** The expanded second pass, once it has started. Its results are in `results`, marked as expanded. */
  expansion: Expansion | null;
}

/** True while either pass is still waiting for a source. */
export function isSearching(state: SearchState): boolean {
  return state.phase === "searching" || (state.phase === "done" && state.expansion?.phase === "searching");
}

export type SearchState = { phase: "idle" } | ActiveSearch;

export type SearchAction =
  | { type: "start"; id: number; parsed: ParsedQuery; sent: SentQuery[]; order: ProviderId[]; skipped: ProviderStatus[] }
  | { type: "provider-done"; id: number; update: ProviderUpdate }
  | { type: "finish"; id: number; at: Date }
  | { type: "expand-start"; id: number; sent: SentQuery[]; order: ProviderId[] }
  | { type: "expand-provider-done"; id: number; update: ProviderUpdate }
  | { type: "expand-finish"; id: number }
  /** Forget the search, e.g. because the search it was based on has been replaced. */
  | { type: "reset" };

export const idleSearch: SearchState = { phase: "idle" };

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  if (action.type === "reset") return idleSearch;
  if (action.type === "start") {
    return {
      phase: "searching",
      id: action.id,
      query: formatQuery(action.parsed),
      parsed: action.parsed,
      terms: requiredTerms(action.parsed),
      sent: action.sent,
      order: action.order,
      results: [],
      // Providers that cannot be asked are reported up front, so a gap is never silent.
      statuses: [...action.skipped],
      pending: action.order,
      searchedAt: null,
      expansion: null,
    };
  }
  // Anything about a search that is no longer the current one is dropped.
  if (state.phase === "idle" || state.id !== action.id) return state;

  if (action.type === "expand-start") {
    if (state.phase !== "done" || state.expansion !== null) return state;
    return { ...state, expansion: { phase: "searching", sent: action.sent, order: action.order, statuses: [], pending: action.order } };
  }
  if (action.type === "expand-provider-done") {
    const expansion = state.expansion;
    if (expansion === null || !expansion.pending.includes(action.update.provider)) return state;
    return {
      ...state,
      results: [...state.results, ...action.update.results],
      expansion: {
        ...expansion,
        statuses: [...expansion.statuses, action.update.status],
        pending: expansion.pending.filter((id) => id !== action.update.provider),
      },
    };
  }
  if (action.type === "expand-finish") {
    return state.expansion === null ? state : { ...state, expansion: { ...state.expansion, phase: "done", pending: [] } };
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
