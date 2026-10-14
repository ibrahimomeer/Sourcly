import { describe, expect, it } from "vitest";
import { copyrightYears } from "./copyright";

describe("copyrightYears", () => {
  it("shows a single year in 2026", () => {
    expect(copyrightYears(2026)).toBe("2026");
  });

  it("shows a range with an en dash after 2026", () => {
    expect(copyrightYears(2027)).toBe("2026–2027");
    expect(copyrightYears(2031)).toBe("2026–2031");
  });

  it("never shows a range that starts after it ends", () => {
    expect(copyrightYears(2025)).toBe("2026");
  });
});
