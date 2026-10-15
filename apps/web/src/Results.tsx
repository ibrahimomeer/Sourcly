import type { LabelOverride, RelatedTerm, TypoSuggestion } from "@sourcly/core";
import type { ReactNode } from "react";
import { fewResultsMessage, ORDER_SENTENCE, pluralize } from "./format";
import { Pagination } from "./Pagination";
import { paginate } from "./paginate";
import { allResults, hasFewFullMatches, type RankedView } from "./pipeline";
import { ProviderStatuses } from "./ProviderStatuses";
import { QueryNote } from "./QueryNote";
import { RelatedTerms } from "./RelatedTerms";
import { ResultCard } from "./ResultCard";
import { SearchElsewhere } from "./SearchElsewhere";
import { isSearching, type SearchState } from "./searchState";
import { ResultSections } from "./ResultSections";

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
  /** A "Did you mean ...?" for the search, or null. It is only a link: nothing changes until it is clicked. */
  suggestion: TypoSuggestion | null;
  onUseSuggestion: (text: string) => void;
}) {
  if (state.phase === "idle" || ranked === null) {
    return (
      <section id="results" className="results" aria-label="Results" aria-live="polite">
        <p className="muted">Results will appear here.</p>
      </section>
    );
  }

  const searching = isSearching(state);
  const sectioned = ranked.partial.length + ranked.otherLanguages.length + ranked.otherTypes.length;
  const total = allResults(ranked).length;
  const duplicates = state.results.length - total;
  const current = paginate(ranked.shown, page);
  const anyAnswered = state.statuses.some((status) => status.state === "ok");
  const few = !searching && anyAnswered && hasFewFullMatches(ranked);

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
            ? `Showing ${total - ranked.hidden.length} of ${pluralize(total, "result")}`
            : pluralize(total, "result")}{" "}
          for “{state.query}”. {pluralize(ranked.shown.length, "result")} {ranked.shown.length === 1 ? "is" : "are"} in the main list.
          {sectioned > 0 &&
            ` ${sectioned} ${sectioned === 1 ? "is" : "are"} kept apart in the collapsed sections below the list (${[
              ranked.partial.length > 0 ? `${ranked.partial.length} partial matches` : "",
              ranked.otherLanguages.length > 0 ? `${ranked.otherLanguages.length} in other languages` : "",
              ranked.otherTypes.length > 0 ? `${ranked.otherTypes.length} datasets and other types` : "",
            ]
              .filter((part) => part !== "")
              .join(", ")}); nothing is removed.`}
          {` ${ORDER_SENTENCE}`}
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

      {(few || suggestion !== null) && (
        <div className="few-results" role="status">
          {few && total > 0 && <p>{fewResultsMessage()}</p>}
          {suggestion !== null && (
            <p className="did-you-mean">
              Did you mean{" "}
              <button type="button" className="link-button" onClick={() => onUseSuggestion(suggestion.text)}>
                {suggestion.text}
              </button>
              ?{" "}
              <span className="muted">
                {suggestion.changes
                  .map((change) => `“${change.from}” is in ${pluralize(change.resultsWithFrom, "result")}, “${change.to}” in ${change.resultsWithTo}`)
                  .join("; ")}
                . Nothing is changed unless you click.
              </span>
            </p>
          )}
        </div>
      )}

      {ranked.shown.length === 0 && sectioned === 0 && ranked.hidden.length > 0 && <p>Every result is hidden by your filters.</p>}
      {ranked.shown.length === 0 && sectioned > 0 && !searching && (
        <p>
          <strong>Nothing is in the main list.</strong> The results are listed in the collapsed sections below, each with what it
          matched.
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
              section="main"
            />
          </li>
        ))}
      </ol>
      {pagination("Pages (bottom)")}

      <ResultSections ranked={ranked} overrides={overrides} libraryPrefix={libraryPrefix} onOverrideChange={onOverrideChange} />
    </section>
  );
}
