import type { Author, OaStatus, OpenAccessInfo, ProviderId, Result, RetractionInfo, Subject, WorkType } from "./types";

// Merging results that several providers returned for the same work.
//
// Two results are the same work when they share a DOI (a DOI that differs only by a
// trailing version marker such as ".v1" or "/v2" counts as the same: repositories mint a
// version DOI and a concept DOI for one deposit). Failing that, they are the
// same work when their normalized title, publication year and first author's family
// name all match (a result with no listed author is matched by DOI only, because a
// title alone is too weak). Two results with different DOIs are never merged, even if
// the titles match: they may be a preprint and its published version.

/**
 * When providers disagree about a field, the one earlier in this list wins. The order
 * puts providers with the richest, best-curated metadata first.
 */
export const PROVIDER_PRIORITY: readonly ProviderId[] = [
  "openalex",
  "crossref",
  "europepmc",
  "pubmed",
  "semanticscholar",
  "doaj",
  "datacite",
  "zenodo",
  "arxiv",
  "wikipedia",
];

/** Most specific first: a review beats a plain article, an article beats its preprint. */
const TYPE_PRECEDENCE: readonly WorkType[] = [
  "review",
  "journal-article",
  "conference-paper",
  "preprint",
  "thesis",
  "book",
  "book-chapter",
  "reference-entry",
  "report",
  "dataset",
  "other",
  "unknown",
];

