import { describe, expect, it } from "vitest";
import { BM25_B, BM25_K1, scoreBm25 } from "./bm25";

describe("scoreBm25: the formula", () => {
  it("uses the standard parameters", () => {
    expect(BM25_K1).toBe(1.2);
    expect(BM25_B).toBe(0.75);
  });

  it("matches a hand-worked case: two equal-length documents, one containing the term once", () => {
    // N = 2, n(t) = 1  ->  idf = ln(1 + (2 - 1 + 0.5) / (1 + 0.5)) = ln 2.
    // |d| = avgdl for both, so the length factor is 1 and
    // score = idf * 1 * (k1 + 1) / (1 + k1 * 1) = ln 2 * 2.2 / 2.2 = ln 2.
    const result = scoreBm25([["sleep", "memory"], ["dream", "memory"]], ["sleep"]);
    expect(result.scores[0]).toBeCloseTo(Math.LN2, 12);
    expect(result.scores[1]).toBe(0);
    expect(result.maxScore).toBeCloseTo(Math.LN2, 12);
  });

  it("matches a second hand-worked case with a repeated term and a longer document", () => {
    // Documents: A = [sleep, sleep, x, x] (length 4), B = [y, y] (length 2). N = 2, avgdl = 3.
    // idf(sleep) = ln 2. For A: tf = 2, lengthFactor = 1 - 0.75 + 0.75 * 4/3 = 1.25
    //   score = ln2 * 2 * 2.2 / (2 + 1.2 * 1.25) = ln2 * 4.4 / 3.5
    const result = scoreBm25([["sleep", "sleep", "x", "x"], ["y", "y"]], ["sleep"]);
    expect(result.scores[0]).toBeCloseTo((Math.LN2 * 4.4) / 3.5, 12);
    expect(result.averageLength).toBe(3);
  });

  it("counts a rarer term for more than a common one", () => {
    const docs = [["sleep", "rare"], ["sleep", "x"], ["sleep", "y"], ["sleep", "z"]];
    const result = scoreBm25(docs, ["sleep", "rare"]);
    const [sleep, rare] = (result.matches[0] ?? []).slice().sort((a, b) => (a.term < b.term ? 1 : -1));
    expect(sleep?.term).toBe("sleep");
    expect(rare?.term).toBe("rare");
    expect(rare?.contribution).toBeGreaterThan(sleep?.contribution ?? 0);
  });

  it("gives repeats diminishing returns: ten mentions are worth less than ten times one", () => {
    const filler = ["x", "x", "x", "x", "x", "x", "x", "x", "x", "x"];
    const once = scoreBm25([["sleep", ...filler], ["z", ...filler]], ["sleep"]).scores[0] ?? 0;
    const tenTimes = scoreBm25([["sleep", "sleep", "sleep", "sleep", "sleep", "sleep", "sleep", "sleep", "sleep", "sleep"], ["z", ...filler]], ["sleep"]).scores[0] ?? 0;
    expect(tenTimes).toBeGreaterThan(once);
    expect(tenTimes).toBeLessThan(once * 10);
  });

  it("discounts a long document against a short one with the same matches", () => {
    const short = ["sleep", "memory"];
    const long = ["sleep", "memory", ...Array.from({ length: 40 }, () => "filler")];
    const result = scoreBm25([short, long], ["sleep", "memory"]);
    expect(result.scores[0]).toBeGreaterThan(result.scores[1] ?? Number.POSITIVE_INFINITY);
  });

  it("scores a term that every document contains as only slightly positive, never negative", () => {
    const result = scoreBm25([["sleep"], ["sleep"], ["sleep"]], ["sleep"]);
    for (const score of result.scores) expect(score).toBeGreaterThan(0);
    expect(result.scores[0]).toBeLessThan(0.3);
  });
});

describe("scoreBm25: details and edge cases", () => {
  it("lists each document's matches, strongest first, with counts and contributions that add up", () => {
    const result = scoreBm25([["sleep", "sleep", "memory"], ["dream"]], ["sleep", "memory"]);
    const matches = result.matches[0] ?? [];
    expect(matches.map((m) => m.term).sort()).toEqual(["memory", "sleep"]);
    expect(matches.find((m) => m.term === "sleep")?.count).toBe(2);
    expect(matches[0]?.contribution).toBeGreaterThanOrEqual(matches[1]?.contribution ?? 0);
    expect(matches.reduce((sum, m) => sum + m.contribution, 0)).toBeCloseTo(result.scores[0] ?? 0, 12);
    expect(result.matches[1]).toEqual([]);
  });

  it("counts a repeated query term once", () => {
    const once = scoreBm25([["sleep", "x"], ["y", "x"]], ["sleep"]);
    const repeated = scoreBm25([["sleep", "x"], ["y", "x"]], ["sleep", "sleep", "sleep"]);
    expect(repeated.scores).toEqual(once.scores);
    expect(repeated.terms).toEqual(["sleep"]);
  });

  it("scores everything 0 when no document matches, or when there are no query terms", () => {
    expect(scoreBm25([["a"], ["b"]], ["zzz"]).scores).toEqual([0, 0]);
    expect(scoreBm25([["a"], ["b"]], []).scores).toEqual([0, 0]);
    expect(scoreBm25([["a"], ["b"]], []).maxScore).toBe(0);
  });

  it("copes with no documents, and with empty documents", () => {
    expect(scoreBm25([], ["sleep"])).toMatchObject({ scores: [], maxScore: 0, documentCount: 0, averageLength: 0 });
    const empties = scoreBm25([[], []], ["sleep"]);
    expect(empties.scores).toEqual([0, 0]);
    expect(Number.isFinite(empties.maxScore)).toBe(true);
  });

  it("scores one document alone", () => {
    const result = scoreBm25([["sleep", "memory"]], ["sleep"]);
    expect(result.scores[0]).toBeGreaterThan(0);
    expect(Number.isFinite(result.scores[0])).toBe(true);
  });

  it("is deterministic, and gives the same scores whatever order the documents arrive in", () => {
    const docs = [["sleep", "memory"], ["sleep"], ["dream", "memory", "memory"], ["x"]];
    const forwards = scoreBm25(docs, ["sleep", "memory"]).scores;
    const backwards = scoreBm25([...docs].reverse(), ["sleep", "memory"]).scores.reverse();
    forwards.forEach((score, index) => expect(backwards[index]).toBeCloseTo(score, 12));
    expect(scoreBm25(docs, ["sleep", "memory"]).scores).toEqual(forwards);
  });

  it("honours custom parameters: b = 0 ignores document length", () => {
    const docs = [["sleep", "memory"], ["sleep", "memory", ...Array.from({ length: 40 }, () => "filler")]];
    const noLength = scoreBm25(docs, ["sleep"], { b: 0 });
    expect(noLength.scores[0]).toBeCloseTo(noLength.scores[1] ?? 0, 12);
  });
});
