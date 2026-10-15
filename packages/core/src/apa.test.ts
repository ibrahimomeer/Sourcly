import { describe, expect, it } from "vitest";
import {
  apaChecks,
  apaText,
  buildReferenceList,
  formatApa,
  formatApaAuthors,
  journalCase,
  referenceListHtml,
  referenceListText,
  splitName,
} from "./apa";
import { makeResult } from "./testing/make-result";
import type { Author, Result } from "./types";

const text = (result: Result, retrievedOn?: Date) => apaText(formatApa(result, { retrievedOn }));
const person = (family: string, given: string): Author => ({ name: `${given} ${family}`, family, given });

const article = (overrides: Partial<Result> = {}) =>
  makeResult({
    authors: [person("Stickgold", "Robert")],
    year: 2005,
    title: "Sleep-dependent memory consolidation",
    venue: "Nature",
    volume: "437",
    issue: "7063",
    pages: "1272-1278",
    doi: "10.1038/nature04286",
    type: "journal-article",
    ...overrides,
  });

describe("splitName: a name written as one piece of text", () => {
  const family = (name: string) => {
    const parsed = splitName({ name });
    return parsed.kind === "person" ? [parsed.family, parsed.initials, parsed.suffix] : ["(group)", parsed.name];
  };

  it("reads 'Given Family'", () => {
    expect(family("Robert Stickgold")).toEqual(["Stickgold", "R.", ""]);
    expect(family("Mary Ann Smith")).toEqual(["Smith", "M. A.", ""]);
    expect(family("R. J. Smith")).toEqual(["Smith", "R. J.", ""]);
  });

  it("reads 'Family, Given'", () => {
    expect(family("Stickgold, Robert")).toEqual(["Stickgold", "R.", ""]);
    expect(family("Smith, J. Q.")).toEqual(["Smith", "J. Q.", ""]);
    expect(family("de la Cruz, Maria")).toEqual(["de la Cruz", "M.", ""]);
    expect(family("Smith, Jr.")).toEqual(["Smith", "", "Jr."]);
    expect(family("Smith, John, Jr.")).toEqual(["Smith", "J.", "Jr."]);
  });

  it("reads 'Family G' with the initials last", () => {
    expect(family("Stickgold R")).toEqual(["Stickgold", "R.", ""]);
    expect(family("Smith RJ")).toEqual(["Smith", "R. J.", ""]);
    expect(family("Smith R.")).toEqual(["Smith", "R.", ""]);
  });

  it("keeps name particles with the family name", () => {
    expect(family("Ludwig van Beethoven")).toEqual(["van Beethoven", "L.", ""]);
    expect(family("Maria de la Cruz")).toEqual(["de la Cruz", "M.", ""]);
    expect(family("Ada von der Heyden")).toEqual(["von der Heyden", "A.", ""]);
  });

  it("moves Jr. and III to the end", () => {
    expect(family("Martin Luther King Jr.")).toEqual(["King", "M. L.", "Jr."]);
    expect(family("Henry Ford III")).toEqual(["Ford", "H.", "III"]);
  });

  it("writes hyphenated given names with hyphenated initials", () => {
    expect(family("Jean-Paul Sartre")).toEqual(["Sartre", "J.-P.", ""]);
  });

  it("keeps organisations and one-word names whole", () => {
    expect(family("World Health Organization")).toEqual(["(group)", "World Health Organization"]);
    expect(family("The PREDIMED Investigators")).toEqual(["(group)", "The PREDIMED Investigators"]);
    expect(family("Plato")).toEqual(["(group)", "Plato"]);
  });

  it("uses a structured name as it is, whatever it looks like", () => {
    expect(splitName({ name: "x", family: "van der Berg", given: "Jean-Luc" })).toEqual({
      kind: "person",
      family: "van der Berg",
      initials: "J.-L.",
      suffix: "",
    });
    expect(splitName({ name: "Ibn Said", family: "Said", given: "" })).toMatchObject({ family: "Said", initials: "" });
  });

  it("gives initials for given names written in capitals", () => {
    expect(splitName({ name: "x", family: "Smith", given: "JR" })).toMatchObject({ initials: "J. R." });
    expect(splitName({ name: "x", family: "Smith", given: "J.R." })).toMatchObject({ initials: "J. R." });
    expect(splitName({ name: "x", family: "Smith", given: "émile" })).toMatchObject({ initials: "É." });
  });
});

