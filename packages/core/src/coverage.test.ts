import { describe, expect, it } from "vitest";
import { counterQuery } from "./counter";
import { FIELD_WEIGHTS, PHRASE_WEIGHTS, coverageSpec, measureCoverage } from "./coverage";
import { parseQuery } from "./query";
import { makeResult } from "./testing/make-result";
import type { Result, Subject } from "./types";

const spec = (text: string, options = {}) => coverageSpec(parseQuery(text, options));
const labels = (text: string, options = {}) => spec(text, options).units.map((unit) => unit.label);
const pairsOf = (text: string, options = {}) => spec(text, options).pairs.map((pair) => pair.text);
const doc = (overrides: Partial<Result>) => makeResult({ title: "", abstract: null, subjects: [], ...overrides });
const keyword = (term: string): Subject => ({ term, kind: "keyword", provider: "pubmed" });
const openAlexKeyword = (term: string): Subject => ({ term, kind: "keyword", provider: "openalex" });
const mesh = (term: string): Subject => ({ term, kind: "mesh", provider: "pubmed" });
const topic = (term: string): Subject => ({ term, kind: "topic", provider: "openalex" });
const cover = (text: string, result: Partial<Result>, options = {}) => measureCoverage(doc(result), spec(text, options));

describe("coverageSpec: what the query asks for", () => {
  it("makes one unit for each word, in the order typed", () => {
    expect(labels("caos double pendulum")).toEqual(["caos", "double", "pendulum"]);
    expect(labels("sleep")).toEqual(["sleep"]);
  });

  it("makes one unit of a quoted phrase, and of an OR group", () => {
    expect(labels('"double pendulum" chaos')).toEqual(['"double pendulum"', "chaos"]);
    expect(labels("sleep OR nap memory")).toEqual(["sleep OR nap memory"]);
    expect(labels("(sleep OR nap) memory")).toEqual(["sleep OR nap", "memory"]);
  });

  it("leaves out what is left out with NOT", () => {
    expect(labels("sleep NOT rats")).toEqual(["sleep"]);
  });

  it("has no units for a query with nothing in it", () => {
    expect(spec("").units).toEqual([]);
    expect(spec("the of").units).toEqual([]);
  });

  it("does not count the counterargument terms (an optional group) as terms to match", () => {
    const query = counterQuery(parseQuery("sleep memory"), ["limitation", "bias"]);
    expect(coverageSpec(query).units.map((unit) => unit.label)).toEqual(["sleep", "memory"]);
  });

  it("follows the way the text is read: a restored common word is a unit, a dropped one is not", () => {
    expect(labels("what is chaos")).toEqual(["chaos"]);
    expect(labels("what is chaos", { restored: new Set(["is"]) })).toEqual(["is", "chaos"]);
    expect(labels("what is chaos", { ignoreCommon: false })).toEqual(["what", "is", "chaos"]);
  });

  it("finds the pairs of words that sit next to each other in the query", () => {
    expect(pairsOf("caos double pendulum")).toEqual(["caos double", "double pendulum"]);
    expect(pairsOf("sleep")).toEqual([]);
  });

  it("finds the pairs inside a quoted phrase, and does not join a phrase to its neighbours", () => {
    expect(pairsOf('"double pendulum" chaos')).toEqual(["double pendulum"]);
    expect(pairsOf('"state of the art" review')).toEqual(["state of", "of the", "the art"]);
  });

  it("does not make pairs across an OR or a NOT", () => {
    expect(pairsOf("sleep OR nap memory")).toEqual([]);
    expect(pairsOf("(sleep OR nap) memory dreams")).toEqual(["memory dreams"]);
    expect(pairsOf("sleep NOT rats memory")).toEqual([]);
  });

  it("makes each pair once", () => {
    expect(pairsOf("double pendulum double pendulum")).toEqual(["double pendulum", "pendulum double"]);
  });

  it("is deterministic and does not change the query", () => {
    const parsed = parseQuery("caos double pendulum");
    const before = JSON.stringify(parsed);
    expect(JSON.stringify(coverageSpec(parsed))).toBe(JSON.stringify(coverageSpec(parsed)));
    expect(JSON.stringify(parsed)).toBe(before);
  });
});

