import type { LabelOverride } from "@sourcly/core";
import { pluralize } from "./format";
import { Pagination } from "./Pagination";
import { paginate } from "./paginate";
import type { RankedView } from "./pipeline";
import { ProviderStatuses } from "./ProviderStatuses";
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
}) {
  if (state.phase === "idle" || ranked === null) {
    return (
      <section id="results" className="results" aria-label="Results" aria-live="polite">
        <p className="muted">Results will appear here.</p>
      </section>
    );
  }

  const searching = state.phase === "searching";
  const total = ranked.shown.length + ranked.hidden.length;
  const duplicates = state.results.length - total;
  const current = paginate(ranked.shown, page);
  const anyAnswered = state.statuses.some((status) => status.state === "ok");

  const pagination = (label: string) => (
    <Pagination page={current} shownOnPage={current.items.length} onPage={onPageChange} label={label} />
  );

  return (
    <section id="results" className="results" aria-label="Results" aria-live="polite">
      <ProviderStatuses search={state} />
      <SearchElsewhere query={state.query} librarySearchUrl={librarySearchUrl} />

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
            ? `Showing ${ranked.shown.length} of ${pluralize(total, "result")}`
            : pluralize(total, "result")}{" "}
          for “{state.query}”, sorted by score.
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

      {ranked.shown.length === 0 && ranked.hidden.length > 0 && <p>Every result is hidden by your filters.</p>}

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
    </section>
  );
}
