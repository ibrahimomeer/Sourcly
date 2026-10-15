import {
  addSaved,
  buildProtocol,
  canSave,
  countLanguages,
  createSearchCache,
  defaultFilters,
  defaultScoringSettings,
  formatQuery,
  isSaved,
  isUsable,
  parseQuery,
  protocolJson,
  removeSaved,
  type LabelOverride,
  type Result,
  type SavedItem,
  type ProviderId,
  type ResultFilters,
  type ScoringSettings,
} from "@sourcly/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserStorage, loadApiKey, saveApiKey } from "./apiKey";
import type { SourclyConfig } from "./config";
import { Footer } from "./Footer";
import { CitationsPanel } from "./CitationsPanel";
import { CounterPanel } from "./CounterPanel";
import { Header } from "./Header";
import { rankResults, relatedFor, scoringContext } from "./pipeline";
import { ProtocolExport } from "./ProtocolExport";
import { protocolInputFrom, type CounterRecord } from "./protocolRecord";
import { createProviders, DEFAULT_PROVIDERS, skippedStatuses } from "./providers";
import { QueryChips } from "./QueryChips";
import { queryChipsModel } from "./chipsModel";
import { addTermToQuery, explainUnusable, prepareSearch } from "./queryText";
import { Results } from "./Results";
import { SavedProvider, type SavedApi } from "./SavedContext";
import { SavedPanel } from "./SavedPanel";
import { loadSavedList, persistSavedList } from "./savedStore";
import { SearchBox } from "./SearchBox";
import { DEFAULT_PER_SOURCE, toggleInList, withOverride } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
import { useDidYouMean } from "./useDidYouMean";
import { useSearch } from "./useSearch";
import { APP_VERSION } from "./version";

const REFERENCE_YEAR = new Date().getFullYear();

