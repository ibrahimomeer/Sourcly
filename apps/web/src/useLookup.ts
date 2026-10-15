import {
  closestTitleMatch,
  fetchNeighbours,
  lookupWork,
  type ClosestMatch,
  type DetectedInput,
  type LookupOptions,
  type LookupOutcome,
  type Neighbours,
  type Result,
} from "@sourcly/core";
import { useCallback, useEffect, useRef, useState } from "react";

/** What the page needs to ask the lookup sources: the contact email from config.js and the person's own OpenAlex key. */
export type LookupContext = Pick<LookupOptions, "contactEmail" | "openAlexApiKey">;

export type LookupTarget = Exclude<DetectedInput, { kind: "keywords" } | { kind: "title" }>;

export type LookupState =
  | { phase: "idle" }
  | { phase: "loading"; text: string; target: LookupTarget }
  | { phase: "done"; text: string; target: LookupTarget; outcome: LookupOutcome };

export type NeighboursState =
  | { kind: null }
  | { kind: Neighbours; phase: "loading" }
  | { kind: Neighbours; phase: "done"; results: Result[] }
  | { kind: Neighbours; phase: "error"; message: string };

/**
 * Looks up one work from a DOI, a link or an ID, and, when asked, lists the works it cites, the works that cite it
 * and its related works. A new lookup, or `clear`, drops anything still on its way.
 */
export function useLookup(context: LookupContext) {
  const [state, setState] = useState<LookupState>({ phase: "idle" });
  const [neighbours, setNeighbours] = useState<NeighboursState>({ kind: null });
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(context);
  latest.current = context;

  useEffect(() => () => controller.current?.abort(), []);

  const options = (signal: AbortSignal): LookupOptions => ({
    signal,
    ...(latest.current.contactEmail === undefined ? {} : { contactEmail: latest.current.contactEmail }),
    ...(latest.current.openAlexApiKey === undefined ? {} : { openAlexApiKey: latest.current.openAlexApiKey }),
  });

  const run = useCallback((target: LookupTarget, text: string) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setNeighbours({ kind: null });
    setState({ phase: "loading", text, target });
    void lookupWork(target, options(next.signal)).then((outcome) => {
      if (!next.signal.aborted) setState({ phase: "done", text, target, outcome });
    });
  }, []);

  const load = useCallback(
    (kind: Neighbours) => {
      if (state.phase !== "done" || state.outcome.openAlexId === null) return;
      const { openAlexId, relatedIds } = state.outcome;
      const next = new AbortController();
      controller.current?.abort();
      controller.current = next;
      setNeighbours({ kind, phase: "loading" });
      fetchNeighbours(kind, openAlexId, relatedIds, options(next.signal))
        .then((results) => {
          if (!next.signal.aborted) setNeighbours({ kind, phase: "done", results });
        })
        .catch((error: unknown) => {
          if (!next.signal.aborted) setNeighbours({ kind, phase: "error", message: error instanceof Error ? error.message : "The list could not be loaded" });
        });
    },
    [state],
  );

  const clear = useCallback(() => {
    controller.current?.abort();
    setState({ phase: "idle" });
    setNeighbours({ kind: null });
  }, []);

  return { state, neighbours, run, load, clear };
}

export type TitleMatchState = { phase: "idle" } | { phase: "loading"; title: string } | { phase: "done"; title: string; match: ClosestMatch | null };

/** The closest match for a long title typed in the search box, found alongside the ordinary search. */
export function useTitleMatch(context: LookupContext) {
  const [state, setState] = useState<TitleMatchState>({ phase: "idle" });
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback((title: string) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState({ phase: "loading", title });
    void closestTitleMatch(title, {
      signal: next.signal,
      ...(latest.current.contactEmail === undefined ? {} : { contactEmail: latest.current.contactEmail }),
      ...(latest.current.openAlexApiKey === undefined ? {} : { openAlexApiKey: latest.current.openAlexApiKey }),
    }).then((match) => {
      if (!next.signal.aborted) setState({ phase: "done", title, match });
    });
  }, []);

  const clear = useCallback(() => {
    controller.current?.abort();
    setState({ phase: "idle" });
  }, []);

  return { state, run, clear };
}
