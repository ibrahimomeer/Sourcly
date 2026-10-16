import { defaultFilters, defaultLayoutSettings, defaultScoringSettings } from "@sourcly/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { DEFAULT_PROVIDERS } from "./providers";
import { SettingsPanel, type LibraryChoices, type SettingsPanelProps } from "./SettingsPanel";

const nothing = () => undefined;
const choices: LibraryChoices = { name: null, prefix: null, searchUrl: null, email: null };

function props(change: Partial<SettingsPanelProps> = {}): SettingsPanelProps {
  return {
    scoring: defaultScoringSettings(),
    onScoringChange: nothing,
    filters: defaultFilters(),
    onFiltersChange: nothing,
    layout: defaultLayoutSettings(),
    onLayoutChange: nothing,
    languageOptions: [],
    enabledProviders: [...DEFAULT_PROVIDERS],
    onToggleProvider: nothing,
    exact: false,
    onExactChange: nothing,
    synonyms: true,
    onSynonymsChange: nothing,
    perSource: 100,
    onPerSourceChange: nothing,
    onClearCache: nothing,
    apiKey: "",
    onApiKeyChange: nothing,
    keyIsStored: true,
    site: DEFAULT_CONFIG,
    library: choices,
    onLibraryChange: nothing,
    onResetAll: nothing,
    settingsAreStored: true,
    open: true,
    ...change,
  };
}

const render = (change: Partial<SettingsPanelProps> = {}) => renderToStaticMarkup(createElement(SettingsPanel, props(change)));
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

describe("Settings covers everything config.js used to be edited for", () => {
  const html = render();
  const shown = text(html);

  it("has the library name, the library link prefix and the library search address, each with the site's value as its default", () => {
    for (const label of ["Library name", "Library link prefix", "Library search address"]) expect(shown).toContain(label);
    expect(html).toContain(`placeholder="${DEFAULT_CONFIG.libraryName}"`);
    expect(html).toContain(`placeholder="${DEFAULT_CONFIG.libraryProxyPrefix}"`);
    expect(html).toContain(`placeholder="${DEFAULT_CONFIG.librarySearchUrl}"`);
  });

  it("says the library link only builds a link and that no password or account is seen", () => {
    expect(shown).toContain("This only builds a link to your library's login. Sourcly never sees your password or library account.");
  });

  it("has the optional contact email, and says where it goes and where it never goes", () => {
    expect(shown).toContain("Contact email (optional)");
    expect(html).toContain('type="email"');
    expect(shown).toMatch(/sent only to them/);
    expect(shown).toMatch(/never put in an export, the search protocol, a link or this page.s address/);
  });

  it("has the optional OpenAlex key, the sources, the weights and the language and matching options", () => {
    expect(shown).toContain("OpenAlex API key (optional)");
    expect(shown).toContain("Sources");
    expect(shown).toContain("Ranking weights");
    expect(shown).toContain("Preferred languages");
    expect(shown).toContain("Search exactly as typed");
    expect(shown).toContain("Expand with curated synonyms");
  });

  it("has Reset all settings, and says settings are saved only in this browser", () => {
    expect(shown).toContain("Reset all settings");
    expect(shown).toContain("Settings are saved only in this browser.");
  });
});

describe("Settings when the browser will not keep them", () => {
  it("says they last only until the page is closed", () => {
    expect(text(render({ settingsAreStored: false }))).toContain("This browser would not keep them, so they last only until you close this page.");
    expect(text(render({ settingsAreStored: true }))).not.toContain("would not keep them");
  });
});

describe("Settings shows what the person typed and warns about what cannot be used", () => {
  it("fills each field with the person's own value, and offers to go back to the default", () => {
    const html = render({ library: { name: "Example Library", prefix: "https://proxy.example.org/?url=", searchUrl: "", email: "me@example.org" } });
    expect(html).toContain('value="Example Library"');
    expect(html).toContain('value="https://proxy.example.org/?url="');
    expect(html).toContain('value="me@example.org"');
    const disabled = (markup: string) => (markup.match(/<button type="button" disabled="">Use the default<\/button>/g) ?? []).length;
    expect(disabled(render())).toBe(4);
    expect(disabled(html)).toBe(0);
  });

  it("warns beside a link that is not http(s) and an email that is not one", () => {
    const shown = text(render({ library: { name: null, prefix: "ftp://x", searchUrl: null, email: "nope" } }));
    expect(shown).toContain("A link must start with https:// (or http://), so this is not used.");
    expect(shown).toContain("This does not look like an email address, so it is not used.");
  });

  it("does not warn about empty fields", () => {
    const shown = text(render({ library: { name: "", prefix: "", searchUrl: "", email: "" } }));
    expect(shown).not.toContain("is not used.");
  });
});
