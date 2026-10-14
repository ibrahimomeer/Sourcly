// Small, pure text helpers shared by the providers.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes the XML/HTML entities providers use: &amp; &lt; &#8211; &#x2013; and so on. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const key = body.toLowerCase();
    return Object.hasOwn(NAMED_ENTITIES, key) ? (NAMED_ENTITIES[key] ?? match) : match;
  });
}

const BLOCK_TAGS = /<\/?(?:[a-z]+:)?(?:p|br|div|li|ul|ol|h[1-6]|section|sec|title|tr|td|th|table)\b[^>]*>/gi;
const ANY_TAG = /<\/?[a-z][^>]*>/gi;

/**
 * Turns the HTML or JATS-XML snippets some providers return (titles with <i>,
 * abstracts in <jats:p>) into plain text. Block tags become spaces; inline tags
 * disappear, so "H<sub>2</sub>O" stays "H2O".
 */
export function stripMarkup(text: string | null | undefined): string {
  if (!text) return "";
  const withoutLabel = text.replace(/<(?:[a-z]+:)?title>\s*abstract\s*<\/(?:[a-z]+:)?title>/gi, " ");
  const plain = decodeEntities(withoutLabel.replace(BLOCK_TAGS, " ").replace(ANY_TAG, ""));
  return plain.replace(/\s+/g, " ").trim();
}

/** `stripMarkup`, but null instead of an empty string. */
export function plainTextOrNull(text: string | null | undefined): string | null {
  const plain = stripMarkup(text);
  return plain === "" ? null : plain;
}

/** The four-digit year at the start of a value such as 2024, "2024-06-03" or "2019 Oct"; otherwise null. */
export function parseYear(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})(?!\d)/.exec(text) ?? /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(text);
  const year = match?.[1] === undefined ? null : Number(match[1]);
  return year !== null && year >= 1000 && year <= 2999 ? year : null;
}

// ISO 639-2 (three-letter) codes that providers use, mapped to ISO 639-1. Codes not
// listed here become null rather than being guessed.
const LANGUAGES: Record<string, string> = {
  eng: "en", fre: "fr", fra: "fr", ger: "de", deu: "de", spa: "es", ita: "it", por: "pt", rus: "ru",
  chi: "zh", zho: "zh", jpn: "ja", kor: "ko", dut: "nl", nld: "nl", swe: "sv", dan: "da", nor: "no",
  fin: "fi", pol: "pl", cze: "cs", ces: "cs", tur: "tr", ara: "ar", heb: "he", hun: "hu", gre: "el",
  ell: "el", ukr: "uk", vie: "vi", ind: "id", hrv: "hr", rum: "ro", ron: "ro", cat: "ca", per: "fa", fas: "fa",
};

/** A two- or three-letter language code as ISO 639-1 (two letters, lowercase), or null. */
export function toLanguageCode(code: string | null | undefined): string | null {
  const lower = code?.trim().toLowerCase() ?? "";
  if (/^[a-z]{2}$/.test(lower)) return lower;
  return Object.hasOwn(LANGUAGES, lower) ? (LANGUAGES[lower] ?? null) : null;
}