describe("formatApaAuthors: the APA 7 author limits", () => {
  const many = (count: number): Author[] =>
    Array.from({ length: count }, (_, i) => person(`Family${String(i + 1).padStart(2, "0")}`, "Alex"));

  it("is empty for no authors", () => {
    expect(formatApaAuthors([])).toBe("");
  });

  it("writes one author alone", () => {
    expect(formatApaAuthors(many(1))).toBe("Family01, A.");
  });

  it("joins two with a comma and an ampersand", () => {
    expect(formatApaAuthors(many(2))).toBe("Family01, A., & Family02, A.");
  });

  it("writes three to twenty with a comma before the ampersand", () => {
    expect(formatApaAuthors(many(3))).toBe("Family01, A., Family02, A., & Family03, A.");
    const twenty = formatApaAuthors(many(20));
    expect(twenty.startsWith("Family01, A., Family02, A.,")).toBe(true);
    expect(twenty.endsWith(", & Family20, A.")).toBe(true);
    expect(twenty.split("Family")).toHaveLength(21);
  });

  it("writes twenty-one or more as the first nineteen, an ellipsis, and the last, with no ampersand", () => {
    const out = formatApaAuthors(many(21));
    expect(out.startsWith("Family01, A., Family02, A.,")).toBe(true);
    expect(out.endsWith("Family19, A., . . . Family21, A.")).toBe(true);
    expect(out).not.toContain("&");
    expect(out).not.toContain("Family20");
    expect(out.split("Family")).toHaveLength(21); // nineteen, plus the last
    expect(formatApaAuthors(many(60)).endsWith("Family19, A., . . . Family60, A.")).toBe(true);
  });

  it("skips an author with no name", () => {
    expect(formatApaAuthors([{ name: "  " }, person("Smith", "Jo")])).toBe("Smith, J.");
  });
});

describe("formatApa: journal articles", () => {
  it("writes author, year, title, journal, volume(issue), pages and a DOI link", () => {
    expect(text(article())).toBe(
      "Stickgold, R. (2005). Sleep-dependent memory consolidation. Nature, 437(7063), 1272–1278. https://doi.org/10.1038/nature04286",
    );
  });

  it("italicises the journal name and the volume, and nothing else", () => {
    const italic = formatApa(article()).filter((part) => part.italic).map((part) => part.text);
    expect(italic).toEqual(["Nature, 437"]);
  });

  it("gives the DOI as an https link, with no full stop after it", () => {
    const out = text(article({ doi: "10.1000/ABC.1" }));
    expect(out.endsWith("https://doi.org/10.1000/ABC.1")).toBe(true);
  });

  it("writes two and three authors the APA way", () => {
    const two = article({ authors: [person("Stickgold", "Robert"), person("Walker", "Matthew P")] });
    expect(text(two).startsWith("Stickgold, R., & Walker, M. P. (2005).")).toBe(true);
    const three = article({ authors: [person("A", "Ann"), person("B", "Bo"), person("C", "Cy")] });
    expect(text(three).startsWith("A, A., B, B., & C, C. (2005).")).toBe(true);
  });

  it("writes an article number in place of pages", () => {
    expect(text(article({ venue: "PLoS ONE", volume: "12", issue: "3", pages: "e0173456", year: 2017 }))).toBe(
      "Stickgold, R. (2017). Sleep-dependent memory consolidation. PLoS ONE, 12(3), Article e0173456. https://doi.org/10.1038/nature04286",
    );
  });

  it("leaves out what is missing, and never writes an issue without a volume", () => {
    expect(text(article({ issue: null }))).toContain("Nature, 437, 1272–1278.");
    expect(text(article({ volume: null }))).toContain("Nature, 1272–1278.");
    expect(text(article({ volume: null, issue: "5", pages: null }))).toContain("Nature. https://doi.org");
    expect(text(article({ volume: "437", issue: null, pages: null }))).toContain("Nature, 437. https://doi.org");
  });

  it("writes a single page as it is, and keeps a range with a letter in it", () => {
    expect(text(article({ pages: "40" }))).toContain("7063), 40.");
    expect(text(article({ pages: "2801-2811.e9" }))).toContain("7063), 2801–2811.e9.");
    expect(text(article({ pages: "1272 - 1278" }))).toContain("1272–1278.");
  });

  it("writes a review like an article", () => {
    expect(text(article({ type: "review" }))).toContain("Nature, 437(7063)");
  });

  it("writes n.d. when there is no year", () => {
    expect(text(article({ year: null })).startsWith("Stickgold, R. (n.d.). Sleep")).toBe(true);
  });

  it("does not add a second full stop or question mark after a title that ends in one", () => {
    expect(text(article({ title: "Does sleep help?" }))).toContain("(2005). Does sleep help? Nature,");
    expect(text(article({ title: "Sleep and memory." }))).toContain("(2005). Sleep and memory. Nature,");
    expect(text(article({ title: "  Sleep   and\nmemory  " }))).toContain("(2005). Sleep and memory. Nature,");
  });

  it("moves the title to the front when there are no authors", () => {
    expect(text(article({ authors: [] }))).toBe(
      "Sleep-dependent memory consolidation. (2005). Nature, 437(7063), 1272–1278. https://doi.org/10.1038/nature04286",
    );
  });

  it("ends in a full stop when there is no DOI or address", () => {
    expect(text(article({ doi: null, url: null }))).toBe(
      "Stickgold, R. (2005). Sleep-dependent memory consolidation. Nature, 437(7063), 1272–1278.",
    );
  });

  it("uses the web address when there is no DOI, but never a database record page", () => {
    expect(text(article({ doi: null, url: "https://example.org/paper" })).endsWith(" https://example.org/paper")).toBe(true);
    expect(text(article({ doi: null, url: "https://openalex.org/W123" })).endsWith("1272–1278.")).toBe(true);
  });

  it("writes a record with no journal like a general work", () => {
    expect(text(article({ venue: null }))).toBe(
      "Stickgold, R. (2005). Sleep-dependent memory consolidation. https://doi.org/10.1038/nature04286",
    );
  });

  it("never prints markup, even in a title or journal name that still has some", () => {
    const out = text(article({ title: "Detection of <i>Candida albicans</i>: a review", venue: "<i>Journal</i> of Dentistry" }));
    expect(out).toContain("Detection of Candida albicans: a review. Journal of Dentistry, 437");
    expect(out).not.toMatch(/[<>]/);
  });

  it("calls an untitled record Untitled", () => {
    expect(text(article({ title: "" }))).toContain("(2005). Untitled. Nature");
  });
});

