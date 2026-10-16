import { describe, expect, it } from "vitest";
import {
  excludedTerms,
  isAllCapsTerm,
  formatQuery,
  isUsable,
  looksLikeQuestion,
  parseQuery,
  queryTerms,
  renderQuery,
  requiredTerms,
  termNode,
  type QueryNode,
} from "./query";

const word = (text: string): QueryNode => ({ type: "word", text });
const phrase = (text: string): QueryNode => ({ type: "phrase", text });
const and = (...items: QueryNode[]): QueryNode => ({ type: "and", items });
const or = (...items: QueryNode[]): QueryNode => ({ type: "or", items });
const not = (item: QueryNode): QueryNode => ({ type: "not", item });
const root = (text: string) => parseQuery(text).root;

describe("parseQuery: words", () => {
  it("reads plain words as 'all of these'", () => {
    expect(root("sleep memory consolidation")).toEqual(and(word("sleep"), word("memory"), word("consolidation")));
    expect(root("sleep")).toEqual(word("sleep"));
  });

  it("keeps the case the person typed", () => {
    expect(root("COVID Sleep")).toEqual(and(word("COVID"), word("Sleep")));
  });

  it("keeps a hyphen inside a word, splits other punctuation, and removes apostrophes", () => {
    expect(root("meta-analysis")).toEqual(word("meta-analysis"));
    expect(root("covid-19 IL-6 SARS-CoV-2")).toEqual(and(word("covid-19"), word("IL-6"), word("SARS-CoV-2")));
    expect(root("memory's")).toEqual(word("memorys"));
    expect(root("sleep, memory; dreams.")).toEqual(and(word("sleep"), word("memory"), word("dreams")));
    expect(root("sleep/memory (rem)")).toEqual(and(word("sleep"), word("memory"), word("rem")));
    expect(root("dream–sleep")).toEqual(and(word("dream"), word("sleep")));
  });

  it("drops hyphens that are not between letters or digits", () => {
    expect(root("-sleep sleep- - --memory-- a--b")).toEqual(and(word("sleep"), word("sleep"), word("memory"), word("a-b")));
    expect(root("non‐linear")).toEqual(word("non-linear"));
  });

  it("keeps letters from any language", () => {
    expect(root("spánek paměť")).toEqual(and(word("spánek"), word("paměť")));
  });

  it("keeps numbers and single letters the person typed on purpose", () => {
    expect(root("vitamin C 2020")).toEqual(and(word("vitamin"), word("C"), word("2020")));
  });
});

describe("parseQuery: common words", () => {
  it("reduces a question to its keywords, and says what it removed", () => {
    const parsed = parseQuery("What are the effects of sleep deprivation on memory in adults?");
    expect(parsed.root).toEqual(and(word("effects"), word("sleep"), word("deprivation"), word("memory"), word("adults")));
    expect(parsed.droppedStopwords).toEqual(["what", "are", "the", "of", "on", "in"]);
    expect(formatQuery(parsed)).toBe("effects sleep deprivation memory adults");
  });

  it("treats lowercase and/or/not as common words, not operators", () => {
    const parsed = parseQuery("sleep and memory or dreams not rats");
    expect(parsed.root).toEqual(and(word("sleep"), word("memory"), word("dreams"), word("rats")));
    expect(parsed.droppedStopwords).toEqual(["and", "or", "not"]);
  });

  it("keeps common words inside quotes, where order and wording matter", () => {
    expect(root('"state of the art" sleep')).toEqual(and(phrase("state of the art"), word("sleep")));
  });

  it("keeps a single quoted word, even a common one", () => {
    expect(root('"the" sleep')).toEqual(and(word("the"), word("sleep")));
  });

  it("is idempotent: a reduced query reduces to itself", () => {
    const once = formatQuery(parseQuery("How does sleep affect the consolidation of memories?"));
    expect(formatQuery(parseQuery(once))).toBe(once);
    expect(parseQuery(once).droppedStopwords).toEqual([]);
  });
});

describe("parseQuery: phrases", () => {
  it("reads quoted text as a phrase", () => {
    expect(root('"memory consolidation" sleep')).toEqual(and(phrase("memory consolidation"), word("sleep")));
  });

  it("tidies punctuation inside a phrase", () => {
    expect(root('"memory,   consolidation!"')).toEqual(phrase("memory consolidation"));
  });

  it("copes with an unclosed quote, an empty pair of quotes and a lone quote", () => {
    expect(root('sleep "memory consolidation')).toEqual(and(word("sleep"), phrase("memory consolidation")));
    expect(root('sleep "" memory')).toEqual(and(word("sleep"), word("memory")));
    expect(root('sleep " memory')).toEqual(and(word("sleep"), word("memory")));
  });
});

