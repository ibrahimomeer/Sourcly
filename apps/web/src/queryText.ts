import { formatQuery, isUsable, parseQuery, queryTerms, type ParsedQuery } from "@sourcly/core";

export interface PreparedSearch {
  parsed: ParsedQuery;
  /** Whether there is anything to search for. */
  usable: boolean;
  /** What the search box should hold afterwards: the tidy query if common words were removed, otherwise what was typed. */
  box: string;
}

/**
 * Reads the text of the search box. A question such as "what is the effect of sleep on memory?"
 * is reduced to its keywords by removing common words (a fixed list, no guessing), and the box
 * is then filled with those keywords so the person can see and edit exactly what was searched.
 */
export function prepareSearch(text: string): PreparedSearch {
  const trimmed = text.trim();
  const parsed = parseQuery(trimmed);
  const usable = isUsable(parsed);
  return { parsed, usable, box: usable && parsed.droppedStopwords.length > 0 ? formatQuery(parsed) : trimmed };
}

/** Why a query cannot be searched, in plain words. */
export function explainUnusable(parsed: ParsedQuery): string {
  if (parsed.droppedStopwords.length > 0 && parsed.root === null) {
    return `Everything in “${parsed.original}” is a common word that searches leave out (${[...new Set(parsed.droppedStopwords)].join(", ")}). Add a more specific word.`;
  }
  if (parsed.root !== null && queryTerms(parsed).length === 0) {
    return "A search needs at least one word to look for, not only words to leave out.";
  }
  return "Type some words to search for.";
}

/** "Common words" as a short list for display: each once, in the order they appeared. */
export function droppedWords(parsed: ParsedQuery): string[] {
  return [...new Set(parsed.droppedStopwords)];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Adds a suggested term to the text in the search box, as one more thing the results must
 * match (AND). A term of several words is put in quotes so it stays together. If the box
 * already has a top-level OR, the existing query is wrapped in parentheses first so the new
 * term narrows all of it. Adding a term that is already there changes nothing.
 */
export function addTermToQuery(text: string, term: string): string {
  const clean = term.replace(/"/g, "").replace(/\s+/g, " ").trim();
  if (clean === "") return text;
  const addition = clean.includes(" ") ? `"${clean}"` : clean;
  const trimmed = text.trim();
  if (trimmed === "") return addition;

  const present = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(clean)}(?![\\p{L}\\p{N}])`, "iu");
  if (present.test(trimmed)) return trimmed;

  const base = parseQuery(trimmed).root?.type === "or" ? `(${trimmed})` : trimmed;
  return `${base} ${addition}`;
}
