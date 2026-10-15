import { describe, expect, it } from "vitest";
import { counterQuery } from "./counter";
import { FIELD_WEIGHTS, PHRASE_WEIGHTS, coverageSpec, measureCoverage } from "./coverage";
import { parseConcepts } from "./concepts";
import { snippetOf, streamsOf } from "./conceptmatch";
import { makeResult } from "./testing/make-result";
import type { Result, Subject } from "./types";

const spec = (text: string, options = {}) => coverageSpec(parseConcepts(text, options));
const labels = (text: string, options = {}) => spec(text, options).blocks.map((block) => block.label);
const pairsOf = (text: string, options = {}) => spec(text, options).pairs.map((pair) => pair.text);
const doc = (overrides: Partial<Result>) => makeResult({ title: "", abstract: null, subjects: [], ...overrides });
const keyword = (term: string): Subject => ({ term, kind: "keyword", provider: "pubmed" });
const openAlexKeyword = (term: string): Subject => ({ term, kind: "keyword", provider: "openalex" });
const mesh = (term: string): Subject => ({ term, kind: "mesh", provider: "pubmed" });
const topic = (term: string): Subject => ({ term, kind: "topic", provider: "openalex" });
const cover = (text: string, result: Partial<Result>, options = {}) => measureCoverage(doc(result), spec(text, options));

describe("coverageSpec: what the query asks for", () => {
  it("has one block for each concept, in the order typed", () => {
    expect(labels("caos double pendulum")).toEqual(["caos", "double pendulum"]);
    expect(labels("sleep")).toEqual(["sleep"]);
  });

  it("leaves out common words and generic words: they are not required", () => {
    expect(labels("How AI understand odor")).toEqual(["AI", "odor"]);
    expect(spec("How AI understand odor").soft.map((term) => term.text)).toEqual(["understand"]);
  });

  it("has no blocks for a query with nothing in it", () => {
    expect(spec("").blocks).toEqual([]);
    expect(spec("the of").blocks).toEqual([]);
  });

  it("does not count the counterargument terms as concepts to match", () => {
    const query = counterQuery("sleep memory", ["limitation", "bias"]);
    expect(coverageSpec(query).blocks.map((block) => block.label)).toEqual(["sleep", "memory"]);
  });

  it("reads text and an already parsed query the same way", () => {
    expect(JSON.stringify(coverageSpec(parseConcepts("sleep memory")))).toBe(JSON.stringify(coverageSpec("sleep memory")));
  });

  it("finds the pairs of concepts that sit next to each other in the query", () => {
    expect(pairsOf("caos double pendulum")).toEqual(["caos double pendulum"]);
    expect(pairsOf("chaos pendulum motion")).toEqual(["chaos pendulum", "pendulum motion"]);
    expect(pairsOf("sleep")).toEqual([]);
  });
});

