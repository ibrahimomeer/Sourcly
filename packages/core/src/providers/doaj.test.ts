import { describe, expect, it, vi } from "vitest";
import { createDoajProvider, parseDoajArticle } from "./doaj";
// A real response recorded from doaj.org/api/search/articles on 2026-10-14.
import fixtures from "./__fixtures__/doaj.json";

const hits = fixtures.results;
const parse = (raw: unknown, rank = 1, size = 1) => {
  const result = parseDoajArticle(raw, rank, size);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseDoajArticle", () => {
  it("maps an article: every DOAJ result is open access in a journal", () => {
    const result = parse(hits[2], 3, 6);
    expect(result).toMatchObject({
      id: "10.3389/fpsyg.2015.01439",
      doi: "10.3389/fpsyg.2015.01439",
      year: 2015,
      type: "journal-article",
      rawType: { value: "article", provider: "doaj" },
      venueKind: { value: "journal", provider: "doaj" },
      language: "en",
      citationCount: null,
      openAccess: { isOpen: true, status: "gold" },
      hits: [{ provider: "doaj", id: "00d25c68863d4300b3a0d18e2bf935e2", rank: 3, listSize: 6, score: null }],
    });
    expect(result.authors).toHaveLength(2);
    expect(result.venue).toEqual(expect.any(String));
    expect(result.openAccess.url).toMatch(/^https?:\/\//);
  });

  it("offers a PDF link only when DOAJ says the full text is a PDF", () => {
    expect(parse(hits[3]).openAccess.pdfUrl).toMatch(/^https?:\/\//); // link type "pdf"
    expect(parse(hits[2]).openAccess.pdfUrl).toBeNull(); // link type "HTML"
  });

  it("falls back to the DOI link when there is no full-text link", () => {
    const result = parse({ id: "x", bibjson: { title: "T", identifier: [{ type: "doi", id: "10.1000/abc" }] } });
    expect(result.url).toBe("https://doi.org/10.1000/abc");
    expect(result.openAccess.url).toBeNull();
  });

  it("works without a DOI", () => {
    const result = parse({ id: "abc123", bibjson: { title: "No DOI", year: "2020" } });
    expect(result).toMatchObject({ id: "doaj:abc123", doi: null, year: 2020, url: null });
  });

  it("returns null when there is no id or bibjson", () => {
    expect(parseDoajArticle({ bibjson: {} }, 1, 1)).toBeNull();
    expect(parseDoajArticle({ id: "x" }, 1, 1)).toBeNull();
    expect(parseDoajArticle(null, 1, 1)).toBeNull();
  });
});

describe("createDoajProvider", () => {
  it("puts the plain-words query in the path and caps pageSize at 100", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fixtures)));
    const found = await createDoajProvider({ fetch: fetchMock }).search('sleep: "memory" (consolidation)', { limit: 300 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe("https://doaj.org");
    expect(decodeURIComponent(url.pathname)).toBe("/api/search/articles/sleep memory consolidation");
    expect(url.searchParams.get("pageSize")).toBe("100");
    expect(found).toHaveLength(hits.length);
  });
});
