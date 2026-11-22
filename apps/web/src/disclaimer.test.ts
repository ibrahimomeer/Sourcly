import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "./config";
import { footerNotice, fullDisclaimer, libraryLinkNote } from "./disclaimer";

// The repository's own files, read as text (Vite's ?raw), so the test needs no Node types.
const raw = import.meta.glob<string>(["../../../README.md", "../../../docs/methodology.md", "../public/config.js"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const read = (path: string): string => {
  const found = Object.entries(raw).find(([key]) => key.endsWith(path));
  if (found === undefined) throw new Error(`${path} was not found`);
  return found[1];
};

describe("the notice, with the default configuration", () => {
  it("is the footer line: it names UBC and UBC Library, not the other libraries", () => {
    expect(footerNotice(DEFAULT_CONFIG)).toBe("Independent student project. Not affiliated with or endorsed by UBC or UBC Library.");
  });

  it("is the full disclaimer, about UBC and its own library only", () => {
    expect(fullDisclaimer(DEFAULT_CONFIG)).toBe(
      "Sourcly is an independent student project. It is not an official UBC service and is not affiliated with, endorsed by or supported by UBC or UBC Library. UBC Library links use your own UBC login, and access depends on UBC Library's subscriptions. Labels and rankings are heuristics based on metadata; verify sources before citing.",
    );
  });

  it("does not name the other libraries, UofT among them, anywhere in the notice", () => {
    expect(DEFAULT_CONFIG.libraries.length).toBeGreaterThan(1);
    for (const text of [footerNotice(DEFAULT_CONFIG), fullDisclaimer(DEFAULT_CONFIG)]) expect(text).not.toMatch(/UofT|Toronto/);
  });

  it("is the line beside the library fields in Settings", () => {
    expect(libraryLinkNote(DEFAULT_CONFIG)).toBe(
      "This only builds a link to your library's login. Sourcly never sees your password or library account.",
    );
  });

  it("is word for word the README's Disclaimer and the Methodology page's About this project", () => {
    const readme = read("README.md");
    const methodology = read("docs/methodology.md");
    expect(readme).toContain(`## Disclaimer\n\n${fullDisclaimer(DEFAULT_CONFIG)}`);
    expect(methodology).toContain(`## About this project\n\n${fullDisclaimer(DEFAULT_CONFIG)}`);
  });

  it("is built in: the defaults name UBC, UBC Library and UofT (the buttons), and config.js only documents how a fork overrides them", () => {
    expect(DEFAULT_CONFIG.institutionName).toBe("UBC");
    expect(DEFAULT_CONFIG.libraries.map((library) => library.name)).toEqual(["UBC Library", "UofT"]);
    const config = read("public/config.js");
    expect(config).toContain(`// institutionName: "${DEFAULT_CONFIG.institutionName}"`);
    expect(config).toContain("libraries");
    expect(config).toMatch(/FORKS: change institutionName and the libraries to your own institution and libraries/);
    expect(config).toMatch(/The FIRST library is the institution's own/);
  });
});

describe("the notice in a fork", () => {
  const fork = resolveConfig({
    siteName: "Open Sources",
    institutionName: "Example University",
    libraries: [{ name: "Example Library", proxyPrefix: "https://proxy.example.org/login?url=", searchUrl: "" }],
  });

  it("names the fork's own institution and library, and its own site name for the project", () => {
    expect(footerNotice(fork)).toBe("Independent student project. Not affiliated with or endorsed by Example University or Example Library.");
    expect(fullDisclaimer(fork)).toBe(
      "Open Sources is an independent student project. It is not an official Example University service and is not affiliated with, endorsed by or supported by Example University or Example Library. Example Library links use your own Example University login, and access depends on Example Library's subscriptions. Labels and rankings are heuristics based on metadata; verify sources before citing.",
    );
    expect(libraryLinkNote(fork)).toContain("Open Sources never sees your password");
  });

  it("never names UBC or UofT when the fork has its own names", () => {
    for (const text of [footerNotice(fork), fullDisclaimer(fork), libraryLinkNote(fork)]) expect(text).not.toMatch(/UBC|UofT/);
  });

  it("names each once, leaves out an empty name, and speaks of 'any institution' of none", () => {
    const lib = (name: string) => ({ name, proxyPrefix: "", searchUrl: "" });
    expect(footerNotice({ institutionName: "UBC", libraries: [lib("UBC")] })).toBe("Independent student project. Not affiliated with or endorsed by UBC.");
    expect(footerNotice({ institutionName: "", libraries: [lib("Town Library")] })).toBe("Independent student project. Not affiliated with or endorsed by Town Library.");
    expect(footerNotice({ institutionName: "", libraries: [] })).toBe("Independent student project.");
    expect(footerNotice({ institutionName: "UBC", libraries: [] })).toBe("Independent student project. Not affiliated with or endorsed by UBC.");
    expect(fullDisclaimer({ siteName: "Sourcly", institutionName: "", libraries: [] })).toBe(
      "Sourcly is an independent student project. Labels and rankings are heuristics based on metadata; verify sources before citing.",
    );
  });

  it("speaks only of the first library, however many there are", () => {
    const lib = (name: string) => ({ name, proxyPrefix: "", searchUrl: "" });
    const three = { institutionName: "UBC", libraries: [lib("UBC Library"), lib("Second"), lib("Third")] };
    expect(footerNotice(three)).toBe("Independent student project. Not affiliated with or endorsed by UBC or UBC Library.");
    expect(fullDisclaimer({ siteName: "S", ...three })).toBe(fullDisclaimer({ siteName: "S", institutionName: "UBC", libraries: [lib("UBC Library")] }));
    expect(fullDisclaimer({ siteName: "S", ...three })).not.toMatch(/Second|Third/);
  });
});

describe("wording that would suggest an official service", () => {
  it("is not used in any text the site shows", () => {
    const texts = [footerNotice(DEFAULT_CONFIG), fullDisclaimer(DEFAULT_CONFIG), libraryLinkNote(DEFAULT_CONFIG), "Access with UBC Library", "Access with UofT"];
    for (const text of texts) {
      expect(text).not.toMatch(/\bUBC's\b/);
      expect(text).not.toMatch(/UBC Library presents/i);
      expect(text).not.toMatch(/(?<!not an )official (UBC|UofT)/i);
      expect(text).not.toMatch(/\bUofT's\b/);
    }
  });
});
