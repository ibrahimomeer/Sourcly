import {
  addSaved,
  buildProtocol,
  canSave,
  countLanguages,
  createSearchCache,
  defaultFilters,
  defaultLayoutSettings,
  defaultScoringSettings,
  describeInput,
  createOpenAlexCounter,
  hardBlocks,
  isSaved,
  parseInput,
  protocolJson,
  removeSaved,
  suggestTypos,
  type LabelOverride,
  type LayoutSettings,
  type Result,
  type SavedItem,
  type ProviderId,
  type ResultFilters,
  type ScoringSettings,
  type Counter,
} from "@sourcly/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserStorage, loadApiKey, saveApiKey } from "./apiKey";
import type { SourclyConfig } from "./config";
import { Footer } from "./Footer";
import { CitationsPanel } from "./CitationsPanel";
import { CounterPanel } from "./CounterPanel";
import { Header } from "./Header";
import { allResults, hasFewFullMatches, rankResults, scoringContext, suggestedFor } from "./pipeline";
import { ClosestMatch, LookupPanel } from "./LookupPanel";
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
import { SuggestedTerms } from "./SuggestedTerms";
import { useLookup, useTitleMatch, type LookupTarget } from "./useLookup";
import { isSearching } from "./searchState";
import { useSearch } from "./useSearch";
import { APP_VERSION } from "./version";

const REFERENCE_YEAR = new Date().getFullYear();

