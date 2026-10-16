import { hardBlocks, parseConcepts, type Block, type ConceptQuery, type Variant } from "./concepts";
import type { ParsedQuery, RenderedQuery } from "./query";
import type { QuerySyntax } from "./types";

// Writing a concept query for a source. Each block becomes an OR-group of its variants, with AND between blocks:
//
//   ("AI" OR "artificial intelligence" OR "machine learning") AND (odor OR odour OR olfaction)
//
// in the syntax the source understands. A source that cannot say OR (Crossref, Semantic Scholar) or cannot nest it
// (Wikipedia) is sent the typed words of each concept instead, and the page says so; the local matching then judges
// every result it returns by all the variants.

/** What is accepted wherever a query is expected: text, a parsed query, or concept blocks. */
export function toConcepts(query: string | ParsedQuery | ConceptQuery): ConceptQuery {
  if (typeof query === "string") return parseConcepts(query.trim());
  if ("blocks" in query) return query;
  return parseConcepts(query.original.trim(), { exact: query.exact === true });
}

const OPERATORS = new Set(["AND", "OR", "NOT"]);
const quoted = (text: string) => `"${text.replace(/"/g, "")}"`;

type Leaf = (variant: Variant) => string;

function bare(variant: Variant): string {
  if (variant.words.length > 1 || variant.text.includes("-")) return quoted(variant.text);
  return OPERATORS.has(variant.text.toUpperCase()) ? quoted(variant.text) : variant.text;
}

const LEAVES: Record<"boolean" | "pubmed" | "europepmc", Leaf> = {
  boolean: bare,
  // [tiab] is PubMed's Title/Abstract field. A field tag also turns off PubMed's automatic term mapping, so every variant is tagged on its own.
  pubmed: (variant) => `${variant.words.length > 1 || variant.text.includes("-") || OPERATORS.has(variant.text.toUpperCase()) ? quoted(variant.text) : variant.text}[tiab]`,
  europepmc: (variant) => `TITLE_ABS:${variant.words.length > 1 || variant.text.includes("-") || OPERATORS.has(variant.text.toUpperCase()) ? quoted(variant.text) : variant.text}`,
};

const orGroup = (leaves: string[]): string => (leaves.length === 1 ? (leaves[0] as string) : `(${leaves.join(" OR ")})`);

function booleanQuery(query: ConceptQuery, leaf: Leaf): string {
  const parts = query.blocks.map((block: Block) => orGroup(block.variants.map(leaf)));
  if (parts.length === 0) return "";
  let text = parts.join(" AND ");
  for (const exclusion of query.exclusions) text += ` NOT ${leaf(exclusion)}`;
  return text;
}

/** The notes for a source that is sent only the typed words. */
function plainNotes(query: ConceptQuery, hard: Block[], syntax: "plain" | "plain-spaced" | "boolean-flat"): string[] {
  const notes: string[] = [];
  if (hard.some((block) => block.variants.length > 1)) {
    notes.push("This source cannot ask for alternatives (“either word”), so it was sent only the words you typed for each concept; results are checked here against every variant");
  }
  if (query.exclusions.length > 0 && syntax !== "boolean-flat") {
    const left = [...new Set(query.exclusions.map((variant) => `“${variant.text}”`))];
    notes.push(`This source cannot leave words out, so results containing ${left.join(", ")} can still appear`);
  }
  if (syntax !== "boolean-flat" && hard.some((block) => (block.variants[0]?.words.length ?? 1) > 1)) {
    notes.push("This source cannot match a phrase, so it searches for the words of the phrase separately");
  }
  if (query.blocks.some((block) => block.kind === "lexicon" && block.variants.length > 1)) {
    notes.push("This source cannot ask for “any of these terms”, so it was sent only the rest of your search; its results that contain none of the terms rank lower");
  }
  if (syntax === "plain-spaced" && hard.some((block) => block.variants[0]?.text.includes("-"))) {
    notes.push("Hyphens were replaced by spaces, because this source finds nothing for a hyphenated word");
  }
  return notes;
}

/** Renders a concept query for a source's syntax. `exact` queries are sent as typed. */
export function renderConcepts(query: ConceptQuery, syntax: QuerySyntax): RenderedQuery {
  if (query.exact) return { text: query.original.trim(), notes: ["Sent exactly as typed"] };
  const hard = hardBlocks(query);
  if (hard.length === 0) return { text: "", notes: [] };

  if (syntax === "boolean" || syntax === "pubmed" || syntax === "europepmc") {
    return { text: booleanQuery(query, LEAVES[syntax]), notes: [] };
  }

  // “Any of these terms” with a single term is that term, a required word like any other.
  const required = query.blocks.filter((block) => block.kind === "hard" || (block.kind === "lexicon" && block.variants.length === 1));

  if (syntax === "boolean-flat") {
    // One variant per concept, joined with AND: Wikipedia ignores a group of alternatives inside a larger search.
    const typed = required.map((block) => bare(block.variants[0] as Variant));
    let text = typed.join(" AND ");
    for (const exclusion of query.exclusions) text += ` NOT ${bare(exclusion)}`;
    return { text, notes: plainNotes(query, hard, "boolean-flat") };
  }

  // Plain words: the typed variant of each concept, once each.
  const words: string[] = [];
  const seen = new Set<string>();
  for (const block of required) {
    const typed = block.variants[0] as Variant;
    const text = syntax === "plain-spaced" ? typed.text.replace(/-/g, " ") : typed.text.replace(/-/g, "-");
    for (const word of text.split(/\s+/)) {
      if (word === "" || seen.has(word.toLowerCase())) continue;
      seen.add(word.toLowerCase());
      words.push(word);
    }
  }
  return { text: words.join(" "), notes: plainNotes(query, hard, syntax) };
}
