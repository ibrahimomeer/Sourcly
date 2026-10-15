import { describe, expect, it } from "vitest";
import { applyOverride, classify } from "./classify";
import {
  FACTOR_IDS,
  defaultScoringSettings,
  scoreResults,
  type FactorId,
  type ScoringContext,
  type ScoringItem,
} from "./scoring";
import { coverageSpec } from "./coverage";
import { parseQuery } from "./query";
import { makeResult } from "./testing/make-result";
import type { ProviderId, Result } from "./types";

const REFERENCE_YEAR = 2026;

const ctx = (changes: Partial<ScoringContext> = {}): ScoringContext => ({
  referenceYear: REFERENCE_YEAR,
  queryTerms: [],
  answeredSources: 1,
  ...changes,
});

const item = (overrides: Partial<Result>): ScoringItem => {
  const result = makeResult(overrides);
  return { result, labels: classify(result) };
};

const hits = (...providers: ProviderId[]) =>
  providers.map((provider, index) => ({ provider, id: `${provider}-${index}`, rank: index + 1, listSize: 10, score: null }));

/** Settings with only the named factors on, all at weight 1. */
function only(...enabled: FactorId[]) {
  const settings = defaultScoringSettings();
  for (const id of FACTOR_IDS) settings.factors[id] = { enabled: enabled.includes(id), weight: 1 };
  return settings;
}

// Three results, worked out by hand with the default weights (relevance 3, term coverage 2, phrase match 1,
// citations 1, recency 1, peer review 1, open access 0, provider agreement 0.5; total 9.5), for the query
// "sleep memory" with two sources answering. These tests give no coverage spec, so term coverage and phrase
// match score neutral (0.5) for everyone: 2 * 0.5 + 1 * 0.5 = 1.5 of the sum.
//
//   All three have the title "sleep and memory", so BM25 scores them the same: relevance 1 each.
//
//        citations/yr -> percentile   recency          peer review     agreement
//   A    10/1  = 10   -> 2/3           2026: 2^0 = 1     yes   = 1      both sources 2/2 = 1
//   B    100/10 = 10  -> 2/3           2016: 2^-1 = .5   unknown = .5   one source   1/2 = .5
//   C    0/20   = 0   -> 1/6           2006: 2^-2 = .25  preprint = 0   one source   1/2 = .5
//
// Percentile = (below + ties/2) / 3. Open access has weight 0, so it adds nothing.
//   A = (3*1 + 2/3 + 1   + 1 + 0.5*1   + 1.5) / 9.5 = (37/6 + 3/2) / 9.5 = 46/57
//   B = (3*1 + 2/3 + .5  + .5 + 0.5*.5 + 1.5) / 9.5 = (59/12 + 3/2) / 9.5 = 77/114
//   C = (3*1 + 1/6 + .25 + 0 + 0.5*.5  + 1.5) / 9.5 = (11/3 + 3/2) / 9.5 = 31/57
const QUERY = ["sleep", "memory"];
const TITLE = "sleep and memory";

function threeResults(): ScoringItem[] {
  return [
    item({
      id: "10.1000/a", title: TITLE, year: 2026, citationCount: 10, hits: hits("openalex", "crossref"),
      openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null },
    }),
    item({
      id: "10.1000/b", title: TITLE, year: 2016, citationCount: 100, hits: hits("openalex"), type: "report",
      openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null },
    }),
    item({
      id: "10.1000/c", title: TITLE, year: 2006, citationCount: 0, hits: hits("crossref"), type: "preprint",
      openAccess: { isOpen: true, status: "green", url: null, pdfUrl: null },
    }),
  ];
}
const scenario = () => ctx({ queryTerms: QUERY, answeredSources: 2 });