describe("measureCoverage: where each term is found", () => {
  it("finds a term in the title, the abstract and the author keywords", () => {
    const result = doc({
      title: "A double pendulum",
      abstract: "We study the motion.",
      subjects: [keyword("chaos theory")],
    });
    const c = measureCoverage(result, spec("double motion chaos"));
    expect(c.units.map((u) => [u.label, u.fields])).toEqual([
      ["double", ["title"]],
      ["motion", ["abstract"]],
      ["chaos", ["keywords"]],
    ]);
    expect(c.units.map((u) => u.weight)).toEqual([FIELD_WEIGHTS.title, FIELD_WEIGHTS.abstract, FIELD_WEIGHTS.keywords]);
  });

  it("does not count provider topics, MeSH headings, subjects, OpenAlex's own keywords or the venue", () => {
    const result = doc({
      title: "A study",
      abstract: "Some words.",
      venue: "Journal of Pendulum Studies",
      subjects: [topic("Nonlinear Dynamics"), mesh("Chaos"), { term: "Physics", kind: "subject", provider: "crossref" }, openAlexKeyword("double pendulum")],
    });
    const c = measureCoverage(result, spec("dynamics chaos physics double pendulum"));
    expect(c.matchedCount).toBe(0);
    expect(c.units.every((unit) => unit.fields.length === 0)).toBe(true);
  });

  it("counts a keyword only from a source that gives the authors' keywords", () => {
    expect(cover("chaos", { subjects: [keyword("chaos")] }).matchedCount).toBe(1);
    expect(cover("chaos", { subjects: [openAlexKeyword("chaos")] }).matchedCount).toBe(0);
    expect(cover("chaos", { subjects: [{ term: "chaos", kind: "keyword", provider: "doaj" }] }).matchedCount).toBe(1);
    expect(cover("chaos", { subjects: [{ term: "chaos", kind: "keyword", provider: "zenodo" }] }).matchedCount).toBe(1);
  });

  it("reports every field a term is in, strongest first, and weighs it by the strongest", () => {
    const c = cover("pendulum", { title: "Pendulum", abstract: "a pendulum", subjects: [keyword("Pendulum")] });
    expect(c.units[0]).toMatchObject({ matched: true, fields: ["title", "keywords", "abstract"], weight: 1 });
  });

  it("weights the title highest, then the author keywords, then the abstract", () => {
    expect(FIELD_WEIGHTS).toEqual({ title: 1, keywords: 0.8, abstract: 0.6 });
    expect(cover("pendulum", { title: "pendulum" }).weighted).toBe(1);
    expect(cover("pendulum", { subjects: [keyword("pendulum")] }).weighted).toBe(0.8);
    expect(cover("pendulum", { abstract: "pendulum" }).weighted).toBe(0.6);
  });

  it("matches whole words only: caos is not cao, and a word inside a longer word is not a match", () => {
    expect(cover("caos", { title: "O cao e o gato" }).matchedCount).toBe(0);
    expect(cover("cao", { title: "A Vietnamese paper: cao hoc" }).matchedCount).toBe(1);
    expect(cover("caos", { title: "Teoria do Caos" }).matchedCount).toBe(1);
    expect(cover("pend", { title: "pendulum" }).matchedCount).toBe(0);
    expect(cover("ring", { title: "string and springs and bring" }).matchedCount).toBe(0);
  });

  it("does not match a word that is not there, even as part of a longer word", () => {
    const c = cover("pendulum", { title: "Pendulums and pendular motion, pendulumlike" });
    // "pendulums" folds to "pendulum"; the other forms are different words.
    expect(c.units[0]?.matched).toBe(true);
    expect(cover("pendulum", { title: "pendular motion and pendulumlike things" }).units[0]?.matched).toBe(false);
  });

  it("folds plurals both ways and ignores capitals and accents", () => {
    expect(cover("pendulums", { title: "A Pendulum" }).units[0]?.matched).toBe(true);
    expect(cover("café", { title: "CAFE culture" }).units[0]?.matched).toBe(true);
    expect(cover("Biases", { title: "bias in studies" }).units[0]?.matched).toBe(true);
  });

  it("matches a phrase only when its words are next to each other, in order", () => {
    expect(cover('"double pendulum"', { title: "The double pendulum" }).units[0]?.matched).toBe(true);
    expect(cover('"double pendulum"', { title: "A pendulum, double" }).units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { title: "A double compound pendulum" }).units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { abstract: "We drive a double pendulum." }).units[0]).toMatchObject({ matched: true, fields: ["abstract"] });
  });

  it("matches a phrase made of common words, as written", () => {
    expect(cover('"state of the art"', { title: "State of the art in sleep research" }).units[0]?.matched).toBe(true);
    expect(cover('"state of the art"', { title: "State art" }).units[0]?.matched).toBe(false);
  });

  it("does not let a phrase run from one keyword into the next", () => {
    const c = cover('"double pendulum"', { subjects: [keyword("double"), keyword("pendulum")] });
    expect(c.units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { subjects: [keyword("double pendulum")] }).units[0]?.matched).toBe(true);
  });

  it("matches a word with a hyphen as its parts next to each other: covid-19", () => {
    expect(cover("covid-19", { title: "COVID 19 vaccines" }).units[0]?.matched).toBe(true);
    expect(cover("covid-19", { title: "covid-19 vaccines" }).units[0]?.matched).toBe(true);
    expect(cover("covid-19", { title: "covid vaccines in 19 countries" }).units[0]?.matched).toBe(false);
  });

  it("counts an OR group as found when any one alternative is, and says which", () => {
    const c = cover("(sleep OR nap) memory", { title: "Nap and memory" });
    expect(c.units[0]).toMatchObject({ matched: true, found: ["nap"] });
    expect(c.matchedCount).toBe(2);
    expect(cover("(sleep OR nap) memory", { title: "Dreams and memory" }).units[0]?.matched).toBe(false);
  });

  it("needs all of an alternative's words when the alternative is itself an AND", () => {
    expect(cover("sleep OR nap memory", { title: "Nap" }).units[0]?.matched).toBe(false);
    expect(cover("sleep OR nap memory", { title: "Nap memory" }).units[0]?.matched).toBe(true);
    expect(cover("sleep OR nap memory", { title: "Sleep" }).units[0]?.matched).toBe(true);
  });

  it("compares words as typed when the search was sent exactly as typed", () => {
    expect(cover("pendulums", { title: "A pendulum" }, { exact: true }).units[0]?.matched).toBe(false);
    expect(cover("pendulums", { title: "Pendulums" }, { exact: true }).units[0]?.matched).toBe(true);
    expect(cover("the pendulum", { title: "The pendulum" }, { exact: true }).units.map((u) => u.matched)).toEqual([true, true]);
  });

  it("finds a restored common word", () => {
    expect(cover("what is chaos", { title: "What is chaos" }, { restored: new Set(["is"]) }).units.map((u) => u.matched)).toEqual([true, true]);
    expect(cover("what is chaos", { title: "Chaos" }, { restored: new Set(["is"]) }).units.map((u) => u.matched)).toEqual([false, true]);
  });

  it("lists the words found, each once, for highlighting", () => {
    const c = cover("double pendulum chaos", { title: "Double pendulum", abstract: "a double pendulum" });
    expect(c.foundTerms).toEqual(["double", "pendulum"]);
  });
});

