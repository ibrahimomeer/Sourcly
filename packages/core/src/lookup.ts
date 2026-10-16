import { asArray, asRecord, asString } from "./json";
import type { DetectedInput } from "./identifiers";
import { mergeResults } from "./dedupe";
import { tokenize } from "./tokens";
import { createCrossrefProvider, parseCrossrefWork } from "./providers/crossref";
import { createEuropePmcProvider } from "./providers/europepmc";
import { parseOpenAlexWork, SELECT_FIELDS } from "./providers/openalex";
import { createPubmedProvider } from "./providers/pubmed";
import { defaultFetch, requestJson, type Fetch } from "./providers/shared";
import { ProviderError, type OaStatus, type OpenAccessInfo, type Result } from "./types";

// Looking up one work from a DOI, a link or an ID, and listing the works around it. Everything is a plain request to a
// source that allows browsers (OpenAlex, Crossref, PubMed, Europe PMC, Unpaywall). Nothing is scraped, no page is
// fetched, and no proxy is used: a link that is not a DOI or an ID is looked up only by its address in OpenAlex.

const OPENALEX = "https://api.openalex.org";
const CROSSREF = "https://api.crossref.org/works";
const UNPAYWALL = "https://api.unpaywall.org/v2";
/** OpenAlex's `related_works` are listed as well. */
const LOOKUP_SELECT = [...SELECT_FIELDS, "related_works"];

export interface LookupOptions {
  fetch?: Fetch;
  /** Sent to Crossref as its polite-pool `mailto`, and to NCBI and Unpaywall. Unpaywall is not asked without one. */
  contactEmail?: string;
  /** The person's own OpenAlex key, if they set one. */
  openAlexApiKey?: string;
  signal?: AbortSignal;
}

export interface LookupOutcome {
  /** The work, merged from every source that knew it, or null. */
  result: Result | null;
  /** OpenAlex's id for it (W...), for its references, citing works and related works. */
  openAlexId: string | null;
  /** OpenAlex ids of related works, from its `related_works`. */
  relatedIds: string[];
  /** The sources that knew the work. */
  sources: string[];
  /** What could not be done, in plain language (a source did not answer, Unpaywall needs a contact email, ...). */
  notes: string[];
  /** True when a request failed in the browser itself (a fetch TypeError), not with an HTTP answer. */
  network?: true;
}

const EMPTY: LookupOutcome = { result: null, openAlexId: null, relatedIds: [], sources: [], notes: [] };

type Json = unknown;

/** A GET that returns the parsed answer, or null when the source says it does not have it (HTTP 404). */
async function getJson(fetchFn: Fetch, url: URL, name: string, signal: AbortSignal | undefined): Promise<Json | null> {
  try {
    return await requestJson(fetchFn, url, name, signal);
  } catch (error) {
    if (error instanceof ProviderError && error.httpStatus === 404) return null;
    throw error;
  }
}

/** The note lists of lookups in which a request failed in the browser itself, so the outcome can say so. */
const networkFailures = new WeakSet<string[]>();
const networkFlag = (notes: string[]) => (networkFailures.has(notes) ? { network: true as const } : {});

/** Runs a lookup step; a failure of one source becomes a note, never an error of the whole lookup. */
async function attempt<T>(name: string, notes: string[], step: () => Promise<T>): Promise<T | null> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof ProviderError && error.cause instanceof TypeError) networkFailures.add(notes);
    notes.push(error instanceof ProviderError ? error.message : `${name} could not be reached`);
    return null;
  }
}

interface OpenAlexWork {
  result: Result;
  id: string | null;
  related: string[];
}

