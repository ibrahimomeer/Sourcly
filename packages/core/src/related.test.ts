import { describe, expect, it } from "vitest";
import { relatedTerms } from "./related";
import { makeResult } from "./testing/make-result";
import type { Result, Subject } from "./types";

const topic = (term: string): Subject => ({ term, kind: "topic", provider: "openalex" });
const mesh = (term: string): Subject => ({ term, kind: "mesh", provider: "pubmed" });
const keyword = (term: string): Subject => ({ term, kind: "keyword", provider: "openalex" });
const withSubjects = (...subjects: Subject[]): Result => makeResult({ subjects });

describe("relatedTerms", () => {
  it("ranks terms by how many of the results carry them", () => {
    const results = [
      withSubjects(topic("Sleep Disorders"), mesh("Memory Consolidation")),
      withSubjects(topic("Sleep Disorders"), mesh("Dreams")),
      withSubjects(topic("Sleep Disorders"), mesh("Memory Consolidation")),
    ];
    expect(relatedTerms(results, [])).toEqual([
      { term: "Sleep Disorders", count: 3, kinds: ["topic"] },
      { term: "Memory Consolidation", count: 2, kinds: ["mesh"] },
      { term: "Dreams", count: 1, kinds: ["mesh"] },
    ]);
  });

  it("breaks ties alphabetically, so the order never changes between runs", () => {
    const results = [withSubjects(topic("Zebra"), topic("apple"), topic("Mango"))];
    expect(relatedTerms(results, []).map((t) => t.term)).toEqual(["apple", "Mango", "Zebra"]);
  });

  it("uses only controlled vocabularies (topics and MeSH), never free-text keywords", () => {
    const results = [withSubjects(keyword("a free-text keyword"), topic("A Topic"), { term: "A Subject", kind: "subject", provider: "crossref" })];
    expect(relatedTerms(results, []).map((t) => t.term)).toEqual(["A Topic"]);
  });

  it("leaves out MeSH check tags, which describe nearly every study, but not other MeSH headings", () => {
    const results = [
      withSubjects(mesh("Humans"), mesh("Male"), mesh("Female"), mesh("Adult"), mesh("Aged, 80 and over"), mesh("Mice"), mesh("Polysomnography")),
      withSubjects(mesh("humans"), mesh("United States")),
    ];
    expect(relatedTerms(results, []).map((t) => t.term)).toEqual(["Polysomnography"]);
  });

  it("applies the check-tag list to MeSH only, so a topic with the same name is kept", () => {
    expect(relatedTerms([withSubjects(topic("Mice"))], []).map((t) => t.term)).toEqual(["Mice"]);
  });

  it("counts a term once per result, even if a result lists it twice, and merges its kinds", () => {
    const results = [withSubjects(topic("Sleep"), mesh("sleep"), topic("Sleep")), withSubjects(mesh("Sleep"))];
    expect(relatedTerms(results, [])).toEqual([{ term: "Sleep", count: 2, kinds: ["mesh", "topic"] }]);
  });

  it("leaves out terms whose every word is already in the query, in any form", () => {
    const results = [withSubjects(topic("Sleep"), topic("Memory Consolidation"), topic("Dreams"), topic("Sleeping Memories"))];
    const terms = relatedTerms(results, ["sleep", "memory"]).map((t) => t.term);
    expect(terms).not.toContain("Sleep");
    expect(terms).toContain("Memory Consolidation");
    expect(terms).toContain("Dreams");
    // "Sleeping" is a different word from "sleep", so this one is still suggested.
    expect(terms).toContain("Sleeping Memories");
  });

  it("drops terms with nothing searchable in them and terms that are too long", () => {
    const results = [withSubjects(topic("The Of"), topic("x".repeat(61)), topic("Fine"))];
    expect(relatedTerms(results, []).map((t) => t.term)).toEqual(["Fine"]);
  });

  it("keeps the first spelling it saw", () => {
    const results = [withSubjects(topic("Sleep Disorders")), withSubjects(mesh("sleep disorders"))];
    expect(relatedTerms(results, [])[0]?.term).toBe("Sleep Disorders");
  });

  it("returns at most the limit (12 by default)", () => {
    const many = [withSubjects(...Array.from({ length: 30 }, (_, i) => topic(`Topic ${String.fromCharCode(97 + (i % 26))}${i}`)))];
    expect(relatedTerms(many, [])).toHaveLength(12);
    expect(relatedTerms(many, [], { limit: 3 })).toHaveLength(3);
    expect(relatedTerms(many, [], { limit: 0 })).toEqual([]);
  });

  it("returns nothing for no results or results without subjects", () => {
    expect(relatedTerms([], ["sleep"])).toEqual([]);
    expect(relatedTerms([withSubjects()], ["sleep"])).toEqual([]);
  });

  it("does not change its input", () => {
    const results = [withSubjects(topic("B"), topic("A"))];
    const before = JSON.stringify(results);
    relatedTerms(results, ["x"]);
    expect(JSON.stringify(results)).toBe(before);
  });
});
