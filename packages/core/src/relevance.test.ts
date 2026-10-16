import { describe, expect, it } from "vitest";
import { coverageSpec } from "./coverage";
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

describe("relevanceReadings: with counterargument terms", () => {
  const topicWords = ["sleep", "memory"];
  const terms = ["limitation", "bias", "no evidence"];
  const set = [
    // Matches the search and one term.
    makeResult({ id: "10.1/both", title: "Sleep and memory: a limitation", abstract: null }),
    // Matches the search and two terms, one of them a phrase.
    makeResult({ id: "10.1/more", title: "Sleep and memory", abstract: "We found no evidence of bias." }),
    // Matches the search only.
    makeResult({ id: "10.1/topic", title: "Sleep and memory in adults", abstract: null }),
    // Matches the terms only.
    makeResult({ id: "10.1/terms", title: "Bias and limitation in surveys", abstract: "No evidence of anything." }),
    // Matches neither.
    makeResult({ id: "10.1/none", title: "Gardening", abstract: null }),
  ];
  const readings = () => Object.fromEntries(set.map((result, i) => [result.id, relevanceReadings(set, topicWords, terms)[i]]));

  it("is unchanged when there are no terms, or only unusable ones", () => {
    expect(relevanceReadings(set, topicWords, [])).toEqual(relevanceReadings(set, topicWords));
    expect(relevanceReadings(set, topicWords, ["the", " "])).toEqual(relevanceReadings(set, topicWords));
  });

  it("gives 0 to a result that matches only the terms, or only the search, or neither", () => {
    const r = readings();
    expect(r["10.1/terms"]?.normalized).toBe(0);
    expect(r["10.1/topic"]?.normalized).toBe(0);
    expect(r["10.1/none"]?.normalized).toBe(0);
  });

  it("gives a positive score only to results that match both, and a bigger one to a stronger match", () => {
    const r = readings();
    expect(r["10.1/both"]?.normalized).toBeGreaterThan(0);
    expect(r["10.1/more"]?.normalized).toBeGreaterThan(0);
    for (const id of ["10.1/both", "10.1/more"]) {
      expect(r[id]?.normalized).toBeGreaterThanOrEqual(0);
      expect(r[id]?.normalized).toBeLessThanOrEqual(1);
    }
  });

  it("multiplies the two readings, so the result is never above either of them", () => {
    const withTerms = readings();
    const without = relevanceReadings(set, topicWords);
    set.forEach((result, i) => {
      expect(withTerms[result.id]?.normalized ?? 0).toBeLessThanOrEqual((without[i]?.normalized ?? 0) + 1e-12);
    });
  });

  it("keeps the raw value as the BM25 score of the search words", () => {
    const withTerms = readings();
    const without = relevanceReadings(set, topicWords);
    set.forEach((result, i) => expect(withTerms[result.id]?.raw).toBe(without[i]?.raw));
  });

  it("counts a phrase as one term, so 'no evidence' is not just the word 'evidence'", () => {
    const phraseSet = [
      makeResult({ id: "10.1/phrase", title: "Sleep memory", abstract: "There was no evidence of an effect." }),
      makeResult({ id: "10.1/word", title: "Sleep memory", abstract: "The evidence for an effect was strong." }),
    ];
    const [phrase, word] = relevanceReadings(phraseSet, ["sleep", "memory"], ["no evidence"]);
    expect(phrase?.normalized).toBeGreaterThan(0.5);
    expect(word?.normalized).toBe(0);
  });

  it("explains both readings and the product in the detail", () => {
    const detail = readings()["10.1/more"]?.detail ?? "";
    expect(detail).toContain("BM25 score");
    expect(detail).toContain("Terms: BM25 score");
    expect(detail).toMatch(/matched (no evidence|bias)/);
    expect(detail).toMatch(/Relevance here is the two multiplied: \d+% × \d+% = \d+%/);
    expect(readings()["10.1/topic"]?.detail).toContain("none of the terms appear in the title or abstract, so this scores 0");
  });

  it("uses only the search when no result contains any term", () => {
    const plain = [makeResult({ id: "10.1/a", title: "Sleep memory" }), makeResult({ id: "10.1/b", title: "Sleep dreams" })];
    const withTerms = relevanceReadings(plain, topicWords, ["bias"]);
    const without = relevanceReadings(plain, topicWords);
    expect(withTerms.map((r) => r.normalized)).toEqual(without.map((r) => r.normalized));
    expect(withTerms[0]?.detail).toContain("None of the results contains any of the terms (bias)");
  });

  it("matches singular and plural terms", () => {
    const plural = [
      makeResult({ id: "10.1/p", title: "Sleep memory", abstract: "Several limitations apply." }),
      makeResult({ id: "10.1/q", title: "Sleep memory", abstract: "Nothing else." }),
    ];
    const [hit, miss] = relevanceReadings(plural, topicWords, ["limitation"]);
    // Both match the search equally; only the first has the term, in its plural form.
    expect(hit?.normalized).toBeGreaterThan(0.5);
    expect(miss?.normalized).toBe(0);
  });
});

