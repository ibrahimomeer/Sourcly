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
  it("is the footer line as specified", () => {
    expect(footerNotice(DEFAULT_CONFIG)).toBe("Independent student project. Not affiliated with or endorsed by UBC or UBC Library.");
  });

  it("is the full disclaimer as specified", () => {
    expect(fullDisclaimer(DEFAULT_CONFIG)).toBe(
      "Sourcly is an independent student project. It is not an official UBC service and is not affiliated with, endorsed by or supported by UBC or UBC Library. UBC Library links use your own UBC login, and access depends on UBC Library's subscriptions. Labels and rankings are heuristics based on metadata; verify sources before citing.",
    );
  });

  it("is the line beside the library fields in Settings", () => {
    expect(libraryLinkNote(DEFAULT_CONFIG)).toBe(
      "This only builds a link to your library's login. Sourcly never sees your password or your library account.",
    );
  });

  it("is word for word the README's Disclaimer and the Methodology page's About this project", () => {
    const readme = read("README.md");
    const methodology = read("docs/methodology.md");
    expect(readme).toContain(`## Disclaimer\n\n${fullDisclaimer(DEFAULT_CONFIG)}`);
    expect(methodology).toContain(`## About this project\n\n${fullDisclaimer(DEFAULT_CONFIG)}`);
  });

  it("is the one config.js ships with: the defaults name UBC and UBC Library", () => {
    const config = read("public/config.js");
    expect(config).toContain(`institutionName: "${DEFAULT_CONFIG.institutionName}"`);
    expect(config).toContain(`libraryName: "${DEFAULT_CONFIG.libraryName}"`);
    expect(config).toMatch(/FORKS: change these to your own institution and library/);
  });
});

describe("the notice in a fork", () => {
  const fork = resolveConfig({ siteName: "Open Sources", institutionName: "Example University", libraryName: "Example Library" });

  it("names the fork's own institution and library, and its own site name for the project", () => {
    expect(footerNotice(fork)).toBe("Independent student project. Not affiliated with or endorsed by Example University or Example Library.");
    expect(fullDisclaimer(fork)).toBe(
      "Open Sources is an independent student project. It is not an official Example University service and is not affiliated with, endorsed by or supported by Example University or Example Library. Example Library links use your own Example University login, and access depends on Example Library's subscriptions. Labels and rankings are heuristics based on metadata; verify sources before citing.",
    );
    expect(libraryLinkNote(fork)).toContain("Open Sources never sees your password");
  });

  it("never names UBC when the fork has its own names", () => {
    for (const text of [footerNotice(fork), fullDisclaimer(fork), libraryLinkNote(fork)]) expect(text).not.toMatch(/UBC/);
  });

  it("names each once when the library name starts with the institution, and drops a name that is empty", () => {
    expect(footerNotice({ institutionName: "UBC", libraryName: "UBC" })).toBe("Independent student project. Not affiliated with or endorsed by UBC.");
    expect(footerNotice({ institutionName: "", libraryName: "Town Library" })).toBe("Independent student project. Not affiliated with or endorsed by Town Library.");
    expect(footerNotice({ institutionName: "", libraryName: "" })).toBe("Independent student project.");
    expect(fullDisclaimer({ siteName: "Sourcly", institutionName: "", libraryName: "" })).toBe(
      "Sourcly is an independent student project. Labels and rankings are heuristics based on metadata; verify sources before citing.",
    );
  });
});

describe("wording that would suggest an official service", () => {
  it("is not used in any text the site shows", () => {
    const texts = [footerNotice(DEFAULT_CONFIG), fullDisclaimer(DEFAULT_CONFIG), libraryLinkNote(DEFAULT_CONFIG), "Access with UBC Library"];
    for (const text of texts) {
      expect(text).not.toMatch(/\bUBC's\b/);
      expect(text).not.toMatch(/UBC Library presents/i);
      expect(text).not.toMatch(/(?<!not an )official UBC/i);
    }
  });
});