describe("scoreResults: the documented formula", () => {
  it("matches the hand-computed scores and order", () => {
    const scored = scoreResults(threeResults(), defaultScoringSettings(), scenario());
    expect(scored.map((s) => s.result.id)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    expect(scored[0]?.score).toBeCloseTo(46 / 57, 12);
    expect(scored[1]?.score).toBeCloseTo(77 / 114, 12);
    expect(scored[2]?.score).toBeCloseTo(31 / 57, 12);
  });

  it("normalizes each factor as documented", () => {
    const [a, b, c] = scoreResults(threeResults(), defaultScoringSettings(), scenario());
    const norm = (s: typeof a, id: FactorId) => s?.factors.find((f) => f.factor === id)?.normalized;

    for (const s of [a, b, c]) expect(norm(s, "relevance")).toBeCloseTo(1, 12);

    expect(norm(a, "citations")).toBeCloseTo(2 / 3, 12);
    expect(norm(b, "citations")).toBeCloseTo(2 / 3, 12);
    expect(norm(c, "citations")).toBeCloseTo(1 / 6, 12);

    expect(norm(a, "recency")).toBeCloseTo(1, 12);
    expect(norm(b, "recency")).toBeCloseTo(0.5, 12);
    expect(norm(c, "recency")).toBeCloseTo(0.25, 12);

    expect(norm(a, "peerReview")).toBe(1);
    expect(norm(b, "peerReview")).toBe(0.5);
    expect(norm(c, "peerReview")).toBe(0);

    expect(norm(a, "openAccess")).toBe(1);
    expect(norm(b, "openAccess")).toBe(0);
    expect(norm(c, "openAccess")).toBe(1);

    expect(norm(a, "providerAgreement")).toBe(1);
    expect(norm(b, "providerAgreement")).toBe(0.5);
    expect(norm(c, "providerAgreement")).toBe(0.5);
  });

  it("reports, per factor, the raw value, normalized value, weight and contribution", () => {
    const [a] = scoreResults(threeResults(), defaultScoringSettings(), scenario());
    expect(a?.factors.map((f) => f.factor)).toEqual([...FACTOR_IDS]);

    const relevance = a?.factors.find((f) => f.factor === "relevance");
    expect(relevance).toMatchObject({ factor: "relevance", label: "Relevance (BM25)", enabled: true, weight: 3, normalized: 1 });
    // Three identical documents, each containing both words: each word has idf ln(1 + 0.5/3.5).
    expect(relevance?.raw).toBeCloseTo(2 * Math.log(1 + 0.5 / 3.5), 12);
    expect(relevance?.contribution).toBeCloseTo(3 / 9.5, 12);
    expect(relevance?.detail).toContain("BM25 score");
    expect(relevance?.detail).toContain("sleep ×1");

    const citations = a?.factors.find((f) => f.factor === "citations");
    expect(citations?.raw).toBe(10);
    expect(citations?.detail).toContain("10 citations over 1 year = 10.0 per year");
    expect(citations?.detail).toContain("67th percentile among the 3 results");

    const agreement = a?.factors.find((f) => f.factor === "providerAgreement");
    expect(agreement).toMatchObject({ raw: 2, weight: 0.5, normalized: 1 });
    expect(agreement?.detail).toBe("Found by 2 of the 2 sources that answered (OpenAlex, Crossref): 2 / 2");
  });

  it("makes contributions add up to the score, and keeps scores within 0..1", () => {
    for (const scored of scoreResults(threeResults(), defaultScoringSettings(), scenario())) {
      const sum = scored.factors.reduce((total, f) => total + f.contribution, 0);
      expect(sum).toBeCloseTo(scored.score, 12);
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(1);
    }
  });

  it("does not rank a result lower for being closed access, unless the user raises the weight", () => {
    const open = item({ id: "10.1000/open", openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null } });
    const closed = item({ id: "10.1000/closed", openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null } });

    const byDefault = scoreResults([open, closed], defaultScoringSettings(), ctx());
    expect(byDefault[0]?.score).toBe(byDefault[1]?.score);
    for (const scored of byDefault) {
      expect(scored.factors.find((f) => f.factor === "openAccess")).toMatchObject({ weight: 0, contribution: 0 });
    }

    const raised = defaultScoringSettings();
    raised.factors.openAccess.weight = 2;
    const rankedAfter = scoreResults([open, closed], raised, ctx());
    expect(rankedAfter.map((s) => s.result.id)).toEqual(["10.1000/open", "10.1000/closed"]);
    expect(rankedAfter[0]?.score).toBeGreaterThan(rankedAfter[1]?.score ?? Number.POSITIVE_INFINITY);
  });
});

