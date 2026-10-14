import { stripMarkup } from "./text";

/**
 * Records that are notices about another article rather than research themselves. They are
 * recognised by the way the title begins, because that is what publishers do (checked on
 * Crossref and OpenAlex records on 2026-10-14: "Retraction: ...", "Retraction—...",
 * "Corrigendum to ...", "Erratum: ...", "Correction: ...", "Author Correction", "Withdrawn: ...",
 * "Expression of concern for ..."). A provider's own type is not used: OpenAlex's "erratum" type
 * also covers research papers with "correction" in the title.
 *
 * A retracted article itself ("RETRACTED ARTICLE: ...") is not a notice; it is flagged
 * through `Result.retraction` instead.
 */
export type NoticeKind = "retraction-notice" | "correction-notice" | "expression-of-concern";

export const NOTICE_LABELS: Record<NoticeKind, string> = {
  "retraction-notice": "Retraction notice",
  "correction-notice": "Correction notice",
  "expression-of-concern": "Expression of concern",
};

const DASH = "[:—–-]";

// "Retraction of axons ..." and "Correction of flux measurements ..." are ordinary titles, so a
// notice must have a separator after the word, or "to" followed by a separator or quote.
const RULES: readonly { kind: NoticeKind; pattern: RegExp }[] = [
  {
    kind: "retraction-notice",
    pattern: new RegExp(
      `^(?:notice of\\s+)?(?:retraction|withdrawal)(?:\\s+(?:notice|note|statement|and republication))?\\s*(?:${DASH}|$)`,
      "i",
    ),
  },
  { kind: "retraction-notice", pattern: new RegExp(`^withdrawn\\s*${DASH}`, "i") },
  { kind: "expression-of-concern", pattern: /^(?:editorial\s+)?expression of concern\b/i },
  { kind: "correction-notice", pattern: /^(?:erratum|errata|corrigendum|corrigenda)\b/i },
  {
    kind: "correction-notice",
    pattern: new RegExp(
      `^(?:(?:author|publisher|editorial)\\s+)?corrections?(?:\\s+(?:note|notice))?(?:\\s+to)?\\s*(?:${DASH}|[“"‘']|$)`,
      "i",
    ),
  },
];

/** The kind of notice a record is, or null when it is not one (the usual case). */
export function noticeKind(result: { title: string }): NoticeKind | null {
  const title = stripMarkup(result.title).replace(/^[\s[("“‘'*]+/, "");
  return RULES.find((rule) => rule.pattern.test(title))?.kind ?? null;
}
