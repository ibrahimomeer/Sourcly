import { isAllCapsTerm, looksLikeQuestion, splitWords } from "./query";
import { SOFT_TERMS } from "./softterms";
import { STOPWORDS } from "./stopwords";
import { KNOWN_PHRASES, THESAURUS, type ThesaurusType } from "./thesaurus";
import { normalizeWord } from "./tokens";

// The concept-block query model. A search is read as a list of CONCEPTS, not a list of words:
//
//   "How AI understand odor"  ->  AI (artificial intelligence, machine learning, ...)  and  odor (odour, olfaction, ...)
//
// - Every word falls in one of three classes. A STOPWORD ("how", "what", "can", "the") is never searched. A SOFT term
//   (generic academic filler such as "understand", "using", "novel") is not required and only gives a small boost.
//   Everything else is HARD: it is a block that a result MUST match.
// - A quoted phrase is one hard block. Words typed next to each other that the thesaurus knows as one phrase
//   ("machine learning", "climate change") are one block. An all-capital word (AI, CAN, US) is always hard and is
//   matched with its capitals exactly.
// - Each block is the typed word plus its variants from the curated thesaurus (thesaurus.ts). A result matches the
//   block if it contains ANY variant. A quoted phrase is never expanded: quotes mean exactly this.
// If a query has no hard terms, every non-stopword counts as hard.
//
// Everything is deterministic: the same text and options always give the same blocks.

export type VariantOrigin = "typed" | "thesaurus";

export interface Variant {
  /** As written and as sent to a source: "machine learning", "AI". */
  text: string;
  words: string[];
  /** Normalized keys of the words, for case-insensitive matching (lowercase, accents folded, plural folded). */
  keys: string[];
  /** An abbreviation such as AI or CNN: matched as a whole word with its capitals exactly (and its plural). */
  caseSensitive: boolean;
  origin: VariantOrigin;
  /** For a thesaurus variant: what kind of entry it came from, and its one-line note. */
  entryType?: ThesaurusType;
  note?: string;
}

export interface Block {
  /** "b1", "b2", ... in the order the concepts were typed. */
  id: string;
  /** What the person typed: "odor", "machine learning", "AI". */
  label: string;
  /** The typed variant first, then the thesaurus variants. */
  variants: Variant[];
  /** "hard": a result must match it. "lexicon": the counterargument terms; sent to sources but not part of coverage. */
  kind: "hard" | "lexicon";
  /** The words came from quotes, or from an OR group the person wrote: never expanded. */
  quoted: boolean;
}

export interface SoftTerm {
  text: string;
  key: string;
}

export interface ConceptQuery {
  original: string;
  blocks: Block[];
  soft: SoftTerm[];
  /** The words that were never searched (how, what, can, the ...), lowercase, in order. */
  stopwords: string[];
  /** Words and phrases after NOT. */
  exclusions: Variant[];
  /** The thesaurus was used. */
  expanded: boolean;
  /** "Search exactly as typed": no stopword removal, no soft terms, no thesaurus, the raw text is what is sent. */
  exact: boolean;
  /** The query had no hard terms, so its soft words were made hard. */
  promotedSoft: boolean;
  looksLikeQuestion: boolean;
}

export interface ConceptOptions {
  exact?: boolean;
  /** Use the curated thesaurus. Default true. */
  synonyms?: boolean;
}

// ---- Words and keys

/** Lowercase, accents removed, apostrophes removed. */
export function foldWord(word: string): string {
  return word.toLowerCase().replace(/đ/g, "d").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "");
}

/** The key a word is compared by: folded, and unless `exact`, with a plural taken off. */
export function keyOf(word: string, exact = false): string {
  const folded = foldWord(word);
  return exact ? folded : normalizeWord(folded);
}

/** An all-capital abbreviation: one token of 2 to 6 capitals and digits with at least one capital letter. */
export function isAbbreviation(words: readonly string[]): boolean {
  const only = words.length === 1 ? words[0] : undefined;
  return only !== undefined && /^[\p{Lu}\p{N}]{2,6}$/u.test(only) && /\p{Lu}/u.test(only);
}

function makeVariant(text: string, origin: VariantOrigin, exact: boolean, extra: Partial<Variant> = {}): Variant | null {
  const words = splitWords(text).flatMap((word) => word.split("-")).filter((word) => word !== "");
  if (words.length === 0) return null;
  return {
    text: words.length === 1 && !text.includes("-") ? (words[0] as string) : text.trim().replace(/\s+/g, " "),
    words,
    keys: words.map((word) => keyOf(word, exact)),
    caseSensitive: isAbbreviation(words),
    origin,
    ...extra,
  };
}

