import { hardBlocks, parseConcepts, type Block, type ConceptQuery, type SoftTerm } from "./concepts";
import { FIELD_ORDER, adjacentIn, matchBlock, matchSoft, snippetOf, streamsOf, type MatchField, type Snippet } from "./conceptmatch";
import type { ParsedQuery } from "./query";
import type { Result } from "./types";

export type { MatchField, Snippet } from "./conceptmatch";

// Block coverage: which concepts of the search a result contains, and where. It is the first thing that decides the
// order of results (see scoring.ts), because a result that lacks half the concepts is rarely what was asked for,
// however well the rest of it scores.
//
// A concept is a block (concepts.ts): the typed word and its curated variants. A result matches it if ANY variant is
// a whole word or phrase in its title, author keywords or abstract (conceptmatch.ts), and nowhere else.

/** How much a match in each field counts toward the term-coverage factor: the title most. */
export const FIELD_WEIGHTS: Readonly<Record<MatchField, number>> = { title: 1, keywords: 0.8, abstract: 0.6 };

/** How much a pair of neighbouring concepts found next to each other counts: in the title, or in the abstract. */
export const PHRASE_WEIGHTS = { title: 1, abstract: 0.7 } as const;

/** Two neighbouring concepts of the search, to be looked for next to each other, in order. */
export interface PhrasePair {
  text: string;
  /** Block ids. */
  first: string;
  second: string;
}

/** What a query asks for, worked out once and used for every result. */
export interface CoverageSpec {
  /** The hard blocks a result must match, in the order typed. */
  blocks: Block[];
  soft: SoftTerm[];
  pairs: PhrasePair[];
  /** Words are compared as typed: nothing is normalized. */
  exact: boolean;
}

/** Reads a query as a coverage spec. A ConceptQuery is used as it is; text, or a parsed query's text, is read with the default options. */
export function coverageSpec(query: ConceptQuery | ParsedQuery | string): CoverageSpec {
  const concepts =
    typeof query === "string" ? parseConcepts(query) : "blocks" in query ? query : parseConcepts(query.original, { exact: query.exact === true });
  const blocks = hardBlocks(concepts);
  const pairs: PhrasePair[] = [];
  for (let i = 0; i + 1 < blocks.length; i += 1) {
    const first = blocks[i] as Block;
    const second = blocks[i + 1] as Block;
    pairs.push({ text: `${first.label} ${second.label}`, first: first.id, second: second.id });
  }
  return { blocks, soft: concepts.soft, pairs, exact: concepts.exact };
}

// ---- Measuring one result

export interface Span {
  start: number;
  end: number;
  /** The variant that matched here. */
  term: string;
}

export interface UnitMatch {
  /** What was typed: "odor", "machine learning", "AI". */
  label: string;
  matched: boolean;
  /** Every variant that was found, each once, in the order of the block (the typed one first). */
  found: string[];
  /** The variant shown on the card, or null when not found. */
  variant: string | null;
  /** The variant shown came from the thesaurus, not from the typed words. */
  fromThesaurus: boolean;
  /** The fields it was found in, strongest first. */
  fields: MatchField[];
  /** 0 to 1: the best field's weight, 0 when not found. */
  weight: number;
  /** The text around the best match, for "Why this rank?". */
  snippet: Snippet | null;
}

export interface PairMatch {
  text: string;
  found: "title" | "abstract" | null;
}

/** 1 = every concept matched, 2 = most (more than half), 3 = few. */
export type Tier = 1 | 2 | 3;

export interface Coverage {
  /** Words were compared as typed (nothing normalized). */
  exact: boolean;
  units: UnitMatch[];
  matchedCount: number;
  total: number;
  /** matchedCount / total. */
  fraction: number;
  /** The mean of the units' weights: a concept found in the title counts more than one found only in the abstract. */
  weighted: number;
  tier: Tier;
  pairs: PairMatch[];
  /** The mean weight of the pairs found next to each other, or null when the query has no two neighbouring concepts. */
  phraseScore: number | null;
  /** The soft terms the result contains (they only boost relevance), with how many times. */
  soft: { text: string; count: number }[];
  /** Where every match is, for marking the text. */
  spans: Record<MatchField, Span[]>;
}

function tierOf(matched: number, total: number): Tier {
  if (total === 0 || matched === total) return 1;
  return matched > total / 2 ? 2 : 3;
}

/** Which concepts of the query a result contains, where, and the tier that follows. */
export function measureCoverage(result: Result, spec: CoverageSpec): Coverage {
  const streams = streamsOf(result, spec.exact);
  const matches = spec.blocks.map((block) => matchBlock(streams, block));
  const spans: Record<MatchField, Span[]> = { title: [], keywords: [], abstract: [] };

  const units = matches.map((match): UnitMatch => {
    for (const hit of match.hits) {
      spans[hit.field].push({ start: hit.start, end: hit.end, term: match.block.variants[hit.variantIndex]?.text ?? match.block.label });
    }
    const best = match.best;
    const variant = best === null ? null : (match.block.variants[best.variantIndex] ?? null);
    const stream = best === null ? undefined : streams.find((candidate) => candidate.field === best.field);
    const found = [...new Set(match.hits.map((hit) => hit.variantIndex))].sort((a, b) => a - b).map((index) => match.block.variants[index]?.text ?? "");
    return {
      label: match.block.label,
      matched: match.matched,
      found,
      variant: variant?.text ?? null,
      fromThesaurus: variant?.origin === "thesaurus",
      fields: match.fields,
      weight: best === null ? 0 : FIELD_WEIGHTS[best.field],
      snippet: best === null || stream === undefined ? null : snippetOf(stream, best),
    };
  });
  for (const field of FIELD_ORDER) spans[field].sort((a, b) => a.start - b.start || b.end - a.end);

  const matchedCount = units.filter((unit) => unit.matched).length;
  const total = units.length;

  const byId = new Map(matches.map((match) => [match.block.id, match]));
  const pairs = spec.pairs.map((pair): PairMatch => {
    const first = byId.get(pair.first);
    const second = byId.get(pair.second);
    const found = first === undefined || second === undefined ? null : adjacentIn(first, second, streams, ["title", "abstract"]);
    return { text: pair.text, found: found === "title" || found === "abstract" ? found : null };
  });
  const phraseScore =
    pairs.length === 0 ? null : pairs.reduce((sum, pair) => sum + (pair.found === null ? 0 : PHRASE_WEIGHTS[pair.found]), 0) / pairs.length;

  return {
    exact: spec.exact,
    units,
    matchedCount,
    total,
    fraction: total === 0 ? 1 : matchedCount / total,
    weighted: total === 0 ? 1 : units.reduce((sum, unit) => sum + unit.weight, 0) / total,
    tier: tierOf(matchedCount, total),
    pairs,
    phraseScore,
    soft: [...matchSoft(streams, spec.soft)].map(([text, count]) => ({ text, count })),
    spans,
  };
}
