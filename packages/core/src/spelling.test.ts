import { describe, expect, it } from "vitest";
import { parseQuery } from "./query";
import { suggestSpelling, wordsToSpellcheck } from "./spelling";

describe("wordsToSpellcheck", () => {
  const words = (text: string) => wordsToSpellcheck(parseQuery(text));

  it("is the plain words of the search, lowercase, each once, in order", () => {
    expect(words("Chaos double pendulm chaos")).toEqual(["chaos", "double", "pendulm"]);
  });

  it("leaves out quoted phrases, which are searched as written", () => {
    expect(words('"memry consolidation" sleep')).toEqual(["sleep"]);
  });

  it("leaves out words with a hyphen or a digit, groups of alternatives and words after NOT", () => {
    expect(words("self-organizing p53 systems")).toEqual(["systems"]);
    expect(words("sleep (memry OR dreams)")).toEqual(["sleep"]);
    expect(words("sleep NOT ratz")).toEqual(["sleep"]);
  });

  it("leaves out short words and all-capital abbreviations", () => {
    expect(words("CAN bus WHO tabs sleep")).toEqual(["tabs", "sleep"]);
    expect(words("cat dog sleep")).toEqual(["sleep"]);
  });

  it("has nothing to look at when no word is eligible", () => {
    expect(words('"to be or not to be"')).toEqual([]);
    expect(words("")).toEqual([]);
  });
});

describe("suggestSpelling", () => {
  const always = () => true;
  const never = () => false;

  it("replaces the misspelt word and changes nothing else in the text", () => {
    expect(suggestSpelling("chaos double pendulm", ["chaos", "double", "pendulm"], "chaos double pendulum", always)).toEqual({
      text: "chaos double pendulum",
      changes: [{ from: "pendulm", to: "pendulum" }],
    });
  });

  it("keeps operators, parentheses and the spacing around the word", () => {
    const suggestion = suggestSpelling('  (sleep OR nap)   memry NOT "memry foam"', ["memry"], "memory", always);
    expect(suggestion?.text).toBe('  (sleep OR nap)   memory NOT "memry foam"');
  });

  it("leaves a word inside quotes alone, because a phrase is searched as written", () => {
    expect(suggestSpelling('"memry foam" memry', ["memry"], "memory", always)?.text).toBe('"memry foam" memory');
  });

  it("keeps a leading capital and replaces the word wherever it stands alone", () => {
    expect(suggestSpelling("Memry and memry, memryx", ["memry"], "memory", always)?.text).toBe("Memory and memory, memryx");
  });

  it("changes only words that are rare in the results, so a word the results contain is trusted", () => {
    const rare = (word: string) => word === "pendulm";
    expect(suggestSpelling("self organizing pendulm", ["self", "organizing", "pendulm"], "elf organizing pendulum", rare)).toEqual({
      text: "self organizing pendulum",
      changes: [{ from: "pendulm", to: "pendulum" }],
    });
    expect(suggestSpelling("self organizing", ["self", "organizing"], "elf organizing", never)).toBeNull();
  });

  it("offers nothing when the checker has no answer or changed nothing", () => {
    expect(suggestSpelling("sleep memory", ["sleep", "memory"], null, always)).toBeNull();
    expect(suggestSpelling("sleep memory", ["sleep", "memory"], "sleep memory", always)).toBeNull();
    expect(suggestSpelling("sleep", [], "sleep", always)).toBeNull();
  });

  it("offers nothing when the checker dropped or joined a word, because the words cannot be matched up", () => {
    expect(suggestSpelling("covid vacine", ["covid", "vacine"], "vaccine", always)).toBeNull();
    expect(suggestSpelling("sleep memry", ["sleep", "memry"], "sleep memory consolidation", always)).toBeNull();
  });

  it("never puts anything but letters into the text", () => {
    expect(suggestSpelling("sleep memry", ["sleep", "memry"], "sleep mem\"ory", always)).toBeNull();
    expect(suggestSpelling("sleep memry", ["sleep", "memry"], "sleep (memory)", always)).toBeNull();
  });

  it("does not depend on the order of the changes", () => {
    const text = "sleeep memry";
    expect(suggestSpelling(text, ["sleeep", "memry"], "sleep memory", always)?.text).toBe("sleep memory");
    expect(suggestSpelling("memry sleeep", ["memry", "sleeep"], "memory sleep", always)?.text).toBe("memory sleep");
  });
});