function removeDiacritics(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase, no accents, no tags or punctuation, single spaces. */
export function normalizeTitle(title: string): string {
  return removeDiacritics(title)
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeWord(word: string): string {
  return removeDiacritics(word).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** A DOI without a trailing version marker (".v1", "/v2"), for matching versions of one deposit. */
export function versionlessDoi(doi: string): string {
  return doi.replace(/[./]v\d+$/i, "");
}

/**
 * The family name of an author, for matching. Names arrive as "Family, Given",
 * "Given Family" or "Family G" (initials last), so trailing initials are dropped
 * before taking the last word.
 */
export function familyName(author: Author): string {
  if (author.family !== undefined && author.family.trim() !== "") return normalizeWord(author.family);
  const name = author.name.trim();
  const comma = name.indexOf(",");
  if (comma > 0) return normalizeWord(name.slice(0, comma));
  const words = name.split(/\s+/).filter((word) => word !== "");
  while (words.length > 1 && /^[A-Z]{1,3}\.?$/.test(words[words.length - 1] ?? "")) words.pop();
  return normalizeWord(words[words.length - 1] ?? "");
}

/** The title+year+first-author key, or null when the result has too little to match safely. */
export function duplicateKey(result: Pick<Result, "title" | "year" | "authors">): string | null {
  const title = normalizeTitle(result.title);
  const first = result.authors[0];
  const family = first === undefined ? "" : familyName(first);
  if (title.length < 8 || family === "") return null;
  return `${title}|${result.year ?? ""}|${family}`;
}

const priorityOf = (result: Result): number => {
  const first = result.hits[0]?.provider;
  const index = first === undefined ? -1 : PROVIDER_PRIORITY.indexOf(first);
  return index === -1 ? PROVIDER_PRIORITY.length : index;
};

function mergeOpenAccess(ordered: Result[]): OpenAccessInfo {
  const all = ordered.map((result) => result.openAccess);
  const isOpen = all.some((a) => a.isOpen === true) ? true : all.some((a) => a.isOpen === false) ? false : null;
  const open = all.filter((a) => a.isOpen === true);
  const pick = <T>(choose: (a: OpenAccessInfo) => T | null): T | null => {
    for (const a of isOpen === true ? open : all) {
      const value = choose(a);
      if (value !== null) return value;
    }
    return null;
  };
  const status: OaStatus = pick((a) => (a.status !== "unknown" ? a.status : null)) ?? "unknown";
  return { isOpen, status, url: pick((a) => a.url), pdfUrl: pick((a) => a.pdfUrl) };
}

/** All descriptive terms, from the source earliest in the priority order first, without repeats. */
function mergeSubjects(ordered: Result[]): Subject[] {
  const seen = new Set<string>();
  const merged: Subject[] = [];
  for (const subject of ordered.flatMap((result) => result.subjects)) {
    const key = `${subject.kind}:${subject.term.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(subject);
  }
  return merged;
}

function mergeRetraction(ordered: Result[]): RetractionInfo {
  const all = ordered.map((result) => result.retraction);
  const flagged = all.filter((r) => r.retracted === true);
  if (flagged.length > 0) {
    const sources = [...new Set(flagged.map((r) => r.source).filter((s): s is string => s !== null))];
    return { retracted: true, source: sources.length > 0 ? sources.join("; ") : null };
  }
  const clear = all.find((r) => r.retracted === false);
  return clear !== undefined ? clear : { retracted: null, source: null };
}

/** Merges the results of one group into a single result. Never changes its inputs. */
function mergeGroup(group: Result[]): Result {
  const ordered = [...group].sort((a, b) => priorityOf(a) - priorityOf(b));
  const first = <T>(choose: (result: Result) => T | null): T | null => {
    for (const result of ordered) {
      const value = choose(result);
      if (value !== null) return value;
    }
    return null;
  };

  const longest = <T extends { length: number }>(choose: (result: Result) => T | null): T | null =>
    ordered.reduce<T | null>((best, result) => {
      const value = choose(result);
      return value !== null && (best === null || value.length > best.length) ? value : best;
    }, null);

  const type = TYPE_PRECEDENCE.find((t) => ordered.some((result) => result.type === t)) ?? "unknown";
  const typeSource = ordered.find((result) => result.type === type);
  const doi = first((result) => result.doi);
  const citations = ordered.map((r) => r.citationCount).filter((c): c is number => c !== null);
  const hits = ordered.flatMap((result) => result.hits);

  return {
    id: doi ?? ordered[0]?.id ?? "",
    title: first((result) => (result.title !== "" ? result.title : null)) ?? "",
    authors: longest((result) => (result.authors.length > 0 ? result.authors : null)) ?? [],
    year: first((result) => result.year),
    venue: first((result) => result.venue),
    venueKind: first((result) => result.venueKind),
    volume: first((result) => result.volume),
    issue: first((result) => result.issue),
    pages: first((result) => result.pages),
    doi,
    url: first((result) => result.url),
    abstract: longest((result) => result.abstract),
    type,
    rawType: typeSource?.rawType ?? null,
    // Counts differ by provider (each indexes different citing works); the highest is the most complete.
    citationCount: citations.length > 0 ? Math.max(...citations) : null,
    language: first((result) => result.language),
    authorCountries: [...new Set(ordered.flatMap((result) => result.authorCountries))].sort(),
    openAccess: mergeOpenAccess(ordered),
    retraction: mergeRetraction(ordered),
    subjects: mergeSubjects(ordered),
    hits,
  };
}

function doisConflict(group: Result[] | undefined, result: Result): boolean {
  if (group === undefined || result.doi === null) return false;
  const wanted = versionlessDoi(result.doi);
  return group.some((member) => member.doi !== null && versionlessDoi(member.doi) !== wanted);
}

/**
 * Combines results from all providers into one list with one entry per work.
 * The order follows first appearance, and each merged entry lists every provider
 * that returned it in `hits`. The inputs are not modified.
 */
export function mergeResults(results: readonly Result[]): Result[] {
  const groups: Result[][] = [];
  const byDoi = new Map<string, number>();
  const byKey = new Map<string, number>();

  for (const result of results) {
    const key = duplicateKey(result);
    const doiKey = result.doi === null ? null : versionlessDoi(result.doi);
    let index = doiKey !== null ? byDoi.get(doiKey) : undefined;
    if (index === undefined && key !== null) {
      const candidate = byKey.get(key);
      if (candidate !== undefined && !doisConflict(groups[candidate], result)) index = candidate;
    }

    if (index === undefined) {
      index = groups.length;
      groups.push([result]);
    } else {
      groups[index]?.push(result);
    }
    if (doiKey !== null) byDoi.set(doiKey, index);
    if (key !== null && !byKey.has(key)) byKey.set(key, index);
  }

  return groups.map((group) => (group.length === 1 ? (group[0] as Result) : mergeGroup(group)));
}
