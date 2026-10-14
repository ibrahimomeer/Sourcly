import { describe, expect, it, vi } from "vitest";
import { createCrossrefProvider, parseCrossrefWork } from "./crossref";
// Real responses recorded from api.crossref.org on 2026-10-14 with the same `select` the
// provider sends: a search, a retracted paper (Lancet, 2020) and two posted-content records.
import fixtures from "./__fixtures__/crossref.json";

const items = fixtures.search.message.items;
const parse = (raw: unknown, rank = 1, size = 1) => {
  const result = parseCrossrefWork(raw, rank, size);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseCrossrefWork", () => {
  it("maps a journal article with authors, citations and a DOI link", () => {
    const result = parse(items[3], 4, 6);
    expect(result).toMatchObject({
      id: "10.1111/j.1365-2869.2010.00872.x",
      doi: "10.1111/j.1365-2869.2010.00872.x",
      year: 2011,
      type: "journal-article",
      rawType: { value: "journal-article", provider: "crossref", field: "type" },
      citationCount: 76,
      venueKind: { value: "journal", provider: "crossref", field: "type" },
      language: null,
      hits: [{ provider: "crossref", id: "10.1111/j.1365-2869.2010.00872.x", rank: 4, listSize: 6 }],
    });
    expect(result.authors).toHaveLength(7);
    expect(result.authors[0]).toMatchObject({ family: expect.any(String), name: expect.stringContaining(" ") });
    expect(result.venue).toMatch(/^Journal of Sleep Research/);
    expect(result.url).toMatch(/^https:\/\/doi\.org\/10\.1111\//i);
    expect(result.hits[0]?.score).toEqual(expect.any(Number));
  });

  it("copes with sparse records: no authors, an empty date, no abstract", () => {
    const result = parse(items[0]);
    expect(result).toMatchObject({
      doi: "10.1007/springerreference_302140",
      type: "reference-entry",
      year: null,
      authors: [],
      abstract: null,
      venue: "SpringerReference",
      citationCount: 0,
    });
  });

  it("keeps a record with no title, as an empty title", () => {
    const grant = parse(items[4]);
    expect(grant).toMatchObject({ title: "", type: "other", citationCount: null });
  });

  it("turns a JATS abstract into plain text", () => {
    const result = parse(items[5]);
    expect(result.type).toBe("preprint");
    expect(result.rawType?.value).toBe("posted-content");
    expect(result.abstract).not.toBeNull();
    expect(result.abstract).not.toMatch(/<|jats:/);
    expect(result.venueKind?.value).toBe("repository");
  });

  it("flags a withdrawn work from its updated-by list and says where that came from", () => {
    const result = parse(fixtures.retracted.message.items[0]);
    expect(result.doi).toBe("10.1016/s0140-6736(20)31180-6");
    expect(result.retraction.retracted).toBe(true);
    expect(result.retraction.source).toMatch(/^Crossref updated-by: retraction \(/);
  });

  it("does not claim a work is clear just because Crossref lists no withdrawal", () => {
    expect(parse(items[3]).retraction).toEqual({ retracted: null, source: null });
  });

  it("treats a record that retracts another work as a notice, not as research", () => {
    const notice = parse({ DOI: "10.1000/notice", type: "journal-article", "update-to": [{ type: "retraction", DOI: "10.1000/orig" }] });
    expect(notice.type).toBe("other");
    expect(notice.rawType).toMatchObject({ value: "journal-article (retraction notice)", field: "update-to" });
  });

  it("returns null for entries without a DOI or that are not objects", () => {
    expect(parseCrossrefWork({ title: ["x"] }, 1, 1)).toBeNull();
    expect(parseCrossrefWork(null, 1, 1)).toBeNull();
  });

  it("survives fields of the wrong type", () => {
    const result = parse({ DOI: "10.1000/x", title: 5, author: "none", issued: "2020", type: "constructor", "is-referenced-by-count": "many" });
    expect(result).toMatchObject({ title: "", authors: [], year: null, type: "unknown", citationCount: null });
  });
});

describe("createCrossrefProvider", () => {
  const ok = () => Promise.resolve(Response.json(fixtures.search));

  it("asks for only the fields it uses, 100 rows at most, and sends no email unless configured", async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    await createCrossrefProvider({ fetch: fetchMock }).search("sleep memory", { limit: 500 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://api.crossref.org/works");
    expect(url.searchParams.get("query")).toBe("sleep memory");
    expect(url.searchParams.get("rows")).toBe("100");
    expect(url.searchParams.get("select")?.split(",")).toEqual(expect.arrayContaining(["DOI", "title", "updated-by", "is-referenced-by-count"]));
    expect(url.searchParams.get("select")).not.toMatch(/language|subtype/); // not selectable on this route
    expect(url.searchParams.has("mailto")).toBe(false);
  });

  it("sends the contact address as mailto (the polite pool) only when one is configured", async () => {
    const fetchMock = vi.fn<typeof fetch>(ok);
    await createCrossrefProvider({ fetch: fetchMock, mailto: " me@example.org " }).search("q", { limit: 10 });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("mailto")).toBe("me@example.org");
  });

  it("returns every parsable record in order, ranked", async () => {
    const results = await createCrossrefProvider({ fetch: ok }).search("q", { limit: 10 });
    expect(results).toHaveLength(items.length);
    expect(results.map((r) => r.hits[0]?.rank)).toEqual(items.map((_, i) => i + 1));
  });
});

describe("Crossref subjects and syntax", () => {
  it("treats Crossref's subject list as broad subjects", () => {
    const result = parseCrossrefWork({ DOI: "10.1000/x", subject: ["Neuroscience", " Psychology ", "neuroscience", ""] }, 1, 1);
    expect(result?.subjects).toEqual([
      { term: "Neuroscience", kind: "subject", provider: "crossref" },
      { term: "Psychology", kind: "subject", provider: "crossref" },
    ]);
  });

  it("has none when Crossref lists none, and reads the query as plain words", () => {
    expect(parseCrossrefWork(items[0], 1, 1)?.subjects).toEqual([]);
    expect(createCrossrefProvider().syntax).toBe("plain");
  });
});