describe("measureCoverage: where each concept is found", () => {
  it("finds a concept in the title, the abstract and the author keywords", () => {
    const result = doc({ title: "A double pendulum", abstract: "We study the motion.", subjects: [keyword("chaos theory")] });
    const c = measureCoverage(result, spec("double motion chaos"));
    expect(c.units.map((u) => [u.label, u.fields])).toEqual([
      ["double", ["title"]],
      ["motion", ["abstract"]],
      ["chaos", ["keywords"]],
    ]);
    expect(c.units.map((u) => u.weight)).toEqual([FIELD_WEIGHTS.title, FIELD_WEIGHTS.abstract, FIELD_WEIGHTS.keywords]);
  });

  it("does not look at provider topics, MeSH headings, subjects, OpenAlex's own keywords or the venue", () => {
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
  });

  it("reports every field a concept is in, strongest first, and weighs it by the strongest", () => {
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

  it("folds only plurals: no other word ending is made the same", () => {
    expect(cover("pendulum", { title: "Pendulums and pendular motion, pendulumlike" }).units[0]?.matched).toBe(true);
    expect(cover("pendulum", { title: "pendular motion and pendulumlike things" }).units[0]?.matched).toBe(false);
    expect(cover("pendulums", { title: "A Pendulum" }).units[0]?.matched).toBe(true);
    expect(cover("sleeping", { title: "sleep and sleeps" }).units[0]?.matched).toBe(false);
    expect(cover("café", { title: "CAFE culture" }).units[0]?.matched).toBe(true);
  });

  it("matches a phrase only when its words are next to each other, in order", () => {
    expect(cover('"double pendulum"', { title: "The double pendulum" }).units[0]?.matched).toBe(true);
    expect(cover('"double pendulum"', { title: "A pendulum, double" }).units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { title: "A double compound pendulum" }).units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { abstract: "We drive a double pendulum." }).units[0]).toMatchObject({ matched: true, fields: ["abstract"] });
  });

  it("takes a hyphen or a slash between the words of a phrase, but not a full stop or a comma", () => {
    expect(cover('"double pendulum"', { title: "double-pendulum" }).units[0]?.matched).toBe(true);
    expect(cover('"double pendulum"', { title: "double. Pendulum" }).units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { title: "double, pendulum" }).units[0]?.matched).toBe(false);
  });

  it("matches a phrase made of common words, as written", () => {
    expect(cover('"state of the art"', { title: "State of the art in sleep research" }).units[0]?.matched).toBe(true);
    expect(cover('"state of the art"', { title: "State art" }).units[0]?.matched).toBe(false);
  });

  it("does not let a phrase run from one keyword into the next", () => {
    expect(cover('"double pendulum"', { subjects: [keyword("double"), keyword("pendulum")] }).units[0]?.matched).toBe(false);
    expect(cover('"double pendulum"', { subjects: [keyword("double pendulum")] }).units[0]?.matched).toBe(true);
  });

  it("matches a word with a hyphen as its parts next to each other: covid-19", () => {
    expect(cover("covid-19", { title: "COVID 19 vaccines" }).units[0]?.matched).toBe(true);
    expect(cover("covid-19", { title: "covid vaccines in 19 countries" }).units[0]?.matched).toBe(false);
  });

  it("counts an OR group as found when any one alternative is, and says which", () => {
    const c = cover("(sleep OR nap) memory", { title: "Nap and memory" });
    expect(c.units[0]).toMatchObject({ matched: true, found: ["nap"], variant: "nap" });
    expect(c.matchedCount).toBe(2);
    expect(cover("(sleep OR nap) memory", { title: "Dreams and memory" }).units[0]?.matched).toBe(false);
  });

  it("compares words as typed when the search was sent exactly as typed", () => {
    expect(cover("pendulums", { title: "A pendulum" }, { exact: true }).units[0]?.matched).toBe(false);
    expect(cover("pendulums", { title: "Pendulums" }, { exact: true }).units[0]?.matched).toBe(true);
    expect(cover("the pendulum", { title: "The pendulum" }, { exact: true }).units.map((u) => u.matched)).toEqual([true, true]);
  });
});

describe("measureCoverage: variants from the thesaurus", () => {
  it("matches a concept by any of its variants and says which one, and that it came from the thesaurus", () => {
    const c = cover("odor", { title: "Olfactory coding in the mouse" });
    expect(c.units[0]).toMatchObject({ matched: true, variant: "olfactory", fromThesaurus: true, fields: ["title"] });
  });

  it("prefers the word that was typed when the result has both", () => {
    const c = cover("odor", { title: "Odour and odor", abstract: "smell" });
    expect(c.units[0]).toMatchObject({ variant: "odor", fromThesaurus: false });
    expect(c.units[0]?.found).toEqual(["odor", "odour", "smell"]);
  });

  it("matches AI by 'machine learning', and does not need the word AI", () => {
    const c = cover("AI odor", { title: "Machine learning predicts odor", abstract: null });
    expect(c.units.map((u) => [u.label, u.variant])).toEqual([
      ["AI", "machine learning"],
      ["odor", "odor"],
    ]);
    expect(c.tier).toBe(1);
  });

  it("does not match with the thesaurus off", () => {
    expect(cover("odor", { title: "Olfactory coding" }, { synonyms: false }).matchedCount).toBe(0);
  });
});

