import { describe, expect, it } from "vitest";
import { duplicateKey, familyName, mergeResults, normalizeTitle, versionlessDoi } from "./dedupe";
import { parseCrossrefWork } from "./providers/crossref";
import { parseDataCiteRecord } from "./providers/datacite";
import { parseEuropePmcRecord } from "./providers/europepmc";
import { parseOpenAlexWork } from "./providers/openalex";
import { parseZenodoRecord } from "./providers/zenodo";
import crossrefFixtures from "./providers/__fixtures__/crossref.json";
import datacite from "./providers/__fixtures__/datacite.json";
import europepmc from "./providers/__fixtures__/europepmc.json";
import openalex from "./providers/__fixtures__/openalex-works.json";
import zenodo from "./providers/__fixtures__/zenodo.json";
import { makeResult } from "./testing/make-result";
import type { ProviderId, Result } from "./types";

const hit = (provider: ProviderId, rank = 1, listSize = 10) => [{ provider, id: `${provider}-${rank}`, rank, listSize, score: null }];
const result = (provider: ProviderId, overrides: Partial<Result> = {}) =>
  makeResult({ hits: hit(provider), ...overrides });

describe("merging by DOI", () => {
  it("merges the real OpenAlex and Zenodo records of the same Nature paper into one", () => {
    const fromOpenAlex = parseOpenAlexWork(openalex.search.results[0], 1, 3);
    const fromZenodo = parseZenodoRecord(zenodo.hits.hits[5], 6, 6);
    if (fromOpenAlex === null || fromZenodo === null) throw new Error("fixtures did not parse");

    const merged = mergeResults([fromZenodo, fromOpenAlex]);
    expect(merged).toHaveLength(1);
    const [paper] = merged;
    expect(paper?.doi).toBe("10.1038/nature04286");
    // Every provider that returned it is listed, best-curated provider first.
    expect(paper?.hits.map((h) => h.provider)).toEqual(["openalex", "zenodo"]);
    // OpenAlex wins the fields where both have a value, and fills in what Zenodo lacks.
    expect(paper?.title).toBe("Sleep-dependent memory consolidation");
    expect(paper?.citationCount).toBe(1841);
    expect(paper?.venue).toBe("Nature");
    expect(paper?.openAccess).toMatchObject({ isOpen: true, status: "bronze", pdfUrl: "https://www.nature.com/articles/nature04286.pdf" });
    expect(paper?.authorCountries).toEqual(["US"]);
  });

  it("treats version and concept DOIs of one deposit as the same work (real DataCite records)", () => {
    const records = datacite.data.map((r, i) => parseDataCiteRecord(r, i + 1, 6)).filter((r): r is Result => r !== null);
    expect(records).toHaveLength(6);
    const merged = mergeResults(records);
    expect(merged).toHaveLength(3); // three deposits, each listed under two DOIs
    expect(merged.map((m) => m.hits.length)).toEqual([2, 2, 2]);
  });

  it("matches DOIs that differ only in letter case or a version marker", () => {
    expect(versionlessDoi("10.25405/ncl.34495572.v1")).toBe("10.25405/ncl.34495572");
    expect(versionlessDoi("10.5281/zenodo.123/v2")).toBe("10.5281/zenodo.123");
    expect(versionlessDoi("10.1000/abc")).toBe("10.1000/abc");
    expect(versionlessDoi("10.1000/review.v")).toBe("10.1000/review.v");
  });

  it("never merges two results whose DOIs differ, even with the same title, year and author", () => {
    const published = result("crossref", { id: "10.1/pub", doi: "10.1/pub", type: "journal-article" });
    const preprint = result("europepmc", { id: "10.2/pre", doi: "10.2/pre", type: "preprint" });
    expect(mergeResults([published, preprint])).toHaveLength(2);
  });
});

