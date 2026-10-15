import { isCheckTag } from "./checktags";
import type { ConceptQuery } from "./concepts";
import { tokenize } from "./tokens";
import type { Result } from "./types";

// Suggested terms: words to add to the search, taken from how the best results describe themselves. Only the terms
// the authors chose (author keywords) and the headings indexers chose from a controlled vocabulary (MeSH) are used,
// never the algorithmic topic tags of OpenAlex. A term has to appear in at least three of the top results: a term
// that one paper has is that paper's, not the field's. Nothing is added to the search by itself; each is a click.

/** The best results looked at. */
export const SUGGESTION_POOL = 30;
/** A term must be carried by at least this many of those results (a term seen once or twice is never suggested). */
export const SUGGESTION_MIN_RESULTS = 3;
/** At most this many terms are suggested. */
export const SUGGESTION_MAX_TERMS = 8;
/** Fewer suggestions than this are not shown at all. */
export const SUGGESTION_MIN_SHOWN = 3;
const MAX_TERM_LENGTH = 60;

export interface SuggestedTerm {
  /** The term as the source wrote it (the first spelling seen). */
  term: string;
  /** How many of the top results carry it. */
  count: number;
  kinds: ("keyword" | "mesh")[];
}

/**
 * The words the query already covers: its typed words, every variant of every concept, the soft terms.
 * A suggestion made only of such words would add nothing.
 */
function coveredTokens(query: ConceptQuery): Set<string> {
  const covered = new Set<string>();
  const add = (text: string) => {
    for (const token of tokenize(text)) covered.add(token);
  };
  for (const block of query.blocks) {
    add(block.label);
    for (const variant of block.variants) add(variant.text);
  }
  for (const soft of query.soft) add(soft.text);
  return covered;
}

/**
 * Terms for narrowing or widening a search, from the author keywords and MeSH headings of the `results` passed in
 * (best first; only the first 30 are read). Returns [] when fewer than 3 terms qualify, so a thin list is never shown.
 * Ties are broken alphabetically, so the order never changes between runs.
 */
export function suggestedTerms(results: readonly Result[], query: ConceptQuery): SuggestedTerm[] {
  const covered = coveredTokens(query);
  const found = new Map<string, { term: string; count: number; kinds: Set<"keyword" | "mesh"> }>();

  for (const result of results.slice(0, SUGGESTION_POOL)) {
    const seenHere = new Set<string>();
    for (const subject of result.subjects) {
      const isKeyword = subject.kind === "keyword" && subject.provider !== "openalex";
      if (!isKeyword && subject.kind !== "mesh") continue;
      const term = subject.term.trim();
      if (term === "" || term.length > MAX_TERM_LENGTH) continue;
      if (subject.kind === "mesh" && isCheckTag(term)) continue;
      const key = tokenize(term).join(" ");
      if (key === "" || seenHere.has(key)) {
        if (key !== "") found.get(key)?.kinds.add(subject.kind === "mesh" ? "mesh" : "keyword");
        continue;
      }
      seenHere.add(key);
      const entry = found.get(key) ?? { term, count: 0, kinds: new Set<"keyword" | "mesh">() };
      entry.count += 1;
      entry.kinds.add(subject.kind === "mesh" ? "mesh" : "keyword");
      found.set(key, entry);
    }
  }

  const suggestions = [...found.entries()]
    .filter(([key, entry]) => entry.count >= SUGGESTION_MIN_RESULTS && !key.split(" ").every((token) => covered.has(token)))
    .sort(([, a], [, b]) => b.count - a.count || (a.term.toLowerCase() < b.term.toLowerCase() ? -1 : a.term.toLowerCase() > b.term.toLowerCase() ? 1 : 0))
    .slice(0, SUGGESTION_MAX_TERMS)
    .map(([, { term, count, kinds }]): SuggestedTerm => ({ term, count, kinds: [...kinds].sort() }));
  return suggestions.length >= SUGGESTION_MIN_SHOWN ? suggestions : [];
}
