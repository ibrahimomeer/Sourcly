import {
  createSearchCache,
  defaultFilters,
  defaultScoringSettings,
  type LabelOverride,
  type ProviderId,
  type ResultFilters,
  type ScoringSettings,
} from "@sourcly/core";
import { useMemo, useRef, useState } from "react";
import { browserStorage, loadApiKey, saveApiKey } from "./apiKey";
import type { SourclyConfig } from "./config";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { rankResults, relatedFor, scoringContext } from "./pipeline";
import { createProviders, DEFAULT_PROVIDERS, skippedStatuses } from "./providers";
import { addTermToQuery, explainUnusable, prepareSearch } from "./queryText";
import { Results } from "./Results";
import { SearchBox } from "./SearchBox";
import { DEFAULT_PER_SOURCE, toggleInList, withOverride } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
import { useSearch } from "./useSearch";

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

  // This visit's memory of each source's answers. In memory only, gone when the page closes.
  const cache = useRef(createSearchCache());
  const { state, search } = useSearch();

  // Merges, ranks and filters instantly whenever a source answers or a setting changes;
  // it never contacts a source.
  const ranked = useMemo(
    () =>
      state.phase === "idle"
        ? null
        : rankResults(state.results, { scoring, filters, overrides }, scoringContext(state, REFERENCE_YEAR)),
    [state, scoring, filters, overrides],
  );

  // Suggested from the top results only; a suggestion never changes the query by itself.
  const related = useMemo(
    () => (state.phase === "idle" || ranked === null ? [] : relatedFor(ranked, state.terms)),
    [state, ranked],
  );

  function handleSearch(text: string) {
    const prepared = prepareSearch(text);
    if (!prepared.usable) {
      setQueryProblem(explainUnusable(prepared.parsed));
      return;
    }
    setQueryProblem(null);
    const providers = createProviders(enabledProviders, { openAlexApiKey: apiKey, contactEmail: config.contactEmail });
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

  function handlePageChange(next: number) {
    setPage(next);
    document.getElementById("results")?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="page">
      <Header config={config} />
      <main>
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

        <Results
          state={state}
          ranked={ranked}
          page={page}
          onPageChange={handlePageChange}
          overrides={overrides}
          libraryPrefix={config.libraryProxyPrefix}
          librarySearchUrl={config.librarySearchUrl}
          onOverrideChange={(resultId, change) => setOverrides((current) => withOverride(current, resultId, change))}
          onClearFilters={() => setFilters(defaultFilters())}
          related={related}
          onAddRelatedTerm={handleAddRelatedTerm}
        />
      </main>
      <Footer config={config} />
    </div>
  );
}
