import { describe, expect, it } from "vitest";
import { libraryTarget, libraryUrl } from "./libraryLink";

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