describe("parseQuery: AND, OR, NOT and parentheses", () => {
  it("reads capital AND as the same thing as a space", () => {
    expect(root("sleep AND memory")).toEqual(root("sleep memory"));
  });

  it("reads OR as either, with AND binding tighter", () => {
    expect(root("sleep OR dreaming")).toEqual(or(word("sleep"), word("dreaming")));
    expect(root("alpha beta OR gamma delta")).toEqual(or(and(word("alpha"), word("beta")), and(word("gamma"), word("delta"))));
  });

  it("reads NOT as leaving out the next thing", () => {
    expect(root("sleep NOT rats")).toEqual(and(word("sleep"), not(word("rats"))));
    expect(root("sleep NOT (rats OR mice)")).toEqual(and(word("sleep"), not(or(word("rats"), word("mice")))));
    expect(root('sleep NOT "knockout mice"')).toEqual(and(word("sleep"), not(phrase("knockout mice"))));
  });

  it("applies NOT to just the next thing", () => {
    expect(root("sleep NOT rats memory")).toEqual(and(word("sleep"), not(word("rats")), word("memory")));
  });

  it("reads parentheses as grouping", () => {
    expect(root("(sleep OR nap) memory")).toEqual(and(or(word("sleep"), word("nap")), word("memory")));
    expect(root("sleep (memory OR dreams)")).toEqual(and(word("sleep"), or(word("memory"), word("dreams"))));
  });

  it("flattens nested groups of the same kind", () => {
    expect(root("(alpha beta) gamma")).toEqual(and(word("alpha"), word("beta"), word("gamma")));
    expect(root("alpha OR (beta OR gamma)")).toEqual(or(word("alpha"), word("beta"), word("gamma")));
  });

  it("treats NOT NOT x as x", () => {
    expect(root("NOT NOT sleep")).toEqual(word("sleep"));
  });

  it("survives broken syntax without throwing or looping", () => {
    expect(root("sleep NOT")).toEqual(word("sleep"));
    expect(root("sleep AND")).toEqual(word("sleep"));
    expect(root("OR sleep")).toEqual(word("sleep"));
    expect(root("sleep OR")).toEqual(word("sleep"));
    expect(root("sleep ) memory")).toEqual(and(word("sleep"), word("memory")));
    expect(root("((sleep)")).toEqual(word("sleep"));
    expect(root("()")).toBeNull();
    expect(root("AND OR NOT")).toBeNull();
  });
});

describe("isUsable", () => {
  it.each([[""], ["   "], ["the of and"], ["What is the?"], ["NOT rats"], ["()"], ['""']])(
    "is false for %j, which has nothing to search for",
    (text) => {
      expect(isUsable(parseQuery(text))).toBe(false);
      expect(renderQuery(parseQuery(text), "boolean").text).toBe("");
    },
  );

  it("is true when at least one real word is asked for", () => {
    expect(isUsable(parseQuery("sleep"))).toBe(true);
    expect(isUsable(parseQuery("sleep NOT rats"))).toBe(true);
  });
});

describe("queryTerms / excludedTerms", () => {
  it("lists the words asked for, once each, including the words of phrases", () => {
    expect(queryTerms(parseQuery('"memory consolidation" sleep Sleep OR memory'))).toEqual(["memory", "consolidation", "sleep"]);
  });

  it("lists excluded words separately, and does not count them as asked for", () => {
    const parsed = parseQuery("sleep NOT rats NOT (mice OR hamsters)");
    expect(queryTerms(parsed)).toEqual(["sleep"]);
    expect(excludedTerms(parsed)).toEqual(["rats", "mice", "hamsters"]);
  });
});

