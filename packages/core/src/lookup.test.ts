import { describe, expect, it, vi } from "vitest";
import { addressVariants, closestTitleMatch, fetchNeighbours, lookupWork, titleSimilarity, withUnpaywall, MIN_TITLE_SIMILARITY } from "./lookup";
import { makeResult } from "./testing/make-result";
// Real responses recorded on 2026-10-15 for the DOI 10.1038/s42004-024-01373-2 ("Odor prediction of whiskies based on
// their molecular composition"): OpenAlex's work (with its related works), Crossref's work, Unpaywall's answer, and the
// first five works OpenAlex lists as cited by it. Third-party email addresses were replaced by redacted@example.org.
import crossrefWork from "./providers/__fixtures__/lookup-crossref-work.json";
import openalexCitedBy from "./providers/__fixtures__/lookup-openalex-cited-by.json";
import openalexWork from "./providers/__fixtures__/lookup-openalex-work.json";
import unpaywall from "./providers/__fixtures__/lookup-unpaywall.json";

const DOI = "10.1038/s42004-024-01373-2";
type Route = [RegExp, unknown | (() => Response)];

/** A fetch that answers each address from a list, and refuses (HTTP 404) anything else. */
function routed(routes: Route[]) {
  return vi.fn<typeof fetch>((input) => {
    const url = String(input);
    for (const [pattern, body] of routes) {
      if (pattern.test(url)) return Promise.resolve(typeof body === "function" ? (body as () => Response)() : Response.json(body));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
}

const everything: Route[] = [
  [/api\.openalex\.org\/works\/doi:/, openalexWork],
  [/api\.crossref\.org\/works\//, crossrefWork],
  [/api\.unpaywall\.org\/v2\//, unpaywall],
];
const urlsOf = (mock: ReturnType<typeof routed>) => mock.mock.calls.map((call) => String(call[0]));

describe("lookupWork: a DOI", () => {
  it("asks OpenAlex and Crossref by DOI and merges them into one work", async () => {
    const fetchMock = routed(everything);
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: fetchMock });
    expect(outcome.result).toMatchObject({ title: "Odor prediction of whiskies based on their molecular composition", doi: DOI, year: 2024, type: "journal-article" });
    expect(outcome.result?.hits.map((hit) => hit.provider).sort()).toEqual(["crossref", "openalex"]);
    expect(outcome.sources).toEqual(["OpenAlex", "Crossref"]);
    expect(outcome.openAlexId).toBe("W4405613535");
    expect(outcome.relatedIds).toHaveLength(10);
    const urls = urlsOf(fetchMock);
    expect(urls.some((url) => url.startsWith(`https://api.openalex.org/works/doi:${DOI}`))).toBe(true);
    expect(urls.some((url) => url.startsWith(`https://api.crossref.org/works/${DOI}`))).toBe(true);
  });

  it("does not ask Unpaywall without a contact email, and says why", async () => {
    const fetchMock = routed(everything);
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: fetchMock });
    expect(urlsOf(fetchMock).some((url) => url.includes("unpaywall"))).toBe(false);
    expect(outcome.notes.join(" ")).toContain("Unpaywall was not asked: it needs a contact email");
  });

  it("asks Unpaywall when there is a contact email, sends it as the email and to Crossref as mailto, and uses its open copy", async () => {
    const fetchMock = routed(everything);
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: fetchMock, contactEmail: "me@example.org" });
    const unpaywallUrl = new URL(urlsOf(fetchMock).find((url) => url.includes("unpaywall")) ?? "");
    expect(unpaywallUrl.searchParams.get("email")).toBe("me@example.org");
    expect(new URL(urlsOf(fetchMock).find((url) => url.includes("crossref")) ?? "").searchParams.get("mailto")).toBe("me@example.org");
    expect(outcome.sources).toContain("Unpaywall");
    expect(outcome.result?.openAccess).toMatchObject({ isOpen: true, status: "gold", pdfUrl: "https://www.nature.com/articles/s42004-024-01373-2.pdf" });
    expect(outcome.notes.join(" ")).not.toContain("Unpaywall was not asked");
  });

  it("still gives the work when one source does not know it or does not answer", async () => {
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: routed([[/api\.openalex\.org/, openalexWork], [/api\.crossref\.org/, () => new Response("busy", { status: 503 })]]) });
    expect(outcome.result?.title).toContain("Odor prediction");
    expect(outcome.sources).toEqual(["OpenAlex"]);
    expect(outcome.notes.some((note) => note.includes("Crossref"))).toBe(true);
  });

  it("finds nothing, and says so, when no source knows the DOI", async () => {
    const outcome = await lookupWork({ kind: "doi", doi: "10.1234/nothing" }, { fetch: routed([]) });
    expect(outcome.result).toBeNull();
    expect(outcome.openAlexId).toBeNull();
  });
});

