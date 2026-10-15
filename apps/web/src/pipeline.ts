import {
  FEW_FULL_MATCHES,
  applyFilters,
  applyOverride,
  arrangeResults,
  classify,
  coverageSpec,
  mergeResults,
  scoreResults,
  suggestedTerms,
  type ConceptQuery,
  type LabelOverride,
  type LayoutSettings,
  type SuggestedTerm,
  type Result,
  type ResultFilters,
  type ScoredResult,
  type ScoringContext,
  type ScoringSettings,
} from "@sourcly/core";
import type { ActiveSearch } from "./searchState";

export interface ViewSettings {
  scoring: ScoringSettings;
  filters: ResultFilters;
  /** The user's manual label overrides, by result id. */
  overrides: ReadonlyMap<string, LabelOverride>;
  /** Which results go to the main list and which to the collapsed sections. */
  layout: LayoutSettings;
}

export interface RankedView {
  /** The main list, in order: results that match every concept, and, while there are few, those that lack one. */
  shown: ScoredResult[];
  /** Results hidden by the user's filters (never by anything else). */
  hidden: ScoredResult[];
  /** Partial matches: results that pass the filters but lack more than one term. Kept apart, never deleted. */
  partial: ScoredResult[];
  /** Results in a language that is not preferred. Kept apart, never deleted. */
  otherLanguages: ScoredResult[];
  /** Datasets, theses, reports and other non-article types, and works only a repository holds. Kept apart, never deleted. */
  otherTypes: ScoredResult[];
}

/** Every result in the view that was not hidden by a filter, in the order the page lists them. */
export function listedResults(ranked: RankedView): ScoredResult[] {
  return [...ranked.shown, ...ranked.partial, ...ranked.otherLanguages, ...ranked.otherTypes];
}

/** Every result in the view, whatever section or filter it is in. */
export function allResults(ranked: RankedView): ScoredResult[] {
  return [...listedResults(ranked), ...ranked.hidden];
}

/**
 * Everything that happens after the data arrives: merge duplicates, label,
 * score, sort, filter. It reads only the already-fetched results, so changing
 * any setting re-ranks instantly without contacting a provider.
 *
 * Results that several sources returned become one entry that lists all of
 * them. Scores are computed over every merged result before filtering, so a
 * filter never changes a result's score or rank, it only hides results.
 * Relevance is measured over that same merged set, so it needs the query's words.
 */
export function rankResults(
  results: readonly Result[],
  settings: ViewSettings,
  context: ScoringContext,
): RankedView {
  const items = mergeResults(results).map((result) => ({
    result,
    labels: applyOverride(classify(result), settings.overrides.get(result.id)),
  }));
  const scored = scoreResults(items, settings.scoring, context);
  const { kept, hidden } = applyFilters(scored, settings.filters);
  const { main, partial, otherLanguages, otherTypes } = arrangeResults(kept, settings.layout);
  return { shown: main, hidden, partial, otherLanguages, otherTypes };
}

/**
 * Scores results with no search behind them (the references of a work, the works that cite it): every term-based
 * factor is neutral, and the order is the weighted score. Duplicates are merged, and nothing is sectioned or hidden.
 */
export function scoreWithoutQuery(results: readonly Result[], settings: ViewSettings, referenceYear: number): ScoredResult[] {
  const items = mergeResults(results).map((result) => ({
    result,
    labels: applyOverride(classify(result), settings.overrides.get(result.id)),
  }));
  return scoreResults(items, settings.scoring, { referenceYear, queryTerms: [], answeredSources: 1 });
}

/**
 * What ranking needs to know about the search: its words, and how many sources answered
 * (a source that answered with nothing still counts, a source that failed does not).
 */
export function scoringContext(
  search: ActiveSearch,
  referenceYear: number,
  /** The counterargument terms, when this is that search: relevance then also needs a term. */
  signalTerms?: readonly string[],
): ScoringContext {
  return {
    referenceYear,
    queryTerms: search.terms,
    answeredSources: search.statuses.filter((status) => status.state === "ok").length,
    ...(signalTerms === undefined ? {} : { signalTerms }),
    ...(search.concepts.exact ? { exact: true } : {}),
    coverage: coverageSpec(search.concepts),
  };
}

/** How many merged results match every concept of the search, wherever the filters and sections put them. */
export function fullMatchCount(ranked: RankedView): number {
  return allResults(ranked).filter((item) => item.tier === 1).length;
}

/** Fewer merged results than FEW_FULL_MATCHES match every concept: the page says so, and runs the fallback passes. */
export function hasFewFullMatches(ranked: RankedView): boolean {
  return fullMatchCount(ranked) < FEW_FULL_MATCHES;
}

/** Suggested terms come from the best results of the main list, in the order the list shows them (see suggested.ts). */
export function suggestedFor(ranked: RankedView, concepts: ConceptQuery): SuggestedTerm[] {
  return suggestedTerms(
    ranked.shown.map((scored) => scored.result),
    concepts,
  );
}
