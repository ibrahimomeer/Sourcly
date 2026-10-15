import type {
  ProtocolInput,
  ProtocolSearch,
  ProviderId,
  ResultFilters,
  SavedItem,
  ScoringSettings,
} from "@sourcly/core";
import type { RankedView } from "./pipeline";
import { droppedWords } from "./queryText";
import { orderedStatuses, type ActiveSearch } from "./searchState";

/** A finished counterargument search, as the protocol needs to know it. */
export interface CounterRecord {
  search: ActiveSearch;
  ranked: RankedView;
  /** "terms": the main search narrowed by terms. "own": a search the person wrote. */
  mode: "terms" | "own";
  /** The terms in the list when it was run (in "own" mode they were only highlighted). */
  terms: string[];
}

/** What one search did: the query, what each source received, how each answered, and how many results. */
export function searchRecord(search: ActiveSearch, ranked: RankedView): ProtocolSearch {
  const merged = ranked.shown.length + ranked.hidden.length;
  return {
    typedQuery: search.parsed.original,
    searchedQuery: search.query,
    commonWordsRemoved: droppedWords(search.parsed),
    sentQueries: search.sent,
    statuses: orderedStatuses(search),
    counts: { fetched: search.results.length, merged, shown: ranked.shown.length, hiddenByFilters: ranked.hidden.length },
  };
}

/** Everything the search protocol records, gathered from the page's state. */
export function protocolInputFrom(args: {
  search: ActiveSearch;
  ranked: RankedView;
  counter: CounterRecord | null;
  perSource: number;
  filters: ResultFilters;
  scoring: ScoringSettings;
  saved: readonly SavedItem[];
  referenceYear: number;
  appVersion: string;
  date: Date;
}): ProtocolInput {
  // The sources that were actually asked, in the order they were asked. Skipped ones show up in the statuses.
  const sources: ProviderId[] = [...args.search.order];
  return {
    appVersion: args.appVersion,
    date: args.date,
    referenceYear: args.referenceYear,
    main: searchRecord(args.search, args.ranked),
    counter:
      args.counter === null
        ? null
        : { ...searchRecord(args.counter.search, args.counter.ranked), mode: args.counter.mode, terms: [...args.counter.terms] },
    sources,
    resultsPerSource: args.perSource,
    filters: args.filters,
    scoring: args.scoring,
    saved: args.saved.map(({ result }) => ({ title: result.title, doi: result.doi, url: result.url })),
  };
}
