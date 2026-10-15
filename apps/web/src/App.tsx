import {
  addSaved,
  buildProtocol,
  canSave,
  createSearchCache,
  defaultFilters,
  defaultScoringSettings,
  isSaved,
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
import { CounterPanel } from "./CounterPanel";
import { Header } from "./Header";
import { rankResults, relatedFor, scoringContext } from "./pipeline";
import { ProtocolExport } from "./ProtocolExport";
import { protocolInputFrom, type CounterRecord } from "./protocolRecord";
import { createProviders, DEFAULT_PROVIDERS, skippedStatuses } from "./providers";
import { addTermToQuery, explainUnusable, prepareSearch } from "./queryText";
import { Results } from "./Results";
import { SavedProvider, type SavedApi } from "./SavedContext";
import { SavedPanel } from "./SavedPanel";
import { loadSavedList, persistSavedList } from "./savedStore";
import { SearchBox } from "./SearchBox";
import { DEFAULT_PER_SOURCE, toggleInList, withOverride } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
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

  const makeProviders = () =>
    createProviders(enabledProviders, { openAlexApiKey: apiKey, contactEmail: config.contactEmail });

  function handleSearch(text: string) {
    const prepared = prepareSearch(text);
    if (!prepared.usable) {
      setQueryProblem(explainUnusable(prepared.parsed));
      return;
    }
    setQueryProblem(null);
    const providers = makeProviders();
    if (providers.length === 0) return;
    // Show what is being searched: for a question, the keywords it was reduced to.
    setQueryText(prepared.box);
    setPage(1);
    search(prepared.parsed, providers, { limit: perSource, cache: cache.current, skipped: skippedStatuses() });
  }

  function handleAddRelatedTerm(term: string) {
    setQueryText((current) => addTermToQuery(current, term));
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
    <div className="page">
      <Header config={config} />
      <main>
        <div className="top">
          <SearchBox value={queryText} onChange={setQueryText} onSearch={handleSearch} />
          {queryProblem !== null && <p className="warning">{queryProblem}</p>}
          <p className="notice">
            Labels and rankings are heuristics based on metadata. Verify sources before citing.
          </p>
          {enabledProviders.length === 0 && (
            <p className="warning">No source is selected. Open Settings and choose at least one to search.</p>
          )}

          <SettingsPanel
            scoring={scoring}
            onScoringChange={setScoring}
            filters={filters}
            onFiltersChange={setFilters}
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
          />
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