describe("measureCoverage: abbreviations are matched with their capitals, as whole words", () => {
  it("matches AI in capitals", () => {
    expect(cover("AI", { title: "AI in medicine" }).units[0]).toMatchObject({ matched: true, variant: "AI", fromThesaurus: false });
    expect(cover("AI", { abstract: "Modern AI systems" }).units[0]?.matched).toBe(true);
  });

  it("matches the plural of an abbreviation (AIs)", () => {
    expect(cover("CNN", { title: "Two CNNs compared" }).units[0]?.matched).toBe(true);
  });

  it("does not match Ai Weiwei, or ai in lowercase, or the letters inside waiting", () => {
    for (const title of ["Ai Weiwei and the art of protest", "ai weiwei", "Waiting for the bus", "Training and retaining staff", "AIDS prevention", "Said and maintained"]) {
      expect(cover("AI", { title }, { synonyms: false }).units[0]?.matched, title).toBe(false);
    }
  });

  it("does not take the verb 'can' for CAN", () => {
    expect(cover("CAN bus", { title: "What can a bus driver do?" }, { synonyms: false }).units[0]?.matched).toBe(false);
    expect(cover("CAN bus", { title: "A CAN bus gateway" }).matchedCount).toBe(2);
  });

  it("matches the long form of an abbreviation, case-blind", () => {
    expect(cover("CAN bus", { title: "A controller area network bus" }).units[0]).toMatchObject({ matched: true, variant: "controller area network", fromThesaurus: true });
  });
});

describe("measureCoverage: an unrelated paper that shares only a word does not match", () => {
  const appleAroma = {
    title: "Volatile aroma compounds in apple cultivars",
    abstract: "The aroma of apples depends on esters and aldehydes. Sensory panels described the flavor of eighteen cultivars. Ai Weiwei is not discussed.",
    subjects: [keyword("apple"), keyword("flavor")],
  };

  it("does not match the AI concept, so the paper does not match the search", () => {
    const c = cover("How AI understand odor", appleAroma);
    expect(c.units.find((u) => u.label === "AI")).toMatchObject({ matched: false, variant: null, fields: [] });
    expect(c.matchedCount).toBe(0);
    expect(c.tier).toBe(3);
  });

  it("does not take aroma or flavor for odor", () => {
    expect(cover("odor", appleAroma).matchedCount).toBe(0);
  });

  it("matches the odor concept in a paper that says odour, but still not AI", () => {
    const c = cover("How AI understand odor", { title: "Odour perception in apple orchards", abstract: "Field notes on odour." });
    expect(c.units.map((u) => u.matched)).toEqual([false, true]);
    expect(c.tier).not.toBe(1);
  });
});

describe("measureCoverage: generic words are never required", () => {
  it("is full coverage without the generic word, and counts the generic word when it is there", () => {
    const without = cover("How AI understand odor", { title: "Machine learning for olfaction" });
    expect(without.tier).toBe(1);
    expect(without.total).toBe(2);
    expect(without.soft).toEqual([]);
    const withIt = cover("How AI understand odor", { title: "Machine learning for olfaction", abstract: "We understand how it works." });
    expect(withIt.tier).toBe(1);
    expect(withIt.soft).toEqual([{ text: "understand", count: 1 }]);
  });
});

describe("measureCoverage: tiers", () => {
  it("is tier 1 when every concept is found, 2 when more than half are, 3 otherwise", () => {
    expect(cover("a1 b1 c1", { title: "a1 b1 c1" }).tier).toBe(1);
    expect(cover("a1 b1 c1", { title: "a1 b1" }).tier).toBe(2);
    expect(cover("a1 b1 c1", { title: "a1" }).tier).toBe(3);
    expect(cover("a1 b1", { title: "a1" }).tier).toBe(3);
  });

  it("gives the fraction and the count", () => {
    const c = cover("a1 b1 c1 d1", { title: "a1 b1" });
    expect(c).toMatchObject({ matchedCount: 2, total: 4, fraction: 0.5 });
  });

  it("is tier 1 and neutral for a search with no concepts", () => {
    const c = cover("the of", { title: "anything" });
    expect(c).toMatchObject({ tier: 1, total: 0, fraction: 1 });
  });
});

