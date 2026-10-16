import { describe, expect, it } from "vitest";
import { counterQuery } from "./counter";
import { parseConcepts } from "./concepts";
import { renderConcepts, toConcepts } from "./conceptquery";
import { parseQuery } from "./query";

const render = (text: string, syntax: Parameters<typeof renderConcepts>[1], options = {}) => renderConcepts(parseConcepts(text, options), syntax);

describe("renderConcepts: Boolean sources", () => {
  it("writes each concept as an OR-group, with AND between concepts", () => {
    expect(render("How AI understand odor", "boolean").text).toBe(
      '(AI OR "artificial intelligence" OR "machine learning" OR "deep learning" OR "neural network") AND (odor OR odour OR odorant OR olfaction OR olfactory OR "sense of smell")',
    );
  });

  it("does not send a common word or a generic word", () => {
    const text = render("How AI understand odor", "boolean").text;
    expect(text).not.toMatch(/\bhow\b|understand/i);
  });

  it("writes PubMed's title-and-abstract field on every term", () => {
    expect(render("machine learning odor", "pubmed").text).toBe(
      '("machine learning"[tiab] OR ML[tiab] OR "deep learning"[tiab] OR "neural network"[tiab]) AND (odor[tiab] OR odour[tiab] OR odorant[tiab] OR olfaction[tiab] OR olfactory[tiab] OR "sense of smell"[tiab])',
    );
  });

  it("writes Europe PMC's title-and-abstract field on every term", () => {
    expect(render("machine learning odor", "europepmc").text).toBe(
      '(TITLE_ABS:"machine learning" OR TITLE_ABS:ML OR TITLE_ABS:"deep learning" OR TITLE_ABS:"neural network") AND (TITLE_ABS:odor OR TITLE_ABS:odour OR TITLE_ABS:odorant OR TITLE_ABS:olfaction OR TITLE_ABS:olfactory OR TITLE_ABS:"sense of smell")',
    );
  });

  it("keeps a quoted phrase exactly, and a single word with no alternatives bare", () => {
    expect(render('"state of the art" chaos', "boolean").text).toBe('"state of the art" AND (chaos OR chaotic)');
    expect(render("chaos", "boolean", { synonyms: false }).text).toBe("chaos");
  });

  it("writes NOT for the words left out", () => {
    expect(render("sleep memory NOT rats", "boolean").text).toBe("sleep AND memory NOT rats");
  });

  it("writes nothing for a search with nothing in it", () => {
    expect(render("the of", "boolean").text).toBe("");
  });
});

describe("renderConcepts: sources without Boolean syntax", () => {
  it("sends the typed words of each concept once, and says what it could not ask for", () => {
    const { text, notes } = render("How AI understand odor", "plain");
    expect(text).toBe("AI odor");
    expect(notes.join(" ")).toMatch(/alternatives/);
  });

  it("says a phrase cannot be matched when a concept has several words", () => {
    expect(render("machine learning odor", "plain").notes.join(" ")).toMatch(/phrase/);
    expect(render("odor", "plain", { synonyms: false }).notes).toEqual([]);
  });

  it("sends one required form per concept when asked flat", () => {
    expect(render("machine learning odor", "boolean-flat").text).toBe('"machine learning" AND odor');
  });
});

describe("renderConcepts: exactly as typed", () => {
  it("sends the text as it was typed, to every source, and says so", () => {
    for (const syntax of ["boolean", "pubmed", "europepmc", "plain", "boolean-flat"] as const) {
      const rendered = render("How AI understand odor", syntax, { exact: true });
      expect(rendered.text).toBe("How AI understand odor");
      expect(rendered.notes).toContain("Sent exactly as typed");
    }
  });
});

describe("toConcepts and the counterargument terms", () => {
  it("reads text, a parsed query, or concepts already read", () => {
    const concepts = parseConcepts("chaos pendulum");
    expect(toConcepts(concepts)).toBe(concepts);
    expect(toConcepts("chaos pendulum").blocks.map((block) => block.label)).toEqual(["chaos", "pendulum"]);
    expect(toConcepts(parseQuery("chaos pendulum")).blocks.map((block) => block.label)).toEqual(["chaos", "pendulum"]);
  });

  it("asks for the main concepts and at least one of the terms", () => {
    const query = counterQuery("sleep memory", ["limitation", "no evidence"]);
    expect(renderConcepts(query, "boolean").text).toBe('sleep AND memory AND (limitation OR "no evidence")');
  });

  it("returns the main query unchanged when there is no usable term", () => {
    expect(counterQuery("sleep memory", [])).toEqual(parseConcepts("sleep memory"));
    expect(counterQuery("sleep memory", ["the"])).toEqual(parseConcepts("sleep memory"));
  });
});
