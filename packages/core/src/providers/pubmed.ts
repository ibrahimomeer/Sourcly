import { doiUrl } from "../doi";
import { asArray, asRecord } from "../json";
import { stripMarkup, toLanguageCode } from "../text";
import type { Author, Provider, Result, SearchOptions, WorkType } from "../types";
import { childrenNamed, descend, firstChild, parseXml, textOf, XmlError, type XmlNode } from "../xml";
import {
  authorFromParts,
  biblioText,
  clampLimit,
  defaultFetch,
  doiOf,
  openAccess,
  parseYear,
  requestJson,
  requestText,
  sourced,
  subjectsFrom,
  type Fetch,
} from "./shared";
import { ProviderError } from "../types";

// Verified 2026-10-14 against eutils.ncbi.nlm.nih.gov (NCBI E-utilities):
// - esearch.fcgi?db=pubmed&term=...&retmode=json returns the matching PMIDs in
//   relevance order. efetch.fcgi?db=pubmed&id=<ids>&retmode=xml returns the full
//   records (abstract, publication types, DOI). efetch for PubMed has no JSON form,
//   so the XML is read with our own small parser (see xml.ts).
// - Both send `access-control-allow-origin: *`. Without an API key NCBI allows three
//   requests per second (the response says `x-ratelimit-limit: 3`); one search makes two.
// - `tool` and `email` are NCBI's optional way to identify an application.

const ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const MAX_RESULTS = 100;

const REVIEW_TYPES = new Set(["review", "systematic review", "meta-analysis"]);
const NON_RESEARCH_TYPES = new Set([
  "editorial", "letter", "comment", "news", "published erratum", "retraction of publication", "interview",
  "biography", "congress", "newspaper article", "introductory journal article", "lecture", "expression of concern",
]);

function resolveType(types: string[]): { type: WorkType; raw: string | null } {
  const lower = types.map((type) => type.toLowerCase());
  const pick = (test: (type: string) => boolean) => types.find((_, index) => test(lower[index] ?? ""));

  const review = pick((type) => REVIEW_TYPES.has(type));
  if (review !== undefined) return { type: "review", raw: review };
  if (lower.includes("preprint")) return { type: "preprint", raw: pick((type) => type === "preprint") ?? "Preprint" };
  if (lower.includes("journal article")) return { type: "journal-article", raw: "Journal Article" };
  const nonResearch = pick((type) => NON_RESEARCH_TYPES.has(type));
  if (nonResearch !== undefined) return { type: "other", raw: nonResearch };
  return { type: "unknown", raw: types[0] ?? null };
}

function articleId(node: XmlNode, type: string): string | null {
  const ids = childrenNamed(descend(node, "PubmedData", "ArticleIdList"), "ArticleId");
  const match = ids.find((id) => id.attributes.IdType === type);
  return match === undefined ? null : textOf(match) || null;
}