describe("lookupWork: other identifiers", () => {
  it("looks an arXiv number up as its DOI, which arXiv gives every paper", async () => {
    const fetchMock = routed(everything);
    await lookupWork({ kind: "arxiv", id: "1706.03762", doi: "10.48550/arxiv.1706.03762" }, { fetch: fetchMock });
    expect(urlsOf(fetchMock).some((url) => url.startsWith("https://api.openalex.org/works/doi:10.48550/arxiv.1706.03762"))).toBe(true);
  });

  it("looks an OpenAlex id up directly, then asks the DOI-keyed sources", async () => {
    const fetchMock = routed([[/api\.openalex\.org\/works\/W4405613535/, openalexWork], ...everything]);
    const outcome = await lookupWork({ kind: "openalex", id: "W4405613535" }, { fetch: fetchMock });
    expect(outcome.result?.doi).toBe(DOI);
    expect(urlsOf(fetchMock)[0]).toContain("/works/W4405613535");
    expect(outcome.sources).toContain("Crossref");
  });

  it("looks a PubMed ID up in OpenAlex by pmid:", async () => {
    const fetchMock = routed([[/api\.openalex\.org\/works\/pmid:/, openalexWork], ...everything]);
    await lookupWork({ kind: "pmid", pmid: "29456894" }, { fetch: fetchMock });
    expect(urlsOf(fetchMock).some((url) => url.startsWith("https://api.openalex.org/works/pmid:29456894"))).toBe(true);
  });

  it("looks an address up by its landing page in OpenAlex, never by fetching the page", async () => {
    const address = "https://example.org/papers/odor?x=1";
    const fetchMock = routed([[/api\.openalex\.org\/works\?/, { results: [openalexWork] }], ...everything]);
    const outcome = await lookupWork({ kind: "url", url: address }, { fetch: fetchMock });
    const hosts = new Set(urlsOf(fetchMock).map((url) => new URL(url).host));
    expect([...hosts].every((host) => ["api.openalex.org", "api.crossref.org", "api.unpaywall.org"].includes(host))).toBe(true);
    const filter = new URL(urlsOf(fetchMock)[0] ?? "").searchParams.get("filter") ?? "";
    expect(filter.startsWith("locations.landing_page_url:https://example.org/papers/odor?x=1")).toBe(true);
    expect(outcome.result?.doi).toBe(DOI);
  });

  it("says it could not identify a link that no source knows", async () => {
    const outcome = await lookupWork({ kind: "url", url: "https://example.org/unknown" }, { fetch: routed([[/api\.openalex\.org\/works\?/, { results: [] }]]) });
    expect(outcome.result).toBeNull();
    expect(outcome.notes).toContain("Could not identify this link. Paste the DOI or the title.");
  });
});

describe("lookupWork: a failure of the browser itself", () => {
  it("says so when a request failed in the browser (a fetch TypeError), for the page to explain", async () => {
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: () => Promise.reject(new TypeError("Failed to fetch")) });
    expect(outcome.result).toBeNull();
    expect(outcome.network).toBe(true);
  });

  it("does not say so for an HTTP error, which is the source's answer", async () => {
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: () => Promise.resolve(new Response("{}", { status: 500 })) });
    expect(outcome.result).toBeNull();
    expect(outcome).not.toHaveProperty("network");
  });

  it("does not say so when the work was found", async () => {
    const outcome = await lookupWork({ kind: "doi", doi: DOI }, { fetch: routed(everything) });
    expect(outcome.result).not.toBeNull();
    expect(outcome).not.toHaveProperty("network");
  });
});