function openAlexWorkFrom(raw: Json): OpenAlexWork | null {
  const record = asRecord(raw);
  const result = parseOpenAlexWork(raw, 1, 1);
  if (record === null || result === null) return null;
  const id = asString(record.id)?.replace(/^https?:\/\/openalex\.org\//, "") ?? null;
  const related = asArray(record.related_works)
    .map((value) => (typeof value === "string" ? value.replace(/^https?:\/\/openalex\.org\//, "") : null))
    .filter((value): value is string => value !== null);
  return { result, id, related };
}

function openAlexUrl(path: string, options: LookupOptions, params: Record<string, string> = {}): URL {
  const url = new URL(`${OPENALEX}/${path}`);
  url.searchParams.set("select", LOOKUP_SELECT.join(","));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (options.openAlexApiKey !== undefined && options.openAlexApiKey !== "") url.searchParams.set("api_key", options.openAlexApiKey);
  return url;
}

async function openAlexByPath(path: string, options: LookupOptions): Promise<OpenAlexWork | null> {
  const raw = await getJson(options.fetch ?? defaultFetch, openAlexUrl(path, options), "OpenAlex", options.signal);
  return raw === null ? null : openAlexWorkFrom(raw);
}

/** Address variants a landing page may be stored under: https and http, with and without www and a trailing slash. */
export function addressVariants(address: string): string[] {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return [address];
  }
  url.hash = "";
  const bare = url.hostname.replace(/^www\./, "");
  const out: string[] = [];
  for (const scheme of ["https:", "http:"]) {
    for (const host of [bare, `www.${bare}`]) {
      for (const slash of [false, true]) {
        const copy = new URL(url.toString());
        copy.protocol = scheme;
        copy.hostname = host;
        const trimmed = copy.pathname.replace(/\/+$/, "");
        copy.pathname = slash ? `${trimmed}/` : trimmed === "" ? "/" : trimmed;
        const text = copy.toString();
        if (!out.includes(text)) out.push(text);
      }
    }
  }
  return out;
}

async function openAlexByAddress(address: string, options: LookupOptions): Promise<OpenAlexWork | null> {
  // `locations.landing_page_url` (checked 2026-10-15: a made-up filter name is refused with HTTP 400) matches a work's
  // landing page in any of its locations; several addresses are alternatives, so they are joined with "|".
  const url = openAlexUrl("works", options, { filter: `locations.landing_page_url:${addressVariants(address).join("|")}`, per_page: "1" });
  const body = asRecord(await getJson(options.fetch ?? defaultFetch, url, "OpenAlex", options.signal));
  const first = asArray(body?.results)[0];
  return first === undefined ? null : openAlexWorkFrom(first);
}

async function crossrefByDoi(doi: string, options: LookupOptions): Promise<Result | null> {
  const url = new URL(`${CROSSREF}/${encodeURI(doi)}`);
  if (options.contactEmail !== undefined && options.contactEmail !== "") url.searchParams.set("mailto", options.contactEmail);
  const body = asRecord(await getJson(options.fetch ?? defaultFetch, url, "Crossref", options.signal));
  return body === null ? null : parseCrossrefWork(body.message, 1, 1);
}

const OA_STATUS: Record<string, OaStatus> = { gold: "gold", green: "green", hybrid: "hybrid", bronze: "bronze", closed: "closed", diamond: "diamond" };

/** Unpaywall's answer for a DOI, applied to a result's open-access information. Never invents a free PDF: it uses only a location Unpaywall says is open. */
export function withUnpaywall(result: Result, raw: Json): Result {
  const record = asRecord(raw);
  if (record === null || typeof record.is_oa !== "boolean") return result;
  const best = asRecord(record.best_oa_location);
  const status = OA_STATUS[asString(record.oa_status) ?? ""] ?? (record.is_oa ? "unknown" : "closed");
  const openAccess: OpenAccessInfo = record.is_oa
    ? {
        isOpen: true,
        status,
        url: asString(best?.url_for_landing_page) ?? asString(best?.url) ?? result.openAccess.url,
        pdfUrl: asString(best?.url_for_pdf) ?? result.openAccess.pdfUrl,
      }
    : result.openAccess.isOpen === true
      ? result.openAccess
      : { isOpen: false, status: "closed", url: null, pdfUrl: null };
  return { ...result, openAccess };
}

async function unpaywallByDoi(doi: string, options: LookupOptions, email: string): Promise<Json | null> {
  const url = new URL(`${UNPAYWALL}/${encodeURI(doi)}`);
  url.searchParams.set("email", email);
  return getJson(options.fetch ?? defaultFetch, url, "Unpaywall", options.signal);
}

/** The DOI-keyed part of a lookup: OpenAlex, Crossref and (with a contact email) Unpaywall, asked at the same time. */
async function byDoi(doi: string, known: Result[], options: LookupOptions, notes: string[], used: string[]): Promise<{ results: Result[]; openAlex: OpenAlexWork | null; unpaywall: Json | null }> {
  const email = options.contactEmail?.trim() ?? "";
  const [openAlex, crossref, unpaywall] = await Promise.all([
    attempt("OpenAlex", notes, () => openAlexByPath(`works/doi:${encodeURI(doi)}`, options)),
    attempt("Crossref", notes, () => crossrefByDoi(doi, options)),
    email === "" ? Promise.resolve(null) : attempt("Unpaywall", notes, () => unpaywallByDoi(doi, options, email)),
  ]);
  if (openAlex !== null) used.push("OpenAlex");
  if (crossref !== null) used.push("Crossref");
  if (unpaywall !== null) used.push("Unpaywall");
  if (email === "") notes.push("Unpaywall was not asked: it needs a contact email (set contactEmail in config.js). OpenAlex’s open-access information comes from the same data.");
  return { results: [...known, ...(openAlex === null ? [] : [openAlex.result]), ...(crossref === null ? [] : [crossref])], openAlex, unpaywall };
}

/** Looks a work up by what was recognised in the search box. Resolves with a result, or with none and the reasons. */
export async function lookupWork(target: Exclude<DetectedInput, { kind: "keywords" } | { kind: "title" }>, options: LookupOptions = {}): Promise<LookupOutcome> {
  const notes: string[] = [];
  const used: string[] = [];
  const fetchFn = options.fetch ?? defaultFetch;
  let known: Result[] = [];
  let doi: string | null = null;
  let openAlex: OpenAlexWork | null = null;

  switch (target.kind) {
    case "doi":
      doi = target.doi;
      break;
    case "arxiv":
      doi = target.doi;
      break;
    case "openalex":
      openAlex = await attempt("OpenAlex", notes, () => openAlexByPath(`works/${target.id}`, options));
      if (openAlex !== null) used.push("OpenAlex");
      doi = openAlex?.result.doi ?? null;
      break;
    case "pmid": {
      const [fromOpenAlex, fromPubmed, fromEurope] = await Promise.all([
        attempt("OpenAlex", notes, () => openAlexByPath(`works/pmid:${target.pmid}`, options)),
        attempt("PubMed", notes, () => createPubmedProvider({ fetch: fetchFn, email: options.contactEmail ?? "" }).search(`${target.pmid}[uid]`, { limit: 1, ...(options.signal === undefined ? {} : { signal: options.signal }) })),
        attempt("Europe PMC", notes, () => createEuropePmcProvider({ fetch: fetchFn }).search(`EXT_ID:${target.pmid} AND SRC:MED`, { limit: 1, ...(options.signal === undefined ? {} : { signal: options.signal }) })),
      ]);
      openAlex = fromOpenAlex;
      if (fromOpenAlex !== null) used.push("OpenAlex");
      if ((fromPubmed?.length ?? 0) > 0) used.push("PubMed");
      if ((fromEurope?.length ?? 0) > 0) used.push("Europe PMC");
      known = [...(fromOpenAlex === null ? [] : [fromOpenAlex.result]), ...(fromPubmed ?? []), ...(fromEurope ?? [])];
      doi = known.find((result) => result.doi !== null)?.doi ?? null;
      break;
    }
    case "pmcid": {
      const fromEurope = await attempt("Europe PMC", notes, () => createEuropePmcProvider({ fetch: fetchFn }).search(`PMCID:${target.pmcid}`, { limit: 1, ...(options.signal === undefined ? {} : { signal: options.signal }) }));
      if ((fromEurope?.length ?? 0) > 0) used.push("Europe PMC");
      known = fromEurope ?? [];
      doi = known.find((result) => result.doi !== null)?.doi ?? null;
      break;
    }
    case "url": {
      openAlex = await attempt("OpenAlex", notes, () => openAlexByAddress(target.url, options));
      if (openAlex !== null) used.push("OpenAlex");
      doi = openAlex?.result.doi ?? null;
      break;
    }
  }

  let unpaywall: Json | null = null;
  if (doi !== null) {
    // OpenAlex was already asked for these kinds; asking again by DOI would only repeat it.
    const again = await byDoi(doi, known, options, notes, used);
    known = again.results;
    unpaywall = again.unpaywall;
    openAlex = openAlex ?? again.openAlex;
    if (openAlex !== null && !known.includes(openAlex.result)) known = [openAlex.result, ...known];
  } else if (openAlex !== null) {
    known = [openAlex.result, ...known];
  }

  const merged = mergeResults(known)[0] ?? null;
  if (merged === null) {
    if (target.kind === "url") notes.push("Could not identify this link. Paste the DOI or the title.");
    return { ...EMPTY, notes, ...networkFlag(notes) };
  }
  const result = unpaywall === null ? merged : withUnpaywall(merged, unpaywall);
  return {
    result,
    openAlexId: openAlex?.id ?? result.hits.find((hit) => hit.provider === "openalex")?.id ?? null,
    relatedIds: openAlex?.related ?? [],
    sources: [...new Set(used)],
    notes,
    ...networkFlag(notes),
  };
}

// ---- The works around one work

export type Neighbours = "references" | "citing" | "related";

/** Works from OpenAlex by a filter, most cited first. At most 100 are asked for. */
async function openAlexList(filter: string, options: LookupOptions, limit: number): Promise<Result[]> {
  const url = openAlexUrl("works", options, { filter, per_page: String(Math.min(100, Math.max(1, limit))), sort: "cited_by_count:desc" });
  const body = asRecord(await requestJson(options.fetch ?? defaultFetch, url, "OpenAlex", options.signal));
  const works = asArray(body?.results);
  return works.map((work, index) => parseOpenAlexWork(work, index + 1, works.length)).filter((result): result is Result => result !== null);
}

/**
 * The works one work cites ("references": OpenAlex's `cited_by` filter holds the works cited by the given one), the
 * works that cite it ("citing": the `cites` filter), or its related works (the ids OpenAlex lists as related).
 */
export async function fetchNeighbours(kind: Neighbours, openAlexId: string, relatedIds: readonly string[], options: LookupOptions = {}, limit = 100): Promise<Result[]> {
  switch (kind) {
    case "references":
      return openAlexList(`cited_by:${openAlexId}`, options, limit);
    case "citing":
      return openAlexList(`cites:${openAlexId}`, options, limit);
    case "related":
      return relatedIds.length === 0 ? [] : openAlexList(`openalex:${relatedIds.slice(0, 50).join("|")}`, options, limit);
  }
}

// ---- Title lookup

/** How alike two titles are: the share of the words of the shorter title that the longer one has too (common words are ignored). 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const first = new Set(tokenize(a, { exact: true }));
  const second = new Set(tokenize(b, { exact: true }));
  if (first.size === 0 || second.size === 0) return 0;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared += 1;
  const smaller = Math.min(first.size, second.size);
  const larger = Math.max(first.size, second.size);
  // Containment of the shorter title, pulled down when the other one is much longer (a title that only starts like it).
  return (shared / smaller) * (shared / larger) ** 0.5;
}

/** A closest match must be at least this alike. */
export const MIN_TITLE_SIMILARITY = 0.7;

export interface ClosestMatch {
  result: Result;
  similarity: number;
}

/**
 * The work whose title is closest to the one given: Crossref's bibliographic search and OpenAlex's relevance search are
 * both asked, the answers are merged, and the most similar title wins if it is similar enough. No score of a source is used.
 */
export async function closestTitleMatch(title: string, options: LookupOptions = {}): Promise<ClosestMatch | null> {
  const fetchFn = options.fetch ?? defaultFetch;
  const notes: string[] = [];
  const signal = options.signal === undefined ? {} : { signal: options.signal };
  const [fromCrossref, fromOpenAlex] = await Promise.all([
    attempt("Crossref", notes, () => createCrossrefProvider({ fetch: fetchFn, ...(options.contactEmail === undefined ? {} : { mailto: options.contactEmail }) }).search(title, { limit: 5, ...signal })),
    attempt("OpenAlex", notes, async () => {
      const url = openAlexUrl("works", options, { search: title, per_page: "5" });
      const body = asRecord(await requestJson(fetchFn, url, "OpenAlex", options.signal));
      const works = asArray(body?.results);
      return works.map((work, index) => parseOpenAlexWork(work, index + 1, works.length)).filter((result): result is Result => result !== null);
    }),
  ]);
  const candidates = mergeResults([...(fromOpenAlex ?? []), ...(fromCrossref ?? [])]);
  let best: ClosestMatch | null = null;
  for (const result of candidates) {
    const similarity = titleSimilarity(title, result.title);
    if (best === null || similarity > best.similarity) best = { result, similarity };
  }
  return best !== null && best.similarity >= MIN_TITLE_SIMILARITY ? best : null;
}
