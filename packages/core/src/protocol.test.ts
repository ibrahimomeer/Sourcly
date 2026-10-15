import { describe, expect, it } from "vitest";
import { defaultFilters } from "./filters";
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
  searchedQuery: "effect sleep memory",
  commonWordsRemoved: ["what", "is", "the"],
  sentQueries: [
    { provider: "openalex", text: "effect AND sleep AND memory", notes: [] },
    { provider: "crossref", text: "effect sleep memory", notes: ["a note"] },
  ],
  statuses: [
    { provider: "openalex", state: "ok", count: 100 },
    { provider: "crossref", state: "rate-limited", message: "busy" },
  ],
  counts: { fetched: 200, merged: 180, shown: 170, hiddenByFilters: 10 },
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

  it("records the query as typed and as searched, with the exact text each source received", () => {
    const { search: recorded } = buildProtocol(input());
    expect(recorded.typedQuery).toBe("What is the effect of sleep on memory?");
    expect(recorded.searchedQuery).toBe("effect sleep memory");
    expect(recorded.commonWordsRemoved).toEqual(["what", "is", "the"]);
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
    expect(recorded.counts).toEqual({ fetched: 200, merged: 180, shown: 170, hiddenByFilters: 10 });
  });

  it("records the chosen sources, the number asked for and the filters", () => {
    const protocol = buildProtocol(input());
    expect(protocol.sources).toEqual(["openalex", "crossref"]);
    expect(protocol.resultsPerSource).toBe(100);
    expect(protocol.filters).toEqual({ yearFrom: 2015, yearTo: null, levels: [], peerReview: [], openAccessOnly: true });
  });

  it("records every weight and switch, the half-life and the reference year, so a ranking can be repeated", () => {
    const { ranking } = buildProtocol(input());
    expect(ranking.referenceYear).toBe(2026);
    expect(ranking.recencyHalfLifeYears).toBe(10);
    expect(ranking.relevance).toContain("BM25 (k1 = 1.2, b = 0.75)");
    expect(ranking.formula).toContain("sum(weight * factor) / sum(weight)");
    expect(Object.keys(ranking.factors)).toEqual([
      "relevance",
      "citations",
      "recency",
      "peerReview",
      "openAccess",
      "providerAgreement",
      "studyType",
    ]);
    expect(ranking.factors.relevance).toEqual({ label: "Relevance (BM25)", enabled: true, weight: 3 });
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
