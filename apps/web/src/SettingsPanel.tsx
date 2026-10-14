import {
  FACTOR_IDS,
  FACTOR_LABELS,
  PEER_REVIEW_STATUSES,
  SOURCE_LEVELS,
  defaultScoringSettings,
  isFiltering,
  type FactorId,
  type ProviderId,
  type ResultFilters,
  type ScoringSettings,
} from "@sourcly/core";
import { useState } from "react";
import { maskApiKey } from "./apiKey";
import { valueName } from "./format";
import { NumberInput } from "./NumberInput";
import { PROVIDER_OPTIONS, UNAVAILABLE_PROVIDERS } from "./providers";
import { PER_SOURCE_CHOICES, toggleInList, withFactor } from "./settings";

const OPENALEX_KEY_URL = "https://openalex.org/settings/api";

const FACTOR_HELP: Record<FactorId, string> = {
  relevance: "How closely the source's own ranking matches your words. First place scores highest.",
  citations: "Citations per year since publication, compared with the other results.",
  recency: "Newer publications score higher. The score halves every “half-life”.",
  peerReview: "Likely peer-reviewed scores 1, unknown 0.5, not peer-reviewed 0.",
  openAccess: "Free to read online scores 1, anything else 0.",
  studyType: "Prefer some levels (primary, secondary, ...). Does nothing until you pick at least one.",
};

export interface SettingsPanelProps {
  scoring: ScoringSettings;
  onScoringChange: (scoring: ScoringSettings) => void;
  filters: ResultFilters;
  onFiltersChange: (filters: ResultFilters) => void;
  enabledProviders: readonly ProviderId[];
  onToggleProvider: (id: ProviderId) => void;
  /** How many results each source is asked for. */
  perSource: number;
  onPerSourceChange: (count: number) => void;
  /** Forgets this visit's remembered answers. */
  onClearCache: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  /** False when the browser refused to store the key. */
  keyIsStored: boolean;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings">
      <button
        type="button"
        className="settings-toggle"
        aria-expanded={open}
        aria-controls="settings-panel"
        onClick={() => setOpen((current) => !current)}
      >
        Settings
      </button>

      {/* Hidden, not removed, so what you typed survives closing the panel. */}
      <div id="settings-panel" className="settings-panel" hidden={!open}>
        <SourcesSection {...props} />
        <RankingSection {...props} />
        <FiltersSection {...props} />
        <ApiKeySection {...props} />
      </div>
    </div>
  );
}

function SourcesSection({ enabledProviders, onToggleProvider, perSource, onPerSourceChange, onClearCache }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>Sources</legend>
      <p className="muted">
        Choose which databases are searched. They are asked at the same time, and every type of source they return is
        shown and labelled.
      </p>
      {PROVIDER_OPTIONS.map((option) => (
        <label key={option.id} className="check">
          <input
            type="checkbox"
            checked={enabledProviders.includes(option.id)}
            onChange={() => onToggleProvider(option.id)}
          />
          <span>
            <strong>{option.name}</strong> <span className="muted">{option.description}</span>
          </span>
        </label>
      ))}
      {UNAVAILABLE_PROVIDERS.map((provider) => (
        <label key={provider.id} className="check check-unavailable">
          <input type="checkbox" checked={false} disabled readOnly />
          <span>
            <strong>{provider.name}</strong> (not available) <span className="muted">{provider.reason}</span>
          </span>
        </label>
      ))}

      <div className="field-row">
        <label htmlFor="per-source">Results per source</label>
        <select
          id="per-source"
          value={perSource}
          onChange={(event) => onPerSourceChange(Number(event.target.value))}
        >
          {PER_SOURCE_CHOICES.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <span className="muted help">A source that allows fewer per search returns fewer. Applies to your next search.</span>
      </div>

      <p className="muted">
        Each source's answer is remembered for this visit only, so searching the same words again does not use up its
        limit twice. Nothing is saved to your device.{" "}
        <button type="button" className="link-button" onClick={onClearCache}>
          Forget remembered results
        </button>
      </p>
    </fieldset>
  );
}

