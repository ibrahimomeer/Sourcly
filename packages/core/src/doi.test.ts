import { describe, expect, it } from "vitest";
import { doiUrl, normalizeDoi } from "./doi";

describe("normalizeDoi", () => {
  it.each([
    ["https://doi.org/10.1038/NATURE04286", "10.1038/nature04286"],
    ["http://dx.doi.org/10.1000/xyz123", "10.1000/xyz123"],
    ["https://dx.doi.org/10.1000/xyz123", "10.1000/xyz123"],
    ["doi:10.1000/xyz123", "10.1000/xyz123"],
    ["DOI: 10.1000/XYZ123", "10.1000/xyz123"],
    ["  10.1000/xyz123  ", "10.1000/xyz123"],
    ["10.1016/S0140-6736(20)30367-6", "10.1016/s0140-6736(20)30367-6"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });

  it.each([[""], ["   "], ["not a doi"], ["10.1/short-prefix"], ["https://example.org/10.1000/xyz"]])(
    "rejects %j",
    (input) => {
      expect(normalizeDoi(input)).toBeNull();
    },
  );

  it("returns null for null and undefined", () => {
    expect(normalizeDoi(null)).toBeNull();
    expect(normalizeDoi(undefined)).toBeNull();
  });
});

describe("doiUrl", () => {
  it("builds the https URL form", () => {
    expect(doiUrl("10.1038/nature04286")).toBe("https://doi.org/10.1038/nature04286");
  });
});
