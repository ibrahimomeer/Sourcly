import { STOPWORDS } from "./stopwords";

// Turning text into comparable word tokens, for matching a query against a result.
// The same steps are applied to the query and to every result, so they always agree.

function removeDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Words ending in "s" (or "ies") that are already singular, which the plural rule would otherwise cut. */
const SINGULAR_IN_S: ReadonlySet<string> = new Set([
  "bias", "gas", "atlas", "canvas", "alias", "pancreas", "chaos", "cosmos", "ethos", "pathos", "kudos", "series", "species", "news",
]);

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

/** A doubled final consonant that comes from adding -ing or -ed (running -> run), but not one that belongs to the word (falling -> fall). */
function undouble(stem: string): string {
  const last = stem.charAt(stem.length - 1);
  return stem.length >= 2 && stem.charAt(stem.length - 2) === last && /[bdgmnprt]/.test(last) ? stem.slice(0, -1) : stem;
}

/**
 * How a word is compared, deliberately conservative so two different words are not made one:
 * - a word under 5 letters is left exactly as it is ("caos" is not "cao", "cats" is not "cat");
 * - a plural -s or -es is removed (memories -> memory, processes -> process, models -> model), except
 *   for -ss, -us and -is endings and a few words that are singular (chaos, bias, series);
 * - -ing and -ed are removed only from a word of 6 or more letters, and only when 4 or more letters
 *   remain (sleeping -> sleep, learned -> learn, but "string", "during" and "making" are left alone).
 * Nothing else changes: "prediction" stays "prediction". The same steps are applied to the query and to
 * every result, so they always agree. It is not a stemmer: synonyms and other word forms do not match.
 */
export function normalizeWord(word: string): string {
  const irregular = IRREGULAR_PLURALS.get(word);
  if (irregular !== undefined) return irregular;
  if (word.length < 5 || SINGULAR_IN_S.has(word)) return word;

  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:sses|shes|ches|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return /(?:ss|us|is)$/.test(word) ? word : word.slice(0, -1);

  if (word.length >= 6 && word.endsWith("ied") && word.length - 3 >= 3) return `${word.slice(0, -3)}y`;
  if (word.length >= 6 && word.endsWith("ing") && word.length - 3 >= 4) return undouble(word.slice(0, -3));
  if (word.length >= 6 && word.endsWith("ed") && word.length - 2 >= 4) return undouble(word.slice(0, -2));
  return word;
}

/** One word as it is compared: lowercase, accents and apostrophes removed, normalized (see normalizeWord). Stopwords are kept. */
export function wordKey(word: string): string {
  return normalizeWord(removeDiacritics(word).toLowerCase().replace(/['’]/g, ""));
}

export interface TokenizeOptions {
  /**
   * "Search exactly as typed": keep stopwords and one-letter words, and do not normalize. Lowercase,
   * accent-free words only.
   */
  exact?: boolean;
}

/**
 * Splits text into lowercase, accent-free, normalized word tokens, dropping stopwords
 * and one-letter words. Numbers are kept. With `exact`, nothing is dropped or normalized.
 */
export function tokenize(text: string, options: TokenizeOptions = {}): string[] {
  const tokens: string[] = [];
  for (const raw of removeDiacritics(text).toLowerCase().replace(/['’]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (raw === "") continue;
    if (options.exact === true) tokens.push(raw);
    else if (raw.length >= 2 && !STOPWORDS.has(raw)) tokens.push(normalizeWord(raw));
  }
  return tokens;
}

/**
 * Every word of a text as it is compared, stopwords and one-letter words included: lowercase, accents
 * and apostrophes removed, split at anything that is not a letter or digit, and (unless `exact`)
 * normalized (see normalizeWord). Matching a phrase needs the common words, so none are dropped here.
 */
export function wordKeys(text: string, options: TokenizeOptions = {}): string[] {
  const keys: string[] = [];
  for (const raw of removeDiacritics(text).toLowerCase().replace(/['’]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (raw !== "") keys.push(options.exact === true ? raw : normalizeWord(raw));
  }
  return keys;
}
