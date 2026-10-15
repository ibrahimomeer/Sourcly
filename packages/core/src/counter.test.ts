import { describe, expect, it } from "vitest";
import {
  CRITICISM_TERMS,
  DEFAULT_COUNTER_TERMS,
  NOTICE_TERMS,
  counterQuery,
  findLexiconMatches,
  findQueryTerms,
  findTerms,
  highlightSegments,
  markText,
  parseCounterTerm,
} from "./counter";
import { hardBlocks, parseConcepts } from "./concepts";
import { renderConcepts } from "./conceptquery";
import { coverageSpec } from "./coverage";
import { planQueries } from "./search";

describe("the default list of terms", () => {
  it("has the limitation and criticism words, then the correction and withdrawal words", () => {
    expect(DEFAULT_COUNTER_TERMS).toEqual([...CRITICISM_TERMS, ...NOTICE_TERMS]);
    expect(DEFAULT_COUNTER_TERMS).toEqual([
      "limitation",
      "criticism",
      "challenge",
      "fail",
      "failure",
      "bias",
      "reproducibility",
      "replication",
      "controversy",
      "no evidence",
      "negative results",
      "retraction",
      "erratum",
      "corrigendum",
    ]);
  });

  it("is made only of terms the list itself accepts", () => {
    for (const term of DEFAULT_COUNTER_TERMS) expect(parseCounterTerm(term)).toEqual({ ok: true, term });
  });
});

describe("parseCounterTerm", () => {
  it("accepts a word or a short phrase and keeps its capitals", () => {
    expect(parseCounterTerm("limitation")).toEqual({ ok: true, term: "limitation" });
    expect(parseCounterTerm("  Publication   bias ")).toEqual({ ok: true, term: "Publication bias" });
    expect(parseCounterTerm("COVID")).toEqual({ ok: true, term: "COVID" });
  });

  it("removes quotes and punctuation", () => {
    expect(parseCounterTerm('"no evidence"')).toEqual({ ok: true, term: "no evidence" });
    expect(parseCounterTerm("p-hacking!")).toEqual({ ok: true, term: "p-hacking" });
    expect(parseCounterTerm("file/drawer problem")).toEqual({ ok: true, term: "file drawer problem" });
  });

  it("keeps a common word inside a phrase that has a real word in it", () => {
    expect(parseCounterTerm("no evidence")).toEqual({ ok: true, term: "no evidence" });
    expect(parseCounterTerm("lack of evidence")).toEqual({ ok: true, term: "lack of evidence" });
  });

  it("refuses nothing, and a lone common word, with a reason", () => {
    expect(parseCounterTerm("   ")).toEqual({ ok: false, reason: "Type a word or a short phrase." });
    expect(parseCounterTerm('""')).toEqual({ ok: false, reason: "Type a word or a short phrase." });
    expect(parseCounterTerm("the")).toEqual({
      ok: false,
      reason: "“the” is a common word that searches leave out. Use a more specific word or phrase.",
    });
    expect(parseCounterTerm("OR")).toMatchObject({ ok: false });
    expect(parseCounterTerm("not")).toMatchObject({ ok: false });
  });

  it("refuses a term that is too long", () => {
    expect(parseCounterTerm("x".repeat(61))).toEqual({ ok: false, reason: "Keep a term under 60 characters." });
    expect(parseCounterTerm("x".repeat(60))).toMatchObject({ ok: true });
  });
});

