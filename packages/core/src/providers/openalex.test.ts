import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../types";
import {
  createOpenAlexProvider,
  mapOpenAlexType,
  parseOpenAlexWork,
  reconstructAbstract,
} from "./openalex";
// Real works recorded from api.openalex.org on 2026-10-14 using the same `select`
// the provider sends. Authors and locations are trimmed to the fields the parser
// reads; everything else is as returned (including null years, missing abstracts
// and venue-less records).
import fixtures from "./__fixtures__/openalex-works.json";

const parse = (raw: unknown) => {
  const result = parseOpenAlexWork(raw, 1, 1);
  if (result === null) throw new Error("fixture did not parse");
  return result;
};

describe("parseOpenAlexWork", () => {
  it("maps a typical journal article", () => {
    const result = parseOpenAlexWork(fixtures.search.results[0], 1, 3);
    expect(result).toEqual({
      id: "10.1038/nature04286",
      title: "Sleep-dependent memory consolidation",
      authors: [{ name: "Robert Stickgold" }],
      year: 2005,
      venue: "Nature",
      venueKind: { value: "journal", provider: "openalex", field: "primary_location.source.type" },
      volume: "437",
      issue: "7063",
      pages: "1272-1278",
      doi: "10.1038/nature04286",
      url: "https://doi.org/10.1038/nature04286",
      abstract: null,
      type: "journal-article",
      rawType: { value: "article", provider: "openalex", field: "type" },
      citationCount: 1841,
      language: "en",
      authorCountries: ["US"],
      openAccess: {
        isOpen: true,
        status: "bronze",
        url: "https://www.nature.com/articles/nature04286.pdf",
        pdfUrl: "https://www.nature.com/articles/nature04286.pdf",
      },
      retraction: { retracted: false, source: "OpenAlex is_retracted (Retraction Watch)" },
      subjects: [
        { term: "Sleep and Wakefulness Research", kind: "topic", provider: "openalex" },
        { term: "sleep-dependent memory consolidation", kind: "keyword", provider: "openalex" },
        { term: "memory encoding", kind: "keyword", provider: "openalex" },
        { term: "memory formation", kind: "keyword", provider: "openalex" },
      ],
      hits: [{ provider: "openalex", id: "W2086162146", rank: 1, listSize: 3, score: 289.29092 }],
    });
  });

  describe("subjects", () => {
    it("keeps only topics OpenAlex is confident about (the second and third often score near 0)", () => {
      const topics = parse(fixtures.review).subjects.filter((s) => s.kind === "topic");
      expect(topics.map((s) => s.term)).toEqual(["Meta-analysis and systematic reviews"]);
    });

    it("keeps keywords with a confidence of at least 0.5, at most ten", () => {
      const keywords = parse(fixtures.review).subjects.filter((s) => s.kind === "keyword");
      expect(keywords).toHaveLength(7); // 7 of the 9 recorded keywords score 0.5 or more
      const many = parse({
        id: "https://openalex.org/W1",
        keywords: Array.from({ length: 25 }, (_, i) => ({ display_name: `k${i}`, score: 0.9 })),
      });
      expect(many.subjects).toHaveLength(10);
    });

    it("is empty when the work has no topics or keywords, or they are malformed", () => {
      expect(parse({ id: "https://openalex.org/W1" }).subjects).toEqual([]);
      expect(parse({ id: "https://openalex.org/W1", topics: "x", keywords: [null, 5, { score: 1 }] }).subjects).toEqual([]);
    });

    it("asks OpenAlex for topics and keywords", async () => {
      const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ results: [] })));
      await createOpenAlexProvider({ fetch: fetchMock }).search("q", { limit: 5 });
      const select = new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("select")?.split(",");
      expect(select).toEqual(expect.arrayContaining(["topics", "keywords"]));
    });
  });

  it("keeps every author and the distinct, sorted author countries", () => {
    const result = parse(fixtures.review);
    expect(result.authors.map((author) => author.name)).toEqual([
      "Matthew James Page",
      "Joanne E. McKenzie",
      "Patrick M. Bossuyt",
    ]);
    expect(result.authorCountries).toEqual(["AU", "NL"]);
  });

  it("rebuilds the abstract text from the inverted index", () => {
    const abstract = parse(fixtures.review).abstract;
    expect(abstract?.startsWith("The Preferred Reporting Items for Systematic reviews and Meta-Analyses (PRISMA)")).toBe(true);
    expect(abstract?.endsWith("revised flow diagrams for original and updated reviews.")).toBe(true);
    expect(abstract?.split(" ")).toHaveLength(126);
  });

  it("flags a retracted work and records where that came from", () => {
    const result = parse(fixtures.retracted);
    expect(result.retraction).toEqual({
      retracted: true,
      source: "OpenAlex is_retracted (Retraction Watch)",
    });
  });

  it("copes with a work that has no DOI and no year", () => {
    const result = parse(fixtures.noDoi);
    expect(result.doi).toBeNull();
    expect(result.id).toBe("openalex:W4288400169");
    expect(result.year).toBeNull();
    expect(result.url).toBe("https://dergipark.org.tr/tr/pub/jgon/issue/51866/675113");
    expect(result.language).toBe("tr");
    expect(result.authors.map((author) => author.name)).toEqual(["Kokanalı, Demet", "Engin Üstün, Yaprak"]);
  });

  it("copes with a work that has no venue, falling back to the DOI link", () => {
    const result = parse(fixtures.dataset);
    expect(result.venue).toBeNull();
    expect(result.venueKind).toBeNull();
    expect(result.url).toBe("https://doi.org/10.32614/r.manuals");
  });

  it.each([
    ["review", "review"],
    ["preprint", "preprint"],
    ["book", "book"],
    ["bookChapter", "book-chapter"],
    ["referenceEntry", "reference-entry"],
    ["dissertation", "thesis"],
    ["dataset", "dataset"],
    ["conferencePaper", "conference-paper"],
    ["report", "report"],
    ["other", "unknown"],
  ] as const)("maps the %s fixture to type %s and keeps the raw type", (key, expected) => {
    const result = parse(fixtures[key]);
    expect(result.type).toBe(expected);
    expect(result.rawType).toEqual({ value: fixtures[key].type, provider: "openalex", field: "type" });
  });

  it.each([
    ["preprint", "repository"],
    ["book", "book"],
    ["bookChapter", "book"],
    ["conferencePaper", "conference"],
  ] as const)("maps the %s fixture's venue to %s", (key, expected) => {
    expect(parse(fixtures[key]).venueKind?.value).toBe(expected);
  });

  describe("free PDF link", () => {
    it("comes from OpenAlex's best open-access copy when that copy has a PDF", () => {
      expect(parse(fixtures.review).openAccess.pdfUrl).toBe("https://www.bmj.com/content/bmj/372/bmj.n71.full.pdf");
      expect(parse(fixtures.preprint).openAccess.pdfUrl).toBe("https://arxiv.org/pdf/1412.6980");
    });

    it("is null for an open work whose best copy has no PDF (a repository landing page only)", () => {
      const result = parseOpenAlexWork(fixtures.search.results[2], 3, 3);
      expect(result?.openAccess).toMatchObject({ isOpen: true, status: "green", pdfUrl: null });
      expect(result?.openAccess.url).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/2680680");
    });

    it("is null for a closed work, whose best open copy is null", () => {
      const result = parseOpenAlexWork(fixtures.search.results[1], 2, 3);
      expect(result?.openAccess).toMatchObject({ isOpen: false, status: "closed", pdfUrl: null });
    });

    it("is never taken from a copy OpenAlex does not mark as open access", () => {
      const result = parse({
        id: "https://openalex.org/W1",
        best_oa_location: { is_oa: false, pdf_url: "https://publisher.example/paywalled.pdf" },
      });
      expect(result.openAccess.pdfUrl).toBeNull();
      expect(parse({ id: "https://openalex.org/W1", best_oa_location: { pdf_url: "https://x.example/a.pdf" } }).openAccess.pdfUrl).toBeNull();
    });
  });

  it("refuses non-web addresses anywhere they could become a link", () => {
    const result = parse({
      id: "https://openalex.org/W1",
      doi: "https://doi.org/10.1000/safe",
      primary_location: { landing_page_url: "javascript:alert(1)" },
      open_access: { is_oa: true, oa_url: "ftp://files.example/paper.pdf" },
      best_oa_location: { is_oa: true, pdf_url: "data:application/pdf;base64,AAAA" },
    });
    // The unsafe landing page is skipped in favour of the DOI link.
    expect(result.url).toBe("https://doi.org/10.1000/safe");
    expect(result.openAccess.url).toBeNull();
    expect(result.openAccess.pdfUrl).toBeNull();
  });

  it("returns null for entries it cannot identify", () => {
    expect(parseOpenAlexWork(null, 1, 1)).toBeNull();
    expect(parseOpenAlexWork("text", 1, 1)).toBeNull();
    expect(parseOpenAlexWork([], 1, 1)).toBeNull();
    expect(parseOpenAlexWork({ title: "no id" }, 1, 1)).toBeNull();
  });

  it("survives fields of the wrong type instead of throwing", () => {
    const result = parse({
      id: "https://openalex.org/W1",
      title: 5,
      authorships: "none",
      publication_year: "2020",
      cited_by_count: "many",
      type: "constructor",
      open_access: { is_oa: "yes", oa_status: "platinum" },
      is_retracted: "no",
    });
    expect(result.title).toBe("");
    expect(result.authors).toEqual([]);
    expect(result.year).toBeNull();
    expect(result.citationCount).toBeNull();
    expect(result.type).toBe("unknown");
    expect(result.openAccess).toEqual({ isOpen: null, status: "unknown", url: null, pdfUrl: null });
    expect(result.retraction).toEqual({ retracted: null, source: null });
  });
});

