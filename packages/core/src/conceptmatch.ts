import type { Block, SoftTerm, Variant } from "./concepts";
import { keyOf } from "./concepts";
import type { Result } from "./types";

// Matching concept blocks against a result. A block matches if ANY of its variants is found as a whole word or phrase
// in the TITLE, the AUTHOR KEYWORDS or the ABSTRACT, and nowhere else: not in topic tags, MeSH headings, subject
// categories, OpenAlex's own keywords or the venue. Words are compared lightly: lowercase, accents folded, a plural -s or
// -es taken off (no other stemming). An abbreviation such as AI is matched with its capitals exactly, as a whole word:
// "AI" is not "Ai Weiwei" and is not inside "waiting". Everything here is deterministic and explains itself: every match
// has its variant, its field and the text around it.

export type MatchField = "title" | "keywords" | "abstract";
export const FIELD_ORDER: readonly MatchField[] = ["title", "keywords", "abstract"];

interface Token {
  raw: string;
  key: string;
  start: number;
  end: number;
  /** A mark between two author keywords, so a phrase cannot run from one into the next. */
  boundary?: boolean;
}

export interface FieldStream {
  field: MatchField;
  text: string;
  tokens: Token[];
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
/** Between the words of a phrase there may only be spaces, hyphens or a slash, never a full stop or a comma. */
const JOINER = /^[\s\-–—/]+$/;

function tokensOf(text: string, exact: boolean, offset = 0): Token[] {
  return [...text.matchAll(WORD)].map((match) => ({
    raw: match[0],
    key: keyOf(match[0], exact),
    start: offset + match.index,
    end: offset + match.index + match[0].length,
  }));
}

/** The three fields of a result as token streams (the abstract only when there is one). */
export function fieldStreams(result: Pick<Result, "title" | "abstract" | "subjects">, exact = false): FieldStream[] {
  const keywords = result.subjects.filter((subject) => subject.kind === "keyword" && subject.provider !== "openalex").map((subject) => subject.term);
  const keywordText = keywords.join("; ");
  const keywordTokens: Token[] = [];
  let offset = 0;
  for (const keyword of keywords) {
    if (keywordTokens.length > 0) keywordTokens.push({ raw: "", key: "\u0000", start: offset, end: offset, boundary: true });
    keywordTokens.push(...tokensOf(keyword, exact, offset));
    offset += keyword.length + 2;
  }
  return [
    { field: "title", text: result.title, tokens: tokensOf(result.title, exact) },
    { field: "keywords", text: keywordText, tokens: keywordTokens },
    { field: "abstract", text: result.abstract ?? "", tokens: tokensOf(result.abstract ?? "", exact) },
  ];
}

const cache = new WeakMap<object, Map<boolean, FieldStream[]>>();

/** `fieldStreams`, remembered per result and per mode, because ranking asks for them many times. */
export function streamsOf(result: Pick<Result, "title" | "abstract" | "subjects">, exact = false): FieldStream[] {
  let byMode = cache.get(result);
  if (byMode === undefined) {
    byMode = new Map();
    cache.set(result, byMode);
  }
  let streams = byMode.get(exact);
  if (streams === undefined) {
    streams = fieldStreams(result, exact);
    byMode.set(exact, streams);
  }
  return streams;
}

/** Where a variant occurs in a stream: first and last token index, and the characters they cover. */
interface Found {
  from: number;
  to: number;
  start: number;
  end: number;
}

function findVariant(stream: FieldStream, variant: Variant): Found[] {
  const { tokens, text } = stream;
  const found: Found[] = [];
  if (variant.caseSensitive) {
    const word = variant.words[0] as string;
    tokens.forEach((token, index) => {
      if (token.raw === word || token.raw === `${word}s`) found.push({ from: index, to: index, start: token.start, end: token.end });
    });
    return found;
  }
  const keys = variant.keys;
  for (let i = 0; i + keys.length <= tokens.length; i += 1) {
    let fits = true;
    for (let k = 0; k < keys.length && fits; k += 1) {
      const token = tokens[i + k] as Token;
      if (token.key !== keys[k]) fits = false;
      else if (k > 0 && !JOINER.test(text.slice((tokens[i + k - 1] as Token).end, token.start))) fits = false;
    }
    if (fits) found.push({ from: i, to: i + keys.length - 1, start: (tokens[i] as Token).start, end: (tokens[i + keys.length - 1] as Token).end });
  }
  return found;
}

export interface Hit {
  /** Which variant of the block matched (an index into block.variants). */
  variantIndex: number;
  field: MatchField;
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface Snippet {
  field: MatchField;
  before: string;
  match: string;
  after: string;
}

export interface BlockMatch {
  block: Block;
  matched: boolean;
  /** Every place any variant was found, in field order and then text order. */
  hits: Hit[];
  /** The hit shown on the card: the strongest field, then the typed variant before a thesaurus one, then the earliest. */
  best: Hit | null;
  fields: MatchField[];
}

/** About `width` characters of the text around a match, cut at word edges, with the match marked apart. */
export function snippetOf(stream: FieldStream, hit: Pick<Hit, "start" | "end">, width = 80): Snippet {
  const { text } = stream;
  const match = text.slice(hit.start, hit.end);
  const room = Math.max(8, Math.floor((width - match.length) / 2));
  let from = Math.max(0, hit.start - room);
  let to = Math.min(text.length, hit.end + room);
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space !== -1 && space < hit.start) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > hit.end) to = space;
  }
  const before = `${from > 0 ? "…" : ""}${text.slice(from, hit.start)}`;
  const after = `${text.slice(hit.end, to)}${to < text.length ? "…" : ""}`;
  return { field: stream.field, before, match, after };
}

export function matchBlock(streams: readonly FieldStream[], block: Block): BlockMatch {
  const hits: Hit[] = [];
  for (const stream of streams) {
    block.variants.forEach((variant, variantIndex) => {
      for (const found of findVariant(stream, variant)) hits.push({ variantIndex, field: stream.field, ...found });
    });
  }
  hits.sort(
    (a, b) =>
      FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field) || a.variantIndex - b.variantIndex || a.start - b.start,
  );
  const fields = FIELD_ORDER.filter((field) => hits.some((hit) => hit.field === field));
  return { block, matched: hits.length > 0, hits, best: hits[0] ?? null, fields };
}

/** Which soft terms a result contains, and how many times each. */
export function matchSoft(streams: readonly FieldStream[], soft: readonly SoftTerm[]): Map<string, number> {
  const counts = new Map<string, number>();
  const wanted = new Map(soft.map((term) => [term.key, term.text]));
  for (const stream of streams) {
    for (const token of stream.tokens) {
      const text = wanted.get(token.key);
      if (text !== undefined) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Whether two blocks sit next to each other, in the order they were typed: some variant of the first ends on the token
 * just before some variant of the second begins, with only a space or hyphen between. Returns the field it was found in.
 */
export function adjacentIn(first: BlockMatch, second: BlockMatch, streams: readonly FieldStream[], fields: readonly MatchField[]): MatchField | null {
  for (const field of fields) {
    const stream = streams.find((candidate) => candidate.field === field);
    if (stream === undefined) continue;
    for (const a of first.hits) {
      if (a.field !== field) continue;
      for (const b of second.hits) {
        if (b.field !== field || b.from !== a.to + 1) continue;
        if (JOINER.test(stream.text.slice(a.end, b.start))) return field;
      }
    }
  }
  return null;
}
