import { languageName, type Author, type Label, type LexiconMatch, type OpenAccessInfo, type PeerReviewStatus, type Result, type SourceLevel, type TermMatching } from "@sourcly/core";

const MAX_AUTHORS_SHOWN = 6;

/** "A, B, C" for a short list, or the first few plus how many were left out. */
export function formatAuthors(authors: readonly Author[]): string {
  if (authors.length === 0) return "No authors listed";
  const names = authors.slice(0, MAX_AUTHORS_SHOWN).map((author) => author.name);
  const more = authors.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}

/**
 * How a label is worded to the reader. Rule-based labels are always "likely"
 * (they are heuristics); "unknown" stays "unknown"; a user's choice is
 * stated as theirs.
 */
export function labelText(label: Label<SourceLevel | PeerReviewStatus>): string {
  // "not-peer-reviewed" reads as "not peer-reviewed"; "peer-reviewed" keeps its hyphen.
  const value = label.value.replace(/^not-/, "not ");
  if (label.origin === "user") return `${value} (set by you)`;
  return label.value === "unknown" ? "unknown" : `likely ${value}`;
}

/**
 * The access badge on a card: plain text, never a reason to hide or demote a
 * result. "try UBC Library" appears only when the card really has that link.
 */
export function accessBadgeText(openAccess: OpenAccessInfo, hasLibraryLink: boolean): string {
  const suffix = hasLibraryLink ? ", try UBC Library" : "";
  if (openAccess.isOpen === true) {
    return openAccess.status === "unknown" ? "Open access" : `Open access (${openAccess.status})`;
  }
  if (openAccess.isOpen === false) return `Not open access${suffix}`;
  return `Open access status unknown${suffix}`;
}

/** A label value as a short name, e.g. "not-peer-reviewed" -> "Not peer-reviewed". */
export function valueName(value: string): string {
  const spaced = value.replace(/^not-/, "not ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A raw factor value for display: integers as-is, other numbers to 2 decimals. */
export function formatRaw(raw: number | string | null): string {
  if (raw === null) return "none";
  if (typeof raw === "string") return raw;
  return Number.isInteger(raw) ? String(raw) : raw.toFixed(2);
}

/** Scores and normalized values, to a fixed number of decimals. */
export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/** "1 result" / "2 results". */
export function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * The badge for a review article: "Review", or the source's own wording when it is more specific
 * ("Systematic Review", "Meta-Analysis"). Null for anything that is not a review.
 */
export function reviewBadgeText(result: Pick<Result, "type" | "rawType">): string | null {
  if (result.type !== "review") return null;
  const raw = result.rawType?.value.trim() ?? "";
  if (raw === "" || /^review([- ]article)?$/i.test(raw)) return "Review";
  return /review|meta-?analys/i.test(raw) ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Review";
}

/** "limitation (title), bias (abstract)": which terms a result matched and where. */
export function describeLexiconMatches(matches: readonly LexiconMatch[]): string {
  return matches.map((match) => `${match.term} (${match.fields.join(" and ")})`).join(", ");
}

/** The language badge on a card: "Language: English" or "Language: unknown". */
export function languageBadgeText(code: string | null): string {
  return `Language: ${languageName(code)}`;
}

/**
 * The note shown when few results contain every word of the search. Under "Require all terms" it names the
 * setting that would let the others in; under the other settings they already are in, so it does not.
 */
export function fewResultsMessage(termMatching: TermMatching): string {
  return termMatching === "all"
    ? "Few results match all your words. Check spelling, try synonyms, or loosen the term matching setting."
    : "Few results match all your words. Check spelling or try synonyms.";
}

/** How the list below is ordered, for the line under the results heading. */
export function describeOrder(termMatching: TermMatching): string {
  if (termMatching === "coverage") {
    return "Results with every term come first, then those with most terms, then those with few; inside each group they are sorted by score.";
  }
  if (termMatching === "ignore") return "Sorted by score alone; how many of your terms a result contains does not decide the order.";
  return "Sorted by score.";
}