describe("addressVariants", () => {
  it("lists the ways one landing page address may be stored: http and https, with and without www, with and without a trailing slash", () => {
    const variants = addressVariants("https://www.nature.com/articles/s42004-024-01373-2#section");
    expect(variants).toContain("https://www.nature.com/articles/s42004-024-01373-2");
    expect(variants).toContain("https://nature.com/articles/s42004-024-01373-2/");
    expect(variants).toContain("http://www.nature.com/articles/s42004-024-01373-2");
    expect(variants.every((variant) => !variant.includes("#"))).toBe(true);
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe("withUnpaywall", () => {
  const closed = makeResult({ openAccess: { isOpen: null, status: "unknown", url: null, pdfUrl: null } });

  it("takes a free copy and its PDF from Unpaywall's best open location", () => {
    expect(withUnpaywall(closed, unpaywall).openAccess).toMatchObject({ isOpen: true, status: "gold", pdfUrl: "https://www.nature.com/articles/s42004-024-01373-2.pdf" });
  });

  it("never invents a PDF: a closed answer gives none", () => {
    const result = withUnpaywall(closed, { is_oa: false, oa_status: "closed", best_oa_location: { url_for_pdf: "https://x.org/a.pdf" } });
    expect(result.openAccess).toEqual({ isOpen: false, status: "closed", url: null, pdfUrl: null });
  });

  it("does not take away an open copy another source found", () => {
    const open = makeResult({ openAccess: { isOpen: true, status: "green", url: "https://repo.org/a", pdfUrl: null } });
    expect(withUnpaywall(open, { is_oa: false, oa_status: "closed" }).openAccess.isOpen).toBe(true);
  });

  it("leaves the result alone for an answer it does not understand", () => {
    expect(withUnpaywall(closed, { HTTP_status_code: 422, error: true })).toBe(closed);
    expect(withUnpaywall(closed, null)).toBe(closed);
  });
});

describe("fetchNeighbours", () => {
  it("lists the works a work cites with OpenAlex's cited_by filter, most cited first", async () => {
    const fetchMock = routed([[/api\.openalex\.org\/works\?/, openalexCitedBy]]);
    const results = await fetchNeighbours("references", "W4405613535", [], { fetch: fetchMock });
    expect(results).toHaveLength(5);
    const url = new URL(urlsOf(fetchMock)[0] ?? "");
    expect(url.searchParams.get("filter")).toBe("cited_by:W4405613535");
    expect(url.searchParams.get("sort")).toBe("cited_by_count:desc");
    expect(url.searchParams.get("per_page")).toBe("100");
  });

  it("lists the works that cite it with the cites filter", async () => {
    const fetchMock = routed([[/api\.openalex\.org\/works\?/, openalexCitedBy]]);
    await fetchNeighbours("citing", "W4405613535", [], { fetch: fetchMock });
    expect(new URL(urlsOf(fetchMock)[0] ?? "").searchParams.get("filter")).toBe("cites:W4405613535");
  });

  it("lists related works from the ids OpenAlex gives, joined with |", async () => {
    const fetchMock = routed([[/api\.openalex\.org\/works\?/, openalexCitedBy]]);
    await fetchNeighbours("related", "W4405613535", ["W1", "W2", "W3"], { fetch: fetchMock });
    expect(new URL(urlsOf(fetchMock)[0] ?? "").searchParams.get("filter")).toBe("openalex:W1|W2|W3");
  });

  it("asks nothing when there are no related works", async () => {
    const fetchMock = routed([]);
    expect(await fetchNeighbours("related", "W1", [], { fetch: fetchMock })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("titleSimilarity and closestTitleMatch", () => {
  const title = "Odor prediction of whiskies based on their molecular composition";

  it("is 1 for the same title, whatever the case and punctuation, and low for another", () => {
    expect(titleSimilarity(title, title.toUpperCase())).toBe(1);
    expect(titleSimilarity(title, "Odor prediction of whiskies, based on their molecular composition.")).toBe(1);
    expect(titleSimilarity(title, "Chaos in a double pendulum")).toBe(0);
  });

  it("is lower for a title that only starts the same way", () => {
    expect(titleSimilarity(title, `${title}: a long and different subtitle about many other things`)).toBeLessThan(0.9);
    expect(MIN_TITLE_SIMILARITY).toBe(0.7);
  });

  it("finds the work whose title is closest, from Crossref and OpenAlex together", async () => {
    const fetchMock = routed([
      [/api\.openalex\.org\/works\?/, { results: [openalexWork] }],
      [/api\.crossref\.org\/works\?/, { message: { items: [crossrefWork.message] } }],
    ]);
    const match = await closestTitleMatch(title, { fetch: fetchMock });
    expect(match?.result.doi).toBe(DOI);
    expect(match?.similarity).toBe(1);
    expect(match?.result.hits.map((hit) => hit.provider).sort()).toEqual(["crossref", "openalex"]);
  });

  it("finds nothing when no title is close enough", async () => {
    const fetchMock = routed([
      [/api\.openalex\.org\/works\?/, { results: [openalexWork] }],
      [/api\.crossref\.org\/works\?/, { message: { items: [] } }],
    ]);
    expect(await closestTitleMatch("A completely different title about the thermodynamics of black holes today", { fetch: fetchMock })).toBeNull();
  });
});
