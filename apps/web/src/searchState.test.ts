import { counterQuery, parseQuery, planQueries, type ProviderId, type ProviderStatus, type ProviderUpdate } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { idleSearch, orderedStatuses, searchReducer, type ActiveSearch, type SearchState } from "./searchState";

const done = (provider: ProviderId, ids: string[] = []): ProviderUpdate => ({
  provider,
  status: { provider, state: "ok", count: ids.length },
  results: ids.map((id) => makeResult({ id })),
});

const startAction = (text: string, order: ProviderId[], skipped: ProviderStatus[] = [], id = 1) => {
  const parsed = parseQuery(text);
  return {
    type: "start" as const,
    id,
    parsed,
    sent: planQueries(order.map((provider) => ({ id: provider, syntax: "boolean" as const })), parsed),
    order,
    skipped,
  };
};

const started = (order: ProviderId[] = ["openalex", "crossref"], skipped: ProviderStatus[] = []): ActiveSearch => {
  const state = searchReducer(idleSearch, startAction("sleep", order, skipped));
  if (state.phase === "idle") throw new Error("expected an active search");
  return state;
};

describe("searchReducer", () => {
  it("starts with every provider pending and nothing shown yet", () => {
    expect(started()).toEqual({
      phase: "searching",
      id: 1,
      query: "sleep",
      parsed: parseQuery("sleep"),
      terms: ["sleep"],
      sent: [
        { provider: "openalex", text: "sleep", notes: [] },
        { provider: "crossref", text: "sleep", notes: [] },
      ],
      order: ["openalex", "crossref"],
      results: [],
      statuses: [],
      pending: ["openalex", "crossref"],
      searchedAt: null,
    });
  });

  it("adds a provider's results and status the moment it answers, and stops waiting for it", () => {
    const next = searchReducer(started(), { type: "provider-done", id: 1, update: done("crossref", ["10.1/a", "10.1/b"]) });
    if (next.phase === "idle") throw new Error("expected an active search");
    expect(next.phase).toBe("searching");
    expect(next.results.map((r) => r.id)).toEqual(["10.1/a", "10.1/b"]);
    expect(next.statuses).toEqual([{ provider: "crossref", state: "ok", count: 2 }]);
    expect(next.pending).toEqual(["openalex"]);
  });

  it("keeps results from every provider, whatever order they arrive in", () => {
    let state: SearchState = started();
    state = searchReducer(state, { type: "provider-done", id: 1, update: done("crossref", ["10.1/c"]) });
    state = searchReducer(state, { type: "provider-done", id: 1, update: done("openalex", ["10.1/o"]) });
    if (state.phase === "idle") throw new Error("expected an active search");
    expect(state.results.map((r) => r.id)).toEqual(["10.1/c", "10.1/o"]);
    expect(state.pending).toEqual([]);
  });

  it("records failed and rate-limited providers with no results", () => {
    const failed: ProviderUpdate = { provider: "openalex", status: { provider: "openalex", state: "rate-limited", message: "busy" }, results: [] };
    const state = searchReducer(started(), { type: "provider-done", id: 1, update: failed });
    if (state.phase === "idle") throw new Error("expected an active search");
    expect(state.statuses).toEqual([{ provider: "openalex", state: "rate-limited", message: "busy" }]);
    expect(state.results).toEqual([]);
  });

  it("finishes: phase 'done', nothing pending, and the time it finished", () => {
    const at = new Date("2026-10-14T12:00:00Z");
    const state = searchReducer(started(), { type: "finish", id: 1, at });
    expect(state).toMatchObject({ phase: "done", pending: [], searchedAt: at });
  });

  it("ignores answers that belong to an older search", () => {
    const newer = searchReducer(started(), startAction("memory", ["openalex"], [], 2));
    const afterLate = searchReducer(newer, { type: "provider-done", id: 1, update: done("openalex", ["10.1/stale"]) });
    expect(afterLate).toBe(newer);
    expect(searchReducer(newer, { type: "finish", id: 1, at: new Date() })).toBe(newer);
  });

  it("ignores a provider that reports twice, or one that was never asked", () => {
    let state: SearchState = started();
    state = searchReducer(state, { type: "provider-done", id: 1, update: done("openalex", ["10.1/a"]) });
    const again = searchReducer(state, { type: "provider-done", id: 1, update: done("openalex", ["10.1/dup"]) });
    expect(again).toBe(state);
    expect(searchReducer(state, { type: "provider-done", id: 1, update: done("zenodo", ["10.1/z"]) })).toBe(state);
  });

  it("ignores updates when there is no search at all", () => {
    expect(searchReducer(idleSearch, { type: "provider-done", id: 1, update: done("openalex") })).toBe(idleSearch);
    expect(searchReducer(idleSearch, { type: "finish", id: 1, at: new Date() })).toBe(idleSearch);
  });

  it("starts with skipped providers already reported, and clears the previous results", () => {
    const skipped: ProviderStatus[] = [{ provider: "arxiv", state: "skipped", message: "browsers cannot call it" }];
    const first = searchReducer(started(), { type: "provider-done", id: 1, update: done("openalex", ["10.1/a"]) });
    const second = searchReducer(first, startAction("memory", ["openalex"], skipped, 2));
    expect(second).toMatchObject({ id: 2, query: "memory", results: [], statuses: skipped, pending: ["openalex"] });
  });
});