/** Two variants are the same thing when their keys and case rule agree. */
export const variantSignature = (variant: Variant): string => `${variant.caseSensitive ? "cs" : "ci"}:${variant.keys.join(" ")}`;

// ---- The thesaurus, indexed

interface IndexHit {
  variants: readonly string[];
  type: ThesaurusType;
  note: string;
}

const INDEX = new Map<string, IndexHit[]>();
const PHRASES = new Set<string>();

function indexKey(words: readonly string[]): string {
  return isAbbreviation(words) ? `cs:${words[0]}` : `ci:${words.map((word) => keyOf(word)).join(" ")}`;
}
const wordsOfText = (text: string) => splitWords(text).flatMap((word) => word.split("-")).filter((word) => word !== "");

function addToIndex(words: readonly string[], hit: IndexHit): void {
  if (words.length === 0) return;
  const key = indexKey(words);
  INDEX.set(key, [...(INDEX.get(key) ?? []), hit]);
}

(() => {
  for (const phrase of KNOWN_PHRASES) {
    const words = wordsOfText(phrase);
    if (words.length >= 2) PHRASES.add(`ci:${words.map((word) => keyOf(word)).join(" ")}`);
  }
  for (const entry of THESAURUS) {
    const terms = typeof entry.term === "string" ? [entry.term] : entry.term;
    for (const term of terms) {
      const termWords = wordsOfText(term);
      if (termWords.length >= 2) PHRASES.add(indexKey(termWords));
      addToIndex(termWords, { variants: entry.variants, type: entry.type, note: entry.note });
      if (entry.type === "synonym") continue;
      // Spellings and abbreviations work both ways: a variant brings the term and the other variants.
      for (const variant of entry.variants) {
        const others = [term, ...entry.variants.filter((other) => other !== variant)];
        addToIndex(wordsOfText(variant), { variants: others, type: entry.type, note: entry.note });
      }
    }
  }
})();

/** The most variants a block may carry besides the typed one, so a query to a source stays short. */
export const MAX_VARIANTS = 8;

function thesaurusVariants(typed: Variant, exact: boolean): Variant[] {
  const hits = INDEX.get(typed.caseSensitive ? `cs:${typed.words[0]}` : `ci:${typed.keys.join(" ")}`) ?? [];
  const seen = new Set<string>([variantSignature(typed)]);
  const out: Variant[] = [];
  for (const hit of hits) {
    for (const text of hit.variants) {
      const variant = makeVariant(text, "thesaurus", exact, { entryType: hit.type, note: hit.note });
      if (variant === null) continue;
      const signature = variantSignature(variant);
      if (seen.has(signature)) continue;
      seen.add(signature);
      out.push(variant);
      if (out.length >= MAX_VARIANTS) return out;
    }
  }
  return out;
}

// ---- Reading the text

type Tok =
  | { k: "word"; text: string; joined: boolean }
  | { k: "quoted"; words: string[] }
  | { k: "op"; op: "AND" | "OR" | "NOT" }
  | { k: "(" }
  | { k: ")" };

type Item =
  | { t: "word"; text: string; joined: boolean }
  | { t: "phrase"; words: string[] }
  | { t: "or"; alts: Item[][] }
  | { t: "not"; items: Item[] };

const OPERATORS = new Set(["AND", "OR", "NOT"]);

function lex(text: string, exact: boolean, stopwords: string[]): Tok[] {
  const tokens: Tok[] = [];
  const hasLowercase = /\p{Ll}/u.test(text);
  let lastPlain = false;
  for (const match of text.matchAll(/"([^"]*)"?|[()]|[^\s()"]+/gu)) {
    const raw = match[0];
    if (raw.startsWith('"')) {
      const words = splitWords(match[1] ?? "");
      if (words.length > 0) tokens.push({ k: "quoted", words });
      lastPlain = false;
    } else if (raw === "(" || raw === ")") {
      tokens.push({ k: raw });
      lastPlain = false;
    } else if (OPERATORS.has(raw)) {
      tokens.push({ k: "op", op: raw as "AND" | "OR" | "NOT" });
      lastPlain = false;
    } else {
      for (const word of splitWords(raw)) {
        const lower = word.toLowerCase();
        if (!exact && STOPWORDS.has(lower) && !isAllCapsTerm(word, hasLowercase)) {
          stopwords.push(lower);
          lastPlain = false;
          continue;
        }
        tokens.push({ k: "word", text: word, joined: lastPlain });
        lastPlain = true;
      }
    }
  }
  return tokens;
}

