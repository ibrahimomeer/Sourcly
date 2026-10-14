import type { Result } from "../types";

/** A complete, plausible journal-article Result; tests override only what they care about. */
export function makeResult(overrides: Partial<Result> = {}): Result {
  return {
    id: "10.1000/example",
    title: "An example article",
    authors: [{ name: "Ada Author" }],
    year: 2020,
    venue: "Journal of Examples",
    venueKind: { value: "journal", provider: "openalex", field: "primary_location.source.type" },
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    abstract: null,
    type: "journal-article",
    rawType: { value: "article", provider: "openalex", field: "type" },
    citationCount: 10,
    language: "en",
    authorCountries: [],
    openAccess: { isOpen: false, status: "closed", url: null, pdfUrl: null },
    retraction: { retracted: false, source: null },
    subjects: [],
    hits: [{ provider: "openalex", id: "W1", rank: 1, listSize: 1, score: null }],
    ...overrides,
  };
}
