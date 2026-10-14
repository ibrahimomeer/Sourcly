import { describe, expect, it, vi } from "vitest";
import { createSemanticScholarProvider, parseSemanticScholarPaper } from "./semanticscholar";
// HAND-WRITTEN fixture, not a recording: it follows the official OpenAPI spec (PaperRelevanceSearchBatch
// -> BasePaper) because the live keyless API answered HTTP 429 to every request on 2026-10-14.
import fixtures from "./__fixtures__/semanticscholar.json";

const papers = fixtures.data;
const parse = (raw: unknown, rank = 1, size = 1) => {
  const result = parseSemanticScholarPaper(raw, rank, size);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseSemanticScholarPaper", () => {
  it("maps a journal article with an open-access PDF", () => {
    expect(parse(papers[0], 1, 4)).toMatchObject({
      id: "10.1038/nature04286",
      doi: "10.1038/nature04286",
      title: "Sleep-dependent memory consolidation",
      year: 2005,
      type: "journal-article",
      rawType: { value: "JournalArticle", provider: "semanticscholar", field: "publicationTypes" },
      venue: "Nature",
      venueKind: { value: "journal", provider: "semanticscholar", field: "publicationVenue.type" },
      citationCount: 1841,
      url: "https://doi.org/10.1038/nature04286",
      openAccess: { isOpen: true, status: "bronze", pdfUrl: "https://www.nature.com/articles/nature04286.pdf" },
      hits: [{ provider: "semanticscholar", rank: 1, listSize: 4, score: null }],
    });
  });

  it("prefers 'Review' when a paper is both a review and a journal article", () => {
    const review = parse(papers[1]);
    expect(review.type).toBe("review");
    expect(review.rawType?.value).toBe("Review");
    expect(review.openAccess).toMatchObject({ isOpen: false, pdfUrl: null });
  });

  it("recognises an arXiv paper with no publication type as a preprint, without a DOI", () => {
    const preprint = parse(papers[2]);
    expect(preprint).toMatchObject({
      id: expect.stringMatching(/^semanticscholar:/),
      doi: null,
      type: "preprint",
      venueKind: { value: "repository" },
      openAccess: { isOpen: true, status: "green", pdfUrl: "https://arxiv.org/pdf/1412.6980" },
    });
    expect(preprint.url).toMatch(/^https:\/\/www\.semanticscholar\.org\/paper\//);
    expect(preprint.authors.map((a) => a.name)).toEqual(["Diederik P. Kingma", "Jimmy Ba"]);
  });

  it("copes with a record that has almost nothing", () => {
    expect(parse(papers[3])).toMatchObject({
      type: "book",
      year: null,
      venue: null,
      citationCount: null,
      authors: [],
      openAccess: { isOpen: null, pdfUrl: null },
    });
  });

  it("understands both spellings of the type names the API and its docs use", () => {
    const type = (publicationTypes: string[]) => parse({ paperId: "p", publicationTypes }).type;
    expect(type(["Journal Article", "Review"])).toBe("review");
    expect(type(["JournalArticle"])).toBe("journal-article");
    expect(type(["Meta-Analysis"])).toBe("review");
    expect(type(["Conference"])).toBe("conference-paper");
    expect(type(["BookSection"])).toBe("book-chapter");
    expect(type(["Editorial"])).toBe("other");
    expect(type(["Something New"])).toBe("unknown");
  });

  it("returns null without a paper id", () => {
    expect(parseSemanticScholarPaper({ title: "x" }, 1, 1)).toBeNull();
    expect(parseSemanticScholarPaper(null, 1, 1)).toBeNull();
  });
});

describe("createSemanticScholarProvider", () => {
  it("never asks for the AI-written tldr summary, and asks for at most 100", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(fixtures)));
    const found = await createSemanticScholarProvider({ fetch: fetchMock }).search("sleep memory", { limit: 400 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://api.semanticscholar.org/graph/v1/paper/search");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("fields")?.split(",")).toEqual(
      expect.arrayContaining(["title", "abstract", "year", "externalIds", "citationCount", "openAccessPdf", "publicationTypes"]),
    );
    expect(url.searchParams.get("fields")).not.toMatch(/tldr|embedding/);
    expect(found).toHaveLength(papers.length);
  });

  it("reports HTTP 429 as rate-limited", async () => {
    const provider = createSemanticScholarProvider({ fetch: () => Promise.resolve(new Response("{}", { status: 429 })) });
    await expect(provider.search("q", { limit: 5 })).rejects.toMatchObject({ kind: "rate-limited", httpStatus: 429 });
  });

  it("explains the likely cause when the browser cannot read the answer at all", async () => {
    // A 429 from this API carries no CORS header, so the browser reports a network error.
    const provider = createSemanticScholarProvider({ fetch: () => Promise.reject(new TypeError("Failed to fetch")) });
    const error = await provider.search("q", { limit: 5 }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "failed" });
    expect((error as Error).message).toMatch(/free shared pool is often busy/);
  });
});

describe("Semantic Scholar subjects and syntax", () => {
  it("gives papers no subjects here, and takes plain text only", () => {
    expect(parse(papers[0]).subjects).toEqual([]);
    expect(createSemanticScholarProvider().syntax).toBe("plain");
  });
});