describe("formatQuery: the editable text", () => {
  it.each([
    ["sleep  memory", "sleep memory"],
    ["sleep AND memory", "sleep memory"],
    ["sleep OR dreaming", "sleep OR dreaming"],
    ["alpha beta OR gamma delta", "alpha beta OR gamma delta"],
    ["(sleep OR nap) memory", "(sleep OR nap) memory"],
    ["sleep NOT rats", "sleep NOT rats"],
    ["sleep NOT (rats OR mice)", "sleep NOT (rats OR mice)"],
    ['"memory consolidation" sleep', '"memory consolidation" sleep'],
    ["What is sleep?", "sleep"],
    ['"AND" sleep', '"AND" sleep'],
  ])("writes %j as %j", (input, expected) => {
    expect(formatQuery(parseQuery(input))).toBe(expected);
  });

  it("returns an empty string when there is nothing to search", () => {
    expect(formatQuery(parseQuery("the of"))).toBe("");
  });

  it.each([
    "sleep memory", "sleep OR dreaming", "alpha beta OR gamma delta", "(sleep OR nap) memory", "sleep NOT rats",
    "sleep NOT (rats OR mice)", '"memory consolidation" (sleep OR nap) NOT rats', '"AND" sleep', "((alpha OR beta) gamma) OR delta",
    "NOT NOT x", "What are the effects of sleep on memory?",
  ])("reads its own output back as the same query: %j", (input) => {
    const once = parseQuery(input);
    const again = parseQuery(formatQuery(once));
    expect(again.root).toEqual(once.root);
    expect(formatQuery(again)).toBe(formatQuery(once));
  });
});

describe("renderQuery: sources that understand Boolean searches", () => {
  const boolean = (text: string) => renderQuery(parseQuery(text), "boolean");

  it("spells out AND, because some sources read a space as OR", () => {
    expect(boolean("sleep memory consolidation").text).toBe("sleep AND memory AND consolidation");
    expect(boolean("sleep").text).toBe("sleep");
  });

  it("keeps quoted phrases", () => {
    expect(boolean('"memory consolidation" sleep').text).toBe('"memory consolidation" AND sleep');
  });

  it("writes NOT as 'x NOT y', the one form every Boolean source understands", () => {
    expect(boolean("sleep NOT rats").text).toBe("sleep NOT rats");
    expect(boolean('"memory consolidation" sleep NOT rats').text).toBe('"memory consolidation" AND sleep NOT rats');
    expect(boolean("sleep NOT rats NOT mice").text).toBe("sleep NOT rats NOT mice");
    expect(boolean("sleep NOT (rats OR mice)").text).toBe("sleep NOT (rats OR mice)");
    expect(boolean("sleep NOT (rats mice)").text).toBe("sleep NOT (rats AND mice)");
  });

  it("puts parentheses where they keep the meaning", () => {
    expect(boolean("(sleep OR nap) memory").text).toBe("(sleep OR nap) AND memory");
    expect(boolean("alpha beta OR gamma delta").text).toBe("(alpha AND beta) OR (gamma AND delta)");
    expect(boolean("sleep (memory OR dreams) NOT rats").text).toBe("sleep AND (memory OR dreams) NOT rats");
  });

  it("drops a part that only says what to leave out, and says so", () => {
    const rendered = boolean("sleep OR NOT rats");
    expect(rendered.text).toBe("sleep");
    expect(rendered.notes).toEqual(["Ignored a part that only said what to leave out, because it had nothing to search for"]);
  });

  it("has no notes when everything could be applied", () => {
    expect(boolean('"memory consolidation" (sleep OR nap) NOT rats').notes).toEqual([]);
  });

  it("only ever writes letters, digits, quotes, parentheses and the three operators", () => {
    const text = boolean('title:foo* "bar:baz" ^boost ~fuzzy sleep\\memory /regex/ NOT [a TO b]').text;
    expect(text).not.toMatch(/[:*^~\\/\[\]{}]/);
  });
});

describe("renderQuery: sources that take only words", () => {
  const plain = (text: string) => renderQuery(parseQuery(text), "plain");

  it("sends just the words, in order, once each", () => {
    expect(plain("sleep memory consolidation")).toEqual({ text: "sleep memory consolidation", notes: [] });
    expect(plain("sleep Sleep memory").text).toBe("sleep memory");
  });

  it("says what a plain source could not apply", () => {
    const rendered = plain('"memory consolidation" sleep NOT rats');
    expect(rendered.text).toBe("memory consolidation sleep");
    expect(rendered.notes).toEqual([
      "This source cannot leave words out, so results containing “rats” can still appear",
      "This source cannot match a phrase, so it searches for the words of the phrase separately",
    ]);
  });

  it("explains OR", () => {
    const rendered = plain("sleep OR nap");
    expect(rendered.text).toBe("sleep nap");
    expect(rendered.notes).toEqual(["This source cannot match “either word”, so it searches for all of the words together"]);
  });

  it("returns nothing for an empty query", () => {
    expect(plain("")).toEqual({ text: "", notes: [] });
  });
});

