import { describe, expect, it } from "vitest";
import { STOPWORDS } from "./stopwords";
import {
  MAX_VARIANTS,
  describeBlock,
  hardBlocks,
  isUsableConcepts,
  parseConcepts,
  withLexicon,
  withoutBlock,
  type ConceptQuery,
} from "./concepts";
import { SOFT_TERMS } from "./softterms";

const labels = (text: string, options = {}) => hardBlocks(parseConcepts(text, options)).map((block) => block.label);
const variantsOf = (query: ConceptQuery, label: string) => query.blocks.find((block) => block.label === label)?.variants.map((variant) => variant.text) ?? [];

describe("parseConcepts: the three classes of word", () => {
  it("never searches a common word, sets a generic word aside, and requires every other word", () => {
    const query = parseConcepts("How AI understand odor");
    expect(query.stopwords).toEqual(["how"]);
    expect(query.soft.map((term) => term.text)).toEqual(["understand"]);
    expect(labels("How AI understand odor")).toEqual(["AI", "odor"]);
    expect(isUsableConcepts(query)).toBe(true);
  });

  it("does not require a generic word: it is a soft term, not a block", () => {
    const query = parseConcepts("machine learning odor prediction using novel approach");
    expect(query.soft.map((term) => term.text)).toEqual(["using", "novel", "approach"]);
    expect(hardBlocks(query).map((block) => block.label)).toEqual(["machine learning", "odor", "prediction"]);
  });

  it("makes every non-common word required when the search has nothing but generic words", () => {
    const query = parseConcepts("new novel approach");
    expect(query.promotedSoft).toBe(true);
    expect(hardBlocks(query).map((block) => block.label)).toEqual(["new", "novel", "approach"]);
    expect(query.soft).toEqual([]);
  });

  it("cannot be searched when it is only common words", () => {
    const query = parseConcepts("what is the of");
    expect(isUsableConcepts(query)).toBe(false);
    expect(query.stopwords).toEqual(["what", "is", "the", "of"]);
    expect(isUsableConcepts(parseConcepts(""))).toBe(false);
  });

  it("numbers the blocks b1, b2, ... in the order typed", () => {
    expect(hardBlocks(parseConcepts("chaos double pendulum")).map((block) => block.id)).toEqual(["b1", "b2"]);
  });

  it("keeps the fixed lists fixed: generic words are not common words, and are all lowercase", () => {
    for (const word of SOFT_TERMS) {
      expect(word).toBe(word.toLowerCase());
      expect(STOPWORDS.has(word)).toBe(false);
    }
    for (const word of ["understand", "using", "use", "used", "work", "way", "make", "help", "new", "novel", "study", "effect", "impact", "role", "based", "approach", "via", "toward", "towards"]) {
      expect(SOFT_TERMS).toContain(word);
    }
  });
});

describe("parseConcepts: phrases, abbreviations and the words around them", () => {
  it("makes one required block of a quoted phrase, and never adds alternatives to it", () => {
    const query = parseConcepts('"state of the art" odor');
    const [phrase, odor] = hardBlocks(query);
    expect(phrase).toMatchObject({ label: "state of the art", quoted: true });
    expect(phrase?.variants.map((variant) => variant.text)).toEqual(["state of the art"]);
    expect(odor?.quoted).toBe(false);
    expect(variantsOf(parseConcepts('"odor"'), "odor")).toEqual(["odor"]);
  });

  it("keeps the common words inside quotes", () => {
    expect(parseConcepts('"state of the art"').stopwords).toEqual([]);
  });

  it("joins the words of a phrase the thesaurus knows into one block", () => {
    expect(labels("climate change impact on coral reefs")).toEqual(["climate change", "coral reefs"]);
    expect(labels("machine learning odor prediction")).toEqual(["machine learning", "odor", "prediction"]);
  });

  it("does not join words that only sit next to each other", () => {
    expect(labels("CAN bus protocol")).toEqual(["CAN", "bus", "protocol"]);
    expect(labels("chaos double pendulum")).toEqual(["chaos", "double pendulum"]);
  });

  it("always requires a word in capitals, even when its lowercase form is a common word", () => {
    expect(labels("CAN bus protocol")[0]).toBe("CAN");
    expect(parseConcepts("CAN bus protocol").stopwords).toEqual([]);
    // The verb "can" is a common word and is left out.
    const verb = parseConcepts("can AI predict odor");
    expect(verb.stopwords).toEqual(["can"]);
    expect(hardBlocks(verb).map((block) => block.label)).toEqual(["AI", "predict", "odor"]);
  });

  it("marks an abbreviation to be matched with its capitals", () => {
    const [ai] = hardBlocks(parseConcepts("AI odor"));
    expect(ai?.variants[0]).toMatchObject({ text: "AI", caseSensitive: true, origin: "typed" });
    const [odor] = hardBlocks(parseConcepts("odor"));
    expect(odor?.variants[0]?.caseSensitive).toBe(false);
  });

  it("treats a hyphenated word as one block with its parts next to each other", () => {
    const [off] = hardBlocks(parseConcepts("off-target"));
    expect(off?.variants[0]).toMatchObject({ text: "off-target", words: ["off", "target"], keys: ["off", "target"] });
  });

  it("reads OR groups as one block that is never expanded, and NOT as words to leave out", () => {
    const query = parseConcepts("(sleep OR nap) memory NOT rats");
    const [group, memory] = hardBlocks(query);
    expect(group).toMatchObject({ quoted: true });
    expect(group?.variants.map((variant) => variant.text)).toEqual(["sleep", "nap"]);
    expect(memory?.label).toBe("memory");
    expect(query.exclusions.map((variant) => variant.text)).toEqual(["rats"]);
  });

  it("applies a NOT typed after an OR to the whole search", () => {
    expect(parseConcepts("sleep OR nap memory NOT rats").exclusions.map((variant) => variant.text)).toEqual(["rats"]);
  });

  it("notes that the text looks like a question", () => {
    expect(parseConcepts("how do vaccines train the immune system").looksLikeQuestion).toBe(true);
    expect(parseConcepts("vaccines immune system").looksLikeQuestion).toBe(false);
  });
});

