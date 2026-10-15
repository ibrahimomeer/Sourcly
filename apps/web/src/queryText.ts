import { hardBlocks, isUsableConcepts, parseConcepts, parseQuery, type ConceptOptions, type ConceptQuery } from "@sourcly/core";

export interface PreparedSearch {
  concepts: ConceptQuery;
  /** Whether there is anything to search for. */
  usable: boolean;
}

/**
 * Reads the text of the search box as concepts. The text itself is never changed: a question such as "how do
 * vaccines train the immune system?" is read as concepts by leaving out common words and generic verbs (fixed lists,
 * no guessing); the reading is shown, collapsed, under “How we searched”.
 */
export function prepareSearch(text: string, options: ConceptOptions = {}): PreparedSearch {
  const concepts = parseConcepts(text.trim(), options);
  return { concepts, usable: isUsableConcepts(concepts) };
}

/** Why a query cannot be searched, in plain words. */
export function explainUnusable(concepts: ConceptQuery): string {
  if (hardBlocks(concepts).length === 0 && concepts.stopwords.length > 0) {
    return `Everything in “${concepts.original}” is a common word that searches leave out (${[...new Set(concepts.stopwords)].join(", ")}). Add a more specific word, or turn on “Search exactly as typed” in Settings.`;
  }
  if (concepts.blocks.length === 0 && concepts.exclusions.length > 0) {
    return "A search needs at least one word to look for, not only words to leave out.";
  }
  return "Type some words to search for.";
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
