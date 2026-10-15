import { coverageSpec } from "./coverage";
import type { ParsedQuery } from "./query";
import { normalizeWord } from "./tokens";
import type { Result } from "./types";

// "Did you mean ...?" without a dictionary or a service: only the results that came back are looked at.
// A word of the search that almost no result contains, next to a word that is a letter or two away from it
// (same first letter) and that many results do contain, is probably a typing slip. The suggestion is a link
// the person clicks; nothing is ever corrected by itself, and the text in the search box is never changed
// until they choose it.

/** The suggested word must be in at least this many results ... */
export const MIN_SUGGESTION_RESULTS = 5;
/**
 * ... and in at least this many times as many results as the word that was typed: 3 times when the two words are
 * two edits apart, and 2 times when they are one edit apart (a one-letter slip is the likelier one; on a real search
 * for "caos double pendulum", "chaos" was in 8 results and "caos" in 3, while the two-edit word "case" was in 9).
 */
export const SUGGESTION_RATIO = 3;
export const SUGGESTION_RATIO_ONE_EDIT = 2;
/** Edit distance allowed between the two words: one insertion, deletion, substitution or swap of neighbours counts 1. */
export const MAX_TYPO_DISTANCE = 2;
/** A typed word is "in very few results" when it is in no more than this share of them (and never fewer than 3 are allowed). */
const VERY_FEW_SHARE = 0.1;
const VERY_FEW_AT_LEAST = 3;
const MIN_LENGTH = 4;

/**
 * The words of the search that can be checked: plain words of letters, not inside quotes, not hyphenated,
 * not in a group of alternatives, not after NOT, not an all-capital abbreviation and at least 4 letters.
 * Lowercase, each once, in order.
 */
export function wordsToCheck(query: ParsedQuery): string[] {
  const words: string[] = [];
  for (const unit of coverageSpec(query).units) {
    const atoms = unit.alternatives.length === 1 ? unit.alternatives[0] : undefined;
    const only = atoms?.length === 1 ? atoms[0] : undefined;
    if (only === undefined || only.keys.length !== 1) continue;
    const word = only.text;
    if (!/^\p{L}+$/u.test(word) || word.length < MIN_LENGTH || word === word.toUpperCase()) continue;
    const lower = word.toLowerCase();
    if (!words.includes(lower)) words.push(lower);
  }
  return words;
}

/**
 * Damerau-Levenshtein distance (insertions, deletions, substitutions and swaps of two neighbouring letters,
 * each counting 1), or `max + 1` as soon as it is certain to be more than `max`.
 */
export function damerauLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push(Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      let value = Math.min((rows[i - 1]?.[j] ?? 0) + 1, (rows[i]?.[j - 1] ?? 0) + 1, (rows[i - 1]?.[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
        value = Math.min(value, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      (rows[i] as number[])[j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
  }
  return Math.min(rows[a.length]?.[b.length] ?? max + 1, max + 1);
}

export interface TypoChange {
  from: string;
  to: string;
  /** In how many results the typed word is, and the suggested word is. */
  resultsWithFrom: number;
  resultsWithTo: number;
}

export interface TypoSuggestion {
  /** The search text with the replacements made; everything else is as it was typed. */
  text: string;
  changes: TypoChange[];
}

/** Lowercase, accents removed (kept apart from tokens.ts so the words shown to the person stay words). */
function fold(text: string): string {
  return text.toLowerCase().replace(/đ/g, "d").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces a whole word wherever it is not inside quotes, keeping a leading capital. */
function replaceWord(text: string, from: string, to: string): string {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(from)}(?![\\p{L}\\p{N}-])`, "giu");
  const capitalized = `${to.charAt(0).toUpperCase()}${to.slice(1)}`;
  // Splitting on a capture group puts the quoted parts at the odd positions, and they are left alone.
  return text
    .split(/("[^"]*")/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(pattern, (found) => (found.charAt(0) !== found.charAt(0).toLowerCase() ? capitalized : to))))
    .join("");
}

interface Entry {
  count: number;
  /** The words as written in the results that fall under this key, and how often. */
  surfaces: Map<string, number>;
}

/** How many results contain each word, by normalized key, over the title and abstract. */
function vocabulary(results: readonly Pick<Result, "title" | "abstract">[]): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  for (const result of results) {
    const seen = new Set<string>();
    for (const surface of fold(`${result.title} ${result.abstract ?? ""}`).split(/[^\p{L}]+/u)) {
      if (surface.length < MIN_LENGTH) continue;
      const key = normalizeWord(surface);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = entries.get(key) ?? { count: 0, surfaces: new Map<string, number>() };
      entry.count += 1;
      entry.surfaces.set(surface, (entry.surfaces.get(surface) ?? 0) + 1);
      entries.set(key, entry);
    }
  }
  return entries;
}

const mostCommon = (surfaces: Map<string, number>) =>
  [...surfaces].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "";

/**
 * A "Did you mean" for the search, or null. For each checkable word of the search that is in very few of the
 * results (no more than a tenth of them, and never fewer than 3 allowed), look for the word in the results that
 * is within 2 edits, starts with the same letter, is in at least 5 results and in at least 3 times as many as the
 * typed word (2 times for a word one edit away). Of those, the nearest wins, then the one in the most results, then the
 * first alphabetically. Words are compared as normalized keys, so "pendulums" counts for "pendulum".
 */
export function suggestTypos(query: ParsedQuery, results: readonly Pick<Result, "title" | "abstract">[]): TypoSuggestion | null {
  if (results.length === 0) return null;
  const words = wordsToCheck(query);
  if (words.length === 0) return null;

  const entries = vocabulary(results);
  const wordKeys = new Set(words.map((word) => normalizeWord(fold(word))));
  const veryFew = Math.max(VERY_FEW_AT_LEAST, Math.floor(results.length * VERY_FEW_SHARE));
  const changes: TypoChange[] = [];

  for (const word of words) {
    const key = normalizeWord(fold(word));
    const typed = entries.get(key)?.count ?? 0;
    if (typed > veryFew) continue;

    let best: { key: string; count: number; distance: number } | null = null;
    for (const [candidate, entry] of entries) {
      if (candidate === key || wordKeys.has(candidate) || candidate.charAt(0) !== key.charAt(0)) continue;
      if (entry.count < MIN_SUGGESTION_RESULTS) continue;
      const distance = damerauLevenshtein(key, candidate, MAX_TYPO_DISTANCE);
      if (distance > MAX_TYPO_DISTANCE) continue;
      const ratio = distance === 1 ? SUGGESTION_RATIO_ONE_EDIT : SUGGESTION_RATIO;
      if (entry.count < ratio * Math.max(typed, 1)) continue;
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && (entry.count > best.count || (entry.count === best.count && candidate < best.key)))
      ) {
        best = { key: candidate, count: entry.count, distance };
      }
    }
    if (best === null) continue;
    const to = mostCommon(entries.get(best.key)?.surfaces ?? new Map());
    if (to !== "") changes.push({ from: word, to, resultsWithFrom: typed, resultsWithTo: best.count });
  }
  if (changes.length === 0) return null;

  const text = changes.reduce((current, change) => replaceWord(current, change.from, change.to), query.original);
  return text === query.original ? null : { text, changes };
}
