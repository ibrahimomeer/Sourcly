import { describe, expect, it, vi } from "vitest";
import { classify } from "../classify";
import { createWikipediaProvider, parseWikipediaPage } from "./wikipedia";
// A real response recorded from en.wikipedia.org/w/api.php on 2026-10-14 (generator=search with
// extracts). The pages come back in no particular order; `index` is the search rank.
import fixtures from "./__fixtures__/wikipedia.json";

const pages = fixtures.query.pages;

describe("parseWikipediaPage", () => {
  it("maps a page as an encyclopedia entry with its intro text", () => {
    const page = pages.find((p) => p.title === "Memory consolidation");
    const result = parseWikipediaPage(page, 1, 6);
    expect(result).toMatchObject({
      id: "wikipedia:21312297",
      title: "Memory consolidation",
      authors: [],
      year: null,
      doi: null,
      type: "reference-entry",
      rawType: { value: "encyclopedia article", provider: "wikipedia", field: "query.pages" },
      venue: "Wikipedia",
      language: "en",
      url: "https://en.wikipedia.org/wiki/Memory_consolidation",
      openAccess: { isOpen: true },
      hits: [{ provider: "wikipedia", id: "21312297", rank: 1, listSize: 6, score: null }],
    });
    expect(result?.abstract?.length).toBeGreaterThan(100);
    expect(result?.abstract).not.toMatch(/<[a-z]/i);
  });

  it("is labelled a tertiary source that is not peer reviewed, with reasons", () => {
    const result = parseWikipediaPage(pages[0], 1, 6);
    if (result === null) throw new Error("fixture did not parse");
    const { level, peerReview } = classify(result);
    expect(level).toMatchObject({ value: "tertiary", reason: "Reference or encyclopedia entry" });
    expect(peerReview).toMatchObject({ value: "not-peer-reviewed", field: "Wikipedia query.pages" });
    expect(peerReview.reason).toMatch(/volunteers/);
  });

  it("falls back to a page-id link when no URL is given", () => {
    expect(parseWikipediaPage({ pageid: 7, title: "T" }, 1, 1)?.url).toBe("https://en.wikipedia.org/?curid=7");
  });

  it("returns null without a page id or title", () => {
    expect(parseWikipediaPage({ title: "x" }, 1, 1)).toBeNull();
    expect(parseWikipediaPage({ pageid: 1 }, 1, 1)).toBeNull();
    expect(parseWikipediaPage(null, 1, 1)).toBeNull();
  });
});

describe("createWikipediaProvider", () => {
  it("asks for 5 pages with their intro text, allows cross-origin reading, and ranks by search index", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fixtures)));
    const results = await createWikipediaProvider({ fetch: fetchMock }).search("sleep AND memory", { limit: 100 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://en.wikipedia.org/w/api.php");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      action: "query",
      generator: "search",
      gsrsearch: "sleep AND memory",
      gsrlimit: "5",
      prop: "extracts|info",
      exintro: "1",
      explaintext: "1",
      exlimit: "5",
      formatversion: "2",
      origin: "*", // MediaWiki's documented switch for anonymous cross-origin requests
    });

    expect(results.map((r) => r.title)).toEqual([
      "Memory consolidation",
      "Sleep and memory",
      "Slow-wave sleep",
      "Explicit memory",
      "Procedural memory",
      "Sleep spindle",
    ]);
    expect(results.map((r) => r.hits[0]?.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("Wikipedia subjects and syntax", () => {
  it("gives pages no subjects, and understands Boolean queries", () => {
    expect(parseWikipediaPage(pages[0], 1, 1)?.subjects).toEqual([]);
    expect(createWikipediaProvider().syntax).toBe("boolean-flat");
  });
});