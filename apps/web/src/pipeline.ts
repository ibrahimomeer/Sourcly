import {
  applyFilters,
  applyOverride,
  classify,
  mergeResults,
  scoreResults,
  type LabelOverride,
  type Result,
  type ResultFilters,
  type ScoredResult,
  type ScoringSettings,
} from "@sourcly/core";

export interface ViewSettings {
  scoring: ScoringSettings;
  filters: ResultFilters;
  /** The user's manual label overrides, by result id. */
  overrides: ReadonlyMap<string, LabelOverride>;
}

export interface RankedView {
  /** Results that pass the filters, best score first. */
  shown: ScoredResult[];
  /** Results hidden by the user's filters (never by anything else). */
  hidden: ScoredResult[];
}

/**
 * Everything that happens after the data arrives: merge duplicates, label,
 * score, sort, filter. It reads only the already-fetched results, so changing
 * any setting re-ranks instantly without contacting a provider.
 *
 * Results that several sources returned become one entry that lists all of
 * them. Scores are computed over every merged result before filtering, so a
 * filter never changes a result's score or rank, it only hides results.
 */
export function rankResults(
  results: readonly Result[],
  settings: ViewSettings,
  referenceYear: number,
): RankedView {
  const items = mergeResults(results).map((result) => ({
    result,
    labels: applyOverride(classify(result), settings.overrides.get(result.id)),
  }));
  const scored = scoreResults(items, settings.scoring, referenceYear);
  const { kept, hidden } = applyFilters(scored, settings.filters);
  return { shown: kept, hidden };
}