export function App({ config }: { config: SourclyConfig }) {
  const [scoring, setScoring] = useState<ScoringSettings>(defaultScoringSettings);
  const [filters, setFilters] = useState<ResultFilters>(defaultFilters);
  const [enabledProviders, setEnabledProviders] = useState<ProviderId[]>([...DEFAULT_PROVIDERS]);
  const [perSource, setPerSource] = useState(DEFAULT_PER_SOURCE);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, LabelOverride>>(() => new Map());
  const [page, setPage] = useState(1);
  const [queryText, setQueryText] = useState("");
  const [queryProblem, setQueryProblem] = useState<string | null>(null);
  // How the text is read. The text itself is never changed by any of this.
  const [ignoreCommon, setIgnoreCommon] = useState(true);
  const [restored, setRestored] = useState<ReadonlySet<string>>(() => new Set());
  const [leftOut, setLeftOut] = useState<ReadonlySet<string>>(() => new Set());

  const [storage] = useState(browserStorage);
  const [apiKey, setApiKey] = useState(() => loadApiKey(storage));
  const [keyIsStored, setKeyIsStored] = useState(true);

  // Sources the person saved to their list: kept in this browser's localStorage, and nowhere else.
  const [saved, setSaved] = useState<SavedItem[]>(() => loadSavedList(storage));
  const [savedIsStored, setSavedIsStored] = useState(true);
  useEffect(() => {
    setSavedIsStored(persistSavedList(storage, saved));
  }, [storage, saved]);
  // The counterargument search, once finished, for the search protocol.
  const [counterRecord, setCounterRecord] = useState<CounterRecord | null>(null);
  // The counterargument section starts as a small bar and opens when the person asks for it.
  const [counterOpen, setCounterOpen] = useState(false);
  // The three panels under the search box, each opened by a button in the toolbar.
  const [openPanels, setOpenPanels] = useState({ settings: false, saved: false, citations: false });
  const togglePanel = (name: keyof typeof openPanels) => setOpenPanels((current) => ({ ...current, [name]: !current[name] }));

  // This visit's memory of each source's answers. In memory only, gone when the page closes.
  const cache = useRef(createSearchCache());
  const { state, search } = useSearch();

  // Merges, ranks and filters instantly whenever a source answers or a setting changes;
  // it never contacts a source.
  const viewSettings = useMemo(() => ({ scoring, filters, overrides }), [scoring, filters, overrides]);
  const ranked = useMemo(
    () =>
      state.phase === "idle" ? null : rankResults(state.results, viewSettings, scoringContext(state, REFERENCE_YEAR)),
    [state, viewSettings],
  );

  // Suggested from the top results only; a suggestion never changes the query by itself.
  const related = useMemo(
    () => (state.phase === "idle" || ranked === null ? [] : relatedFor(ranked, state.terms)),
    [state, ranked],
  );

  // The languages of the results on the page, for the Language filter. Counted before filtering, so the list does not shrink as you choose.
  const languageOptions = useMemo(
    () => (state.phase === "idle" ? [] : countLanguages(state.results, filters.languages)),
    [state, filters.languages],
  );

  // "Did you mean ...?", only after a search that found few results with every word, and only as a link.
  const suggestion = useDidYouMean(state, ranked, config.contactEmail);

  const makeProviders = () =>
    createProviders(enabledProviders, { openAlexApiKey: apiKey, contactEmail: config.contactEmail });

  // Changing the text starts the reading afresh: restored and left-out words belong to the text they were chosen for.
  function changeQueryText(next: string) {
    setQueryText(next);
    setRestored(new Set());
    setLeftOut(new Set());
  }

  const interpretation = useMemo(
    () => parseQuery(queryText.trim(), { ignoreCommon, restored, excluded: leftOut }),
    [queryText, ignoreCommon, restored, leftOut],
  );
  const chipsModel = useMemo(
    () => queryChipsModel(interpretation, isUsable(interpretation) ? formatQuery(interpretation) : ""),
    [interpretation],
  );
  // The terms were changed after the last search of this same text, so the results are for the earlier terms.
  const needsSearch =
    state.phase !== "idle" &&
    state.parsed.exact !== true &&
    state.parsed.original === interpretation.original &&
    formatQuery(state.parsed) !== formatQuery(interpretation);

  function handleSearch(text: string, exact: boolean) {
    runSearch(text, exact ? { exact: true } : { ignoreCommon, restored, excluded: leftOut });
  }

  // The person chose the suggestion: it replaces the text, and the words are read afresh.
  function handleUseSuggestion(text: string) {
    const exact = state.phase !== "idle" && state.parsed.exact === true;
    changeQueryText(text);
    runSearch(text, exact ? { exact: true } : { ignoreCommon });
  }

  function runSearch(text: string, options: Parameters<typeof prepareSearch>[1]) {
    const prepared = prepareSearch(text, options);
    if (!prepared.usable) {
      setQueryProblem(explainUnusable(prepared.parsed));
      return;
    }
    setQueryProblem(null);
    const providers = makeProviders();
    if (providers.length === 0) return;
    // The text in the box is left exactly as typed.
    setPage(1);
    search(prepared.parsed, providers, { limit: perSource, cache: cache.current, skipped: skippedStatuses() });
  }

  function handleAddRelatedTerm(term: string) {
    changeQueryText(addTermToQuery(queryText, term));
    document.getElementById("query")?.focus();
  }

  function handleApiKeyChange(key: string) {
    setApiKey(key);
    setKeyIsStored(saveApiKey(storage, key));
  }

  const savedApi = useMemo<SavedApi>(
    () => ({
      isSaved: (id) => isSaved(saved, id),
      toggle: (result: Result) =>
        setSaved((current) =>
          isSaved(current, result.id) ? removeSaved(current, result.id) : addSaved(current, result, new Date()),
        ),
      canSave: canSave(saved),
    }),
    [saved],
  );

  const handleRecord = useCallback((record: CounterRecord | null) => setCounterRecord(record), []);

  // The search protocol for the search on the page, built only when its button is pressed.
  function buildProtocolText(date: Date): string {
    if (state.phase === "idle" || ranked === null) return "";
    return protocolJson(
      buildProtocol(
        protocolInputFrom({
          search: state,
          ranked,
          counter: counterRecord,
          perSource,
          filters,
          scoring,
          saved,
          referenceYear: REFERENCE_YEAR,
          appVersion: APP_VERSION,
          date,
        }),
      ),
    );
  }

  function handleOverrideChange(resultId: string, change: LabelOverride) {
    setOverrides((current) => withOverride(current, resultId, change));
  }

  function handlePageChange(next: number) {
    setPage(next);
    document.getElementById("results")?.scrollIntoView({ block: "start" });
  }

  return (
    <SavedProvider value={savedApi}>
    <div className={counterOpen && state.phase !== "idle" ? "page page-wide" : "page"}>
      <Header config={config} />
      <main>
        <div className="top">
          <SearchBox
            value={queryText}
            onChange={changeQueryText}
            onSearch={handleSearch}
            ignoreCommon={ignoreCommon}
            onIgnoreCommonChange={setIgnoreCommon}
          >
            {queryText.trim() !== "" && (
              <QueryChips
                model={chipsModel}
                onExclude={(key) => setLeftOut((current) => new Set(current).add(key))}
                onRestoreCommon={(word) => setRestored((current) => new Set(current).add(word))}
                onRestoreLeftOut={(key) =>
                  setLeftOut((current) => {
                    const next = new Set(current);
                    next.delete(key);
                    return next;
                  })
                }
                needsSearch={needsSearch}
              />
            )}
          </SearchBox>
          {queryProblem !== null && <p className="warning">{queryProblem}</p>}
          <p className="notice">
            Labels and rankings are heuristics based on metadata. Verify sources before citing.
          </p>
          {enabledProviders.length === 0 && (
            <p className="warning">No source is selected. Open Settings and choose at least one to search.</p>
          )}

          <div className="toolbar" role="group" aria-label="Settings, saved list and citations">
            <button
              type="button"
              className="settings-toggle"
              aria-expanded={openPanels.settings}
              aria-controls="settings-panel"
              onClick={() => togglePanel("settings")}
            >
              Settings
            </button>
            <button
              type="button"
              className="settings-toggle"
              aria-expanded={openPanels.saved}
              aria-controls="saved-panel"
              onClick={() => togglePanel("saved")}
            >
              Saved list ({saved.length})
            </button>
            <button
              type="button"
              className="settings-toggle"
              aria-expanded={openPanels.citations}
              aria-controls="citations-panel"
              onClick={() => togglePanel("citations")}
            >
              In-text citations
            </button>
          </div>

          <SettingsPanel
            open={openPanels.settings}
            scoring={scoring}
            onScoringChange={setScoring}
            filters={filters}
            onFiltersChange={setFilters}
            languageOptions={languageOptions}
            enabledProviders={enabledProviders}
            onToggleProvider={(id) => setEnabledProviders((current) => toggleInList(current, id))}
            perSource={perSource}
            onPerSourceChange={setPerSource}
            onClearCache={() => cache.current.clear()}
            apiKey={apiKey}
            onApiKeyChange={handleApiKeyChange}
            keyIsStored={keyIsStored}
          />
          <SavedPanel
            items={saved}
            onRemove={(id) => setSaved((current) => removeSaved(current, id))}
            onClear={() => setSaved([])}
            isStored={savedIsStored}
            libraryPrefix={config.libraryProxyPrefix}
            open={openPanels.saved}
          />
          <CitationsPanel items={saved} open={openPanels.citations} />
        </div>

        {/* Once a search has been made the counterargument section is a small bar above the results. Opened,
            it moves into a second column on wide screens and stays above the results on narrow ones. */}
        <div className={state.phase === "idle" ? "columns" : counterOpen ? "columns columns-two counter-open" : "columns columns-two"}>
          <div className="column">
            <Results
              state={state}
              ranked={ranked}
              page={page}
              onPageChange={handlePageChange}
              overrides={overrides}
              libraryPrefix={config.libraryProxyPrefix}
              librarySearchUrl={config.librarySearchUrl}
              onOverrideChange={handleOverrideChange}
              onClearFilters={() => setFilters(defaultFilters())}
              related={related}
              onAddRelatedTerm={handleAddRelatedTerm}
              exportSlot={<ProtocolExport build={buildProtocolText} />}
              termMatching={scoring.termMatching}
              suggestion={suggestion}
              onUseSuggestion={handleUseSuggestion}
            />
          </div>
          {state.phase !== "idle" && (
            <div className="column">
              <CounterPanel
                mainSearch={state}
                makeProviders={makeProviders}
                perSource={perSource}
                cache={cache.current}
                skipped={skippedStatuses()}
                view={viewSettings}
                referenceYear={REFERENCE_YEAR}
                overrides={overrides}
                libraryPrefix={config.libraryProxyPrefix}
                onOverrideChange={handleOverrideChange}
                onClearFilters={() => setFilters(defaultFilters())}
                onRecord={handleRecord}
                open={counterOpen}
                onToggle={() => setCounterOpen((current) => !current)}
              />
            </div>
          )}
        </div>
      </main>
      <Footer config={config} />
    </div>
    </SavedProvider>
  );
}
