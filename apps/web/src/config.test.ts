import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, methodologyUrl, releasesUrl, resolveConfig } from "./config";

describe("resolveConfig", () => {
  it("returns the built-in defaults when config.js did not run or is missing", () => {
    expect(resolveConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig("nope")).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it("has a built-in default for every value, so the app needs no other file", () => {
    expect(DEFAULT_CONFIG).toEqual({
      siteName: "Sourcly",
      authorName: "Sourcly",
      institutionName: "UBC",
      libraryName: "UBC Library",
      repoUrl: "https://github.com/ibrahimomeer/Sourcly",
      siteUrl: "https://sourcly.getscove.com",
      contactEmail: "",
      libraryProxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",
      librarySearchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=",
    });
  });

  it("keeps no personal data in the defaults: the project name is the author, and there is no email", () => {
    expect(DEFAULT_CONFIG.authorName).toBe("Sourcly");
    expect(DEFAULT_CONFIG.contactEmail).toBe("");
  });

  it("applies provided string values, trimmed", () => {
    const raw = {
      siteName: "  My Sources ",
      authorName: "Someone",
      institutionName: "Example University",
      libraryName: "Example Library",
      contactEmail: "a@example.org",
      repoUrl: "https://example.org/repo",
      siteUrl: "https://example.org/site",
      libraryProxyPrefix: "https://proxy.example.org/login?url=",
      librarySearchUrl: "https://library.example.org/search?q=",
    };
    expect(resolveConfig(raw)).toEqual({ ...raw, siteName: "My Sources" });
  });

  it("overrides only what config.js names; the rest keeps its default", () => {
    const config = resolveConfig({ libraryName: "Example Library" });
    expect(config).toEqual({ ...DEFAULT_CONFIG, libraryName: "Example Library" });
  });

  it("names UBC and UBC Library by default", () => {
    expect(DEFAULT_CONFIG.institutionName).toBe("UBC");
    expect(DEFAULT_CONFIG.libraryName).toBe("UBC Library");
  });

  it("lets a fork name nothing, or hide a link, with an empty string, but not with spaces", () => {
    expect(resolveConfig({ institutionName: "", libraryName: "" })).toMatchObject({ institutionName: "", libraryName: "" });
    expect(resolveConfig({ libraryProxyPrefix: "", librarySearchUrl: "", repoUrl: "", siteUrl: "" })).toMatchObject({
      libraryProxyPrefix: "",
      librarySearchUrl: "",
      repoUrl: "",
      siteUrl: "",
    });
    expect(resolveConfig({ institutionName: "   " }).institutionName).toBe("UBC");
    expect(resolveConfig({ libraryProxyPrefix: "  " }).libraryProxyPrefix).toBe(DEFAULT_CONFIG.libraryProxyPrefix);
    expect(resolveConfig({ siteName: "" }).siteName).toBe("Sourcly");
  });

  it("falls back to the default site name when it is blank", () => {
    expect(resolveConfig({ siteName: "   " }).siteName).toBe("Sourcly");
  });

  it("ignores values that are not strings", () => {
    const config = resolveConfig({ siteName: 42, authorName: null, repoUrl: {}, libraryProxyPrefix: false });
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("drops URL fields that are not http(s), back to the built-in link", () => {
    const config = resolveConfig({
      repoUrl: "javascript:alert(1)",
      siteUrl: "example.org/site",
      libraryProxyPrefix: "ftp://proxy.example.org/",
      librarySearchUrl: "javascript:alert(1)",
    });
    expect(config.repoUrl).toBe(DEFAULT_CONFIG.repoUrl);
    expect(config.siteUrl).toBe(DEFAULT_CONFIG.siteUrl);
    expect(config.libraryProxyPrefix).toBe(DEFAULT_CONFIG.libraryProxyPrefix);
    expect(config.librarySearchUrl).toBe(DEFAULT_CONFIG.librarySearchUrl);
  });
});

describe("methodologyUrl", () => {
  it("builds the doc link from repoUrl", () => {
    const config = resolveConfig({ repoUrl: "https://example.org/repo/" });
    expect(methodologyUrl(config)).toBe("https://example.org/repo/blob/main/docs/methodology.md");
  });

  it("is empty when repoUrl is unknown", () => {
    expect(methodologyUrl(resolveConfig({ repoUrl: "" }))).toBe("");
  });
});

describe("releasesUrl", () => {
  it("is the repository's Releases page that always shows the newest offline copy", () => {
    expect(releasesUrl(DEFAULT_CONFIG)).toBe("https://github.com/ibrahimomeer/Sourcly/releases/latest");
    expect(releasesUrl({ repoUrl: "https://example.org/repo/" })).toBe("https://example.org/repo/releases/latest");
  });

  it("is empty when the repository is unknown", () => {
    expect(releasesUrl({ repoUrl: "" })).toBe("");
  });
});
