import { describe, expect, it } from "vitest";
import {
  MAX_SAVED,
  SAVED_FORMAT_VERSION,
  addSaved,
  canSave,
  isSaved,
  parseSaved,
  removeSaved,
  savedResults,
  serializeSaved,
  toSavedResult,
  type SavedItem,
} from "./saved";
import { makeResult } from "./testing/make-result";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const work = (id: string, overrides = {}) => makeResult({ id, doi: id, title: `Title ${id}`, ...overrides });

describe("addSaved and removeSaved", () => {
  it("puts the newest source first", () => {
    let list: SavedItem[] = [];
    list = addSaved(list, work("10.1/a"), NOW);
    list = addSaved(list, work("10.1/b"), new Date("2026-10-15T00:00:00Z"));
    expect(list.map((item) => item.result.id)).toEqual(["10.1/b", "10.1/a"]);
    expect(list[1]?.savedAt).toBe("2026-10-14T12:00:00.000Z");
  });

  it("does not add the same source twice", () => {
    const once = addSaved([], work("10.1/a"), NOW);
    expect(addSaved(once, work("10.1/a", { title: "Changed" }), NOW)).toEqual(once);
  });

  it("keeps a snapshot without the abstract and subject terms, which a reference does not need", () => {
    const full = work("10.1/a", {
      abstract: "A long abstract.",
      subjects: [{ term: "Sleep", kind: "topic", provider: "openalex" }],
    });
    const [item] = addSaved([], full, NOW);
    expect(item?.result.abstract).toBeNull();
    expect(item?.result.subjects).toEqual([]);
    expect(item?.result.title).toBe("Title 10.1/a");
    expect(full.abstract).toBe("A long abstract.");
  });

  it("removes one source by id and leaves the rest in order", () => {
    const list = ["a", "b", "c"].reduce((current, id) => addSaved(current, work(`10.1/${id}`), NOW), [] as SavedItem[]);
    expect(removeSaved(list, "10.1/b").map((item) => item.result.id)).toEqual(["10.1/c", "10.1/a"]);
    expect(removeSaved(list, "10.1/missing")).toEqual(list);
  });

  it("knows what is saved", () => {
    const list = addSaved([], work("10.1/a"), NOW);
    expect(isSaved(list, "10.1/a")).toBe(true);
    expect(isSaved(list, "10.1/b")).toBe(false);
    expect(savedResults(list).map((r) => r.id)).toEqual(["10.1/a"]);
  });

  it("stops adding at the limit", () => {
    let list: SavedItem[] = [];
    for (let i = 0; i < MAX_SAVED; i++) list = addSaved(list, work(`10.1/${i}`), NOW);
    expect(list).toHaveLength(MAX_SAVED);
    expect(canSave(list)).toBe(false);
    expect(addSaved(list, work("10.1/extra"), NOW)).toHaveLength(MAX_SAVED);
    expect(isSaved(addSaved(list, work("10.1/extra"), NOW), "10.1/extra")).toBe(false);
  });

  it("does not change the list it was given", () => {
    const list = addSaved([], work("10.1/a"), NOW);
    const before = JSON.stringify(list);
    addSaved(list, work("10.1/b"), NOW);
    removeSaved(list, "10.1/a");
    expect(JSON.stringify(list)).toBe(before);
  });
});

