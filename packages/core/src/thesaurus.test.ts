import { describe, expect, it } from "vitest";
import { isAbbreviation, parseConcepts } from "./concepts";
import { KNOWN_PHRASES, THESAURUS, type ThesaurusEntry } from "./thesaurus";

const terms = (entry: ThesaurusEntry): string[] => (typeof entry.term === "string" ? [entry.term] : [...entry.term]);
const words = (text: string) => text.split(/[\s-]+/).filter((word) => word !== "");

describe("the thesaurus is data a person can check", () => {
  it("has about 200 entries", () => {
    expect(THESAURUS.length).toBeGreaterThanOrEqual(200);
    expect(THESAURUS.length).toBeLessThanOrEqual(400);
  });

  it("gives every entry a type, a one-line note and at least one variant", () => {
    for (const entry of THESAURUS) {
      expect(["spelling", "abbreviation", "synonym"], terms(entry).join()).toContain(entry.type);
      expect(entry.note.trim(), terms(entry).join()).not.toBe("");
      expect(entry.note, terms(entry).join()).not.toContain("\n");
      expect(entry.variants.length, terms(entry).join()).toBeGreaterThan(0);
      expect(entry.variants.length, terms(entry).join()).toBeLessThanOrEqual(7);
    }
  });

  it("never lists a term as a variant of itself", () => {
    for (const entry of THESAURUS) {
      for (const term of terms(entry)) expect(entry.variants.map((v) => v.toLowerCase()), term).not.toContain(term.toLowerCase());
    }
  });

  it("has no empty or padded text", () => {
    for (const entry of THESAURUS) {
      for (const text of [...terms(entry), ...entry.variants]) expect(text, text).toBe(text.trim().replace(/\s+/g, " "));
    }
    for (const phrase of KNOWN_PHRASES) expect(phrase, phrase).toBe(phrase.trim());
  });

  it("states every spelling pair between two words that differ only in spelling, not in meaning", () => {
    for (const entry of THESAURUS.filter((e) => e.type === "spelling")) {
      expect(entry.note).toMatch(/spelling/i);
    }
  });

  it("keeps the abbreviations in capitals, so they are matched with their capitals", () => {
    const abbreviations = THESAURUS.filter((e) => e.type === "abbreviation");
    expect(abbreviations.length).toBeGreaterThan(40);
    for (const entry of abbreviations) {
      const short = terms(entry)[0] as string;
      expect(isAbbreviation(words(short)) || /[A-Z0-9]/.test(short), short).toBe(true);
    }
  });

  it("covers the abbreviations and spellings the search needs: AI, ML, DL, CNN, GNN, NLP, CRISPR, odor/odour", () => {
    const all = new Set(THESAURUS.flatMap(terms));
    for (const term of ["AI", "ML", "DL", "CNN", "GNN", "NLP", "CRISPR", "odor", "CAN"]) expect(all.has(term), term).toBe(true);
  });

  it("does not let odor drift to aroma or flavor, the example the rules give", () => {
    for (const entry of THESAURUS.filter((e) => terms(e).some((t) => /^(odou?r|smell|olfaction)$/i.test(t)))) {
      expect(entry.variants.join(" ").toLowerCase(), terms(entry).join()).not.toMatch(/aroma|flavo|fragran|scent/);
    }
  });

  it("does not let odor bring the bare word smell, which is also a software term (a code smell)", () => {
    const odor = parseConcepts("odor").blocks[0];
    const texts = odor?.variants.map((v) => v.text) ?? [];
    expect(texts).toContain("sense of smell");
    expect(texts).not.toContain("smell");
    // A person who types smell still gets the sense of smell.
    expect(parseConcepts("smell").blocks[0]?.variants.map((v) => v.text)).toEqual(["smell", "odor", "odour", "olfaction", "olfactory"]);
  });

  it("expands AI to the four tight terms and no further", () => {
    const ai = parseConcepts("AI").blocks[0];
    expect(ai?.variants.map((v) => v.text)).toEqual(["AI", "artificial intelligence", "machine learning", "deep learning", "neural network"]);
  });
});
