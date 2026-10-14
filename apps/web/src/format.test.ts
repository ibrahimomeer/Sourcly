import { applyOverride, classify } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { formatAuthors, formatNumber, formatRaw, labelText, pluralize, valueName } from "./format";

describe("labelText", () => {
  it("calls rule-based labels 'likely'", () => {
    const { level, peerReview } = classify(makeResult());
    expect(labelText(level)).toBe("likely primary");
    expect(labelText(peerReview)).toBe("likely peer-reviewed");
  });

  it("does not add 'likely' to unknown", () => {
    const { level } = classify(makeResult({ type: "unknown", rawType: null }));
    expect(labelText(level)).toBe("unknown");
  });

  it("states a user's choice as theirs, with no 'likely'", () => {
    const labels = applyOverride(classify(makeResult()), { level: "tertiary", peerReview: "not-peer-reviewed" });
    expect(labelText(labels.level)).toBe("tertiary (set by you)");
    expect(labelText(labels.peerReview)).toBe("not peer-reviewed (set by you)");
  });

  it("states an override to unknown as the user's choice", () => {
    const labels = applyOverride(classify(makeResult()), { level: "unknown" });
    expect(labelText(labels.level)).toBe("unknown (set by you)");
  });
});

describe("formatAuthors", () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Author ${i + 1}` }));

  it("says so when there are none", () => {
    expect(formatAuthors([])).toBe("No authors listed");
  });

  it("lists a few authors in full", () => {
    expect(formatAuthors(people(3))).toBe("Author 1, Author 2, Author 3");
    expect(formatAuthors(people(6))).toBe("Author 1, Author 2, Author 3, Author 4, Author 5, Author 6");
  });

  it("shortens a long list and says how many are left out", () => {
    expect(formatAuthors(people(9))).toBe("Author 1, Author 2, Author 3, Author 4, Author 5, Author 6 and 3 more");
  });
});

describe("valueName", () => {
  it("capitalizes and fixes the 'not-' prefix", () => {
    expect(valueName("primary")).toBe("Primary");
    expect(valueName("peer-reviewed")).toBe("Peer-reviewed");
    expect(valueName("not-peer-reviewed")).toBe("Not peer-reviewed");
    expect(valueName("unknown")).toBe("Unknown");
  });
});

describe("formatRaw / formatNumber / pluralize", () => {
  it("formats raw factor values", () => {
    expect(formatRaw(null)).toBe("none");
    expect(formatRaw("peer-reviewed")).toBe("peer-reviewed");
    expect(formatRaw(2005)).toBe("2005");
    expect(formatRaw(12.3456)).toBe("12.35");
  });

  it("fixes decimals", () => {
    expect(formatNumber(0.94871794)).toBe("0.95");
    expect(formatNumber(0.5, 3)).toBe("0.500");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "result")).toBe("1 result");
    expect(pluralize(0, "result")).toBe("0 results");
    expect(pluralize(50, "result")).toBe("50 results");
  });
});
