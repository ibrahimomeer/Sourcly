import { describe, expect, it, vi } from "vitest";
import { hardBlocks, parseConcepts } from "./concepts";
import {
  FALLBACK_BELOW,
  MAX_FALLBACK_PASSES,
  countConcepts,
  enoughResults,
  fallbackPasses,
  runFallback,
  type Counter,
} from "./fallback";
import { fallbackOrder, type ProviderUpdate } from "./search";
import { makeResult } from "./testing/make-result";
import type { Provider, Result } from "./types";

const query = parseConcepts("alpha beta gamma", { synonyms: false });
const hit = { provider: "openalex" as const, id: "W1", rank: 1, listSize: 1, score: null };
const paper = (id: string, title: string): Result => makeResult({ id, doi: id, title, abstract: null, hits: [hit] });
const counterOf = (table: Record<string, number | null>): Counter => async (text) => table[text] ?? null;
const fake = (search: Provider["search"]): Provider => ({ id: "openalex", name: "OpenAlex", syntax: "boolean", search });

describe("countConcepts: how many works each concept matches on its own", () => {
  it("asks about each concept alone, written for a Boolean source, and returns the counts by block id", async () => {
    const asked: string[] = [];
    const counts = await countConcepts(query, async (text) => {
      asked.push(text);
      return { alpha: 100, beta: 10, gamma: 1000 }[text] ?? null;
    });
    expect([...asked].sort()).toEqual(["alpha", "beta", "gamma"]);
    expect([...counts]).toEqual(expect.arrayContaining([["b1", 100], ["b2", 10], ["b3", 1000]]));
  });

  it("writes a concept with alternatives as an OR-group, so the count is for all of its variants", async () => {
    const asked: string[] = [];
    await countConcepts(parseConcepts("odor prediction"), async (text) => {
      asked.push(text);
      return 1;
    });
    expect(asked[0]).toBe('(odor OR odour OR odorant OR olfaction OR olfactory OR "sense of smell")');
  });

  it("remembers answers between searches: the same concept is asked once", async () => {
    const memory = new Map<string, number | null>();
    const count = vi.fn(counterOf({ alpha: 1, beta: 2, gamma: 3 }));
    await countConcepts(query, count, memory);
    await countConcepts(query, count, memory);
    expect(count).toHaveBeenCalledTimes(3);
    expect(memory.size).toBe(3);
  });

  it("leaves out a concept whose count could not be had", async () => {
    const counts = await countConcepts(query, counterOf({ alpha: 5, beta: null }));
    expect([...counts]).toEqual([["b1", 5]]);
  });

  it("asks nothing for a search of one concept: there is nothing to drop", async () => {
    const count = vi.fn(async () => 1);
    expect((await countConcepts(parseConcepts("odor"), count)).size).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });
});

describe("fallbackPasses", () => {
  it("drops one concept per pass, the one matching the most works first", () => {
    const passes = fallbackPasses(query, new Map([["b1", 100], ["b2", 10], ["b3", 1000]]));
    expect(passes.map((pass) => pass.dropped)).toEqual(["gamma", "alpha", "beta"]);
    expect(passes.map((pass) => hardBlocks(pass.query).map((block) => block.label))).toEqual([
      ["alpha", "beta"],
      ["beta", "gamma"],
      ["alpha", "gamma"],
    ]);
    expect(fallbackOrder(query, new Map([["b1", 100], ["b2", 10], ["b3", 1000]]))).toEqual(passes.map((pass) => pass.droppedId));
  });

  it("runs at most three passes, however many concepts there are", () => {
    expect(MAX_FALLBACK_PASSES).toBe(3);
    expect(fallbackPasses(parseConcepts("alpha beta gamma delta epsilon", { synonyms: false }), new Map())).toHaveLength(3);
  });

  it("has none for a search of one concept", () => {
    expect(fallbackPasses(parseConcepts("odor"), new Map())).toEqual([]);
  });

  it("does not change the query it was given", () => {
    const before = JSON.stringify(query);
    fallbackPasses(query, new Map());
    expect(JSON.stringify(query)).toBe(before);
  });
});

