import { resolveLanguage } from "./language";
import type { ScoredResult } from "./scoring";
import type { Result, WorkType } from "./types";

// Where each result goes on the page. Nothing is ever deleted: a result is either in the main list or in
// one of three collapsed sections under it, each with a count, and the page says which.
//
// For each result, in the order it was ranked:
//  1. a dataset, thesis, report, encyclopedia entry or other non-article type, or a work only a repository such as
//     Zenodo or DataCite holds, goes to "Datasets, presentations and other types" (unless the person chose to show them);
//  2. a result whose language is known and is not one of the preferred languages goes to "Other languages";
//  3. of the rest, those that contain every term go to the main list. If fewer than 10 do, those that contain all
//     but one of the terms join them, each labelled "Matches N of M words", after the full matches;
//  4. everything else goes to "Partial matches".

/** The main list is widened with near matches while fewer results than this contain every term. */
export const FEW_FULL_MATCHES = 10;

export interface LayoutSettings {
  /** ISO 639-1 codes. A result detected as another language goes to "Other languages". Empty = any language. */
  preferredLanguages: string[];
  /** Show non-article types in the main list instead of their own section. */
  showNonArticleTypes: boolean;
}

export function defaultLayoutSettings(): LayoutSettings {
  return { preferredLanguages: ["en"], showNonArticleTypes: false };
}

const ARTICLE_TYPES: ReadonlySet<WorkType> = new Set<WorkType>([
  "journal-article",
  "review",
  "preprint",
  "conference-paper",
  "book",
  "book-chapter",
  // The metadata did not say: it is not moved away on a guess.
  "unknown",
]);

/** Providers that hold whatever anyone uploads. A work only they hold is not placed among articles. */
const REPOSITORIES = new Set(["zenodo", "datacite"]);

export function isArticleLike(result: Pick<Result, "type" | "hits">): boolean {
  if (!ARTICLE_TYPES.has(result.type)) return false;
  return result.hits.length === 0 || !result.hits.every((hit) => REPOSITORIES.has(hit.provider));
}

export type SectionId = "main" | "partial" | "otherLanguages" | "otherTypes";

export interface Layout<T> {
  main: T[];
  partial: T[];
  otherLanguages: T[];
  otherTypes: T[];
}

/** The section one result belongs to before the main list is widened: its own type and language decide it, or nothing does. */
export function sectionOf(result: Result, layout: LayoutSettings): "otherTypes" | "otherLanguages" | null {
  if (!layout.showNonArticleTypes && !isArticleLike(result)) return "otherTypes";
  const language = resolveLanguage(result).code;
  if (language !== null && layout.preferredLanguages.length > 0 && !layout.preferredLanguages.includes(language)) return "otherLanguages";
  return null;
}

const containsEveryTerm = (item: ScoredResult) => item.coverage === null || item.coverage.total === 0 || item.coverage.matchedCount === item.coverage.total;
const containsAllButOne = (item: ScoredResult) =>
  item.coverage !== null && item.coverage.total >= 2 && item.coverage.matchedCount === item.coverage.total - 1;

/** "Matches 2 of 3 words" for a result that does not contain every term, or null. */
export function matchCountLabel(item: Pick<ScoredResult, "coverage">): string | null {
  const coverage = item.coverage;
  if (coverage === null || coverage.total === 0 || coverage.matchedCount === coverage.total) return null;
  return `Matches ${coverage.matchedCount} of ${coverage.total} words`;
}

/** Splits ranked results into the main list and the three sections. The order inside each is the order given. */
export function arrangeResults<T extends ScoredResult>(ranked: readonly T[], layout: LayoutSettings): Layout<T> {
  const out: Layout<T> = { main: [], partial: [], otherLanguages: [], otherTypes: [] };
  const eligible: T[] = [];
  for (const item of ranked) {
    const section = sectionOf(item.result, layout);
    if (section === null) eligible.push(item);
    else out[section].push(item);
  }
  const widen = eligible.filter(containsEveryTerm).length < FEW_FULL_MATCHES;
  for (const item of eligible) {
    if (containsEveryTerm(item) || (widen && containsAllButOne(item))) out.main.push(item);
    else out.partial.push(item);
  }
  return out;
}
