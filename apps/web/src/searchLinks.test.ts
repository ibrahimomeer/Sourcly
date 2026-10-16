import { describe, expect, it } from "vitest";
import { searchElsewhereLinks } from "./searchLinks";

const UBC = "https://ubc.summon.serialssolutions.com/search?s.q=";

describe("searchElsewhereLinks", () => {
  it("names the library link after the library the person set", () => {
    const labels = (name?: string) => searchElsewhereLinks("sleep", UBC, name).map((l) => l.label);
    expect(labels("Example Library")[3]).toBe("Example Library search");
    expect(labels("  ")[3]).toBe("Your library search");
    expect(labels()[3]).toBe("UBC Library search");
  });

  it("builds one link per site, in a fixed order, each carrying the query", () => {
    const links = searchElsewhereLinks("sleep and memory", UBC);
    expect(links.map((l) => l.label)).toEqual(["Google Scholar", "Google", "DuckDuckGo", "UBC Library search"]);
    expect(links.map((l) => l.url)).toEqual([
      "https://scholar.google.com/scholar?q=sleep%20and%20memory",
      "https://www.google.com/search?q=sleep%20and%20memory",
      "https://duckduckgo.com/?q=sleep%20and%20memory",
      "https://ubc.summon.serialssolutions.com/search?s.q=sleep%20and%20memory",
    ]);
  });

  it("leaves out the library link when the setting is empty", () => {
    expect(searchElsewhereLinks("sleep", "").map((l) => l.id)).toEqual(["google-scholar", "google", "duckduckgo"]);
    expect(searchElsewhereLinks("sleep", "   ").map((l) => l.id)).toEqual(["google-scholar", "google", "duckduckgo"]);
  });

  it("sends the query exactly as typed, encoded, including quotes and operators", () => {
    const [scholar] = searchElsewhereLinks('"memory consolidation" AND sleep -rats & more?', "");
    expect(scholar?.url).toBe(
      "https://scholar.google.com/scholar?q=%22memory%20consolidation%22%20AND%20sleep%20-rats%20%26%20more%3F",
    );
    expect(new URL(scholar?.url ?? "").searchParams.get("q")).toBe('"memory consolidation" AND sleep -rats & more?');
  });

  it("encodes non-English text", () => {
    const link = searchElsewhereLinks("spánek a paměť", UBC).find((l) => l.id === "library");
    expect(new URL(link?.url ?? "").searchParams.get("s.q")).toBe("spánek a paměť");
  });

  it("trims the query, and returns nothing for a blank one", () => {
    expect(searchElsewhereLinks("  sleep  ", "")[0]?.url).toBe("https://scholar.google.com/scholar?q=sleep");
    expect(searchElsewhereLinks("   ", UBC)).toEqual([]);
    expect(searchElsewhereLinks("", UBC)).toEqual([]);
  });

  it("only produces https links", () => {
    for (const link of searchElsewhereLinks("x", UBC)) expect(link.url.startsWith("https://")).toBe(true);
  });
});
