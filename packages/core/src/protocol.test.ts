import { describe, expect, it } from "vitest";
import { parseConcepts } from "./concepts";
import { defaultFilters } from "./filters";
import { defaultLayoutSettings } from "./sections";
import {
  PROTOCOL_SCHEMA,
  PROTOCOL_SCHEMA_VERSION,
  buildProtocol,
  protocolFileName,
  protocolJson,
  referencesFileName,
  type ProtocolInput,
  type ProtocolSearch,
} from "./protocol";
import { defaultScoringSettings } from "./scoring";

const search = (typed: string): ProtocolSearch => ({
  typedQuery: typed,
  concepts: parseConcepts(typed),
  sentQueries: [
    { provider: "openalex", text: "effect AND sleep AND memory", notes: [] },
    { provider: "crossref", text: "effect sleep memory", notes: ["a note"] },
  ],
  statuses: [
    { provider: "openalex", state: "ok", count: 100 },
    { provider: "crossref", state: "rate-limited", message: "busy" },
  ],
  fallbackPasses: [],
  counts: { fetched: 200, merged: 180, shown: 130, partialMatches: 20, otherLanguages: 12, otherTypes: 8, hiddenByFilters: 10 },
});

const input = (changes: Partial<ProtocolInput> = {}): ProtocolInput => ({
  appVersion: "0.1.0",
  date: new Date("2026-10-14T18:30:00.000Z"),
  referenceYear: 2026,
  main: search("What is the effect of sleep on memory?"),
  counter: null,
  sources: ["openalex", "crossref"],
  resultsPerSource: 100,
  filters: { ...defaultFilters(), yearFrom: 2015, openAccessOnly: true },
  scoring: defaultScoringSettings(),
  layout: defaultLayoutSettings(),
  saved: [{ title: "A saved paper", doi: "10.1/a", url: "https://doi.org/10.1/a" }],
  ...changes,
});

