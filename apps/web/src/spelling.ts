import { RARE_WORD_RESULTS, suggestSpelling, wordsToSpellcheck, type SpellingSuggestion } from "@sourcly/core";
import { hasFewFullMatches, termResultCounts, type RankedView } from "./pipeline";
import type { SearchState } from "./searchState";

// When to ask a spell checker, and what to do with its answer. Asking is rare on purpose: only after a
// search that found few results containing every word, only about words almost no result contains, and
// only when PubMed was one of the sources asked (so the words have already been sent there).

/**
 * The words of the finished search to ask PubMed's spell checker about, or none. A word that results contain
 * is not asked about: it is not the one that is wrong.
 */
export function wordsToAsk(search: SearchState, ranked: RankedView | null): string[] {
  if (search.phase !== "done" || ranked === null || !search.order.includes("pubmed")) return [];
  if (!hasFewFullMatches(ranked)) return [];
  const counts = termResultCounts(ranked);
  return wordsToSpellcheck(search.parsed).filter((word) => (counts.get(word) ?? 0) < RARE_WORD_RESULTS);
}

/** The suggested search text for the text that was searched, from the spell checker's answer for `words`. */
export function suggestionFor(search: SearchState, words: readonly string[], corrected: string | null): SpellingSuggestion | null {
  if (search.phase === "idle") return null;
  return suggestSpelling(search.parsed.original, words, corrected, () => true);
}