describe("mapOpenAlexType", () => {
  // OpenAlex's 25 documented work types (help.openalex.org/api-reference/work-types).
  it.each([
    ["article", "journal-article"],
    ["data-paper", "journal-article"],
    ["software-paper", "journal-article"],
    ["review", "review"],
    ["preprint", "preprint"],
    ["conference-paper", "conference-paper"],
    ["book", "book"],
    ["book-chapter", "book-chapter"],
    ["reference-entry", "reference-entry"],
    ["dissertation", "thesis"],
    ["report", "report"],
    ["dataset", "dataset"],
    ["editorial", "other"],
    ["letter", "other"],
    ["erratum", "other"],
    ["retraction", "other"],
    ["peer-review", "other"],
    ["paratext", "other"],
    ["libguides", "other"],
    ["standard", "other"],
    ["supplementary-materials", "other"],
    ["software", "other"],
    ["book-review", "other"],
    ["conference-abstract", "other"],
    ["other", "unknown"],
  ] as const)("maps %s to %s", (raw, expected) => {
    expect(mapOpenAlexType(raw)).toBe(expected);
  });

  it("maps anything unrecognised, or missing, to unknown", () => {
    expect(mapOpenAlexType("brand-new-type")).toBe("unknown");
    expect(mapOpenAlexType("constructor")).toBe("unknown");
    expect(mapOpenAlexType("toString")).toBe("unknown");
    expect(mapOpenAlexType(null)).toBe("unknown");
  });
});

