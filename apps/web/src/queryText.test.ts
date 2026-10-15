import { formatQuery, parseQuery, queryTerms } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import { addTermToQuery, droppedWords, explainUnusable, prepareSearch } from "./queryText";

describe("prepareSearch", () => {
  it("reads the text trimmed, and never offers a different text to put in the box", () => {
    const prepared = prepareSearch('  "memory consolidation"   sleep  ');
    expect(prepared.usable).toBe(true);
    expect(prepared.parsed.original).toBe('"memory consolidation"   sleep');
    expect("box" in prepared).toBe(false);
  });

  it("reads a question as keywords and lists the common words it did not use", () => {
    const prepared = prepareSearch("What is the effect of sleep on memory consolidation?");
    expect(prepared.usable).toBe(true);
    expect(formatQuery(prepared.parsed)).toBe("effect sleep memory consolidation");
    expect(prepared.parsed.droppedStopwords).toEqual(["what", "is", "the", "of", "on"]);
    expect(prepared.parsed.original).toBe("What is the effect of sleep on memory consolidation?");
  });

  it("passes the options on: nothing dropped, a word restored, a term left out", () => {
    expect(prepareSearch("what is chaos", { ignoreCommon: false }).parsed.droppedStopwords).toEqual([]);
    expect(queryTerms(prepareSearch("what is chaos", { restored: new Set(["is"]) }).parsed)).toEqual(["is", "chaos"]);
    expect(queryTerms(prepareSearch("sleep memory", { excluded: new Set(["memory"]) }).parsed)).toEqual(["sleep"]);
  });

  it("can be asked to search exactly as typed", () => {
    const prepared = prepareSearch("what is chaos", { exact: true });
    expect(prepared.parsed.exact).toBe(true);
    expect(prepared.usable).toBe(true);
  });

  it("keeps common words inside quotes", () => {
    const prepared = prepareSearch('"to be or not to be" AND hamlet');
    expect(prepared.parsed.droppedStopwords).toEqual([]);
    expect(formatQuery(prepared.parsed)).toBe('"to be or not to be" hamlet');
  });

  it("is not usable when only common words or only exclusions are typed", () => {
    expect(prepareSearch("what is the").usable).toBe(false);
    expect(prepareSearch("NOT rats").usable).toBe(false);
    expect(prepareSearch("   ").usable).toBe(false);
  });

  it("is usable when only common words are typed but dropping is off, or one is restored", () => {
    expect(prepareSearch("what is the", { ignoreCommon: false }).usable).toBe(true);
    expect(prepareSearch("what is the", { restored: new Set(["what"]) }).usable).toBe(true);
  });

  it("is not usable when every term was left out", () => {
    expect(prepareSearch("sleep", { excluded: new Set(["sleep"]) }).usable).toBe(false);
  });
});

describe("explainUnusable", () => {
  it("names the common words when that is all there was, and says how to use them", () => {
    expect(explainUnusable(parseQuery("what is the what"))).toBe(
      "Everything in “what is the what” is a common word that searches leave out (what, is, the). Click one of the dashed words below to use it, turn off “Ignore common words”, or add a more specific word.",
    );
  });

  it("says so when every term was left out", () => {
    expect(explainUnusable(parseQuery("sleep", { excluded: new Set(["sleep"]) }))).toBe(
      "Every term has been left out. Click a dashed word below to use it again.",
    );
  });

  it("explains a query that only excludes things", () => {
    expect(explainUnusable(parseQuery("NOT rats"))).toBe("A search needs at least one word to look for, not only words to leave out.");
  });

  it("asks for words when there is nothing at all", () => {
    expect(explainUnusable(parseQuery(""))).toBe("Type some words to search for.");
  });
});

describe("droppedWords", () => {
  it("lists each removed common word once, in order", () => {
    expect(droppedWords(parseQuery("what is the effect of the sleep"))).toEqual(["what", "is", "the", "of"]);
    expect(droppedWords(parseQuery("sleep"))).toEqual([]);
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
    expect(prepareSearch(text).parsed.original).toBe('sleep NOT rats "Memory Consolidation"');
    expect(prepareSearch(text).usable).toBe(true);
  });
});
