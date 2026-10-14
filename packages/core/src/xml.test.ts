import { describe, expect, it } from "vitest";
import { childrenNamed, descend, firstChild, parseXml, textOf, XmlError } from "./xml";
// A real PubMed efetch response (see providers/pubmed.test.ts).
import efetch from "./providers/__fixtures__/pubmed-efetch.xml?raw";

describe("parseXml", () => {
  it("reads elements, attributes and text", () => {
    const root = parseXml(`<a x="1" y='two'><b>hi</b><c/></a>`);
    expect(root.name).toBe("a");
    expect(root.attributes).toEqual({ x: "1", y: "two" });
    expect(childrenNamed(root, "b").map(textOf)).toEqual(["hi"]);
    expect(firstChild(root, "c")?.content).toEqual([]);
  });

  it("decodes entities in text and attribute values", () => {
    const root = parseXml(`<a t="x &amp; y">caf&#xe9; &lt;b&gt; &#8211;</a>`);
    expect(root.attributes.t).toBe("x & y");
    expect(textOf(root)).toBe("café <b> –");
  });

  it("keeps mixed content in order", () => {
    const root = parseXml("<t>Effect of <i>sleep</i> on <b>memory</b>.</t>");
    expect(textOf(root)).toBe("Effect of sleep on memory.");
  });

  it("skips the XML declaration, a DOCTYPE with an external DTD, comments and processing instructions", () => {
    const root = parseXml(
      `<?xml version="1.0" ?>\n<!DOCTYPE Set PUBLIC "-//X//DTD//EN" "https://example.org/x.dtd">\n<!-- note -->\n<?pi data?><Set><Item>1</Item></Set>`,
    );
    expect(root.name).toBe("Set");
    expect(textOf(descend(root, "Item"))).toBe("1");
  });

  it("skips a DOCTYPE with an internal subset without loading anything", () => {
    const root = parseXml(`<!DOCTYPE a [ <!ENTITY e "boom"> ]><a>&e;</a>`);
    expect(textOf(root)).toBe("&e;");
  });

  it("reads CDATA literally", () => {
    expect(textOf(parseXml("<a><![CDATA[<not> & markup]]></a>"))).toBe("<not> & markup");
  });

  it("is not confused by '>' inside attribute values", () => {
    const root = parseXml(`<a note="1 > 0"><b/></a>`);
    expect(root.attributes.note).toBe("1 > 0");
    expect(firstChild(root, "b")).not.toBeNull();
  });

  it.each([
    ["mismatched closing tag", "<a><b></a></b>"],
    ["unclosed element", "<a><b>"],
    ["stray closing tag", "</a>"],
    ["unterminated tag", "<a"],
    ["unterminated comment", "<a><!-- x</a>"],
    ["no root element", "   "],
  ])("throws XmlError for %s", (_name, source) => {
    expect(() => parseXml(source)).toThrow(XmlError);
  });

  it("parses a real PubMed efetch response", () => {
    const root = parseXml(efetch);
    expect(root.name).toBe("PubmedArticleSet");
    const articles = childrenNamed(root, "PubmedArticle");
    expect(articles.length).toBe(6);
    const first = articles[0];
    expect(textOf(descend(first, "MedlineCitation", "PMID"))).toMatch(/^\d+$/);
    expect(textOf(descend(first, "MedlineCitation", "Article", "ArticleTitle")).length).toBeGreaterThan(10);
  });
});

describe("textOf / descend / childrenNamed", () => {
  it("handle missing nodes", () => {
    expect(textOf(null)).toBe("");
    expect(textOf(undefined)).toBe("");
    expect(descend(null, "a", "b")).toBeNull();
    expect(childrenNamed(null, "a")).toEqual([]);
    const root = parseXml("<a><b><c>x</c></b></a>");
    expect(descend(root, "b", "c")).not.toBeNull();
    expect(descend(root, "b", "zzz")).toBeNull();
  });
});
