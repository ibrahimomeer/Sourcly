import { describe, expect, it } from "vitest";
import { parseConcepts } from "./concepts";
import {
  SUGGESTION_MAX_TERMS,
  SUGGESTION_MIN_RESULTS,
  SUGGESTION_MIN_SHOWN,
  SUGGESTION_POOL,
  suggestedTerms,
} from "./suggested";
import { makeResult } from "./testing/make-result";
import type { Result, Subject } from "./types";

const keyword = (term: string, provider: Subject["provider"] = "pubmed"): Subject => ({ term, kind: "keyword", provider });
const mesh = (term: string): Subject => ({ term, kind: "mesh", provider: "pubmed" });
const topic = (term: string): Subject => ({ term, kind: "topic", provider: "openalex" });
const withSubjects = (...subjects: Subject[]): Result => makeResult({ subjects });
const copies = (count: number, ...subjects: Subject[]): Result[] => Array.from({ length: count }, () => withSubjects(...subjects));
const query = parseConcepts("sleep memory");
const terms = (results: Result[], concepts = query) => suggestedTerms(results, concepts).map((t) => [t.term, t.count]);

describe("suggestedTerms: the thresholds", () => {
  it("states the thresholds: at least 3 results, at most 8 terms, at least 3 terms shown, from the top 30", () => {
    expect([SUGGESTION_MIN_RESULTS, SUGGESTION_MAX_TERMS, SUGGESTION_MIN_SHOWN, SUGGESTION_POOL]).toEqual([3, 8, 3, 30]);
  });

  it("never suggests a term that only one or two results carry", () => {
    const results = [
      ...copies(3, keyword("Dreaming"), keyword("REM sleep"), keyword("Hippocampus")),
      ...copies(1, keyword("Once only")),
      ...copies(2, keyword("Twice only")),
    ];
    const found = terms(results).map(([term]) => term);
    expect(found).toEqual(["Dreaming", "Hippocampus", "REM sleep"]);
    expect(found).not.toContain("Once only");
    expect(found).not.toContain("Twice only");
  });

  it("shows nothing when fewer than 3 terms qualify", () => {
    expect(suggestedTerms(copies(5, keyword("Dreaming"), keyword("Hippocampus")), query)).toEqual([]);
    expect(suggestedTerms(copies(5, keyword("Dreaming")), query)).toEqual([]);
    expect(suggestedTerms(copies(5, keyword("Dreaming"), keyword("Hippocampus"), keyword("Amygdala")), query)).toHaveLength(3);
  });

  it("gives at most 8 terms, the most common first, ties in alphabetical order", () => {
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
    const results = [...copies(4, ...names.slice(0, 5).map((n) => keyword(n))), ...copies(3, ...names.slice(5).map((n) => keyword(n)))];
    const found = suggestedTerms(results, query);
    expect(found).toHaveLength(8);
    expect(found.map((t) => t.term)).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"]);
    expect(found.slice(0, 5).every((t) => t.count === 4)).toBe(true);
  });

  it("reads only the first 30 results", () => {
    const results = [...copies(30, keyword("Common one"), keyword("Common two"), keyword("Common three")), ...copies(20, keyword("Late term"))];
    const found = suggestedTerms(results, query);
    expect(found.map((t) => t.term)).not.toContain("Late term");
    expect(found.every((t) => t.count === 30)).toBe(true);
  });

  it("counts a term once per result, however many times that result carries it", () => {
    const results = [withSubjects(keyword("Dreaming"), keyword("dreaming"), mesh("Dreaming")), withSubjects(keyword("Dreaming")), ...copies(2, keyword("Hippocampus"), keyword("Amygdala"))];
    expect(terms(results)).toEqual([]);
    const three = [...results, withSubjects(keyword("Dreaming"), keyword("Hippocampus"), keyword("Amygdala"))];
    expect(terms(three).find(([term]) => term === "Dreaming")?.[1]).toBe(3);
  });
});

describe("suggestedTerms: where terms come from", () => {
  it("uses author keywords and MeSH headings, never topics or OpenAlex's own keywords", () => {
    const results = copies(4, keyword("Dreaming"), mesh("Memory Consolidation"), topic("Sleep Disorders"), keyword("Machine tag", "openalex"), { term: "Neuroscience", kind: "subject", provider: "crossref" });
    expect(terms(results).map(([term]) => term)).toEqual([]);
    const enough = copies(4, keyword("Dreaming"), mesh("Memory Consolidation"), keyword("Hippocampus"), topic("Sleep Disorders"), keyword("Machine tag", "openalex"));
    expect(terms(enough).map(([term]) => term)).toEqual(["Dreaming", "Hippocampus", "Memory Consolidation"]);
  });

  it("leaves out MeSH's routine tags for species and age group", () => {
    const results = copies(5, mesh("Humans"), mesh("Adult"), mesh("Male"), mesh("Dreams"), keyword("Hippocampus"), keyword("Amygdala"));
    expect(terms(results).map(([term]) => term)).toEqual(["Amygdala", "Dreams", "Hippocampus"]);
  });

  it("leaves out a term the search already covers, in any of its variants", () => {
    const concepts = parseConcepts("machine learning odor");
    const results = copies(4, keyword("Odour"), keyword("Olfaction"), keyword("Deep learning"), keyword("Odor"), keyword("Molecular structure"), keyword("Perception"), keyword("Receptors"));
    expect(suggestedTerms(results, concepts).map((t) => t.term)).toEqual(["Molecular structure", "Perception", "Receptors"]);
  });

  it("says whether a term is an author keyword, a MeSH heading, or both", () => {
    const results = copies(3, keyword("Dreaming"), mesh("Dreaming"), keyword("Hippocampus"), mesh("Amygdala"));
    const found = suggestedTerms(results, query);
    expect(found.map((t) => [t.term, t.kinds])).toEqual([
      ["Amygdala", ["mesh"]],
      ["Dreaming", ["keyword", "mesh"]],
      ["Hippocampus", ["keyword"]],
    ]);
  });

  it("is the same for the same results, and does not change them", () => {
    const results = copies(4, keyword("Dreaming"), keyword("Hippocampus"), keyword("Amygdala"));
    const before = JSON.stringify(results);
    expect(JSON.stringify(suggestedTerms(results, query))).toBe(JSON.stringify(suggestedTerms(results, query)));
    expect(JSON.stringify(results)).toBe(before);
  });
});