describe("measureCoverage: tiers", () => {
  const tierFor = (query: string, title: string) => cover(query, { title }).tier;

  it("is tier 1 when every term is found", () => {
    expect(tierFor("double pendulum chaos", "Chaos of a double pendulum")).toBe(1);
  });

  it("is tier 2 when more than half are found", () => {
    expect(tierFor("double pendulum chaos", "A double pendulum")).toBe(2);
    expect(tierFor("a1 b2 c3 d4", "a1 b2 c3")).toBe(2);
  });

  it("is tier 3 when half or fewer are found, or none", () => {
    expect(tierFor("double pendulum chaos", "Chaos in the atmosphere")).toBe(3);
    expect(tierFor("double pendulum", "A pendulum")).toBe(3);
    expect(tierFor("a1 b2 c3 d4", "a1 b2")).toBe(3);
    expect(tierFor("double pendulum chaos", "Unrelated")).toBe(3);
  });

  it("is tier 1 for a one-word query that is found, and tier 3 when it is not", () => {
    expect(tierFor("sleep", "Sleep")).toBe(1);
    expect(tierFor("sleep", "Dreams")).toBe(3);
  });

  it("is tier 1, and fully covered, when the query has no terms to match", () => {
    const c = measureCoverage(doc({ title: "Anything" }), coverageSpec(parseQuery("")));
    expect(c).toMatchObject({ tier: 1, total: 0, fraction: 1, weighted: 1, phraseScore: null });
  });

  it("gives the fraction and the count", () => {
    const c = cover("double pendulum chaos", { title: "A double pendulum" });
    expect(c).toMatchObject({ matchedCount: 2, total: 3 });
    expect(c.fraction).toBeCloseTo(2 / 3, 12);
    expect(c.weighted).toBeCloseTo(2 / 3, 12);
  });

  it("matches for the same words in any order, so every ordering of the query gives the same tiers", () => {
    const result = { title: "Chaos in a double pendulum", abstract: null };
    for (const query of ["chaos double pendulum", "double pendulum chaos", '"double pendulum" chaos', "pendulum chaos double"]) {
      expect(cover(query, result).tier, query).toBe(1);
    }
  });
});

