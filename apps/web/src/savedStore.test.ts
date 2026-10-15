import { addSaved, SAVED_FORMAT_VERSION } from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import type { KeyStorage } from "./apiKey";
import { loadSavedList, persistSavedList, SAVED_STORAGE_KEY } from "./savedStore";

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

const list = () =>
  addSaved(addSaved([], makeResult({ id: "10.1/a", title: "A" }), new Date("2026-10-14T10:00:00Z")), makeResult({ id: "10.1/b", title: "B" }), new Date("2026-10-14T11:00:00Z"));

describe("persistSavedList and loadSavedList", () => {
  it("keeps the list under one key and reads it back", () => {
    const storage = fakeStorage();
    expect(persistSavedList(storage, list())).toBe(true);
    expect([...storage.data.keys()]).toEqual([SAVED_STORAGE_KEY]);
    expect(loadSavedList(storage).map((item) => item.result.id)).toEqual(["10.1/b", "10.1/a"]);
  });

  it("writes a versioned format", () => {
    const storage = fakeStorage();
    persistSavedList(storage, list());
    expect(JSON.parse(storage.data.get(SAVED_STORAGE_KEY) ?? "{}").version).toBe(SAVED_FORMAT_VERSION);
  });

  it("forgets the key when the list is empty, so nothing is left behind", () => {
    const storage = fakeStorage();
    persistSavedList(storage, list());
    expect(persistSavedList(storage, [])).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it("gives an empty list when there is nothing stored, the data is damaged, or storage is blocked", () => {
    expect(loadSavedList(fakeStorage())).toEqual([]);
    expect(loadSavedList(fakeStorage({ [SAVED_STORAGE_KEY]: "{{ not json" }))).toEqual([]);
    expect(loadSavedList(brokenStorage)).toEqual([]);
    expect(loadSavedList(null)).toEqual([]);
  });

  it("says so when the browser would not store the list", () => {
    expect(persistSavedList(brokenStorage, list())).toBe(false);
    expect(persistSavedList(null, list())).toBe(false);
  });

  it("does not store anything else, such as an API key", () => {
    const storage = fakeStorage({ "sourcly.openalexApiKey": "secret" });
    persistSavedList(storage, list());
    expect(storage.data.get(SAVED_STORAGE_KEY)).not.toContain("secret");
    expect(storage.data.get("sourcly.openalexApiKey")).toBe("secret");
  });
});