describe("serializeSaved and parseSaved", () => {
  const rich = work("10.1/a", {
    authors: [{ name: "Robert Stickgold", family: "Stickgold", given: "Robert" }, { name: "Plato" }],
    year: 2005,
    venue: "Nature",
    volume: "437",
    issue: "7063",
    pages: "1272-1278",
    type: "review",
    citationCount: 12,
    language: "en",
    url: "https://doi.org/10.1/a",
    openAccess: { isOpen: true, status: "gold", url: "https://example.org/oa", pdfUrl: "https://example.org/oa.pdf" },
    retraction: { retracted: true, source: "OpenAlex" },
    hits: [{ provider: "openalex", id: "W1", rank: 2, listSize: 100, score: 3.5 }],
  });

  it("gives back what it was given, apart from what a snapshot leaves out", () => {
    const list = addSaved([], rich, NOW);
    const back = parseSaved(serializeSaved(list));
    expect(back).toHaveLength(1);
    const { venueKind, rawType, authorCountries, ...kept } = back[0]?.result ?? makeResult();
    expect(venueKind).toBeNull();
    expect(rawType).toBeNull();
    expect(authorCountries).toEqual([]);
    expect(kept).toMatchObject({
      id: "10.1/a",
      title: "Title 10.1/a",
      authors: [{ name: "Robert Stickgold", family: "Stickgold", given: "Robert" }, { name: "Plato" }],
      year: 2005,
      venue: "Nature",
      volume: "437",
      issue: "7063",
      pages: "1272-1278",
      doi: "10.1/a",
      type: "review",
      citationCount: 12,
      openAccess: { isOpen: true, status: "gold", url: "https://example.org/oa", pdfUrl: "https://example.org/oa.pdf" },
      retraction: { retracted: true, source: "OpenAlex" },
      hits: [{ provider: "openalex", id: "W1", rank: 2, listSize: 100, score: 3.5 }],
    });
    expect(back[0]?.savedAt).toBe("2026-10-14T12:00:00.000Z");
  });

  it("writes a version number", () => {
    expect(JSON.parse(serializeSaved([]))).toEqual({ version: SAVED_FORMAT_VERSION, items: [] });
  });

  it("gives an empty list for nothing, damaged text, or another version", () => {
    for (const stored of [null, undefined, "", "not json", "[]", "null", '{"version":99,"items":[]}', '{"items":[]}']) {
      expect(parseSaved(stored)).toEqual([]);
    }
  });

  it("drops items that are not usable and keeps the rest", () => {
    const stored = JSON.stringify({
      version: SAVED_FORMAT_VERSION,
      items: [
        null,
        "text",
        { result: null },
        { result: { title: "no id" } },
        { result: { id: "" } },
        { result: { id: "10.1/ok", title: "Fine" }, savedAt: "2026-01-01T00:00:00Z" },
      ],
    });
    const items = parseSaved(stored);
    expect(items.map((item) => item.result.id)).toEqual(["10.1/ok"]);
  });

  it("fills defaults for missing or wrong fields instead of trusting them", () => {
    const stored = JSON.stringify({
      version: 1,
      items: [
        {
          result: {
            id: "10.1/odd",
            title: 5,
            authors: [{ name: 7 }, { name: "Ok" }, "text"],
            year: "2020",
            type: "spaceship",
            openAccess: { isOpen: "yes", status: "platinum" },
            retraction: { retracted: "no" },
            hits: [{ provider: "nowhere", id: "x", rank: 1, listSize: 1 }, { provider: "crossref", id: "c", rank: "1", listSize: 1 }],
          },
          savedAt: "yesterday",
        },
      ],
    });
    const [item] = parseSaved(stored);
    expect(item?.result).toMatchObject({
      id: "10.1/odd",
      title: "",
      authors: [{ name: "Ok" }],
      year: null,
      type: "unknown",
      openAccess: { isOpen: null, status: "unknown", url: null, pdfUrl: null },
      retraction: { retracted: null, source: null },
      hits: [],
      volume: null,
      pages: null,
    });
    expect(item?.savedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("removes markup that an older version stored in a title or venue", () => {
    const stored = JSON.stringify({
      version: 1,
      items: [{ result: { id: "10.1/x", title: "Detection of <i>Candida albicans</i>", venue: "<i>Journal</i> of Dentistry" } }],
    });
    const [item] = parseSaved(stored);
    expect(item?.result.title).toBe("Detection of Candida albicans");
    expect(item?.result.venue).toBe("Journal of Dentistry");
  });

  it("keeps only web addresses, so a stored script address can never become a link", () => {
    const stored = JSON.stringify({
      version: 1,
      items: [
        {
          result: {
            id: "10.1/x",
            url: "javascript:alert(1)",
            openAccess: { url: "data:text/html,hi", pdfUrl: "javascript:void(0)" },
          },
        },
        { result: { id: "10.1/y", url: "https://example.org/ok", openAccess: { url: "http://example.org/a" } } },
      ],
    });
    const [x, y] = parseSaved(stored);
    expect(x?.result.url).toBeNull();
    expect(x?.result.openAccess).toMatchObject({ url: null, pdfUrl: null });
    expect(y?.result.url).toBe("https://example.org/ok");
    expect(y?.result.openAccess.url).toBe("http://example.org/a");
  });

  it("ignores repeated ids and stops at the limit", () => {
    const repeated = { version: 1, items: [{ result: { id: "10.1/a" } }, { result: { id: "10.1/a", title: "again" } }] };
    expect(parseSaved(JSON.stringify(repeated))).toHaveLength(1);
    const huge = { version: 1, items: Array.from({ length: MAX_SAVED + 20 }, (_, i) => ({ result: { id: `10.1/${i}` } })) };
    expect(parseSaved(JSON.stringify(huge))).toHaveLength(MAX_SAVED);
  });
});

describe("toSavedResult", () => {
  it("does not change the result it is given", () => {
    const result = work("10.1/a", { abstract: "kept in the original" });
    toSavedResult(result);
    expect(result.abstract).toBe("kept in the original");
  });
});