describe("measureCoverage: pairs next to each other", () => {
  it("scores 1 for a pair in the title and 0.7 for one only in the abstract", () => {
    expect(PHRASE_WEIGHTS).toEqual({ title: 1, abstract: 0.7 });
    expect(cover("double pendulum", { title: "A double pendulum" }).phraseScore).toBe(1);
    expect(cover("double pendulum", { abstract: "A double pendulum" }).phraseScore).toBe(0.7);
    expect(cover("double pendulum", { title: "A pendulum, double" }).phraseScore).toBe(0);
  });

  it("takes the mean over the pairs of the query", () => {
    const c = cover("chaos double pendulum", { title: "Chaos in a double pendulum" });
    expect(c.pairs).toEqual([
      { text: "chaos double", found: null },
      { text: "double pendulum", found: "title" },
    ]);
    expect(c.phraseScore).toBe(0.5);
    expect(cover("chaos double pendulum", { title: "Double pendulum chaos" }).phraseScore).toBe(0.5);
    expect(cover("chaos double pendulum", { title: "Chaos double pendulum" }).phraseScore).toBe(1);
  });

  it("prefers the title when a pair is in both", () => {
    expect(cover("double pendulum", { title: "double pendulum", abstract: "double pendulum" }).pairs[0]?.found).toBe("title");
  });

  it("is null when the query has no two words next to each other", () => {
    expect(cover("sleep", { title: "Sleep" }).phraseScore).toBeNull();
    expect(cover("(sleep OR nap) memory", { title: "Sleep memory" }).phraseScore).toBeNull();
  });

  it("does not look in the keywords or topics", () => {
    expect(cover("double pendulum", { subjects: [keyword("double pendulum")] }).phraseScore).toBe(0);
  });
});

describe("measureCoverage: it does not change what it is given", () => {
  it("leaves the result alone", () => {
    const result = doc({ title: "A double pendulum", abstract: "x", subjects: [keyword("chaos")] });
    const before = JSON.stringify(result);
    measureCoverage(result, spec("double pendulum chaos"));
    expect(JSON.stringify(result)).toBe(before);
  });
});
