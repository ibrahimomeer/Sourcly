import { doiUrl } from "../doi";
import { asArray, asHttpUrl, asInteger, asRecord, asString } from "../json";
import { plainTextOrNull, stripMarkup, toLanguageCode } from "../text";
import type { Author, Provider, Result, SearchOptions, VenueKind, WorkType } from "../types";
import {
  authorFromParts,
  biblioText,
  clampLimit,
  defaultFetch,
  doiOf,
  openAccess,
  parseYear,
  requestJson,
  sourced,
  subjectsFrom,
  type Fetch,
} from "./shared";

// Verified 2026-10-14 against www.ebi.ac.uk/europepmc/webservices/rest:
// - GET /search?query=...&format=json&resultType=core&pageSize=... needs no key and
//   sends `access-control-allow-origin: *`.
// - pageSize worked at 200 (the documentation allows up to 1000); 100 is used.
// - resultType=core includes abstracts, author lists, publication types, citation
//   counts and full-text links. `source` is MED (PubMed), PMC, PPR (preprints),
//   ETH (theses), NBK (books), PAT (patents) and a few others.

const SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const MAX_PAGE_SIZE = 100;

const REVIEW_TYPES = new Set([
  "review",
  "systematic review",
  "meta-analysis",
  "review-article",
  "systematic-review",
]);
const ARTICLE_TYPES = new Set(["journal article", "research-article", "case reports", "clinical trial", "observational study"]);
const NON_RESEARCH_TYPES = new Set([
  "editorial", "letter", "comment", "news", "published erratum", "erratum", "retraction of publication",
  "interview", "biography", "congress", "introductory journal article", "lecture", "retracted publication",
]);

function pubTypes(record: Record<string, unknown>): string[] {
  return asArray(asRecord(record.pubTypeList)?.pubType)
    .map(asString)
    .filter((type): type is string => type !== null);
}

function resolveType(source: string, types: string[]): { type: WorkType; raw: string | null } {
  const lower = types.map((type) => type.toLowerCase());
  const find = (set: Set<string>) => types.find((_, index) => set.has(lower[index] ?? ""));

  if (source === "PPR" || lower.includes("preprint")) return { type: "preprint", raw: find(new Set(["preprint"])) ?? "Preprint" };
  const review = find(REVIEW_TYPES);
  if (review !== undefined) return { type: "review", raw: review };
  if (source === "ETH") return { type: "thesis", raw: "ETH" };
  if (source === "NBK") return { type: "book", raw: "NBK" };
  if (source === "PAT") return { type: "other", raw: "PAT" };
  // Europe PMC often lists both "research-article" and the standard NLM "Journal Article"; prefer the latter.
  const article = types.find((_, index) => lower[index] === "journal article") ?? find(ARTICLE_TYPES);
  if (article !== undefined) return { type: "journal-article", raw: article };
  const nonResearch = find(NON_RESEARCH_TYPES);
  if (nonResearch !== undefined && lower.every((type) => NON_RESEARCH_TYPES.has(type))) return { type: "other", raw: nonResearch };
  return { type: "unknown", raw: types[0] ?? null };
}

export function parseEuropePmcRecord(raw: unknown, rank: number, listSize: number): Result | null {
  const record = asRecord(raw);
  const id = asString(record?.id);
  const source = asString(record?.source);
  if (record === null || id === null || source === null) return null;

  const doi = doiOf(record.doi);
  const types = pubTypes(record);
  const { type, raw: rawType } = resolveType(source, types);

  const journal = asRecord(asRecord(record.journalInfo)?.journal);
  const bookDetails = asRecord(record.bookOrReportDetails);
  const venue = asString(journal?.title) ?? asString(record.journalTitle) ?? asString(bookDetails?.publisher);
  const kind: VenueKind | null = source === "PPR" ? "repository" : asString(journal?.title) !== null ? "journal" : null;

  const authorEntries = asArray(asRecord(record.authorList)?.author).map(asRecord);
  const authors = authorEntries
    .map((author) => authorFromParts(author?.lastName, author?.firstName, author?.fullName))
    .filter((author): author is Author => author !== null);

  // Free-to-read copies, from the full-text link list ("F" = free, "OA" = open access).
  const links = asArray(asRecord(record.fullTextUrlList)?.fullTextUrl)
    .map(asRecord)
    .filter((link) => ["F", "OA"].includes(asString(link?.availabilityCode) ?? ""));
  const freePdf = links.find((link) => asString(link?.documentStyle) === "pdf");
  const freePage = links.find((link) => ["html", "doi"].includes(asString(link?.documentStyle) ?? "")) ?? links[0];
  const flag = asString(record.isOpenAccess);
  const isOpen = links.length > 0 || flag === "Y" ? true : flag === "N" ? false : null;

  const retracted = types.some((t) => t.toLowerCase() === "retracted publication");

  return {
    id: doi ?? `europepmc:${source}:${id}`,
    title: stripMarkup(asString(record.title)),
    authors,
    year: parseYear(record.pubYear),
    venue,
    venueKind: kind === null ? null : sourced(kind, "europepmc", source === "PPR" ? "source" : "journalInfo.journal.title"),
    volume: biblioText(asRecord(record.journalInfo)?.volume),
    issue: biblioText(asRecord(record.journalInfo)?.issue),
    pages: biblioText(record.pageInfo),
    doi,
    url: doi !== null ? doiUrl(doi) : `https://europepmc.org/article/${source}/${id}`,
    abstract: plainTextOrNull(asString(record.abstractText)),
    type,
    rawType: rawType === null ? null : sourced(rawType, "europepmc", rawType === source ? "source" : "pubTypeList"),
    citationCount: asInteger(record.citedByCount),
    language: toLanguageCode(asString(record.language)),
    authorCountries: [],
    openAccess: openAccess(isOpen, {
      url: asHttpUrl(freePage?.url),
      pdfUrl: asHttpUrl(freePdf?.url),
    }),
    retraction: retracted
      ? { retracted: true, source: "Europe PMC pubTypeList: Retracted Publication" }
      : { retracted: source === "MED" || source === "PMC" ? false : null, source: null },
    subjects: [
      ...subjectsFrom(
        "europepmc",
        "mesh",
        asArray(asRecord(record.meshHeadingList)?.meshHeading).map((heading) => asRecord(heading)?.descriptorName),
      ),
      ...subjectsFrom("europepmc", "keyword", asArray(asRecord(record.keywordList)?.keyword)),
    ],
    hits: [{ provider: "europepmc", id: `${source}:${id}`, rank, listSize, score: null }],
  };
}

export interface EuropePmcOptions {
  fetch?: Fetch;
}

export function createEuropePmcProvider(options: EuropePmcOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;

  return {
    id: "europepmc",
    name: "Europe PMC",
    syntax: "europepmc",
    expandedSyntax: "plain",
    expandedRequestNotes: ["The words are looked for in every field and in the full text of open-access papers"],
    requestNotes: ["Every word is looked for in the title and abstract only, not in the full text"],

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const text = query.trim();
      if (text === "") return [];
      const url = new URL(SEARCH_URL);
      url.searchParams.set("query", text);
      url.searchParams.set("format", "json");
      url.searchParams.set("resultType", "core");
      url.searchParams.set("pageSize", String(clampLimit(limit, MAX_PAGE_SIZE)));

      const body = asRecord(await requestJson(doFetch, url, "Europe PMC", signal));
      const records = asArray(asRecord(body?.resultList)?.result);
      return records
        .map((record, index) => parseEuropePmcRecord(record, index + 1, records.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