describe("merging by title, year and first author", () => {
  const base = { title: "Sleep and the consolidation of memory", year: 2020, authors: [{ name: "Robert Stickgold" }] };

  it("merges a result with no DOI into one that has a DOI, and adopts the DOI", () => {
    const withDoi = result("openalex", { ...base, id: "10.1/a", doi: "10.1/a" });
    const without = result("wikipedia", { ...base, id: "x:1", doi: null });
    const [merged, ...rest] = mergeResults([without, withDoi]);
    expect(rest).toEqual([]);
    expect(merged?.doi).toBe("10.1/a");
    expect(merged?.id).toBe("10.1/a");
    expect(merged?.hits.map((h) => h.provider)).toEqual(["openalex", "wikipedia"]);
  });

  it("ignores case, accents, punctuation, markup and spacing in titles", () => {
    const a = result("crossref", { ...base, id: "a", doi: null, title: "Sleep-and the <i>consolidation</i> of memory!" });
    const b = result("pubmed", { ...base, id: "b", doi: null, title: "SLEEP AND THE  CONSOLIDATION OF MEMORY" });
    expect(mergeResults([a, b])).toHaveLength(1);
    expect(normalizeTitle("Café: déjà vu — <b>again</b>")).toBe("cafe deja vu again");
  });

  it("recognises one author written three ways", () => {
    const names = ["Robert Stickgold", "Stickgold, Robert", "Stickgold R"];
    const keys = names.map((name) => duplicateKey({ ...base, authors: [{ name }] }));
    expect(new Set(keys).size).toBe(1);
    expect(familyName({ name: "Van Der Berg JA" })).toBe("berg");
    expect(familyName({ name: "Plato" })).toBe("plato");
    expect(familyName({ name: "Anything", family: "Müller" })).toBe("muller");
  });

  it("does not merge when the year or first author differs", () => {
    const a = result("crossref", { ...base, id: "a", doi: null });
    expect(mergeResults([a, result("pubmed", { ...base, id: "b", doi: null, year: 2021 })])).toHaveLength(2);
    expect(mergeResults([a, result("pubmed", { ...base, id: "c", doi: null, authors: [{ name: "Jan Born" }] })])).toHaveLength(2);
  });

  it("matches on DOI only when a result lists no author, or has a very short title", () => {
    const noAuthor = { title: "Sleep and the consolidation of memory", year: 2020, authors: [] };
    expect(duplicateKey(noAuthor)).toBeNull();
    expect(mergeResults([result("crossref", { ...noAuthor, id: "a", doi: null }), result("pubmed", { ...noAuthor, id: "b", doi: null })])).toHaveLength(2);
    expect(duplicateKey({ ...base, title: "Sleep" })).toBeNull();
  });
});

describe("what a merged result keeps", () => {
  const doi = "10.1/x";
  const a = result("crossref", { id: doi, doi, title: "Crossref title", year: null, citationCount: 5, abstract: "short", authors: [{ name: "A" }], type: "journal-article" });
  const b = result("openalex", { id: doi, doi, title: "OpenAlex title", year: 2020, citationCount: 50, abstract: "a much longer abstract", authors: [{ name: "A" }, { name: "B" }], type: "review" });

  it("prefers the higher-priority provider for plain fields, and fills gaps from the other", () => {
    const [m] = mergeResults([a, b]);
    expect(m?.title).toBe("OpenAlex title");
    expect(m?.year).toBe(2020);
  });

  it("keeps the longest abstract and author list, and the highest citation count", () => {
    const [m] = mergeResults([a, b]);
    expect(m?.abstract).toBe("a much longer abstract");
    expect(m?.authors).toHaveLength(2);
    expect(m?.citationCount).toBe(50);
  });

  it("keeps the most specific type, along with the raw type that said so", () => {
    const [m] = mergeResults([a, b]);
    expect(m?.type).toBe("review");
    expect(m?.rawType?.provider).toBe("openalex");
    const preprint = result("europepmc", { id: doi, doi, type: "preprint", rawType: { value: "Preprint", provider: "europepmc", field: "source" } });
    expect(mergeResults([preprint, a])[0]?.type).toBe("journal-article");
  });

  it("calls a result retracted if any provider says so, and lists their sources", () => {
    const flagged = result("pubmed", { id: doi, doi, retraction: { retracted: true, source: "PubMed" } });
    const clear = result("openalex", { id: doi, doi, retraction: { retracted: false, source: "OpenAlex" } });
    const unknown = result("crossref", { id: doi, doi, retraction: { retracted: null, source: null } });
    expect(mergeResults([clear, flagged]) [0]?.retraction).toEqual({ retracted: true, source: "PubMed" });
    expect(mergeResults([clear, unknown])[0]?.retraction.retracted).toBe(false);
    expect(mergeResults([unknown, result("crossref", { id: doi, doi, retraction: { retracted: null, source: null } })])[0]?.retraction).toEqual({ retracted: null, source: null });
  });

  it("is open access if any provider says so, using the open copy's details", () => {
    const closed = result("crossref", { id: doi, doi, openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null } });
    const open = result("europepmc", { id: doi, doi, openAccess: { isOpen: true, status: "unknown", url: "https://example.org/free", pdfUrl: "https://example.org/free.pdf" } });
    expect(mergeResults([closed, open])[0]?.openAccess).toEqual({ isOpen: true, status: "unknown", url: "https://example.org/free", pdfUrl: "https://example.org/free.pdf" });
  });

  it("combines author countries", () => {
    const x = result("openalex", { id: doi, doi, authorCountries: ["US", "DE"] });
    const y = result("crossref", { id: doi, doi, authorCountries: ["CA", "US"] });
    expect(mergeResults([x, y])[0]?.authorCountries).toEqual(["CA", "DE", "US"]);
  });

  it("combines subject terms from every provider, without repeats, earliest-priority source first", () => {
    const fromOpenAlex = result("openalex", {
      id: doi,
      doi,
      subjects: [
        { term: "Sleep", kind: "topic", provider: "openalex" },
        { term: "Memory", kind: "keyword", provider: "openalex" },
      ],
    });
    const fromPubmed = result("pubmed", {
      id: doi,
      doi,
      subjects: [
        { term: "sleep", kind: "topic", provider: "pubmed" },
        { term: "Sleep", kind: "mesh", provider: "pubmed" },
        { term: "Dreams", kind: "mesh", provider: "pubmed" },
      ],
    });
    const merged = mergeResults([fromPubmed, fromOpenAlex])[0]?.subjects ?? [];
    expect(merged.map((s) => `${s.provider}:${s.kind}:${s.term}`)).toEqual([
      "openalex:topic:Sleep",
      "openalex:keyword:Memory",
      "pubmed:mesh:Sleep",
      "pubmed:mesh:Dreams",
    ]);
  });

  it("keeps a lone result's subjects as they were", () => {
    const subjects = [{ term: "Sleep", kind: "topic" as const, provider: "openalex" as const }];
    expect(mergeResults([result("openalex", { id: doi, doi, subjects })])[0]?.subjects).toEqual(subjects);
  });
});

