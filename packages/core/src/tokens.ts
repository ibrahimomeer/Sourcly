import { STOPWORDS } from "./stopwords";

// Turning text into comparable word tokens, for matching a query against a result.
// The same steps are applied to the query and to every result, so they always agree.

function removeDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Words ending in "s" that are already singular, which the plural rule would otherwise cut. */
const SINGULAR_IN_S: ReadonlySet<string> = new Set(["bias", "gas", "atlas", "canvas", "alias", "pancreas", "chaos", "cosmos", "ethos", "pathos", "kudos"]);

/** Plurals that common academic words form irregularly (analysis/analyses). */
const IRREGULAR_PLURALS: ReadonlyMap<string, string> = new Map([
  ["analyses", "analysis"],
  ["biases", "bias"],
  ["crises", "crisis"],
  ["diagnoses", "diagnosis"],
  ["hypotheses", "hypothesis"],
  ["prognoses", "prognosis"],
  ["syntheses", "synthesis"],
  ["theses", "thesis"],
]);

/**
 * A deliberately light stemmer that folds plurals only:
 * memories -> memory, processes -> process, studies -> study, sleeps -> sleep.
 * It leaves words ending in "ss", "us" or "is" alone (stress, status, analysis), knows a few
 * words that end in "s" in the singular (bias, gas) and a few irregular plurals
 * (analyses, hypotheses, biases). It is not linguistically complete; its only job is to
 * make the same word match itself in singular and plural.
 */
export function stem(word: string): string {
  const irregular = IRREGULAR_PLURALS.get(word);
  if (irregular !== undefined) return irregular;
  if (SINGULAR_IN_S.has(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("sses")) return word.slice(0, -2);
  if (word.length > 4 && /(?:ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** One word as it is compared: lowercase, accents and apostrophes removed, plural folded. Stopwords are kept. */
export function wordKey(word: string): string {
  return stem(removeDiacritics(word).toLowerCase().replace(/['’]/g, ""));
}

export interface TokenizeOptions {
  /**
   * "Search exactly as typed": keep stopwords and one-letter words, and do not stem. Lowercase,
   * accent-free words only.
   */
  exact?: boolean;
}

/**
 * Splits text into lowercase, accent-free, stemmed word tokens, dropping stopwords
 * and one-letter words. Numbers are kept. With `exact`, nothing is dropped or stemmed.
 */
export function tokenize(text: string, options: TokenizeOptions = {}): string[] {
  const tokens: string[] = [];
  for (const raw of removeDiacritics(text).toLowerCase().replace(/['’]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (raw === "") continue;
    if (options.exact === true) tokens.push(raw);
    else if (raw.length >= 2 && !STOPWORDS.has(raw)) tokens.push(stem(raw));
  }
  return tokens;
}

/**
 * Every word of a text as it is compared, stopwords and one-letter words included: lowercase, accents
 * and apostrophes removed, split at anything that is not a letter or digit, and (unless `exact`) with
 * plurals folded. Matching a phrase needs the common words, so none are dropped here.
 */
export function wordKeys(text: string, options: TokenizeOptions = {}): string[] {
  const keys: string[] = [];
  for (const raw of removeDiacritics(text).toLowerCase().replace(/['’]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (raw !== "") keys.push(options.exact === true ? raw : stem(raw));
  }
  return keys;
}