describe("measureCoverage: concepts next to each other", () => {
  it("scores 1 for a pair in the title and 0.7 for one only in the abstract", () => {
    expect(PHRASE_WEIGHTS).toEqual({ title: 1, abstract: 0.7 });
    expect(cover("chaos pendulum", { title: "Chaos pendulum" }).phraseScore).toBe(1);
    expect(cover("chaos pendulum", { abstract: "Chaos pendulum" }).phraseScore).toBe(0.7);
    expect(cover("chaos pendulum", { title: "Pendulum and chaos" }).phraseScore).toBe(0);
  });

  it("counts a pair by any variant of its concepts", () => {
    expect(cover("AI odor", { title: "Machine learning odour prediction" }).pairs).toEqual([{ text: "AI odor", found: "title" }]);
  });

  it("takes the mean over the pairs of the query", () => {
    expect(cover("chaos pendulum motion", { title: "Chaos pendulum", abstract: "x" }).phraseScore).toBe(0.5);
  });

  it("prefers the title when a pair is in both", () => {
    expect(cover("chaos pendulum", { title: "Chaos pendulum", abstract: "chaos pendulum" }).pairs[0]?.found).toBe("title");
  });

  it("is null when the query has no two neighbouring concepts", () => {
    expect(cover("chaos", { title: "Chaos" }).phraseScore).toBeNull();
  });
});

describe("measureCoverage: snippets and places", () => {
  it("gives about 80 characters around the match, cut at word edges and marked with ellipses", () => {
    const filler = "this is a long run of ordinary words that fills the line ";
    const result = doc({ title: "T", abstract: `${filler}${filler}We predict odour from structure.${filler}${filler}` });
    const unit = measureCoverage(result, spec("odor")).units[0];
    const snippet = unit?.snippet;
    expect(snippet).toMatchObject({ field: "abstract", match: "odour" });
    expect(snippet?.before.startsWith("…")).toBe(true);
    expect(snippet?.after.endsWith("…")).toBe(true);
    const length = (snippet?.before.length ?? 0) + (snippet?.match.length ?? 0) + (snippet?.after.length ?? 0);
    expect(length).toBeGreaterThan(50);
    expect(length).toBeLessThan(100);
    expect(snippet?.before.replace("…", "").startsWith(" ")).toBe(false);
  });

  it("has no ellipsis when the match is at the start or end of a short text", () => {
    const snippet = cover("odor", { title: "Odor of fruit" }).units[0]?.snippet;
    expect(snippet).toEqual({ field: "title", before: "", match: "Odor", after: " of fruit" });
  });

  it("marks the places of every match for highlighting, with the variant that matched", () => {
    const c = cover("odor", { title: "Odor and odour", abstract: "olfaction" });
    expect(c.spans.title).toEqual([
      { start: 0, end: 4, term: "odor" },
      { start: 9, end: 14, term: "odour" },
    ]);
    expect(c.spans.abstract).toEqual([{ start: 0, end: 9, term: "olfaction" }]);
    expect(c.spans.keywords).toEqual([]);
  });

  it("gives a snippet for the author keywords too", () => {
    const unit = cover("odor", { subjects: [keyword("olfaction"), keyword("machine learning")] }).units[0];
    expect(unit?.snippet).toMatchObject({ field: "keywords", match: "olfaction" });
  });

  it("builds the same streams for the same result, and does not change it", () => {
    const result = doc({ title: "Odor", abstract: "x" });
    expect(streamsOf(result)).toBe(streamsOf(result));
    expect(snippetOf(streamsOf(result)[0] as never, { start: 0, end: 4 }).match).toBe("Odor");
  });
});