export function App({ config }: { config: SourclyConfig }) {
  const [scoring, setScoring] = useState<ScoringSettings>(defaultScoringSettings);
  const [filters, setFilters] = useState<ResultFilters>(defaultFilters);
  const [layout, setLayout] = useState<LayoutSettings>(defaultLayoutSettings);
  const [enabledProviders, setEnabledProviders] = useState<ProviderId[]>([...DEFAULT_PROVIDERS]);
  const [perSource, setPerSource] = useState(DEFAULT_PER_SOURCE);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, LabelOverride>>(() => new Map());
  const [page, setPage] = useState(1);
  const [queryText, setQueryText] = useState("");
  const [queryProblem, setQueryProblem] = useState<string | null>(null);
  // How the text is read (Settings). The text itself is never changed by any of this.
  const [exact, setExact] = useState(false);
  const [synonyms, setSynonyms] = useState(true);

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
  const { state, search, fallback, reset } = useSearch();
  const lookupContext = { contactEmail: config.contactEmail, openAlexApiKey: apiKey };
  const lookup = useLookup(lookupContext);
  const titleMatch = useTitleMatch(lookupContext);
  // The person asked for the text to be searched as keywords although it looks like a DOI, a link, an ID or a title.
  const [asKeywords, setAsKeywords] = useState(false);

  // Merges, ranks and filters instantly whenever a source answers or a setting changes;
  // it never contacts a source.
  const viewSettings = useMemo(() => ({ scoring, filters, overrides, layout }), [scoring, filters, overrides, layout]);
  const ranked = useMemo(
    () =>
      state.phase === "idle" ? null : rankResults(state.results, viewSettings, scoringContext(state, REFERENCE_YEAR)),
    [state, viewSettings],
  );

  // Suggested from the best results only; a suggestion never changes the query by itself.
  const suggested = useMemo(
    () => (state.phase === "idle" || ranked === null || isSearching(state) ? [] : suggestedFor(ranked, state.concepts)),
    [state, ranked],
  );

  // The languages of the results on the page, for the preferred languages in Settings. Counted over every result, so the list does not shrink as you choose.
  const languageOptions = useMemo(
    () => (state.phase === "idle" ? [] : countLanguages(state.results, layout.preferredLanguages)),
    [state, layout.preferredLanguages],
  );

  // "Did you mean ...?", worked out only from the results that came back, and only a link.
  const suggestion = useMemo(
    () => (state.phase === "idle" || ranked === null ? null : suggestTypos(state.concepts, allResults(ranked).map((scored) => scored.result))),
    [state, ranked],
  );

  // When the strict first pass is done and fewer than 15 results match every concept, the fallback passes run by themselves, once.
  const providersRef = useRef<() => ReturnType<typeof createProviders>>(() => []);
  const countRef = useRef<() => Counter | undefined>(() => undefined);
  useEffect(() => {
    if (state.phase !== "done" || state.fallback !== null || ranked === null || state.concepts.exact) return;
    if (hardBlocks(state.concepts).length < 2 || !hasFewFullMatches(ranked)) return;
    const providers = providersRef.current();
    if (providers.length === 0) return;
    const count = countRef.current();
    fallback(providers, { limit: perSource, cache: cache.current, skipped: [], ...(count === undefined ? {} : { count }) });
  }, [state, ranked, fallback, perSource]);

  const makeProviders = () =>
    createProviders(enabledProviders, { openAlexApiKey: apiKey, contactEmail: config.contactEmail });
  providersRef.current = makeProviders;
  // Concepts are counted in OpenAlex only when the person has it switched on.
  countRef.current = () => (enabledProviders.includes("openalex") ? createOpenAlexCounter({ apiKey }) : undefined);

  function changeQueryText(next: string) {
    setQueryText(next);
    setAsKeywords(false);
  }

  // What the text looks like: keywords, or a DOI, a link, an ID or a title. The text itself is never changed.
  const detected = useMemo(() => parseInput(queryText), [queryText]);
  const lookupTarget: LookupTarget | null =
    asKeywords || detected.kind === "keywords" || detected.kind === "title" ? null : detected;

  function handleSearch(text: string) {
    // A DOI, a link or an ID names one work: look it up instead of searching for its characters.
    if (lookupTarget !== null) {
      setQueryProblem(null);
      reset();
      titleMatch.clear();
      lookup.run(lookupTarget, text);
      return;
    }
    runSearch(text);
  }

  // The person chose the suggestion: it replaces the text, and the words are read afresh.
  function handleUseSuggestion(text: string) {
    changeQueryText(text);
    runSearch(text);
  }

  function runSearch(text: string) {
    const prepared = prepareSearch(text, { exact, synonyms });
    if (!prepared.usable) {
      setQueryProblem(explainUnusable(prepared.concepts));
      return;
    }
    setQueryProblem(null);
    const providers = makeProviders();
    if (providers.length === 0) return;
    // The text in the box is left exactly as typed.
    setPage(1);
    lookup.clear();
    search(prepared.concepts, providers, { limit: perSource, cache: cache.current, skipped: skippedStatuses() });
    // A long title also gets its closest match, shown above the results.
    const title = parseInput(text);
    if (title.kind === "title" && !asKeywords) titleMatch.run(title.title);
    else titleMatch.clear();
  }

  function handleAddSuggestedTerm(term: string) {
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
          layout,
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
          <SearchBox value={queryText} onChange={changeQueryText} onSearch={handleSearch}>
            {queryText.trim() !== "" && detected.kind !== "keywords" && (
              <p className="detected" role="status">
                {lookupTarget !== null ? (
                  <>
                    Detected: <strong>{describeInput(detected)}</strong>. Pressing Search looks it up.{" "}
                    <button type="button" className="link-button" onClick={() => setAsKeywords(true)}>
                      Search as keywords instead
                    </button>
                  </>
                ) : asKeywords ? (
                  <>
                    Searching as keywords.{" "}
                    <button type="button" className="link-button" onClick={() => setAsKeywords(false)}>
                      {detected.kind === "title" ? "Show the closest match for this title too" : `Look it up as a ${describeInput(detected)} instead`}
                    </button>
                  </>
                ) : (
                  <>
                    Detected: <strong>a title</strong>. The closest match is shown above the results.{" "}
                    <button type="button" className="link-button" onClick={() => setAsKeywords(true)}>
                      Search as keywords only
                    </button>
                  </>
                )}
              </p>
            )}
            {lookupTarget === null && <SuggestedTerms terms={suggested} onAdd={handleAddSuggestedTerm} />}
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
            config={config}
            open={openPanels.settings}
            scoring={scoring}
            onScoringChange={setScoring}
            filters={filters}
            onFiltersChange={setFilters}
            layout={layout}
            onLayoutChange={setLayout}
            languageOptions={languageOptions}
            enabledProviders={enabledProviders}
            onToggleProvider={(id) => setEnabledProviders((current) => toggleInList(current, id))}
            perSource={perSource}
            onPerSourceChange={setPerSource}
            exact={exact}
            onExactChange={setExact}
            synonyms={synonyms}
            onSynonymsChange={setSynonyms}
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
        {lookup.state.phase !== "idle" ? (
          <div className="columns">
            <div className="column">
              <LookupPanel
                lookup={lookup.state}
                neighbours={lookup.neighbours}
                onLoad={lookup.load}
                view={viewSettings}
                referenceYear={REFERENCE_YEAR}
                libraryPrefix={config.libraryProxyPrefix}
                onOverrideChange={handleOverrideChange}
              />
            </div>
          </div>
        ) : (
          <div className={state.phase === "idle" ? "columns" : counterOpen ? "columns columns-two counter-open" : "columns columns-two"}>
            <div className="column">
              <ClosestMatch
                state={titleMatch.state}
                view={viewSettings}
                referenceYear={REFERENCE_YEAR}
                libraryPrefix={config.libraryProxyPrefix}
                onOverrideChange={handleOverrideChange}
              />
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
                exportSlot={<ProtocolExport build={buildProtocolText} />}
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
                  exact={exact}
                  synonyms={synonyms}
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
        )}
      </main>
      <Footer config={config} />
    </div>
    </SavedProvider>
  );
}
