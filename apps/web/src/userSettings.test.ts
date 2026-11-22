import { defaultFilters, defaultLayoutSettings, defaultScoringSettings, protocolJson, buildProtocol } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import type { KeyStorage } from "./apiKey";
import { DEFAULT_CONFIG, resolveConfig } from "./config";
import type { LibraryChoice } from "./userSettings";
import { protocolInputFrom } from "./protocolRecord";
import { DEFAULT_PROVIDERS } from "./providers";
import {
  SETTINGS_KEY,
  clearSettings,
  defaultUserSettings,
  effectiveConfig,
  isEmailAddress,
  NO_LIBRARY_CHOICE,
  loadSettings,
  parseSettings,
  saveSettings,
  serializeSettings,
  textProblem,
  withLibraryChoice,
  type UserSettings,
} from "./userSettings";

function memory(initial: Record<string, string> = {}): KeyStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}
const refusing: KeyStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};
const changed = (change: Partial<UserSettings>): UserSettings => ({ ...defaultUserSettings(), ...change });

describe("the defaults", () => {
  it("are the app's own defaults: four sources, 100 results each, the standard weights, exact off, synonyms on, nothing chosen", () => {
    const settings = defaultUserSettings();
    expect(settings.enabledProviders).toEqual([...DEFAULT_PROVIDERS]);
    expect(settings.perSource).toBe(100);
    expect(settings.scoring).toEqual(defaultScoringSettings());
    expect(settings.layout).toEqual(defaultLayoutSettings());
    expect([settings.exact, settings.synonyms]).toEqual([false, true]);
    expect(settings.libraries).toEqual([]);
    expect(settings.contactEmail).toBeNull();
  });

  it("give a fresh copy each time", () => {
    const a = defaultUserSettings();
    a.scoring.factors.relevance.weight = 5;
    a.enabledProviders.push("zenodo");
    expect(defaultUserSettings().scoring.factors.relevance.weight).toBe(3);
    expect(defaultUserSettings().enabledProviders).toEqual([...DEFAULT_PROVIDERS]);
  });
});

describe("saving and loading", () => {
  it("round-trips what was changed", () => {
    const storage = memory();
    const scoring = defaultScoringSettings();
    scoring.factors.citations.weight = 0;
    scoring.factors.openAccess.weight = 2;
    scoring.recencyHalfLifeYears = 5;
    scoring.preferredLevels = ["primary"];
    const chosen = changed({
      enabledProviders: ["openalex", "pubmed", "zenodo"],
      perSource: 50,
      scoring,
      layout: { preferredLanguages: ["en", "fr"], showNonArticleTypes: true },
      exact: true,
      synonyms: false,
      libraries: [{ name: "Example Library", prefix: "https://proxy.example.org/login?url=", searchUrl: "" }],
      contactEmail: "me@example.org",
    });
    expect(saveSettings(storage, chosen)).toBe(true);
    expect(loadSettings(storage)).toEqual(chosen);
  });

  it("writes only what differs from the defaults, so a later change of a default reaches people who never touched it", () => {
    expect(JSON.parse(serializeSettings(changed({ perSource: 25 })) ?? "{}")).toEqual({ perSource: 25 });
    expect(serializeSettings(defaultUserSettings())).toBeNull();
  });

  it("writes nothing, and forgets an earlier save, when everything is back at the defaults", () => {
    const storage = memory();
    saveSettings(storage, changed({ perSource: 25 }));
    expect(storage.data.has(SETTINGS_KEY)).toBe(true);
    expect(saveSettings(storage, defaultUserSettings())).toBe(true);
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });

  it("keeps an empty library link (it hides the button) apart from no choice (the default)", () => {
    const hidden = loadSettings(memory({ [SETTINGS_KEY]: JSON.stringify({ libraries: [{ prefix: "" }] }) }));
    expect(hidden.libraries[0]?.prefix).toBe("");
    expect(loadSettings(memory()).libraries[0]).toBeUndefined();
  });

  it("never stores the OpenAlex key with the settings", () => {
    const stored = serializeSettings(changed({ perSource: 25, contactEmail: "me@example.org" })) ?? "";
    expect(stored).not.toMatch(/api|key/i);
  });
});

