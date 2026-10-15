import { defaultFilters, defaultScoringSettings, parseQuery, planQueries, type ProviderId, type Result } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { rankResults, scoringContext } from "./pipeline";
import { idleSearch, searchReducer, type SearchState } from "./searchState";
import { suggestionFor, wordsToAsk } from "./spelling";

const providers: { id: ProviderId; syntax: "boolean" | "pubmed" | "plain" }[] = [
  { id: "openalex", syntax: "boolean" },
  { id: "pubmed", syntax: "pubmed" },
];

function finished(text: string, results: Result[], order: ProviderId[] = ["openalex", "pubmed"]): SearchState {
  const parsed = parseQuery(text);
  let state = searchReducer(idleSearch, {
    type: "start",
    id: 1,
    parsed,
    sent: planQueries(providers, parsed),
    order,
    skipped: [],
  });
  state = searchReducer(state, {
    type: "provider-done",
    id: 1,
    update: { provider: "openalex", status: { provider: "openalex", state: "ok", count: results.length }, results },
  });
  return searchReducer(state, { type: "finish", id: 1, at: new Date() });
}

const rank = (state: SearchState) => {
  if (state.phase === "idle") return null;
  return rankResults(state.results, { scoring: defaultScoringSettings(), filters: defaultFilters(), overrides: new Map() }, scoringContext(state, 2026));
};

const titled = (...titles: string[]): Result[] => titles.map((title, i) => makeResult({ id: `10.1/${i}`, doi: `10.1/${i}`, title }));

describe("wordsToAsk", () => {
  it("asks about a word that almost no result contains, after a search with few full matches", () => {
    const state = finished(
      "chaos double pendulm",
      titled("Chaos in a double system", "Chaos and the double well", "Chaos, double or nothing", "Gardening"),
    );
    expect(wordsToAsk(state, rank(state))).toEqual(["pendulm"]);
  });

  it("does not ask about a word the results contain, even when its spelling is odd", () => {
    const many = Array.from({ length: 4 }, (_, i) => `Caos in a double pendulum ${i}`);
    const state = finished("caos double pendulum", titled(...many));
    expect(wordsToAsk(state, rank(state))).toEqual([]);
  });

  it("asks nothing when ten or more results contain every word", () => {
    const state = finished("chaos pendulm", titled(...Array.from({ length: 12 }, (_, i) => `Chaos pendulm ${i}`)));
    expect(wordsToAsk(state, rank(state))).toEqual([]);
  });

  it("asks nothing while the search is still running", () => {
    const parsed = parseQuery("pendulm");
    const state = searchReducer(idleSearch, { type: "start", id: 1, parsed, sent: planQueries(providers, parsed), order: ["openalex", "pubmed"], skipped: [] });
    expect(wordsToAsk(state, rank(state))).toEqual([]);
  });

  it("asks nothing when PubMed was not one of the sources, so the words are not sent anywhere new", () => {
    const state = finished("pendulm", titled("Gardening"), ["openalex"]);
    expect(wordsToAsk(state, rank(state))).toEqual([]);
  });

  it("asks nothing for words that are quoted, hyphenated, after NOT or too short", () => {
    const state = finished('"pendulm clock" self-organizing NOT ratz cat', titled("Gardening"));
    expect(wordsToAsk(state, rank(state))).toEqual([]);
  });

  it("asks about every rare word, in order", () => {
    const state = finished("sleeep memry consolidation", titled("Consolidation of sleep", "Consolidation of memory", "Consolidation notes"));
    expect(wordsToAsk(state, rank(state))).toEqual(["sleeep", "memry"]);
  });
});

describe("suggestionFor", () => {
  const state = () => finished("chaos double pendulm", titled("Gardening"));

  it("turns the spell checker's answer into the text that was searched, with the word replaced", () => {
    expect(suggestionFor(state(), ["pendulm"], "pendulum")).toEqual({
      text: "chaos double pendulum",
      changes: [{ from: "pendulm", to: "pendulum" }],
    });
  });

  it("is nothing without an answer, or without a search", () => {
    expect(suggestionFor(state(), ["pendulm"], null)).toBeNull();
    expect(suggestionFor(idleSearch, ["pendulm"], "pendulum")).toBeNull();
  });
});
