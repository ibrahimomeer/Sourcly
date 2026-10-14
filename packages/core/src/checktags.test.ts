import { describe, expect, it } from "vitest";
import { CHECK_TAGS, isCheckTag } from "./checktags";

describe("check tags", () => {
  it("has the 40 headings named by NLM, each once", () => {
    expect(CHECK_TAGS.size).toBe(40);
  });

  it("recognises a check tag whatever its capitals or surrounding spaces", () => {
    for (const term of ["Humans", "humans", " MALE ", "Aged, 80 and over", "History, 19th Century", "United States"]) {
      expect(isCheckTag(term)).toBe(true);
    }
  });

  it("does not treat topical headings as check tags", () => {
    for (const term of ["Sleep", "Polysomnography", "Memory Consolidation", "Human Development", "Child Development"]) {
      expect(isCheckTag(term)).toBe(false);
    }
  });
});