describe("renderQuery: PubMed, every word looked for in its text words", () => {
  const pubmed = (text: string) => renderQuery(parseQuery(text), "pubmed");

  it("tags each word and phrase on its own, which also turns off PubMed's term mapping", () => {
    expect(pubmed("chaos double pendulum").text).toBe("chaos[tw] AND double[tw] AND pendulum[tw]");
    expect(pubmed('"double pendulum" chaos').text).toBe('"double pendulum"[tw] AND chaos[tw]');
  });

  it("keeps groups and NOT, with the tag on every word inside them", () => {
    expect(pubmed("sleep (memory OR dreams) NOT rats").text).toBe("sleep[tw] AND (memory[tw] OR dreams[tw]) NOT rats[tw]");
    expect(pubmed("sleep NOT (rats OR mice)").text).toBe("sleep[tw] NOT (rats[tw] OR mice[tw])");
  });

  it("quotes a hyphenated word and a word spelled like an operator", () => {
    expect(pubmed("self-organizing").text).toBe('"self-organizing"[tw]');
    expect(pubmed('"AND" sleep').text).toBe('"AND"[tw] AND sleep[tw]');
  });

  it("writes accented and non-Latin words as they are", () => {
    expect(pubmed("cafe café").text).toBe("cafe[tw] AND café[tw]");
  });

  it("is told what it could not apply the same way as any boolean source", () => {
    expect(pubmed("sleep OR NOT rats")).toEqual({
      text: "sleep[tw]",
      notes: ["Ignored a part that only said what to leave out, because it had nothing to search for"],
    });
  });
});

describe("renderQuery: Europe PMC, every word looked for in the title and abstract", () => {
  const europepmc = (text: string) => renderQuery(parseQuery(text), "europepmc");

  it("names the field in front of each word and phrase", () => {
    expect(europepmc("chaos double pendulum").text).toBe("TITLE_ABS:chaos AND TITLE_ABS:double AND TITLE_ABS:pendulum");
    expect(europepmc('"memory consolidation" sleep').text).toBe('TITLE_ABS:"memory consolidation" AND TITLE_ABS:sleep');
  });

  it("keeps groups and NOT", () => {
    expect(europepmc("sleep (memory OR dreams) NOT rats").text).toBe(
      "TITLE_ABS:sleep AND (TITLE_ABS:memory OR TITLE_ABS:dreams) NOT TITLE_ABS:rats",
    );
  });

  it("quotes a hyphenated word, because Europe PMC would otherwise read the hyphen as a minus", () => {
    expect(europepmc("self-organizing").text).toBe('TITLE_ABS:"self-organizing"');
  });
});

describe("renderQuery: a source that ignores a group inside a larger search (flat)", () => {
  const flat = (text: string) => renderQuery(parseQuery(text), "boolean-flat");

  it("writes words, phrases and NOT as a boolean source does", () => {
    expect(flat('"memory consolidation" sleep NOT rats')).toEqual({ text: '"memory consolidation" AND sleep NOT rats', notes: [] });
    expect(flat("sleep NOT rats NOT mice").text).toBe("sleep NOT rats NOT mice");
  });

  it("keeps an OR of single words that stands alone", () => {
    expect(flat("sleep OR nap")).toEqual({ text: "sleep OR nap", notes: [] });
    expect(flat('sleep OR "memory consolidation"').text).toBe('sleep OR "memory consolidation"');
  });

  it("leaves out a group of alternatives inside a larger search, and says so", () => {
    expect(flat("sleep (nap OR rest)")).toEqual({
      text: "sleep",
      notes: ["Ignored a group of alternatives (“either word”), because this source ignores such a group inside a larger search"],
    });
  });

  it("leaves out a group to exclude", () => {
    expect(flat("sleep NOT (rats OR mice)")).toEqual({
      text: "sleep",
      notes: ["Ignored a group to leave out, because this source reads only single words and phrases after NOT"],
    });
  });

  it("flattens parentheses that only group words together", () => {
    expect(flat("sleep (memory dreams)").text).toBe("sleep AND memory AND dreams");
  });
});