describe("counterQuery", () => {
  const labelsOf = (query: ReturnType<typeof counterQuery>) => hardBlocks(query).map((block) => block.label);
  const lexiconOf = (query: ReturnType<typeof counterQuery>) => query.blocks.find((block) => block.kind === "lexicon")?.variants.map((variant) => variant.text);

  it("asks for the main concepts and at least one of the terms", () => {
    const query = counterQuery("sleep memory", ["limitation", "criticism"]);
    expect(labelsOf(query)).toEqual(["sleep", "memory"]);
    expect(lexiconOf(query)).toEqual(["limitation", "criticism"]);
    expect(renderConcepts(query, "boolean").text).toBe("sleep AND memory AND (limitation OR criticism)");
  });

  it("puts a phrase in quotes", () => {
    expect(renderConcepts(counterQuery("sleep", ["no evidence", "bias"]), "boolean").text).toBe('sleep AND ("no evidence" OR bias)');
  });

  it("does not wrap a single term in an OR", () => {
    expect(renderConcepts(counterQuery("sleep", ["bias"]), "boolean").text).toBe("sleep AND bias");
  });

  it("keeps every part of the main query, including a phrase, an OR group and a NOT", () => {
    const query = counterQuery('"memory consolidation" (sleep OR nap) NOT rats', ["limitation", "bias"]);
    expect(renderConcepts(query, "boolean").text).toBe('"memory consolidation" AND (sleep OR nap) AND (limitation OR bias) NOT rats');
  });

  it("ignores terms that are not usable, and repeats", () => {
    expect(lexiconOf(counterQuery("sleep", ["bias", "Bias", "the", "", "limitation"]))).toEqual(["bias", "limitation"]);
  });

  it("returns the main query unchanged when there is no usable term", () => {
    const query = parseConcepts("sleep memory");
    expect(counterQuery(query, [])).toBe(query);
    expect(counterQuery(query, ["the", " "])).toEqual(query);
  });

  it("does not change the main query it was given", () => {
    const query = parseConcepts("sleep memory");
    const before = JSON.stringify(query);
    counterQuery(query, ["bias"]);
    expect(JSON.stringify(query)).toBe(before);
  });

  it("is written in each source's syntax like any other query", () => {
    const query = counterQuery("sleep memory", ["limitation", "no evidence"]);
    expect(renderConcepts(query, "boolean").text).toBe('sleep AND memory AND (limitation OR "no evidence")');
    // A source that takes only words cannot say "any of these", so it is sent the main query alone.
    expect(renderConcepts(query, "plain").text).toBe("sleep memory");
    expect(renderConcepts(query, "plain").notes).toContain(
      "This source cannot ask for “any of these terms”, so it was sent only the rest of your search; its results that contain none of the terms rank lower",
    );
    const planned = planQueries(
      [
        { id: "openalex", syntax: "boolean" },
        { id: "crossref", syntax: "plain" },
      ],
      query,
    );
    expect(planned.map((p) => p.text)).toEqual(['sleep AND memory AND (limitation OR "no evidence")', "sleep memory"]);
  });

  it("sends one term to every source as a required word, since 'any of one term' is that term", () => {
    const query = counterQuery("sleep memory", ["bias"]);
    expect(renderConcepts(query, "boolean").text).toBe("sleep AND memory AND bias");
    expect(renderConcepts(query, "plain").text).toBe("sleep memory bias");
  });

  it("with the default terms writes one query every Boolean source can read", () => {
    const text = renderConcepts(counterQuery("sleep memory", DEFAULT_COUNTER_TERMS), "boolean").text;
    expect(text).toBe(
      'sleep AND memory AND (limitation OR criticism OR challenge OR fail OR failure OR bias OR reproducibility OR replication OR controversy OR "no evidence" OR "negative results" OR retraction OR erratum OR corrigendum)',
    );
  });

  it("does not count the terms as concepts of the search", () => {
    expect(coverageSpec(counterQuery("sleep NOT rats", ["bias", "no evidence"])).blocks.map((block) => block.label)).toEqual(["sleep"]);
  });
});

