import { searchProviders, type Provider, type ProviderStatus, type Result } from "@sourcly/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** How many results to ask each source for. OpenAlex allows at most 100 per request. */
export const RESULTS_PER_SOURCE = 50;

export type SearchState =
  | { phase: "idle" }
  | { phase: "searching"; query: string }
  | {
      phase: "done";
      query: string;
      results: Result[];
      statuses: ProviderStatus[];
      searchedAt: Date;
    };

/**
 * Runs searches and keeps the latest one's outcome. Starting a new search
 * cancels the previous one, and a cancelled search can never overwrite the
 * newer results.
 */
export function useSearch(): { state: SearchState; search: (query: string, providers: readonly Provider[]) => void } {
  const [state, setState] = useState<SearchState>({ phase: "idle" });
  const current = useRef<AbortController | null>(null);

  useEffect(() => () => current.current?.abort(), []);

  const search = useCallback((query: string, providers: readonly Provider[]) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;

    setState({ phase: "searching", query });
    void searchProviders(providers, query, { limit: RESULTS_PER_SOURCE, signal: controller.signal }).then(
      (outcome) => {
        if (controller.signal.aborted) return;
        setState({ phase: "done", query, ...outcome, searchedAt: new Date() });
      },
    );
  }, []);

  return { state, search };
}
