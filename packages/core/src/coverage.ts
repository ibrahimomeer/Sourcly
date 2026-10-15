import type { ParsedQuery, QueryNode } from "./query";
import { wordKeys } from "./tokens";
import type { Result } from "./types";

// Term coverage: which of the words and phrases of the query a result actually contains, and where.
// It is the first thing that decides the order of results (see scoring.ts), because a result that
// lacks half the query is rarely what was asked for, however well the rest of it scores.
//
// Everything is deterministic. Words are compared as lowercase, accent-free, plural-folded keys (see
// tokens.ts), so "pendulums" matches "pendulum"; with "Search exactly as typed" nothing is folded.
// A phrase, and a word with a hyphen in it, matches when its words are next to each other, in order.

export type MatchField = "title" | "keywords" | "topics" | "abstract";

/** How much a match in each field counts toward the term-coverage factor: the title most. */
export const FIELD_WEIGHTS: Readonly<Record<MatchField, number>> = { title: 1, keywords: 0.8, topics: 0.7, abstract: 0.6 };

const FIELD_ORDER: readonly MatchField[] = ["title", "keywords", "topics", "abstract"];

/** How much a pair of query words found next to each other counts: in the title, or in the abstract. */
export const PHRASE_WEIGHTS = { title: 1, abstract: 0.7 } as const;

/** One word or quoted phrase to look for. */
export interface Atom {
  /** As the person wrote it, for showing and highlighting. */
  text: string;
  /** The keys of its words, in order. */
  keys: string[];
}

/** One thing the result has to contain: a single word or phrase, or any one of several (an OR group). */
export interface CoverageUnit {
  /** For showing: `best`, `"double pendulum"`, `sleep OR nap`. */
  label: string;
  /** Any one of these is enough. Each is a list of atoms that must all be found (usually just one). */
  alternatives: Atom[][];
}

/** Two query words that sit next to each other, to be looked for next to each other in the result. */
export interface PhrasePair {
  text: string;
  keys: [string, string];
}

/** What a query asks for, worked out once and used for every result. */
export interface CoverageSpec {
  units: CoverageUnit[];
  pairs: PhrasePair[];
  /** Words are compared as typed: nothing is stemmed. */
  exact: boolean;
}

function atomOf(node: QueryNode, exact: boolean): Atom | null {
  if (node.type !== "word" && node.type !== "phrase") return null;
  const keys = wordKeys(node.text, { exact });
  return keys.length === 0 ? null : { text: node.text, keys };
}

/** Every word and phrase inside a node, ignoring anything that is left out with NOT. */
function atomsIn(node: QueryNode, exact: boolean): Atom[] {
  switch (node.type) {
    case "word":
    case "phrase": {
      const atom = atomOf(node, exact);
      return atom === null ? [] : [atom];
    }
    case "and":
    case "or":
      return node.items.flatMap((item) => atomsIn(item, exact));
    case "not":
      return [];
  }
}

function labelOf(node: QueryNode): string {
  switch (node.type) {
    case "word":
      return node.text;
    case "phrase":
      return `"${node.text}"`;
    case "and":
      return node.items.map(labelOf).join(" ");
    case "or":
      return node.items.map(labelOf).join(" OR ");
    case "not":
      return `NOT ${labelOf(node.item)}`;
  }
}

function unitOf(node: QueryNode, exact: boolean): CoverageUnit | null {
  if (node.type === "not") return null;
  // An optional group (the counterargument terms) narrows a search but is not what it is about.
  if (node.type === "or" && node.optional === true) return null;
  if (node.type === "or") {
    const alternatives = node.items.map((item) => atomsIn(item, exact)).filter((atoms) => atoms.length > 0);
    return alternatives.length === 0 ? null : { label: labelOf(node), alternatives };
  }
  const atoms = atomsIn(node, exact);
  return atoms.length === 0 ? null : { label: labelOf(node), alternatives: [atoms] };
}

