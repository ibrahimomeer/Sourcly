import { describe, expect, it } from "vitest";
import { documentText, relevanceReadings } from "./relevance";
import { makeResult } from "./testing/make-result";

describe("documentText", () => {
  it("joins the title, abstract and subject terms, and nothing else", () => {
    const text = documentText(
      makeResult({
        title: "Sleep and memory",
        abstract: "An essay.",
        subjects: [{ term: "Memory Consolidation", kind: "mesh", provider: "pubmed" }],
        venue: "Journal of Secrets",
        authors: [{ name: "Ada Lovelace" }],
      }),
    );
    expect(text).toBe("Sleep and memory An essay. Memory Consolidation");
  });

  it("copes with no abstract and no subjects", () => {
    expect(documentText(makeResult({ title: "Only a title", abstract: null, subjects: [] })).trim()).toBe("Only a title");
  });
});

describe("relevanceReadings", () => {
  const set = [
    makeResult({ id: "10.1/a", title: "sleep memory" }),
    makeResult({ id: "10.1/b", title: "sleep dreams" }),
    makeResult({ id: "10.1/c", title: "unrelated topic" }),
  ];

  it("returns one reading per result, in the order given", () => {
    expect(relevanceReadings(set, ["sleep", "memory"])).toHaveLength(3);
    expect(relevanceReadings([], ["sleep"])).toEqual([]);
  });

  it("divides each score by the best one, so the best match is exactly 1", () => {
    const [a, b, c] = relevanceReadings(set, ["sleep", "memory"]);
    const idfSleep = Math.log(1.6);
    const idfMemory = Math.log(1 + 2.5 / 1.5);
    expect(a?.normalized).toBe(1);
    expect(a?.raw).toBeCloseTo(idfSleep + idfMemory, 12);
    expect(b?.normalized).toBeCloseTo(idfSleep / (idfSleep + idfMemory), 12);
    expect(c).toMatchObject({ raw: 0, normalized: 0 });
  });

  it("writes the explanation with the score, the best score, the share and the matched words", () => {
    const [a, b, c] = relevanceReadings(set, ["sleep", "memory"]);
    expect(a?.detail).toMatch(/^BM25 score \d\.\d\d; the best of these 3 results scores \d\.\d\d, so this is 100% of it\. Matched /);
    expect(b?.detail).toContain("Matched sleep ×1");
    expect(c?.detail).toBe("None of the query words (sleep, memory) appear in the title, abstract or subjects: BM25 score 0");
  });

  it("lists at most four matched words", () => {
    const one = [makeResult({ title: "alpha beta gamma delta epsilon zeta" })];
    const [reading] = relevanceReadings(one, ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]);
    expect(reading?.detail.split("Matched ")[1]?.split(", ")).toHaveLength(4);
  });

  it("reports nothing to measure, rather than zero, when the query has no searchable words", () => {
    for (const terms of [[], ["the", "of", "and"], [""]]) {
      for (const reading of relevanceReadings(set, terms)) {
        expect(reading.raw).toBeNull();
        expect(reading.normalized).toBeNull();
        expect(reading.detail).toContain("no searchable words");
      }
    }
  });

  it("treats repeated query words as one", () => {
    const once = relevanceReadings(set, ["sleep"]);
    const thrice = relevanceReadings(set, ["sleep", "sleep", "Sleep"]);
    expect(thrice.map((r) => r.raw)).toEqual(once.map((r) => r.raw));
  });

  it("counts a word that appears in several fields every time it appears", () => {
    const set2 = [
      makeResult({ id: "10.1/many", title: "sleep", abstract: "sleep and sleep", subjects: [{ term: "Sleep", kind: "mesh", provider: "pubmed" }] }),
      makeResult({ id: "10.1/once", title: "sleep", abstract: null, subjects: [] }),
      makeResult({ id: "10.1/none", title: "other", abstract: null, subjects: [] }),
    ];
    const [many, once] = relevanceReadings(set2, ["sleep"]);
    expect(many?.detail).toContain("sleep ×4");
    expect(once?.detail).toContain("sleep ×1");
  });
});
