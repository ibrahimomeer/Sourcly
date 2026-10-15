import type { Result } from "./types";

// The language of a result, as the sources report it. Nothing here guesses a language: a result
// whose sources gave none is "unknown", and it is shown and filtered as such.

/** The value used for a result that no source gave a language for. */
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

/** The code a result is filtered by: its language, or "unknown". */
export function languageOf(result: Pick<Result, "language">): string {
  return result.language ?? UNKNOWN_LANGUAGE;
}

export interface LanguageCount {
  /** An ISO 639-1 code, or "unknown". */
  code: string;
  name: string;
  count: number;
}

/**
 * How many of the results are in each language, most first (ties by name), with "unknown" last. A language
 * in `keep` is listed even when no result has it, so a language that was chosen never disappears from view.
 */
export function countLanguages(results: readonly Pick<Result, "language">[], keep: readonly string[] = []): LanguageCount[] {
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