describe("relevanceReadings: exactly as typed", () => {
  const set = [makeResult({ id: "10.1/model", title: "A model sleeps" }), makeResult({ id: "10.1/models", title: "Models sleep" })];

  it("matches a plural only when it is typed, because nothing is normalized", () => {
    const stemmed = relevanceReadings(set, ["models"]);
    expect(stemmed[0]?.raw).toBeGreaterThan(0);
    const exact = relevanceReadings(set, ["models"], [], { exact: true });
    expect(exact[0]?.raw).toBe(0);
    expect(exact[1]?.raw).toBeGreaterThan(0);
  });

  it("counts a common word, because none is dropped", () => {
    const withThe = [makeResult({ id: "10.1/a", title: "The cat" }), makeResult({ id: "10.1/b", title: "A cat" })];
    const exact = relevanceReadings(withThe, ["the"], [], { exact: true });
    expect(exact[0]?.raw).toBeGreaterThan(0);
    expect(exact[1]?.raw).toBe(0);
    expect(relevanceReadings(withThe, ["the"])[0]?.raw).toBeNull();
  });
});

describe("relevanceReadings over concepts", () => {
  const spec = (text: string) => coverageSpec(text);
  const docs = [
    makeResult({ id: "10.1/ml", title: "Machine learning predicts odor", abstract: "A model of olfaction." }),
    makeResult({ id: "10.1/odor", title: "Odor perception in rats", abstract: "Behaviour." }),
    makeResult({ id: "10.1/apple", title: "Volatile aroma of apples", abstract: "Flavor compounds and esters." }),
  ];

  it("scores a result higher the more concepts of the search it matches, and the unrelated one 0", () => {
    const [ml, odor, apple] = relevanceReadings(docs, [], [], {}, spec("AI odor"));
    expect(ml?.normalized).toBe(1);
    expect(odor?.normalized).toBeGreaterThan(0);
    expect(odor?.normalized).toBeLessThan(1);
    expect(apple?.raw).toBe(0);
    expect(apple?.normalized).toBe(0);
  });

  it("gives a small boost for a generic word, and a result with only the generic word scores less than one with the concept", () => {
    const set = [
      makeResult({ id: "10.1/c", title: "Odor", abstract: "We measure it." }),
      makeResult({ id: "10.1/cg", title: "Odor", abstract: "We understand it." }),
      makeResult({ id: "10.1/g", title: "Words", abstract: "We understand it." }),
    ];
    const [concept, conceptAndWord, wordOnly] = relevanceReadings(set, [], [], {}, spec("understand odor"));
    expect(conceptAndWord?.raw).toBeGreaterThan(concept?.raw ?? 0);
    expect(wordOnly?.raw).toBeGreaterThan(0);
    expect(wordOnly?.raw).toBeLessThan(concept?.raw ?? 0);
  });

  it("never requires a generic word: a result without it still scores on the concepts", () => {
    const [onlyConcept] = relevanceReadings([makeResult({ title: "Odor", abstract: null })], [], [], {}, spec("understand odor"));
    expect(onlyConcept?.raw).toBeGreaterThan(0);
  });

  it("matches by variants, so a paper that says olfaction counts for odor", () => {
    const [reading] = relevanceReadings([makeResult({ title: "Olfaction", abstract: null })], [], [], {}, spec("odor"));
    expect(reading?.raw).toBeGreaterThan(0);
  });

  it("says in words what was matched", () => {
    const [ml] = relevanceReadings(docs, [], [], {}, spec("AI odor"));
    expect(ml?.detail).toMatch(/BM25 over the title, abstract and author keywords/);
    expect(ml?.detail).toMatch(/Matched/);
  });
});