describe("storage that is missing or refuses", () => {
  it("loads the defaults and says nothing could be saved, without throwing", () => {
    expect(loadSettings(null)).toEqual(defaultUserSettings());
    expect(saveSettings(null, changed({ perSource: 25 }))).toBe(false);
    expect(clearSettings(null)).toBe(false);
  });

  it("copes with a browser that throws on every call", () => {
    expect(loadSettings(refusing)).toEqual(defaultUserSettings());
    expect(saveSettings(refusing, changed({ perSource: 25 }))).toBe(false);
    expect(clearSettings(refusing)).toBe(false);
  });
});

describe("a stored text that is old, edited by hand or damaged", () => {
  it("gives the defaults for text that is not JSON, or not an object", () => {
    for (const stored of ["", "not json", "[1,2]", "42", "null", '"text"', "{"]) expect(parseSettings(stored)).toEqual(defaultUserSettings());
  });

  it("ignores a field of the wrong type and keeps the rest", () => {
    const settings = parseSettings(JSON.stringify({ perSource: "lots", exact: "yes", synonyms: false, libraries: [{ name: 7 }], contactEmail: ["x"] }));
    expect(settings.perSource).toBe(100);
    expect(settings.exact).toBe(false);
    expect(settings.synonyms).toBe(false);
    expect(settings.libraries).toEqual([]);
    expect(settings.contactEmail).toBeNull();
  });

  it("accepts only the results-per-source choices the page offers", () => {
    expect(parseSettings(JSON.stringify({ perSource: 50 })).perSource).toBe(50);
    expect(parseSettings(JSON.stringify({ perSource: 7 })).perSource).toBe(100);
    expect(parseSettings(JSON.stringify({ perSource: 10_000 })).perSource).toBe(100);
  });

  it("drops sources that do not exist, and keeps the order the page lists them in", () => {
    expect(parseSettings(JSON.stringify({ enabledProviders: ["zenodo", "nonsense", "openalex"] })).enabledProviders).toEqual(["openalex", "zenodo"]);
    expect(parseSettings(JSON.stringify({ enabledProviders: "openalex" })).enabledProviders).toEqual([...DEFAULT_PROVIDERS]);
  });

  it("keeps weights inside 0 to 5, ignores a weight that is not a number, and a half-life outside 1 to 100", () => {
    const settings = parseSettings(
      JSON.stringify({
        scoring: {
          factors: { relevance: { enabled: false, weight: 99 }, citations: { weight: -3 }, recency: { weight: "x" }, madeUp: { weight: 1 } },
          recencyHalfLifeYears: 1000,
          preferredLevels: ["primary", "bogus"],
        },
      }),
    );
    expect(settings.scoring.factors.relevance).toEqual({ enabled: false, weight: 5 });
    expect(settings.scoring.factors.citations.weight).toBe(0);
    expect(settings.scoring.factors.recency.weight).toBe(1);
    expect(settings.scoring.recencyHalfLifeYears).toBe(10);
    expect(settings.scoring.preferredLevels).toEqual(["primary"]);
    expect(Object.keys(settings.scoring.factors)).not.toContain("madeUp");
  });

  it("checks the preferred languages: two or three lowercase letters, each once", () => {
    const settings = parseSettings(JSON.stringify({ layout: { preferredLanguages: ["en", "en", "FR", "x", "<b>", "fr", 5], showNonArticleTypes: "yes" } }));
    expect(settings.layout).toEqual({ preferredLanguages: ["en", "fr"], showNonArticleTypes: false });
  });

  it("ignores text that is far too long", () => {
    expect(parseSettings(JSON.stringify({ libraries: [{ name: "x".repeat(5000) }] })).libraries).toEqual([]);
  });
});

describe("clearSettings (Reset all settings)", () => {
  it("forgets the saved settings and the OpenAlex key, and leaves the saved list of sources alone", () => {
    const storage = memory({ [SETTINGS_KEY]: '{"perSource":25}', "sourcly.openalexApiKey": "SECRET", "sourcly.savedList": "[]" });
    expect(clearSettings(storage)).toBe(true);
    expect([...storage.data.keys()]).toEqual(["sourcly.savedList"]);
  });
});

