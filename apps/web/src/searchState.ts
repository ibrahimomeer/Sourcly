import type { ProviderId, ProviderStatus, ProviderUpdate, Result } from "@sourcly/core";

// The state of a search as results arrive one provider at a time. It is a pure
// reducer so the rules can be tested without a browser or React.

export interface ActiveSearch {
  phase: "searching" | "done";
  /** Identifies this search, so a late answer from an older one is ignored. */
  id: number;
  query: string;
  /** The providers asked, in the order shown to the user. */
  order: ProviderId[];
  /** Every provider's results so far, not yet de-duplicated. */
  results: Result[];
  statuses: ProviderStatus[];
  /** Providers that have not answered yet. */
  pending: ProviderId[];
  searchedAt: Date | null;
}

export type SearchState = { phase: "idle" } | ActiveSearch;

export type SearchAction =
  | { type: "start"; id: number; query: string; order: ProviderId[]; skipped: ProviderStatus[] }
  | { type: "provider-done"; id: number; update: ProviderUpdate }
  | { type: "finish"; id: number; at: Date };

export const idleSearch: SearchState = { phase: "idle" };

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  if (action.type === "start") {
    return {
      phase: "searching",
      id: action.id,
      query: action.query,
      order: action.order,
      results: [],
      // Providers that cannot be asked are reported up front, so a gap is never silent.
      statuses: [...action.skipped],
      pending: action.order,
      searchedAt: null,
    };
  }
  // Anything about a search that is no longer the current one is dropped.
  if (state.phase === "idle" || state.id !== action.id) return state;

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
