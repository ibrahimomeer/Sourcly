import {
  DEFAULT_COUNTER_TERMS,
  counterQuery,
  type LabelOverride,
  type ParsedQuery,
  type Provider,
  type ProviderStatus,
  type SearchCache,
  type TermMatching,
} from "@sourcly/core";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { COUNTER_VIEWS, countViews, selectView, type CounterView } from "./counterView";
import { CounterTerms } from "./CounterTerms";
import { describeOrder, pluralize } from "./format";
import { Pagination } from "./Pagination";
import { PartialMatches } from "./PartialMatches";
import { paginate } from "./paginate";
import { rankResults, scoringContext, type ViewSettings } from "./pipeline";
import { ProviderStatuses } from "./ProviderStatuses";
import type { CounterRecord } from "./protocolRecord";
import { QueryNote } from "./QueryNote";
import { explainUnusable, prepareSearch } from "./queryText";
import { ResultCard } from "./ResultCard";
import type { ActiveSearch } from "./searchState";
import { useSearch } from "./useSearch";

type Mode = "lexicon" | "own";

export const COUNTER_NOTICE =
  "Keyword-based: this finds sources that discuss limitations or criticism. It cannot tell whether a source actually disagrees. Read before citing.";

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((term, i) => term === b[i]);

/**
 * "Counterarguments & limitations": a second search that looks for sources discussing limits,
 * criticism or corrections of the topic. It runs only when asked, because it sends another round
 * of requests to the sources. The results are ranked, labelled and explained exactly like the main
 * ones, with the matched words marked.
 */
