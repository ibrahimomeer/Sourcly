import { defaultScoringSettings, type LabelOverride } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import { toggleInList, withFactor, withOverride } from "./settings";

describe("toggleInList", () => {
  it("adds a missing value and removes a present one, without mutating", () => {
    const list: readonly string[] = ["primary"];
    expect(toggleInList(list, "secondary")).toEqual(["primary", "secondary"]);
    expect(toggleInList(list, "primary")).toEqual([]);
    expect(list).toEqual(["primary"]);
  });
});

describe("withFactor", () => {
  it("changes one factor and leaves the rest and the original untouched", () => {
    const original = defaultScoringSettings();
    const changed = withFactor(original, "citations", { weight: 4 });

    expect(changed.factors.citations).toEqual({ enabled: true, weight: 4 });
    expect(changed.factors.relevance).toEqual(original.factors.relevance);
    expect(original.factors.citations.weight).toBe(1);
  });

  it("can switch a factor off while keeping its weight", () => {
    const changed = withFactor(defaultScoringSettings(), "relevance", { enabled: false });
    expect(changed.factors.relevance).toEqual({ enabled: false, weight: 3 });
  });

  it("keeps preferred levels and half-life", () => {
    const original = { ...defaultScoringSettings(), preferredLevels: ["primary" as const], recencyHalfLifeYears: 7 };
    const changed = withFactor(original, "recency", { weight: 2 });
    expect(changed.preferredLevels).toEqual(["primary"]);
    expect(changed.recencyHalfLifeYears).toBe(7);
  });
});

describe("withOverride", () => {
  const start = new Map<string, LabelOverride>();

  it("adds an override for a result", () => {
    const next = withOverride(start, "10.1/a", { level: "secondary" });
    expect(next.get("10.1/a")).toEqual({ level: "secondary" });
    expect(start.size).toBe(0);
  });

  it("merges a second axis into the same result's override", () => {
    const one = withOverride(start, "10.1/a", { level: "secondary" });
    const two = withOverride(one, "10.1/a", { peerReview: "not-peer-reviewed" });
    expect(two.get("10.1/a")).toEqual({ level: "secondary", peerReview: "not-peer-reviewed" });
  });

  it("clears one axis when it is set to undefined, keeping the other", () => {
    const both = withOverride(start, "10.1/a", { level: "secondary", peerReview: "unknown" });
    const cleared = withOverride(both, "10.1/a", { level: undefined });
    expect(cleared.get("10.1/a")).toEqual({ peerReview: "unknown" });
    expect(Object.keys(cleared.get("10.1/a") ?? {})).toEqual(["peerReview"]);
  });

  it("removes the result entirely once nothing is overridden", () => {
    const one = withOverride(start, "10.1/a", { level: "secondary" });
    expect(withOverride(one, "10.1/a", { level: undefined }).has("10.1/a")).toBe(false);
  });

  it("keeps other results' overrides", () => {
    const one = withOverride(start, "10.1/a", { level: "secondary" });
    const two = withOverride(one, "10.1/b", { level: "other" });
    expect(two.get("10.1/a")).toEqual({ level: "secondary" });
    expect(two.get("10.1/b")).toEqual({ level: "other" });
  });
});
