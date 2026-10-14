import { classify, scoreResults, defaultScoringSettings, type Result, type ScoredResult } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { COUNTER_VIEWS, countViews, isFlagged, isReview, selectView } from "./counterView";

const research = makeResult({ id: "10.1/research", doi: "10.1/research", title: "Sleep and memory" });
const review = makeResult({ id: "10.1/review", doi: "10.1/review", title: "Sleep: a systematic review", type: "review" });
const retractionNotice = makeResult({ id: "10.1/notice", doi: "10.1/notice", title: "Retraction: Sleep and memory", type: "other" });
const correctionNotice = makeResult({ id: "10.1/erratum", doi: "10.1/erratum", title: "Erratum to: Sleep and memory" });
const retractedWork = makeResult({
  id: "10.1/retracted",
  doi: "10.1/retracted",
  title: "RETRACTED ARTICLE: Sleep and memory",
  retraction: { retracted: true, source: "OpenAlex is_retracted (Retraction Watch)" },
});
const reviewAndRetracted = makeResult({
  id: "10.1/both",
  doi: "10.1/both",
  title: "A review of sleep",
  type: "review",
  retraction: { retracted: true, source: "Crossref updated-by: retraction" },
});

const all = [research, review, retractionNotice, correctionNotice, retractedWork, reviewAndRetracted];

const scored = (results: Result[]): ScoredResult[] =>
  scoreResults(
    results.map((result) => ({ result, labels: classify(result) })),
    defaultScoringSettings(),
    { referenceYear: 2026, queryTerms: ["sleep"], answeredSources: 1 },
  );
const ids = (list: readonly ScoredResult[]) => list.map((item) => item.result.id).sort();

describe("isReview and isFlagged", () => {
  it("recognise reviews, and notices and retracted works", () => {
    expect(isReview(review)).toBe(true);
    expect(isReview(research)).toBe(false);
    expect(isFlagged(retractionNotice)).toBe(true);
    expect(isFlagged(correctionNotice)).toBe(true);
    expect(isFlagged(retractedWork)).toBe(true);
    expect(isFlagged(research)).toBe(false);
    expect(isFlagged(review)).toBe(false);
  });

  it("does not count a work as retracted when the sources only say they do not know", () => {
    expect(isFlagged(makeResult({ retraction: { retracted: null, source: null } }))).toBe(false);
    expect(isFlagged(makeResult({ retraction: { retracted: false, source: "PubMed" } }))).toBe(false);
  });
});

describe("countViews", () => {
  it("counts every result, the reviews and the flagged ones (a result can be in both groups)", () => {
    expect(countViews(scored(all))).toEqual({ all: 6, reviews: 2, flagged: 4 });
  });

  it("counts nothing for an empty list", () => {
    expect(countViews([])).toEqual({ all: 0, reviews: 0, flagged: 0 });
  });
});

describe("selectView", () => {
  const list = scored(all);

  it("shows everything for 'all', in the same order", () => {
    expect(selectView(list, "all").map((item) => item.result.id)).toEqual(list.map((item) => item.result.id));
  });

  it("shows only reviews for 'reviews'", () => {
    expect(ids(selectView(list, "reviews"))).toEqual(["10.1/both", "10.1/review"]);
  });

  it("shows notices and retracted works for 'flagged'", () => {
    expect(ids(selectView(list, "flagged"))).toEqual(["10.1/both", "10.1/erratum", "10.1/notice", "10.1/retracted"]);
  });

  it("keeps the ranking order within a view and does not change any score", () => {
    const flagged = selectView(list, "flagged");
    const order = list.map((item) => item.result.id).filter((id) => flagged.some((item) => item.result.id === id));
    expect(flagged.map((item) => item.result.id)).toEqual(order);
    for (const item of flagged) expect(item.score).toBe(list.find((other) => other.result.id === item.result.id)?.score);
  });

  it("does not change the list it was given", () => {
    const before = list.map((item) => item.result.id);
    selectView(list, "reviews");
    expect(list.map((item) => item.result.id)).toEqual(before);
  });
});

describe("COUNTER_VIEWS", () => {
  it("names the three views", () => {
    expect(COUNTER_VIEWS.map((view) => view.id)).toEqual(["all", "reviews", "flagged"]);
    expect(COUNTER_VIEWS.map((view) => view.label)).toEqual(["All", "Reviews and meta-analyses", "Retractions and corrections"]);
  });
});