describe("library choices", () => {
  const choice = (change: Partial<LibraryChoice>): LibraryChoice => ({ ...NO_LIBRARY_CHOICE, ...change });

  it("sets one library's choice, filling the ones before it with 'no choice'", () => {
    expect(withLibraryChoice([], 1, { name: "Example" })).toEqual([NO_LIBRARY_CHOICE, choice({ name: "Example" })]);
    expect(withLibraryChoice([choice({ name: "A" })], 0, { prefix: "https://x.org/?u=" })).toEqual([choice({ name: "A", prefix: "https://x.org/?u=" })]);
  });

  it("cuts trailing 'no choice' entries, so having chosen nothing is the empty list (the default)", () => {
    expect(withLibraryChoice([choice({ name: "A" })], 0, { name: null })).toEqual([]);
    expect(withLibraryChoice([NO_LIBRARY_CHOICE, choice({ name: "B" })], 1, { name: null })).toEqual([]);
    expect(serializeSettings(changed({ libraries: withLibraryChoice([choice({ name: "A" })], 0, { name: null }) }))).toBeNull();
  });

  it("does not change the list it was given", () => {
    const given = [choice({ name: "A" })];
    withLibraryChoice(given, 0, { name: "B" });
    expect(given).toEqual([choice({ name: "A" })]);
  });

  it("keeps each library's own choice when saved and loaded", () => {
    const storage = memory();
    const libraries = [NO_LIBRARY_CHOICE, choice({ name: "UofT (mine)", prefix: "", searchUrl: "https://example.org/?q=" })];
    saveSettings(storage, changed({ libraries }));
    expect(loadSettings(storage).libraries).toEqual(libraries);
  });

  it("reads what an earlier version saved for its one library as the first library's choice", () => {
    const settings = parseSettings(JSON.stringify({ libraryName: "My Library", libraryProxyPrefix: "https://proxy.example.org/?url=", librarySearchUrl: "" }));
    expect(settings.libraries).toEqual([{ name: "My Library", prefix: "https://proxy.example.org/?url=", searchUrl: "" }]);
    expect(parseSettings(JSON.stringify({ libraryName: 5 })).libraries).toEqual([]);
  });

  it("keeps at most six, and ignores an entry that is not an object", () => {
    const stored = JSON.stringify({ libraries: [{ name: "A" }, 7, null, { name: "D" }, ...Array.from({ length: 9 }, () => ({ name: "X" }))] });
    const { libraries } = parseSettings(stored);
    expect(libraries.length).toBeLessThanOrEqual(6);
    expect(libraries[0]?.name).toBe("A");
    expect(libraries[1]).toEqual(NO_LIBRARY_CHOICE);
    expect(libraries[3]?.name).toBe("D");
  });
});

