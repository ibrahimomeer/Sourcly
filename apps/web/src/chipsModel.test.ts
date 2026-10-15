import { formatQuery, parseQuery, planQueries } from "@sourcly/core";
import { describe, expect, it } from "vitest";
import { chipKeys, queryChipsModel, type ChipTree } from "./chipsModel";

const model = (text: string, options = {}) => {
  const parsed = parseQuery(text, options);
  return queryChipsModel(parsed, formatQuery(parsed));
};
const terms = (text: string, options = {}) => chipKeys(model(text, options));

describe("queryChipsModel: what the search will look for, and what it will not", () => {
  const sentence = "what is the best way to predict odor";

  it("lists the terms as chips and the removed common words as dashed chips", () => {
    const m = model(sentence);
    expect(chipKeys(m)).toEqual(["best", "way", "predict", "odor"]);
    expect(m.ignored).toEqual(["what", "is", "the", "to"]);
    expect(m.leftOut).toEqual([]);
  });

  it("restoring a dashed chip makes it a normal term and takes it off the dashed list", () => {
    const m = model(sentence, { restored: new Set(["is"]) });
    expect(chipKeys(m)).toEqual(["is", "best", "way", "predict", "odor"]);
    expect(m.ignored).toEqual(["what", "the", "to"]);
  });

  it("with 'Ignore common words' off every word typed is a term and nothing is dashed", () => {
    const m = model(sentence, { ignoreCommon: false });
    expect(chipKeys(m)).toEqual(["what", "is", "the", "best", "way", "to", "predict", "odor"]);
    expect(m.ignored).toEqual([]);
  });

  it("clicking a normal chip leaves its word out, and it shows as dashed so it can be restored", () => {
    const m = model("sleep memory way", { excluded: new Set(["way"]) });
    expect(chipKeys(m)).toEqual(["sleep", "memory"]);
    expect(m.leftOut).toEqual([{ key: "way", text: "way" }]);
    // Restoring it: the same text, read without the exclusion.
    expect(terms("sleep memory way")).toEqual(["sleep", "memory", "way"]);
  });

  it("shows a quoted phrase as one chip, with its common words, and leaves it out as one", () => {
    const m = model('"state of the art" review');
    expect(m.terms).toEqual({
      kind: "and",
      items: [
        { kind: "term", key: "state of the art", text: "state of the art", phrase: true },
        { kind: "term", key: "review", text: "review", phrase: false },
      ],
    });
    expect(m.ignored).toEqual([]);
    const left = model('"state of the art" review', { excluded: new Set(["state of the art"]) });
    expect(left.leftOut).toEqual([{ key: "state of the art", text: "state of the art" }]);
    expect(chipKeys(left)).toEqual(["review"]);
  });

  it("keeps all-caps words as terms: CAN bus", () => {
    const m = model("CAN bus protocol");
    expect(chipKeys(m)).toEqual(["can", "bus", "protocol"]);
    expect(m.ignored).toEqual([]);
  });

  it("works for one word, and for nothing", () => {
    expect(terms("sleep")).toEqual(["sleep"]);
    expect(model("").terms).toBeNull();
    expect(model("the").terms).toBeNull();
    expect(model("the").ignored).toEqual(["the"]);
  });

  it("keeps the operators in the tree, so OR and NOT show as they were typed", () => {
    const tree = model("sleep OR nap NOT rats").terms as ChipTree;
    expect(tree.kind).toBe("or");
    expect(JSON.stringify(tree)).toContain('"kind":"not"');
  });

  it("lists each dropped word once, and each key once", () => {
    expect(model("the cat and the dog and").ignored).toEqual(["the", "and"]);
    expect(terms("odor odor ODOR")).toEqual(["odor"]);
  });

  it("notes when a question was reduced to keywords, with the keywords", () => {
    expect(model(sentence).questionNote).toBe("Question reduced to keywords: best way predict odor. You can edit or restore words above.");
    expect(model("is sleep good?").questionNote).toBe("Question reduced to keywords: sleep good. You can edit or restore words above.");
  });

  it("does not note a question when nothing was removed, or when it is not a question", () => {
    expect(model(sentence, { ignoreCommon: false }).questionNote).toBeNull();
    expect(model("sleep memory consolidation").questionNote).toBeNull();
    expect(model("what is chaos", { exact: true }).questionNote).toBeNull();
  });

  it("does not change the text it describes", () => {
    const text = "what is the best way to predict odor";
    const parsed = parseQuery(text);
    queryChipsModel(parsed, formatQuery(parsed));
    expect(parsed.original).toBe(text);
  });
});

describe("the queries sent follow the chips", () => {
  const providers = [
    { id: "openalex" as const, syntax: "boolean" as const },
    { id: "crossref" as const, syntax: "plain" as const },
  ];

  it("sends the terms shown, and the typed text when asked to search exactly as typed", () => {
    const text = "what is the best way to predict odor";
    expect(planQueries(providers, parseQuery(text)).map((q) => q.text)).toEqual([
      "best AND way AND predict AND odor",
      "best way predict odor",
    ]);
    expect(planQueries(providers, parseQuery(text, { restored: new Set(["is"]) })).map((q) => q.text)).toEqual([
      "is AND best AND way AND predict AND odor",
      "is best way predict odor",
    ]);
    expect(planQueries(providers, parseQuery(text, { exact: true })).map((q) => q.text)).toEqual([text, text]);
  });
});
