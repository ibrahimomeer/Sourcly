import { describe, expect, it } from "vitest";
import { classify } from "./classify";
import { coverageSpec } from "./coverage";
import { parseQuery } from "./query";
import { FEW_FULL_MATCHES, arrangeResults, defaultLayoutSettings, isArticleLike, matchCountLabel, sectionOf, type LayoutSettings } from "./sections";
import { scoreResults, defaultScoringSettings } from "./scoring";
import { makeResult } from "./testing/make-result";
import type { ProviderHit, ProviderId, Result } from "./types";

const ENGLISH = "the results of the study are described in this paper and we show that the effects of the method are large";
const VIETNAMESE = "Thiết kế và tối ưu hóa bộ điều khiển sử dụng thuật toán di truyền để điều khiển cần cẩu trên cao";
const SPANISH = "Este trabajo estudia el comportamiento de los sistemas dinámicos para la ingeniería y su aplicación";

const hit = (provider: ProviderId): ProviderHit => ({ provider, id: "1", rank: 1, listSize: 1, score: null });
let counter = 0;
const result = (title: string, changes: Partial<Result> = {}): Result => {
  counter += 1;
  return makeResult({ id: `10.1/r${counter}`, doi: `10.1/r${counter}`, title, abstract: null, hits: [hit("openalex")], ...changes });
};

/** Ranks results for a query the way the page does, then arranges them. */
function arrange(results: Result[], text: string, layout: LayoutSettings = defaultLayoutSettings()) {
  const parsed = parseQuery(text);
  const ranked = scoreResults(
    results.map((r) => ({ result: r, labels: classify(r) })),
    defaultScoringSettings(),
    { referenceYear: 2026, queryTerms: [], answeredSources: 1, coverage: coverageSpec(parsed) },
  );
  return arrangeResults(ranked, layout);
}
const titles = (items: { result: Result }[]) => items.map((item) => item.result.title);

describe("the main list", () => {
  it("holds the results that contain every word", () => {
    const layout = arrange([result("Chaos in a double pendulum"), result("A double pendulum"), result("Gardening")], "chaos double pendulum");
    expect(titles(layout.main)).toEqual(["Chaos in a double pendulum", "A double pendulum"]);
  });

  it("adds results that lack one word, after the full matches, while fewer than 10 contain every word", () => {
    const layout = arrange([result("A double pendulum"), result("Chaos in a double pendulum"), result("Gardening"), result("Pendulum clocks")], "chaos double pendulum");
    expect(titles(layout.main)).toEqual(["Chaos in a double pendulum", "A double pendulum"]);
    expect(titles(layout.partial)).toEqual(["Pendulum clocks", "Gardening"]);
  });

  it("does not add them once 10 results contain every word", () => {
    const full = Array.from({ length: FEW_FULL_MATCHES }, (_, i) => result(`Chaos in a double pendulum ${i}`));
    const layout = arrange([...full, result("A double pendulum")], "chaos double pendulum");
    expect(layout.main).toHaveLength(FEW_FULL_MATCHES);
    expect(titles(layout.partial)).toEqual(["A double pendulum"]);
  });

  it("adds them with 9 full matches, because 9 is fewer than 10", () => {
    const full = Array.from({ length: FEW_FULL_MATCHES - 1 }, (_, i) => result(`Chaos in a double pendulum ${i}`));
    const layout = arrange([...full, result("A double pendulum")], "chaos double pendulum");
    expect(layout.main).toHaveLength(FEW_FULL_MATCHES);
  });

  it("never adds a result that lacks two words: those are partial matches", () => {
    const layout = arrange([result("Chaos in a double pendulum"), result("Pendulum clocks"), result("Chaos")], "chaos double pendulum");
    expect(titles(layout.main)).toEqual(["Chaos in a double pendulum"]);
    expect(titles(layout.partial).sort()).toEqual(["Chaos", "Pendulum clocks"]);
  });

  it("adds nothing for a one-word search: all but one would be none of it", () => {
    const layout = arrange([result("Pendulum"), result("Gardening")], "pendulum");
    expect(titles(layout.main)).toEqual(["Pendulum"]);
    expect(titles(layout.partial)).toEqual(["Gardening"]);
  });

  it("labels the near matches “Matches N of M words” and no one else", () => {
    const layout = arrange([result("Chaos in a double pendulum"), result("A double pendulum")], "chaos double pendulum");
    expect(matchCountLabel(layout.main[0]!)).toBeNull();
    expect(matchCountLabel(layout.main[1]!)).toBe("Matches 2 of 3 words");
  });

  it("keeps the order it was given inside every section", () => {
    const layout = arrange([result("Gardening b"), result("Gardening a"), result("Gardening c")], "pendulum");
    expect(titles(layout.partial)).toEqual(["Gardening b", "Gardening a", "Gardening c"].sort((a, b) => titles(layout.partial).indexOf(a) - titles(layout.partial).indexOf(b)));
    expect(layout.partial).toHaveLength(3);
  });
});

describe("nothing is deleted", () => {
  it("puts every result in exactly one place", () => {
    const results = [
      result("Chaos in a double pendulum"),
      result("A double pendulum"),
      result("Gardening"),
      result("A dataset", { type: "dataset" }),
      result(VIETNAMESE),
      result(`Pendulum ${SPANISH}`),
    ];
    const layout = arrange(results, "chaos double pendulum");
    const all = [...layout.main, ...layout.partial, ...layout.otherLanguages, ...layout.otherTypes];
    expect(all).toHaveLength(results.length);
    expect(new Set(all.map((item) => item.result.id)).size).toBe(results.length);
  });
});

