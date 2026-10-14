import { scoreBm25 } from "./bm25";
import { tokenize } from "./tokens";
import type { Result } from "./types";

/**
 * The text a result is matched against: its title, abstract and descriptive terms
 * (topics, keywords, MeSH headings). Nothing else, so the match can be explained.
 */
export function documentText(result: Result): string {
  return [result.title, result.abstract ?? "", ...result.subjects.map((subject) => subject.term)].join(" ");
}

export interface RelevanceReading {
  /** The BM25 score, or null when the query has no searchable words. */
  raw: number | null;
  /** 0..1 (the score divided by the best score in the set), or null when relevance cannot be measured. */
  normalized: number | null;
  /** One or two sentences saying how the score came about. */
  detail: string;
}

/**
 * Scores every result against the query with BM25 and normalizes to 0..1 by dividing by
 * the best score in the set, so the best match is 1. The set is the merged results that
 * were fetched, so a rare word counts for more and a long abstract is discounted against a
 * short one (see bm25.ts). Phrases and OR are not enforced here: the words of the query
 * are matched wherever they appear.
 */
export function relevanceReadings(results: readonly Result[], queryTerms: readonly string[]): RelevanceReading[] {
  const queryTokens = [...new Set(queryTerms.flatMap(tokenize))];
  if (queryTokens.length === 0) {
    return results.map(() => ({
      raw: null,
      normalized: null,
      detail: "The query has no searchable words, so relevance cannot be measured and it scores neutral (0.5)",
    }));
  }

  const bm25 = scoreBm25(results.map((result) => tokenize(documentText(result))), queryTokens);
  return results.map((_, index) => {
    const raw = bm25.scores[index] ?? 0;
    if (raw === 0) {
      return {
        raw,
        normalized: 0,
        detail: `None of the query words (${queryTokens.join(", ")}) appear in the title, abstract or subjects: BM25 score 0`,
      };
    }
    const matched = (bm25.matches[index] ?? [])
      .slice(0, 4)
      .map((match) => `${match.term} ×${match.count}`)
      .join(", ");
    return {
      raw,
      normalized: raw / bm25.maxScore,
      detail:
        `BM25 score ${raw.toFixed(2)}; the best of these ${bm25.documentCount} results scores ${bm25.maxScore.toFixed(2)}, ` +
        `so this is ${((raw / bm25.maxScore) * 100).toFixed(0)}% of it. Matched ${matched}`,
    };
  });
}