describe("enoughResults", () => {
  const near = (count: number) => Array.from({ length: count }, (_, i) => paper(`10.1/n${i}`, "alpha beta only"));

  it("is true once 15 distinct results match every concept or all but one", () => {
    expect(FALLBACK_BELOW).toBe(15);
    expect(enoughResults(near(14), query)).toBe(false);
    expect(enoughResults(near(15), query)).toBe(true);
  });

  it("does not count a result that matches only one concept, and counts a duplicate once", () => {
    const weak = Array.from({ length: 20 }, (_, i) => paper(`10.1/w${i}`, "alpha only"));
    expect(enoughResults([...near(14), ...weak], query)).toBe(false);
    expect(enoughResults([...near(14), near(1)[0] as Result, near(1)[0] as Result], query)).toBe(false);
  });

  it("is true for a search with no concepts: there is nothing to widen", () => {
    expect(enoughResults([], parseConcepts("the of"))).toBe(true);
  });
});

describe("runFallback", () => {
  it("asks the sources the query without one concept at a time, the least specific first, and marks the hits", async () => {
    const asked: string[] = [];
    const provider = fake(async (text) => {
      asked.push(text);
      return [paper(`10.1/${asked.length}`, "alpha beta")];
    });
    const updates: ProviderUpdate[] = [];
    const starts: string[] = [];
    const report = await runFallback(
      [provider],
      query,
      { limit: 10, count: counterOf({ alpha: 100, beta: 10, gamma: 1000 }), have: [] },
      { onPassStart: (pass) => starts.push(pass.dropped), onProviderDone: (update) => updates.push(update) },
    );
    expect(asked).toEqual(["alpha AND beta", "beta AND gamma", "alpha AND gamma"]);
    expect(starts).toEqual(["gamma", "alpha", "beta"]);
    expect(report.passes.map((pass) => pass.dropped)).toEqual(["gamma", "alpha", "beta"]);
    expect(report.passes[0]?.sent).toEqual([{ provider: "openalex", text: "alpha AND beta", notes: [] }]);
    expect(report.results).toHaveLength(3);
    expect(report.results.every((result) => result.hits.every((h) => h.fallback === true))).toBe(true);
    expect(updates).toHaveLength(3);
  });

  it("stops widening as soon as there are enough results", async () => {
    const provider = fake(async () => Array.from({ length: 15 }, (_, i) => paper(`10.1/p${i}`, "alpha beta")));
    const asked = vi.spyOn(provider, "search");
    const report = await runFallback([provider], query, { limit: 10, count: counterOf({}), have: [] });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(report.passes).toHaveLength(1);
  });

  it("runs no pass when the strict search already found enough", async () => {
    const have = Array.from({ length: 15 }, (_, i) => paper(`10.1/h${i}`, "alpha beta gamma"));
    const search = vi.fn(async () => [] as Result[]);
    const report = await runFallback([fake(search)], query, { limit: 10, count: counterOf({}), have });
    expect(search).not.toHaveBeenCalled();
    expect(report.passes).toEqual([]);
  });

  it("falls back to the order typed when no count can be had", async () => {
    const starts: string[] = [];
    await runFallback([fake(async () => [])], query, { limit: 10, count: async () => null, have: [] }, { onPassStart: (pass) => starts.push(pass.dropped) });
    expect(starts).toEqual(["alpha", "beta", "gamma"]);
  });

  it("stops when it is cancelled", async () => {
    const controller = new AbortController();
    const search = vi.fn(async () => {
      controller.abort();
      return [] as Result[];
    });
    const report = await runFallback([fake(search)], query, { limit: 10, count: counterOf({}), have: [], signal: controller.signal });
    expect(search).toHaveBeenCalledTimes(1);
    expect(report.passes.length).toBeLessThanOrEqual(1);
  });

  it("reports the counts it used", async () => {
    let seen: ReadonlyMap<string, number> | null = null;
    await runFallback([fake(async () => [])], query, { limit: 10, count: counterOf({ alpha: 7 }), have: [] }, { onCounts: (counts) => (seen = counts) });
    expect([...(seen ?? [])]).toEqual([["b1", 7]]);
  });
});