describe("formatApa: other kinds of work", () => {
  const base = { authors: [person("Smith", "Jo")], year: 2019, doi: "10.5555/x", volume: null, issue: null, pages: null };

  it("writes a preprint with the server in italics", () => {
    const parts = formatApa(makeResult({ ...base, type: "preprint", title: "A preprint", venue: "bioRxiv" }));
    expect(apaText(parts)).toBe("Smith, J. (2019). A preprint. bioRxiv. https://doi.org/10.5555/x");
    expect(parts.filter((p) => p.italic).map((p) => p.text)).toEqual(["bioRxiv"]);
  });

  it("writes a book with an italic title and the publisher", () => {
    const parts = formatApa(makeResult({ ...base, type: "book", title: "A book about sleep", venue: "Oxford University Press" }));
    expect(apaText(parts)).toBe("Smith, J. (2019). A book about sleep. Oxford University Press. https://doi.org/10.5555/x");
    expect(parts.filter((p) => p.italic).map((p) => p.text)).toEqual(["A book about sleep"]);
  });

  it("writes a data set, a thesis and a report with a description in brackets or none", () => {
    expect(text(makeResult({ ...base, type: "dataset", title: "Sleep data", venue: "Zenodo" }))).toBe(
      "Smith, J. (2019). Sleep data [Data set]. Zenodo. https://doi.org/10.5555/x",
    );
    expect(text(makeResult({ ...base, type: "thesis", title: "On sleep", venue: "A repository" }))).toBe(
      "Smith, J. (2019). On sleep [Thesis]. A repository. https://doi.org/10.5555/x",
    );
    expect(text(makeResult({ ...base, type: "report", title: "A report", venue: "A body" }))).toBe(
      "Smith, J. (2019). A report. A body. https://doi.org/10.5555/x",
    );
  });

  it("puts a stand-alone work's title first when there is no author", () => {
    expect(text(makeResult({ ...base, authors: [], type: "dataset", title: "Sleep data", venue: "Zenodo" }))).toBe(
      "Sleep data [Data set]. (2019). Zenodo. https://doi.org/10.5555/x",
    );
  });

  it("does not add a full stop after an italic title that ends in a question mark", () => {
    expect(text(makeResult({ ...base, type: "book", title: "Why do we sleep?", venue: "Scribner" }))).toBe(
      "Smith, J. (2019). Why do we sleep? Scribner. https://doi.org/10.5555/x",
    );
  });

  it("writes a book chapter with 'In' and the book, and pages when it has them", () => {
    const chapter = makeResult({ ...base, type: "book-chapter", title: "A chapter", venue: "The sleep handbook", pages: "10-20" });
    expect(text(chapter)).toBe("Smith, J. (2019). A chapter. In The sleep handbook (pp. 10–20). https://doi.org/10.5555/x");
    expect(formatApa(chapter).filter((p) => p.italic).map((p) => p.text)).toEqual(["The sleep handbook"]);
    expect(text({ ...chapter, pages: null })).toBe("Smith, J. (2019). A chapter. In The sleep handbook. https://doi.org/10.5555/x");
    expect(text({ ...chapter, pages: "12" })).toContain("(p. 12).");
  });

  it("writes a conference paper and a reference entry with 'In'", () => {
    expect(text(makeResult({ ...base, type: "conference-paper", title: "A talk", venue: "Proceedings of sleep" }))).toBe(
      "Smith, J. (2019). A talk. In Proceedings of sleep. https://doi.org/10.5555/x",
    );
    expect(text(makeResult({ ...base, type: "reference-entry", title: "Sleep", venue: "An encyclopedia" }))).toBe(
      "Smith, J. (2019). Sleep. In An encyclopedia. https://doi.org/10.5555/x",
    );
  });

  it("writes a Wikipedia page with n.d. and the date it was retrieved", () => {
    const page = makeResult({
      authors: [],
      year: null,
      title: "Sleep",
      venue: "Wikipedia",
      type: "reference-entry",
      doi: null,
      url: "https://en.wikipedia.org/wiki/Sleep",
      hits: [{ provider: "wikipedia", id: "1", rank: 1, listSize: 1, score: null }],
    });
    expect(text(page, new Date(2026, 9, 14))).toBe(
      "Sleep. (n.d.). In Wikipedia. Retrieved October 14, 2026, from https://en.wikipedia.org/wiki/Sleep",
    );
    expect(formatApa(page, { retrievedOn: new Date(2026, 9, 14) }).filter((p) => p.italic).map((p) => p.text)).toEqual(["Wikipedia"]);
  });

  it("falls back to a general form for 'other' and 'unknown' types", () => {
    expect(text(makeResult({ ...base, type: "unknown", title: "Something", venue: "Somewhere" }))).toBe(
      "Smith, J. (2019). Something. Somewhere. https://doi.org/10.5555/x",
    );
  });
});