describe("reconstructAbstract", () => {
  it("orders words by position", () => {
    expect(reconstructAbstract({ world: [1], Hello: [0] })).toBe("Hello world");
  });

  it("repeats a word at each of its positions", () => {
    expect(reconstructAbstract({ a: [0, 2], b: [1] })).toBe("a b a");
  });

  it("does not leave double spaces when positions have gaps", () => {
    expect(reconstructAbstract({ a: [0], b: [3] })).toBe("a b");
  });

  it("ignores invalid and absurd positions", () => {
    expect(reconstructAbstract({ a: [-1, 1.5, "2", 1_000_000_000] })).toBeNull();
  });

  it.each([[null], [undefined], [{}], ["text"], [[]], [42]])("returns null for %j", (input) => {
    expect(reconstructAbstract(input)).toBeNull();
  });
});

describe("createOpenAlexProvider", () => {
  const jsonResponse = (body: unknown, init?: ResponseInit) => Promise.resolve(Response.json(body, init));

  it("sends one plain GET: search, per_page and select, with no key, email or custom headers", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => jsonResponse({ results: [] }));
    const provider = createOpenAlexProvider({ fetch: fetchMock });
    const controller = new AbortController();

    await provider.search("sleep and memory", { limit: 50, signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe("https://api.openalex.org/works");
    expect(url.searchParams.get("search")).toBe("sleep and memory");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("select")?.split(",")).toEqual(
      expect.arrayContaining([
        "id", "doi", "title", "relevance_score", "type", "is_retracted", "abstract_inverted_index", "best_oa_location",
      ]),
    );
    expect([...url.searchParams.keys()].sort()).toEqual(["per_page", "search", "select"]);
    expect(init).toEqual({ signal: controller.signal });
  });

  it.each([
    [500, "100"],
    [100, "100"],
    [12.7, "12"],
    [0, "1"],
    [-5, "1"],
  ])("clamps limit %s to per_page %s", async (limit, expected) => {
    const fetchMock = vi.fn<typeof fetch>(() => jsonResponse({ results: [] }));
    await createOpenAlexProvider({ fetch: fetchMock }).search("q", { limit });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("per_page")).toBe(expected);
  });

  it("returns results in provider order with their rank and list size", async () => {
    const provider = createOpenAlexProvider({ fetch: () => jsonResponse({ results: fixtures.search.results }) });
    const results = await provider.search("sleep and memory consolidation", { limit: 3 });

    expect(results.map((result) => result.id)).toEqual([
      "10.1038/nature04286",
      "10.1016/j.smrv.2008.08.002",
      "10.1016/j.sleep.2007.03.011",
    ]);
    expect(results.map((result) => result.hits[0]?.rank)).toEqual([1, 2, 3]);
    expect(results.every((result) => result.hits[0]?.listSize === 3)).toBe(true);
  });

  it("drops only entries it cannot identify and keeps the rest at their true rank", async () => {
    const provider = createOpenAlexProvider({
      fetch: () => jsonResponse({ results: ["garbage", fixtures.search.results[0]] }),
    });
    const results = await provider.search("q", { limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0]?.hits[0]).toMatchObject({ rank: 2, listSize: 2 });
  });

  it("reports HTTP 429 as rate-limited, with the retry hint when sent", async () => {
    const provider = createOpenAlexProvider({
      fetch: () => jsonResponse({}, { status: 429, headers: { "Retry-After": "12" } }),
    });
    const error = await provider.search("q", { limit: 10 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: "rate-limited", httpStatus: 429 });
    expect((error as ProviderError).message).toContain("retry after 12 s");
  });

  it("reports other HTTP errors as failed", async () => {
    const provider = createOpenAlexProvider({ fetch: () => jsonResponse({}, { status: 503 }) });
    await expect(provider.search("q", { limit: 10 })).rejects.toMatchObject({
      kind: "failed",
      httpStatus: 503,
    });
  });

  it("reports a network error as failed", async () => {
    const provider = createOpenAlexProvider({ fetch: () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(provider.search("q", { limit: 10 })).rejects.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("Could not reach OpenAlex"),
    });
  });

  it("reports an aborted request as cancelled", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    const provider = createOpenAlexProvider({ fetch: () => Promise.reject(abort) });
    await expect(provider.search("q", { limit: 10 })).rejects.toMatchObject({
      kind: "failed",
      message: "Search was cancelled",
    });
  });

  it("reports a body that is not JSON, or has no results list, as failed", async () => {
    const notJson = createOpenAlexProvider({ fetch: () => Promise.resolve(new Response("<html>")) });
    await expect(notJson.search("q", { limit: 10 })).rejects.toMatchObject({ kind: "failed" });

    const noResults = createOpenAlexProvider({ fetch: () => jsonResponse({ meta: {} }) });
    await expect(noResults.search("q", { limit: 10 })).rejects.toMatchObject({ kind: "failed" });
  });
});