describe("parseConcepts: the curated thesaurus", () => {
  it("adds spellings, abbreviations and tight synonyms to a block, the typed word first", () => {
    const query = parseConcepts("How AI understand odor");
    expect(variantsOf(query, "odor")).toEqual(["odor", "odour", "odorant", "olfaction", "olfactory", "sense of smell"]);
    expect(variantsOf(query, "AI")).toEqual(["AI", "artificial intelligence", "machine learning", "deep learning", "neural network"]);
    expect(query.expanded).toBe(true);
  });

  it("says which variants came from the thesaurus, with the kind of entry and its note", () => {
    const [, odor] = hardBlocks(parseConcepts("AI odor"));
    expect(odor?.variants[0]?.origin).toBe("typed");
    const odour = odor?.variants.find((variant) => variant.text === "odour");
    expect(odour).toMatchObject({ origin: "thesaurus", entryType: "spelling" });
    expect(odour?.note).toMatch(/\S/);
  });

  it("does not drift: odor never stands for aroma or flavor", () => {
    const words = variantsOf(parseConcepts("odor"), "odor").join(" ").toLowerCase();
    expect(words).not.toMatch(/aroma|flavo/);
  });

  it("lets a synonym entry work one way only", () => {
    expect(variantsOf(parseConcepts("machine learning"), "machine learning")).not.toContain("AI");
  });

  it("never gives a block more than the allowed number of variants", () => {
    for (const text of ["AI", "odor", "CRISPR", "covid-19", "machine learning", "prediction"]) {
      for (const block of parseConcepts(text).blocks) expect(block.variants.length).toBeLessThanOrEqual(MAX_VARIANTS);
    }
  });

  it("adds nothing when the setting is off", () => {
    const query = parseConcepts("How AI understand odor", { synonyms: false });
    expect(variantsOf(query, "odor")).toEqual(["odor"]);
    expect(variantsOf(query, "AI")).toEqual(["AI"]);
    expect(query.expanded).toBe(false);
  });
});

describe("parseConcepts: exactly as typed", () => {
  it("keeps every word, sets nothing aside and adds nothing", () => {
    const query = parseConcepts("How AI understand odor", { exact: true });
    expect(query.exact).toBe(true);
    expect(query.stopwords).toEqual([]);
    expect(query.soft).toEqual([]);
    expect(hardBlocks(query).map((block) => block.label)).toEqual(["How", "AI", "understand", "odor"]);
    expect(query.blocks.every((block) => block.variants.length === 1)).toBe(true);
  });
});

describe("blocks: helpers", () => {
  it("is deterministic and does not share state between calls", () => {
    const a = parseConcepts("How AI understand odor");
    const b = parseConcepts("How AI understand odor");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("describes a block as the typed word and its variants", () => {
    expect(describeBlock(hardBlocks(parseConcepts("odor"))[0] as never)).toBe("odor (odour, odorant, olfaction, olfactory, sense of smell)");
  });

  it("drops one block", () => {
    const query = parseConcepts("machine learning odor prediction");
    expect(hardBlocks(withoutBlock(query, "b2")).map((block) => block.label)).toEqual(["machine learning", "prediction"]);
  });

  it("adds the counterargument terms as one more block that is not part of the coverage", () => {
    const query = withLexicon(parseConcepts("sleep memory"), ["limitation", "no evidence"]);
    const lexicon = query.blocks.find((block) => block.kind === "lexicon");
    expect(lexicon?.variants.map((variant) => variant.text)).toEqual(["limitation", "no evidence"]);
    expect(hardBlocks(query).map((block) => block.label)).toEqual(["sleep", "memory"]);
    expect(withLexicon(parseConcepts("sleep"), [])).toEqual(parseConcepts("sleep"));
  });
});