describe("apaChecks", () => {
  it("has nothing to say about a complete, sentence-case journal article", () => {
    expect(apaChecks(article())).toEqual([]);
  });

  it("says when the author names were split by rule", () => {
    expect(apaChecks(article({ authors: [{ name: "Robert Stickgold" }] }))).toEqual([
      "Author names came as one piece of text, so Sourcly split them into family name and initials by rule. Check them.",
    ]);
  });

  it("flags missing authors, year, title, volume and pages, and links", () => {
    const checks = apaChecks(article({ authors: [], year: null, title: "", volume: null, pages: null, doi: null, url: null }));
    expect(checks).toEqual([
      "No authors were listed, so the title stands in the author position.",
      "No year was listed, so it shows (n.d.).",
      "No title was listed.",
      "The sources gave no volume, issue or pages for this article. Add them from the publisher's page.",
      "No DOI or web address was found.",
    ]);
  });

  it("flags a title in Title Case, but not sentence case or a short title", () => {
    expect(apaChecks(article({ title: "Sleep Dependent Memory Consolidation In Adults" }))).toContain(
      "The title looks like Title Case. APA 7 wants sentence case (only the first word and proper nouns capitalised).",
    );
    expect(apaChecks(article({ title: "Sleep-dependent memory consolidation in adults" })).join(" ")).not.toContain("Title Case");
    expect(apaChecks(article({ title: "Sleep And Memory" })).join(" ")).not.toContain("Title Case");
  });

  it("says what a book chapter, a conference paper and a Wikipedia page lack", () => {
    expect(apaChecks(makeResult({ type: "book-chapter", authors: [person("A", "B")], venue: "Book" }))).toContain(
      "Editors and the publisher are not available. Add them from the book.",
    );
    expect(apaChecks(makeResult({ type: "conference-paper", authors: [person("A", "B")], venue: "Conf" })).join(" ")).toContain(
      "conference name",
    );
    expect(
      apaChecks(makeResult({ venue: "Wikipedia", authors: [], year: null, hits: [{ provider: "wikipedia", id: "1", rank: 1, listSize: 1, score: null }] })),
    ).toEqual(["The retrieval date is today's date. Wikipedia changes, so APA asks for it."]);
  });
});