describe("renderQuery: a plain source that cannot read a hyphen", () => {
  const spaced = (text: string) => renderQuery(parseQuery(text), "plain-spaced");

  it("replaces a hyphen by a space and says so", () => {
    expect(spaced("self-organizing systems")).toEqual({
      text: "self organizing systems",
      notes: ["Hyphens were replaced by spaces, because this source finds nothing for a hyphenated word"],
    });
  });

  it("says nothing when there is no hyphen, and is otherwise the same as plain", () => {
    expect(spaced("sleep memory")).toEqual(renderQuery(parseQuery("sleep memory"), "plain"));
    expect(spaced('"memory consolidation" sleep NOT rats').notes).toEqual(renderQuery(parseQuery('"memory consolidation" sleep NOT rats'), "plain").notes);
  });
});

describe("renderQuery: searching exactly as typed", () => {
  it("sends the same text to every kind of source", () => {
    const query = parseQuery("what is  self-organizing?", { exact: true });
    for (const syntax of ["boolean", "boolean-flat", "pubmed", "europepmc", "plain", "plain-spaced"] as const) {
      expect(renderQuery(query, syntax)).toEqual({ text: "what is  self-organizing?", notes: ["Sent exactly as typed"] });
    }
  });
});

describe("determinism", () => {
  it("gives the same parse and the same text every time", () => {
    const input = 'What is "memory consolidation" (sleep OR nap) NOT rats?';
    expect(parseQuery(input)).toEqual(parseQuery(input));
    expect(renderQuery(parseQuery(input), "boolean")).toEqual(renderQuery(parseQuery(input), "boolean"));
  });
});

describe("termNode", () => {
  it("makes one word a word and several words a phrase, keeping common words", () => {
    expect(termNode("limitation")).toEqual(word("limitation"));
    expect(termNode("no evidence")).toEqual(phrase("no evidence"));
    expect(termNode("no")).toEqual(word("no"));
  });

  it("splits punctuation the way a typed query does, and ignores quotes", () => {
    expect(termNode('"negative-results"')).toEqual(word("negative-results"));
    expect(termNode('"negative/null results"')).toEqual(phrase("negative null results"));
    expect(termNode("  spaced   out ")).toEqual(phrase("spaced out"));
  });

  it("is null when there is no word", () => {
    expect(termNode("")).toBeNull();
    expect(termNode(' "" -- ')).toBeNull();
  });
});

describe("renderQuery: a word that looks like an operator", () => {
  it("is quoted for Boolean sources, so it is read as a word", () => {
    const parsed = parseQuery('rats "AND" mice');
    expect(renderQuery(parsed, "boolean").text).toBe('rats AND "AND" AND mice');
    expect(renderQuery(parseQuery('"or"'), "boolean").text).toBe('"or"');
  });

  it("is left alone for sources that take only words", () => {
    expect(renderQuery(parseQuery('rats "AND" mice'), "plain").text).toBe("rats AND mice");
  });
});

describe("an optional group", () => {
  const optional = (...items: QueryNode[]): QueryNode => ({ type: "or", items, optional: true });
  const query = {
    original: "",
    root: and(word("sleep"), optional(word("bias"), phrase("no evidence"))),
    droppedStopwords: [],
  };

  it("is written like any OR for sources that understand one", () => {
    expect(renderQuery(query, "boolean")).toEqual({ text: 'sleep AND (bias OR "no evidence")', notes: [] });
    expect(formatQuery(query)).toBe('sleep (bias OR "no evidence")');
  });

  it("is left out for sources that take only words, with a note saying so", () => {
    const rendered = renderQuery(query, "plain");
    expect(rendered.text).toBe("sleep");
    expect(rendered.notes).toHaveLength(1);
    expect(rendered.notes[0]).toContain("any of these terms");
  });

  it("still counts its words among the words the query asks for", () => {
    expect(queryTerms(query)).toEqual(["sleep", "bias", "no", "evidence"]);
  });

  it("but not among the words the search is about", () => {
    expect(requiredTerms(query)).toEqual(["sleep"]);
  });
});

