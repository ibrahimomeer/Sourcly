import { STOPWORDS } from "./stopwords";
import type { QuerySyntax } from "./types";

// Reading what a person typed as a search: quoted phrases, AND / OR / NOT in capitals,
// parentheses, and plain words, with common words dropped. Everything is deterministic;
// the same text always gives the same query.
//
//   sleep memory            both words (a space means AND)
//   sleep OR dreaming       either word
//   "memory consolidation"  the words together, in that order
//   sleep NOT rats          sleep, but not rats
//   (sleep OR nap) AND memory
//
// Precedence, strongest first: NOT, then AND (also written as a space), then OR.
// Lowercase "and", "or" and "not" are ordinary common words and are dropped.

export type QueryNode =
  | { type: "word"; text: string }
  | { type: "phrase"; text: string }
  | { type: "and"; items: QueryNode[] }
  /**
   * `optional` marks a group that narrows a search but is not what the search is about (the
   * counterargument terms). Sources that cannot say "any of these" are sent the query without it.
   */
  | { type: "or"; items: QueryNode[]; optional?: true }
  | { type: "not"; item: QueryNode };

export interface ParsedQuery {
  /** The text as typed. */
  original: string;
  /** The query as a tree, or null when nothing searchable was typed. */
  root: QueryNode | null;
  /** Common words removed from the unquoted parts, lowercase, in the order they appeared. */
  droppedStopwords: string[];
}

type Token =
  | { kind: "word"; text: string }
  | { kind: "phrase"; text: string }
  | { kind: "op"; op: "AND" | "OR" | "NOT" }
  | { kind: "(" }
  | { kind: ")" };

const OPERATORS = new Set(["AND", "OR", "NOT"]);

/**
 * Letters and digits, and hyphens between them. A hyphen stays inside a word (covid-19,
 * meta-analysis, IL-6), because splitting it breaks real searches: PubMed finds nothing for
 * `covid AND 19`. Other punctuation splits a word, and apostrophes are simply removed
 * (memory's -> memorys, don't -> dont).
 */
function splitWords(text: string): string[] {
  return text
    .replace(/['’]/g, "")
    .replace(/[‐‑]/g, "-")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((part) => part.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, ""))
    .filter((part) => part !== "");
}

/**
 * One term (a word or a few words) as a query node: a word, or a phrase when it has several
 * words. Common words are kept, as if the term were in quotes. Null when it has no words.
 */
export function termNode(text: string): Extract<QueryNode, { type: "word" | "phrase" }> | null {
  const words = splitWords(text);
  if (words.length === 0) return null;
  return words.length === 1 ? { type: "word", text: words[0] as string } : { type: "phrase", text: words.join(" ") };
}

function lex(text: string, dropped: string[]): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/"([^"]*)"?|[()]|[^\s()"]+/gu)) {
    const raw = match[0];
    if (raw.startsWith('"')) {
      const words = splitWords(match[1] ?? "");
      if (words.length === 1) tokens.push({ kind: "word", text: words[0] as string });
      else if (words.length > 1) tokens.push({ kind: "phrase", text: words.join(" ") });
    } else if (raw === "(" || raw === ")") {
      tokens.push({ kind: raw });
    } else if (OPERATORS.has(raw)) {
      tokens.push({ kind: "op", op: raw as "AND" | "OR" | "NOT" });
    } else {
      for (const word of splitWords(raw)) {
        if (STOPWORDS.has(word.toLowerCase())) dropped.push(word.toLowerCase());
        else tokens.push({ kind: "word", text: word });
      }
    }
  }
  return tokens;
}

/** Joins nodes with and/or, flattening nested nodes of the same kind and unwrapping a single node. */
function combine(type: "and" | "or", nodes: QueryNode[]): QueryNode | null {
  const items = nodes.flatMap((node) => (node.type === type ? node.items : [node]));
  if (items.length === 0) return null;
  return items.length === 1 ? (items[0] as QueryNode) : { type, items };
}