describe("scoreResults: relevance (BM25)", () => {
  // Titles: 1 "sleep memory", 2 "sleep dreams", 3 "unrelated topic". Query: sleep, memory.
  // N = 3 and all documents have 2 words, so the length factor is 1 and every matching word scores idf.
  //   idf(sleep)  = ln(1 + (3 - 2 + 0.5) / (2 + 0.5)) = ln 1.6      (in 2 documents)
  //   idf(memory) = ln(1 + (3 - 1 + 0.5) / (1 + 0.5)) = ln(8/3)     (in 1 document)
  const idfSleep = Math.log(1.6);
  const idfMemory = Math.log(1 + 2.5 / 1.5);
  const docs = () => [
    item({ id: "10.1/one", title: "sleep memory" }),
    item({ id: "10.1/two", title: "sleep dreams" }),
    item({ id: "10.1/three", title: "unrelated topic" }),
  ];
  const relevanceOf = (scored: ReturnType<typeof scoreResults>, id: string) =>
    scored.find((s) => s.result.id === id)?.factors.find((f) => f.factor === "relevance");

  it("scores by the formula, and normalizes against the best result in the set", () => {
    const scored = scoreResults(docs(), only("relevance"), ctx({ queryTerms: QUERY }));
    expect(relevanceOf(scored, "10.1/one")?.raw).toBeCloseTo(idfSleep + idfMemory, 12);
    expect(relevanceOf(scored, "10.1/one")?.normalized).toBe(1);
    expect(relevanceOf(scored, "10.1/two")?.raw).toBeCloseTo(idfSleep, 12);
    expect(relevanceOf(scored, "10.1/two")?.normalized).toBeCloseTo(idfSleep / (idfSleep + idfMemory), 12);
    expect(relevanceOf(scored, "10.1/three")).toMatchObject({ raw: 0, normalized: 0 });
    expect(scored.map((s) => s.result.id)).toEqual(["10.1/one", "10.1/two", "10.1/three"]);
  });

  it("explains a match, and a non-match, in plain words", () => {
    const scored = scoreResults(docs(), only("relevance"), ctx({ queryTerms: QUERY }));
    const best = relevanceOf(scored, "10.1/one")?.detail ?? "";
    expect(best).toContain("BM25 score");
    expect(best).toContain("best of these 3 results");
    expect(best).toContain("100% of it");
    expect(best).toMatch(/Matched (memory ×1, sleep ×1|sleep ×1, memory ×1)/);
    expect(relevanceOf(scored, "10.1/three")?.detail).toBe(
      "None of the query words (sleep, memory) appear in the title, abstract or subjects: BM25 score 0",
    );
  });

  it("counts the abstract and the subjects, not only the title", () => {
    const set = [
      item({ id: "10.1/title", title: "sleep memory" }),
      item({ id: "10.1/abstract", title: "unrelated", abstract: "an essay about sleep and memory" }),
      item({ id: "10.1/subjects", title: "unrelated", subjects: [{ term: "Sleep", kind: "topic", provider: "openalex" }, { term: "Memory Consolidation", kind: "mesh", provider: "pubmed" }] }),
      item({ id: "10.1/nothing", title: "unrelated" }),
    ];
    const scored = scoreResults(set, only("relevance"), ctx({ queryTerms: QUERY }));
    const raw = (id: string) => relevanceOf(scored, id)?.raw ?? 0;
    expect(raw("10.1/abstract")).toBeGreaterThan(0);
    expect(raw("10.1/subjects")).toBeGreaterThan(0);
    expect(raw("10.1/nothing")).toBe(0);
  });

  it("matches singular and plural, ignores accents and case, and ignores common words in the query", () => {
    const set = [item({ id: "10.1/a", title: "Memories of Sleep" }), item({ id: "10.1/b", title: "Café culture" })];
    const scored = scoreResults(set, only("relevance"), ctx({ queryTerms: ["the", "memory", "SLEEP", "cafe"] }));
    expect(relevanceOf(scored, "10.1/a")?.raw).toBeGreaterThan(0);
    expect(relevanceOf(scored, "10.1/b")?.raw).toBeGreaterThan(0);
  });

  it("scores neutral (0.5) when the query has no searchable words, and says why", () => {
    for (const terms of [[], ["the", "of"]]) {
      const scored = scoreResults(docs(), only("relevance"), ctx({ queryTerms: terms }));
      for (const s of scored) {
        const factor = s.factors.find((f) => f.factor === "relevance");
        expect(factor).toMatchObject({ raw: null, normalized: 0.5 });
        expect(factor?.detail).toContain("no searchable words");
      }
    }
  });

  it("does not depend on how many sources a result came from, or on the order results arrive in", () => {
    const forwards = scoreResults(docs(), only("relevance"), ctx({ queryTerms: QUERY }));
    const backwards = scoreResults([...docs()].reverse(), only("relevance"), ctx({ queryTerms: QUERY }));
    const byId = (list: typeof forwards) => Object.fromEntries(list.map((s) => [s.result.id, s.score]));
    expect(byId(backwards)).toEqual(byId(forwards));
  });

  it("is measured over the whole set it is given, so a rarer word counts for more", () => {
    const common = Array.from({ length: 9 }, (_, i) => item({ id: `10.1/c${i}`, title: "sleep studies" }));
    const rare = item({ id: "10.1/rare", title: "sleep spindles" });
    const scored = scoreResults([...common, rare], only("relevance"), ctx({ queryTerms: ["sleep", "spindles"] }));
    const rareFactor = relevanceOf(scored, "10.1/rare");
    const commonFactor = relevanceOf(scored, "10.1/c0");
    expect(Number(rareFactor?.raw ?? 0)).toBeGreaterThan(Number(commonFactor?.raw ?? 0));
    expect(scored[0]?.result.id).toBe("10.1/rare");
  });
});

