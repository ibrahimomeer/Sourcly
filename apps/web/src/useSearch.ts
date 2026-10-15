import {
  planQueries,
  runFallback,
  searchProviders,
  hardBlocks,
  type Counter,
  type ConceptQuery,
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
  /** Asks how many works a concept matches, to judge how specific it is. Only for the fallback passes. */
  count?: Counter;
}

/**
 * Runs searches and keeps the latest one's progress. Each source's answer is
 * added the moment it arrives. Starting a new search cancels the previous one,
 * and a cancelled search can never change the newer results.
 */
export function useSearch(): {
  state: SearchState;
  search: (query: ConceptQuery, providers: readonly Provider[], options: SearchRequestOptions) => void;
  /** Runs the fallback passes of the search on the page, once. They add results to it; they do not start a new search. */
  fallback: (providers: readonly Provider[], options: SearchRequestOptions) => void;
  /** Cancels any search in progress and forgets its results. */
  reset: () => void;
} {
  const [state, dispatch] = useReducer(searchReducer, idleSearch);
  const current = useRef<AbortController | null>(null);
  const counter = useRef(0);
  // The search on the page, for its fallback passes: its concepts and what the strict pass found.
  const latest = useRef<{ query: ConceptQuery; id: number } | null>(null);
  const stateRef = useRef<SearchState>(state);
  stateRef.current = state;
  // Answers to "how many works match this concept", kept for the visit.
  const counts = useRef(new Map<string, number | null>());

  useEffect(() => () => current.current?.abort(), []);

  const search = useCallback((query: ConceptQuery, providers: readonly Provider[], options: SearchRequestOptions) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    counter.current += 1;
    const id = counter.current;
    latest.current = { query, id };

    dispatch({
      type: "start",
      id,
      concepts: query,
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

  const fallback = useCallback((providers: readonly Provider[], options: SearchRequestOptions) => {
    const started = latest.current;
    const now = stateRef.current;
    if (started === null || now.phase !== "done" || now.id !== started.id || now.fallback !== null) return;
    if (hardBlocks(started.query).length < 2) return;
    const controller = new AbortController();
    current.current = controller;
    const { id, query } = started;
    dispatch({ type: "fallback-start", id });
    void runFallback(
      providers,
      query,
      {
        limit: options.limit,
        signal: controller.signal,
        cache: options.cache,
        count: options.count ?? (async () => null),
        memory: counts.current,
        have: now.results,
      },
      {
        onCounts: (found) => {
          if (controller.signal.aborted) return;
          const byBlock = hardBlocks(query)
            .filter((block) => found.has(block.id))
            .map((block) => ({ concept: block.label, works: found.get(block.id) as number }));
          dispatch({ type: "fallback-counts", id, counts: byBlock });
        },
        onPassStart: (pass, sent) => {
          if (!controller.signal.aborted) dispatch({ type: "fallback-pass-start", id, dropped: pass.dropped, sent, order: providers.map((provider) => provider.id) });
        },
        onProviderDone: (update) => {
          if (!controller.signal.aborted) dispatch({ type: "fallback-provider-done", id, update });
        },
      },
    ).then(() => {
      if (!controller.signal.aborted) dispatch({ type: "fallback-finish", id });
    });
  }, []);

  const reset = useCallback(() => {
    current.current?.abort();
    current.current = null;
    latest.current = null;
    dispatch({ type: "reset" });
  }, []);

  return { state, search, fallback, reset };
}
