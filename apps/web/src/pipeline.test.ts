import {
  defaultFilters,
  defaultScoringSettings,
  FACTOR_IDS,
  parseQuery,
  planQueries,
  type ProviderId,
  type Result,
  type ScoringContext,
  type Subject,
} from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { rankResults, RELATED_FROM_TOP, relatedFor, scoringContext, type ViewSettings } from "./pipeline";
import { idleSearch, searchReducer, type ActiveSearch } from "./searchState";
import { withFactor } from "./settings";

const YEAR = 2026;

// The query "sleep memory", with one source answering unless a test says otherwise.
const context = (changes: Partial<ScoringContext> = {}): ScoringContext => ({
  referenceYear: YEAR,
  queryTerms: ["sleep", "memory"],
  answeredSources: 1,
  ...changes,
});

const hit = (rank: number, listSize: number) => [
  { provider: "openalex" as const, id: `W${rank}`, rank, listSize, score: null },
];

// A: matches both query words, closed.  B: matches one word, open.  C: matches neither, open preprint (not peer-reviewed).
const results = (): Result[] => [
  makeResult({ id: "10.1000/a", doi: "10.1000/a", title: "Sleep and memory", year: 2020, hits: hit(1, 3), citationCount: 30 }),
  makeResult({
    id: "10.1000/b", doi: "10.1000/b", title: "Sleep and learning", year: 2021, hits: hit(2, 3), citationCount: 10,
    openAccess: { isOpen: true, status: "gold", url: null, pdfUrl: null },
  }),
  makeResult({
    id: "10.1000/c", doi: "10.1000/c", title: "Gardening", year: 2024, hits: hit(3, 3), citationCount: 2, type: "preprint", venueKind: null,
    openAccess: { isOpen: true, status: "green", url: null, pdfUrl: null },
  }),
];

const view = (changes: Partial<ViewSettings> = {}): ViewSettings => ({
  scoring: defaultScoringSettings(),
  filters: defaultFilters(),
  overrides: new Map(),
  ...changes,
});

const ids = (list: { result: Result }[]) => list.map((item) => item.result.id);

describe("rankResults", () => {
  it("labels, scores and sorts best first, hiding nothing by default", () => {
    const { shown, hidden } = rankResults(results(), view(), context());
    expect(hidden).toEqual([]);
    expect(ids(shown)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i - 1]?.score).toBeGreaterThanOrEqual(shown[i]?.score ?? Number.POSITIVE_INFINITY);
    }
    expect(shown[0]?.labels.level.value).toBe("primary");
    expect(shown[2]?.labels.peerReview.value).toBe("not-peer-reviewed");
  });

  it("re-ranks the same fetched results when weights change", () => {
    const fetched = results();
    const onlyOpenAccess = defaultScoringSettings();
    for (const id of FACTOR_IDS) onlyOpenAccess.factors[id] = { enabled: id === "openAccess", weight: 1 };

    expect(ids(rankResults(fetched, view(), context()).shown)).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    // B and C are open and A is not, so A drops to the bottom without any new data.
    expect(ids(rankResults(fetched, view({ scoring: onlyOpenAccess }), context()).shown)).toEqual([
      "10.1000/b",
      "10.1000/c",
      "10.1000/a",
    ]);
  });

  it("re-ranks when a factor is switched off", () => {
    const scoring = withFactor(defaultScoringSettings(), "relevance", { enabled: false });
    const ranked = rankResults(results(), view({ scoring }), context()).shown;
    expect(ranked[0]?.factors.find((f) => f.factor === "relevance")?.contribution).toBe(0);
  });

  it("hides only what a filter excludes, and reports it as hidden", () => {
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const { shown, hidden } = rankResults(results(), view({ filters }), context());
    expect(ids(shown)).toEqual(["10.1000/b", "10.1000/c"]);
    expect(ids(hidden)).toEqual(["10.1000/a"]);
  });

  it("never lets a filter change anyone's score", () => {
    const unfiltered = rankResults(results(), view(), context()).shown;
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const filtered = rankResults(results(), view({ filters }), context()).shown;
    for (const item of filtered) {
      const same = unfiltered.find((other) => other.result.id === item.result.id);
      expect(item.score).toBe(same?.score);
    }
  });

  it("applies the user's label overrides to both the labels and the score", () => {
    const base = rankResults(results(), view(), context()).shown.find((s) => s.result.id === "10.1000/c");
    const overrides = new Map([["10.1000/c", { peerReview: "peer-reviewed" as const, level: "secondary" as const }]]);
    const changed = rankResults(results(), view({ overrides }), context()).shown.find((s) => s.result.id === "10.1000/c");

    expect(changed?.labels.level).toMatchObject({ value: "secondary", origin: "user" });
    expect(changed?.labels.peerReview).toMatchObject({ value: "peer-reviewed", origin: "user" });
    expect(changed?.score).toBeGreaterThan(base?.score ?? Number.POSITIVE_INFINITY);
  });

  it("filters on overridden labels", () => {
    const overrides = new Map([["10.1000/c", { level: "tertiary" as const }]]);
    const filters = { ...defaultFilters(), levels: ["tertiary" as const] };
    expect(ids(rankResults(results(), view({ overrides, filters }), context()).shown)).toEqual(["10.1000/c"]);
  });

  it("does not modify its inputs", () => {
    const fetched = results();
    const before = structuredClone(fetched);
    const settings = view();
    rankResults(fetched, settings, context());
    expect(fetched).toEqual(before);
  });

  it("returns empty lists for no results", () => {
    expect(rankResults([], view(), context())).toEqual({ shown: [], hidden: [] });
  });
});

