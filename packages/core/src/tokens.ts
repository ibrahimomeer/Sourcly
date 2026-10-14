import { STOPWORDS } from "./stopwords";

// Turning text into comparable word tokens, for matching a query against a result.
// The same steps are applied to the query and to every result, so they always agree.

function removeDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * A deliberately light stemmer that folds plurals only:
 * memories -> memory, processes -> process, studies -> study, sleeps -> sleep.
 * It leaves words ending in "ss", "us" or "is" alone (stress, status, analysis).
 * It is not linguistically complete; its only job is to make the same word match
 * itself in singular and plural.
 */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("sses")) return word.slice(0, -2);
  if (word.length > 4 && /(?:ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Splits text into lowercase, accent-free, stemmed word tokens, dropping stopwords
 * and one-letter words. Numbers are kept.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of removeDiacritics(text).toLowerCase().replace(/['’]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    tokens.push(stem(raw));
  }
  return tokens;
}
