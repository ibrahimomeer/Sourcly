import {
  FACTOR_IDS,
  SOURCE_LEVELS,
  defaultLayoutSettings,
  defaultScoringSettings,
  type LayoutSettings,
  type ProviderId,
  type ScoringSettings,
} from "@sourcly/core";
import type { KeyStorage } from "./apiKey";
import type { LibraryLink, SourclyConfig } from "./config";
import { DEFAULT_PROVIDERS, PROVIDER_OPTIONS } from "./providers";
import { DEFAULT_PER_SOURCE, PER_SOURCE_CHOICES } from "./settings";

// What a person changes in Settings, kept only in this browser's localStorage (never in a file, a URL, an export or the
// search protocol). Loading is defensive: the stored text may be from an older version, hand-edited or damaged, so every
// field is checked and a bad one is ignored, never trusted. Storage may be missing (private mode, blocked site data):
// every function then says so by returning false/null, and the page works for the visit without saving.

export const SETTINGS_KEY = "sourcly.settings";
/** The OpenAlex key lives under its own key (see apiKey.ts); "Reset all settings" forgets it too. */
const API_KEY_KEY = "sourcly.openalexApiKey";

/** What the person typed for one library; `null` means "not chosen: use the site's value". */
export interface LibraryChoice {
  name: string | null;
  prefix: string | null;
  searchUrl: string | null;
}

export const NO_LIBRARY_CHOICE: LibraryChoice = { name: null, prefix: null, searchUrl: null };

const isNoChoice = (choice: LibraryChoice) => choice.name === null && choice.prefix === null && choice.searchUrl === null;

/**
 * The choices with one library's changed. Gaps are filled with "no choice" and trailing "no choice" entries are cut, so a person
 * who has chosen nothing has an empty list (the default) however many libraries the site has.
 */
export function withLibraryChoice(choices: readonly LibraryChoice[], index: number, change: Partial<LibraryChoice>): LibraryChoice[] {
  const next = [...choices];
  while (next.length <= index) next.push(NO_LIBRARY_CHOICE);
  next[index] = { ...(next[index] ?? NO_LIBRARY_CHOICE), ...change };
  while (next.length > 0 && isNoChoice(next[next.length - 1] as LibraryChoice)) next.pop();
  return next;
}

/** The values the library, contact and search options can take; `null` for a text field means "not chosen: use the default". */
export interface UserSettings {
  enabledProviders: ProviderId[];
  perSource: number;
  scoring: ScoringSettings;
  layout: LayoutSettings;
  /** "Search exactly as typed". */
  exact: boolean;
  /** "Expand with curated synonyms". */
  synonyms: boolean;
  /** One entry for each library of the site, in its order; missing entries are "no choice". */
  libraries: LibraryChoice[];
  contactEmail: string | null;
}

export function defaultUserSettings(): UserSettings {
  return {
    enabledProviders: [...DEFAULT_PROVIDERS],
    perSource: DEFAULT_PER_SOURCE,
    scoring: defaultScoringSettings(),
    layout: defaultLayoutSettings(),
    exact: false,
    synonyms: true,
    libraries: [],
    contactEmail: null,
  };
}

const MAX_TEXT = 300;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

/** An address that looks like name@host.tld: one @, no spaces, a dot in the host. Nothing is sent to check it. */
export function isEmailAddress(value: string): boolean {
  return value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** A text field as the person typed it, trimmed; null when it is not a string. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_TEXT ? value.trim() : null;
}

function sanitizeScoring(raw: unknown): ScoringSettings {
  const scoring = defaultScoringSettings();
  if (!isRecord(raw)) return scoring;
  if (isRecord(raw.factors)) {
    for (const id of FACTOR_IDS) {
      const found = raw.factors[id];
      if (!isRecord(found)) continue;
      if (typeof found.enabled === "boolean") scoring.factors[id].enabled = found.enabled;
      if (typeof found.weight === "number" && Number.isFinite(found.weight)) scoring.factors[id].weight = Math.min(5, Math.max(0, found.weight));
    }
  }
  if (Array.isArray(raw.preferredLevels)) {
    scoring.preferredLevels = SOURCE_LEVELS.filter((level) => (raw.preferredLevels as unknown[]).includes(level));
  }
  if (typeof raw.recencyHalfLifeYears === "number" && Number.isFinite(raw.recencyHalfLifeYears) && raw.recencyHalfLifeYears >= 1 && raw.recencyHalfLifeYears <= 100) {
    scoring.recencyHalfLifeYears = raw.recencyHalfLifeYears;
  }
  return scoring;
}

function sanitizeLayout(raw: unknown): LayoutSettings {
  const layout = defaultLayoutSettings();
  if (!isRecord(raw)) return layout;
  if (Array.isArray(raw.preferredLanguages)) {
    layout.preferredLanguages = [...new Set(raw.preferredLanguages.filter((code): code is string => typeof code === "string" && /^[a-z]{2,3}$/.test(code)))].slice(0, 30);
  }
  if (typeof raw.showNonArticleTypes === "boolean") layout.showNonArticleTypes = raw.showNonArticleTypes;
  return layout;
}

