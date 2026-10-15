import { describe, expect, it } from "vitest";
import rootPackage from "../../../package.json";
import { APP_VERSION, versionLabel } from "./version";

describe("APP_VERSION", () => {
  it("is the version in the root package.json, the one place it is written", () => {
    expect(APP_VERSION).toBe(rootPackage.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("versionLabel", () => {
  it("writes a version number with a v in front", () => {
    expect(versionLabel("0.1.0")).toBe("v0.1.0");
    expect(versionLabel("12.3.45-beta.1")).toBe("v12.3.45-beta.1");
  });

  it("writes nothing when the version is not known, rather than 'vunknown'", () => {
    expect(versionLabel("unknown")).toBe("");
    expect(versionLabel("")).toBe("");
  });
});
