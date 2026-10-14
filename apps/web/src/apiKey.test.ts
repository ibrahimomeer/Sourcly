import { describe, expect, it } from "vitest";
import { loadApiKey, maskApiKey, saveApiKey, type KeyStorage } from "./apiKey";

function fakeStorage(initial: Record<string, string> = {}): KeyStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const brokenStorage: KeyStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota exceeded");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("saveApiKey / loadApiKey", () => {
  it("round-trips a key, trimmed", () => {
    const storage = fakeStorage();
    expect(saveApiKey(storage, "  abc123  ")).toBe(true);
    expect(loadApiKey(storage)).toBe("abc123");
  });

  it("forgets the key when saved blank", () => {
    const storage = fakeStorage();
    saveApiKey(storage, "abc123");
    expect(saveApiKey(storage, "   ")).toBe(true);
    expect(loadApiKey(storage)).toBe("");
    expect(storage.data.size).toBe(0);
  });

  it("stores the key under one namespaced entry and nothing else", () => {
    const storage = fakeStorage();
    saveApiKey(storage, "abc123");
    expect([...storage.data.keys()]).toEqual(["sourcly.openalexApiKey"]);
  });

  it("loads an empty key when nothing is saved", () => {
    expect(loadApiKey(fakeStorage())).toBe("");
  });

  it("does not throw when storage is missing or blocked", () => {
    expect(loadApiKey(null)).toBe("");
    expect(loadApiKey(brokenStorage)).toBe("");
    expect(saveApiKey(null, "abc123")).toBe(false);
    expect(saveApiKey(brokenStorage, "abc123")).toBe(false);
  });
});

describe("maskApiKey", () => {
  it("shows only the last four characters of a long key", () => {
    expect(maskApiKey("abcdefghijklmnop1234")).toBe("…1234");
  });

  it("shows nothing identifying for a short key", () => {
    expect(maskApiKey("abcd1234")).toBe("…");
  });

  it("is empty for no key", () => {
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey("   ")).toBe("");
  });
});
