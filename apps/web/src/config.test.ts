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
      libraries: [
        {
          name: "UBC Library",
          proxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",
          searchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=",
        },
        {
          name: "UofT",
          proxyPrefix: "https://myaccess.library.utoronto.ca/login?qurl=",
          searchUrl: "https://librarysearch.library.utoronto.ca/nde/search?vid=01UTORONTO_INST:UTORONTO_NDE&query=",
        },
      ],
      repoUrl: "https://github.com/ibrahimomeer/Sourcly",
      siteUrl: "https://sourcly.getscove.com",
      contactEmail: "",
    });
  });

  it("keeps no personal data in the defaults: the project name is the author, and there is no email", () => {
    expect(DEFAULT_CONFIG.authorName).toBe("Sourcly");
    expect(DEFAULT_CONFIG.contactEmail).toBe("");
  });

  it("gives the app its own copy of the libraries, so changing one never changes the defaults", () => {
    const config = resolveConfig({});
    config.libraries[0]!.name = "Changed";
    expect(DEFAULT_CONFIG.libraries[0]?.name).toBe("UBC Library");
    expect(resolveConfig({}).libraries[0]?.name).toBe("UBC Library");
  });

  it("applies provided string values, trimmed", () => {
    const raw = {
      siteName: "  My Sources ",
      authorName: "Someone",
      institutionName: "Example University",
      contactEmail: "a@example.org",
      repoUrl: "https://example.org/repo",
      siteUrl: "https://example.org/site",
    };
    expect(resolveConfig(raw)).toEqual({ ...DEFAULT_CONFIG, ...raw, siteName: "My Sources" });
  });

  it("overrides only what config.js names; the rest keeps its default", () => {
    expect(resolveConfig({ institutionName: "Example University" })).toEqual({ ...DEFAULT_CONFIG, institutionName: "Example University" });
  });

  it("names UBC, with UBC Library and UofT as the libraries, by default", () => {
    expect(DEFAULT_CONFIG.institutionName).toBe("UBC");
    expect(DEFAULT_CONFIG.libraries.map((library) => library.name)).toEqual(["UBC Library", "UofT"]);
  });

  it("builds the UofT link from University of Toronto Libraries' proxy, in its encoded (qurl) form", () => {
    const uoft = DEFAULT_CONFIG.libraries[1];
    expect(uoft?.proxyPrefix).toBe("https://myaccess.library.utoronto.ca/login?qurl=");
    expect(uoft?.searchUrl.endsWith("&query=")).toBe(true);
  });

  it("lets a fork set its own libraries, in its own order", () => {
    const libraries = [
      { name: "Example Library", proxyPrefix: "https://proxy.example.org/login?url=", searchUrl: "https://library.example.org/search?q=" },
      { name: "  Other  ", proxyPrefix: "", searchUrl: "https://other.example.org/?q=" },
    ];
    expect(resolveConfig({ libraries }).libraries).toEqual([libraries[0], { ...libraries[1], name: "Other" }]);
  });

  it("lets a fork have no library buttons with an empty list, but keeps the defaults for a list with nothing usable in it", () => {
    expect(resolveConfig({ libraries: [] }).libraries).toEqual([]);
    expect(resolveConfig({ libraries: [{ proxyPrefix: "https://x.org/?u=" }, 7, null, { name: "  " }] }).libraries).toEqual(DEFAULT_CONFIG.libraries);
    expect(resolveConfig({ libraries: "UBC" }).libraries).toEqual(DEFAULT_CONFIG.libraries);
  });

  it("drops a library link that is not http(s) to empty, so that button or link is hidden instead of broken", () => {
    const config = resolveConfig({ libraries: [{ name: "Example", proxyPrefix: "javascript:alert(1)", searchUrl: "ftp://x" }] });
    expect(config.libraries).toEqual([{ name: "Example", proxyPrefix: "", searchUrl: "" }]);
  });

  it("allows at most six libraries", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Library ${i}`, proxyPrefix: "", searchUrl: "" }));
    expect(resolveConfig({ libraries: many }).libraries).toHaveLength(6);
  });

  it("lets a fork name no institution, or hide a link, with an empty string, but not with spaces", () => {
    expect(resolveConfig({ institutionName: "" }).institutionName).toBe("");
    expect(resolveConfig({ repoUrl: "", siteUrl: "" })).toMatchObject({ repoUrl: "", siteUrl: "" });
    expect(resolveConfig({ institutionName: "   " }).institutionName).toBe("UBC");
    expect(resolveConfig({ siteName: "" }).siteName).toBe("Sourcly");
  });

  it("falls back to the default site name when it is blank", () => {
    expect(resolveConfig({ siteName: "   " }).siteName).toBe("Sourcly");
  });

  it("ignores values that are not strings", () => {
    const config = resolveConfig({ siteName: 42, authorName: null, repoUrl: {}, institutionName: false });
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("drops URL fields that are not http(s), back to the built-in link", () => {
    const config = resolveConfig({ repoUrl: "javascript:alert(1)", siteUrl: "example.org/site" });
    expect(config.repoUrl).toBe(DEFAULT_CONFIG.repoUrl);
    expect(config.siteUrl).toBe(DEFAULT_CONFIG.siteUrl);
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
