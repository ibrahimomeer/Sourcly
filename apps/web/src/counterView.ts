import { noticeKind, type Result, type ScoredResult } from "@sourcly/core";

// The counterargument panel can narrow its list to the kinds of record that are easy to miss
// there. This is a view the person switches on, with the counts always shown; nothing is hidden
// by default and no score changes.

export type CounterView = "all" | "reviews" | "flagged";

export const COUNTER_VIEWS: readonly { id: CounterView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reviews", label: "Reviews and meta-analyses" },
  { id: "flagged", label: "Retractions and corrections" },
];

/** A review article, systematic review or meta-analysis, as the source says it is. */
export function isReview(result: Result): boolean {
  return result.type === "review";
}

/** A retraction or correction notice, or a work a source says was retracted. */
export function isFlagged(result: Result): boolean {
  return noticeKind(result) !== null || result.retraction.retracted === true;
}

export interface CounterCounts {
  all: number;
  reviews: number;
  flagged: number;
}

export function countViews(list: readonly ScoredResult[]): CounterCounts {
  return {
    all: list.length,
    reviews: list.filter((item) => isReview(item.result)).length,
    flagged: list.filter((item) => isFlagged(item.result)).length,
  };
}

/** The part of the list a view shows, in the same order. */
export function selectView(list: readonly ScoredResult[], view: CounterView): ScoredResult[] {
  if (view === "reviews") return list.filter((item) => isReview(item.result));
  if (view === "flagged") return list.filter((item) => isFlagged(item.result));
  return [...list];
}