export function parsePubmedArticle(node: XmlNode, rank: number, listSize: number): Result | null {
  const citation = firstChild(node, "MedlineCitation");
  const article = firstChild(citation, "Article");
  const pmid = textOf(firstChild(citation, "PMID"));
  if (citation === null || article === null || pmid === "") return null;

  const journal = firstChild(article, "Journal");
  const pubDate = descend(journal, "JournalIssue", "PubDate");
  const year =
    parseYear(textOf(firstChild(pubDate, "Year"))) ??
    parseYear(textOf(firstChild(pubDate, "MedlineDate"))) ??
    parseYear(textOf(descend(article, "ArticleDate", "Year")));

  const abstract = childrenNamed(firstChild(article, "Abstract"), "AbstractText")
    .map((part) => {
      const text = textOf(part);
      const label = part.attributes.Label;
      return label !== undefined && text !== "" ? `${label}: ${text}` : text;
    })
    .filter((text) => text !== "")
    .join(" ");

  const authors = childrenNamed(firstChild(article, "AuthorList"), "Author")
    .map((author): Author | null => {
      const collective = textOf(firstChild(author, "CollectiveName"));
      if (collective !== "") return { name: collective };
      return authorFromParts(
        textOf(firstChild(author, "LastName")),
        textOf(firstChild(author, "ForeName")) || textOf(firstChild(author, "Initials")),
      );
    })
    .filter((author): author is Author => author !== null);

  const types = childrenNamed(firstChild(article, "PublicationTypeList"), "PublicationType")
    .map(textOf)
    .filter((type) => type !== "");
  const { type, raw } = resolveType(types);

  const doi =
    doiOf(articleId(node, "doi")) ??
    doiOf(textOf(childrenNamed(article, "ELocationID").find((e) => e.attributes.EIdType === "doi")));
  const pmcid = articleId(node, "pmc");

  const correctionKinds = childrenNamed(firstChild(citation, "CommentsCorrectionsList"), "CommentsCorrections").map(
    (item) => item.attributes.RefType,
  );
  const retracted = types.some((t) => t.toLowerCase() === "retracted publication") || correctionKinds.includes("RetractionIn");

  const venue = textOf(firstChild(journal, "Title"));
  const issue = firstChild(journal, "JournalIssue");
  const language = toLanguageCode(textOf(firstChild(article, "Language")));

  return {
    id: doi ?? `pubmed:${pmid}`,
    title: stripMarkup(textOf(firstChild(article, "ArticleTitle"))),
    authors,
    year,
    venue: venue === "" ? null : venue,
    venueKind: venue === "" ? null : sourced("journal", "pubmed", "Journal.Title"),
    volume: biblioText(textOf(firstChild(issue, "Volume"))),
    issue: biblioText(textOf(firstChild(issue, "Issue"))),
    pages: biblioText(textOf(firstChild(firstChild(article, "Pagination"), "MedlinePgn"))),
    doi,
    url: doi !== null ? doiUrl(doi) : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    abstract: abstract === "" ? null : abstract,
    type,
    rawType: raw === null ? null : sourced(raw, "pubmed", "PublicationType"),
    citationCount: null,
    language,
    authorCountries: [],
    // A PubMed Central copy is free to read. PubMed itself says nothing about licences.
    openAccess: pmcid === null ? openAccess(null) : openAccess(true, { url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` }),
    retraction: retracted
      ? { retracted: true, source: "PubMed (Retracted Publication / RetractionIn)" }
      : { retracted: false, source: "PubMed: no retraction recorded" },
    subjects: [
      ...subjectsFrom(
        "pubmed",
        "mesh",
        childrenNamed(firstChild(citation, "MeshHeadingList"), "MeshHeading").map((heading) => textOf(firstChild(heading, "DescriptorName"))),
      ),
      ...subjectsFrom(
        "pubmed",
        "keyword",
        childrenNamed(citation, "KeywordList").flatMap((list) => childrenNamed(list, "Keyword").map(textOf)),
      ),
    ],
    hits: [{ provider: "pubmed", id: pmid, rank, listSize, score: null }],
  };
}

export interface PubmedOptions {
  fetch?: Fetch;
  /** Optional contact address, sent as NCBI's `email` parameter. */
  email?: string;
}

export function createPubmedProvider(options: PubmedOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;
  const email = options.email?.trim() ?? "";

  const identify = (url: URL) => {
    url.searchParams.set("tool", "sourcly");
    if (email !== "") url.searchParams.set("email", email);
  };

  return {
    id: "pubmed",
    name: "PubMed",
    syntax: "pubmed",
    requestNotes: [
      "Every word or phrase is looked for in the title and abstract only ([tiab]), not in MeSH headings. PubMed’s own matching of synonyms and word forms is switched off, so “memory” does not find “memories”",
    ],

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const text = query.trim();
      if (text === "") return [];
      const searchUrl = new URL(ESEARCH_URL);
      searchUrl.searchParams.set("db", "pubmed");
      searchUrl.searchParams.set("term", text);
      searchUrl.searchParams.set("retmax", String(clampLimit(limit, MAX_RESULTS)));
      searchUrl.searchParams.set("retmode", "json");
      searchUrl.searchParams.set("sort", "relevance");
      identify(searchUrl);

      const found = asRecord(await requestJson(doFetch, searchUrl, "PubMed", signal));
      const ids = asArray(asRecord(found?.esearchresult)?.idlist).filter((id): id is string => typeof id === "string");
      if (ids.length === 0) return [];

      const fetchUrl = new URL(EFETCH_URL);
      fetchUrl.searchParams.set("db", "pubmed");
      fetchUrl.searchParams.set("id", ids.join(","));
      fetchUrl.searchParams.set("retmode", "xml");
      identify(fetchUrl);

      let root: XmlNode;
      try {
        root = parseXml(await requestText(doFetch, fetchUrl, "PubMed", signal));
      } catch (cause) {
        if (cause instanceof XmlError) {
          throw new ProviderError("failed", "PubMed sent a response that is not valid XML", { cause });
        }
        throw cause;
      }

      // Keep PubMed's relevance order, which efetch does not guarantee.
      const byPmid = new Map<string, XmlNode>();
      for (const article of childrenNamed(root, "PubmedArticle")) {
        byPmid.set(textOf(descend(article, "MedlineCitation", "PMID")), article);
      }
      return ids
        .map((id, index) => {
          const article = byPmid.get(id);
          return article === undefined ? null : parsePubmedArticle(article, index + 1, ids.length);
        })
        .filter((result): result is Result => result !== null);
    },
  };
}
