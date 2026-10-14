import {
  defaultFilters,
  defaultScoringSettings,
  type LabelOverride,
  type ProviderId,
  type ResultFilters,
  type ScoringSettings,
} from "@sourcly/core";
import { useMemo, useState } from "react";
import { browserStorage, loadApiKey, saveApiKey } from "./apiKey";
import type { SourclyConfig } from "./config";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { rankResults } from "./pipeline";
import { createProviders, DEFAULT_PROVIDERS } from "./providers";
import { Results } from "./Results";
import { SearchBox } from "./SearchBox";
import { toggleInList, withOverride } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
import { useSearch } from "./useSearch";

const REFERENCE_YEAR = new Date().getFullYear();

export function App({ config }: { config: SourclyConfig }) {
  const [scoring, setScoring] = useState<ScoringSettings>(defaultScoringSettings);
  const [filters, setFilters] = useState<ResultFilters>(defaultFilters);
  const [enabledProviders, setEnabledProviders] = useState<ProviderId[]>([...DEFAULT_PROVIDERS]);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, LabelOverride>>(() => new Map());

  const [storage] = useState(browserStorage);
  const [apiKey, setApiKey] = useState(() => loadApiKey(storage));
  const [keyIsStored, setKeyIsStored] = useState(true);

  const { state, search } = useSearch();

  // Re-ranks instantly when any setting changes; it never contacts a provider.
  const ranked = useMemo(
    () => (state.phase === "done" ? rankResults(state.results, { scoring, filters, overrides }, REFERENCE_YEAR) : null),
    [state, scoring, filters, overrides],
  );

  function handleSearch(query: string) {
    const providers = createProviders(enabledProviders, { openAlexApiKey: apiKey });
    if (providers.length > 0) search(query, providers);
  }

  function handleApiKeyChange(key: string) {
    setApiKey(key);
    setKeyIsStored(saveApiKey(storage, key));
  }

  return (
    <div className="page">
      <Header config={config} />
      <main>
        <SearchBox onSearch={handleSearch} />
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
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          keyIsStored={keyIsStored}
        />

        <Results
          state={state}
          ranked={ranked}
          overrides={overrides}
          libraryPrefix={config.libraryProxyPrefix}
          onOverrideChange={(resultId, change) => setOverrides((current) => withOverride(current, resultId, change))}
          onClearFilters={() => setFilters(defaultFilters())}
        />
      </main>
      <Footer config={config} />
    </div>
  );
}
