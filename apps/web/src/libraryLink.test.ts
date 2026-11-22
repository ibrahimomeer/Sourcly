import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { joinNames, libraryLabel, libraryLinks, libraryTarget, libraryUrl } from "./libraryLink";

const OPENATHENS = "https://go.openathens.net/redirector/ubc.ca?url=";
const EZPROXY_QURL = "https://ezproxy.example.edu/login?qurl=";

const landing = "https://www.sciencedirect.com/science/article/pii/B9780123814166000017";
const both = { doi: "10.1016/b978-0-12-381416-6.00001-7", url: landing };

/** The part of a link after the prefix, decoded back into the address it carries. */
const carried = (link: string | null, prefix = OPENATHENS) => decodeURIComponent((link ?? "").slice(prefix.length));

describe("libraryUrl: which address", () => {
  it("uses the publisher's landing page first, even when there is a DOI", () => {
    expect(libraryUrl(OPENATHENS, both)).toBe(`${OPENATHENS}${encodeURIComponent(landing)}`);
    expect(carried(libraryUrl(OPENATHENS, both))).toBe(landing);
  });

  it("falls back to the https://doi.org link when there is no landing page", () => {
    const link = libraryUrl(OPENATHENS, { doi: "10.1038/nature04286", url: null });
    expect(link).toBe("https://go.openathens.net/redirector/ubc.ca?url=https%3A%2F%2Fdoi.org%2F10.1038%2Fnature04286");
    expect(carried(link)).toBe("https://doi.org/10.1038/nature04286");
  });

  it("falls back to the DOI when the landing page is not a web address", () => {
    expect(carried(libraryUrl(OPENATHENS, { doi: "10.1000/x", url: "javascript:alert(1)" }))).toBe(
      "https://doi.org/10.1000/x",
    );
    expect(carried(libraryUrl(OPENATHENS, { doi: "10.1000/x", url: "/relative/path" }))).toBe("https://doi.org/10.1000/x");
  });

  it("does not send the library to a provider's own record page; it uses the DOI instead", () => {
    expect(carried(libraryUrl(OPENATHENS, { doi: "10.1000/x", url: "https://openalex.org/W2086162146" }))).toBe(
      "https://doi.org/10.1000/x",
    );
    expect(libraryUrl(OPENATHENS, { doi: null, url: "https://openalex.org/W2086162146" })).toBeNull();
  });

  it("uses a landing page that is itself a doi.org link, as it is", () => {
    const url = "https://doi.org/10.1038/nature04286";
    expect(carried(libraryUrl(OPENATHENS, { doi: "10.1038/nature04286", url }))).toBe(url);
  });

  it("returns null when the result has neither a landing page nor a DOI", () => {
    expect(libraryUrl(OPENATHENS, { doi: null, url: null })).toBeNull();
  });
});

describe("libraryUrl: the prefix", () => {
  it("returns null, so the button is hidden, when the prefix is empty or blank", () => {
    expect(libraryUrl("", both)).toBeNull();
    expect(libraryUrl("   ", both)).toBeNull();
  });

  it("trims stray spaces around the prefix", () => {
    expect(libraryUrl(`  ${OPENATHENS}\n`, both)?.startsWith(`${OPENATHENS}https%3A`)).toBe(true);
  });

  it("works with any library's prefix, such as an EZproxy one ending in qurl=", () => {
    const link = libraryUrl(EZPROXY_QURL, both);
    expect(link?.startsWith(EZPROXY_QURL)).toBe(true);
    expect(carried(link, EZPROXY_QURL)).toBe(landing);
  });
});