describe("createOpenAlexProvider: optional API key", () => {
  const SECRET = "k3y-S3CRET-abc123";
  const jsonResponse = (body: unknown, init?: ResponseInit) => Promise.resolve(Response.json(body, init));
  const sentUrl = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
    new URL(String(fetchMock.mock.calls[0]?.[0]));

  it("sends no api_key when no key is set, or when it is blank", async () => {
    for (const apiKey of [undefined, "", "   "]) {
      const fetchMock = vi.fn<typeof fetch>(() => jsonResponse({ results: [] }));
      await createOpenAlexProvider({ fetch: fetchMock, apiKey }).search("q", { limit: 10 });
      expect(sentUrl(fetchMock).searchParams.has("api_key")).toBe(false);
    }
  });

  it("sends a set key, trimmed, as the documented api_key parameter on the same plain GET", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => jsonResponse({ results: [] }));
    await createOpenAlexProvider({ fetch: fetchMock, apiKey: `  ${SECRET}\n` }).search("q", { limit: 10 });

    expect(sentUrl(fetchMock).searchParams.get("api_key")).toBe(SECRET);
    // Still no custom headers, so no CORS preflight is triggered.
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ signal: undefined });
  });

  it("reports a rejected key (HTTP 401) clearly, without ever repeating the key", async () => {
    const provider = createOpenAlexProvider({
      fetch: () =>
        jsonResponse({ error: "Invalid or missing API key", message: "API key not found" }, { status: 401 }),
      apiKey: SECRET,
    });
    const error = (await provider.search("q", { limit: 10 }).catch((e: unknown) => e)) as ProviderError;

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ kind: "failed", httpStatus: 401 });
    expect(error.message).toContain("rejected the API key");
    expect(error.message).toContain("remove it to search without one");
    expect(JSON.stringify({ message: error.message, name: error.name, kind: error.kind })).not.toContain(SECRET);
  });

  it("treats HTTP 403 with a key the same way", async () => {
    const provider = createOpenAlexProvider({ fetch: () => jsonResponse({}, { status: 403 }), apiKey: SECRET });
    await expect(provider.search("q", { limit: 10 })).rejects.toMatchObject({
      kind: "failed",
      httpStatus: 403,
      message: expect.stringContaining("rejected the API key"),
    });
  });

  it("does not blame a key that was never sent", async () => {
    const provider = createOpenAlexProvider({ fetch: () => jsonResponse({}, { status: 401 }) });
    const error = (await provider.search("q", { limit: 10 }).catch((e: unknown) => e)) as ProviderError;
    expect(error.message).toBe("OpenAlex answered HTTP 401");
  });

  it("still reports rate limiting and network failures without the key in the message", async () => {
    const limited = createOpenAlexProvider({ fetch: () => jsonResponse({}, { status: 429 }), apiKey: SECRET });
    const offline = createOpenAlexProvider({
      fetch: () => Promise.reject(new TypeError(`Failed to fetch https://api.openalex.org/works?api_key=${SECRET}`)),
      apiKey: SECRET,
    });
    const failure = async (search: Promise<unknown>): Promise<ProviderError> => {
      try {
        await search;
      } catch (error) {
        return error as ProviderError;
      }
      throw new Error("expected the search to fail");
    };
    const errors = await Promise.all([limited, offline].map((p) => failure(p.search("q", { limit: 10 }))));
    expect(errors.map((e) => e.kind)).toEqual(["rate-limited", "failed"]);
    // The underlying error text can contain the URL (and so the key); the message we surface must not.
    for (const error of errors) expect(error.message).not.toContain(SECRET);
  });
});