describe("markText with places that are already known", () => {
  it("uses the given places as they are, and lets the counterargument terms win a place only where nothing else is", () => {
    const text = "Odour of limitations";
    const segments = markText(text, [
      { name: "query", terms: [], spans: [{ start: 0, end: 5, term: "odour" }] },
      { name: "counter", terms: ["limitation"] },
    ]);
    expect(segments.map((s) => [s.text, s.group])).toEqual([
      ["Odour", "query"],
      [" of ", null],
      ["limitations", "counter"],
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });
});

describe("findTerms", () => {
  const terms = ["limitation", "bias", "no evidence", "fail"];
  const found = (text: string, list = terms) => findTerms(text, list).map((m) => [text.slice(m.start, m.end), m.term]);

  it("finds a word, whatever its capitals", () => {
    expect(found("Bias and BIAS")).toEqual([
      ["Bias", "bias"],
      ["BIAS", "bias"],
    ]);
  });

  it("matches the plural of a word", () => {
    expect(found("Several limitations were noted; one failure and two fails")).toEqual([
      ["limitations", "limitation"],
      ["fails", "fail"],
    ]);
  });

  it("matches irregular plurals the stemmer knows (biases)", () => {
    expect(found("Possible biases")).toEqual([["biases", "bias"]]);
  });

  it("matches a hyphenated term however the text writes the hyphen", () => {
    expect(found("Evidence of p-hacking, and of p hacking too", ["p-hacking"])).toEqual([
      ["p-hacking", "p-hacking"],
      ["p hacking", "p-hacking"],
    ]);
  });

  it("matches whole words, with only a plural -s or -es folded, never another ending and never part of a longer word", () => {
    // There is no stemming: "biased" and "failing" are other words than "bias" and "fail". List them as terms if they matter.
    expect(found("biased, failing, unfailing, bias-free")).toEqual([["bias", "bias"]]);
    expect(found("unfailing biasfree")).toEqual([]);
  });

  it("matches a phrase across spaces or a hyphen, and not across a full stop or a comma", () => {
    expect(found("There is no evidence here")).toEqual([["no evidence", "no evidence"]]);
    expect(found("There is no  evidence, and no-evidence either")).toEqual([
      ["no  evidence", "no evidence"],
      ["no-evidence", "no evidence"],
    ]);
    expect(found("There is no. Evidence follows")).toEqual([]);
    expect(found("no, evidence")).toEqual([]);
  });

  it("does not match a phrase's words on their own", () => {
    expect(found("The evidence is strong and no one doubts it")).toEqual([]);
  });

  it("prefers the longer phrase where terms overlap", () => {
    expect(found("no evidence", ["evidence", "no evidence"])).toEqual([["no evidence", "no evidence"]]);
  });

  it("ignores accents", () => {
    expect(found("BIAIS and Biás", ["bias"])).toEqual([["Biás", "bias"]]);
  });

  it("finds nothing in empty text or with no terms", () => {
    expect(found("")).toEqual([]);
    expect(found("bias limitation", [])).toEqual([]);
  });
});

describe("highlightSegments", () => {
  it("cuts the text into plain stretches and matches, which add up to the original text", () => {
    const text = "Despite some limitations, there is no evidence of bias.";
    const segments = highlightSegments(text, ["limitation", "no evidence", "bias"]);
    expect(segments).toEqual([
      { text: "Despite some ", term: null },
      { text: "limitations", term: "limitation" },
      { text: ", there is ", term: null },
      { text: "no evidence", term: "no evidence" },
      { text: " of ", term: null },
      { text: "bias", term: "bias" },
      { text: ".", term: null },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("returns the whole text as one plain stretch when nothing matches", () => {
    expect(highlightSegments("Sleep and memory", ["bias"])).toEqual([{ text: "Sleep and memory", term: null }]);
  });

  it("returns no segments for empty text", () => {
    expect(highlightSegments("", ["bias"])).toEqual([]);
  });

  it("starts and ends on a match without empty stretches", () => {
    expect(highlightSegments("bias", ["bias"])).toEqual([{ text: "bias", term: "bias" }]);
  });
});

describe("findLexiconMatches", () => {
  const terms = ["limitation", "bias", "no evidence", "replication"];

  it("says which terms the title and the abstract contain, and where", () => {
    const matches = findLexiconMatches(
      { title: "Limitations of sleep studies", abstract: "We found no evidence of bias, and one more limitation." },
      terms,
    );
    expect(matches).toEqual([
      { term: "limitation", fields: ["title", "abstract"] },
      { term: "bias", fields: ["abstract"] },
      { term: "no evidence", fields: ["abstract"] },
    ]);
  });

  it("lists terms in the order they were given, once each", () => {
    const matches = findLexiconMatches({ title: "bias bias limitation", abstract: null }, ["limitation", "bias"]);
    expect(matches.map((m) => m.term)).toEqual(["limitation", "bias"]);
  });

  it("copes with no abstract and with nothing found", () => {
    expect(findLexiconMatches({ title: "Sleep and memory", abstract: null }, terms)).toEqual([]);
    expect(findLexiconMatches({ title: "", abstract: null }, terms)).toEqual([]);
  });

  it("reads only the title and the abstract", () => {
    expect(findLexiconMatches({ title: "Sleep", abstract: "Memory" }, ["sleep", "memory"])).toEqual([
      { term: "sleep", fields: ["title"] },
      { term: "memory", fields: ["abstract"] },
    ]);
  });
});

describe("findQueryTerms: the words of a search", () => {
  const found = (text: string, terms: string[], exact = false) => findQueryTerms(text, terms, exact).map((m) => [text.slice(m.start, m.end), m.term]);

  it("finds words and phrases, with plurals", () => {
    expect(found("A double pendulum and pendulums", ["double pendulum", "pendulum"])).toEqual([
      ["double pendulum", "double pendulum"],
      ["pendulums", "pendulum"],
    ]);
  });

  it("finds a common word the person restored, which a counterargument term could not be", () => {
    expect(found("What is chaos", ["is"])).toEqual([["is", "is"]]);
    expect(findTerms("What is chaos", ["is"])).toEqual([]);
  });

  it("finds a word with a hyphen as its parts next to each other", () => {
    expect(found("COVID 19 and covid-19", ["covid-19"])).toEqual([
      ["COVID 19", "covid-19"],
      ["covid-19", "covid-19"],
    ]);
  });

  it("compares words as typed when exact", () => {
    expect(found("Pendulums", ["pendulum"], true)).toEqual([]);
    expect(found("Pendulums", ["pendulums"], true)).toEqual([["Pendulums", "pendulums"]]);
    expect(found("Pendulums", ["pendulum"])).toEqual([["Pendulums", "pendulum"]]);
  });

  it("finds nothing for no terms, and ignores a term with no words", () => {
    expect(found("text", [])).toEqual([]);
    expect(found("text", ["", "--"])).toEqual([]);
  });
});

describe("markText: several groups of terms in one text", () => {
  it("marks the words of the search and the counterargument terms, and the pieces add up to the text", () => {
    const text = "Limitations of the double pendulum model";
    const segments = markText(text, [
      { name: "query", terms: ["double", "pendulum"], query: true },
      { name: "counter", terms: ["limitation"] },
    ]);
    expect(segments.filter((s) => s.group !== null).map((s) => [s.text, s.group])).toEqual([
      ["Limitations", "counter"],
      ["double", "query"],
      ["pendulum", "query"],
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("lets the group listed first win when two match the same words", () => {
    const first = markText("bias study", [{ name: "query", terms: ["bias"], query: true }, { name: "counter", terms: ["bias"] }]);
    expect(first.filter((s) => s.group !== null).map((s) => s.group)).toEqual(["query"]);
    const other = markText("bias study", [{ name: "counter", terms: ["bias"] }, { name: "query", terms: ["bias"], query: true }]);
    expect(other.filter((s) => s.group !== null).map((s) => s.group)).toEqual(["counter"]);
  });

  it("does not overlap: a phrase that contains a single word keeps the phrase if listed first", () => {
    const segments = markText("the double pendulum", [{ name: "query", terms: ["double pendulum", "pendulum"], query: true }]);
    expect(segments.filter((s) => s.group !== null).map((s) => s.text)).toEqual(["double pendulum"]);
  });

  it("returns the text whole when nothing matches, and nothing for empty text", () => {
    expect(markText("plain text", [{ name: "query", terms: ["zebra"], query: true }])).toEqual([{ text: "plain text", term: null, group: null }]);
    expect(markText("", [{ name: "query", terms: ["zebra"], query: true }])).toEqual([]);
  });
});
