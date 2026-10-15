import { addSaved, buildProtocol, defaultFilters, defaultLayoutSettings, defaultScoringSettings, parseQuery, planQueries, protocolJson, type ProviderId } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { rankResults, scoringContext } from "./pipeline";
import { protocolInputFrom, searchRecord, type CounterRecord } from "./protocolRecord";
import { idleSearch, searchReducer, type ActiveSearch } from "./searchState";

const providers: { id: ProviderId; syntax: "boolean" | "plain" }[] = [
  { id: "openalex", syntax: "boolean" },
  { id: "crossref", syntax: "plain" },
];

function finished(text: string, ids: string[]): ActiveSearch {
  const parsed = parseQuery(text);
  let state = searchReducer(idleSearch, {
    type: "start",
    id: 1,
    parsed,
    sent: planQueries(providers, parsed),
    order: providers.map((p) => p.id),
    skipped: [{ provider: "arxiv", state: "skipped", message: "no CORS" }],
  });
  state = searchReducer(state, {
    type: "provider-done",
    id: 1,
    update: {
      provider: "openalex",
      status: { provider: "openalex", state: "ok", count: ids.length },
      results: ids.map((id) => makeResult({ id, doi: id, title: `Sleep and memory ${id}` })),
    },
  });
  state = searchReducer(state, {
    type: "provider-done",
    id: 1,
    update: { provider: "crossref", status: { provider: "crossref", state: "rate-limited", message: "busy" }, results: [] },
  });
  state = searchReducer(state, { type: "finish", id: 1, at: new Date() });
  if (state.phase === "idle") throw new Error("expected an active search");
  return state;
}

const view = { scoring: defaultScoringSettings(), filters: defaultFilters(), overrides: new Map(), layout: defaultLayoutSettings() };
const rank = (search: ActiveSearch) => rankResults(search.results, view, scoringContext(search, 2026));

describe("searchRecord", () => {
  it("records the typed query, the tidy one, what was removed, what each source got and how each answered", () => {
    const search = finished("What is the effect of sleep on memory?", ["10.1/a", "10.1/b"]);
    const record = searchRecord(search, rank(search));
    expect(record.typedQuery).toBe("What is the effect of sleep on memory?");
    expect(record.searchedQuery).toBe("effect sleep memory");
    expect(record.commonWordsRemoved).toEqual(["what", "is", "the", "of", "on"]);
    expect(record.sentQueries.map((q) => [q.provider, q.text])).toEqual([
      ["openalex", "effect AND sleep AND memory"],
      ["crossref", "effect sleep memory"],
    ]);
    // Statuses come in the order the sources were asked, with skipped ones last.
    expect(record.statuses.map((s) => [s.provider, s.state])).toEqual([
      ["openalex", "ok"],
      ["crossref", "rate-limited"],
      ["arxiv", "skipped"],
    ]);
  });

  it("counts what was fetched, merged, shown and hidden by filters", () => {
    const search = finished("sleep memory", ["10.1/a", "10.1/b", "10.1/c"]);
    const filtered = rankResults(search.results, { ...view, filters: { ...defaultFilters(), openAccessOnly: true } }, scoringContext(search, 2026));
    expect(searchRecord(search, rank(search)).counts).toEqual({ fetched: 3, merged: 3, shown: 3, partialMatches: 0, otherLanguages: 0, otherTypes: 0, hiddenByFilters: 0 });
    expect(searchRecord(search, filtered).counts).toEqual({ fetched: 3, merged: 3, shown: 0, partialMatches: 0, otherLanguages: 0, otherTypes: 0, hiddenByFilters: 3 });
  });

  it("counts results that lack more than one search word as partial matches, not as shown", () => {
    const search = finished("sleep memory dreams nightmares", ["10.1/a", "10.1/b"]);
    expect(searchRecord(search, rank(search)).counts).toMatchObject({ fetched: 2, merged: 2, shown: 0, partialMatches: 2 });
  });

  it("counts results that lack one word as shown while few contain every word", () => {
    const search = finished("sleep memory dreams", ["10.1/a", "10.1/b"]);
    expect(searchRecord(search, rank(search)).counts).toMatchObject({ shown: 2, partialMatches: 0 });
  });

  it("counts the results kept apart as other languages and as other types", () => {
    const parsed = parseQuery("pendulum");
    let state = searchReducer(idleSearch, { type: "start", id: 1, parsed, sent: planQueries(providers, parsed), order: ["openalex"], skipped: [] });
    state = searchReducer(state, {
      type: "provider-done",
      id: 1,
      update: {
        provider: "openalex",
        status: { provider: "openalex", state: "ok", count: 3 },
        results: [
          makeResult({ id: "10.1/en", doi: "10.1/en", title: "Pendulum", language: "en" }),
          makeResult({ id: "10.1/es", doi: "10.1/es", title: "Pendulum", language: "es" }),
          makeResult({ id: "10.1/data", doi: "10.1/data", title: "Pendulum", type: "dataset", language: "en" }),
        ],
      },
    });
    if (state.phase === "idle") throw new Error("expected an active search");
    expect(searchRecord(state, rank(state)).counts).toMatchObject({ merged: 3, shown: 1, otherLanguages: 1, otherTypes: 1 });
  });

  it("records the expanded pass when it ran, and null when it did not", () => {
    const search = finished("sleep memory", ["10.1/a"]);
    expect(searchRecord(search, rank(search)).expandedPass).toBeNull();
    const expanded = searchReducer(searchReducer(search, { type: "expand-start", id: 1, sent: [{ provider: "openalex", text: "sleep memory", notes: [] }], order: ["openalex"] }), {
      type: "expand-provider-done",
      id: 1,
      update: { provider: "openalex", status: { provider: "openalex", state: "ok", count: 0 }, results: [] },
    });
    if (expanded.phase === "idle") throw new Error("expected an active search");
    expect(searchRecord(expanded, rank(expanded)).expandedPass).toEqual({
      sentQueries: [{ provider: "openalex", text: "sleep memory", notes: [] }],
      statuses: [{ provider: "openalex", state: "ok", count: 0 }],
    });
  });

  it("counts duplicates as fetched but not as merged", () => {
    const parsed = parseQuery("sleep");
    let state = searchReducer(idleSearch, { type: "start", id: 1, parsed, sent: planQueries(providers, parsed), order: ["openalex", "crossref"], skipped: [] });
    for (const provider of ["openalex", "crossref"] as const) {
      state = searchReducer(state, {
        type: "provider-done",
        id: 1,
        update: {
          provider,
          status: { provider, state: "ok", count: 1 },
          results: [makeResult({ id: "10.1/same", doi: "10.1/same", hits: [{ provider, id: "1", rank: 1, listSize: 1, score: null }] })],
        },
      });
    }
    if (state.phase === "idle") throw new Error("expected an active search");
    expect(searchRecord(state, rank(state)).counts).toMatchObject({ fetched: 2, merged: 1 });
  });
});

