import { STOPWORDS } from "./stopwords";
import type { QuerySyntax } from "./types";

// Reading what a person typed as a search: quoted phrases, AND / OR / NOT in capitals,
// parentheses, and plain words, with common words dropped (unless told not to). Everything is
// deterministic; the same text and options always give the same query.
//
//   sleep memory            both words (a space means AND)
//   sleep OR dreaming       either word
//   "memory consolidation"  the words together, in that order
//   sleep NOT rats          sleep, but not rats
//   (sleep OR nap) AND memory
//
// Precedence, strongest first: NOT, then AND (also written as a space), then OR.
// Lowercase "and", "or" and "not" are ordinary common words and are dropped.
//
// What is dropped is never hidden and never final: every dropped word is reported, and the options
// let a person turn dropping off, restore one dropped word, or leave one term out. Words inside
// quotes are always kept, and so is an all-caps word such as CAN or US (see isAllCapsTerm).

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
  /** Terms (words or quoted phrases) the person chose to leave out, as typed, each once. */
  excludedTerms?: string[];
  /** The text reads as a question (it starts with a question word or ends with "?"). */
  looksLikeQuestion?: boolean;
  /** Set for "Search exactly as typed": every source receives `original` unchanged, and nothing is stemmed locally. */
  exact?: boolean;
}

export interface ParseOptions {
  /** Drop common words from the unquoted text. On by default. Off: every word typed is a term. */
  ignoreCommon?: boolean;
  /** Common words the person restored (lowercase): they count as ordinary terms even while dropping is on. */
  restored?: ReadonlySet<string>;
  /** Terms the person left out (lowercase; a phrase is its words joined by one space): they are not used. */
  excluded?: ReadonlySet<string>;
  /** Mark the query as one to send exactly as typed. Implies no dropping. */
  exact?: boolean;
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

/**
 * An all-caps word of two or more characters is a term, not a common word: "CAN" bus, "US", "IT",
 * "WHO". The rule applies only when the text also has lowercase letters, so a query typed entirely in
 * capitals is not exempted from dropping. A single capital letter follows the ordinary rule.
 */
export function isAllCapsTerm(word: string, textHasLowercase: boolean): boolean {
  return textHasLowercase && /^[\p{Lu}\p{N}]{2,}$/u.test(word) && /\p{Lu}/u.test(word);
}

interface LexContext {
  dropped: string[];
  excluded: string[];
  ignoreCommon: boolean;
  restored: ReadonlySet<string>;
  leftOut: ReadonlySet<string>;
  textHasLowercase: boolean;
}

function lex(text: string, context: LexContext): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/"([^"]*)"?|[()]|[^\s()"]+/gu)) {
    const raw = match[0];
    if (raw.startsWith('"')) {
      // Inside quotes every word is kept, common or not.
      const words = splitWords(match[1] ?? "");
      if (words.length === 0) continue;
      const phrase = words.join(" ");
      if (context.leftOut.has(phrase.toLowerCase())) context.excluded.push(phrase);
      else if (words.length === 1) tokens.push({ kind: "word", text: words[0] as string });
      else tokens.push({ kind: "phrase", text: phrase });
    } else if (raw === "(" || raw === ")") {
      tokens.push({ kind: raw });
    } else if (OPERATORS.has(raw)) {
      tokens.push({ kind: "op", op: raw as "AND" | "OR" | "NOT" });
    } else {
      for (const word of splitWords(raw)) {
        const lower = word.toLowerCase();
        if (context.leftOut.has(lower)) context.excluded.push(word);
        else if (
          context.ignoreCommon &&
          STOPWORDS.has(lower) &&
          !context.restored.has(lower) &&
          !isAllCapsTerm(word, context.textHasLowercase)
        ) {
          context.dropped.push(lower);
        } else tokens.push({ kind: "word", text: word });
      }
    }
  }
  return tokens;
}

const QUESTION_STARTERS: ReadonlySet<string> = new Set([
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "is", "are", "was", "were", "do", "does", "did", "can", "could", "should", "would", "will",
]);

/** The text reads as a question: it ends with "?" or its first word is a question word. A plain rule, no guessing. */
export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return true;
  const first = /^[\p{L}']+/u.exec(trimmed)?.[0]?.toLowerCase().replace(/'/g, "");
  return first !== undefined && QUESTION_STARTERS.has(first);
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

export function parseQuery(text: string, options: ParseOptions = {}): ParsedQuery {
  const exact = options.exact === true;
  const context: LexContext = {
    dropped: [],
    excluded: [],
    ignoreCommon: !exact && options.ignoreCommon !== false,
    restored: options.restored ?? new Set(),
    leftOut: options.excluded ?? new Set(),
    textHasLowercase: /\p{Ll}/u.test(text),
  };
  const root = parseTokens(lex(text, context));
  return {
    original: text,
    root,
    droppedStopwords: context.dropped,
    excludedTerms: [...new Set(context.excluded)],
    looksLikeQuestion: looksLikeQuestion(text),
    ...(exact ? { exact: true } : {}),
  };
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
  if (query.exact === true) return query.original.trim();
  return query.root === null ? "" : format(query.root, "root");
}

// ---- Writing a query in a form a particular source understands.

export interface RenderedQuery {
  /** Exactly what is sent to the source. Empty when the source cannot be given anything. */
  text: string;
  /** Plain-language notes about what this source could not apply. */
  notes: string[];
}

