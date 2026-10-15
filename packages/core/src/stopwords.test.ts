import { describe, expect, it } from "vitest";
import methodology from "../../../docs/methodology.md?raw";
import { STOPWORDS } from "./stopwords";

describe("the common words", () => {
  it("are lowercase letters, each once", () => {
    for (const word of STOPWORDS) expect(word).toMatch(/^[a-z]+$/);
  });

  it("are exactly the list in docs/methodology.md, so the documentation cannot drift from the code", () => {
    const block = /\*\*Common words\.\*\*[\s\S]*?```text\n([\s\S]*?)\n```/.exec(methodology)?.[1] ?? "";
    const documented = block.split(/\s+/).filter((word) => word !== "");
    expect(documented).toEqual([...STOPWORDS].sort());
  });

  it("include the question words and the small words a question is made of", () => {
    for (const word of ["what", "how", "why", "is", "are", "the", "of", "to", "and", "or", "not"]) expect(STOPWORDS.has(word)).toBe(true);
  });

  it("do not include words that carry a topic", () => {
    for (const word of ["best", "way", "predict", "odor", "chaos", "pendulum", "double", "sleep", "memory", "effect"]) {
      expect(STOPWORDS.has(word)).toBe(false);
    }
  });
});
