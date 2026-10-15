import { coverageSpec } from "./coverage";
import type { ParsedQuery } from "./query";

// "Did you mean ...?": which words of a search a spell checker may be asked about, and how its answer
// becomes a suggestion. A suggestion is only ever offered as a link the person clicks. It is never applied
// by itself, and the text in the search box is never changed until the person chooses it.
//
// The spell checker (PubMed's ESpell, see providers/pubmed.ts) is built from biomedical vocabulary and
// sometimes "corrects" a word that is right (it turns "self" into "elf"). So a word is only replaced when
// almost no result contains it as written: a word that results do contain is not the one that is wrong.

/** A word that fewer results than this contain, as written, may be replaced by the spell checker's word. */
export const RARE_WORD_RESULTS = 3;

/** Shorter words are not looked at: they are mostly abbreviations, which no dictionary can judge. */
export const MIN_SPELLCHECK_LENGTH = 4;

/**
 * The words of the search a spell checker may be asked about, lowercase, each once, in order: a plain word
 * of letters. Not looked at: words inside quotes (they are searched as written), words with a hyphen or a
 * digit, words in a group of alternatives, words after NOT, all-capital abbreviations, and short words.
 */
export function wordsToSpellcheck(query: ParsedQuery): string[] {
  const words: string[] = [];
  for (const unit of coverageSpec(query).units) {
    const atoms = unit.alternatives.length === 1 ? unit.alternatives[0] : undefined;
    const only = atoms?.length === 1 ? atoms[0] : undefined;
    if (only === undefined || only.keys.length !== 1) continue;
    const word = only.text;
    if (!/^\p{L}+$/u.test(word) || word.length < MIN_SPELLCHECK_LENGTH || word === word.toUpperCase()) continue;
    const lower = word.toLowerCase();
    if (!words.includes(lower)) words.push(lower);
  }
  return words;
}

export interface SpellingChange {
  from: string;
  to: string;
}

export interface SpellingSuggestion {
  /** The search text with the replacements made; everything else is as it was typed. */
  text: string;
  changes: SpellingChange[];
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

/**
 * Turns the spell checker's answer for `words` into a suggested search text, or null when there is nothing to
 * suggest: no answer, an answer with a different number of words (it dropped or joined some), or no word that
 * both differs and is rare in the results (`isRare`).
 */
export function suggestSpelling(
  text: string,
  words: readonly string[],
  corrected: string | null,
  isRare: (word: string) => boolean,
): SpellingSuggestion | null {
  if (corrected === null || words.length === 0) return null;
  const answer = corrected.toLowerCase().split(/\s+/).filter((part) => part !== "");
  if (answer.length !== words.length) return null;

  const changes: SpellingChange[] = [];
  words.forEach((word, index) => {
    const to = answer[index] ?? word;
    if (to !== word && /^\p{L}+$/u.test(to) && isRare(word)) changes.push({ from: word, to });
  });
  if (changes.length === 0) return null;

  const next = changes.reduce((current, change) => replaceWord(current, change.from, change.to), text);
  return next === text ? null : { text: next, changes };
}