const MAX_LIBRARIES = 6;

/** The library choices: the list as stored, or (from an earlier version, which had one library) its three single fields as the first. */
function sanitizeLibraries(raw: Record<string, unknown>): LibraryChoice[] {
  const choice = (item: unknown): LibraryChoice => {
    const record = isRecord(item) ? item : {};
    return { name: text(record.name), prefix: text(record.prefix), searchUrl: text(record.searchUrl) };
  };
  if (Array.isArray(raw.libraries)) {
    const choices = raw.libraries.slice(0, MAX_LIBRARIES).map(choice);
    return choices.reduce<LibraryChoice[]>((list, entry, index) => withLibraryChoice(list, index, entry), []);
  }
  const old = choice({ name: raw.libraryName, prefix: raw.libraryProxyPrefix, searchUrl: raw.librarySearchUrl });
  return isNoChoice(old) ? [] : [old];
}

/**
 * The settings in a stored text, with every field checked. Anything missing, of the wrong type or out of range keeps its
 * default; text that is not JSON gives all defaults. Never throws.
 */
export function parseSettings(stored: string | null): UserSettings {
  const settings = defaultUserSettings();
  if (stored === null) return settings;
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return settings;
  }
  if (!isRecord(raw)) return settings;

  if (Array.isArray(raw.enabledProviders)) {
    const known = PROVIDER_OPTIONS.map((option) => option.id);
    settings.enabledProviders = known.filter((id) => (raw.enabledProviders as unknown[]).includes(id));
  }
  if (typeof raw.perSource === "number" && (PER_SOURCE_CHOICES as readonly number[]).includes(raw.perSource)) settings.perSource = raw.perSource;
  if ("scoring" in raw) settings.scoring = sanitizeScoring(raw.scoring);
  if ("layout" in raw) settings.layout = sanitizeLayout(raw.layout);
  if (typeof raw.exact === "boolean") settings.exact = raw.exact;
  if (typeof raw.synonyms === "boolean") settings.synonyms = raw.synonyms;
  settings.libraries = sanitizeLibraries(raw);
  settings.contactEmail = text(raw.contactEmail);
  return settings;
}

/** Only what differs from the defaults is written, so a later change of a default reaches everyone who never touched it. */
export function serializeSettings(settings: UserSettings): string | null {
  const defaults = defaultUserSettings();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaults) as (keyof UserSettings)[]) {
    if (JSON.stringify(settings[key]) !== JSON.stringify(defaults[key])) out[key] = settings[key];
  }
  return Object.keys(out).length === 0 ? null : JSON.stringify(out);
}

/** The saved settings, or the defaults when there are none or storage is unavailable. */
export function loadSettings(storage: KeyStorage | null): UserSettings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null);
  } catch {
    return defaultUserSettings();
  }
}

/** Saves the settings. Returns false when the browser refused, so the page can say they last only for this visit. */
export function saveSettings(storage: KeyStorage | null, settings: UserSettings): boolean {
  if (storage === null) return false;
  try {
    const stored = serializeSettings(settings);
    if (stored === null) storage.removeItem(SETTINGS_KEY);
    else storage.setItem(SETTINGS_KEY, stored);
    return true;
  } catch {
    return false;
  }
}

/** "Reset all settings": forgets the saved settings and the OpenAlex key. The saved list of sources is not a setting and stays. */
export function clearSettings(storage: KeyStorage | null): boolean {
  if (storage === null) return false;
  try {
    storage.removeItem(SETTINGS_KEY);
    storage.removeItem(API_KEY_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The site's configuration with the person's own choices on top. A choice counts only if it is usable: a link prefix or
 * search address must be http(s) (an empty one is a choice: it hides that link), an email must look like an address, a
 * library name must not be blank. A choice that is not usable is ignored and the site's value stays.
 */
export function effectiveConfig(base: SourclyConfig, user: Pick<UserSettings, "libraries" | "contactEmail">): SourclyConfig {
  const config: SourclyConfig = { ...base };
  config.libraries = base.libraries.map((library, index): LibraryLink => {
    const choice = user.libraries[index] ?? NO_LIBRARY_CHOICE;
    return {
      name: choice.name !== null && choice.name !== "" ? choice.name : library.name,
      proxyPrefix: choice.prefix !== null && (choice.prefix === "" || isHttpUrl(choice.prefix)) ? choice.prefix : library.proxyPrefix,
      searchUrl: choice.searchUrl !== null && (choice.searchUrl === "" || isHttpUrl(choice.searchUrl)) ? choice.searchUrl : library.searchUrl,
    };
  });
  if (user.contactEmail !== null && isEmailAddress(user.contactEmail)) config.contactEmail = user.contactEmail;
  return config;
}

/** What is wrong with the person's library and contact text, in plain words, or null. Used to warn beside the field. */
export function textProblem(field: "libraryProxyPrefix" | "librarySearchUrl" | "contactEmail", value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (field === "contactEmail") return isEmailAddress(trimmed) ? null : "This does not look like an email address, so it is not used.";
  return isHttpUrl(trimmed) ? null : "A link must start with https:// (or http://), so this is not used.";
}