describe("rankResults: the query", () => {
  it("ranks by the words of the query, not by the order a source returned things in", () => {
    const fetched = results();
    expect(ids(rankResults(fetched, view(), context()).shown)[0]).toBe("10.1000/a");
    // Same results, a different query: the gardening paper is now the best match.
    expect(ids(rankResults(fetched, view(), context({ queryTerms: ["gardening"] })).shown)[0]).toBe("10.1000/c");
  });

  it("re-ranks without new data when only the query's words change", () => {
    const fetched = results();
    const before = structuredClone(fetched);
    rankResults(fetched, view(), context({ queryTerms: ["gardening"] }));
    expect(fetched).toEqual(before);
  });

  it("measures relevance over every merged result, so a filter never changes a score", () => {
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const filtered = rankResults(results(), view({ filters }), context()).shown;
    const unfiltered = rankResults(results(), view(), context()).shown;
    for (const item of filtered) {
      const same = unfiltered.find((other) => other.result.id === item.result.id);
      const relevance = (s: typeof item | undefined) => s?.factors.find((f) => f.factor === "relevance")?.normalized;
      expect(relevance(item)).toBe(relevance(same));
    }
  });
});

describe("rankResults: results found by several sources", () => {
  const found = (provider: "openalex" | "crossref" | "pubmed", rank: number, overrides: Partial<Result> = {}) =>
    makeResult({
      id: "10.1000/shared",
      doi: "10.1000/shared",
      hits: [{ provider, id: `${provider}-${rank}`, rank, listSize: 10, score: null }],
      ...overrides,
    });

  it("merges one work returned by three sources into one result that lists all three", () => {
    const { shown } = rankResults([found("pubmed", 7), found("crossref", 3), found("openalex", 1)], view(), context());
    expect(shown).toHaveLength(1);
    expect(shown[0]?.result.hits.map((h) => h.provider)).toEqual(["openalex", "crossref", "pubmed"]);
  });

  it("scores provider agreement from how many of the answering sources found the work", () => {
    const { shown } = rankResults(
      [found("pubmed", 9), found("openalex", 2), found("crossref", 4)],
      view(),
      context({ answeredSources: 4 }),
    );
    const agreement = shown[0]?.factors.find((f) => f.factor === "providerAgreement");
    expect(agreement).toMatchObject({ raw: 3, normalized: 0.75 });
    expect(agreement?.detail).toBe("Found by 3 of the 4 sources that answered (OpenAlex, Crossref, PubMed): 3 / 4");
  });

  it("gives the same ranking whatever order the sources answered in", () => {
    const others = [
      makeResult({ id: "10.1000/x", doi: "10.1000/x", year: 2019, hits: hit(1, 3) }),
      makeResult({ id: "10.1000/y", doi: "10.1000/y", year: 2015, hits: hit(3, 3) }),
    ];
    const pile = [found("openalex", 2), found("crossref", 5), ...others];
    const forwards = rankResults(pile, view(), context()).shown;
    const backwards = rankResults([...pile].reverse(), view(), context()).shown;
    expect(backwards.map((s) => [s.result.id, s.score])).toEqual(forwards.map((s) => [s.result.id, s.score]));
  });

  it("uses the merged record for filters, so one source's open-access flag counts", () => {
    const closed = found("crossref", 1, { openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null } });
    const open = found("europepmc" as never, 4, { openAccess: { isOpen: true, status: "unknown", url: "https://x.org", pdfUrl: null } });
    const filters = { ...defaultFilters(), openAccessOnly: true };
    const { shown, hidden } = rankResults([closed, open], view({ filters }), context());
    expect(shown).toHaveLength(1);
    expect(hidden).toHaveLength(0);
  });

  it("does not merge different works that merely share a title", () => {
    const a = makeResult({ id: "10.1/a", doi: "10.1/a", title: "Sleep and memory in adults", authors: [{ name: "Ann Smith" }] });
    const b = makeResult({ id: "10.1/b", doi: "10.1/b", title: "Sleep and memory in adults", authors: [{ name: "Ann Smith" }] });
    expect(rankResults([a, b], view(), context()).shown).toHaveLength(2);
  });
});