/** How one word or phrase is written for a source. */
interface LeafStyle {
  word(text: string): string;
  phrase(text: string): string;
}

const quoted = (text: string) => `"${text}"`;
/** Words are letters, digits and hyphens; a hyphenated word is quoted so no source reads the hyphen as a minus. */
const needsQuotes = (text: string) => OPERATORS.has(text.toUpperCase()) || !/^[\p{L}\p{N}]+$/u.test(text);
const maybeQuoted = (text: string) => (needsQuotes(text) ? quoted(text) : text);

const LEAF_STYLES: Record<"boolean" | "pubmed" | "europepmc", LeafStyle> = {
  // A word spelled like an operator (from "AND" in quotes) must not be read as one.
  boolean: { word: (text) => (OPERATORS.has(text.toUpperCase()) ? quoted(text) : text), phrase: quoted },
  // [tw] is PubMed's Text Word field: title, abstract, MeSH headings and keywords. A field tag also turns off
  // PubMed's automatic term mapping, so each word is tagged on its own.
  pubmed: { word: (text) => `${maybeQuoted(text)}[tw]`, phrase: (text) => `${quoted(text)}[tw]` },
  europepmc: { word: (text) => `TITLE_ABS:${maybeQuoted(text)}`, phrase: (text) => `TITLE_ABS:${quoted(text)}` },
};

function renderBoolean(node: QueryNode, dropped: Set<string>, style: LeafStyle): string | null {
  const wrap = (child: QueryNode): string | null => {
    const text = renderBoolean(child, dropped, style);
    if (text === null) return null;
    return child.type === "and" || child.type === "or" ? `(${text})` : text;
  };

  switch (node.type) {
    case "word":
      return style.word(node.text);
    case "phrase":
      return style.phrase(node.text);
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
 * For a source that ignores a group of alternatives inside a larger search (checked on Wikipedia:
 * "sleep AND (nap OR rest)" finds exactly what "sleep" does). Words, phrases and NOT work, and so does
 * an OR of single words on its own. A group it would ignore is left out, and the notes say so.
 */
function renderFlat(root: QueryNode): RenderedQuery {
  const style = LEAF_STYLES.boolean;
  const notes: string[] = [];
  const leaf = (node: QueryNode): string | null => (node.type === "word" ? style.word(node.text) : node.type === "phrase" ? style.phrase(node.text) : null);
  const leftOut = new Set<"optional" | "alternatives" | "exclusion">();

  const positives: string[] = [];
  const negatives: string[] = [];
  let orRoot: string[] | null = null;

  const add = (node: QueryNode) => {
    const single = leaf(node);
    if (single !== null) positives.push(single);
    else if (node.type === "and") node.items.forEach(add);
    else if (node.type === "or") leftOut.add(node.optional === true ? "optional" : "alternatives");
    else if (node.type === "not") {
      const excluded = leaf(node.item);
      if (excluded !== null) negatives.push(excluded);
      else leftOut.add("exclusion");
    }
  };

  if (root.type === "or" && root.optional !== true) {
    const parts = root.items.map(leaf);
    orRoot = parts.filter((part): part is string => part !== null);
    if (orRoot.length < parts.length) leftOut.add("alternatives");
  } else {
    add(root);
  }

  if (leftOut.has("optional")) {
    notes.push("This source cannot ask for “any of these terms”, so it was sent only the rest of your search; its results that contain none of the terms rank lower");
  }
  if (leftOut.has("alternatives")) notes.push("Ignored a group of alternatives (“either word”), because this source ignores such a group inside a larger search");
  if (leftOut.has("exclusion")) notes.push("Ignored a group to leave out, because this source reads only single words and phrases after NOT");

  if (orRoot !== null) return { text: orRoot.join(" OR "), notes };
  if (positives.length === 0) return { text: "", notes };
  return { text: [positives.join(" AND "), ...negatives.map((word) => `NOT ${word}`)].join(" "), notes };
}

/**
 * Renders a query for a source. Boolean sources get AND, OR, NOT, quoted phrases and
 * parentheses, with every AND spelled out (some sources would otherwise treat a space
 * as OR); "pubmed" and "europepmc" also name the field every word is looked for in. Plain
 * sources get only the words, and the notes say what that left out.
 */
export function renderQuery(query: ParsedQuery, syntax: QuerySyntax): RenderedQuery {
  if (query.root === null) return { text: "", notes: [] };
  // "Search exactly as typed": the source gets the text as it was typed, with nothing removed or rewritten.
  if (query.exact === true) return { text: query.original.trim(), notes: ["Sent exactly as typed"] };
  const notes: string[] = [];

  if (syntax === "boolean-flat") return renderFlat(query.root);
  if (syntax === "boolean" || syntax === "pubmed" || syntax === "europepmc") {
    const dropped = new Set<string>();
    const text = renderBoolean(query.root, dropped, LEAF_STYLES[syntax]) ?? "";
    for (const part of dropped) notes.push(`Ignored ${part}, because it had nothing to search for`);
    return { text, notes };
  }

  const out = { positive: [] as string[], excluded: [] as string[] };
  collectWords(query.root, false, out, true);
  const spaced = syntax === "plain-spaced";
  const words = unique(spaced ? out.positive.map((word) => word.replace(/-/g, " ")) : out.positive);
  if (spaced && out.positive.some((word) => word.includes("-"))) {
    notes.push("Hyphens were replaced by spaces, because this source finds nothing for a hyphenated word");
  }
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
