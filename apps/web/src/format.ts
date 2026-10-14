import type { Author, Label, PeerReviewStatus, SourceLevel } from "@sourcly/core";

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