describe("scoringContext", () => {
  const providers: { id: ProviderId; syntax: "boolean" | "plain" }[] = [
    { id: "openalex", syntax: "boolean" },
    { id: "crossref", syntax: "plain" },
    { id: "pubmed", syntax: "boolean" },
  ];

  function searching(text: string): ActiveSearch {
    const parsed = parseQuery(text);
    const state = searchReducer(idleSearch, {
      type: "start",
      id: 1,
      parsed,
      sent: planQueries(providers, parsed),
      order: providers.map((p) => p.id),
      skipped: [{ provider: "arxiv", state: "skipped", message: "no CORS" }],
    });
    if (state.phase === "idle") throw new Error("expected an active search");
    return state;
  }

  it("takes the query's words from the search and the year it is given", () => {
    expect(scoringContext(searching('"memory consolidation" sleep NOT rats'), 2026)).toEqual({
      referenceYear: 2026,
      queryTerms: ["memory", "consolidation", "sleep"],
      answeredSources: 0,
    });
  });

  it("passes the counterargument terms on only when it is given them", () => {
    expect(scoringContext(searching("sleep"), 2026, ["bias", "limitation"]).signalTerms).toEqual(["bias", "limitation"]);
    expect("signalTerms" in scoringContext(searching("sleep"), 2026)).toBe(false);
  });

  it("counts only the sources that answered, not failed, rate-limited or skipped ones", () => {
    let state: ActiveSearch = searching("sleep");
    const answer = (provider: ProviderId, status: ActiveSearch["statuses"][number]) => {
      const next = searchReducer(state, { type: "provider-done", id: 1, update: { provider, status, results: [] } });
      if (next.phase === "idle") throw new Error("expected an active search");
      state = next;
    };
    answer("openalex", { provider: "openalex", state: "ok", count: 0 });
    answer("crossref", { provider: "crossref", state: "rate-limited", message: "busy" });
    answer("pubmed", { provider: "pubmed", state: "failed", message: "down" });
    // The skipped arXiv status was recorded when the search began and is not an answer.
    expect(scoringContext(state, 2026).answeredSources).toBe(1);
  });
});

describe("relatedFor", () => {
  const topic = (term: string): Subject => ({ term, kind: "topic", provider: "openalex" });
  const withTopics = (id: string, ...subjects: Subject[]) => makeResult({ id, doi: id, subjects });

  it("suggests terms from the top results only", () => {
    const top = Array.from({ length: RELATED_FROM_TOP }, (_, i) => withTopics(`10.1/top${i}`, topic("Common Topic")));
    const beyond = withTopics("10.1/beyond", topic("Only Far Down"));
    const ranked = { shown: [...top, beyond].map((result) => ({ result }) as never), hidden: [] };
    const terms = relatedFor(ranked, []).map((t) => t.term);
    expect(terms).toEqual(["Common Topic"]);
  });

  it("leaves out terms made only of words already in the query", () => {
    const ranked = {
      shown: [withTopics("10.1/a", topic("Sleep"), topic("Dreaming"))].map((result) => ({ result }) as never),
      hidden: [],
    };
    expect(relatedFor(ranked, ["sleep"]).map((t) => t.term)).toEqual(["Dreaming"]);
  });
});
