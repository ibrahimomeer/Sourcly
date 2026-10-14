import { describe, expect, it } from "vitest";
import { STOPWORDS } from "./stopwords";
import { stem, tokenize, wordKey } from "./tokens";

describe("stem", () => {
  it.each([
    ["memories", "memory"],
    ["studies", "study"],
    ["sleeps", "sleep"],
    ["processes", "process"],
    ["stresses", "stress"],
    ["boxes", "box"],
    ["diseases", "disease"],
    ["patients", "patient"],
  ])("folds the plural %s to %s", (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it.each([["analysis"], ["status"], ["stress"], ["sleep"], ["consolidation"], ["gas"], ["is"]])(
    "leaves %s alone",
    (word) => {
      expect(stem(word)).toBe(word);
    },
  );

  it("is the same function for singular and plural, which is all matching needs", () => {
    expect(stem("memory")).toBe(stem("memories"));
    expect(stem("study")).toBe(stem("studies"));
  });
});

describe("tokenize", () => {
  it("lowercases, splits on punctuation, drops stopwords and stems plurals", () => {
    expect(tokenize("The Effects of Sleep on Memories: A Meta-Analysis")).toEqual([
      "effect",
      "sleep",
      "memory",
      "meta",
      "analysis",
    ]);
  });

  it("ignores accents so that spelling variants match", () => {
    expect(tokenize("paměť spánek café")).toEqual(tokenize("pamet spanek cafe"));
  });

  it("keeps numbers and drops one-letter words", () => {
    expect(tokenize("COVID-19 in 2020, vitamin C")).toEqual(["covid", "19", "2020", "vitamin"]);
  });

  it("returns nothing for empty text or only common words", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("what is the of and")).toEqual([]);
  });

  it("is deterministic", () => {
    const text = "Sleep-dependent memory consolidation in adults";
    expect(tokenize(text)).toEqual(tokenize(text));
  });
});

describe("STOPWORDS", () => {
  it("covers question words and auxiliaries so a question reduces to its keywords", () => {
    for (const word of ["what", "how", "why", "does", "are", "is", "the", "of", "in"]) {
      expect(STOPWORDS.has(word)).toBe(true);
    }
  });

  it("is only lowercase, and keeps topic words", () => {
    for (const word of STOPWORDS) expect(word).toBe(word.toLowerCase());
    for (const word of ["sleep", "memory", "effect", "children", "study"]) expect(STOPWORDS.has(word)).toBe(false);
  });
});

describe("stem: words ending in s, and irregular plurals", () => {
  it("keeps words that are singular but end in s", () => {
    for (const word of ["bias", "gas", "atlas", "canvas", "alias", "pancreas"]) expect(stem(word)).toBe(word);
  });

  it("folds the irregular plurals academic writing uses", () => {
    expect(stem("biases")).toBe("bias");
    expect(stem("analyses")).toBe("analysis");
    expect(stem("hypotheses")).toBe("hypothesis");
    expect(stem("diagnoses")).toBe("diagnosis");
    expect(stem("syntheses")).toBe("synthesis");
    expect(stem("theses")).toBe("thesis");
    expect(stem("crises")).toBe("crisis");
  });

  it("still leaves ordinary plurals to the general rules", () => {
    expect(stem("cases")).toBe("case");
    expect(stem("diseases")).toBe("disease");
    expect(stem("databases")).toBe("database");
  });
});

describe("wordKey", () => {
  it("makes a word comparable: lowercase, no accents, no apostrophes, plural folded", () => {
    expect(wordKey("Limitations")).toBe("limitation");
    expect(wordKey("RÉPLICATION")).toBe("replication");
    expect(wordKey("Biases")).toBe("bias");
    // The apostrophe goes and the possessive s folds like a plural, so it matches the base word.
    expect(wordKey("memory's")).toBe("memory");
  });

  it("keeps common words, because phrases such as 'no evidence' need them", () => {
    expect(wordKey("No")).toBe("no");
    expect(wordKey("The")).toBe("the");
  });
});
