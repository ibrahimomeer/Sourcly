import {
  FACTOR_IDS,
  FACTOR_LABELS,
  PEER_REVIEW_STATUSES,
  SOURCE_LEVELS,
  STOPWORDS,
  defaultFilters,
  defaultScoringSettings,
  isFiltering,
  type FactorId,
  type LanguageCount,
  type ProviderId,
  type ResultFilters,
  type ScoringSettings,
  type TermMatching,
} from "@sourcly/core";
import { maskApiKey } from "./apiKey";
import { valueName } from "./format";
import { NumberInput } from "./NumberInput";
import { PROVIDER_OPTIONS, UNAVAILABLE_PROVIDERS } from "./providers";
import { PER_SOURCE_CHOICES, toggleInList, withFactor } from "./settings";

const OPENALEX_KEY_URL = "https://openalex.org/settings/api";

const TERM_MATCHING_CHOICES: readonly { id: TermMatching; label: string; help: string }[] = [
  {
    id: "all",
    label: "Require all terms",
    help: "Only results that contain every term are in the list. The others are kept in a collapsed “Partial matches” section below it, each saying what it matched.",
  },
  {
    id: "coverage",
    label: "Rank by coverage, show partials",
    help: "One list: results with every term first, then most, then few. Inside each tier the weighted score decides.",
  },
  {
    id: "ignore",
    label: "Ignore coverage",
    help: "Coverage does not decide the order: only the weighted score does. Each card still says what it matched.",
  },
];

const FACTOR_HELP: Record<FactorId, string> = {
  relevance:
    "BM25, a standard word-matching formula, over each result's title, abstract and subject terms, worked out on all the results fetched. Rarer words count for more. The best match scores 1.",
  termCoverage:
    "How many of your search's words and phrases the result contains, and where: a term in the title counts 1, in the author keywords 0.8, in the provider topics 0.7, only in the abstract 0.6. Averaged over your terms.",
  phraseMatch:
    "Words that are next to each other in your search, found next to each other in the same order: in the title counts 1, in the abstract 0.7. Neutral (0.5) when your search has no two such words.",
  citations: "Citations per year since publication, compared with the other results.",
  recency: "Newer publications score higher. The score halves every “half-life”.",
  peerReview: "Likely peer-reviewed scores 1, unknown 0.5, not peer-reviewed 0.",
  openAccess: "Free to read online scores 1, anything else 0.",
  providerAgreement:
    "The share of the sources that answered which returned this result. Found by all of them scores 1. Sources often share data, so treat agreement as a hint, not proof.",
  studyType: "Prefer some levels (primary, secondary, ...). Does nothing until you pick at least one.",
};

export interface SettingsPanelProps {
  scoring: ScoringSettings;
  onScoringChange: (scoring: ScoringSettings) => void;
  filters: ResultFilters;
  onFiltersChange: (filters: ResultFilters) => void;
  /** The languages of the results on the page, with how many each has; empty before a search. */
  languageOptions: readonly LanguageCount[];
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
  /** Whether the panel is showing. The button that opens it is in the toolbar. */
  open: boolean;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <div className="settings">
      {/* Hidden, not removed, so what you typed survives closing the panel. */}
      <div id="settings-panel" className="settings-panel" hidden={!props.open}>
        <SourcesSection {...props} />
        <RankingSection {...props} />
        <FiltersSection {...props} />
        <CommonWordsSection />
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

      <div className="term-matching" role="radiogroup" aria-label="Term matching">
        <strong>Term matching</strong>
        <p className="muted help">
          Whether a result must contain your search's words and phrases. Results are first put in tiers: every term, most
          terms (more than half), or few. Nothing is ever deleted.
        </p>
        {TERM_MATCHING_CHOICES.map((choice) => (
          <label key={choice.id} className="check">
            <input
              type="radio"
              name="term-matching"
              checked={scoring.termMatching === choice.id}
              onChange={() => onScoringChange({ ...scoring, termMatching: choice.id })}
            />
            <span>
              <strong>{choice.label}</strong> <span className="muted">{choice.help}</span>
            </span>
          </label>
        ))}
      </div>

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

function FiltersSection({ filters, onFiltersChange, languageOptions }: SettingsPanelProps) {
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

      <div className="check-group" role="group" aria-label="Language">
        <span className="group-label">Language (none ticked = any)</span>
        {languageOptions.length === 0 && <span className="muted">The languages of the results appear here after a search.</span>}
        {languageOptions.map((option) => (
          <label key={option.code} className="check">
            <input
              type="checkbox"
              checked={filters.languages.includes(option.code)}
              onChange={() => onFiltersChange({ ...filters, languages: toggleInList(filters.languages, option.code) })}
            />
            {option.name} <small>{option.count}</small>
          </label>
        ))}
        {languageOptions.length > 0 && (
          <span className="muted">
            A result whose sources gave no language is “unknown”. It is hidden when you choose a language, unless you
            choose “unknown” too.
          </span>
        )}
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
        onClick={() => onFiltersChange(defaultFilters())}
      >
        Clear filters
      </button>
    </fieldset>
  );
}

const COMMON_WORDS = [...STOPWORDS].sort();

function CommonWordsSection() {
  return (
    <fieldset>
      <legend>Common words</legend>
      <p className="muted">
        While “Ignore common words” (next to the search box) is on, these {COMMON_WORDS.length} words are not used in a
        search, and each one that is left out is shown under the box, where one click puts it back. Words inside quotes are
        always kept, and so is a word in capitals such as <code>CAN</code> or <code>US</code>. The list is fixed: nothing is
        learned or guessed.
      </p>
      <details className="panel">
        <summary>Show the list ({COMMON_WORDS.length} words)</summary>
        <p className="word-list">{COMMON_WORDS.join(" ")}</p>
      </details>
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