describe("requiredTerms", () => {
  it("is the same as queryTerms for a query without an optional group", () => {
    for (const text of ["sleep memory", '"memory consolidation" (sleep OR nap) NOT rats', "covid-19"]) {
      expect(requiredTerms(parseQuery(text))).toEqual(queryTerms(parseQuery(text)));
    }
  });

  it("is empty for a query with nothing in it", () => {
    expect(requiredTerms(parseQuery(""))).toEqual([]);
  });
});

describe("parseQuery: options (nothing is dropped behind your back)", () => {
  const sentence = "what is the best way to predict odor";
  const words = (text: string, options = {}) => queryTerms(parseQuery(text, options));

  it("drops common words by default and reports every one", () => {
    const parsed = parseQuery(sentence);
    expect(queryTerms(parsed)).toEqual(["best", "way", "predict", "odor"]);
    expect(parsed.droppedStopwords).toEqual(["what", "is", "the", "to"]);
    expect(parsed.excludedTerms).toEqual([]);
  });

  it("uses every word typed when dropping is off, and drops nothing", () => {
    const parsed = parseQuery(sentence, { ignoreCommon: false });
    expect(queryTerms(parsed)).toEqual(["what", "is", "the", "best", "way", "to", "predict", "odor"]);
    expect(parsed.droppedStopwords).toEqual([]);
  });

  it("turns a restored common word into an ordinary term, and leaves the others dropped", () => {
    const parsed = parseQuery(sentence, { restored: new Set(["is"]) });
    expect(queryTerms(parsed)).toEqual(["is", "best", "way", "predict", "odor"]);
    expect(parsed.droppedStopwords).toEqual(["what", "the", "to"]);
  });

  it("restores a word wherever it appears, whatever its capitals", () => {
    expect(words("the cat and The dog", { restored: new Set(["the"]) })).toEqual(["the", "cat", "dog"]);
    expect(parseQuery("the cat and The dog", { restored: new Set(["the"]) }).droppedStopwords).toEqual(["and"]);
  });

  it("leaves out a term the person excluded, and reports it", () => {
    const parsed = parseQuery("sleep memory way", { excluded: new Set(["way"]) });
    expect(queryTerms(parsed)).toEqual(["sleep", "memory"]);
    expect(parsed.excludedTerms).toEqual(["way"]);
    expect(parsed.droppedStopwords).toEqual([]);
  });

  it("leaves out a quoted phrase as one term, matched by its lowercase words", () => {
    const parsed = parseQuery('"Double Pendulum" chaos', { excluded: new Set(["double pendulum"]) });
    expect(parsed.root).toEqual(word("chaos"));
    expect(parsed.excludedTerms).toEqual(["Double Pendulum"]);
  });

  it("leaves out every occurrence once, and an excluded common word is excluded, not dropped", () => {
    const parsed = parseQuery("odor the odor", { excluded: new Set(["odor", "the"]) });
    expect(parsed.root).toBeNull();
    expect(parsed.excludedTerms).toEqual(["odor", "the"]);
    expect(parsed.droppedStopwords).toEqual([]);
  });

  it("keeps the other parts of the query when a term inside an OR is left out", () => {
    expect(parseQuery("sleep OR nap", { excluded: new Set(["sleep"]) }).root).toEqual(word("nap"));
  });

  it("keeps every word inside quotes, common words included, as one phrase", () => {
    const parsed = parseQuery('"state of the art" review');
    expect(parsed.root).toEqual(and(phrase("state of the art"), word("review")));
    expect(parsed.droppedStopwords).toEqual([]);
    expect(root('"the"')).toEqual(word("the"));
  });

  it("keeps a quoted phrase's words even when dropping is on and the text is a question", () => {
    expect(parseQuery('what is "the best way"').root).toEqual(phrase("the best way"));
  });

  it("treats an all-caps word of two or more letters as a term: CAN bus, US, IT", () => {
    expect(words("CAN bus protocol")).toEqual(["CAN", "bus", "protocol"]);
    expect(words("US election results")).toEqual(["US", "election", "results"]);
    expect(words("IT support for the clinic")).toEqual(["IT", "support", "clinic"]);
    expect(parseQuery("CAN bus").droppedStopwords).toEqual([]);
  });

  it("still drops the same word when it is not in capitals", () => {
    expect(words("can bus")).toEqual(["bus"]);
    expect(words("Can bus")).toEqual(["bus"]);
    expect(parseQuery("can bus").droppedStopwords).toEqual(["can"]);
  });

  it("does not exempt anything when the whole query is typed in capitals", () => {
    expect(words("WHAT IS THE BEST WAY")).toEqual(["BEST", "WAY"]);
  });

  it("follows the ordinary rule for a single capital letter", () => {
    expect(words("vitamin A deficiency")).toEqual(["vitamin", "deficiency"]);
    expect(parseQuery("vitamin A deficiency").droppedStopwords).toEqual(["a"]);
    expect(words("vitamin C")).toEqual(["vitamin", "C"]);
  });

  it("still reads AND, OR and NOT in capitals as operators, not as all-caps terms", () => {
    expect(root("sleep OR nap NOT rats")).toEqual(or(word("sleep"), and(word("nap"), not(word("rats")))));
  });

  it("still works for a single word", () => {
    expect(root("sleep")).toEqual(word("sleep"));
    expect(root("the")).toBeNull();
    expect(parseQuery("the").droppedStopwords).toEqual(["the"]);
  });

  it("gives the same result for the same text and options", () => {
    const options = { restored: new Set(["is"]), excluded: new Set(["way"]) };
    expect(parseQuery(sentence, options)).toEqual(parseQuery(sentence, options));
  });

  it("does not change the sets it is given", () => {
    const restored = new Set(["is"]);
    parseQuery(sentence, { restored });
    expect([...restored]).toEqual(["is"]);
  });
});

