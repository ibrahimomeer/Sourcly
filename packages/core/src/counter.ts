import { formatQuery, termNode, type ParsedQuery, type QueryNode } from "./query";
import { tokenize, wordKey } from "./tokens";
import type { Result } from "./types";

// The counterargument search: the user's query, narrowed to results that also contain one of
// a list of words that signal limitations, criticism or correction. The list is fixed here,
// shown to the user as chips and editable. It is a keyword list and nothing more: finding
// these words says a source discusses a limitation, not that it disagrees.

/** Words that signal limitations or criticism. */
export const CRITICISM_TERMS: readonly string[] = [
  "limitation",
  "criticism",
  "challenge",
  "fail",
  "failure",
  "bias",
  "reproducibility",
  "replication",
  "controversy",
  "no evidence",
  "negative results",
];

/** Words that signal a work was corrected or withdrawn. */
export const NOTICE_TERMS: readonly string[] = ["retraction", "erratum", "corrigendum"];

export const DEFAULT_COUNTER_TERMS: readonly string[] = [...CRITICISM_TERMS, ...NOTICE_TERMS];

export const MAX_COUNTER_TERM_LENGTH = 60;

export type CounterTermResult = { ok: true; term: string } | { ok: false; reason: string };

/**
 * Checks a term typed into the list: a word or a short phrase made of letters and digits,
 * with at least one word that is not a common word. Quotes and punctuation are removed.
 */
export function parseCounterTerm(text: string): CounterTermResult {
  const node = termNode(text);
  if (node === null) return { ok: false, reason: "Type a word or a short phrase." };
  const term = node.text;
  if (term.length > MAX_COUNTER_TERM_LENGTH) {
    return { ok: false, reason: `Keep a term under ${MAX_COUNTER_TERM_LENGTH} characters.` };
  }
  if (tokenize(term).length === 0) {
    return { ok: false, reason: `“${term}” is a common word that searches leave out. Use a more specific word or phrase.` };
  }
  return { ok: true, term };
}

/** The terms that are valid, once each (ignoring capitals), in the order given. */
export function usableCounterTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const parsed = parseCounterTerm(raw);
    if (!parsed.ok || seen.has(parsed.term.toLowerCase())) continue;
    seen.add(parsed.term.toLowerCase());
    out.push(parsed.term);
  }
  return out;
}

/**
 * The query for the counterargument search: everything in the main query, and at least one of
 * the terms. For `sleep memory` and the terms `limitation` and `no evidence` that is
 * `sleep memory (limitation OR "no evidence")`. With no usable term, the main query comes back
 * unchanged.
 */
export function counterQuery(main: ParsedQuery, terms: readonly string[]): ParsedQuery {
  const nodes: QueryNode[] = [];
  for (const term of usableCounterTerms(terms)) {
    const node = termNode(term);
    if (node !== null) nodes.push(node);
  }
  if (main.root === null || nodes.length === 0) return main;

  // "Any of these terms" is optional for sources that cannot say it: they get only the main query.
  const lexicon: QueryNode = nodes.length === 1 ? (nodes[0] as QueryNode) : { type: "or", items: nodes, optional: true };
  const root: QueryNode = {
    type: "and",
    items: [...(main.root.type === "and" ? main.root.items : [main.root]), lexicon],
  };
  const draft: ParsedQuery = { original: "", root, droppedStopwords: [] };
  return { ...draft, original: formatQuery(draft) };
}

// ---- Finding the terms in a text.

interface Span {
  start: number;
  end: number;
  key: string;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
/** Between the words of a phrase there may only be spaces or hyphens ("no-evidence"), never a full stop. */
const JOINER = /^[\s\-–—]+$/;

function spansOf(text: string): Span[] {
  return [...text.matchAll(WORD)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    key: wordKey(match[0]),
  }));
}

interface TermKeys {
  term: string;
  keys: string[];
}

/** Longest phrases first, so "no evidence" is tried before any single word. */
function termKeys(terms: readonly string[]): TermKeys[] {
  return usableCounterTerms(terms)
    .map((term) => ({ term, keys: [...term.matchAll(WORD)].map((match) => wordKey(match[0])) }))
    .sort((a, b) => b.keys.length - a.keys.length);
}

export interface TermMatch {
  start: number;
  end: number;
  /** The term from the list that matched. */
  term: string;
}

/** Where the terms occur in the text, left to right, without overlaps. A word matches itself and its plural. */
export function findTerms(text: string, terms: readonly string[]): TermMatch[] {
  const entries = termKeys(terms);
  const words = spansOf(text);
  const matches: TermMatch[] = [];
  let i = 0;
  while (i < words.length) {
    let hit: TermMatch | null = null;
    let used = 1;
    for (const { term, keys } of entries) {
      if (i + keys.length > words.length) continue;
      const fits = keys.every((key, k) => {
        const word = words[i + k] as Span;
        if (word.key !== key) return false;
        return k === 0 || JOINER.test(text.slice((words[i + k - 1] as Span).end, word.start));
      });
      if (fits) {
        hit = { start: (words[i] as Span).start, end: (words[i + keys.length - 1] as Span).end, term };
        used = keys.length;
        break;
      }
    }
    if (hit !== null) matches.push(hit);
    i += used;
  }
  return matches;
}

export interface HighlightSegment {
  text: string;
  /** The term from the list this stretch matched, or null for ordinary text. */
  term: string | null;
}

/** The text cut into plain stretches and stretches that matched a term, to be shown highlighted. */
export function highlightSegments(text: string, terms: readonly string[]): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const match of findTerms(text, terms)) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start), term: null });
    segments.push({ text: text.slice(match.start, match.end), term: match.term });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), term: null });
  return segments;
}

export interface LexiconMatch {
  term: string;
  /** Where it was found. Only the title and the abstract are read. */
  fields: ("title" | "abstract")[];
}

/** Which of the terms a result's title and abstract contain, in the order the terms were given. */
export function findLexiconMatches(result: Pick<Result, "title" | "abstract">, terms: readonly string[]): LexiconMatch[] {
  const inTitle = new Set(findTerms(result.title, terms).map((match) => match.term));
  const inAbstract = new Set(findTerms(result.abstract ?? "", terms).map((match) => match.term));
  return usableCounterTerms(terms)
    .filter((term) => inTitle.has(term) || inAbstract.has(term))
    .map((term) => ({
      term,
      fields: [...(inTitle.has(term) ? (["title"] as const) : []), ...(inAbstract.has(term) ? (["abstract"] as const) : [])],
    }));
}
