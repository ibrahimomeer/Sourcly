import type { PeerReviewStatus, SourceLevel } from "./classify";
import type { ScoringItem } from "./scoring";

/**
 * The user's optional filters. Nothing is filtered by default: `defaultFilters()`
 * keeps every result. A result is hidden only when the user has set a filter
 * that it does not satisfy.
 */
export interface ResultFilters {
  /** Inclusive bounds on publication year; null = no bound. */
  yearFrom: number | null;
  yearTo: number | null;
  /** Keep only these levels. Empty = any level. */
  levels: SourceLevel[];
  /** Keep only these peer-review statuses. Empty = any. */
  peerReview: PeerReviewStatus[];
  /** Keep only results the provider says are open access. */
  openAccessOnly: boolean;
}

export function defaultFilters(): ResultFilters {
  return { yearFrom: null, yearTo: null, levels: [], peerReview: [], openAccessOnly: false };
}

/** True when at least one filter is set. */
export function isFiltering(filters: ResultFilters): boolean {
  return (
    filters.yearFrom !== null ||
    filters.yearTo !== null ||
    filters.levels.length > 0 ||
    filters.peerReview.length > 0 ||
    filters.openAccessOnly
  );
}

function passes({ result, labels }: ScoringItem, filters: ResultFilters): boolean {
  const hasYearBound = filters.yearFrom !== null || filters.yearTo !== null;
  if (hasYearBound) {
    // A result with no year cannot be shown to be inside the range, so it is hidden.
    if (result.year === null) return false;
    if (filters.yearFrom !== null && result.year < filters.yearFrom) return false;
    if (filters.yearTo !== null && result.year > filters.yearTo) return false;
  }
  if (filters.levels.length > 0 && !filters.levels.includes(labels.level.value)) return false;
  if (filters.peerReview.length > 0 && !filters.peerReview.includes(labels.peerReview.value)) return false;
  if (filters.openAccessOnly && result.openAccess.isOpen !== true) return false;
  return true;
}

/**
 * Splits items into those that pass the filters and those hidden by them,
 * keeping the input order. Filtering uses the effective labels (including the
 * user's manual overrides) and never changes any item's score.
 */
export function applyFilters<T extends ScoringItem>(
  items: readonly T[],
  filters: ResultFilters,
): { kept: T[]; hidden: T[] } {
  const kept: T[] = [];
  const hidden: T[] = [];
  for (const item of items) (passes(item, filters) ? kept : hidden).push(item);
  return { kept, hidden };
}
