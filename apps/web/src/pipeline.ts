import {
  applyFilters,
  applyOverride,
  classify,
  coverageSpec,
  mergeResults,
  scoreResults,
  relatedTerms,
  type LabelOverride,
  type RelatedTerm,
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
}

export interface RankedView {
  /** Results that pass the filters, in order. With "Require all terms", only those that contain every term. */
  shown: ScoredResult[];
  /** Results hidden by the user's filters (never by anything else). */
  hidden: ScoredResult[];
  /** With "Require all terms": results that pass the filters but lack some term. Kept apart, never deleted. */
  partial: ScoredResult[];
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
  if (settings.scoring.termMatching === "all") {
    return { shown: kept.filter((item) => item.tier === 1), hidden, partial: kept.filter((item) => item.tier > 1) };
  }
  return { shown: kept, hidden, partial: [] };
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
    ...(search.parsed.exact === true ? { exact: true } : {}),
    coverage: coverageSpec(search.parsed),
  };
}

/** Fewer merged results than this containing every term of the search is "few": the page then says so. */
export const FEW_FULL_MATCHES = 10;

/** How many merged results contain every term of the search, wherever the filters and the term-matching setting put them. */
export function fullMatchCount(ranked: RankedView): number {
  return [...ranked.shown, ...ranked.partial, ...ranked.hidden].filter((item) => item.tier === 1).length;
}

export function hasFewFullMatches(ranked: RankedView): boolean {
  return fullMatchCount(ranked) < FEW_FULL_MATCHES;
}

/** For each term of the search (its label, lowercase), how many merged results contain it. Filters do not change it. */
export function termResultCounts(ranked: RankedView): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of [...ranked.shown, ...ranked.partial, ...ranked.hidden]) {
    for (const unit of item.coverage?.units ?? []) {
      const label = unit.label.toLowerCase();
      counts.set(label, (counts.get(label) ?? 0) + (unit.matched ? 1 : 0));
    }
  }
  return counts;
}

/** How many of the best-ranked results the related terms are taken from. */
export const RELATED_FROM_TOP = 20;

/** Related terms from the top results that are shown, in the order the list shows them. */
export function relatedFor(ranked: RankedView, terms: readonly string[]): RelatedTerm[] {
  return relatedTerms(
    ranked.shown.slice(0, RELATED_FROM_TOP).map((scored) => scored.result),
    terms,
  );
}
