import { describe, expect, it } from "vitest";
import { blockedRequestMessage, looksBlockedFromFile, runningFromFile } from "./runtime";

describe("runningFromFile", () => {
  it("is true for a page opened from disk (file:), false for a website", () => {
    expect(runningFromFile({ protocol: "file:" })).toBe(true);
    expect(runningFromFile({ protocol: "https:" })).toBe(false);
    expect(runningFromFile({ protocol: "http:" })).toBe(false);
  });

  it("is false when there is no window to ask", () => {
    expect(runningFromFile(undefined)).toBe(typeof window === "undefined" ? false : window.location.protocol === "file:");
  });
});

describe("blockedRequestMessage", () => {
  it("is the sentence that points to the website", () => {
    expect(blockedRequestMessage("https://sourcly.getscove.com")).toBe(
      "Your browser blocked a request from a local file. Use the website instead: https://sourcly.getscove.com.",
    );
  });

  it("does not name an address the site does not have", () => {
    expect(blockedRequestMessage("")).toBe("Your browser blocked a request from a local file. Use the website instead.");
  });
});

describe("looksBlockedFromFile", () => {
  it("is true from a file when a request failed in the browser itself (a fetch TypeError)", () => {
    expect(looksBlockedFromFile(true, [{ network: true }])).toBe(true);
    expect(looksBlockedFromFile(true, [{}, { network: true }])).toBe(true);
  });

  it("is false for an HTTP error or a rate limit, which carry no network mark", () => {
    expect(looksBlockedFromFile(true, [{}, {}])).toBe(false);
    expect(looksBlockedFromFile(true, [])).toBe(false);
  });

  it("is false on the website, whatever failed", () => {
    expect(looksBlockedFromFile(false, [{ network: true }])).toBe(false);
  });
});
