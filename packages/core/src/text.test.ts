import { describe, expect, it } from "vitest";
import { decodeEntities, parseYear, plainTextOrNull, stripMarkup, toLanguageCode, toPlainQuery } from "./text";

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("Tom &amp; Jerry &lt;3 &quot;x&quot; &apos;y&apos;")).toBe(`Tom & Jerry <3 "x" 'y'`);
    expect(decodeEntities("a&#8211;b &#x2013; c &#xa9;")).toBe("a–b – c ©");
  });

  it("leaves unknown or invalid entities alone", () => {
    expect(decodeEntities("&bogus; &#xZZ; &#0; &#99999999;")).toBe("&bogus; &#xZZ; &#0; &#99999999;");
  });

  it("does not treat prototype names as entities", () => {
    expect(decodeEntities("&constructor; &toString;")).toBe("&constructor; &toString;");
  });
});

describe("stripMarkup", () => {
  it("turns a Crossref JATS abstract into plain text, dropping the 'Abstract' heading", () => {
    const jats = "<jats:title>Abstract</jats:title><jats:p>Sleep helps <jats:italic>memory</jats:italic>.</jats:p><jats:p>Second &amp; last.</jats:p>";
    expect(stripMarkup(jats)).toBe("Sleep helps memory. Second & last.");
  });

  it("keeps inline markup from splitting words and block tags from joining them", () => {
    expect(stripMarkup("H<sub>2</sub>O is <i>wet</i>")).toBe("H2O is wet");
    expect(stripMarkup("<p>one</p><p>two</p>")).toBe("one two");
  });

  it("collapses whitespace and handles nothing", () => {
    expect(stripMarkup("  a \n\n  b\t c  ")).toBe("a b c");
    expect(stripMarkup(null)).toBe("");
    expect(stripMarkup(undefined)).toBe("");
    expect(plainTextOrNull("<p> </p>")).toBeNull();
    expect(plainTextOrNull("<p>x</p>")).toBe("x");
  });
});

describe("toPlainQuery", () => {
  it("removes search-language symbols so a provider cannot misread them", () => {
    expect(toPlainQuery('sleep AND (memory) -noise "consolidation": +test')).toBe("sleep AND memory noise consolidation test");
  });

  it("keeps letters and digits from any language", () => {
    expect(toPlainQuery("Konsolidace paměti ve spánku 2024")).toBe("Konsolidace paměti ve spánku 2024");
  });

  it("returns an empty string when nothing is left", () => {
    expect(toPlainQuery('  "(:)"  ')).toBe("");
  });
});

describe("parseYear", () => {
  it.each([
    [2024, 2024],
    ["2024", 2024],
    ["2024-06-03", 2024],
    ["2019 Oct", 2019],
    ["Oct 2019", 2019],
    ["2019-2020", 2019],
  ])("reads %j as %j", (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });

  it.each([[null], [undefined], [""], ["n.d."], [12], ["20245"], [{}]])("reads %j as null", (input) => {
    expect(parseYear(input)).toBeNull();
  });
});

describe("toLanguageCode", () => {
  it("maps common three-letter codes and keeps two-letter ones", () => {
    expect(toLanguageCode("eng")).toBe("en");
    expect(toLanguageCode("FRE")).toBe("fr");
    expect(toLanguageCode("zho")).toBe("zh");
    expect(toLanguageCode("EN")).toBe("en");
  });

  it("returns null rather than guessing", () => {
    expect(toLanguageCode("xyz")).toBeNull();
    expect(toLanguageCode("constructor")).toBeNull();
    expect(toLanguageCode(null)).toBeNull();
    expect(toLanguageCode("")).toBeNull();
  });
});