function parseItems(tokens: Tok[]): Item[] {
  let pos = 0;

  function parseUnary(): Item[] {
    const token = tokens[pos];
    pos += 1;
    if (token === undefined) return [];
    switch (token.k) {
      case "word":
        return [{ t: "word", text: token.text, joined: token.joined }];
      case "quoted":
        return [{ t: "phrase", words: token.words }];
      case "(": {
        const inner = parseExpression();
        if (tokens[pos]?.k === ")") pos += 1;
        return inner;
      }
      case "op": {
        if (token.op !== "NOT") return [];
        const next = tokens[pos];
        if (next === undefined || next.k === ")" || (next.k === "op" && next.op !== "NOT")) return [];
        const inner = parseUnary();
        return inner.length === 0 ? [] : [{ t: "not", items: inner }];
      }
      case ")":
        return [];
    }
  }

  function parseExpression(): Item[] {
    const alternatives: Item[][] = [];
    let current: Item[] = [];
    while (pos < tokens.length && tokens[pos]?.k !== ")") {
      const token = tokens[pos];
      if (token?.k === "op" && token.op === "OR") {
        pos += 1;
        alternatives.push(current);
        current = [];
        continue;
      }
      if (token?.k === "op" && token.op === "AND") {
        pos += 1;
        continue;
      }
      current.push(...parseUnary());
    }
    if (alternatives.length === 0) return current;
    alternatives.push(current);
    // A NOT applies to the whole search, not to the one alternative it was typed in, so it is taken out of the alternatives.
    const negations = alternatives.flatMap((alternative) => alternative.filter((item) => item.t === "not"));
    const filled = alternatives.map((alternative) => alternative.filter((item) => item.t !== "not")).filter((alternative) => alternative.length > 0);
    if (filled.length === 0) return negations;
    return [...(filled.length === 1 ? (filled[0] as Item[]) : [{ t: "or" as const, alts: filled }]), ...negations];
  }

  const items: Item[] = [];
  while (pos < tokens.length) {
    items.push(...parseExpression());
    if (tokens[pos]?.k === ")") pos += 1;
  }
  return items;
}

const SOFT = new Set(SOFT_TERMS);

/** The words of an item sequence as one phrase (an alternative or a negated group written as several words). */
function wordsOfItems(items: readonly Item[]): string[] {
  return items.flatMap((item): string[] => {
    if (item.t === "word") return wordsOfText(item.text);
    if (item.t === "phrase") return item.words.flatMap(wordsOfText);
    return [];
  });
}

interface Build {
  blocks: Block[];
  soft: SoftTerm[];
  exclusions: Variant[];
}

