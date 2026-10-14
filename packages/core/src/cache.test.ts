import { describe, expect, it } from "vitest";
import { createSearchCache } from "./cache";
import { makeResult } from "./testing/make-result";

describe("createSearchCache", () => {
  const results = [makeResult({ id: "10.1/a" })];

  it("returns what was stored for the same provider, query and limit", () => {
    const cache = createSearchCache();
    cache.set("openalex", "sleep", 100, results);
    expect(cache.get("openalex", "sleep", 100)).toBe(results);
    expect(cache.size).toBe(1);
  });

  it("ignores spaces around the query but nothing else", () => {
    const cache = createSearchCache();
    cache.set("openalex", "sleep", 100, results);
    expect(cache.get("openalex", "  sleep  ", 100)).toBe(results);
    expect(cache.get("openalex", "sleep memory", 100)).toBeUndefined();
  });

  it("keeps providers and limits apart", () => {
    const cache = createSearchCache();
    cache.set("openalex", "sleep", 100, results);
    expect(cache.get("crossref", "sleep", 100)).toBeUndefined();
    expect(cache.get("openalex", "sleep", 50)).toBeUndefined();
  });

  it("can be cleared, and caches are independent of each other", () => {
    const one = createSearchCache();
    const two = createSearchCache();
    one.set("openalex", "q", 10, results);
    two.set("openalex", "q", 10, results);
    one.clear();
    expect(one.size).toBe(0);
    expect(one.get("openalex", "q", 10)).toBeUndefined();
    expect(two.get("openalex", "q", 10)).toBe(results);
  });
});
