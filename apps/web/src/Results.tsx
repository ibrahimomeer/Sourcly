import type { LabelOverride, RelatedTerm, SpellingSuggestion, TermMatching } from "@sourcly/core";
import type { ReactNode } from "react";
import { describeOrder, fewResultsMessage, pluralize } from "./format";
import { Pagination } from "./Pagination";
import { PartialMatches } from "./PartialMatches";
import { paginate } from "./paginate";
import { hasFewFullMatches, type RankedView } from "./pipeline";
import { ProviderStatuses } from "./ProviderStatuses";
import { QueryNote } from "./QueryNote";
import { RelatedTerms } from "./RelatedTerms";
import { ResultCard } from "./ResultCard";
import { SearchElsewhere } from "./SearchElsewhere";
import type { SearchState } from "./searchState";

export function Results({
  state,
  ranked,
  page,
  onPageChange,
  overrides,
  libraryPrefix,
  librarySearchUrl,
  onOverrideChange,
  onClearFilters,
  related,
  onAddRelatedTerm,
  exportSlot,
  termMatching,
  suggestion,
  onUseSuggestion,
}: {
  state: SearchState;
  /** Null until a search has started. */
  ranked: RankedView | null;
  /** The page asked for, 1-based; it is moved into range if the list is shorter. */
  page: number;
  onPageChange: (page: number) => void;
  overrides: ReadonlyMap<string, LabelOverride>;
  /** config.libraryProxyPrefix; empty hides the library button on every card. */
  libraryPrefix: string;
  /** config.librarySearchUrl; empty hides the library link in "Search elsewhere". */
  librarySearchUrl: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  onClearFilters: () => void;
  /** Terms to suggest, from the top results. */
  related: readonly RelatedTerm[];
  onAddRelatedTerm: (term: string) => void;
  /** Shown under "Search elsewhere": the search protocol download. */
  exportSlot?: ReactNode;
  /** The Settings choice that decides how results lacking a search word are ordered or set apart. */
  termMatching: TermMatching;
  /** A "Did you mean ...?" for the search, or null. It is only a link: nothing changes until it is clicked. */
  suggestion: SpellingSuggestion | null;
  onUseSuggestion: (text: string) => void;
}) {
  if (state.phase === "idle" || ranked === null) {
    return (
      <section id="results" className="results" aria-label="Results" aria-live="polite">
        <p className="muted">Results will appear here.</p>
      </section>
    );
  }

  const searching = state.phase === "searching";
  const partialCount = ranked.partial.length;
  const total = ranked.shown.length + ranked.hidden.length + partialCount;
  const duplicates = state.results.length - total;
  const current = paginate(ranked.shown, page);
  const anyAnswered = state.statuses.some((status) => status.state === "ok");

  const pagination = (label: string) => (
    <Pagination page={current} shownOnPage={current.items.length} onPage={onPageChange} label={label} />
  );

  return (
    <section id="results" className="results" aria-label="Results" aria-live="polite">
      <ProviderStatuses search={state} />
      <QueryNote search={state} restorable />
      <SearchElsewhere query={state.query} librarySearchUrl={librarySearchUrl} />
      {exportSlot}

      {total === 0 && searching && <p>Searching for “{state.query}”…</p>}

      {total === 0 && !searching && (
        <p>
          {anyAnswered
            ? "No results came back from the sources that answered. Try different words."
            : "No source answered, so there are no results. The status above says why."}
        </p>
      )}

      {total > 0 && (
        <p className="summary">
          {ranked.hidden.length > 0
            ? `Showing ${ranked.shown.length + partialCount} of ${pluralize(total, "result")}`
            : pluralize(total, "result")}{" "}
          for “{state.query}”.
          {partialCount > 0 &&
            ` ${ranked.shown.length} contain every term and ${ranked.shown.length === 1 ? "is" : "are"} listed below, sorted by score; ${partialCount} ${partialCount === 1 ? "is a partial match, kept" : "are partial matches, kept"} apart under “Partial matches”.`}
          {partialCount === 0 && ` ${describeOrder(termMatching)}`}
          {searching && " More are still arriving, and the order may change as they do."}
          {duplicates > 0 &&
            ` ${pluralize(duplicates, "duplicate")} across sources ${duplicates === 1 ? "was" : "were"} merged, and each result lists every source that found it.`}
          {ranked.hidden.length > 0 && (
            <>
              {" "}
              {pluralize(ranked.hidden.length, "result")} hidden by your filters.{" "}
              <button type="button" className="link-button" onClick={onClearFilters}>
                Clear filters
              </button>
            </>
          )}
        </p>
      )}

      {!searching && anyAnswered && hasFewFullMatches(ranked) && (
        <div className="few-results" role="status">
          {total > 0 && <p>{fewResultsMessage(termMatching)}</p>}
          {suggestion !== null && (
            <p className="did-you-mean">
              Did you mean{" "}
              <button type="button" className="link-button" onClick={() => onUseSuggestion(suggestion.text)}>
                {suggestion.text}
              </button>
              ? <span className="muted">PubMed’s spell checker suggests {suggestion.changes.map((change) => `“${change.to}” for “${change.from}”`).join(", ")}. Nothing is changed unless you click.</span>
            </p>
          )}
        </div>
      )}

      {ranked.shown.length === 0 && partialCount === 0 && ranked.hidden.length > 0 && <p>Every result is hidden by your filters.</p>}
      {ranked.shown.length === 0 && partialCount > 0 && !searching && (
        <p>
          <strong>No result contains every term of your search.</strong> The partial matches are listed under “Partial
          matches” below, each with what it matched.
        </p>
      )}

      <RelatedTerms terms={related} onAdd={onAddRelatedTerm} />

      {pagination("Pages (top)")}
      <ol className="result-list" start={current.offset + 1}>
        {current.items.map((scored, index) => (
          <li key={scored.result.id}>
            <ResultCard
              position={current.offset + index + 1}
              scored={scored}
              override={overrides.get(scored.result.id)}
              libraryPrefix={libraryPrefix}
              onOverrideChange={onOverrideChange}
            />
          </li>
        ))}
      </ol>
      {pagination("Pages (bottom)")}

      <PartialMatches
        items={ranked.partial}
        overrides={overrides}
        libraryPrefix={libraryPrefix}
        onOverrideChange={onOverrideChange}
      />
    </section>
  );
}
