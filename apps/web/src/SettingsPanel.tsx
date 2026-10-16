import {
  FACTOR_IDS,
  FACTOR_LABELS,
  PEER_REVIEW_STATUSES,
  SOURCE_LEVELS,
  SOFT_TERMS,
  STOPWORDS,
  UNKNOWN_LANGUAGE,
  defaultFilters,
  defaultScoringSettings,
  isFiltering,
  languageName,
  type FactorId,
  type LanguageCount,
  type ProviderId,
  type ResultFilters,
  type LayoutSettings,
  type ScoringSettings,
} from "@sourcly/core";
import { maskApiKey } from "./apiKey";
import type { SourclyConfig } from "./config";
import { libraryLinkNote } from "./disclaimer";
import { textProblem } from "./userSettings";
import { valueName } from "./format";
import { NumberInput } from "./NumberInput";
import { PROVIDER_OPTIONS, UNAVAILABLE_PROVIDERS } from "./providers";
import { PER_SOURCE_CHOICES, toggleInList, withFactor } from "./settings";

const OPENALEX_KEY_URL = "https://openalex.org/settings/api";

const FACTOR_HELP: Record<FactorId, string> = {
  relevance:
    "BM25, a standard word-matching formula, over each result's title, abstract and author keywords, worked out on all the results fetched. Each concept of your search counts 1.0, a generic word such as “using” counts 0.3. Rarer concepts count for more. The best match scores 1.",
  termCoverage:
    "How many of your search's concepts the result matches, and where: a concept in the title counts 1, in the author keywords 0.8, only in the abstract 0.6. Averaged over your concepts. Topic tags and the journal name are not read.",
  phraseMatch:
    "Concepts that are next to each other in your search, found next to each other in the same order: in the title counts 1, in the abstract 0.7. Neutral (0.5) when your search has no two such concepts.",
  citations: "Citations per year since publication, compared with the other results.",
  recency: "Newer publications score higher. The score halves every “half-life”.",
  peerReview: "Likely peer-reviewed scores 1, unknown 0.5, not peer-reviewed 0.",
  openAccess: "Free to read online scores 1, anything else 0.",
  providerAgreement:
    "The share of the sources that answered which returned this result. Found by all of them scores 1. Sources often share data, so treat agreement as a hint, not proof.",
  studyType: "Prefer some levels (primary, secondary, ...). Does nothing until you pick at least one.",
};

/** What the person typed for the library link and the contact email. */
export interface LibraryChoices {
  name: string | null;
  prefix: string | null;
  searchUrl: string | null;
  email: string | null;
}

export interface SettingsPanelProps {
  scoring: ScoringSettings;
  onScoringChange: (scoring: ScoringSettings) => void;
  filters: ResultFilters;
  onFiltersChange: (filters: ResultFilters) => void;
  /** How results are sectioned: preferred languages, and whether non-article types are in the main list. */
  layout: LayoutSettings;
  onLayoutChange: (layout: LayoutSettings) => void;
  /** The languages of the results on the page, with how many each has; empty before a search. */
  languageOptions: readonly LanguageCount[];
  enabledProviders: readonly ProviderId[];
  onToggleProvider: (id: ProviderId) => void;
  /** "Search exactly as typed": no word removed, no alternatives added, the text sent as it is. */
  exact: boolean;
  onExactChange: (exact: boolean) => void;
  /** "Expand with curated synonyms". */
  synonyms: boolean;
  onSynonymsChange: (synonyms: boolean) => void;
  /** How many results each source is asked for. */
  perSource: number;
  onPerSourceChange: (count: number) => void;
  /** Forgets this visit's remembered answers. */
  onClearCache: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  /** False when the browser refused to store the key. */
  keyIsStored: boolean;
  /** The site's own values (built-in defaults and config.js): shown as the placeholder of each library and contact field. */
  site: SourclyConfig;
  /** The person's own choices for the library link and contact email; null = not chosen (the site's value is used). */
  library: LibraryChoices;
  onLibraryChange: (change: Partial<LibraryChoices>) => void;
  /** "Reset all settings": every choice back to its default, and the saved OpenAlex key forgotten. */
  onResetAll: () => void;
  /** False when the browser refused to keep the settings, so they last only for this visit. */
  settingsAreStored: boolean;
  /** Whether the panel is showing. The button that opens it is in the toolbar. */
  open: boolean;
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <div className="settings">
      {/* Hidden, not removed, so what you typed survives closing the panel. */}
      <div id="settings-panel" className="settings-panel" hidden={!props.open}>
        <p className="muted settings-saved-note">
          Settings are saved only in this browser.
          {!props.settingsAreStored && " This browser would not keep them, so they last only until you close this page."}
        </p>
        <SearchSection {...props} />
        <SourcesSection {...props} />
        <RankingSection {...props} />
        <LayoutSection {...props} />
        <FiltersSection {...props} />
        <CommonWordsSection />
        <LibrarySection {...props} />
        <ContactSection {...props} />
        <ApiKeySection {...props} />
        <ResetSection {...props} />
      </div>
    </div>
  );
}

