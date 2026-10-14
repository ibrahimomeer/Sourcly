import { describe, expect, it } from "vitest";
import {
  excludedTerms,
  formatQuery,
  isUsable,
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