describe("isAllCapsTerm", () => {
  it("needs two or more capital letters or digits, with a letter, in a text that also has lowercase", () => {
    expect(isAllCapsTerm("CAN", true)).toBe(true);
    expect(isAllCapsTerm("US", true)).toBe(true);
    expect(isAllCapsTerm("CD4", true)).toBe(true);
    expect(isAllCapsTerm("A", true)).toBe(false);
    expect(isAllCapsTerm("Can", true)).toBe(false);
    expect(isAllCapsTerm("can", true)).toBe(false);
    expect(isAllCapsTerm("19", true)).toBe(false);
    expect(isAllCapsTerm("CAN", false)).toBe(false);
  });
});

describe("looksLikeQuestion", () => {
  it("is true for a question word first, or a question mark last", () => {
    for (const text of ["what is the best way to predict odor", "How does sleep help memory", "is sleep good", "Can we predict chaos", "Why do we dream", "sleep and memory?", "  which drug works?  "]) {
      expect(looksLikeQuestion(text), text).toBe(true);
    }
  });

  it("is false for a plain list of words", () => {
    for (const text of ["sleep memory consolidation", "double pendulum chaos", '"double pendulum"', "whatever works", "", "   "]) {
      expect(looksLikeQuestion(text), text).toBe(false);
    }
  });

  it("is recorded on the parsed query", () => {
    expect(parseQuery("what is chaos").looksLikeQuestion).toBe(true);
    expect(parseQuery("chaos theory").looksLikeQuestion).toBe(false);
  });
});

describe("parseQuery: exactly as typed", () => {
  const typed = '  what is the "best way" to predict  odor ';

  it("keeps every word, marks the query exact, and sends the text unchanged to every kind of source", () => {
    const parsed = parseQuery(typed, { exact: true });
    expect(parsed.exact).toBe(true);
    expect(parsed.droppedStopwords).toEqual([]);
    expect(queryTerms(parsed)).toEqual(["what", "is", "the", "best", "way", "to", "predict", "odor"]);
    expect(renderQuery(parsed, "boolean")).toEqual({ text: 'what is the "best way" to predict  odor', notes: ["Sent exactly as typed"] });
    expect(renderQuery(parsed, "plain")).toEqual({ text: 'what is the "best way" to predict  odor', notes: ["Sent exactly as typed"] });
    expect(formatQuery(parsed)).toBe('what is the "best way" to predict  odor');
  });

  it("is not exact unless asked", () => {
    expect(parseQuery(typed).exact).toBeUndefined();
    expect(renderQuery(parseQuery("sleep memory"), "boolean").text).toBe("sleep AND memory");
  });

  it("ignores dropping options, since nothing is dropped", () => {
    expect(parseQuery("what is chaos", { exact: true, ignoreCommon: true }).droppedStopwords).toEqual([]);
  });

  it("is still usable only when it has a word", () => {
    expect(isUsable(parseQuery("the of", { exact: true }))).toBe(true);
    expect(isUsable(parseQuery("   ", { exact: true }))).toBe(false);
  });
});