function SearchSection({ exact, onExactChange, synonyms, onSynonymsChange }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>How the search is read</legend>
      <p className="muted">
        Your text is read as concepts: common words and generic words (“understand”, “using”, “novel”) are not required, and
        every other word or quoted phrase must match. “How we searched”, under the results heading, shows exactly how.
      </p>
      <label className="check">
        <input type="checkbox" checked={exact} onChange={(event) => onExactChange(event.target.checked)} />
        <span>
          <strong>Search exactly as typed</strong>{" "}
          <span className="muted">
            No common word is removed, no generic word is set aside, no alternative is added and no operator is written for
            you: your text is sent to every source as it is. Applies to your next search.
          </span>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={synonyms && !exact} disabled={exact} onChange={(event) => onSynonymsChange(event.target.checked)} />
        <span>
          <strong>Expand with curated synonyms</strong>{" "}
          <span className="muted">
            A concept also matches its spelling variants, abbreviations and a few close synonyms from a short, hand-checked
            list (for example AI also matches “machine learning”). Quoted phrases are never expanded.
          </span>
        </span>
      </label>
    </fieldset>
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
        factors that are on. The score is used after two things that always come first: how many of your concepts a result
        matches, and whether neighbouring concepts appear next to each other.
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

function LayoutSection({ layout, onLayoutChange, languageOptions }: SettingsPanelProps) {
  // English is always offered, and so is every language a result was detected in, and every one already chosen.
  const options = languageOptions.some((option) => option.code === "en")
    ? languageOptions
    : [{ code: "en", name: languageName("en"), count: 0 }, ...languageOptions];
  return (
    <fieldset>
      <legend>Results layout</legend>
      <p className="muted">
        Nothing is ever deleted. The main list holds results that match every concept of your search (and, while there are
        fewer than 15 of those, results that lack one concept, labelled “Matches N of M concepts”). Everything else is kept
        in collapsed sections below it, each with a count.
      </p>
      <div className="check-group" role="group" aria-label="Preferred languages">
        <span className="group-label">Preferred languages (none ticked = any)</span>
        {options
          .filter((option) => option.code !== UNKNOWN_LANGUAGE)
          .map((option) => (
            <label key={option.code} className="check">
              <input
                type="checkbox"
                checked={layout.preferredLanguages.includes(option.code)}
                onChange={() => onLayoutChange({ ...layout, preferredLanguages: toggleInList(layout.preferredLanguages, option.code) })}
              />
              {option.name} <small>{option.count}</small>
            </label>
          ))}
        <span className="muted">
          A result in any other language goes to “Other languages”. The language is detected from the title and abstract
          (and is shown on each card); a result whose language cannot be told stays where its words put it.
        </span>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={layout.showNonArticleTypes}
          onChange={(event) => onLayoutChange({ ...layout, showNonArticleTypes: event.target.checked })}
        />
        <span>
          Show non-article types in the main list{" "}
          <span className="muted">(datasets, theses, reports, presentations, and works only Zenodo or DataCite hold)</span>
        </span>
      </label>
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
        onClick={() => onFiltersChange(defaultFilters())}
      >
        Clear filters
      </button>
    </fieldset>
  );
}

const COMMON_WORDS = [...STOPWORDS].sort();
const GENERIC_WORDS = [...SOFT_TERMS].sort();

function CommonWordsSection() {
  return (
    <fieldset>
      <legend>Common and generic words</legend>
      <p className="muted">
        Two fixed lists decide which words of a search are not required. <strong>Common words</strong> ({COMMON_WORDS.length}{" "}
        words, such as “what”, “is” and “the”) are never searched. <strong>Generic words</strong> ({GENERIC_WORDS.length}{" "}
        words, such as “understand”, “using” and “novel”) are not required either, and only give a small ranking boost
        when a result has them. Words inside quotes are always kept, and so is a word in capitals such as <code>CAN</code> or{" "}
        <code>US</code>. The lists are fixed: nothing is learned or guessed. “Search exactly as typed” turns both off.
      </p>
      <details className="panel">
        <summary>Show the common words ({COMMON_WORDS.length})</summary>
        <p className="word-list">{COMMON_WORDS.join(" ")}</p>
      </details>
      <details className="panel">
        <summary>Show the generic words ({GENERIC_WORDS.length})</summary>
        <p className="word-list">{GENERIC_WORDS.join(" ")}</p>
      </details>
    </fieldset>
  );
}

/** One text field the person may change: the site's value shows as the placeholder, and a "use the default" link undoes the choice. */
function ChoiceField({
  id,
  label,
  value,
  placeholder,
  help,
  problem,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  help?: string;
  problem: string | null;
  onChange: (value: string | null) => void;
  type?: "text" | "email";
}) {
  return (
    <div className="choice-field">
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={type}
          value={value ?? ""}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" disabled={value === null} onClick={() => onChange(null)}>
          Use the default
        </button>
      </div>
      {help !== undefined && <p className="muted help">{help}</p>}
      {problem !== null && <p className="warning" role="status">{problem}</p>}
    </div>
  );
}

function LibrarySection({ site, library, onLibraryChange }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>Library link</legend>
      <p className="muted">
        The “Access with …” button on every result opens your library’s login for that work. Change the name and the link
        here to use your own library.
      </p>
      <ChoiceField
        id="library-name"
        label="Library name"
        value={library.name}
        placeholder={site.libraryName}
        problem={null}
        onChange={(name) => onLibraryChange({ name })}
      />
      <ChoiceField
        id="library-prefix"
        label="Library link prefix"
        value={library.prefix}
        placeholder={site.libraryProxyPrefix}
        help="The link is this prefix followed by the work’s address. Empty hides the button."
        problem={textProblem("libraryProxyPrefix", library.prefix ?? "")}
        onChange={(prefix) => onLibraryChange({ prefix })}
      />
      <ChoiceField
        id="library-search"
        label="Library search address"
        value={library.searchUrl}
        placeholder={site.librarySearchUrl}
        help="Used for the library link under “Search elsewhere”: this address followed by your search. Empty hides it."
        problem={textProblem("librarySearchUrl", library.searchUrl ?? "")}
        onChange={(searchUrl) => onLibraryChange({ searchUrl })}
      />
      <p>{libraryLinkNote(site)}</p>
    </fieldset>
  );
}