describe("scoreResults: counterargument terms", () => {
  const items = () => [
    item({ id: "10.1/match", title: "Sleep and memory: a limitation", citationCount: 5 }),
    item({ id: "10.1/topic", title: "Sleep and memory", citationCount: 5 }),
    item({ id: "10.1/terms", title: "A limitation of surveys", citationCount: 5 }),
  ];
  const relevanceOf = (scored: ReturnType<typeof scoreResults>, id: string) =>
    scored.find((s) => s.result.id === id)?.factors.find((f) => f.factor === "relevance");

  it("makes relevance need both the search words and a term", () => {
    const scored = scoreResults(items(), only("relevance"), ctx({ queryTerms: QUERY, signalTerms: ["limitation"] }));
    expect(scored.map((s) => s.result.id)[0]).toBe("10.1/match");
    expect(relevanceOf(scored, "10.1/match")?.normalized).toBeGreaterThan(0.5);
    expect(relevanceOf(scored, "10.1/topic")?.normalized).toBe(0);
    expect(relevanceOf(scored, "10.1/terms")?.normalized).toBe(0);
    expect(relevanceOf(scored, "10.1/match")?.detail).toContain("Relevance here is the two multiplied");
  });

  it("leaves ranking exactly as before when no terms are given", () => {
    const plain = scoreResults(items(), defaultScoringSettings(), ctx({ queryTerms: QUERY }));
    const none = scoreResults(items(), defaultScoringSettings(), ctx({ queryTerms: QUERY, signalTerms: [] }));
    expect(none).toEqual(plain);
  });
});

describe("scoreResults: provider agreement", () => {
  const agreement = (result: Partial<Result>, answeredSources: number) =>
    scoreResults([item(result)], only("providerAgreement"), ctx({ answeredSources }))[0]?.factors.find((f) => f.factor === "providerAgreement");

  it("is the share of the answering sources that found the result", () => {
    expect(agreement({ hits: hits("openalex", "crossref", "pubmed") }, 8)).toMatchObject({ raw: 3, normalized: 3 / 8 });
    expect(agreement({ hits: hits("openalex") }, 8)).toMatchObject({ raw: 1, normalized: 1 / 8 });
    expect(agreement({ hits: hits("openalex", "crossref") }, 2)).toMatchObject({ raw: 2, normalized: 1 });
  });

  it("names the sources in its explanation", () => {
    expect(agreement({ hits: hits("openalex", "europepmc") }, 4)?.detail).toBe(
      "Found by 2 of the 4 sources that answered (OpenAlex, Europe PMC): 2 / 4",
    );
  });

  it("counts each source once, even if it listed the result twice", () => {
    const doubled = [...hits("openalex"), ...hits("openalex"), ...hits("crossref")];
    expect(agreement({ hits: doubled }, 4)).toMatchObject({ raw: 2, normalized: 0.5 });
  });

  it("scores neutral when fewer than two sources answered, because there is nothing to compare", () => {
    for (const answered of [0, 1]) {
      const factor = agreement({ hits: hits("openalex") }, answered);
      expect(factor).toMatchObject({ raw: 1, normalized: 0.5 });
      expect(factor?.detail).toContain("cannot be measured");
    }
  });

  it("never exceeds 1, even if more sources are listed than answered", () => {
    expect(agreement({ hits: hits("openalex", "crossref", "pubmed") }, 2)?.normalized).toBe(1);
  });

  it("can be raised by the user, and then a result found by more sources ranks higher", () => {
    const many = item({ id: "10.1/many", hits: hits("openalex", "crossref", "pubmed") });
    const few = item({ id: "10.1/few", hits: hits("openalex") });
    const settings = defaultScoringSettings();
    settings.factors.providerAgreement.weight = 5;
    const scored = scoreResults([few, many], settings, ctx({ answeredSources: 4 }));
    expect(scored.map((s) => s.result.id)).toEqual(["10.1/many", "10.1/few"]);
  });
});

