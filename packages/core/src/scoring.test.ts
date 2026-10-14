import { describe, expect, it } from "vitest";
import { applyOverride, classify } from "./classify";
import { FACTOR_IDS, defaultScoringSettings, scoreResults, type FactorId, type ScoringItem } from "./scoring";
import { makeResult } from "./testing/make-result";
import type { Result } from "./types";

const REFERENCE_YEAR = 2026;

const item = (overrides: Partial<Result>): ScoringItem => {
  const result = makeResult(overrides);
  return { result, labels: classify(result) };
};

const hit = (rank: number, listSize: number) => [
  { provider: "openalex" as const, id: `W${rank}`, rank, listSize, score: null },
];

/** Settings with only the named factors on, all at weight 1. */
function only(...enabled: FactorId[]) {
  const settings = defaultScoringSettings();
  for (const id of FACTOR_IDS) settings.factors[id] = { enabled: enabled.includes(id), weight: 1 };
  return settings;
}

// Three results, worked out by hand with the default weights
// (relevance 3, citations 1, recency 1, peer review 1, open access 0.5; total 6.5).
//
//        relevance  citations/yr -> percentile   recency        peer review   open access
//   A    rank 1/3   10/1  = 10   -> 2/3           2026: 2^0 = 1   yes   = 1    open   = 1
//   B    rank 2/3   100/10 = 10  -> 2/3           2016: 2^-1 = .5 unknown = .5  closed = 0
//   C    rank 3/3   0/20   = 0   -> 1/6           2006: 2^-2 = .25 preprint = 0 open   = 1
//
// relevance = 1 - (rank-1)/3 -> A 1, B 2/3, C 1/3.  Percentile = (below + ties/2)/3.
//   A = (3*1   + 2/3 + 1   + 1 + .5) / 6.5 = 37/39
//   B = (3*2/3 + 2/3 + .5 + .5 + 0) / 6.5 = 22/39
//   C = (3*1/3 + 1/6 + .25 + 0 + .5) / 6.5 = 23/78
function threeResults(): ScoringItem[] {
  return [
    item({
      id: "10.1000/a", year: 2026, citationCount: 10, hits: hit(1, 3),
      openAccess: { isOpen: true, status: "gold", url: null },
    }),
    item({
      id: "10.1000/b", year: 2016, citationCount: 100, hits: hit(2, 3), type: "report",
      openAccess: { isOpen: false, status: "closed", url: null },
    }),
    item({
      id: "10.1000/c", year: 2006, citationCount: 0, hits: hit(3, 3), type: "preprint",
      openAccess: { isOpen: true, status: "green", url: null },
    }),
  ];
}

