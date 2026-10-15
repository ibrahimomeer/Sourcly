import { isCheckTag } from "./checktags";
import { tokenize } from "./tokens";
import type { Result, SubjectKind } from "./types";

export interface RelatedTerm {
  /** The term as the source wrote it (first spelling seen). */
  term: string;
  /** How many of the results carry this term. */
  count: number;
  /** Which kinds of term it appeared as. */
  kinds: SubjectKind[];
}

/** Only these kinds are controlled vocabularies, so only they make reliable suggestions. */
const SUGGESTED_KINDS: readonly SubjectKind[] = ["topic", "mesh"];
const MAX_TERM_LENGTH = 60;

/**
 * Terms to suggest for narrowing or widening a search, taken from the topics OpenAlex gave
 * and the MeSH headings PubMed and Europe PMC gave to the results passed in (pass the top
 * ones). A term's score is simply how many of those results carry it. Terms whose every
 * word is already in the query are left out, and so are MeSH check tags such as "Humans" or
 * "Male" (see checktags.ts). Nothing is added to the query automatically: these are
 * suggestions to click.
 *
 * Free-text keywords are not used: they are inconsistent (some are whole sentences).
 */
export function relatedTerms(
  results: readonly Result[],
  queryTerms: readonly string[],
  options: { limit?: number } = {},
): RelatedTerm[] {
  const limit = options.limit ?? 12;
  const queryTokens = new Set(queryTerms.flatMap((term) => tokenize(term)));
  const found = new Map<string, { term: string; count: number; kinds: Set<SubjectKind> }>();

  for (const result of results) {
    const seenHere = new Set<string>();
    for (const subject of result.subjects) {
      if (!SUGGESTED_KINDS.includes(subject.kind) || subject.term.length > MAX_TERM_LENGTH) continue;
      if (subject.kind === "mesh" && isCheckTag(subject.term)) continue;
      const key = subject.term.toLowerCase();
      if (seenHere.has(key)) {
        found.get(key)?.kinds.add(subject.kind);
        continue;
      }
      seenHere.add(key);
      const entry = found.get(key) ?? { term: subject.term, count: 0, kinds: new Set<SubjectKind>() };
      entry.count += 1;
      entry.kinds.add(subject.kind);
      found.set(key, entry);
    }
  }

  return [...found.values()]
    .filter(({ term }) => {
      const tokens = tokenize(term);
      return tokens.length > 0 && !tokens.every((token) => queryTokens.has(token));
    })
    .sort((a, b) => b.count - a.count || (a.term.toLowerCase() < b.term.toLowerCase() ? -1 : a.term.toLowerCase() > b.term.toLowerCase() ? 1 : 0))
    .slice(0, limit)
    .map(({ term, count, kinds }) => ({ term, count, kinds: [...kinds].sort() }));
}
