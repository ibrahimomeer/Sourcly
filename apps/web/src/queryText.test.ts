import { parseQuery } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import { addTermToQuery, droppedWords, explainUnusable, prepareSearch } from "./queryText";

describe("prepareSearch", () => {
  it("leaves a search without common words exactly as typed (trimmed)", () => {
    const prepared = prepareSearch('  "memory consolidation"   sleep  ');
    expect(prepared.usable).toBe(true);
    expect(prepared.box).toBe('"memory consolidation"   sleep');
  });

  it("reduces a question to its keywords and puts them in the box for editing", () => {
    const prepared = prepareSearch("What is the effect of sleep on memory consolidation?");
    expect(prepared.usable).toBe(true);
    expect(prepared.box).toBe("effect sleep memory consolidation");
    expect(prepared.parsed.original).toBe("What is the effect of sleep on memory consolidation?");
  });

  it("is stable: searching the reduced text again reduces nothing more", () => {
    const first = prepareSearch("how does caffeine affect the sleep of teenagers");
    const again = prepareSearch(first.box);
    expect(again.box).toBe(first.box);
    expect(again.parsed.droppedStopwords).toEqual([]);
    expect(again.parsed.root).toEqual(first.parsed.root);
  });

  it("keeps common words inside quotes, and leaves the text as typed when nothing was removed", () => {
    const prepared = prepareSearch('"to be or not to be" AND hamlet');
    expect(prepared.box).toBe('"to be or not to be" AND hamlet');
    expect(prepared.parsed.droppedStopwords).toEqual([]);
  });

  it("keeps operators and quotes when it does tidy a query", () => {
    expect(prepareSearch('what is "memory consolidation" OR sleep NOT rats').box).toBe('"memory consolidation" OR sleep NOT rats');
  });

  it("is not usable when only common words or only exclusions are typed", () => {
    expect(prepareSearch("what is the").usable).toBe(false);
    expect(prepareSearch("NOT rats").usable).toBe(false);
    expect(prepareSearch("   ").usable).toBe(false);
  });
});

describe("explainUnusable", () => {
  it("names the common words when that is all there was", () => {
    expect(explainUnusable(parseQuery("what is the what"))).toBe(
      "Everything in “what is the what” is a common word that searches leave out (what, is, the). Add a more specific word.",
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