export function CounterPanel({
  mainSearch,
  makeProviders,
  perSource,
  cache,
  skipped,
  view,
  referenceYear,
  overrides,
  libraryPrefix,
  onOverrideChange,
  onClearFilters,
  onRecord,
  open,
  onToggle,
}: {
  /** The main search this panel is about. */
  mainSearch: ActiveSearch;
  makeProviders: () => Provider[];
  perSource: number;
  cache: SearchCache;
  skipped: ProviderStatus[];
  view: ViewSettings;
  referenceYear: number;
  overrides: ReadonlyMap<string, LabelOverride>;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  onClearFilters: () => void;
  /** Told about the finished counterargument search (or null when there is none), for the search protocol. */
  onRecord: (record: CounterRecord | null) => void;
  /** Whether the panel is open. Closed, it is a small bar: the heading, the notice and an Open button. */
  open: boolean;
  onToggle: () => void;
}) {
  const { state, search, reset } = useSearch();
  const [terms, setTerms] = useState<string[]>(() => [...DEFAULT_COUNTER_TERMS]);
  const [mode, setMode] = useState<Mode>("lexicon");
  const [ownText, setOwnText] = useState("");
  const [ownProblem, setOwnProblem] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [panelView, setPanelView] = useState<CounterView>("all");
  // What the last search was run with. Ranking and highlighting use this, not the box as it is now,
  // so editing the terms never changes results that were fetched for the old ones.
  const [searched, setSearched] = useState<{ terms: string[]; lexicon: boolean } | null>(null);

  // A new main search makes the old counterargument results out of date, so they are cleared.
  // The terms and your own search text stay.
  useEffect(() => {
    reset();
    setSearched(null);
    setPage(1);
    setPanelView("all");
  }, [mainSearch.id, reset]);

  const ranked = useMemo(
    () =>
      state.phase === "idle"
        ? null
        : rankResults(
            state.results,
            view,
            scoringContext(state, referenceYear, searched?.lexicon === true ? searched.terms : undefined),
          ),
    [state, view, referenceYear, searched],
  );

  // The protocol records a counterargument search only once it has finished.
  useEffect(() => {
    onRecord(
      state.phase === "done" && ranked !== null && searched !== null
        ? { search: state, ranked, mode: searched.lexicon ? "terms" : "own", terms: searched.terms }
        : null,
    );
  }, [state, ranked, searched, onRecord]);

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsed: ParsedQuery;
    if (mode === "lexicon") {
      if (terms.length === 0) return;
      parsed = counterQuery(mainSearch.parsed, terms);
    } else {
      const prepared = prepareSearch(ownText);
      if (!prepared.usable) {
        setOwnProblem(explainUnusable(prepared.parsed));
        return;
      }
      setOwnProblem(null);
      // The text in the box is left as typed; the common words not used are listed under the results.
      parsed = prepared.parsed;
    }
    const providers = makeProviders();
    if (providers.length === 0) return;
    setPage(1);
    setPanelView("all");
    setSearched({ terms: [...terms], lexicon: mode === "lexicon" });
    search(parsed, providers, { limit: perSource, cache, skipped });
  }

  const canSearch = mode === "lexicon" ? terms.length > 0 : ownText.trim() !== "";

  const found = ranked === null ? 0 : ranked.shown.length + ranked.hidden.length;

  return (
    <section className={open ? "counter counter-open" : "counter"} aria-labelledby="counter-heading">
      <div className="counter-head">
        <h2 id="counter-heading">Counterarguments &amp; limitations</h2>
        <button
          type="button"
          className="settings-toggle"
          aria-expanded={open}
          aria-controls="counter-body"
          aria-label={open ? "Close counterarguments and limitations" : "Open counterarguments and limitations"}
          onClick={onToggle}
        >
          {open ? "Close" : "Open"}
        </button>
      </div>
      <p className="counter-notice" role="note">
        {COUNTER_NOTICE}
      </p>
      {!open && found > 0 && (
        <p className="muted counter-summary">
          Your last counterargument search found {pluralize(found, "result")}. Open this section to see them.
        </p>
      )}

      {/* Hidden, not removed, so the terms, the search and its results survive closing the section. */}
      <div id="counter-body" className="counter-body" hidden={!open}>
        <p className="muted">
          This runs a second search, so it sends another round of requests to the sources and only runs when you press the
          button. Results are ranked and explained like the ones beside it, and the words that matched are marked in the
          title and abstract. Reviews and meta-analyses, and retraction and correction notices, can be listed on their own
          with the buttons above the results.
        </p>

        <form onSubmit={runSearch}>
          <fieldset className="counter-mode">
            <legend className="visually-hidden">What to search for</legend>
            <label className="check">
              <input type="radio" name="counter-mode" checked={mode === "lexicon"} onChange={() => setMode("lexicon")} />
              <span>
                Your search, narrowed to results that also mention <strong>any</strong> of the terms below
              </span>
            </label>
            <label className="check">
              <input type="radio" name="counter-mode" checked={mode === "own"} onChange={() => setMode("own")} />
              <span>Only my own search, for example a claim that opposes yours</span>
            </label>
            {mode === "own" && (
              <div className="field-row">
                <label htmlFor="counter-own">Your own search</label>
                <input
                  id="counter-own"
                  type="search"
                  value={ownText}
                  autoComplete="off"
                  placeholder="same rules as the main search box"
                  onChange={(event) => setOwnText(event.target.value)}
                />
              </div>
            )}
            {mode === "own" && (
              <p className="muted own-hint">
                Common words are removed here too, including “not” and “does”, so a sentence loses its meaning. Write the claim
                as keywords (for example <code>hydroxychloroquine ineffective</code>), and use quotes for an exact phrase.
              </p>
            )}
            {mode === "own" && ownProblem !== null && (
              <p className="warning" role="alert">
                {ownProblem}
              </p>
            )}
          </fieldset>

          <p className="terms-label">
            <strong>Terms.</strong>{" "}
            {mode === "lexicon"
              ? "A result needs to match your search and at least one of these. They are matched as whole words, with their plurals."
              : "Not part of your own search. These words are only marked in the results."}
          </p>
          <CounterTerms
            terms={terms}
            onChange={setTerms}
            onReset={() => setTerms([...DEFAULT_COUNTER_TERMS])}
            isDefault={sameList(terms, DEFAULT_COUNTER_TERMS)}
          />
          {searched !== null && !sameList(terms, searched.terms) && (
            <p className="muted">The terms above have changed since this search. Press the button to search with them.</p>
          )}

          <button type="submit" disabled={!canSearch}>
            Search for counterarguments
          </button>
        </form>

        {state.phase !== "idle" && ranked !== null && (
          <CounterResults
            state={state}
            ranked={ranked}
            terms={searched?.terms ?? []}
            page={page}
            onPageChange={(next) => {
              setPage(next);
              document.getElementById("counter-results")?.scrollIntoView({ block: "start" });
            }}
            panelView={panelView}
            onPanelViewChange={(next) => {
              setPanelView(next);
              setPage(1);
            }}
            overrides={overrides}
            libraryPrefix={libraryPrefix}
            onOverrideChange={onOverrideChange}
            onClearFilters={onClearFilters}
            usedLexicon={searched?.lexicon === true}
            termMatching={view.scoring.termMatching}
          />
        )}
      </div>
    </section>
  );
}

