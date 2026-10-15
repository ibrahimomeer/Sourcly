import type { ParsedQuery, QueryNode } from "@sourcly/core";
import { droppedWords } from "./queryText";

// What the search is going to look for, as chips the person can click. This is only a way to show
// the parsed query: the text in the search box is never changed by it.

export type ChipTree =
  | { kind: "term"; /** What a click on it excludes: the lowercase word, or the lowercase words of a phrase. */ key: string; text: string; phrase: boolean }
  | { kind: "and"; items: ChipTree[] }
  | { kind: "or"; items: ChipTree[] }
  | { kind: "not"; item: ChipTree };

export interface QueryChipsModel {
  /** The terms that will be searched for, or null when there are none. */
  terms: ChipTree | null;
  /** Common words that were not used, each once, lowercase. Clicking one restores it. */
  ignored: string[];
  /** Terms the person left out, as typed. Clicking one restores it. */
  leftOut: { key: string; text: string }[];
  /** The note shown when a question was reduced to keywords, or null. */
  questionNote: string | null;
}

function tree(node: QueryNode): ChipTree {
  switch (node.type) {
    case "word":
      return { kind: "term", key: node.text.toLowerCase(), text: node.text, phrase: false };
    case "phrase":
      return { kind: "term", key: node.text.toLowerCase(), text: node.text, phrase: true };
    case "and":
      return { kind: "and", items: node.items.map(tree) };
    case "or":
      return { kind: "or", items: node.items.map(tree) };
    case "not":
      return { kind: "not", item: tree(node.item) };
  }
}

/** The words and phrases of the query in order, each once (by key): what "Searching for" lists. */
export function chipKeys(model: QueryChipsModel): string[] {
  const keys: string[] = [];
  const walk = (node: ChipTree | null) => {
    if (node === null) return;
    if (node.kind === "term") {
      if (!keys.includes(node.key)) keys.push(node.key);
    } else if (node.kind === "not") walk(node.item);
    else node.items.forEach(walk);
  };
  walk(model.terms);
  return keys;
}

export function queryChipsModel(parsed: ParsedQuery, keywordsText: string): QueryChipsModel {
  const ignored = droppedWords(parsed);
  return {
    terms: parsed.root === null ? null : tree(parsed.root),
    ignored,
    leftOut: (parsed.excludedTerms ?? []).map((text) => ({ key: text.toLowerCase(), text })),
    questionNote:
      parsed.looksLikeQuestion === true && ignored.length > 0 && keywordsText !== ""
        ? `Question reduced to keywords: ${keywordsText}. You can edit or restore words above.`
        : null,
  };
}
