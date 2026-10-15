import type { Result } from "./types";

// The language of a result. A source's own language field is not trusted by itself (OpenAlex labelled a
// Vietnamese-titled paper "English"), so the language is also detected from the title and abstract by
// rules that can be read in full below: the script the text is written in, then, for the Latin alphabet,
// small lists of common words and a few letters that belong to one language. No model, nothing learned:
// the same text always gives the same answer. It is a heuristic, and its limits are in docs/methodology.md.

/** The value used for a result whose language could not be found. */
export const UNKNOWN_LANGUAGE = "unknown";

let displayNames: Intl.DisplayNames | null | undefined;

function namesInEnglish(): Intl.DisplayNames | null {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      displayNames = null;
    }
  }
  return displayNames;
}

/** "pt" is "Portuguese"; a code the runtime does not know is shown as the code in capitals; no language is "unknown". */
export function languageName(code: string | null): string {
  if (code === null || code === UNKNOWN_LANGUAGE) return UNKNOWN_LANGUAGE;
  try {
    const name = namesInEnglish()?.of(code);
    if (name !== undefined && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch {
    // An invalid code: fall through to showing it as given.
  }
  return code.toUpperCase();
}

// ---- Detecting a language from text

/** Common words of each Latin-alphabet language, lowercase, accents removed. A word shared by several lists counts 1, a word of one list counts 2. */
const WORDS: Readonly<Record<string, string>> = {
  en: "the of and in to for with on by is are from at as an a this that which these those using based via between into their its be was were has have been can not or it we our new study analysis results during than also both more most other such",
  es: "de la el en y los las del se por un una con para es que como al lo mas su sus entre sobre desde este esta estos estas son ser fue ha han hacia durante segun sin pero cuando donde tambien muy uno otros otras a",
  pt: "de a o os as do da dos das em no na nos nas um uma uns umas com para por que e ao aos como mais seu sua seus suas entre sobre desde este esta estes estas sao ser foi tem ter durante segundo sem mas quando onde tambem muito nao",
  fr: "le la les de des du un une et en dans pour par sur avec au aux ce cette ces est sont qui que ne pas plus sa son ses leur leurs entre sous comme ou mais aussi etre fait cet",
  de: "der die das und in den von zu mit fur auf ist im dem des ein eine einer eines nicht sich auch als an bei nach aus uber durch wird werden oder wie dieser diese dieses zur zum am es sind",
  it: "il lo la le gli i di del della dei delle degli e in un una per con su da che non sono come piu anche tra fra alla alle al nel nella nei nelle sul sulla questo questa a",
  vi: "va cac nhung mot cho trong voi la duoc co tu khi nay da den bang nhu cung de ve khong cua",
  tr: "ve bir bu icin ile de da ki olarak olan daha gibi en cok sonra veya ama ise ya kadar uzerinde arasinda tarafindan degil her",
};

/** Letters that mark one language (each occurrence counts 3): Vietnamese tone marks and đ ơ ư ă, Turkish ğ ş ı İ, Spanish ñ ¿ ¡, Portuguese ã õ, German ß, French œ. */
const MARKS: Readonly<Record<string, RegExp>> = {
  vi: /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gu,
  tr: /[ğşıİ]/gu,
  es: /[ñ¿¡]/gu,
  pt: /[ãõ]/gu,
  de: /[ß]/gu,
  fr: /[œ]/gu,
};

const LATIN_LANGUAGES = Object.keys(WORDS);
const MARK_SCORE = 3;
/** The least evidence worth acting on, and how far ahead of the next language the best must be. */
const MIN_SCORE = 3;
const MIN_MARGIN = 2;
/** The text read for detection: a title and the start of an abstract. */
const MAX_CHARS = 1500;

const WORD_WEIGHT: ReadonlyMap<string, Map<string, number>> = (() => {
  const owners = new Map<string, number>();
  for (const list of Object.values(WORDS)) for (const word of new Set(list.split(" "))) owners.set(word, (owners.get(word) ?? 0) + 1);
  const weights = new Map<string, Map<string, number>>();
  for (const [language, list] of Object.entries(WORDS)) {
    weights.set(language, new Map([...new Set(list.split(" "))].map((word) => [word, owners.get(word) === 1 ? 2 : 1] as const)));
  }
  return weights;
})();

/** Scripts that name a language by themselves: kana is Japanese, hangul Korean, Greek, Arabic, Hebrew, Thai and Devanagari (Hindi). Han without kana is Chinese, Cyrillic is reported as Russian. */
const SCRIPTS: readonly { code: string; test: RegExp; share: number }[] = [
  { code: "ja", test: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu, share: 0.1 },
  { code: "ko", test: /\p{Script=Hangul}/gu, share: 0.3 },
  { code: "zh", test: /\p{Script=Han}/gu, share: 0.3 },
  { code: "ru", test: /\p{Script=Cyrillic}/gu, share: 0.5 },
  { code: "el", test: /\p{Script=Greek}/gu, share: 0.5 },
  { code: "ar", test: /\p{Script=Arabic}/gu, share: 0.5 },
  { code: "he", test: /\p{Script=Hebrew}/gu, share: 0.5 },
  { code: "th", test: /\p{Script=Thai}/gu, share: 0.5 },
  { code: "hi", test: /\p{Script=Devanagari}/gu, share: 0.5 },
];

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** Lowercase, with accents removed except where the accent marks a language (those are counted on the original text). */
function foldForWords(text: string): string {
  return text.toLowerCase().replace(/đ/g, "d").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
}

/**
 * The language a text is written in, or null when the evidence is too thin or too even to say.
 * Script first (Chinese, Japanese, Korean, Russian, Greek, Arabic, Hebrew, Thai, Hindi); then, for Latin
 * letters, the language whose common words and marking letters score highest, if it is clearly ahead.
 */
export function detectLanguage(text: string): string | null {
  const sample = text.slice(0, MAX_CHARS);
  const letters = count(sample, /\p{L}/gu);
  if (letters === 0) return null;

  // Japanese is written with kana among Han characters, so a little kana is enough to tell it from Chinese.
  for (const { code, test, share } of SCRIPTS) {
    if (code === "zh" && count(sample, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu) > 0) continue;
    if (count(sample, test) / letters >= share) return code;
  }
  if (count(sample, /\p{Script=Latin}/gu) / letters < 0.5) return null;

  const scores = new Map<string, number>();
  const words = foldForWords(sample).split(/[^\p{L}]+/u).filter((word) => word !== "");
  for (const language of LATIN_LANGUAGES) {
    let score = 0;
    const weights = WORD_WEIGHT.get(language);
    for (const word of words) score += weights?.get(word) ?? 0;
    const marks = MARKS[language];
    if (marks !== undefined) score += MARK_SCORE * count(sample.toLowerCase(), marks);
    scores.set(language, score);
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const [best, second] = [ranked[0], ranked[1]];
  if (best === undefined || best[1] < MIN_SCORE || best[1] - (second?.[1] ?? 0) < MIN_MARGIN) return null;
  return best[0];
}

// ---- The language of a result: detected, reported by the source, or unclear

export interface LanguageInfo {
  /** The language the result is placed by: the detected one when there is one, otherwise the source's. Null when neither. */
  code: string | null;
  /** What the text says, or null when it could not be told. */
  detected: string | null;
  /** What the sources said (an ISO 639-1 code), or null. */
  reported: string | null;
  /**
   * "detected": the text says it (the source agrees or said nothing); "reported": the text could not be
   * told and the source's word is used; "unclear": the text and the source disagree (the text wins for placing
   * the result); "unknown": neither says anything.
   */
  status: "detected" | "reported" | "unclear" | "unknown";
}

const cache = new WeakMap<object, LanguageInfo>();

export function resolveLanguage(result: Pick<Result, "title" | "abstract" | "language">): LanguageInfo {
  const known = cache.get(result);
  if (known !== undefined) return known;
  const detected = detectLanguage(`${result.title} ${result.abstract ?? ""}`);
  const reported = result.language;
  const info: LanguageInfo =
    detected !== null && reported !== null && detected !== reported
      ? { code: detected, detected, reported, status: "unclear" }
      : detected !== null
        ? { code: detected, detected, reported, status: "detected" }
        : reported !== null
          ? { code: reported, detected, reported, status: "reported" }
          : { code: null, detected, reported, status: "unknown" };
  cache.set(result, info);
  return info;
}

/** The language shown on a card: "Language: English (detected)", "Language: unclear", and so on. */
export function languageBadge(info: LanguageInfo): string {
  switch (info.status) {
    case "detected":
      return `Language: ${languageName(info.code)} (detected)`;
    case "reported":
      return `Language: ${languageName(info.code)} (from the source)`;
    case "unclear":
      return "Language unclear";
    case "unknown":
      return "Language: unknown";
  }
}

/** Why the badge says what it says, for its tooltip. */
export function languageExplanation(info: LanguageInfo): string {
  switch (info.status) {
    case "detected":
      return "Worked out from the words of the title and abstract (a heuristic, see the methodology page).";
    case "reported":
      return "The text was too short or too mixed to tell, so the language the source gave is used.";
    case "unclear":
      return `The text looks ${languageName(info.detected)} but the source says ${languageName(info.reported)}. The result is placed by what the text looks like.`;
    case "unknown":
      return "The text was too short to tell and no source gave a language.";
  }
}

export interface LanguageCount {
  /** An ISO 639-1 code, or "unknown". */
  code: string;
  name: string;
  count: number;
}

/** The language a result is placed by, or "unknown". */
export function languageOf(result: Pick<Result, "title" | "abstract" | "language">): string {
  return resolveLanguage(result).code ?? UNKNOWN_LANGUAGE;
}

/**
 * How many of the results are in each language, most first (ties by name), with "unknown" last. A language
 * in `keep` is listed even when no result has it, so a language that was chosen never disappears from view.
 */
export function countLanguages(results: readonly Pick<Result, "title" | "abstract" | "language">[], keep: readonly string[] = []): LanguageCount[] {
  const counts = new Map<string, number>();
  for (const result of results) counts.set(languageOf(result), (counts.get(languageOf(result)) ?? 0) + 1);
  for (const code of keep) if (!counts.has(code)) counts.set(code, 0);

  return [...counts]
    .map(([code, count]) => ({ code, name: languageName(code), count }))
    .sort((a, b) => {
      if ((a.code === UNKNOWN_LANGUAGE) !== (b.code === UNKNOWN_LANGUAGE)) return a.code === UNKNOWN_LANGUAGE ? 1 : -1;
      if (a.count !== b.count) return b.count - a.count;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
}