describe("scoreResults: the documented formula", () => {
  it("matches the hand-computed scores and order", () => {
    const scored = scoreResults(threeResults(), defaultScoringSettings(), REFERENCE_YEAR);
    expect(scored.map((s) => s.result.id)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    expect(scored[0]?.score).toBeCloseTo(37 / 39, 12);
    expect(scored[1]?.score).toBeCloseTo(22 / 39, 12);
    expect(scored[2]?.score).toBeCloseTo(23 / 78, 12);
  });

  it("normalizes each factor as documented", () => {
    const [a, b, c] = scoreResults(threeResults(), defaultScoringSettings(), REFERENCE_YEAR);
    const norm = (s: typeof a, id: FactorId) => s?.factors.find((f) => f.factor === id)?.normalized;

    expect(norm(a, "relevance")).toBeCloseTo(1, 12);
    expect(norm(b, "relevance")).toBeCloseTo(2 / 3, 12);
    expect(norm(c, "relevance")).toBeCloseTo(1 / 3, 12);

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
  });

  it("reports, per factor, the raw value, normalized value, weight and contribution", () => {
    const [a] = scoreResults(threeResults(), defaultScoringSettings(), REFERENCE_YEAR);
    expect(a?.factors.map((f) => f.factor)).toEqual([...FACTOR_IDS]);

    const relevance = a?.factors[0];
    expect(relevance).toMatchObject({ factor: "relevance", label: "Relevance", enabled: true, weight: 3, raw: 1, normalized: 1 });
    expect(relevance?.contribution).toBeCloseTo(3 / 6.5, 12);
    expect(relevance?.detail).toContain("#1 of 3 on OpenAlex");

    const citations = a?.factors[1];
    expect(citations?.raw).toBe(10);
    expect(citations?.detail).toContain("10 citations over 1 year = 10.0 per year");
    expect(citations?.detail).toContain("67th percentile among the 3 results");
  });

  it("makes contributions add up to the score", () => {
    for (const scored of scoreResults(threeResults(), defaultScoringSettings(), REFERENCE_YEAR)) {
      const sum = scored.factors.reduce((total, f) => total + f.contribution, 0);
      expect(sum).toBeCloseTo(scored.score, 12);
    }
  });

  it("keeps scores within 0..1", () => {
    for (const scored of scoreResults(threeResults(), defaultScoringSettings(), REFERENCE_YEAR)) {
      expect(scored.score).toBeGreaterThanOrEqual(0);
      expect(scored.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("scoreResults: user control", () => {
  it("drops a disabled factor from both the numerator and the denominator", () => {
    const settings = only("citations");
    const scored = scoreResults(threeResults(), settings, REFERENCE_YEAR);
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
    const ids = (settings = defaultScoringSettings()) =>
      scoreResults(items, settings, REFERENCE_YEAR).map((s) => s.result.id);

    expect(ids(only("relevance"))).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    // A and C are open access and B is not; the tie between A and C falls back to id order.
    expect(ids(only("openAccess"))).toEqual(["10.1000/a", "10.1000/c", "10.1000/b"]);
  });

  it("does not depend on the scale of the weights", () => {
    const base = scoreResults(threeResults(), defaultScoringSettings(), REFERENCE_YEAR);
    const scaled = defaultScoringSettings();
    for (const id of FACTOR_IDS) scaled.factors[id].weight *= 10;
    const tenfold = scoreResults(threeResults(), scaled, REFERENCE_YEAR);

    expect(tenfold.map((s) => s.result.id)).toEqual(base.map((s) => s.result.id));
    tenfold.forEach((s, i) => expect(s.score).toBeCloseTo(base[i]?.score ?? Number.NaN, 12));
  });

  it("treats negative, NaN and infinite weights as 0", () => {
    const settings = only("relevance", "citations", "recency");
    settings.factors.citations.weight = -5;
    settings.factors.relevance.weight = Number.NaN;
    settings.factors.recency.weight = Number.POSITIVE_INFINITY;
    const scored = scoreResults(threeResults(), settings, REFERENCE_YEAR);
    expect(scored.every((s) => s.score === 0)).toBe(true);
    expect(scored[0]?.factors.map((f) => f.weight)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("scores 0 and falls back to id order when no factor is active", () => {
    const scored = scoreResults(threeResults().reverse(), only(), REFERENCE_YEAR);
    expect(scored.every((s) => s.score === 0 && s.factors.every((f) => f.contribution === 0))).toBe(true);
    expect(scored.map((s) => s.result.id)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
  });

  it("uses the labels it is given, so a manual override changes the ranking input", () => {
    const base = item({ id: "10.1000/x" });
    const overridden: ScoringItem = {
      result: base.result,
      labels: applyOverride(base.labels, { peerReview: "not-peer-reviewed" }),
    };
    const [scored] = scoreResults([overridden], only("peerReview"), REFERENCE_YEAR);
    const factor = scored?.factors.find((f) => f.factor === "peerReview");
    expect(factor?.normalized).toBe(0);
    expect(factor?.detail).toContain("(set by you)");
  });
});

describe("scoreResults: determinism", () => {
  it("breaks ties by id, whatever order the input arrives in", () => {
    const x = item({ id: "10.1000/zzz" });
    const y = item({ id: "10.1000/aaa" });
    expect(scoreResults([x, y], defaultScoringSettings(), REFERENCE_YEAR).map((s) => s.result.id)).toEqual([
      "10.1000/aaa",
      "10.1000/zzz",
    ]);
    expect(scoreResults([y, x], defaultScoringSettings(), REFERENCE_YEAR).map((s) => s.result.id)).toEqual([
      "10.1000/aaa",
      "10.1000/zzz",
    ]);
  });

  it("gives identical output for identical input, and does not mutate it", () => {
    const items = threeResults().reverse();
    const idsBefore = items.map((i) => i.result.id);
    const first = scoreResults(items, defaultScoringSettings(), REFERENCE_YEAR);
    const second = scoreResults(items, defaultScoringSettings(), REFERENCE_YEAR);
    expect(second).toEqual(first);
    expect(items.map((i) => i.result.id)).toEqual(idsBefore);
  });

  it("returns an empty list for no results", () => {
    expect(scoreResults([], defaultScoringSettings(), REFERENCE_YEAR)).toEqual([]);
  });
});

describe("scoreResults: factor edge cases", () => {
  const first = (overrides: Partial<Result>, settings = defaultScoringSettings()) =>
    scoreResults([item(overrides)], settings, REFERENCE_YEAR)[0];
  const factor = (s: ReturnType<typeof first>, id: FactorId) => s?.factors.find((f) => f.factor === id);

  it("scores missing data as neutral (0.5) rather than as zero", () => {
    const scored = first({ year: null, citationCount: null, hits: [] });
    for (const id of ["relevance", "citations", "recency"] as const) {
      expect(factor(scored, id)).toMatchObject({ raw: null, normalized: 0.5 });
      expect(factor(scored, id)?.detail).toContain("neutral");
    }
  });

  it("gives tied citation rates the same middle percentile", () => {
    const tied = [item({ id: "10.1000/1", citationCount: 5 }), item({ id: "10.1000/2", citationCount: 5 })];
    const scored = scoreResults(tied, only("citations"), REFERENCE_YEAR);
    expect(scored.map((s) => s.score)).toEqual([0.5, 0.5]);
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
    const scored = scoreResults(set, only("citations"), REFERENCE_YEAR);
    const byId = new Map(scored.map((s) => [s.result.id, s.score]));
    expect(byId.get("10.1000/1")).toBeCloseTo(0.25, 12);
    expect(byId.get("10.1000/2")).toBeCloseTo(0.75, 12);
    expect(byId.get("10.1000/3")).toBe(0.5);
  });

  it("counts a paper published this year as one year old for citation rate", () => {
    const scored = first({ year: REFERENCE_YEAR, citationCount: 8 });
    expect(factor(scored, "citations")?.raw).toBe(8);
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
    const open = first({ openAccess: { isOpen: true, status: "gold", url: null } });
    const closed = first({ openAccess: { isOpen: false, status: "closed", url: null } });
    const unknown = first({ openAccess: { isOpen: null, status: "unknown", url: null } });
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

  it("uses the best rank when several providers returned the result", () => {
    const scored = first({
      hits: [
        { provider: "openalex", id: "W1", rank: 5, listSize: 10, score: 12.3 },
        { provider: "crossref", id: "10.1000/example", rank: 1, listSize: 20, score: null },
      ],
    });
    const relevance = factor(scored, "relevance");
    expect(relevance?.raw).toBe(1);
    expect(relevance?.normalized).toBe(1);
    expect(relevance?.detail).toContain("#1 of 20 on Crossref");
    expect(relevance?.detail).toContain("also returned by #5 of 10 on OpenAlex");
  });

  it("mentions the provider's own relevance score when it gives one", () => {
    const scored = first({ hits: [{ provider: "openalex", id: "W1", rank: 2, listSize: 4, score: 241.04 }] });
    expect(factor(scored, "relevance")?.detail).toContain("relevance score: 241.0");
  });
});

describe("defaultScoringSettings", () => {
  it("uses the documented default weights", () => {
    const { factors, preferredLevels, recencyHalfLifeYears } = defaultScoringSettings();
    expect(Object.fromEntries(FACTOR_IDS.map((id) => [id, factors[id].weight]))).toEqual({
      relevance: 3,
      citations: 1,
      recency: 1,
      peerReview: 1,
      openAccess: 0.5,
      studyType: 0,
    });
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
