import { describe, expect, it } from "vitest";
import { applyOverride, classify } from "./classify";
import { applyFilters, defaultFilters, isFiltering, type ResultFilters } from "./filters";
import type { ScoringItem } from "./scoring";
import { makeResult } from "./testing/make-result";
import type { Result } from "./types";

const item = (overrides: Partial<Result>): ScoringItem => {
  const result = makeResult(overrides);
  return { result, labels: classify(result) };
};

// A small, varied set. Levels / peer review follow from the classification rules.
const set = {
  articleOpen: item({ id: "article-open", year: 2022, openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null } }),
  articleClosed: item({ id: "article-closed", year: 2010 }),
  review: item({ id: "review", year: 2018, type: "review" }),
  preprint: item({ id: "preprint", year: 2024, type: "preprint", venueKind: null }),
  book: item({ id: "book", year: 1999, type: "book", venueKind: null }),
  noYear: item({ id: "no-year", year: null }),
  oaUnknown: item({ id: "oa-unknown", openAccess: { isOpen: null, status: "unknown", url: null, pdfUrl: null } }),
};
const all = Object.values(set);
const ids = (items: readonly ScoringItem[]) => items.map((i) => i.result.id);
const filtered = (changes: Partial<ResultFilters>) => applyFilters(all, { ...defaultFilters(), ...changes });

describe("applyFilters", () => {
  it("hides nothing by default", () => {
    const { kept, hidden } = applyFilters(all, defaultFilters());
    expect(kept).toEqual(all);
    expect(hidden).toEqual([]);
  });

  it("keeps the input order", () => {
    expect(ids(filtered({ levels: ["primary", "tertiary"] }).kept)).toEqual(
      all.filter((i) => ["primary", "tertiary"].includes(i.labels.level.value)).map((i) => i.result.id),
    );
  });

  it("splits every item into exactly one of kept or hidden", () => {
    const { kept, hidden } = filtered({ yearFrom: 2015, openAccessOnly: true });
    expect(kept.length + hidden.length).toBe(all.length);
    expect(new Set([...ids(kept), ...ids(hidden)]).size).toBe(all.length);
  });

  describe("year range", () => {
    it("is inclusive at both ends", () => {
      // 2022 (article-open), 2018 (review) and 2020 (oa-unknown) are in; 2010, 2024 and 1999 are out.
      expect(ids(filtered({ yearFrom: 2018, yearTo: 2022 }).kept)).toEqual(["article-open", "review", "oa-unknown"]);
    });

    it("works with only a lower or only an upper bound", () => {
      expect(ids(filtered({ yearFrom: 2022 }).kept)).toEqual(["article-open", "preprint"]);
      expect(ids(filtered({ yearTo: 1999 }).kept)).toEqual(["book"]);
    });

    it("hides results with no year once a bound is set, but not before", () => {
      expect(ids(filtered({ yearFrom: 1900 }).hidden)).toEqual(["no-year"]);
      expect(ids(filtered({}).hidden)).toEqual([]);
    });

    it("returns nothing for an impossible range instead of failing", () => {
      expect(filtered({ yearFrom: 2024, yearTo: 2000 }).kept).toEqual([]);
    });
  });

  it("filters by level", () => {
    expect(ids(filtered({ levels: ["secondary"] }).kept)).toEqual(["review"]);
    expect(ids(filtered({ levels: ["tertiary"] }).kept)).toEqual(["book"]);
  });

  it("filters by peer-review status", () => {
    expect(ids(filtered({ peerReview: ["not-peer-reviewed"] }).kept)).toEqual(["preprint"]);
    expect(ids(filtered({ peerReview: ["unknown"] }).kept)).toEqual(["book"]);
  });

  it("combines filters with AND", () => {
    const result = filtered({ levels: ["primary"], peerReview: ["peer-reviewed"], yearFrom: 2020, openAccessOnly: true });
    expect(ids(result.kept)).toEqual(["article-open"]);
  });

  it("keeps only open-access results for 'open access only', and treats unknown as not open", () => {
    expect(ids(filtered({ openAccessOnly: true }).kept)).toEqual(["article-open"]);
    expect(ids(filtered({ openAccessOnly: true }).hidden)).not.toContain("article-open");
    expect(ids(filtered({ openAccessOnly: true }).hidden)).toContain("oa-unknown");
  });

  it("uses the user's manual overrides, not only the rules", () => {
    const overridden: ScoringItem = {
      result: set.book.result,
      labels: applyOverride(set.book.labels, { level: "primary", peerReview: "peer-reviewed" }),
    };
    const items = [overridden, set.review];
    expect(ids(applyFilters(items, { ...defaultFilters(), levels: ["primary"] }).kept)).toEqual(["book"]);
    expect(ids(applyFilters(items, { ...defaultFilters(), levels: ["tertiary"] }).kept)).toEqual([]);
  });

  it("works on scored results too, leaving their scores alone", () => {
    const scored = [{ ...set.review, score: 0.9, factors: [] }, { ...set.book, score: 0.1, factors: [] }];
    const { kept } = applyFilters(scored, { ...defaultFilters(), levels: ["tertiary"] });
    expect(kept).toEqual([scored[1]]);
    expect(kept[0]?.score).toBe(0.1);
  });
});

describe("isFiltering / defaultFilters", () => {
  it("is false for the defaults", () => {
    expect(isFiltering(defaultFilters())).toBe(false);
  });

  it.each<[string, Partial<ResultFilters>]>([
    ["a lower year", { yearFrom: 2000 }],
    ["an upper year", { yearTo: 2000 }],
    ["a year of 0", { yearFrom: 0 }],
    ["a level", { levels: ["primary"] }],
    ["a peer-review status", { peerReview: ["unknown"] }],
    ["open access only", { openAccessOnly: true }],
  ])("is true when %s is set", (_name, changes) => {
    expect(isFiltering({ ...defaultFilters(), ...changes })).toBe(true);
  });

  it("returns an independent copy every time", () => {
    const one = defaultFilters();
    one.levels.push("primary");
    expect(defaultFilters().levels).toEqual([]);
  });
});
