import type { LabelOverride } from "@sourcly/core";
import { pluralize } from "./format";
import type { RankedView } from "./pipeline";
import { ProviderStatuses } from "./ProviderStatuses";
import { ResultCard } from "./ResultCard";
import type { SearchState } from "./useSearch";

export function Results({
  state,
  ranked,
  overrides,
  libraryPrefix,
  onOverrideChange,
  onClearFilters,
}: {
  state: SearchState;
  /** Null until a search has finished. */
  ranked: RankedView | null;
  overrides: ReadonlyMap<string, LabelOverride>;
  /** config.libraryProxyPrefix; empty hides the library button on every card. */
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  onClearFilters: () => void;
}) {
  return (
    <section className="results" aria-label="Results" aria-live="polite">
      {state.phase === "idle" && <p className="muted">Results will appear here.</p>}

      {state.phase === "searching" && <p>Searching for “{state.query}”…</p>}

      {state.phase === "done" && ranked !== null && (
        <>
          <ProviderStatuses statuses={state.statuses} />

          {state.results.length === 0 ? (
            state.statuses.some((status) => status.state === "ok") ? (
              <p>No results came back from the sources that answered. Try different words.</p>
            ) : (
              <p>No source answered, so there are no results. The status above says why.</p>
            )
          ) : (
            <p className="summary">
              {ranked.hidden.length === 0
                ? `${pluralize(ranked.shown.length, "result")} for “${state.query}”, sorted by score.`
                : `Showing ${ranked.shown.length} of ${pluralize(state.results.length, "result")} for “${state.query}”, sorted by score. `}
              {ranked.hidden.length > 0 && (
                <>
                  {pluralize(ranked.hidden.length, "result")} hidden by your filters.{" "}
                  <button type="button" className="link-button" onClick={onClearFilters}>
                    Clear filters
                  </button>
                </>
              )}
            </p>
          )}

          {ranked.shown.length === 0 && ranked.hidden.length > 0 && (
            <p>Every result is hidden by your filters.</p>
          )}

          <ol className="result-list">
            {ranked.shown.map((scored, index) => (
              <li key={scored.result.id}>
                <ResultCard
                  position={index + 1}
                  scored={scored}
                  override={overrides.get(scored.result.id)}
                  libraryPrefix={libraryPrefix}
                  onOverrideChange={onOverrideChange}
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