describe("buildReferenceList", () => {
  const work = (family: string, year: number | null, title: string, extra: Partial<Result> = {}) =>
    makeResult({
      id: `10.1/${family}-${year}-${title}`,
      doi: `10.1/${family}-${year}-${title}`.replace(/\s/g, "-"),
      authors: [person(family, "Ann")],
      year,
      title,
      volume: null,
      issue: null,
      pages: null,
      ...extra,
    });

  it("sorts by the first author's family name, letter by letter", () => {
    const list = buildReferenceList([work("Smith", 2020, "S"), work("Adams", 2020, "A"), work("de Vries", 2020, "D"), work("Brown", 2020, "B")]);
    expect(list.map((entry) => entry.text.split(",")[0])).toEqual(["Adams", "Brown", "de Vries", "Smith"]);
  });

  it("ignores accents, capitals and spaces when sorting", () => {
    const list = buildReferenceList([work("Öztürk", 2020, "O"), work("Ozawa", 2020, "Z"), work("O'Brien", 2020, "B")]);
    expect(list.map((entry) => entry.result.authors[0]?.family)).toEqual(["O'Brien", "Ozawa", "Öztürk"]);
  });

  it("puts a single author before several that start with the same author, then sorts by the next author", () => {
    const solo = work("Smith", 2021, "Solo");
    const withJones = makeResult({ ...solo, id: "x1", doi: "10.1/x1", authors: [person("Smith", "Ann"), person("Jones", "Bo")], title: "With Jones" });
    const withAdams = makeResult({ ...solo, id: "x2", doi: "10.1/x2", authors: [person("Smith", "Ann"), person("Adams", "Cy")], title: "With Adams" });
    const list = buildReferenceList([withJones, withAdams, solo]);
    expect(list.map((entry) => entry.result.title)).toEqual(["Solo", "With Adams", "With Jones"]);
  });

  it("sorts one author's works by year, earliest first, with no date first of all", () => {
    const list = buildReferenceList([work("Smith", 2022, "Third"), work("Smith", null, "Undated"), work("Smith", 2019, "First")]);
    expect(list.map((entry) => entry.result.title)).toEqual(["Undated", "First", "Third"]);
  });

  it("puts a work with no author in the list under the first word of its title, ignoring A, An and The", () => {
    const anon = makeResult({ id: "z", doi: "10.1/z", authors: [], title: "The Beta report", year: 2020, volume: null, issue: null, pages: null });
    const list = buildReferenceList([work("Smith", 2020, "S"), work("Alpha", 2020, "A"), anon]);
    expect(list.map((entry) => entry.result.title)).toEqual(["A", "The Beta report", "S"]);
  });

  it("adds a, b, c to the year of works by the same authors in the same year, in title order", () => {
    const list = buildReferenceList([work("Smith", 2020, "Zebra"), work("Smith", 2020, "Apple"), work("Smith", 2019, "Old"), work("Smith", 2020, "Mango")]);
    expect(list.map((entry) => entry.text.match(/\((\d{4}[a-z]?)\)/)?.[1])).toEqual(["2019", "2020a", "2020b", "2020c"]);
    expect(list.map((entry) => entry.result.title)).toEqual(["Old", "Apple", "Mango", "Zebra"]);
  });

  it("does not add a letter to works whose authors differ, or whose years differ", () => {
    const list = buildReferenceList([work("Smith", 2020, "A"), work("Jones", 2020, "B"), work("Smith", 2021, "C")]);
    for (const entry of list) expect(entry.text).toMatch(/\(\d{4}\)/);
  });

  it("writes n.d.-a, n.d.-b for undated works by one author", () => {
    const list = buildReferenceList([work("Smith", null, "Beta"), work("Smith", null, "Alpha")]);
    expect(list.map((entry) => entry.text.match(/\((n\.d\.[-a-z]*)\)/)?.[1])).toEqual(["n.d.-a", "n.d.-b"]);
  });

  it("does not change its input, and is the same whatever order it is given", () => {
    const input = [work("Smith", 2020, "S"), work("Adams", 2020, "A"), work("Smith", 2020, "T")];
    const before = input.map((r) => r.id);
    const one = buildReferenceList(input).map((e) => e.text);
    const two = buildReferenceList([...input].reverse()).map((e) => e.text);
    expect(two).toEqual(one);
    expect(input.map((r) => r.id)).toEqual(before);
  });

  it("returns an empty list for no results", () => {
    expect(buildReferenceList([])).toEqual([]);
  });

  it("gives each entry its checks", () => {
    const [entry] = buildReferenceList([article({ pages: null })]);
    expect(entry?.checks).toContain("The sources gave no volume, issue or pages for this article. Add them from the publisher's page.");
  });
});