describe("libraryUrl: encoding", () => {
  it("encodes the whole address as one value, with no raw slashes or colons after the prefix", () => {
    const rest = (libraryUrl(OPENATHENS, both) ?? "").slice(OPENATHENS.length);
    expect(rest).not.toMatch(/[/:?&#]/);
    expect(rest.startsWith("https%3A%2F%2Fwww.sciencedirect.com%2F")).toBe(true);
  });

  it("keeps an address's own query string inside the value instead of leaking into the link", () => {
    const url = "https://www.publisher.example/article?id=42&format=html#abstract";
    const link = libraryUrl(OPENATHENS, { doi: null, url }) ?? "";
    const parsed = new URL(link);
    expect([...parsed.searchParams.keys()]).toEqual(["url"]);
    expect(parsed.searchParams.get("url")).toBe(url);
    expect(parsed.hash).toBe("");
  });

  it("carries a DOI's unusual characters through unchanged once decoded", () => {
    for (const doi of ["10.1000/a&b#c", "10.1002/(sici)1097-4571(199806)49:8<693::aid-asi5>3.0.co;2-o", "10.1016/s0140-6736(20)30367-6"]) {
      const link = libraryUrl(OPENATHENS, { doi, url: null });
      expect(carried(link)).toBe(`https://doi.org/${doi}`);
      expect(new URL(link ?? "").searchParams.get("url")).toBe(`https://doi.org/${doi}`);
    }
  });
});

describe("libraryTarget", () => {
  it("is the landing page when usable, else the DOI link, else null", () => {
    expect(libraryTarget(both)).toBe(landing);
    expect(libraryTarget({ doi: "10.1000/x", url: null })).toBe("https://doi.org/10.1000/x");
    expect(libraryTarget({ doi: null, url: null })).toBeNull();
  });
});

describe("libraryLinks: one 'Access with ...' link for each library", () => {
  const UBC = DEFAULT_CONFIG.libraries[0]!;
  const UOFT = DEFAULT_CONFIG.libraries[1]!;
  const nature = { doi: "10.1038/s42004-024-01373-2", url: "https://www.nature.com/articles/s42004-024-01373-2" };

  it("gives a UBC Library link and a UofT link, in that order, for the same work", () => {
    const links = libraryLinks(DEFAULT_CONFIG.libraries, nature);
    expect(links.map((link) => link.name)).toEqual(["UBC Library", "UofT"]);
    expect(links[0]?.url).toBe(`https://go.openathens.net/redirector/ubc.ca?url=${encodeURIComponent(nature.url)}`);
    expect(links[1]?.url).toBe(`https://myaccess.library.utoronto.ca/login?qurl=${encodeURIComponent(nature.url)}`);
  });

  it("builds the UofT link from the encoded address, so '&', '?' and '#' stay inside it", () => {
    const tricky = { doi: null, url: "https://example.org/read?id=7&part=2#top" };
    const link = libraryLinks([UOFT], tricky)[0]?.url ?? "";
    expect(link).toBe("https://myaccess.library.utoronto.ca/login?qurl=https%3A%2F%2Fexample.org%2Fread%3Fid%3D7%26part%3D2%23top");
    expect(new URL(link).searchParams.get("qurl")).toBe(tricky.url);
  });

  it("uses the DOI link when there is no landing page, for both libraries", () => {
    const links = libraryLinks(DEFAULT_CONFIG.libraries, { doi: "10.1038/nature04286", url: null });
    expect(links.map((link) => decodeURIComponent(link.url.split(/[=](?=https)/)[1] ?? ""))).toEqual(["https://doi.org/10.1038/nature04286", "https://doi.org/10.1038/nature04286"]);
  });

  it("leaves out a library whose prefix is empty, and every library when the work has no address", () => {
    expect(libraryLinks([{ ...UBC, proxyPrefix: "" }, UOFT], nature).map((link) => link.name)).toEqual(["UofT"]);
    expect(libraryLinks(DEFAULT_CONFIG.libraries, { doi: null, url: null })).toEqual([]);
    expect(libraryLinks([], nature)).toEqual([]);
  });

  it("uses a library's name for the button, or 'your library' when it has none", () => {
    expect(libraryLinks([{ ...UOFT, name: "My Library" }], nature)[0]?.name).toBe("My Library");
    expect(libraryLinks([{ ...UOFT, name: "  " }], nature)[0]?.name).toBe("your library");
    expect(libraryLabel("UofT")).toBe("UofT");
  });
});

describe("joinNames", () => {
  it("lists names as 'A', 'A or B' or 'A, B or C', each once", () => {
    expect(joinNames(["UBC Library"])).toBe("UBC Library");
    expect(joinNames(["UBC Library", "UofT"])).toBe("UBC Library or UofT");
    expect(joinNames(["A", "B", "C"])).toBe("A, B or C");
    expect(joinNames(["A", "A", "B"])).toBe("A or B");
  });

  it("can say 'and', and leaves out empty names", () => {
    expect(joinNames(["UBC Library", "UofT"], "and")).toBe("UBC Library and UofT");
    expect(joinNames(["", "A", ""])).toBe("A");
    expect(joinNames([])).toBe("");
  });
});
