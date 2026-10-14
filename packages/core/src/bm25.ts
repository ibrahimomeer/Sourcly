// BM25: the standard word-matching relevance formula, computed locally over the
// results that were fetched. It uses no learned model; the same results and query
// always give the same scores.
//
// For a query term t and a document d:
//
//   idf(t)      = ln(1 + (N - n(t) + 0.5) / (n(t) + 0.5))
//   score(t, d) = idf(t) * tf(t, d) * (k1 + 1) / (tf(t, d) + k1 * (1 - b + b * |d| / avgdl))
//   BM25(d)     = sum of score(t, d) over the query terms
//
// N is the number of documents, n(t) how many contain t, tf(t, d) how often t occurs
// in d, |d| the length of d in words, and avgdl the average length. A rarer term counts
// for more (idf), repeating a term helps with diminishing returns (k1), and a long
// document is discounted against a short one (b).

/** Controls how quickly repeating a term stops helping. The usual default. */
export const BM25_K1 = 1.2;
/** Controls how much a long document is discounted (0 = not at all, 1 = fully). The usual default. */
export const BM25_B = 0.75;

export interface Bm25Match {
  term: string;
  /** How many times the term occurs in the document. */
  count: number;
  /** What this term added to the document's score. */
  contribution: number;
}

export interface Bm25Scores {
  /** One raw score per document, in the order the documents were given. */
  scores: number[];
  /** Highest raw score (0 if no document matched). */
  maxScore: number;
  documentCount: number;
  /** Average document length in words. */
  averageLength: number;
  /** The terms scored, without repeats. */
  terms: string[];
  /** Per document: the terms it matched, strongest first. */
  matches: Bm25Match[][];
}

/**
 * Scores documents from word counts already worked out, for callers that count in their own way
 * (the counterargument terms are counted with phrase matching). `counts[i]` holds the term counts
 * of document i, and `lengths[i]` is that document's length in words.
 */
export function scoreBm25FromCounts(
  counts: readonly ReadonlyMap<string, number>[],
  lengths: readonly number[],
  terms: readonly string[],
  options: { k1?: number; b?: number } = {},
): Bm25Scores {
  const k1 = options.k1 ?? BM25_K1;
  const b = options.b ?? BM25_B;
  const unique = [...new Set(terms)];
  const count = counts.length;
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  // With no words at all in the set, any positive length keeps the division finite.
  const averageLength = count === 0 || totalLength === 0 ? 1 : totalLength / count;

  const idf = new Map<string, number>();
  for (const term of unique) {
    const containing = counts.filter((found) => (found.get(term) ?? 0) > 0).length;
    idf.set(term, Math.log(1 + (count - containing + 0.5) / (containing + 0.5)));
  }

  const matches: Bm25Match[][] = [];
  const scores = counts.map((found, index) => {
    const matched: Bm25Match[] = [];
    const lengthFactor = 1 - b + (b * (lengths[index] ?? 0)) / averageLength;
    for (const term of unique) {
      const tf = found.get(term) ?? 0;
      if (tf === 0) continue;
      const contribution = ((idf.get(term) ?? 0) * tf * (k1 + 1)) / (tf + k1 * lengthFactor);
      matched.push({ term, count: tf, contribution });
    }
    matched.sort((x, y) => y.contribution - x.contribution || (x.term < y.term ? -1 : 1));
    matches.push(matched);
    return matched.reduce((sum, match) => sum + match.contribution, 0);
  });

  return {
    scores,
    maxScore: scores.reduce((max, score) => Math.max(max, score), 0),
    documentCount: count,
    averageLength: totalLength === 0 ? 0 : totalLength / Math.max(1, count),
    terms: unique,
    matches,
  };
}

export function scoreBm25(
  documents: readonly (readonly string[])[],
  queryTokens: readonly string[],
  options: { k1?: number; b?: number } = {},
): Bm25Scores {
  const wanted = new Set(queryTokens);
  const counts = documents.map((doc) => {
    const found = new Map<string, number>();
    for (const token of doc) if (wanted.has(token)) found.set(token, (found.get(token) ?? 0) + 1);
    return found;
  });
  return scoreBm25FromCounts(
    counts,
    documents.map((doc) => doc.length),
    queryTokens,
    options,
  );
}