/** Pairs of words to look for next to each other: consecutive plain words of the query, and inside each quoted phrase. */
function pairsOf(items: readonly QueryNode[], exact: boolean): PhrasePair[] {
  const pairs: PhrasePair[] = [];
  const seen = new Set<string>();
  const add = (text: string, a: string, b: string) => {
    const key = `${a} ${b}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ text, keys: [a, b] });
    }
  };

  let previous: Atom | null = null;
  for (const item of items) {
    if (item.type === "word") {
      const atom = atomOf(item, exact);
      if (atom !== null && previous !== null) {
        add(`${previous.text} ${atom.text}`, previous.keys[previous.keys.length - 1] as string, atom.keys[0] as string);
      }
      previous = atom;
    } else {
      if (item.type === "phrase") {
        const shown = item.text.split(" ");
        const keys = wordKeys(item.text, { exact });
        for (let i = 0; i + 1 < keys.length; i++) add(`${shown[i] ?? keys[i]} ${shown[i + 1] ?? keys[i + 1]}`, keys[i] as string, keys[i + 1] as string);
      }
      previous = null;
    }
  }
  return pairs;
}

/** What the query asks for: the units a result must contain, and the word pairs that should be adjacent. */
export function coverageSpec(query: ParsedQuery): CoverageSpec {
  const exact = query.exact === true;
  if (query.root === null) return { units: [], pairs: [], exact };
  const items = query.root.type === "and" ? query.root.items : [query.root];
  const units = items.map((item) => unitOf(item, exact)).filter((unit): unit is CoverageUnit => unit !== null);
  return { units, pairs: pairsOf(items, exact), exact };
}

// ---- Measuring one result

/** A mark between two keywords or topics, so a phrase cannot run from one into the next. */
const BOUNDARY = "\u0000";

type Streams = Record<MatchField, string[]>;

function streamsOf(result: Result, exact: boolean): Streams {
  const options = { exact };
  const listed = (kinds: readonly string[]) =>
    result.subjects.filter((subject) => kinds.includes(subject.kind)).flatMap((subject) => [...wordKeys(subject.term, options), BOUNDARY]);
  return {
    title: wordKeys(result.title, options),
    keywords: listed(["keyword"]),
    topics: listed(["topic", "mesh", "subject"]),
    abstract: wordKeys(result.abstract ?? "", options),
  };
}

function hasSequence(stream: readonly string[], keys: readonly string[]): boolean {
  if (keys.length === 0 || keys.length > stream.length) return false;
  for (let start = 0; start + keys.length <= stream.length; start++) {
    if (keys.every((key, offset) => stream[start + offset] === key)) return true;
  }
  return false;
}

export interface UnitMatch {
  label: string;
  matched: boolean;
  /** The words or phrases that were found (as written in the query). */
  found: string[];
  /** The fields they were found in, strongest first. */
  fields: MatchField[];
  /** 0 to 1: the best field's weight, 0 when not found. */
  weight: number;
}

export interface PairMatch {
  text: string;
  found: "title" | "abstract" | null;
}

/** 1 = every term matched, 2 = most (more than half), 3 = few. */
export type Tier = 1 | 2 | 3;

export interface Coverage {
  /** Words were compared as typed (nothing stemmed). */
  exact: boolean;
  units: UnitMatch[];
  matchedCount: number;
  total: number;
  /** matchedCount / total. */
  fraction: number;
  /** The mean of the units' weights: a term found in the title counts more than one found only in the abstract. */
  weighted: number;
  tier: Tier;
  pairs: PairMatch[];
  /** The mean weight of the pairs found next to each other, or null when the query has no two such words. */
  phraseScore: number | null;
  /** Every word or phrase of the query that was found, each once, for highlighting. */
  foundTerms: string[];
}

function tierOf(matched: number, total: number): Tier {
  if (total === 0 || matched === total) return 1;
  return matched > total / 2 ? 2 : 3;
}

function matchUnit(unit: CoverageUnit, streams: Streams): UnitMatch {
  let best: { weight: number; found: string[]; fields: Set<MatchField> } | null = null;
  for (const atoms of unit.alternatives) {
    const found: string[] = [];
    const fields = new Set<MatchField>();
    let weights = 0;
    let complete = true;
    for (const atom of atoms) {
      const where = FIELD_ORDER.filter((field) => hasSequence(streams[field], atom.keys));
      if (where.length === 0) {
        complete = false;
        break;
      }
      found.push(atom.text);
      where.forEach((field) => fields.add(field));
      weights += FIELD_WEIGHTS[where[0] as MatchField];
    }
    if (!complete) continue;
    const weight = weights / atoms.length;
    if (best === null || weight > best.weight) best = { weight, found, fields };
  }
  return best === null
    ? { label: unit.label, matched: false, found: [], fields: [], weight: 0 }
    : { label: unit.label, matched: true, found: best.found, fields: FIELD_ORDER.filter((f) => best?.fields.has(f)), weight: best.weight };
}

/** Which terms of the query a result contains, where, and the tier that follows. */
export function measureCoverage(result: Result, spec: CoverageSpec): Coverage {
  const streams = streamsOf(result, spec.exact);
  const units = spec.units.map((unit) => matchUnit(unit, streams));
  const matchedCount = units.filter((unit) => unit.matched).length;
  const total = units.length;

  const pairs = spec.pairs.map((pair): PairMatch => ({
    text: pair.text,
    found: hasSequence(streams.title, pair.keys) ? "title" : hasSequence(streams.abstract, pair.keys) ? "abstract" : null,
  }));
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
    foundTerms: [...new Set(units.flatMap((unit) => unit.found))],
  };
}