describe("buildProtocol", () => {
  it("records the schema, the app version and the date", () => {
    const protocol = buildProtocol(input());
    expect(protocol).toMatchObject({
      schema: PROTOCOL_SCHEMA,
      schemaVersion: PROTOCOL_SCHEMA_VERSION,
      app: { name: "Sourcly", version: "0.1.0" },
      date: "2026-10-14T18:30:00.000Z",
    });
  });

  it("records the query as typed and as read, with the exact text each source received", () => {
    const { search: recorded } = buildProtocol(input({ main: search("How AI understand odor") }));
    expect(recorded.typedQuery).toBe("How AI understand odor");
    expect(recorded.reading.exactlyAsTyped).toBe(false);
    expect(recorded.reading.curatedSynonyms).toBe(true);
    expect(recorded.reading.commonWordsLeftOut).toEqual(["how"]);
    expect(recorded.reading.softTerms).toEqual(["understand"]);
    expect(recorded.reading.concepts.map((concept) => concept.concept)).toEqual(["AI", "odor"]);
    expect(recorded.reading.concepts[1]?.variants.map((variant) => [variant.text, variant.from])).toEqual([
      ["odor", "typed"],
      ["odour", "curated thesaurus"],
      ["odorant", "curated thesaurus"],
      ["olfaction", "curated thesaurus"],
      ["olfactory", "curated thesaurus"],
      ["smell", "curated thesaurus"],
    ]);
    expect(recorded.reading.concepts[1]?.variants[1]).toMatchObject({ entryType: "spelling" });
    expect(recorded.sentQueries).toEqual([
      { source: "openalex", query: "effect AND sleep AND memory", notes: [] },
      { source: "crossref", query: "effect sleep memory", notes: ["a note"] },
    ]);
  });

  it("records each source's status and the counts", () => {
    const { search: recorded } = buildProtocol(input());
    expect(recorded.statuses).toEqual([
      { provider: "openalex", state: "ok", count: 100 },
      { provider: "crossref", state: "rate-limited", message: "busy" },
    ]);
    expect(recorded.counts).toEqual({
      fetched: 200,
      merged: 180,
      shown: 130,
      partialMatches: 20,
      otherLanguages: 12,
      otherTypes: 8,
      hiddenByFilters: 10,
    });
  });

  it("records the chosen sources, the number asked for and the filters", () => {
    const protocol = buildProtocol(input());
    expect(protocol.sources).toEqual(["openalex", "crossref"]);
    expect(protocol.resultsPerSource).toBe(100);
    expect(protocol.filters).toEqual({ yearFrom: 2015, yearTo: null, levels: [], peerReview: [], openAccessOnly: true });
  });

  it("records the fallback passes, with the concept each one dropped and what each source asked in it received", () => {
    const withPass = search("sleep memory");
    withPass.fallbackPasses = [
      {
        dropped: "memory",
        sentQueries: [{ provider: "openalex", text: "sleep", notes: ["a note"] }],
        statuses: [{ provider: "openalex", state: "ok", count: 100 }],
      },
    ];
    const { search: recorded } = buildProtocol(input({ main: withPass }));
    expect(recorded.fallbackPasses).toEqual([
      {
        droppedConcept: "memory",
        sentQueries: [{ source: "openalex", query: "sleep", notes: ["a note"] }],
        statuses: [{ provider: "openalex", state: "ok", count: 100 }],
      },
    ]);
    expect(buildProtocol(input()).search.fallbackPasses).toEqual([]);
  });

  it("records every weight and switch, the half-life and the reference year, so a ranking can be repeated", () => {
    const { ranking } = buildProtocol(input());
    expect(ranking.referenceYear).toBe(2026);
    expect(ranking.recencyHalfLifeYears).toBe(10);
    expect(ranking.relevance).toContain("BM25 (k1 = 1.2, b = 0.75)");
    expect(ranking.formula).toContain("sum(weight * factor) / sum(weight)");
    expect(ranking.layout).toEqual({ preferredLanguages: ["en"], showNonArticleTypes: false, fewFullMatches: 15 });
    expect(Object.keys(ranking.factors)).toEqual([
      "relevance",
      "termCoverage",
      "phraseMatch",
      "citations",
      "recency",
      "peerReview",
      "openAccess",
      "providerAgreement",
      "studyType",
    ]);
    expect(ranking.factors.relevance).toEqual({ label: "Relevance (BM25)", enabled: true, weight: 3 });
    expect(ranking.factors.termCoverage).toEqual({ label: "Term coverage", enabled: true, weight: 2 });
    expect(ranking.factors.phraseMatch).toEqual({ label: "Phrase match", enabled: true, weight: 1 });
    expect(ranking.factors.openAccess).toEqual({ label: "Open access", enabled: true, weight: 0 });
    expect(ranking.factors.providerAgreement.weight).toBe(0.5);
    expect(ranking.factors.studyType.enabled).toBe(false);
  });

  it("has no counterargument search unless one was run", () => {
    expect(buildProtocol(input()).counterSearch).toBeNull();
  });

  it("records a counterargument search with its mode and terms", () => {
    const counter = { ...search("sleep memory"), mode: "terms" as const, terms: ["limitation", "no evidence"] };
    expect(buildProtocol(input({ counter })).counterSearch).toMatchObject({
      mode: "terms",
      terms: ["limitation", "no evidence"],
      typedQuery: "sleep memory",
      counts: { fetched: 200 },
    });
  });

  it("lists the saved sources by title, DOI and address only", () => {
    expect(buildProtocol(input()).saved).toEqual([{ title: "A saved paper", doi: "10.1/a", url: "https://doi.org/10.1/a" }]);
    const extra = [{ title: "T", doi: null, url: null, abstract: "long text", authors: [1, 2] }];
    expect(buildProtocol(input({ saved: extra })).saved).toEqual([{ title: "T", doi: null, url: null }]);
  });

  it("says results can change, and that it holds no key or email", () => {
    expect(buildProtocol(input()).notes.join(" ")).toMatch(/repeating this search later can give different results/);
    expect(buildProtocol(input()).notes.join(" ")).toMatch(/no API key and no contact email/);
  });

  it("contains nothing that was not named: an API key or email in the input never reaches the output", () => {
    const hostile = {
      ...input(),
      apiKey: "SECRET-KEY-123",
      contactEmail: "someone@example.org",
      main: { ...search("q"), apiKey: "SECRET-KEY-123", sentQueries: [{ provider: "openalex" as const, text: "q", notes: [], apiKey: "SECRET-KEY-123" }] },
      scoring: { ...defaultScoringSettings(), apiKey: "SECRET-KEY-123" },
      filters: { ...defaultFilters(), apiKey: "SECRET-KEY-123" },
    } as unknown as ProtocolInput;
    const json = protocolJson(buildProtocol(hostile));
    expect(json).not.toContain("SECRET-KEY-123");
    expect(json).not.toContain("someone@example.org");
    expect(json).not.toContain("apiKey");
  });

  it("does not change its input", () => {
    const given = input();
    const before = JSON.stringify(given);
    buildProtocol(given);
    expect(JSON.stringify(given)).toBe(before);
  });
});

describe("protocolJson", () => {
  it("is indented JSON with a final newline that reads back as the same object", () => {
    const protocol = buildProtocol(input());
    const text = protocolJson(protocol);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "schema": "sourcly-search-protocol"');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(protocol)));
  });

  it("gives the same text for the same input", () => {
    expect(protocolJson(buildProtocol(input()))).toBe(protocolJson(buildProtocol(input())));
  });
});

describe("file names", () => {
  it("uses the date in the person's own time zone", () => {
    const date = new Date(2026, 9, 4, 23, 59);
    expect(protocolFileName(date)).toBe("sourcly-search-protocol-2026-10-04.json");
    expect(referencesFileName(date)).toBe("sourcly-references-2026-10-04.txt");
  });
});
