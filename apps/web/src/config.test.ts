import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, methodologyUrl, resolveConfig } from "./config";

describe("resolveConfig", () => {
  it("returns the defaults when config.js did not run", () => {
    expect(resolveConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(resolveConfig("nope")).toEqual(DEFAULT_CONFIG);
  });

  it("keeps no personal data in the defaults: the project name is the author, and there is no email", () => {
    expect(DEFAULT_CONFIG.authorName).toBe("Sourcly");
    expect(DEFAULT_CONFIG.contactEmail).toBe("");
  });

  it("applies provided string values, trimmed", () => {
    const config = resolveConfig({
      siteName: "  My Sources ",
      authorName: "Someone",
      institutionName: "Example University",
      libraryName: "Example Library",
      contactEmail: "a@example.org",
      repoUrl: "https://example.org/repo",
      downloadUrl: "https://example.org/repo/releases/latest",
      libraryProxyPrefix: "https://proxy.example.org/login?url=",
      librarySearchUrl: "https://library.example.org/search?q=",
    });
    expect(config).toEqual({
      siteName: "My Sources",
      authorName: "Someone",
      institutionName: "Example University",
      libraryName: "Example Library",
      contactEmail: "a@example.org",
      repoUrl: "https://example.org/repo",
      downloadUrl: "https://example.org/repo/releases/latest",
      libraryProxyPrefix: "https://proxy.example.org/login?url=",
      librarySearchUrl: "https://library.example.org/search?q=",
    });
  });

  it("names UBC and UBC Library by default, and nothing else personal", () => {
    expect(DEFAULT_CONFIG.institutionName).toBe("UBC");
    expect(DEFAULT_CONFIG.libraryName).toBe("UBC Library");
  });

  it("lets a fork name no institution or library with an empty string, but not with spaces", () => {
    expect(resolveConfig({ institutionName: "", libraryName: "" })).toMatchObject({ institutionName: "", libraryName: "" });
    expect(resolveConfig({ institutionName: "   " }).institutionName).toBe("UBC");
    expect(resolveConfig({ siteName: "" }).siteName).toBe("Sourcly");
  });

  it("falls back to the default site name when it is blank", () => {
    expect(resolveConfig({ siteName: "   " }).siteName).toBe("Sourcly");
  });

  it("ignores values that are not strings", () => {
    const config = resolveConfig({ siteName: 42, authorName: null, repoUrl: {} });
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("drops URL fields that are not http(s)", () => {
    const config = resolveConfig({
      repoUrl: "javascript:alert(1)",
      downloadUrl: "example.org/download",
      libraryProxyPrefix: "ftp://proxy.example.org/",
      librarySearchUrl: "javascript:alert(1)",
    });
    expect(config.repoUrl).toBe("");
    expect(config.downloadUrl).toBe("");
    expect(config.libraryProxyPrefix).toBe("");
    expect(config.librarySearchUrl).toBe("");
  });
});

describe("methodologyUrl", () => {
  it("builds the doc link from repoUrl", () => {
    const config = resolveConfig({ repoUrl: "https://example.org/repo/" });
    expect(methodologyUrl(config)).toBe("https://example.org/repo/blob/main/docs/methodology.md");
  });

  it("is empty when repoUrl is unknown", () => {
    expect(methodologyUrl(resolveConfig({}))).toBe("");
  });
});
