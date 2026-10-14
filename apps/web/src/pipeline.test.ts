import { defaultFilters, defaultScoringSettings, FACTOR_IDS, type Result } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { rankResults, type ViewSettings } from "./pipeline";
import { withFactor } from "./settings";

const YEAR = 2026;

const hit = (rank: number, listSize: number) => [
  { provider: "openalex" as const, id: `W${rank}`, rank, listSize, score: null },
];

// A: best match, closed.  B: middle, open.  C: worst match, open preprint (not peer-reviewed).
const results = (): Result[] => [
  makeResult({ id: "10.1000/a", year: 2020, hits: hit(1, 3), citationCount: 30 }),
  makeResult({
    id: "10.1000/b", year: 2021, hits: hit(2, 3), citationCount: 10,
    openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null },
  }),
  makeResult({
    id: "10.1000/c", year: 2024, hits: hit(3, 3), citationCount: 2, type: "preprint", venueKind: null,
    openAccess: { isOpen: true, status: "green", url: null, pdfUrl: null },
  }),
];

const view = (changes: Partial<ViewSettings> = {}): ViewSettings => ({
  scoring: defaultScoringSettings(),
  filters: defaultFilters(),
  overrides: new Map(),
  ...changes,
});

const ids = (list: { result: Result }[]) => list.map((item) => item.result.id);

describe("rankResults", () => {
  it("labels, scores and sorts best first, hiding nothing by default", () => {
    const { shown, hidden } = rankResults(results(), view(), YEAR);
    expect(hidden).toEqual([]);
    expect(ids(shown)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i - 1]?.score).toBeGreaterThanOrEqual(shown[i]?.score ?? Number.POSITIVE_INFINITY);
    }
    expect(shown[0]?.labels.level.value).toBe("primary");
    expect(shown[2]?.labels.peerReview.value).toBe("not-peer-reviewed");
  });

  it("re-ranks the same fetched results when weights change", () => {
    const fetched = results();
    const onlyOpenAccess = defaultScoringSettings();
    for (const id of FACTOR_IDS) onlyOpenAccess.factors[id] = { enabled: id === "openAccess", weight: 1 };

    expect(ids(rankResults(fetched, view(), YEAR).shown)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    // B and C are open and A is not, so A drops to the bottom without any new data.
    expect(ids(rankResults(fetched, view({ scoring: onlyOpenAccess }), YEAR).shown)).toEqual([
      "10.1000/b",
      "10.1000/c",
      "10.1000/a",
    ]);
  });

  it("re-ranks when a factor is switched off", () => {
    const scoring = withFactor(defaultScoringSettings(), "relevance", { enabled: false });
    const ranked = rankResults(results(), view({ scoring }), YEAR).shown;
    expect(ranked[0]?.factors.find((f) => f.factor === "relevance")?.contribution).toBe(0);
  });

  it("hides only what a filter excludes, and reports it as hidden", () => {
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const { shown, hidden } = rankResults(results(), view({ filters }), YEAR);
    expect(ids(shown)).toEqual(["10.1000/b", "10.1000/c"]);
    expect(ids(hidden)).toEqual(["10.1000/a"]);
  });

  it("never lets a filter change anyone's score", () => {
    const unfiltered = rankResults(results(), view(), YEAR).shown;
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const filtered = rankResults(results(), view({ filters }), YEAR).shown;
    for (const item of filtered) {
      const same = unfiltered.find((other) => other.result.id === item.result.id);
      expect(item.score).toBe(same?.score);
    }
  });

  it("applies the user's label overrides to both the labels and the score", () => {
    const base = rankResults(results(), view(), YEAR).shown.find((s) => s.result.id === "10.1000/c");
    const overrides = new Map([["10.1000/c", { peerReview: "peer-reviewed" as const, level: "secondary" as const }]]);
    const changed = rankResults(results(), view({ overrides }), YEAR).shown.find((s) => s.result.id === "10.1000/c");

    expect(changed?.labels.level).toMatchObject({ value: "secondary", origin: "user" });
    expect(changed?.labels.peerReview).toMatchObject({ value: "peer-reviewed", origin: "user" });
    expect(changed?.score).toBeGreaterThan(base?.score ?? Number.POSITIVE_INFINITY);
  });

  it("filters on overridden labels", () => {
    const overrides = new Map([["10.1000/c", { level: "tertiary" as const }]]);
    const filters = { ...defaultFilters(), levels: ["tertiary" as const] };
    expect(ids(rankResults(results(), view({ overrides, filters }), YEAR).shown)).toEqual(["10.1000/c"]);
  });

  it("does not modify its inputs", () => {
    const fetched = results();
    const before = structuredClone(fetched);
    const settings = view();
    rankResults(fetched, settings, YEAR);
    expect(fetched).toEqual(before);
  });

  it("returns empty lists for no results", () => {
    expect(rankResults([], view(), YEAR)).toEqual({ shown: [], hidden: [] });
  });
});