describe("referenceListText and referenceListHtml", () => {
  const entries = buildReferenceList([
    article(),
    article({ id: "b", doi: "10.1/b", authors: [person("Adams", "Ann"), person("Brown & Sons", "Bo")], title: "A claim with p < 0.05 and n > 10", venue: "J. Tests" }),
  ]);

  it("joins plain references with a blank line, ending in a newline", () => {
    const out = referenceListText(entries);
    expect(out.split("\n\n")).toHaveLength(2);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.startsWith("Adams, A., & Brown & Sons, B. (2005).")).toBe(true);
    expect(out).not.toContain("<i>");
  });

  it("is empty for an empty list", () => {
    expect(referenceListText([])).toBe("");
    expect(referenceListHtml([])).toBe("");
  });

  it("writes HTML paragraphs with a hanging indent, italics, and escaped text", () => {
    const html = referenceListHtml(entries);
    expect(html.split("\n")).toHaveLength(2);
    expect(html).toContain('<p style="margin:0 0 0 36pt;text-indent:-36pt;line-height:2">');
    expect(html).toContain("<i>Nature, 437</i>");
    expect(html).toContain("&amp; Brown &amp; Sons");
    expect(html).toContain("A claim with p &lt; 0.05 and n &gt; 10");
    expect(html).not.toContain("p < 0.05");
  });
});

describe("journalCase", () => {
  it("capitalises the main words of a journal name PubMed wrote in lower case", () => {
    expect(journalCase("Brain communications")).toBe("Brain Communications");
    expect(journalCase("Current biology : CB")).toBe("Current Biology: CB");
    expect(journalCase("Journal of clinical neurophysiology : official publication of the American Electroencephalographic Society")).toBe(
      "Journal of Clinical Neurophysiology: Official Publication of the American Electroencephalographic Society",
    );
    expect(journalCase("annals of the new york academy of sciences")).toBe("Annals of the New York Academy of Sciences");
    expect(journalCase("nature")).toBe("Nature");
  });

  it("leaves a name that is already capitalised, or has capitals inside a word, as it is", () => {
    for (const name of ["Nature", "Nature Communications", "Journal of Student Research", "PLoS ONE", "eLife", "mBio", "bioRxiv", "Proceedings of the National Academy of Sciences", "Sleep"]) {
      expect(journalCase(name)).toBe(name);
    }
  });

  it("tidies spaces and a spaced colon", () => {
    expect(journalCase("  Journal   of Sleep Research ")).toBe("Journal of Sleep Research");
    expect(journalCase("Neuron : a subtitle")).toBe("Neuron: A Subtitle");
  });

  it("is used for the journal in a reference, but not for a preprint server or a publisher", () => {
    const lower = makeResult({ authors: [person("Smith", "Jo")], year: 2024, title: "A title", venue: "Brain communications", volume: "8", issue: "4", pages: "e1", type: "journal-article", doi: "10.1/x" });
    expect(text(lower)).toContain(" Brain Communications, 8(4), Article e1.");
    const preprint = makeResult({ authors: [person("Smith", "Jo")], year: 2024, title: "A title", venue: "medRxiv", type: "preprint", doi: "10.1/x" });
    expect(text(preprint)).toContain(" medRxiv. https");
  });
});