describe("OpenAlex: volume, issue and pages", () => {
  const withBiblio = (biblio: unknown) => parseOpenAlexWork({ ...fixtures.search.results[0], biblio }, 1, 1);

  it("reads them from biblio, joining the first and last page", () => {
    const second = parseOpenAlexWork(fixtures.search.results[1], 2, 3);
    expect(second).toMatchObject({ volume: "13", issue: "5", pages: "309-321" });
  });

  it("keeps a single page, or an article number, as it is", () => {
    expect(withBiblio({ volume: "5", issue: null, first_page: "e12", last_page: null })).toMatchObject({
      volume: "5",
      issue: null,
      pages: "e12",
    });
    expect(withBiblio({ first_page: "40", last_page: "40" })?.pages).toBe("40");
  });

  it("is null when there is no biblio or its values are empty", () => {
    expect(withBiblio(undefined)).toMatchObject({ volume: null, issue: null, pages: null });
    expect(withBiblio({ volume: "", issue: "  ", first_page: "", last_page: "" })).toMatchObject({
      volume: null,
      issue: null,
      pages: null,
    });
  });
});

describe("OpenAlex: markup in titles", () => {
  it("removes markup from the title and the venue, including markup sent as entities", () => {
    const work = { ...fixtures.search.results[0], title: "Sleep in <i>Drosophila</i> and &lt;i&gt;Candida&lt;/i&gt;" };
    const result = parseOpenAlexWork(work, 1, 1);
    expect(result?.title).toBe("Sleep in Drosophila and Candida");
  });
});
