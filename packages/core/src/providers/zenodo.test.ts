import { describe, expect, it, vi } from "vitest";
import { createZenodoProvider, parseZenodoRecord } from "./zenodo";
// A real response recorded from zenodo.org/api/records on 2026-10-14: software, two datasets, two
// publications (an article and a book section) and a copy of the Nature paper (DOI 10.1038/nature04286).
import fixtures from "./__fixtures__/zenodo.json";

const hits = fixtures.hits.hits;
const parse = (raw: unknown, rank = 1, size = 1) => {
  const result = parseZenodoRecord(raw, rank, size);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseZenodoRecord", () => {
  it("maps resource types", () => {
    const types = hits.map((hit) => parse(hit).type);
    expect(types).toEqual(["other", "dataset", "dataset", "journal-article", "book-chapter", "journal-article"]);
    expect(parse(hits[3]).rawType).toEqual({ value: "publication/article", provider: "zenodo", field: "metadata.resource_type" });
    expect(parse(hits[0]).rawType?.value).toBe("software");
  });

  it("maps an open article deposit, with a repository venue and the record page as its link", () => {
    const result = parse(hits[3], 4, 6);
    expect(result).toMatchObject({
      doi: "10.5281/zenodo.8255931",
      year: 2023,
      venue: "Zenodo",
      venueKind: { value: "repository", provider: "zenodo" },
      url: "https://zenodo.org/records/8255931",
      openAccess: { isOpen: true, url: "https://zenodo.org/records/8255931" },
      hits: [{ provider: "zenodo", id: "8255931", rank: 4, listSize: 6, score: null }],
    });
    expect(result.abstract).not.toMatch(/<[a-z]/i);
  });

  it("reads 'Family, Given' creators into family and given names", () => {
    const authors = parse(hits[0]).authors;
    expect(authors[0]).toEqual({ name: "Arnaud Boutin", family: "Boutin", given: "Arnaud" });
  });

  it("recognises the same DOI as another provider's record of the Nature paper", () => {
    expect(parse(hits[5]).doi).toBe("10.1038/nature04286");
  });

  it("treats non-open access rights as not open", () => {
    const access = (access_right: string) =>
      parse({ id: 1, metadata: { title: "x", access_right, resource_type: { type: "dataset" } } }).openAccess.isOpen;
    expect(access("open")).toBe(true);
    expect(access("restricted")).toBe(false);
    expect(access("embargoed")).toBe(false);
    expect(access("weird")).toBeNull();
  });

  it("returns null without an id or metadata", () => {
    expect(parseZenodoRecord({ metadata: {} }, 1, 1)).toBeNull();
    expect(parseZenodoRecord({ id: 5 }, 1, 1)).toBeNull();
  });
});

describe("createZenodoProvider", () => {
  it("asks for at most 25 results, the anonymous cap, and sends plain words", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fixtures)));
    const found = await createZenodoProvider({ fetch: fetchMock }).search('sleep: "memory"', { limit: 100 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://zenodo.org/api/records");
    expect(url.searchParams.get("q")).toBe("sleep memory");
    expect(url.searchParams.get("size")).toBe("25");
    expect(found).toHaveLength(hits.length);
  });
});