function ContactSection({ site, library, onLibraryChange }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>Contact email (optional)</legend>
      <p className="muted">
        Crossref, PubMed and Unpaywall ask tools to send a contact address with their requests (Crossref then answers
        faster, and Unpaywall needs one to be asked at all). It is sent only to them, as the parameter they document. It is
        never put in an export, the search protocol, a link or this page’s address. Leave it empty to send nothing.
      </p>
      <ChoiceField
        id="contact-email"
        label="Email"
        type="email"
        value={library.email}
        placeholder={site.contactEmail === "" ? "none" : "set by this site"}
        problem={textProblem("contactEmail", library.email ?? "")}
        onChange={(email) => onLibraryChange({ email })}
      />
    </fieldset>
  );
}

function ResetSection({ onResetAll, settingsAreStored }: SettingsPanelProps) {
  return (
    <fieldset>
      <legend>Reset</legend>
      <p className="muted">
        Puts every setting back to its default: sources, weights, filters, language and matching options, the library link, the
        contact email, and forgets the OpenAlex key. Your saved list of sources is kept.
      </p>
      <button type="button" onClick={onResetAll}>
        Reset all settings
      </button>
      <p className="muted">
        Settings are saved only in this browser.
        {!settingsAreStored && " This browser would not keep them, so they last only until you close this page."}
      </p>
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