describe("scoreResults: user control", () => {
  it("drops a disabled factor from both the numerator and the denominator", () => {
    const scored = scoreResults(threeResults(), only("citations"), scenario());
    const byId = new Map(scored.map((s) => [s.result.id, s]));
    expect(byId.get("10.1000/a")?.score).toBeCloseTo(2 / 3, 12);
    expect(byId.get("10.1000/c")?.score).toBeCloseTo(1 / 6, 12);

    const disabled = byId.get("10.1000/a")?.factors.find((f) => f.factor === "relevance");
    expect(disabled).toMatchObject({ enabled: false, contribution: 0 });
    // The raw and normalized values are still shown for a disabled factor.
    expect(disabled?.normalized).toBe(1);
  });

  it("re-ranks the same results when the weights change, without any new data", () => {
    const items = threeResults();
    const ids = (settings = defaultScoringSettings()) => scoreResults(items, settings, scenario()).map((s) => s.result.id);

    expect(ids(only("providerAgreement"))).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    // A and C are open access and B is not; the tie between A and C falls back to id order.
    expect(ids(only("openAccess"))).toEqual(["10.1000/a", "10.1000/c", "10.1000/b"]);
  });

  it("does not depend on the scale of the weights", () => {
    const base = scoreResults(threeResults(), defaultScoringSettings(), scenario());
    const scaled = defaultScoringSettings();
    for (const id of FACTOR_IDS) scaled.factors[id].weight *= 10;
    const tenfold = scoreResults(threeResults(), scaled, scenario());

    expect(tenfold.map((s) => s.result.id)).toEqual(base.map((s) => s.result.id));
    tenfold.forEach((s, i) => expect(s.score).toBeCloseTo(base[i]?.score ?? Number.NaN, 12));
  });

  it("treats negative, NaN and infinite weights as 0", () => {
    const settings = only("relevance", "citations", "recency");
    settings.factors.citations.weight = -5;
    settings.factors.relevance.weight = Number.NaN;
    settings.factors.recency.weight = Number.POSITIVE_INFINITY;
    const scored = scoreResults(threeResults(), settings, scenario());
    expect(scored.every((s) => s.score === 0)).toBe(true);
    // relevance (NaN) 0, term coverage 1, phrase match 1, citations (-5) 0, recency (infinite) 0, then 1, 1, 1, 1.
    expect(scored[0]?.factors.map((f) => f.weight)).toEqual([0, 1, 1, 0, 0, 1, 1, 1, 1]);
  });

  it("scores 0 and falls back to id order when no factor is active", () => {
    const scored = scoreResults(threeResults().reverse(), only(), scenario());
    expect(scored.every((s) => s.score === 0 && s.factors.every((f) => f.contribution === 0))).toBe(true);
    expect(scored.map((s) => s.result.id)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
  });

  it("uses the labels it is given, so a manual override changes the ranking input", () => {
    const base = item({ id: "10.1000/x" });
    const overridden: ScoringItem = {
      result: base.result,
      labels: applyOverride(base.labels, { peerReview: "not-peer-reviewed" }),
    };
    const [scored] = scoreResults([overridden], only("peerReview"), ctx());
    const factor = scored?.factors.find((f) => f.factor === "peerReview");
    expect(factor?.normalized).toBe(0);
    expect(factor?.detail).toContain("(set by you)");
  });
});

describe("scoreResults: determinism", () => {
  it("breaks ties by id, whatever order the input arrives in", () => {
    const x = item({ id: "10.1000/zzz" });
    const y = item({ id: "10.1000/aaa" });
    expect(scoreResults([x, y], defaultScoringSettings(), ctx()).map((s) => s.result.id)).toEqual(["10.1000/aaa", "10.1000/zzz"]);
    expect(scoreResults([y, x], defaultScoringSettings(), ctx()).map((s) => s.result.id)).toEqual(["10.1000/aaa", "10.1000/zzz"]);
  });

  it("gives identical output for identical input, and does not mutate it", () => {
    const items = threeResults().reverse();
    const idsBefore = items.map((i) => i.result.id);
    const first = scoreResults(items, defaultScoringSettings(), scenario());
    const second = scoreResults(items, defaultScoringSettings(), scenario());
    expect(second).toEqual(first);
    expect(items.map((i) => i.result.id)).toEqual(idsBefore);
  });

  it("gives the same scores whatever order the results arrive in", () => {
    const forwards = scoreResults(threeResults(), defaultScoringSettings(), scenario());
    const backwards = scoreResults(threeResults().reverse(), defaultScoringSettings(), scenario());
    expect(backwards.map((s) => [s.result.id, s.score])).toEqual(forwards.map((s) => [s.result.id, s.score]));
  });

  it("returns an empty list for no results", () => {
    expect(scoreResults([], defaultScoringSettings(), scenario())).toEqual([]);
  });
});

describe("scoreResults: factor edge cases", () => {
  const first = (overrides: Partial<Result>, settings = defaultScoringSettings(), context = ctx()) =>
    scoreResults([item(overrides)], settings, context)[0];
  const factor = (s: ReturnType<typeof first>, id: FactorId) => s?.factors.find((f) => f.factor === id);

  it("scores missing data as neutral (0.5) rather than as zero", () => {
    const scored = first({ year: null, citationCount: null });
    for (const id of ["citations", "recency"] as const) {
      expect(factor(scored, id)).toMatchObject({ raw: null, normalized: 0.5 });
      expect(factor(scored, id)?.detail).toContain("neutral");
    }
  });

  it("gives tied citation rates the same middle percentile", () => {
    const tied = [item({ id: "10.1000/1", citationCount: 5 }), item({ id: "10.1000/2", citationCount: 5 })];
    expect(scoreResults(tied, only("citations"), ctx()).map((s) => s.score)).toEqual([0.5, 0.5]);
  });

  it("puts a lone result at the 50th percentile", () => {
    expect(first({ citationCount: 1000 }, only("citations"))?.score).toBe(0.5);
  });

  it("excludes results without citation data from the percentile population", () => {
    const set = [
      item({ id: "10.1000/1", citationCount: 5 }),
      item({ id: "10.1000/2", citationCount: 50 }),
      item({ id: "10.1000/3", citationCount: null }),
    ];
    const byId = new Map(scoreResults(set, only("citations"), ctx()).map((s) => [s.result.id, s.score]));
    expect(byId.get("10.1000/1")).toBeCloseTo(0.25, 12);
    expect(byId.get("10.1000/2")).toBeCloseTo(0.75, 12);
    expect(byId.get("10.1000/3")).toBe(0.5);
  });

  it("counts a paper published this year as one year old for citation rate", () => {
    expect(factor(first({ year: REFERENCE_YEAR, citationCount: 8 }), "citations")?.raw).toBe(8);
  });

  it("halves recency every half-life, and never exceeds 1 for future-dated work", () => {
    const settings = defaultScoringSettings();
    settings.recencyHalfLifeYears = 5;
    expect(factor(first({ year: 2021 }, settings), "recency")?.normalized).toBeCloseTo(0.5, 12);
    expect(factor(first({ year: 2016 }, settings), "recency")?.normalized).toBeCloseTo(0.25, 12);
    expect(factor(first({ year: 2030 }, settings), "recency")?.normalized).toBe(1);
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])("falls back to the default half-life for %s", (bad) => {
    const settings = defaultScoringSettings();
    settings.recencyHalfLifeYears = bad;
    expect(factor(first({ year: 2016 }, settings), "recency")?.normalized).toBeCloseTo(0.5, 12);
  });

  it("scores open access as 1 or 0, with unknown counting as 0", () => {
    const open = first({ openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null } });
    const closed = first({ openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null } });
    const unknown = first({ openAccess: { isOpen: null, status: "unknown", url: null, pdfUrl: null } });
    expect(factor(open, "openAccess")?.normalized).toBe(1);
    expect(factor(closed, "openAccess")?.normalized).toBe(0);
    expect(factor(unknown, "openAccess")).toMatchObject({ normalized: 0, raw: "unknown" });
  });

  it("is neutral about study type until the user picks preferred levels", () => {
    const settings = defaultScoringSettings();
    settings.factors.studyType = { enabled: true, weight: 1 };
    expect(factor(first({}, settings), "studyType")?.normalized).toBe(0.5);

    settings.preferredLevels = ["secondary"];
    expect(factor(first({ type: "review" }, settings), "studyType")?.normalized).toBe(1);
    expect(factor(first({ type: "journal-article" }, settings), "studyType")?.normalized).toBe(0);
  });
});