describe("other languages", () => {
  it("sends a result in another language there, even if it contains every word", () => {
    const layout = arrange([result("pendulum", { abstract: VIETNAMESE }), result("pendulum", { abstract: ENGLISH })], "pendulum");
    expect(layout.main).toHaveLength(1);
    expect(layout.otherLanguages).toHaveLength(1);
    expect(layout.otherLanguages[0]?.result.abstract).toBe(VIETNAMESE);
  });

  it("goes by the text, not by the source, when they disagree (a Vietnamese paper the source calls English)", () => {
    const layout = arrange([result("pendulum", { abstract: VIETNAMESE, language: "en" })], "pendulum");
    expect(layout.otherLanguages).toHaveLength(1);
  });

  it("keeps a result whose language is not known where its words put it", () => {
    const layout = arrange([result("Pendulum")], "pendulum");
    expect(layout.main).toHaveLength(1);
    expect(layout.otherLanguages).toEqual([]);
  });

  it("uses the source's word when the text is too short to tell", () => {
    const layout = arrange([result("Pendulum", { language: "es" }), result("Pendulum", { language: "en" })], "pendulum");
    expect(layout.main).toHaveLength(1);
    expect(layout.otherLanguages).toHaveLength(1);
  });

  it("puts nothing in it when no language is preferred", () => {
    const layout = arrange([result("pendulum", { abstract: VIETNAMESE })], "pendulum", { ...defaultLayoutSettings(), preferredLanguages: [] });
    expect(layout.main).toHaveLength(1);
  });

  it("follows the preferred languages: choose Spanish and the Spanish paper stays, the English one goes", () => {
    const layout = arrange([result("pendulum", { abstract: SPANISH }), result("pendulum", { abstract: ENGLISH })], "pendulum", { ...defaultLayoutSettings(), preferredLanguages: ["es"] });
    expect(layout.main[0]?.result.abstract).toBe(SPANISH);
    expect(layout.otherLanguages[0]?.result.abstract).toBe(ENGLISH);
  });

  it("allows several preferred languages", () => {
    const layout = arrange([result("pendulum", { abstract: SPANISH }), result("pendulum", { abstract: ENGLISH }), result("pendulum", { abstract: VIETNAMESE })], "pendulum", { ...defaultLayoutSettings(), preferredLanguages: ["es", "en"] });
    expect(layout.main).toHaveLength(2);
    expect(layout.otherLanguages).toHaveLength(1);
  });
});

describe("datasets, presentations and other types", () => {
  it.each([["dataset"], ["thesis"], ["report"], ["reference-entry"], ["other"]] as const)("sends a %s there", (type) => {
    const layout = arrange([result("Pendulum", { type })], "pendulum");
    expect(layout.otherTypes).toHaveLength(1);
    expect(layout.main).toEqual([]);
  });

  it.each([["journal-article"], ["review"], ["preprint"], ["conference-paper"], ["book"], ["book-chapter"], ["unknown"]] as const)("keeps a %s in the main list", (type) => {
    expect(arrange([result("Pendulum", { type })], "pendulum").main).toHaveLength(1);
  });

  it("sends a work only Zenodo or DataCite holds there, whatever its type", () => {
    const layout = arrange([result("Pendulum", { hits: [hit("zenodo")] }), result("Pendulum", { hits: [hit("datacite"), hit("zenodo")] })], "pendulum");
    expect(layout.otherTypes).toHaveLength(2);
  });

  it("keeps a work in the main list when a scholarly source also holds it", () => {
    expect(arrange([result("Pendulum", { hits: [hit("zenodo"), hit("openalex")] })], "pendulum").main).toHaveLength(1);
  });

  it("puts them in the main list when asked to", () => {
    const layout = arrange([result("Pendulum", { type: "dataset" })], "pendulum", { ...defaultLayoutSettings(), showNonArticleTypes: true });
    expect(layout.main).toHaveLength(1);
    expect(layout.otherTypes).toEqual([]);
  });

  it("decides by type before language: a Spanish dataset is a dataset", () => {
    const layout = arrange([result("pendulum", { type: "dataset", abstract: SPANISH })], "pendulum");
    expect(layout.otherTypes).toHaveLength(1);
    expect(layout.otherLanguages).toEqual([]);
  });

  it("does not count them when working out whether fewer than 10 results contain every word", () => {
    const datasets = Array.from({ length: FEW_FULL_MATCHES }, (_, i) => result(`Chaos double pendulum data ${i}`, { type: "dataset" }));
    const layout = arrange([...datasets, result("Chaos in a double pendulum"), result("A double pendulum")], "chaos double pendulum");
    expect(titles(layout.main)).toEqual(["Chaos in a double pendulum", "A double pendulum"]);
  });
});

describe("isArticleLike and sectionOf", () => {
  it("says whether a result is an article", () => {
    expect(isArticleLike({ type: "journal-article", hits: [hit("crossref")] })).toBe(true);
    expect(isArticleLike({ type: "dataset", hits: [hit("openalex")] })).toBe(false);
    expect(isArticleLike({ type: "journal-article", hits: [] })).toBe(true);
  });

  it("says which of the two collapsed sections a result is in before words are looked at, or none", () => {
    const layout = defaultLayoutSettings();
    expect(sectionOf(result("Pendulum", { type: "dataset" }), layout)).toBe("otherTypes");
    expect(sectionOf(result("pendulum", { abstract: VIETNAMESE }), layout)).toBe("otherLanguages");
    expect(sectionOf(result("Pendulum"), layout)).toBeNull();
  });
});
