import {
  planQueries,
  searchProviders,
  type ParsedQuery,
  type Provider,
  type ProviderStatus,
  type SearchCache,
} from "@sourcly/core";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { idleSearch, searchReducer, type SearchState } from "./searchState";

export interface SearchRequestOptions {
  /** How many results to ask each source for. */
  limit: number;
  /** This visit's memory of earlier answers. */
  cache: SearchCache;
  /** Sources that cannot be asked; reported in the status list. */
  skipped: ProviderStatus[];
}

/**
 * Runs searches and keeps the latest one's progress. Each source's answer is
 * added the moment it arrives. Starting a new search cancels the previous one,
 * and a cancelled search can never change the newer results.
 */
export function useSearch(): {
  state: SearchState;
  search: (query: ParsedQuery, providers: readonly Provider[], options: SearchRequestOptions) => void;
  /** Cancels any search in progress and forgets its results. */
  reset: () => void;
} {
  const [state, dispatch] = useReducer(searchReducer, idleSearch);
  const current = useRef<AbortController | null>(null);
  const counter = useRef(0);

  useEffect(() => () => current.current?.abort(), []);

  const search = useCallback((query: ParsedQuery, providers: readonly Provider[], options: SearchRequestOptions) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    counter.current += 1;
    const id = counter.current;

    dispatch({
      type: "start",
      id,
      parsed: query,
      sent: planQueries(providers, query),
      order: providers.map((provider) => provider.id),
      skipped: options.skipped,
    });
    void searchProviders(providers, query, {
      limit: options.limit,
      signal: controller.signal,
      cache: options.cache,
      onProviderDone: (update) => {
        if (!controller.signal.aborted) dispatch({ type: "provider-done", id, update });
      },
    }).then(() => {
      if (!controller.signal.aborted) dispatch({ type: "finish", id, at: new Date() });
    });
  }, []);

  const reset = useCallback(() => {
    current.current?.abort();
    current.current = null;
    dispatch({ type: "reset" });
  }, []);

  return { state, search, reset };
}
