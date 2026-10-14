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
  makeResult({ id: "10.1000/a", doi: "10.1000/a", year: 2020, hits: hit(1, 3), citationCount: 30 }),
  makeResult({
    id: "10.1000/b", doi: "10.1000/b", year: 2021, hits: hit(2, 3), citationCount: 10,
    openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null },
  }),
  makeResult({
    id: "10.1000/c", doi: "10.1000/c", year: 2024, hits: hit(3, 3), citationCount: 2, type: "preprint", venueKind: null,
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

describe("rankResults: results found by several sources", () => {
  const found = (provider: "openalex" | "crossref" | "pubmed", rank: number, overrides: Partial<Result> = {}) =>
    makeResult({
      id: "10.1000/shared",
      doi: "10.1000/shared",
      hits: [{ provider, id: `${provider}-${rank}`, rank, listSize: 10, score: null }],
      ...overrides,
    });

  it("merges one work returned by three sources into one result that lists all three", () => {
    const { shown } = rankResults([found("pubmed", 7), found("crossref", 3), found("openalex", 1)], view(), YEAR);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.result.hits.map((h) => h.provider)).toEqual(["openalex", "crossref", "pubmed"]);
  });

  it("scores relevance from the best rank any source gave", () => {
    const { shown } = rankResults([found("pubmed", 9), found("openalex", 2)], view(), YEAR);
    const relevance = shown[0]?.factors.find((f) => f.factor === "relevance");
    expect(relevance?.raw).toBe(2);
    expect(relevance?.detail).toContain("also returned by #9 of 10 on PubMed");
  });

  it("gives the same ranking whatever order the sources answered in", () => {
    const others = [
      makeResult({ id: "10.1000/x", doi: "10.1000/x", year: 2019, hits: hit(1, 3) }),
      makeResult({ id: "10.1000/y", doi: "10.1000/y", year: 2015, hits: hit(3, 3) }),
    ];
    const pile = [found("openalex", 2), found("crossref", 5), ...others];
    const forwards = rankResults(pile, view(), YEAR).shown;
    const backwards = rankResults([...pile].reverse(), view(), YEAR).shown;
    expect(backwards.map((s) => [s.result.id, s.score])).toEqual(forwards.map((s) => [s.result.id, s.score]));
  });

  it("uses the merged record for filters, so one source's open-access flag counts", () => {
    const closed = found("crossref", 1, { openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null } });
    const open = found("europepmc" as never, 4, { openAccess: { isOpen: true, status: "unknown", url: "https://x.org", pdfUrl: null } });
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const { shown, hidden } = rankResults([closed, open], view({ filters }), YEAR);
    expect(shown).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("does not merge different works that merely share a title", () => {
    const a = makeResult({ id: "10.1/a", doi: "10.1/a", title: "Sleep and memory in adults", authors: [{ name: "Ann Smith" }] });
    const b = makeResult({ id: "10.1/b", doi: "10.1/b", title: "Sleep and memory in adults", authors: [{ name: "Ann Smith" }] });
    expect(rankResults([a, b], view(), YEAR).shown).toHaveLength(2);
  });
});
