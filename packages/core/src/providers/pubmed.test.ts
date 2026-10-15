import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../types";
import { childrenNamed, parseXml } from "../xml";
import { createPubmedProvider, parsePubmedArticle } from "./pubmed";
// Real responses recorded from eutils.ncbi.nlm.nih.gov on 2026-10-14: an esearch (five PMIDs in
// relevance order) and one efetch covering those five plus a systematic review and the retracted
// Lancet paper (PMID 32450107): six distinct articles.
import esearch from "./__fixtures__/pubmed-esearch.json";
import efetchXml from "./__fixtures__/pubmed-efetch.xml?raw";

const articles = childrenNamed(parseXml(efetchXml), "PubmedArticle");
const parsed = articles.map((article, index) => {
  const result = parsePubmedArticle(article, index + 1, articles.length);
  if (result === null) throw new Error("fixture article did not parse");
  return result;
});
const byPmid = (pmid: string) => parsed.find((result) => result.hits[0]?.id === pmid);

describe("parsePubmedArticle", () => {
  it("parses every article in a real efetch response", () => {
    expect(parsed).toHaveLength(6);
    for (const result of parsed) {
      expect(result.title.length).toBeGreaterThan(10);
      expect(result.hits[0]).toMatchObject({ provider: "pubmed", id: expect.stringMatching(/^\d+$/) });
      expect(result.year).toBeGreaterThanOrEqual(2000);
      expect(result.venue).toEqual(expect.any(String));
      expect(result.venueKind).toMatchObject({ value: "journal", provider: "pubmed" });
      expect(result.authors.length).toBeGreaterThan(0);
      expect(result.citationCount).toBeNull();
    }
  });

  it("reads authors as family and given names", () => {
    const first = parsed[0]?.authors[0];
    expect(first?.family).toEqual(expect.any(String));
    expect(first?.given).toEqual(expect.any(String));
    expect(first?.name).toBe(`${first?.given} ${first?.family}`);
  });

  it("joins labelled abstract sections and strips any markup", () => {
    const abstracts = parsed.map((r) => r.abstract).filter((a): a is string => a !== null);
    expect(abstracts.length).toBeGreaterThanOrEqual(5);
    for (const abstract of abstracts) expect(abstract).not.toMatch(/<[a-z]/i);
    expect(abstracts.some((a) => /^[A-Z ]+: /.test(a))).toBe(true); // e.g. "BACKGROUND: ..."
  });

  it("recognises a systematic review from its publication types", () => {
    const review = parsed.find((r) => r.type === "review");
    expect(review).toBeDefined();
    expect(review?.rawType?.value).toMatch(/review|meta-analysis/i);
    expect(review?.rawType?.field).toBe("PublicationType");
  });

  it("flags the retracted Lancet paper and says why, and keeps it a journal article", () => {
    const retracted = byPmid("32450107");
    expect(retracted).toBeDefined();
    expect(retracted?.doi).toBe("10.1016/s0140-6736(20)31180-6");
    expect(retracted?.retraction).toEqual({ retracted: true, source: "PubMed (Retracted Publication / RetractionIn)" });
    expect(retracted?.type).toBe("journal-article");
  });

  it("records 'no retraction recorded' for the others", () => {
    const others = parsed.filter((r) => r.hits[0]?.id !== "32450107");
    expect(others.every((r) => r.retraction.retracted === false)).toBe(true);
  });

  it("marks a PubMed Central copy as free to read, with a link", () => {
    const free = parsed.filter((r) => r.openAccess.isOpen === true);
    expect(free.length).toBeGreaterThan(0);
    for (const result of free) expect(result.openAccess.url).toMatch(/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+\/$/);
    expect(parsed.filter((r) => r.openAccess.isOpen === null).length + free.length).toBe(parsed.length);
  });

  it("uses a DOI link when there is a DOI, otherwise the PubMed page", () => {
    const xml = (inner: string) =>
      childrenNamed(parseXml(`<PubmedArticleSet><PubmedArticle>${inner}</PubmedArticle></PubmedArticleSet>`), "PubmedArticle")[0]!;
    const base = `<MedlineCitation><PMID>42</PMID><Article><ArticleTitle>A title long enough</ArticleTitle></Article></MedlineCitation>`;
    expect(parsePubmedArticle(xml(base), 1, 1)?.url).toBe("https://pubmed.ncbi.nlm.nih.gov/42/");
    const withDoi = `${base}<PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/ABC</ArticleId></ArticleIdList></PubmedData>`;
    expect(parsePubmedArticle(xml(withDoi), 1, 1)).toMatchObject({ doi: "10.1000/abc", url: "https://doi.org/10.1000/abc", id: "10.1000/abc" });
  });

  it("returns null for an article with no PMID", () => {
    const node = childrenNamed(parseXml("<S><PubmedArticle><MedlineCitation><Article/></MedlineCitation></PubmedArticle></S>"), "PubmedArticle")[0]!;
    expect(parsePubmedArticle(node, 1, 1)).toBeNull();
  });
});