function RankingSection({ scoring, onScoringChange }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>Ranking weights</legend>
      <p className="muted">
        Results re-rank instantly, without searching again. Score = sum of (weight × factor) ÷ sum of weights, over the
        factors that are on.
      </p>

      {FACTOR_IDS.map((id) => {
        const { enabled, weight } = scoring.factors[id];
        return (
          <div key={id} className="factor">
            <div className="factor-head">
              <label className="check">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => onScoringChange(withFactor(scoring, id, { enabled: event.target.checked }))}
                />
                <strong>{FACTOR_LABELS[id]}</strong>
              </label>
              <span className="weight-value" aria-hidden="true">
                {enabled ? `weight ${weight}` : "off"}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={weight}
              disabled={!enabled}
              aria-label={`${FACTOR_LABELS[id]} weight`}
              onChange={(event) => onScoringChange(withFactor(scoring, id, { weight: Number(event.target.value) }))}
            />
            <p className="muted help">{FACTOR_HELP[id]}</p>
            {id === "openAccess" && <p className="muted help">If you have library access, keep this at 0.</p>}

            {id === "recency" && (
              <NumberInput
                id="half-life"
                label="Half-life (years)"
                value={scoring.recencyHalfLifeYears}
                nullable={false}
                min={1}
                max={100}
                onChange={(years) => {
                  if (years !== null && years > 0) onScoringChange({ ...scoring, recencyHalfLifeYears: years });
                }}
              />
            )}

            {id === "studyType" && (
              <div className="check-group" role="group" aria-label="Preferred levels">
                {SOURCE_LEVELS.map((level) => (
                  <label key={level} className="check">
                    <input
                      type="checkbox"
                      checked={scoring.preferredLevels.includes(level)}
                      onChange={() =>
                        onScoringChange({ ...scoring, preferredLevels: toggleInList(scoring.preferredLevels, level) })
                      }
                    />
                    {valueName(level)}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={() => onScoringChange(defaultScoringSettings())}>
        Reset weights
      </button>
    </fieldset>
  );
}

function FiltersSection({ filters, onFiltersChange }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>Filters</legend>
      <p className="muted">
        Nothing is filtered unless you set a filter here. Hidden results are counted above the list, and filtering never
        changes a score.
      </p>

      <div className="field-row">
        <NumberInput
          id="year-from"
          label="Year from"
          value={filters.yearFrom}
          nullable
          placeholder="any"
          onChange={(yearFrom) => onFiltersChange({ ...filters, yearFrom })}
        />
        <NumberInput
          id="year-to"
          label="Year to"
          value={filters.yearTo}
          nullable
          placeholder="any"
          onChange={(yearTo) => onFiltersChange({ ...filters, yearTo })}
        />
      </div>

      <div className="check-group" role="group" aria-label="Source level">
        <span className="group-label">Level (none ticked = all)</span>
        {SOURCE_LEVELS.map((level) => (
          <label key={level} className="check">
            <input
              type="checkbox"
              checked={filters.levels.includes(level)}
              onChange={() => onFiltersChange({ ...filters, levels: toggleInList(filters.levels, level) })}
            />
            {valueName(level)}
          </label>
        ))}
      </div>

      <div className="check-group" role="group" aria-label="Peer review status">
        <span className="group-label">Peer review (none ticked = all)</span>
        {PEER_REVIEW_STATUSES.map((status) => (
          <label key={status} className="check">
            <input
              type="checkbox"
              checked={filters.peerReview.includes(status)}
              onChange={() => onFiltersChange({ ...filters, peerReview: toggleInList(filters.peerReview, status) })}
            />
            {valueName(status)}
          </label>
        ))}
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={filters.openAccessOnly}
          onChange={(event) => onFiltersChange({ ...filters, openAccessOnly: event.target.checked })}
        />
        Open access only
      </label>

      <button
        type="button"
        disabled={!isFiltering(filters)}
        onClick={() =>
          onFiltersChange({ yearFrom: null, yearTo: null, levels: [], peerReview: [], openAccessOnly: false })
        }
      >
        Clear filters
      </button>
    </fieldset>
  );
}

function ApiKeySection({ apiKey, onApiKeyChange, keyIsStored }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>OpenAlex API key (optional)</legend>
      <p>
        Without a key, OpenAlex allows roughly 100 searches a day. A free personal key raises that limit.{" "}
        <a href={OPENALEX_KEY_URL} target="_blank" rel="noopener noreferrer">
          Get a free key
        </a>{" "}
        (you need an OpenAlex account).
      </p>
      <div className="field-row">
        <label htmlFor="openalex-key">API key</label>
        <input
          id="openalex-key"
          type="password"
          name="openalex-api-key"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your key"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
        />
        <button type="button" disabled={apiKey === ""} onClick={() => onApiKeyChange("")}>
          Remove key
        </button>
      </div>
      {apiKey !== "" && (
        <p>
          A key ending {maskApiKey(apiKey)} is set and will be used for your next search.
          {keyIsStored ? "" : " This browser would not save it, so it lasts only until you close this page."}
        </p>
      )}
      <p className="muted">
        The key is kept only in this browser. It is never put in the code, in config.js or in any export, and it is sent
        only to OpenAlex. Anyone who can use this browser profile could read it, so use a personal key, not a shared one.
      </p>
    </fieldset>
  );
}
