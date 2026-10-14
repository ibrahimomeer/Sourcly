import { doiUrl } from "../doi";
import { asArray, asHttpUrl, asInteger, asRecord, asString } from "../json";
import { plainTextOrNull, stripMarkup, toLanguageCode } from "../text";
import type { Author, Provider, Result, SearchOptions, WorkType } from "../types";
import {
  authorFromParts,
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

// Verified 2026-10-14 against api.datacite.org:
// - GET /dois?query=...&page[size]=N returns JSON:API, needs no key for reading
//   public metadata, and echoes the requesting origin in `access-control-allow-origin`.
// - page[size] of 100 works; 1000 returned an 18 MB response, so 100 is the cap here.
// - The query is a Lucene query string. It arrives already written for this source (see
//   query.ts) with every AND spelled out, because DataCite's default is looser.
// - DataCite holds deposits made to repositories (datasets, software, theses,
//   articles in institutional repositories), not publishers' journals.

const DOIS_URL = "https://api.datacite.org/dois";
const MAX_PAGE_SIZE = 100;

const WORK_TYPES: Record<string, WorkType> = {
  journalarticle: "journal-article",
  datapaper: "journal-article",
  preprint: "preprint",
  dissertation: "thesis",
  dataset: "dataset",
  conferencepaper: "conference-paper",
  book: "book",
  bookchapter: "book-chapter",
  report: "report",
  // "Text" says only that it is text; the finer resourceType is free text we do not trust.
  text: "unknown",
};

const OPEN_RIGHTS = /creativecommons\.org|cc0|cc-by|openaccess/i;
const CLOSED_RIGHTS = /closedaccess|restrictedaccess|embargoedaccess/i;

function mapType(general: string | null): WorkType {
  if (general === null) return "unknown";
  const key = general.toLowerCase();
  return Object.hasOwn(WORK_TYPES, key) ? (WORK_TYPES[key] ?? "unknown") : "other";
}

function accessFromRights(rightsList: unknown[]): boolean | null {
  const texts = rightsList.map(asRecord).map((rights) =>
    [asString(rights?.rightsUri), asString(rights?.rightsIdentifier), asString(rights?.rights)].filter(Boolean).join(" "),
  );
  if (texts.some((text) => OPEN_RIGHTS.test(text))) return true;
  if (texts.some((text) => CLOSED_RIGHTS.test(text))) return false;
  return null;
}

export function parseDataCiteRecord(raw: unknown, rank: number, listSize: number): Result | null {
  const record = asRecord(raw);
  const attributes = asRecord(record?.attributes);
  const doi = doiOf(attributes?.doi ?? record?.id);
  if (attributes === null || doi === null) return null;

  const types = asRecord(attributes.types);
  const general = asString(types?.resourceTypeGeneral);
  const container = asRecord(attributes.container);
  const publisher = attributes.publisher;
  const venue = asString(container?.title) ?? asString(publisher) ?? asString(asRecord(publisher)?.name);

  const authors = asArray(attributes.creators)
    .map(asRecord)
    .map((creator) => authorFromParts(creator?.familyName, creator?.givenName, creator?.name))
    .filter((author): author is Author => author !== null);

  const descriptions = asArray(attributes.descriptions).map(asRecord);
  const abstract =
    descriptions.find((description) => asString(description?.descriptionType)?.toLowerCase() === "abstract") ??
    descriptions[0];

  return {
    id: doi,
    title: stripMarkup(asString(asRecord(asArray(attributes.titles)[0])?.title)),
    authors,
    year: parseYear(attributes.publicationYear),
    venue,
    venueKind: sourced(asString(container?.type)?.toLowerCase() === "journal" ? "journal" : "repository", "datacite", "container.type"),
    doi,
    url: asHttpUrl(attributes.url) ?? doiUrl(doi),
    abstract: plainTextOrNull(asString(abstract?.description)),
    type: mapType(general),
    rawType: general === null ? null : sourced(general, "datacite", "types.resourceTypeGeneral"),
    citationCount: asInteger(attributes.citationCount),
    language: toLanguageCode(asString(attributes.language)),
    authorCountries: [],
    openAccess: openAccess(accessFromRights(asArray(attributes.rightsList))),
    retraction: { retracted: null, source: null },
    subjects: subjectsFrom(
      "datacite",
      "keyword",
      asArray(attributes.subjects).map((subject) => asRecord(subject)?.subject),
    ),
    hits: [{ provider: "datacite", id: doi, rank, listSize, score: null }],
  };
}

export interface DataCiteOptions {
  fetch?: Fetch;
}

export function createDataCiteProvider(options: DataCiteOptions = {}): Provider {
  const doFetch = options.fetch ?? defaultFetch;

  return {
    id: "datacite",
    name: "DataCite",
    syntax: "boolean",

    async search(query: string, { limit, signal }: SearchOptions): Promise<Result[]> {
      const text = query.trim();
      if (text === "") return [];
      const url = new URL(DOIS_URL);
      url.searchParams.set("query", text);
      url.searchParams.set("page[size]", String(clampLimit(limit, MAX_PAGE_SIZE)));

      const body = asRecord(await requestJson(doFetch, url, "DataCite", signal));
      const records = asArray(body?.data);
      return records
        .map((record, index) => parseDataCiteRecord(record, index + 1, records.length))
        .filter((result): result is Result => result !== null);
    },
  };
}