describe("protocolInputFrom", () => {
  const saved = addSaved([], makeResult({ id: "10.1/s", doi: "10.1/s", title: "Saved paper", url: "https://doi.org/10.1/s" }), new Date());

  it("gathers the search, the sources asked, the settings and the saved titles", () => {
    const search = finished("sleep memory", ["10.1/a"]);
    const input = protocolInputFrom({
      search,
      ranked: rank(search),
      counter: null,
      perSource: 50,
      filters: { ...defaultFilters(), yearFrom: 2010 },
      scoring: defaultScoringSettings(),
      layout: defaultLayoutSettings(),
      saved,
      referenceYear: 2026,
      appVersion: "0.1.0",
      date: new Date("2026-10-14T12:00:00Z"),
    });
    expect(input.sources).toEqual(["openalex", "crossref"]);
    expect(input.resultsPerSource).toBe(50);
    expect(input.filters.yearFrom).toBe(2010);
    expect(input.saved).toEqual([{ title: "Saved paper", doi: "10.1/s", url: "https://doi.org/10.1/s" }]);
    expect(input.counter).toBeNull();
  });

  it("includes a finished counterargument search with its mode and terms", () => {
    const search = finished("sleep memory", ["10.1/a"]);
    const counterSearch = finished("sleep memory (limitation OR bias)", ["10.1/c"]);
    const counter: CounterRecord = { search: counterSearch, ranked: rank(counterSearch), mode: "terms", terms: ["limitation", "bias"] };
    const input = protocolInputFrom({
      search,
      ranked: rank(search),
      counter,
      perSource: 100,
      filters: defaultFilters(),
      scoring: defaultScoringSettings(),
      layout: defaultLayoutSettings(),
      saved: [],
      referenceYear: 2026,
      appVersion: "0.1.0",
      date: new Date("2026-10-14T12:00:00Z"),
    });
    expect(input.counter).toMatchObject({ mode: "terms", terms: ["limitation", "bias"], typedQuery: "sleep memory (limitation OR bias)" });
  });

  it("makes a protocol that holds no key or email, whatever else is on the page", () => {
    const search = finished("sleep", ["10.1/a"]);
    const input = protocolInputFrom({
      search,
      ranked: rank(search),
      counter: null,
      perSource: 100,
      filters: defaultFilters(),
      scoring: defaultScoringSettings(),
      layout: defaultLayoutSettings(),
      saved: [],
      referenceYear: 2026,
      appVersion: "0.1.0",
      date: new Date("2026-10-14T12:00:00Z"),
    });
    const json = protocolJson(buildProtocol(input));
    expect(json).not.toMatch(/api[_-]?key"\s*:/i);
    expect(json).not.toContain("@");
    expect(JSON.parse(json).search.searchedQuery).toBe("sleep");
  });
});
