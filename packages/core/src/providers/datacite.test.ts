import { describe, expect, it, vi } from "vitest";
import { createDataCiteProvider, parseDataCiteRecord } from "./datacite";
// A real response recorded from api.datacite.org/dois on 2026-10-14. It includes a version DOI
// and its concept DOI for the same deposit, and two theses.
import fixtures from "./__fixtures__/datacite.json";

const records = fixtures.data;
const parse = (raw: unknown, rank = 1, size = 1) => {
  const result = parseDataCiteRecord(raw, rank, size);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseDataCiteRecord", () => {
  it("maps a journal-article deposit with a Creative Commons licence", () => {
    const result = parse(records[0], 1, 6);
    expect(result).toMatchObject({
      id: "10.25405/ncl.34495572.v1",
      doi: "10.25405/ncl.34495572.v1",
      year: 2026,
      type: "journal-article",
      rawType: { value: "JournalArticle", provider: "datacite", field: "types.resourceTypeGeneral" },
      venueKind: { value: "repository" },
      citationCount: 0,
      openAccess: { isOpen: true },
      hits: [{ provider: "datacite", rank: 1, listSize: 6, score: null }],
    });
    expect(result.title).toMatch(/^Atypicalities in sleep/);
    expect(result.authors[0]).toMatchObject({ family: "Fletcher", given: "Fay E.", name: "Fay E. Fletcher" });
    expect(result.url).toMatch(/^https?:\/\//);
  });

  it("maps a thesis, and does not call all-rights-reserved material open", () => {
    const thesis = parse(records[4]);
    expect(thesis.type).toBe("thesis");
    expect(thesis.openAccess.isOpen).toBeNull();
  });

  it("maps resource types, keeping unknown general types as 'other'", () => {
    const type = (resourceTypeGeneral: string) =>
      parse({ attributes: { doi: "10.1000/x", types: { resourceTypeGeneral } } }).type;
    expect(type("Dataset")).toBe("dataset");
    expect(type("Preprint")).toBe("preprint");
    expect(type("ConferencePaper")).toBe("conference-paper");
    expect(type("Software")).toBe("other");
    expect(type("Image")).toBe("other");
    expect(type("Text")).toBe("unknown");
    expect(parse({ attributes: { doi: "10.1000/x" } }).type).toBe("unknown");
  });

  it("treats closed or restricted rights as not open", () => {
    const access = (rightsUri: string) => parse({ attributes: { doi: "10.1000/x", rightsList: [{ rightsUri }] } }).openAccess.isOpen;
    expect(access("info:eu-repo/semantics/openAccess")).toBe(true);
    expect(access("info:eu-repo/semantics/closedAccess")).toBe(false);
    expect(access("https://example.org/licence")).toBeNull();
  });

  it("returns null when there is no DOI", () => {
    expect(parseDataCiteRecord({ attributes: { titles: [{ title: "x" }] } }, 1, 1)).toBeNull();
    expect(parseDataCiteRecord(null, 1, 1)).toBeNull();
  });
});

describe("createDataCiteProvider", () => {
  it("sends the query it is given, with page[size] capped at 100", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fixtures)));
    const found = await createDataCiteProvider({ fetch: fetchMock }).search('sleep AND "memory"', { limit: 1000 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://api.datacite.org/dois");
    expect(url.searchParams.get("query")).toBe('sleep AND "memory"');
    expect(url.searchParams.get("page[size]")).toBe("100");
    expect(found).toHaveLength(records.length);
  });
});

describe("DataCite subjects and syntax", () => {
  it("reads subjects as keywords, and has none when the record lists none", () => {
    expect(parse(records[0]).subjects).toEqual([]);
    const result = parse({ attributes: { doi: "10.1000/x", subjects: [{ subject: "Sleep" }, { subject: "sleep" }, { subject: "Memory" }, {}] } });
    expect(result.subjects).toEqual([
      { term: "Sleep", kind: "keyword", provider: "datacite" },
      { term: "Memory", kind: "keyword", provider: "datacite" },
    ]);
    expect(createDataCiteProvider().syntax).toBe("boolean");
  });
});