describe("mergeResults in general", () => {
  it("returns single results untouched, in order of first appearance", () => {
    const one = result("openalex", { id: "1", doi: "10.1/1", title: "First result title here" });
    const two = result("crossref", { id: "2", doi: "10.1/2", title: "Second result title here" });
    expect(mergeResults([one, two])).toEqual([one, two]);
    expect(mergeResults([])).toEqual([]);
  });

  it("does not modify its inputs", () => {
    const x = result("openalex", { id: "a", doi: "10.1/a", hits: hit("openalex", 1) });
    const y = result("crossref", { id: "a", doi: "10.1/a", hits: hit("crossref", 3) });
    const before = structuredClone([x, y]);
    mergeResults([x, y]);
    expect([x, y]).toEqual(before);
  });

  it("merges the same work three ways at once", () => {
    const merged = mergeResults(["crossref", "pubmed", "openalex"].map((p) => result(p as ProviderId, { id: "a", doi: "10.1/a" })));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.hits.map((h) => h.provider)).toEqual(["openalex", "crossref", "pubmed"]);
  });

  it("works across a whole pile of real records from five providers", () => {
    const pile: Result[] = [
      ...openalex.search.results.map((w, i) => parseOpenAlexWork(w, i + 1, 3)),
      ...crossrefFixtures.search.message.items.map((w, i) => parseCrossrefWork(w, i + 1, 6)),
      ...europepmc.search.resultList.result.map((w, i) => parseEuropePmcRecord(w, i + 1, 6)),
      ...zenodo.hits.hits.map((w, i) => parseZenodoRecord(w, i + 1, 6)),
      ...datacite.data.map((w, i) => parseDataCiteRecord(w, i + 1, 6)),
    ].filter((r): r is Result => r !== null);

    const merged = mergeResults(pile);
    expect(merged.length).toBeLessThan(pile.length);
    // No two merged results share a DOI (ignoring version markers).
    const dois = merged.map((m) => m.doi).filter((d): d is string => d !== null).map(versionlessDoi);
    expect(new Set(dois).size).toBe(dois.length);
    // Nothing is lost: every provider hit is still listed on some merged result.
    expect(merged.reduce((sum, m) => sum + m.hits.length, 0)).toBe(pile.length);
  });
});

describe("merging volume, issue and pages", () => {
  const doi = "10.1/biblio";
  it("takes each from the first source that has it, in provider priority order", () => {
    const crossref = result("crossref", { id: doi, doi, volume: "9", issue: null, pages: "1-2" });
    const openalex = result("openalex", { id: doi, doi, volume: "12", issue: "3", pages: null });
    const [merged] = mergeResults([crossref, openalex]);
    expect(merged).toMatchObject({ volume: "12", issue: "3", pages: "1-2" });
  });
});
