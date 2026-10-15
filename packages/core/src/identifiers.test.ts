import { describe, expect, it } from "vitest";
import { MIN_TITLE_WORDS, describeInput, parseInput, type DetectedInput } from "./identifiers";

const doi = (value: string): DetectedInput => ({ kind: "doi", doi: value });

// What was typed, and what the page should make of it. Each row is one input.
const TABLE: [string, string, DetectedInput][] = [
  // DOIs written in the usual ways
  ["bare DOI", "10.1038/s42004-024-01373-2", doi("10.1038/s42004-024-01373-2")],
  ["bare DOI of a book chapter, capitals", "10.1016/B978-0-323-99796-6.00014-X", doi("10.1016/b978-0-323-99796-6.00014-x")],
  ["doi: prefix", "doi:10.1371/journal.pone.0173456", doi("10.1371/journal.pone.0173456")],
  ["DOI: prefix with a space", "DOI: 10.1371/journal.pone.0173456", doi("10.1371/journal.pone.0173456")],
  ["doi.org link", "https://doi.org/10.1126/science.abc1234", doi("10.1126/science.abc1234")],
  ["dx.doi.org link", "http://dx.doi.org/10.1126/science.abc1234", doi("10.1126/science.abc1234")],
  ["doi.org link without a scheme", "doi.org/10.1126/science.abc1234", doi("10.1126/science.abc1234")],
  ["DOI with a full stop after it", "10.1234/abc.def.", doi("10.1234/abc.def")],
  ["DOI with brackets in it", "10.1016/S0140-6736(20)30183-5", doi("10.1016/s0140-6736(20)30183-5")],
  // Publisher addresses that carry the DOI
  ["Springer article", "https://link.springer.com/article/10.1007/s00134-020-06294-x", doi("10.1007/s00134-020-06294-x")],
  ["Springer PDF", "https://link.springer.com/content/pdf/10.1007/s00134-020-06294-x.pdf", doi("10.1007/s00134-020-06294-x")],
  ["Wiley doi/full", "https://onlinelibrary.wiley.com/doi/full/10.1111/jocn.15000", doi("10.1111/jocn.15000")],
  ["Wiley doi/abs", "https://onlinelibrary.wiley.com/doi/abs/10.1002/anie.202012345", doi("10.1002/anie.202012345")],
  ["Wiley doi/pdf", "https://onlinelibrary.wiley.com/doi/pdf/10.1111/jocn.15000", doi("10.1111/jocn.15000")],
  ["Taylor & Francis", "https://www.tandfonline.com/doi/full/10.1080/00031305.2016.1154108", doi("10.1080/00031305.2016.1154108")],
  ["PNAS", "https://www.pnas.org/doi/10.1073/pnas.1914777117", doi("10.1073/pnas.1914777117")],
  ["science.org", "https://www.science.org/doi/10.1126/science.abc1234", doi("10.1126/science.abc1234")],
  ["address with a query string", "https://example.org/article?doi=10.1234/xyz&x=1", doi("10.1234/xyz")],
  // nature.com/articles/<id> is 10.1038/<id>
  ["nature.com article", "https://www.nature.com/articles/s42004-024-01373-2", doi("10.1038/s42004-024-01373-2")],
  ["nature.com article, old style id", "https://www.nature.com/articles/nature12373", doi("10.1038/nature12373")],
  ["nature.com article with a trailing slash", "https://www.nature.com/articles/s41586-020-2649-2/", doi("10.1038/s41586-020-2649-2")],
  // arXiv
  ["arXiv number", "2304.00997", { kind: "arxiv", id: "2304.00997", doi: "10.48550/arxiv.2304.00997" }],
  ["arXiv number with a version", "2304.00997v2", { kind: "arxiv", id: "2304.00997", doi: "10.48550/arxiv.2304.00997" }],
  ["arXiv: prefix", "arXiv:1706.03762", { kind: "arxiv", id: "1706.03762", doi: "10.48550/arxiv.1706.03762" }],
  ["arXiv abstract page", "https://arxiv.org/abs/1706.03762v7", { kind: "arxiv", id: "1706.03762", doi: "10.48550/arxiv.1706.03762" }],
  ["arXiv PDF", "https://arxiv.org/pdf/1706.03762.pdf", { kind: "arxiv", id: "1706.03762", doi: "10.48550/arxiv.1706.03762" }],
  ["arXiv old-style number", "hep-th/9901001", { kind: "arxiv", id: "hep-th/9901001", doi: "10.48550/arxiv.hep-th/9901001" }],
  // PubMed and PubMed Central
  ["PMID with a label", "PMID: 29456894", { kind: "pmid", pmid: "29456894" }],
  ["pmid: without a space", "pmid:29456894", { kind: "pmid", pmid: "29456894" }],
  ["PubMed address", "https://pubmed.ncbi.nlm.nih.gov/29456894/", { kind: "pmid", pmid: "29456894" }],
  ["old PubMed address", "https://www.ncbi.nlm.nih.gov/pubmed/29456894", { kind: "pmid", pmid: "29456894" }],
  ["Europe PMC article", "https://europepmc.org/article/MED/29456894", { kind: "pmid", pmid: "29456894" }],
  ["PMCID", "PMC5815332", { kind: "pmcid", pmcid: "PMC5815332" }],
  ["PMC address", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5815332/", { kind: "pmcid", pmcid: "PMC5815332" }],
  ["new PMC address", "https://pmc.ncbi.nlm.nih.gov/articles/PMC5815332/", { kind: "pmcid", pmcid: "PMC5815332" }],
  // OpenAlex
  ["OpenAlex id", "W2741809807", { kind: "openalex", id: "W2741809807" }],
  ["OpenAlex address", "https://openalex.org/W2741809807", { kind: "openalex", id: "W2741809807" }],
  ["OpenAlex API address", "https://api.openalex.org/works/W2741809807", { kind: "openalex", id: "W2741809807" }],
  // Any other address is looked up by its address, never fetched
  ["a publisher page with no DOI in it", "https://www.sciencedirect.com/science/article/pii/S0360131520300178", { kind: "url", url: "https://www.sciencedirect.com/science/article/pii/S0360131520300178" }],
  ["an IEEE page", "https://ieeexplore.ieee.org/document/9363326", { kind: "url", url: "https://ieeexplore.ieee.org/document/9363326" }],
  // Not a lookup
  ["one keyword", "pendulum", { kind: "keywords" }],
  ["two keywords", "double pendulum", { kind: "keywords" }],
  ["a bare number", "2024", { kind: "keywords" }],
  ["a bare long number is not a PubMed ID", "29456894", { kind: "keywords" }],
  ["empty", "   ", { kind: "keywords" }],
];

describe("parseInput: what was typed", () => {
  it.each(TABLE)("%s: %s", (_what, text, expected) => {
    expect(parseInput(text)).toEqual(expected);
  });

  it("covers at least twenty different inputs", () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(20);
  });

  it("gives the same answer however much space is around the text", () => {
    expect(parseInput("  \t10.1038/s42004-024-01373-2\n ")).toEqual(parseInput("10.1038/s42004-024-01373-2"));
  });
});