describe("defaultScoringSettings", () => {
  it("uses the documented default weights", () => {
    const { factors, preferredLevels, recencyHalfLifeYears } = defaultScoringSettings();
    expect(Object.fromEntries(FACTOR_IDS.map((id) => [id, factors[id].weight]))).toEqual({
      relevance: 3,
      termCoverage: 2,
      phraseMatch: 1,
      citations: 1,
      recency: 1,
      peerReview: 1,
      openAccess: 0,
      providerAgreement: 0.5,
      studyType: 0,
    });
    // Open access and provider agreement stay switched on (so their values are shown); study type is off.
    expect(factors.openAccess.enabled).toBe(true);
    expect(factors.providerAgreement.enabled).toBe(true);
    expect(factors.studyType.enabled).toBe(false);
    expect(preferredLevels).toEqual([]);
    expect(recencyHalfLifeYears).toBe(10);
  });

  it("returns an independent copy every time", () => {
    const one = defaultScoringSettings();
    one.factors.relevance.weight = 99;
    one.preferredLevels.push("primary");
    const two = defaultScoringSettings();
    expect(two.factors.relevance.weight).toBe(3);
    expect(two.preferredLevels).toEqual([]);
  });
});

describe("scoreResults: term coverage comes first", () => {
  const query = (text: string, options = {}) => coverageSpec(parseQuery(text, options));
  const withSpec = (text: string, changes: Partial<ScoringContext> = {}) =>
    ctx({ queryTerms: ["chaos", "double", "pendulum"], coverage: query(text), ...changes });

  // A is the weakest by every other factor, but is the only one with all three words.
  const items = () => [
    item({ id: "10.1/slag", title: "Chaos in steel slag asphalt", citationCount: 900, year: 2026 }),
    item({ id: "10.1/caos", title: "CAOS editorial", citationCount: 500, year: 2026 }),
    item({ id: "10.1/two", title: "A double pendulum", citationCount: 100, year: 2026 }),
    item({ id: "10.1/all", title: "Chaos in a double pendulum", citationCount: 0, year: 1990 }),
  ];
  const ids = (scored: ReturnType<typeof scoreResults>) => scored.map((s) => s.result.id);

  it("puts results with every term first, then most, then few, whatever their score", () => {
    const scored = scoreResults(items(), defaultScoringSettings(), withSpec("chaos double pendulum"));
    expect(ids(scored)).toEqual(["10.1/all", "10.1/two", "10.1/slag", "10.1/caos"]);
    expect(scored.map((s) => s.tier)).toEqual([1, 2, 3, 3]);
  });

  it("orders inside a tier by the weighted score", () => {
    const scored = scoreResults(items(), defaultScoringSettings(), withSpec("chaos double pendulum"));
    // slag (1 of 3 terms, many citations) beats caos (0 of 3, fewer citations): both are tier 3.
    expect(ids(scored).slice(2)).toEqual(["10.1/slag", "10.1/caos"]);
  });

  it("keeps the same order whatever order the words were typed in", () => {
    const orders = ["chaos double pendulum", "double pendulum chaos", '"double pendulum" chaos', "pendulum chaos double"];
    const results = orders.map((text) => ids(scoreResults(items(), defaultScoringSettings(), withSpec(text))));
    for (const order of results) expect(order[0]).toBe("10.1/all");
    for (const order of results) expect(new Set(order.slice(0, 1))).toEqual(new Set(["10.1/all"]));
  });

  it("does not use the tier when term matching is set to ignore coverage", () => {
    const settings = defaultScoringSettings();
    settings.termMatching = "ignore";
    const scored = scoreResults(items(), settings, withSpec("chaos double pendulum"));
    expect(scored.map((s) => s.score)).toEqual([...scored.map((s) => s.score)].sort((a, b) => b - a));
    // Every result still reports its tier, so the card can say what matched.
    expect(scored.find((s) => s.result.id === "10.1/all")?.tier).toBe(1);
  });

  it("orders by tier for both 'all' and 'coverage' (the app decides what to do with the partial ones)", () => {
    for (const mode of ["all", "coverage"] as const) {
      const settings = defaultScoringSettings();
      settings.termMatching = mode;
      expect(ids(scoreResults(items(), settings, withSpec("chaos double pendulum")))[0]).toBe("10.1/all");
    }
  });

  it("is tier 1 for everyone, and scores neutral, when there is no query to match", () => {
    const scored = scoreResults(items(), defaultScoringSettings(), ctx({ queryTerms: [] }));
    expect(scored.every((s) => s.tier === 1 && s.coverage === null)).toBe(true);
    const factor = scored[0]?.factors.find((f) => f.factor === "termCoverage");
    expect(factor).toMatchObject({ raw: null, normalized: 0.5 });
    expect(factor?.detail).toContain("no terms to look for");
  });

  it("reports which terms matched, as a list with the count, and the fraction as the normalized value", () => {
    const scored = scoreResults(items(), only("termCoverage"), withSpec("chaos double pendulum"));
    const two = scored.find((s) => s.result.id === "10.1/two");
    const factor = two?.factors.find((f) => f.factor === "termCoverage");
    expect(factor?.raw).toBe("double, pendulum (2 of 3)");
    expect(factor?.normalized).toBeCloseTo(2 / 3, 12);
    expect(factor?.detail).toContain("Found 2 of 3 terms: double (title); pendulum (title)");
    expect(factor?.detail).toContain("Not found: chaos");
    expect(factor?.detail).toContain("1 if it is in the title, 0.8 in the author keywords, 0.7 in the provider topics, 0.6 if only in the abstract");
  });

  it("weighs a term found in the title above one found only in the abstract", () => {
    const inTitle = item({ id: "10.1/t", title: "Pendulum" });
    const inAbstract = item({ id: "10.1/a", title: "Other", abstract: "a pendulum" });
    const scored = scoreResults([inAbstract, inTitle], only("termCoverage"), ctx({ coverage: query("pendulum") }));
    expect(scored.map((s) => [s.result.id, s.factors.find((f) => f.factor === "termCoverage")?.normalized])).toEqual([
      ["10.1/t", 1],
      ["10.1/a", 0.6],
    ]);
  });

  it("scores phrase match from query words found next to each other, in the title or the abstract", () => {
    const together = item({ id: "10.1/together", title: "A double pendulum" });
    const apart = item({ id: "10.1/apart", title: "A pendulum and a double" });
    const abstractOnly = item({ id: "10.1/abstract", title: "Other", abstract: "the double pendulum" });
    const scored = scoreResults([apart, abstractOnly, together], only("phraseMatch"), ctx({ coverage: query("double pendulum") }));
    const phrase = (id: string) => scored.find((s) => s.result.id === id)?.factors.find((f) => f.factor === "phraseMatch");
    expect(phrase("10.1/together")).toMatchObject({ normalized: 1, raw: "1 of 1 pairs" });
    expect(phrase("10.1/abstract")?.normalized).toBe(0.7);
    expect(phrase("10.1/apart")?.normalized).toBe(0);
    expect(phrase("10.1/together")?.detail).toContain("double pendulum (title)");
    expect(phrase("10.1/apart")?.detail).toContain("Not found together: double pendulum");
  });

  it("scores phrase match neutral when the query has no two words next to each other", () => {
    const scored = scoreResults([item({ id: "10.1/x", title: "Sleep" })], only("phraseMatch"), ctx({ coverage: query("sleep") }));
    expect(scored[0]?.factors.find((f) => f.factor === "phraseMatch")).toMatchObject({ raw: null, normalized: 0.5 });
  });

  it("lets a quoted phrase decide: a result with the words apart is not tier 1", () => {
    const scored = scoreResults(
      [item({ id: "10.1/apart", title: "A pendulum, double" }), item({ id: "10.1/adjacent", title: "The double pendulum" })],
      defaultScoringSettings(),
      ctx({ coverage: query('"double pendulum"') }),
    );
    expect(scored.map((s) => [s.result.id, s.tier])).toEqual([
      ["10.1/adjacent", 1],
      ["10.1/apart", 3],
    ]);
  });

  it("can be switched off like any factor, and then adds nothing to the score", () => {
    const settings = only("relevance");
    const scored = scoreResults(items(), settings, withSpec("chaos double pendulum"));
    for (const s of scored) {
      expect(s.factors.find((f) => f.factor === "termCoverage")).toMatchObject({ enabled: false, contribution: 0 });
    }
  });

  it("is deterministic and does not depend on the order results arrive in", () => {
    const forwards = scoreResults(items(), defaultScoringSettings(), withSpec("chaos double pendulum"));
    const backwards = scoreResults([...items()].reverse(), defaultScoringSettings(), withSpec("chaos double pendulum"));
    expect(backwards.map((s) => [s.result.id, s.score, s.tier])).toEqual(forwards.map((s) => [s.result.id, s.score, s.tier]));
  });
});

describe("defaultScoringSettings: term matching", () => {
  it("requires all terms by default, and each copy is independent", () => {
    expect(defaultScoringSettings().termMatching).toBe("all");
    const one = defaultScoringSettings();
    one.termMatching = "ignore";
    expect(defaultScoringSettings().termMatching).toBe("all");
  });
});
