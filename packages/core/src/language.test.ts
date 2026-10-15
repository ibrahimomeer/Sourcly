import { describe, expect, it } from "vitest";
import { UNKNOWN_LANGUAGE, countLanguages, languageName, languageOf } from "./language";

describe("languageName", () => {
  it("writes a language code as its English name", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("pt")).toBe("Portuguese");
    expect(languageName("zh")).toBe("Chinese");
    expect(languageName("vi")).toBe("Vietnamese");
  });

  it("calls a missing language unknown", () => {
    expect(languageName(null)).toBe("unknown");
    expect(languageName(UNKNOWN_LANGUAGE)).toBe("unknown");
  });

  it("shows a code it does not know in capitals instead of failing", () => {
    expect(languageName("xx")).toBe("XX");
    expect(languageName("not a code!")).toBe("NOT A CODE!");
  });
});

describe("languageOf", () => {
  it("is the language, or unknown", () => {
    expect(languageOf({ language: "en" })).toBe("en");
    expect(languageOf({ language: null })).toBe("unknown");
  });
});

describe("countLanguages", () => {
  const results = [
    { language: "en" },
    { language: "en" },
    { language: "pt" },
    { language: null },
    { language: null },
    { language: null },
    { language: "vi" },
    { language: "en" },
  ];

  it("counts each language, most first, with unknown last however many there are", () => {
    expect(countLanguages(results)).toEqual([
      { code: "en", name: "English", count: 3 },
      { code: "pt", name: "Portuguese", count: 1 },
      { code: "vi", name: "Vietnamese", count: 1 },
      { code: "unknown", name: "unknown", count: 3 },
    ]);
  });

  it("breaks ties by name, so the order is always the same", () => {
    expect(countLanguages([{ language: "vi" }, { language: "pt" }]).map((l) => l.code)).toEqual(["pt", "vi"]);
    expect(countLanguages([{ language: "pt" }, { language: "vi" }]).map((l) => l.code)).toEqual(["pt", "vi"]);
  });

  it("lists a chosen language even when no result has it", () => {
    expect(countLanguages([{ language: "en" }], ["de"])).toEqual([
      { code: "en", name: "English", count: 1 },
      { code: "de", name: "German", count: 0 },
    ]);
  });

  it("is empty for no results and nothing chosen", () => {
    expect(countLanguages([])).toEqual([]);
  });
});
