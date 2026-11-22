import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { searchElsewhereLinks } from "./searchLinks";

const UBC = { name: "UBC Library", searchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=" };
const UOFT = { name: "UofT", searchUrl: "https://librarysearch.library.utoronto.ca/nde/search?vid=01UTORONTO_INST:UTORONTO_NDE&query=" };
const NONE = { name: "UBC Library", searchUrl: "" };

describe("searchElsewhereLinks", () => {
  it("names each library link after its library, in the order of the libraries", () => {
    const labels = (libraries: Parameters<typeof searchElsewhereLinks>[1]) => searchElsewhereLinks("sleep", libraries).map((l) => l.label);
    expect(labels([UBC, UOFT])).toEqual(["Google Scholar", "Google", "DuckDuckGo", "UBC Library search", "UofT search"]);
    expect(labels([{ name: "Example Library", searchUrl: UBC.searchUrl }])[3]).toBe("Example Library search");
    expect(labels([{ name: "  ", searchUrl: UBC.searchUrl }])[3]).toBe("your library search");
  });

  it("builds one link per site and per library, in a fixed order, each carrying the query", () => {
    const links = searchElsewhereLinks("sleep and memory", [UBC, UOFT]);
    expect(links.map((l) => l.id)).toEqual(["google-scholar", "google", "duckduckgo", "library-0", "library-1"]);
    expect(links.map((l) => l.url)).toEqual([
      "https://scholar.google.com/scholar?q=sleep%20and%20memory",
      "https://www.google.com/search?q=sleep%20and%20memory",
      "https://duckduckgo.com/?q=sleep%20and%20memory",
      "https://ubc.summon.serialssolutions.com/search?s.q=sleep%20and%20memory",
      "https://librarysearch.library.utoronto.ca/nde/search?vid=01UTORONTO_INST:UTORONTO_NDE&query=sleep%20and%20memory",
    ]);
  });

  it("uses the site's own libraries (UBC Library and UofT) by default", () => {
    expect(searchElsewhereLinks("sleep", DEFAULT_CONFIG.libraries).map((l) => l.label).slice(3)).toEqual(["UBC Library search", "UofT search"]);
  });

  it("leaves out the link of a library whose search address is empty, and all of them with none", () => {
    expect(searchElsewhereLinks("sleep", [NONE]).map((l) => l.id)).toEqual(["google-scholar", "google", "duckduckgo"]);
    expect(searchElsewhereLinks("sleep", [{ name: "x", searchUrl: "   " }]).map((l) => l.id)).toEqual(["google-scholar", "google", "duckduckgo"]);
    expect(searchElsewhereLinks("sleep", [NONE, UOFT]).map((l) => l.id).slice(3)).toEqual(["library-1"]);
    expect(searchElsewhereLinks("sleep").map((l) => l.id)).toEqual(["google-scholar", "google", "duckduckgo"]);
  });

  it("sends the query exactly as typed, encoded, including quotes and operators", () => {
    const [scholar] = searchElsewhereLinks('"memory consolidation" AND sleep -rats & more?', []);
    expect(scholar?.url).toBe(
      "https://scholar.google.com/scholar?q=%22memory%20consolidation%22%20AND%20sleep%20-rats%20%26%20more%3F",
    );
    expect(new URL(scholar?.url ?? "").searchParams.get("q")).toBe('"memory consolidation" AND sleep -rats & more?');
  });

  it("encodes non-English text in each library's link", () => {
    const links = searchElsewhereLinks("spánek a paměť", [UBC, UOFT]);
    expect(new URL(links.find((l) => l.id === "library-0")?.url ?? "").searchParams.get("s.q")).toBe("spánek a paměť");
    expect(new URL(links.find((l) => l.id === "library-1")?.url ?? "").searchParams.get("query")).toBe("spánek a paměť");
  });

  it("trims the query, and returns nothing for a blank one", () => {
    expect(searchElsewhereLinks("  sleep  ", [])[0]?.url).toBe("https://scholar.google.com/scholar?q=sleep");
    expect(searchElsewhereLinks("   ", [UBC])).toEqual([]);
    expect(searchElsewhereLinks("", [UBC])).toEqual([]);
  });

  it("only produces https links", () => {
    for (const link of searchElsewhereLinks("x", [UBC, UOFT])) expect(link.url.startsWith("https://")).toBe(true);
  });
});
