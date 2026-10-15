import { BM25_B, BM25_K1 } from "./bm25";
import { hardBlocks, type ConceptQuery } from "./concepts";
import type { ResultFilters } from "./filters";
import { FACTOR_IDS, FACTOR_LABELS, type FactorId, type ScoringSettings } from "./scoring";
import type { SentQuery } from "./search";
import { FEW_FULL_MATCHES, type LayoutSettings } from "./sections";
import type { ProviderId, ProviderStatus } from "./types";

// The search protocol: a plain JSON record of one search, so it can be written up, checked and
// repeated. It is built only from the fields named below, so nothing else (an API key, a contact
// email, the contents of the results) can find its way in.

export const PROTOCOL_SCHEMA = "sourcly-search-protocol";
export const PROTOCOL_SCHEMA_VERSION = 1;

export interface ProtocolSearch {
  /** What was typed, exactly. */
  typedQuery: string;
  /** How the typed text was read: the concepts, the words left out, the settings that changed the reading. */
  concepts: ConceptQuery;
  /** The text each source received, and what it could not apply. */
  sentQueries: SentQuery[];
  /** How each source answered. */
  statuses: ProviderStatus[];
  /** The fallback passes that ran (a concept dropped at a time, when the first search found few), each with what was sent. */
  fallbackPasses: { dropped: string; sentQueries: SentQuery[]; statuses: ProviderStatus[] }[];
  counts: {
    /** Records returned by all sources together, before duplicates were merged. */
    fetched: number;
    /** Distinct works after merging duplicates. */
    merged: number;
    shown: number;
    /** Results kept apart as partial matches (they lack some of the query's concepts). */
    partialMatches: number;
    /** Results kept apart because they are in a language that is not preferred. */
    otherLanguages: number;
    /** Results kept apart because they are datasets, theses, reports and other non-article types. */
    otherTypes: number;
    hiddenByFilters: number;
  };
}

export interface ProtocolInput {
  appVersion: string;
  date: Date;
  /** The year ages were measured from for the recency factor. */
  referenceYear: number;
  main: ProtocolSearch;
  /** The counterargument search, if one was run for this search. */
  counter: (ProtocolSearch & { mode: "terms" | "own"; terms: string[] }) | null;
  sources: readonly ProviderId[];
  resultsPerSource: number;
  filters: ResultFilters;
  scoring: ScoringSettings;
  layout: LayoutSettings;
  /** The sources the user saved to their list. */
  saved: readonly { title: string; doi: string | null; url: string | null }[];
}

const copyQueries = (queries: readonly SentQuery[]) =>
  queries.map(({ provider, text, notes }) => ({ source: provider, query: text, notes: [...notes] }));

/** How the search was read, by concept: only the fields below are written, whatever the input carries. */
function copyConcepts(query: ConceptQuery) {
  return {
    exactlyAsTyped: query.exact,
    curatedSynonyms: query.expanded,
    concepts: hardBlocks(query).map((block) => ({
      concept: block.label,
      quoted: block.quoted,
      variants: block.variants.map((variant) => ({
        text: variant.text,
        from: variant.origin === "thesaurus" ? "curated thesaurus" : "typed",
        ...(variant.entryType === undefined ? {} : { entryType: variant.entryType }),
        ...(variant.note === undefined ? {} : { note: variant.note }),
      })),
    })),
    softTerms: query.soft.map((term) => term.text),
    commonWordsLeftOut: [...query.stopwords],
    excluded: query.exclusions.map((variant) => variant.text),
  };
}

const copySearch = (search: ProtocolSearch) => ({
  typedQuery: search.typedQuery,
  reading: copyConcepts(search.concepts),
  sentQueries: copyQueries(search.sentQueries),
  statuses: search.statuses.map((status) => ({ ...status })),
  fallbackPasses: search.fallbackPasses.map((pass) => ({
    droppedConcept: pass.dropped,
    sentQueries: copyQueries(pass.sentQueries),
    statuses: pass.statuses.map((status) => ({ ...status })),
  })),
  counts: { ...search.counts },
});

/** The protocol as a plain object. Every field is copied by name; the input is not changed. */
export function buildProtocol(input: ProtocolInput) {
  const factors = Object.fromEntries(
    FACTOR_IDS.map((id: FactorId) => [
      id,
      { label: FACTOR_LABELS[id], enabled: input.scoring.factors[id].enabled, weight: input.scoring.factors[id].weight },
    ]),
  ) as Record<FactorId, { label: string; enabled: boolean; weight: number }>;

  return {
    schema: PROTOCOL_SCHEMA,
    schemaVersion: PROTOCOL_SCHEMA_VERSION,
    app: { name: "Sourcly", version: input.appVersion },
    date: input.date.toISOString(),
    sources: [...input.sources],
    resultsPerSource: input.resultsPerSource,
    search: copySearch(input.main),
    counterSearch:
      input.counter === null
        ? null
        : { mode: input.counter.mode, terms: [...input.counter.terms], ...copySearch(input.counter) },
    filters: {
      yearFrom: input.filters.yearFrom,
      yearTo: input.filters.yearTo,
      levels: [...input.filters.levels],
      peerReview: [...input.filters.peerReview],
      openAccessOnly: input.filters.openAccessOnly,
    },
    ranking: {
      formula: "score = sum(weight * factor) / sum(weight), over the factors that are on; every factor is 0 to 1",
      relevance: `BM25 (k1 = ${BM25_K1}, b = ${BM25_B}) over title, abstract and author keywords of the merged results; concepts weigh 1.0, soft terms 0.3`,
      referenceYear: input.referenceYear,
      // How term coverage decides the order: "all" (all terms first, partial matches apart), "coverage" or "ignore".
      layout: {
        preferredLanguages: [...input.layout.preferredLanguages],
        showNonArticleTypes: input.layout.showNonArticleTypes,
        fewFullMatches: FEW_FULL_MATCHES,
      },
      recencyHalfLifeYears: input.scoring.recencyHalfLifeYears,
      preferredLevels: [...input.scoring.preferredLevels],
      factors,
    },
    saved: input.saved.map(({ title, doi, url }) => ({ title, doi, url })),
    notes: [
      "Sources update their data, so repeating this search later can give different results.",
      "This file contains no API key and no contact email.",
      "How scores are worked out is described in docs/methodology.md.",
    ],
  };
}

export type SearchProtocol = ReturnType<typeof buildProtocol>;

/** The protocol as indented JSON text with a final newline. */
export function protocolJson(protocol: SearchProtocol): string {
  return `${JSON.stringify(protocol, null, 2)}\n`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "sourcly-search-protocol-2026-10-14.json", from the date in the person's own time zone. */
export function protocolFileName(date: Date): string {
  return `sourcly-search-protocol-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** "sourcly-references-2026-10-14.txt". */
export function referencesFileName(date: Date): string {
  return `sourcly-references-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.txt`;
}