function buildBlocks(items: readonly Item[], exact: boolean, synonyms: boolean, softAsHard: boolean): Build {
  const out: Build = { blocks: [], soft: [], exclusions: [] };
  const seen = new Set<string>();
  let counter = 0;

  const pushBlock = (label: string, typed: Variant, quoted: boolean, extra: Variant[] = []): void => {
    const signature = `${typed.caseSensitive ? "cs" : "ci"}:${typed.keys.join(" ")}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    counter += 1;
    const variants = [typed, ...extra];
    if (!quoted && synonyms && !exact) variants.push(...thesaurusVariants(typed, exact));
    out.blocks.push({ id: `b${counter}`, label, variants, kind: "hard", quoted });
  };

  const wordBlock = (text: string): void => {
    const typed = makeVariant(text, "typed", exact);
    if (typed !== null) pushBlock(typed.text, typed, false);
  };

  const consumeRun = (run: readonly Extract<Item, { t: "word" }>[]): void => {
    let p = 0;
    while (p < run.length) {
      let merged = false;
      if (!exact) {
        for (let n = Math.min(4, run.length - p); n >= 2 && !merged; n -= 1) {
          const slice = run.slice(p, p + n);
          if (slice.some((word) => isAbbreviation([word.text]))) continue;
          const words = slice.flatMap((word) => wordsOfText(word.text));
          if (!PHRASES.has(`ci:${words.map((word) => keyOf(word)).join(" ")}`)) continue;
          const typed = makeVariant(slice.map((word) => word.text).join(" "), "typed", exact);
          if (typed !== null) pushBlock(typed.text, typed, false);
          p += n;
          merged = true;
        }
      }
      if (merged) continue;
      const word = run[p] as Extract<Item, { t: "word" }>;
      p += 1;
      const lower = word.text.toLowerCase();
      if (!exact && !softAsHard && !isAbbreviation([word.text]) && SOFT.has(lower)) {
        if (!out.soft.some((soft) => soft.key === keyOf(lower))) out.soft.push({ text: lower, key: keyOf(lower) });
        continue;
      }
      wordBlock(word.text);
    }
  };

  let i = 0;
  while (i < items.length) {
    const item = items[i] as Item;
    if (item.t === "word") {
      let j = i;
      while (j + 1 < items.length && (items[j + 1] as Item).t === "word" && ((items[j + 1] as Extract<Item, { t: "word" }>).joined)) j += 1;
      consumeRun(items.slice(i, j + 1) as Extract<Item, { t: "word" }>[]);
      i = j + 1;
      continue;
    }
    if (item.t === "phrase") {
      const typed = makeVariant(item.words.join(" "), "typed", exact);
      if (typed !== null) pushBlock(typed.text, typed, true);
    } else if (item.t === "or") {
      const alternatives = item.alts
        .map((alternative) => makeVariant(wordsOfItems(alternative).join(" "), "typed", exact))
        .filter((variant): variant is Variant => variant !== null);
      const [first, ...rest] = alternatives;
      if (first !== undefined) pushBlock(alternatives.map((variant) => variant.text).join(" OR "), first, true, rest);
    } else {
      const inner = item.items;
      const groups = inner.length === 1 && (inner[0] as Item).t === "or" ? (inner[0] as Extract<Item, { t: "or" }>).alts : [inner];
      for (const group of groups) {
        const variant = makeVariant(wordsOfItems(group).join(" "), "typed", exact);
        if (variant !== null) out.exclusions.push(variant);
      }
    }
    i += 1;
  }
  return out;
}

/** Reads a search as concept blocks. See the top of this file for the rules. */
export function parseConcepts(text: string, options: ConceptOptions = {}): ConceptQuery {
  const exact = options.exact === true;
  const synonyms = options.synonyms !== false && !exact;
  const stopwords: string[] = [];
  const items = parseItems(lex(text, exact, stopwords));

  let built = buildBlocks(items, exact, synonyms, false);
  let promotedSoft = false;
  // A query made only of generic words still has to search for something: then they count as hard.
  if (built.blocks.length === 0 && built.soft.length > 0) {
    built = buildBlocks(items, exact, synonyms, true);
    promotedSoft = true;
  }
  return {
    original: text,
    blocks: built.blocks,
    soft: promotedSoft ? [] : built.soft,
    stopwords: [...new Set(stopwords)],
    exclusions: built.exclusions,
    expanded: synonyms && built.blocks.some((block) => block.variants.some((variant) => variant.origin === "thesaurus")),
    exact,
    promotedSoft,
    looksLikeQuestion: looksLikeQuestion(text),
  };
}

// ---- Working with a ConceptQuery

export const hardBlocks = (query: ConceptQuery): Block[] => query.blocks.filter((block) => block.kind === "hard");

/** True when the query has at least one concept to search for. */
export function isUsableConcepts(query: ConceptQuery): boolean {
  return hardBlocks(query).length > 0;
}

/** The query without one block (a fallback pass drops one concept at a time). */
export function withoutBlock(query: ConceptQuery, blockId: string): ConceptQuery {
  return { ...query, blocks: query.blocks.filter((block) => block.id !== blockId) };
}

/** The counterargument terms as one more block, "any of these". Sources that cannot say it are sent the rest. */
export function withLexicon(query: ConceptQuery, terms: readonly string[]): ConceptQuery {
  const variants: Variant[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    const variant = makeVariant(term, "typed", false);
    if (variant === null) continue;
    const signature = variantSignature(variant);
    if (seen.has(signature)) continue;
    seen.add(signature);
    variants.push({ ...variant, caseSensitive: false });
  }
  if (variants.length === 0) return query;
  const block: Block = { id: "lex", label: variants.map((variant) => variant.text).join(" OR "), variants, kind: "lexicon", quoted: true };
  return { ...query, blocks: [...query.blocks.filter((other) => other.kind !== "lexicon"), block] };
}

/** What a block is called when it is shown: "odor (odour, odorant, olfaction ...)". */
export function describeBlock(block: Block): string {
  const typed = block.variants[0]?.text ?? block.label;
  const rest = block.variants.slice(1).map((variant) => variant.text);
  return rest.length === 0 ? typed : `${typed} (${rest.join(", ")})`;
}
