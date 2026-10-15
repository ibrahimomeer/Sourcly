import type {
  ProtocolInput,
  ProtocolSearch,
  ProviderId,
  LayoutSettings,
  ResultFilters,
  SavedItem,
  ScoringSettings,
} from "@sourcly/core";
import { allResults, type RankedView } from "./pipeline";
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
  const merged = allResults(ranked).length;
  return {
    typedQuery: search.concepts.original,
    concepts: search.concepts,
    sentQueries: search.sent,
    statuses: orderedStatuses(search),
    fallbackPasses: (search.fallback?.passes ?? []).map((pass) => ({ dropped: pass.dropped, sentQueries: pass.sent, statuses: pass.statuses })),
    counts: {
      fetched: search.results.length,
      merged,
      shown: ranked.shown.length,
      partialMatches: ranked.partial.length,
      otherLanguages: ranked.otherLanguages.length,
      otherTypes: ranked.otherTypes.length,
      hiddenByFilters: ranked.hidden.length,
    },
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
  layout: LayoutSettings;
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
    layout: args.layout,
    saved: args.saved.map(({ result }) => ({ title: result.title, doi: result.doi, url: result.url })),
  };
}
