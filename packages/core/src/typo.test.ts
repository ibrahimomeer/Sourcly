import { describe, expect, it } from "vitest";
import { MAX_TYPO_DISTANCE, MIN_SUGGESTION_RESULTS, damerauLevenshtein, suggestTypos, wordsToCheck } from "./typo";
import { parseQuery } from "./query";

type Doc = { title: string; abstract: string | null };
const docs = (...titles: string[]): Doc[] => titles.map((title) => ({ title, abstract: null }));
/** The same title `times` times, made different by a number so each is its own result. */
const repeat = (title: string, times: number): Doc[] => docs(...Array.from({ length: times }, (_, i) => `${title} ${i}`));
const suggest = (text: string, results: Doc[]) => suggestTypos(parseQuery(text), results);

describe("damerauLevenshtein", () => {
  it.each([
    ["caos", "chaos", 1],
    ["pendulm", "pendulum", 1],
    ["teh", "the", 1],
    ["chaos", "chaos", 0],
    ["caos", "case", 2],
    ["abcd", "abxy", 2],
  ])("%s to %s is %i", (a, b, expected) => {
    expect(damerauLevenshtein(a, b, 3)).toBe(expected);
  });

  it("counts a swap of two neighbouring letters as one edit", () => {
    expect(damerauLevenshtein("recieve", "receive", 2)).toBe(1);
  });

  it("stops early: anything over the limit is limit + 1", () => {
    expect(damerauLevenshtein("pendulum", "chaos", 2)).toBe(3);
    expect(damerauLevenshtein("a", "abcdef", 2)).toBe(3);
  });
});

describe("wordsToCheck", () => {
  const words = (text: string) => wordsToCheck(parseQuery(text));

  it("is the plain words of the search, lowercase, each once, in order", () => {
    expect(words("Chaos double pendulm chaos")).toEqual(["chaos", "double", "pendulm"]);
  });

  it("leaves out phrases, hyphenated words, words with digits, groups of alternatives, words after NOT, abbreviations and short words", () => {
    expect(words('"memry foam" self-organizing p53 CAN cat sleep')).toEqual(["sleep"]);
    expect(words("sleep (memry OR dreams) NOT ratz")).toEqual(["sleep"]);
  });
});

describe("suggestTypos: “Did you mean”", () => {
  const pendulumPapers = repeat("The double pendulum", 12);

  it("suggests the word many results have in place of one that almost none has", () => {
    const suggestion = suggest("caos double pendulum", [...repeat("Chaos in a double pendulum", 8), ...docs("Caos em osciladores", "Teoria do Caos", "Caos"), ...pendulumPapers]);
    expect(suggestion).toEqual({
      text: "chaos double pendulum",
      changes: [{ from: "caos", to: "chaos", resultsWithFrom: 3, resultsWithTo: 8 }],
    });
  });

  it("needs the suggested word in at least 5 results", () => {
    expect(MIN_SUGGESTION_RESULTS).toBe(5);
    expect(suggest("pendulm", repeat("pendulum", 4))).toBeNull();
    expect(suggest("pendulm", repeat("pendulum", 5))?.text).toBe("pendulum");
  });

  it("needs 3 times as many results as the typed word has when two edits apart, and 2 times when one edit apart", () => {
    // "caos" is 3 results; "chaos" (one edit) needs 6. "case" (two edits) would need 9.
    expect(suggest("caos", [...docs("caos", "caos", "caos"), ...repeat("chaos", 5)])).toBeNull();
    expect(suggest("caos", [...docs("caos", "caos", "caos"), ...repeat("chaos", 6)])?.text).toBe("chaos");
    expect(suggest("caos", [...docs("caos", "caos", "caos"), ...repeat("case", 8)])).toBeNull();
    expect(suggest("caos", [...docs("caos", "caos", "caos"), ...repeat("case", 9)])?.text).toBe("case");
  });

  it("prefers the nearer word to the commoner one", () => {
    const suggestion = suggest("caos", [...docs("caos", "caos", "caos"), ...repeat("chaos", 8), ...repeat("case", 30)]);
    expect(suggestion?.text).toBe("chaos");
  });

  it("only looks at words within 2 edits that start with the same letter", () => {
    expect(MAX_TYPO_DISTANCE).toBe(2);
    expect(suggest("pendulm", repeat("endulum", 10))).toBeNull();
    expect(suggest("abcdef", repeat("abxyzf", 10))).toBeNull();
  });

  it("is silent when the word that was typed is in many results", () => {
    expect(suggest("chaos", [...repeat("chaos", 20), ...repeat("chaoss", 80)])).toBeNull();
    expect(suggest("pendulum", repeat("pendulum", 20))).toBeNull();
  });

  it("reads the abstract as well as the title, and compares plural forms as one word", () => {
    const results = [...Array.from({ length: 6 }, () => ({ title: "A study", abstract: "Pendulums swing." })), { title: "pendulm", abstract: null }];
    // The word is written as the results write it, here a plural.
    expect(suggestTypos(parseQuery("pendulm"), results)?.text).toBe("pendulums");
  });

  it("keeps everything else in the text as it was typed, and leaves quoted words alone", () => {
    const suggestion = suggest('Caos "caos theory" (dynamics OR caos)', [...docs("caos", "caos"), ...repeat("chaos double", 10)]);
    expect(suggestion?.text).toBe('Chaos "caos theory" (dynamics OR chaos)');
  });

  it("suggests nothing for a word that is not checked: a phrase, a hyphenated word or an abbreviation", () => {
    expect(suggest('"caos"', [...docs("caos"), ...repeat("chaos", 10)])).toBeNull();
    expect(suggest("caos-x", [...docs("caos-x"), ...repeat("chaos", 10)])).toBeNull();
  });

  it("changes every word it has a suggestion for, and gives nothing when there are no results", () => {
    const suggestion = suggest("caos pendulm", [...docs("caos", "pendulm"), ...repeat("chaos pendulum", 10)]);
    expect(suggestion?.text).toBe("chaos pendulum");
    expect(suggestion?.changes.map((c) => c.from)).toEqual(["caos", "pendulm"]);
    expect(suggest("caos", [])).toBeNull();
  });

  it("keeps a leading capital", () => {
    expect(suggest("Caos theory", [...docs("caos"), ...repeat("chaos", 10)])?.text).toBe("Chaos theory");
  });

  it("is deterministic: the same results always give the same suggestion", () => {
    const results = [...docs("caos", "caos"), ...repeat("chaos", 8), ...repeat("case", 8)];
    expect(suggest("caos", results)).toEqual(suggest("caos", [...results].reverse()));
  });
});