function CounterResults({
  state,
  ranked,
  terms,
  page,
  onPageChange,
  panelView,
  onPanelViewChange,
  overrides,
  libraryPrefix,
  onOverrideChange,
  onClearFilters,
  usedLexicon,
  termMatching,
}: {
  state: ActiveSearch;
  ranked: ReturnType<typeof rankResults>;
  terms: readonly string[];
  page: number;
  onPageChange: (page: number) => void;
  panelView: CounterView;
  onPanelViewChange: (view: CounterView) => void;
  overrides: ReadonlyMap<string, LabelOverride>;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  onClearFilters: () => void;
  usedLexicon: boolean;
  termMatching: TermMatching;
}) {
  const searching = state.phase === "searching";
  const total = ranked.shown.length + ranked.hidden.length + ranked.partial.length;
  const counts = countViews(ranked.shown);
  const list = selectView(ranked.shown, panelView);
  const current = paginate(list, page);
  const anyAnswered = state.statuses.some((status) => status.state === "ok");
  const pagination = (label: string) => (
    <Pagination page={current} shownOnPage={current.items.length} onPage={onPageChange} label={label} />
  );

  return (
    <div id="counter-results" className="counter-results" aria-live="polite">
      <ProviderStatuses search={state} />
      <QueryNote search={state} />

      {total === 0 && searching && <p>Searching…</p>}
      {total === 0 && !searching && (
        <p>
          {anyAnswered
            ? "No results came back from the sources that answered. Try removing a term, or use your own search."
            : "No source answered, so there are no results. The status above says why."}
        </p>
      )}

      {total > 0 && (
        <>
          <p className="summary">
            {pluralize(total, "result")} {usedLexicon ? "for your search plus the terms above" : "for your own search"}.
            {ranked.partial.length > 0
              ? ` ${ranked.shown.length} contain every term of your search and ${ranked.shown.length === 1 ? "is" : "are"} sorted by score; ${ranked.partial.length} ${ranked.partial.length === 1 ? "is a partial match, kept" : "are partial matches, kept"} apart under “Partial matches”.`
              : ` ${describeOrder(termMatching)}`}
            {usedLexicon &&
              " Sources that cannot ask for “any of these terms” were sent only your search (see the exact queries above), so some of their results contain none of the terms and rank lower."}
            {searching && " More are still arriving, and the order may change as they do."}
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
          <div className="view-switch" role="group" aria-label="Which results to list">
            {COUNTER_VIEWS.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={panelView === id} onClick={() => onPanelViewChange(id)}>
                {label} ({counts[id]})
              </button>
            ))}
          </div>
          {list.length === 0 && <p>None of these results is in this group.</p>}
        </>
      )}

      {pagination("Counterargument pages (top)")}
      <ol className="result-list" start={current.offset + 1}>
        {current.items.map((scored, index) => (
          <li key={scored.result.id}>
            <ResultCard
              position={current.offset + index + 1}
              scored={scored}
              override={overrides.get(scored.result.id)}
              libraryPrefix={libraryPrefix}
              onOverrideChange={onOverrideChange}
              highlight={terms}
            />
          </li>
        ))}
      </ol>
      {pagination("Counterargument pages (bottom)")}
      <PartialMatches
        items={ranked.partial}
        overrides={overrides}
        libraryPrefix={libraryPrefix}
        onOverrideChange={onOverrideChange}
        highlight={terms}
      />
    </div>
  );
}
