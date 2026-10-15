import { hardBlocks, parseConcepts } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import { addTermToQuery, explainUnusable, prepareSearch } from "./queryText";

const labels = (text: string, options = {}) => hardBlocks(prepareSearch(text, options).concepts).map((block) => block.label);

describe("prepareSearch", () => {
  it("reads the text trimmed, and never offers a different text to put in the box", () => {
    const prepared = prepareSearch('  "memory consolidation"   sleep  ');
    expect(prepared.usable).toBe(true);
    expect(prepared.concepts.original).toBe('"memory consolidation"   sleep');
    expect("box" in prepared).toBe(false);
  });

  it("reads a question as concepts and lists the common and generic words it did not require", () => {
    const prepared = prepareSearch("What is the effect of sleep on memory consolidation?");
    expect(prepared.usable).toBe(true);
    expect(labels("What is the effect of sleep on memory consolidation?")).toEqual(["sleep", "memory", "consolidation"]);
    expect(prepared.concepts.stopwords).toEqual(["what", "is", "the", "of", "on"]);
    expect(prepared.concepts.soft.map((term) => term.text)).toEqual(["effect"]);
    expect(prepared.concepts.original).toBe("What is the effect of sleep on memory consolidation?");
  });

  it("passes the options on: exactly as typed, and the curated synonyms off", () => {
    const exact = prepareSearch("what is chaos", { exact: true });
    expect(exact.concepts.exact).toBe(true);
    expect(labels("what is chaos", { exact: true })).toEqual(["what", "is", "chaos"]);
    expect(exact.usable).toBe(true);
    expect(prepareSearch("how AI understand odor", { synonyms: false }).concepts.expanded).toBe(false);
    expect(prepareSearch("how AI understand odor").concepts.expanded).toBe(true);
  });

  it("keeps common words inside quotes", () => {
    const prepared = prepareSearch('"to be or not to be" AND hamlet');
    expect(prepared.concepts.stopwords).toEqual([]);
    expect(labels('"to be or not to be" AND hamlet')).toEqual(["to be or not to be", "hamlet"]);
  });

  it("is not usable when only common words or only exclusions are typed", () => {
    expect(prepareSearch("what is the").usable).toBe(false);
    expect(prepareSearch("NOT rats").usable).toBe(false);
    expect(prepareSearch("   ").usable).toBe(false);
  });

  it("is usable when only common words are typed but they are searched exactly as typed", () => {
    expect(prepareSearch("what is the", { exact: true }).usable).toBe(true);
  });
});

describe("explainUnusable", () => {
  it("names the common words when that is all there was, and says how to search them", () => {
    expect(explainUnusable(parseConcepts("what is the what"))).toBe(
      "Everything in “what is the what” is a common word that searches leave out (what, is, the). Add a more specific word, or turn on “Search exactly as typed” in Settings.",
    );
  });

  it("explains a query that only excludes things", () => {
    expect(explainUnusable(parseConcepts("NOT rats"))).toBe("A search needs at least one word to look for, not only words to leave out.");
  });

  it("asks for words when there is nothing at all", () => {
    expect(explainUnusable(parseConcepts(""))).toBe("Type some words to search for.");
  });
});

describe("addTermToQuery", () => {
  it("adds a single word after the existing query", () => {
    expect(addTermToQuery("sleep memory", "Dreams")).toBe("sleep memory Dreams");
  });

  it("puts a term of several words in quotes so it stays together", () => {
    expect(addTermToQuery("sleep", "Memory Consolidation")).toBe('sleep "Memory Consolidation"');
  });

  it("fills an empty box with just the term", () => {
    expect(addTermToQuery("", "Dreams")).toBe("Dreams");
    expect(addTermToQuery("   ", "Sleep Disorders")).toBe('"Sleep Disorders"');
  });

  it("changes nothing when the term is already in the query, in any case", () => {
    expect(addTermToQuery("sleep dreams", "Dreams")).toBe("sleep dreams");
    expect(addTermToQuery('sleep "memory consolidation"', "Memory Consolidation")).toBe('sleep "memory consolidation"');
  });

  it("does not mistake a longer word for the term", () => {
    expect(addTermToQuery("sleeping", "sleep")).toBe("sleeping sleep");
  });

  it("wraps a query that has a top-level OR, so the term narrows all of it", () => {
    expect(addTermToQuery("sleep OR nap", "memory")).toBe("(sleep OR nap) memory");
    expect(addTermToQuery("(sleep OR nap) rest", "memory")).toBe("(sleep OR nap) rest memory");
  });

  it("strips quotes and stray spaces out of the term, and ignores an empty one", () => {
    expect(addTermToQuery("sleep", '  "Rapid  Eye" Movement ')).toBe('sleep "Rapid Eye Movement"');
    expect(addTermToQuery("sleep", '""')).toBe("sleep");
    expect(addTermToQuery("sleep", "")).toBe("sleep");
  });

  it("gives a box that reads back as the query plus the term", () => {
    const text = addTermToQuery("sleep NOT rats", "Memory Consolidation");
    expect(prepareSearch(text).concepts.original).toBe('sleep NOT rats "Memory Consolidation"');
    expect(labels(text)).toEqual(["sleep", "Memory Consolidation"]);
    expect(prepareSearch(text).usable).toBe(true);
  });
});