function parseTokens(tokens: Token[]): QueryNode | null {
  let pos = 0;
  const atEnd = () => pos >= tokens.length;
  const isOp = (op: string) => {
    const token = tokens[pos];
    return token?.kind === "op" && token.op === op;
  };
  const atTerminator = () => atEnd() || tokens[pos]?.kind === ")" || isOp("OR") || isOp("AND");

  function parseOr(): QueryNode | null {
    const parts: QueryNode[] = [];
    const first = parseAnd();
    if (first !== null) parts.push(first);
    while (isOp("OR")) {
      pos += 1;
      const next = parseAnd();
      if (next !== null) parts.push(next);
    }
    return combine("or", parts);
  }

  function parseAnd(): QueryNode | null {
    const parts: QueryNode[] = [];
    while (!atEnd() && tokens[pos]?.kind !== ")" && !isOp("OR")) {
      if (isOp("AND")) {
        pos += 1;
        continue;
      }
      const node = parseUnary();
      if (node !== null) parts.push(node);
    }
    return combine("and", parts);
  }

  function parseUnary(): QueryNode | null {
    const token = tokens[pos];
    pos += 1;
    if (token === undefined) return null;
    if (token.kind === "op" && token.op === "NOT") {
      if (atTerminator()) return null; // a NOT with nothing after it
      const inner = parseUnary();
      if (inner === null) return null;
      // NOT NOT x means x.
      return inner.type === "not" ? inner.item : { type: "not", item: inner };
    }
    if (token.kind === "(") {
      const inner = parseOr();
      if (tokens[pos]?.kind === ")") pos += 1;
      return inner;
    }
    if (token.kind === "word") return { type: "word", text: token.text };
    if (token.kind === "phrase") return { type: "phrase", text: token.text };
    return null;
  }

  const top: QueryNode[] = [];
  while (!atEnd()) {
    const node = parseOr();
    if (node !== null) top.push(node);
    if (tokens[pos]?.kind === ")") pos += 1; // a stray closing parenthesis
  }
  return combine("and", top);
}

export function parseQuery(text: string): ParsedQuery {
  const droppedStopwords: string[] = [];
  const root = parseTokens(lex(text, droppedStopwords));
  return { original: text, root, droppedStopwords };
}

function collectWords(
  node: QueryNode,
  negated: boolean,
  out: { positive: string[]; excluded: string[] },
  skipOptional = false,
): void {
  switch (node.type) {
    case "word":
      (negated ? out.excluded : out.positive).push(node.text);
      break;
    case "phrase":
      (negated ? out.excluded : out.positive).push(...node.text.split(" "));
      break;
    case "and":
    case "or":
      if (skipOptional && node.type === "or" && node.optional === true) break;
      for (const item of node.items) collectWords(item, negated, out, skipOptional);
      break;
    case "not":
      collectWords(node.item, !negated, out, skipOptional);
      break;
  }
}

/** Every word the query asks for (not the ones it excludes), in order, without repeats. */
export function queryTerms(query: ParsedQuery): string[] {
  const out = { positive: [] as string[], excluded: [] as string[] };
  if (query.root !== null) collectWords(query.root, false, out);
  return unique(out.positive);
}

/**
 * The words the search is about: every word it asks for except those in an optional group
 * (the counterargument terms, which narrow a search but are not its subject).
 */
export function requiredTerms(query: ParsedQuery): string[] {
  const out = { positive: [] as string[], excluded: [] as string[] };
  if (query.root !== null) collectWords(query.root, false, out, true);
  return unique(out.positive);
}

/** Every word the query asks to leave out, in order, without repeats. */
export function excludedTerms(query: ParsedQuery): string[] {
  const out = { positive: [] as string[], excluded: [] as string[] };
  if (query.root !== null) collectWords(query.root, false, out);
  return unique(out.excluded);
}