describe("searchReducer: the query", () => {
  const begin = (text: string) => {
    const state = searchReducer(idleSearch, startAction(text, ["openalex", "crossref"]));
    if (state.phase === "idle") throw new Error("expected an active search");
    return state;
  };

  it("keeps the query as tidy text, the words it asks for, and what was typed", () => {
    const state = begin("what is the effect of sleep on memory?");
    expect(state.query).toBe("effect sleep memory");
    expect(state.terms).toEqual(["effect", "sleep", "memory"]);
    expect(state.parsed.original).toBe("what is the effect of sleep on memory?");
    expect(state.parsed.droppedStopwords).toEqual(["what", "is", "the", "of", "on"]);
  });

  it("keeps the words to leave out out of the words it asks for", () => {
    const state = begin('"memory consolidation" sleep NOT rats');
    expect(state.query).toBe('"memory consolidation" sleep NOT rats');
    expect(state.terms).toEqual(["memory", "consolidation", "sleep"]);
  });

  it("does not count the counterargument terms among the words the search is about", () => {
    const main = parseQuery("sleep memory");
    const query = counterQuery(main, ["limitation", "bias"]);
    const state = searchReducer(idleSearch, {
      type: "start",
      id: 1,
      parsed: query,
      sent: planQueries([{ id: "openalex", syntax: "boolean" }], query),
      order: ["openalex"],
      skipped: [],
    });
    if (state.phase === "idle") throw new Error("expected an active search");
    expect(state.terms).toEqual(["sleep", "memory"]);
    expect(state.query).toBe("sleep memory (limitation OR bias)");
  });

  it("keeps what each source was sent", () => {
    const state = begin("sleep memory");
    expect(state.sent.map((s) => [s.provider, s.text])).toEqual([
      ["openalex", "sleep AND memory"],
      ["crossref", "sleep AND memory"],
    ]);
  });
});

describe("searchReducer: reset", () => {
  it("forgets the search, whatever state it was in", () => {
    const mid = searchReducer(started(), { type: "provider-done", id: 1, update: done("openalex", ["10.1/a"]) });
    expect(searchReducer(mid, { type: "reset" })).toBe(idleSearch);
    expect(searchReducer(started(), { type: "reset" })).toBe(idleSearch);
    expect(searchReducer(idleSearch, { type: "reset" })).toBe(idleSearch);
  });

  it("makes late answers from the forgotten search do nothing", () => {
    const reset = searchReducer(started(), { type: "reset" });
    expect(searchReducer(reset, { type: "provider-done", id: 1, update: done("openalex", ["10.1/late"]) })).toBe(reset);
    expect(searchReducer(reset, { type: "finish", id: 1, at: new Date() })).toBe(reset);
  });
});

describe("orderedStatuses", () => {
  it("lists statuses in the order the providers were asked, with skipped ones last", () => {
    const skipped: ProviderStatus[] = [{ provider: "arxiv", state: "skipped", message: "no CORS" }];
    let state: SearchState = started(["openalex", "crossref", "pubmed"], skipped);
    for (const provider of ["pubmed", "openalex", "crossref"] as const) {
      state = searchReducer(state, { type: "provider-done", id: 1, update: done(provider) });
    }
    if (state.phase === "idle") throw new Error("expected an active search");
    expect(orderedStatuses(state).map((s) => s.provider)).toEqual(["openalex", "crossref", "pubmed", "arxiv"]);
  });
});