describe("createPubmedProvider", () => {
  const route = (calls: URL[], { searchBody = esearch as unknown, fetchBody = efetchXml } = {}) =>
    vi.fn<typeof fetch>((input) => {
      const url = new URL(String(input));
      calls.push(url);
      return Promise.resolve(url.pathname.endsWith("esearch.fcgi") ? Response.json(searchBody) : new Response(fetchBody));
    });

  it("searches for ids in relevance order, then fetches those records, with plain GETs", async () => {
    const calls: URL[] = [];
    const fetchMock = route(calls);
    const results = await createPubmedProvider({ fetch: fetchMock }).search("sleep memory consolidation", { limit: 500 });

    expect(calls).toHaveLength(2);
    const [searchUrl, fetchUrl] = calls;
    expect(searchUrl?.href.split("?")[0]).toBe("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
    expect(Object.fromEntries(searchUrl?.searchParams ?? [])).toEqual({
      db: "pubmed", term: "sleep memory consolidation", retmax: "100", retmode: "json", sort: "relevance", tool: "sourcly",
    });
    expect(fetchUrl?.pathname).toMatch(/efetch\.fcgi$/);
    expect(fetchUrl?.searchParams.get("id")).toBe(esearch.esearchresult.idlist.join(","));
    expect(fetchUrl?.searchParams.get("retmode")).toBe("xml");
    for (const [, init] of fetchMock.mock.calls) expect(init).toEqual({ signal: undefined });

    // Results keep the order esearch gave, with ranks 1..5 out of 5.
    expect(results.map((r) => r.hits[0]?.id)).toEqual(esearch.esearchresult.idlist);
    expect(results.map((r) => r.hits[0]?.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(results.every((r) => r.hits[0]?.listSize === 5)).toBe(true);
  });

  it("sends the contact address as NCBI's email parameter only when configured", async () => {
    const calls: URL[] = [];
    await createPubmedProvider({ fetch: route(calls), email: "me@example.org" }).search("q", { limit: 5 });
    expect(calls.every((url) => url.searchParams.get("email") === "me@example.org")).toBe(true);

    const none: URL[] = [];
    await createPubmedProvider({ fetch: route(none) }).search("q", { limit: 5 });
    expect(none.every((url) => !url.searchParams.has("email"))).toBe(true);
  });

  it("stops after the search when nothing matched", async () => {
    const calls: URL[] = [];
    const empty = { esearchresult: { count: "0", idlist: [] } };
    expect(await createPubmedProvider({ fetch: route(calls, { searchBody: empty }) }).search("zzz", { limit: 5 })).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("reports a response that is not XML as failed", async () => {
    const calls: URL[] = [];
    const provider = createPubmedProvider({ fetch: route(calls, { fetchBody: "<PubmedArticleSet><oops>" }) });
    await expect(provider.search("q", { limit: 5 })).rejects.toMatchObject({
      kind: "failed",
      message: "PubMed sent a response that is not valid XML",
    });
  });

  it("reports HTTP 429 from either request as rate-limited", async () => {
    const provider = createPubmedProvider({ fetch: () => Promise.resolve(new Response("", { status: 429 })) });
    const error = await provider.search("q", { limit: 5 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: "rate-limited", httpStatus: 429 });
  });
});

describe("PubMed subjects and syntax", () => {
  it("reads MeSH headings and author keywords, dropping blanks", () => {
    const all = parsed.flatMap((r) => r.subjects);
    const mesh = all.filter((s) => s.kind === "mesh").map((s) => s.term);
    expect(mesh).toEqual(expect.arrayContaining(["Memory Consolidation", "Sleep", "Hippocampus"]));
    expect(all.every((s) => s.provider === "pubmed" && s.term.trim() === s.term && s.term !== "")).toBe(true);
    expect(all.some((s) => s.kind === "keyword")).toBe(true);
  });

  it("does not repeat a term within one record", () => {
    for (const result of parsed) {
      const keys = result.subjects.map((s) => `${s.kind}:${s.term.toLowerCase()}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("understands Boolean queries", () => {
    expect(createPubmedProvider().syntax).toBe("boolean");
  });
});
describe("PubMed: volume, issue and pages", () => {
  it("reads the volume, the issue and the page range of an article", () => {
    const neuron = parsed.find((result) => result.volume === "111");
    expect(neuron).toMatchObject({ volume: "111", issue: "7", pages: "1050-1075" });
  });

  it("gives every article in the recorded response a volume, an issue and pages, or null", () => {
    for (const result of parsed) {
      for (const value of [result.volume, result.issue, result.pages]) {
        expect(value === null || value.length > 0).toBe(true);
      }
    }
  });
});