describe("parseInput: titles", () => {
  const title = "Odor prediction of whiskies based on their molecular composition";

  it("calls eight or more plain words a title", () => {
    expect(MIN_TITLE_WORDS).toBe(8);
    expect(parseInput(title)).toEqual({ kind: "title", title });
    expect(parseInput("one two three four five six seven eight")).toEqual({ kind: "title", title: "one two three four five six seven eight" });
  });

  it("does not call seven words a title", () => {
    expect(parseInput("one two three four five six seven")).toEqual({ kind: "keywords" });
  });

  it("does not call text with an operator a title", () => {
    expect(parseInput("odor prediction AND whiskies based on their molecular composition")).toEqual({ kind: "keywords" });
    expect(parseInput("odor prediction OR whiskies based on their molecular composition")).toEqual({ kind: "keywords" });
    expect(parseInput("odor prediction NOT whiskies based on their molecular composition")).toEqual({ kind: "keywords" });
  });

  it("does not call quoted or bracketed text a title", () => {
    expect(parseInput('"odor prediction" of whiskies based on their molecular composition')).toEqual({ kind: "keywords" });
    expect(parseInput("odor prediction (whiskies) based on their molecular composition")).toEqual({ kind: "keywords" });
  });

  it("does not call a question a title", () => {
    expect(parseInput("what molecular properties of whiskies determine the odor we perceive")).toEqual({ kind: "keywords" });
    expect(parseInput("molecular properties of whiskies determine the odor we perceive, or not?")).toEqual({ kind: "keywords" });
    expect(parseInput("can AI predict what a molecule smells like")).toEqual({ kind: "keywords" });
  });

  it("keeps lowercase and, or, not as ordinary words in a title", () => {
    expect(parseInput("Sleep and memory in children and adolescents with and without sleep apnea").kind).toBe("title");
  });
});

describe("describeInput", () => {
  it("names what was detected, for the line under the search box", () => {
    expect(describeInput(doi("10.1/x"))).toBe("DOI");
    expect(describeInput({ kind: "arxiv", id: "1", doi: "x" })).toBe("arXiv ID");
    expect(describeInput({ kind: "pmid", pmid: "1" })).toBe("PubMed ID");
    expect(describeInput({ kind: "pmcid", pmcid: "PMC1" })).toBe("PubMed Central ID");
    expect(describeInput({ kind: "openalex", id: "W1" })).toBe("OpenAlex ID");
    expect(describeInput({ kind: "url", url: "https://x.org" })).toBe("link");
    expect(describeInput({ kind: "title", title: "t" })).toBe("title");
    expect(describeInput({ kind: "keywords" })).toBe("keywords");
  });
});
