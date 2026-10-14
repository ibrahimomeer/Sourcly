import { describe, expect, it, vi } from "vitest";
import { createEuropePmcProvider, parseEuropePmcRecord } from "./europepmc";
// Real responses recorded from www.ebi.ac.uk/europepmc on 2026-10-14 (resultType=core): a search
// that mixes published papers and preprints, the retracted Lancet paper, preprints and reviews.
import fixtures from "./__fixtures__/europepmc.json";

const results = fixtures.search.resultList.result;
const parse = (raw: unknown, rank = 1, size = 1) => {
  const result = parseEuropePmcRecord(raw, rank, size);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseEuropePmcRecord", () => {
  it("maps a published journal article", () => {
    const result = parse(results[0], 1, 6);
    expect(result).toMatchObject({
      id: "10.1016/j.cub.2024.05.018",
      doi: "10.1016/j.cub.2024.05.018",
      year: 2024,
      type: "journal-article",
      citationCount: 20,
      language: "en",
      venueKind: { value: "journal", provider: "europepmc" },
      url: "https://doi.org/10.1016/j.cub.2024.05.018",
      hits: [{ provider: "europepmc", id: "MED:38834064", rank: 1, listSize: 6, score: null }],
    });
    expect(result.rawType).toEqual({ value: "Journal Article", provider: "europepmc", field: "pubTypeList" });
    expect(result.authors.length).toBeGreaterThan(0);
    expect(result.authors[0]).toMatchObject({ family: "Shin", given: "Justin D" });
    expect(result.abstract?.startsWith("Consolidation of initially encoded")).toBe(true);
    expect(result.venue).toMatch(/^Current biology/i);
  });

  it("recognises a preprint from its source, and uses the preprint server as the venue", () => {
    const result = parse(results[1]);
    expect(result.type).toBe("preprint");
    expect(result.rawType).toMatchObject({ value: "Preprint" });
    expect(result.venueKind?.value).toBe("repository");
    expect(result.venue).toMatch(/bioRxiv/i);
  });

  it("finds a free copy from the full-text links and offers its PDF", () => {
    const withPdf = results.map((r) => parse(r)).find((r) => r.openAccess.pdfUrl !== null);
    expect(withPdf).toBeDefined();
    expect(withPdf?.openAccess.isOpen).toBe(true);
    expect(withPdf?.openAccess.pdfUrl).toMatch(/^https?:\/\//);
  });

  it("recognises a review", () => {
    const review = parse(fixtures.review.resultList.result[0]);
    expect(review.type).toBe("review");
    expect(review.rawType?.value).toMatch(/review/i);
  });

  it("flags the retracted Lancet paper and says why", () => {
    const retracted = parse(fixtures.retracted.resultList.result[0]);
    expect(retracted.doi).toBe("10.1016/s0140-6736(20)31180-6");
    expect(retracted.retraction).toEqual({ retracted: true, source: "Europe PMC pubTypeList: Retracted Publication" });
    expect(retracted.type).toBe("journal-article");
  });

  it("says a PubMed record is not retracted when it carries no retraction tag", () => {
    expect(parse(results[0]).retraction.retracted).toBe(false);
    expect(parse(results[1]).retraction.retracted).toBeNull(); // preprints: unknown
  });

  it("maps source codes to types when there is no better information", () => {
    expect(parse({ id: "1", source: "ETH", title: "A thesis" }).type).toBe("thesis");
    expect(parse({ id: "2", source: "NBK", title: "A book" }).type).toBe("book");
    expect(parse({ id: "3", source: "PAT", title: "A patent" }).type).toBe("other");
    expect(parse({ id: "4", source: "MED", title: "x", pubTypeList: { pubType: ["Editorial"] } }).type).toBe("other");
    expect(parse({ id: "5", source: "MED", title: "x" }).type).toBe("unknown");
  });

  it("builds a Europe PMC link when there is no DOI", () => {
    const result = parse({ id: "PPR9", source: "PPR", title: "No DOI here" });
    expect(result.doi).toBeNull();
    expect(result.id).toBe("europepmc:PPR:PPR9");
    expect(result.url).toBe("https://europepmc.org/article/PPR/PPR9");
  });

  it("returns null for entries it cannot identify", () => {
    expect(parseEuropePmcRecord({ title: "no id" }, 1, 1)).toBeNull();
    expect(parseEuropePmcRecord(null, 1, 1)).toBeNull();
  });
});

describe("createEuropePmcProvider", () => {
  it("sends a plain core-result query, 100 per page at most", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fixtures.search)));
    const found = await createEuropePmcProvider({ fetch: fetchMock }).search("sleep memory", { limit: 400 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "sleep memory",
      format: "json",
      resultType: "core",
      pageSize: "100",
    });
    expect(found).toHaveLength(results.length);
  });
});

describe("Europe PMC subjects and syntax", () => {
  it("reads MeSH headings and author keywords as different kinds", () => {
    const { subjects } = parse(results[0]);
    expect(subjects.filter((s) => s.kind === "mesh").map((s) => s.term)).toEqual(
      expect.arrayContaining(["Memory Consolidation", "Sleep", "Hippocampus"]),
    );
    expect(subjects.filter((s) => s.kind === "keyword").map((s) => s.term)).toEqual(expect.arrayContaining(["Hippocampus", "Ripples"]));
    expect(subjects.every((s) => s.provider === "europepmc")).toBe(true);
  });

  it("has none for a record without them, and understands Boolean queries", () => {
    expect(parse(results[1]).subjects).toEqual([]);
    expect(createEuropePmcProvider().syntax).toBe("boolean");
  });
});