function unique(words: string[]): string[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when the query asks for at least one word that can actually be searched. */
export function isUsable(query: ParsedQuery): boolean {
  return query.root !== null && queryTerms(query).length > 0;
}

// ---- Showing a query back to the person: the same query, tidied, as editable text.

function format(node: QueryNode, parent: "root" | "and" | "or" | "not"): string {
  switch (node.type) {
    case "word":
      // A word that is itself an operator name must be quoted to be read as a word again.
      return OPERATORS.has(node.text) ? `"${node.text}"` : node.text;
    case "phrase":
      return `"${node.text}"`;
    case "and": {
      const text = node.items.map((item) => format(item, "and")).join(" ");
      return parent === "not" ? `(${text})` : text;
    }
    case "or": {
      const text = node.items.map((item) => format(item, "or")).join(" OR ");
      return parent === "and" || parent === "not" ? `(${text})` : text;
    }
    case "not":
      return `NOT ${format(node.item, "not")}`;
  }
}

/**
 * The query as tidy text the person can edit: common words gone, operators in capitals,
 * a space for AND, parentheses only where needed. Reading this text back gives the
 * same query again.
 */
export function formatQuery(query: ParsedQuery): string {
  return query.root === null ? "" : format(query.root, "root");
}

// ---- Writing a query in a form a particular source understands.

export interface RenderedQuery {
  /** Exactly what is sent to the source. Empty when the source cannot be given anything. */
  text: string;
  /** Plain-language notes about what this source could not apply. */
  notes: string[];
}

function renderBoolean(node: QueryNode, dropped: Set<string>): string | null {
  const wrap = (child: QueryNode): string | null => {
    const text = renderBoolean(child, dropped);
    if (text === null) return null;
    return child.type === "and" || child.type === "or" ? `(${text})` : text;
  };

  switch (node.type) {
    case "word":
      // A word spelled like an operator (from "AND" in quotes) must not be read as one.
      return OPERATORS.has(node.text.toUpperCase()) ? `"${node.text}"` : node.text;
    case "phrase":
      return `"${node.text}"`;
    case "or": {
      const parts = node.items.map((item) => wrap(item)).filter((text): text is string => text !== null);
      if (parts.length < node.items.length) dropped.add("a part that only said what to leave out");
      return parts.length === 0 ? null : parts.join(" OR ");
    }
    case "and": {
      const positives = node.items.filter((item) => item.type !== "not");
      const negatives = node.items.filter((item) => item.type === "not");
      const included = positives.map((item) => wrap(item)).filter((text): text is string => text !== null);
      if (included.length === 0) return null;
      // "x NOT y" is the one form every Boolean source understands (PubMed rejects "x AND NOT y").
      let text = included.join(" AND ");
      for (const negative of negatives) {
        if (negative.type !== "not") continue;
        const excluded = wrap(negative.item);
        if (excluded !== null) text += ` NOT ${excluded}`;
      }
      return text;
    }
    case "not":
      dropped.add("a part that only said what to leave out");
      return null;
  }
}

/**
 * Renders a query for a source. Boolean sources get AND, OR, NOT, quoted phrases and
 * parentheses, with every AND spelled out (some sources would otherwise treat a space
 * as OR). Plain sources get only the words, and the notes say what that left out.
 */
export function renderQuery(query: ParsedQuery, syntax: QuerySyntax): RenderedQuery {
  if (query.root === null) return { text: "", notes: [] };
  const notes: string[] = [];

  if (syntax === "boolean") {
    const dropped = new Set<string>();
    const text = renderBoolean(query.root, dropped) ?? "";
    for (const part of dropped) notes.push(`Ignored ${part}, because it had nothing to search for`);
    return { text, notes };
  }

  const out = { positive: [] as string[], excluded: [] as string[] };
  collectWords(query.root, false, out, true);
  const words = unique(out.positive);
  const flags = { phrase: false, or: false, not: false, optional: false };
  const scan = (node: QueryNode) => {
    if (node.type === "or" && node.optional === true) {
      flags.optional = true;
      return;
    }
    if (node.type === "phrase") flags.phrase = true;
    if (node.type === "or") flags.or = true;
    if (node.type === "not") flags.not = true;
    if (node.type === "and" || node.type === "or") node.items.forEach(scan);
    if (node.type === "not") scan(node.item);
  };
  scan(query.root);

  if (flags.not) {
    const left = unique(out.excluded);
    notes.push(
      `This source cannot leave words out, so results containing ${left.map((w) => `“${w}”`).join(", ")} can still appear`,
    );
  }
  if (flags.or) notes.push("This source cannot match “either word”, so it searches for all of the words together");
  if (flags.phrase) notes.push("This source cannot match a phrase, so it searches for the words of the phrase separately");
  if (flags.optional) {
    notes.push("This source cannot ask for “any of these terms”, so it was sent only the rest of your search; its results that contain none of the terms rank lower");
  }
  return { text: words.join(" "), notes };
}
