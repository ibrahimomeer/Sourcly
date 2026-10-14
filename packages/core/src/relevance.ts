import { scoreBm25, scoreBm25FromCounts } from "./bm25";
import { findTerms, usableCounterTerms } from "./counter";
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

function topicReadings(results: readonly Result[], queryTerms: readonly string[]): RelevanceReading[] {
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

const percent = (share: number) => `${(share * 100).toFixed(0)}%`;

/**
 * Scores every result against the query with BM25 and normalizes to 0..1 by dividing by
 * the best score in the set, so the best match is 1. The set is the merged results that
 * were fetched, so a rare word counts for more and a long abstract is discounted against a
 * short one (see bm25.ts). Phrases and OR are not enforced here: the words of the query
 * are matched wherever they appear.
 *
 * With `signalTerms` (the counterargument terms) there is a second reading: BM25 over how often
 * each term occurs in the title and abstract, counting a phrase such as "no evidence" as one
 * term. The relevance is then the two readings multiplied, so a result must match both your
 * search and the terms to score high: one that matches only one of them scores 0. If no result
 * contains any term, only the first reading is used.
 */
export function relevanceReadings(
  results: readonly Result[],
  queryTerms: readonly string[],
  signalTerms: readonly string[] = [],
): RelevanceReading[] {
  const topic = topicReadings(results, queryTerms);
  const terms = usableCounterTerms(signalTerms);
  if (terms.length === 0) return topic;

  const texts = results.map((result) => `${result.title} ${result.abstract ?? ""}`);
  const counts = texts.map((text) => {
    const found = new Map<string, number>();
    for (const hit of findTerms(text, terms)) found.set(hit.term, (found.get(hit.term) ?? 0) + 1);
    return found;
  });
  const signal = scoreBm25FromCounts(
    counts,
    texts.map((text) => tokenize(text).length),
    terms,
  );

  return topic.map((reading, index) => {
    if (signal.maxScore === 0) {
      return {
        ...reading,
        detail: `${reading.detail}. None of the results contains any of the terms (${terms.join(", ")}), so only the match with your search is used`,
      };
    }
    const signalRaw = signal.scores[index] ?? 0;
    const signalShare = signalRaw / signal.maxScore;
    const topicShare = reading.normalized ?? 1;
    const found = (signal.matches[index] ?? [])
      .slice(0, 4)
      .map((match) => `${match.term} ×${match.count}`)
      .join(", ");
    const termsPart =
      signalRaw === 0
        ? "Terms: none of the terms appear in the title or abstract, so this scores 0"
        : `Terms: BM25 score ${signalRaw.toFixed(2)}, ${percent(signalShare)} of the best (matched ${found})`;
    return {
      raw: reading.raw,
      normalized: topicShare * signalShare,
      detail: `${reading.detail}. ${termsPart}. Relevance here is the two multiplied: ${percent(topicShare)} × ${percent(signalShare)} = ${percent(topicShare * signalShare)}`,
    };
  });
}