describe("effectiveConfig: the site's values with the person's own choices on top", () => {
  const nothing = { libraries: [] as LibraryChoice[], contactEmail: null };
  const choice = (change: Partial<LibraryChoice>): LibraryChoice => ({ ...NO_LIBRARY_CHOICE, ...change });

  it("is the site's own config when nothing was chosen", () => {
    expect(effectiveConfig(DEFAULT_CONFIG, nothing)).toEqual(DEFAULT_CONFIG);
  });

  it("changes only the library the person chose for: the other keeps the site's values", () => {
    const config = effectiveConfig(DEFAULT_CONFIG, { ...nothing, libraries: [NO_LIBRARY_CHOICE, choice({ name: "My UofT", prefix: "https://proxy.example.org/?url=" })] });
    expect(config.libraries[0]).toEqual(DEFAULT_CONFIG.libraries[0]);
    expect(config.libraries[1]).toEqual({ ...DEFAULT_CONFIG.libraries[1], name: "My UofT", proxyPrefix: "https://proxy.example.org/?url=" });
  });

  it("uses a library name, link prefix and search address the person typed, and a contact email", () => {
    const config = effectiveConfig(DEFAULT_CONFIG, {
      libraries: [choice({ name: "Example Library", prefix: "https://proxy.example.org/login?url=", searchUrl: "https://library.example.org/search?q=" })],
      contactEmail: "me@example.org",
    });
    expect(config.libraries[0]).toEqual({ name: "Example Library", proxyPrefix: "https://proxy.example.org/login?url=", searchUrl: "https://library.example.org/search?q=" });
    expect(config.contactEmail).toBe("me@example.org");
  });

  it("lets an empty prefix or search address hide that library's button or link", () => {
    const config = effectiveConfig(DEFAULT_CONFIG, { ...nothing, libraries: [choice({ prefix: "", searchUrl: "" })] });
    expect([config.libraries[0]?.proxyPrefix, config.libraries[0]?.searchUrl]).toEqual(["", ""]);
    expect(config.libraries[1]).toEqual(DEFAULT_CONFIG.libraries[1]);
  });

  it("ignores a link that is not http(s), an email that is not one, and a blank library name", () => {
    const config = effectiveConfig(DEFAULT_CONFIG, {
      libraries: [choice({ name: "", prefix: "javascript:alert(1)", searchUrl: "ftp://x" })],
      contactEmail: "not an email",
    });
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("ignores choices for libraries the site does not have", () => {
    const config = effectiveConfig(DEFAULT_CONFIG, { ...nothing, libraries: [NO_LIBRARY_CHOICE, NO_LIBRARY_CHOICE, choice({ name: "Third" })] });
    expect(config.libraries).toHaveLength(2);
  });

  it("does not change the site's config", () => {
    const site = resolveConfig({});
    const before = JSON.stringify(site);
    effectiveConfig(site, { ...nothing, libraries: [choice({ name: "Other" })] });
    expect(JSON.stringify(site)).toBe(before);
  });
});

describe("textProblem and isEmailAddress", () => {
  it("accepts addresses that look like name@host.tld and refuses the rest", () => {
    for (const ok of ["a@example.org", "first.last+tag@sub.example.ca"]) expect(isEmailAddress(ok)).toBe(true);
    for (const bad of ["", "a@b", "a b@example.org", "@example.org", "a@@example.org", `${"x".repeat(200)}@example.org`]) expect(isEmailAddress(bad)).toBe(false);
  });

  it("warns about a link that is not http(s) or an email that does not look like one, and about nothing that is empty", () => {
    expect(textProblem("libraryProxyPrefix", "ftp://x")).toMatch(/must start with https/);
    expect(textProblem("librarySearchUrl", "example.org")).toMatch(/must start with https/);
    expect(textProblem("contactEmail", "nope")).toMatch(/does not look like an email/);
    expect(textProblem("libraryProxyPrefix", "https://proxy.example.org/?url=")).toBeNull();
    expect(textProblem("contactEmail", "me@example.org")).toBeNull();
    expect(textProblem("contactEmail", "   ")).toBeNull();
  });
});

describe("the contact email and the OpenAlex key stay out of what the person exports", () => {
  it("are not in the search protocol, whatever the settings hold", () => {
    const search = {
      phase: "done",
      id: 1,
      query: "sleep",
      concepts: { original: "sleep", blocks: [], soft: [], stopwords: [], exclusions: [], expanded: false, exact: false, promotedSoft: false, looksLikeQuestion: false },
      terms: [],
      sent: [],
      order: ["openalex"],
      results: [],
      statuses: [{ provider: "openalex", state: "ok", count: 0 }],
      pending: [],
      searchedAt: new Date(),
      fallback: null,
    } as never;
    const ranked = { shown: [], hidden: [], partial: [], otherLanguages: [], otherTypes: [] };
    const input = protocolInputFrom({
      search,
      ranked,
      counter: null,
      perSource: 100,
      filters: defaultFilters(),
      scoring: defaultScoringSettings(),
      layout: defaultLayoutSettings(),
      saved: [],
      referenceYear: 2026,
      appVersion: "0.1.5",
      date: new Date("2026-10-16T00:00:00Z"),
    });
    const json = protocolJson(buildProtocol({ ...input, contactEmail: "me@example.org", openAlexApiKey: "SECRET-KEY-123" } as never));
    expect(json).not.toContain("me@example.org");
    expect(json).not.toContain("SECRET-KEY-123");
    expect(json).not.toMatch(/mailto|api[_-]?key/i);
  });
});
