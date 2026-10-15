import {
  PROVIDER_NAMES,
  closestTitleMatch,
  createOpenAlexCounter,
  defaultFilters,
  defaultLayoutSettings,
  defaultScoringSettings,
  describeBlock,
  describeInput,
  hardBlocks,
  languageBadge,
  lookupWork,
  matchCountLabel,
  normalizeDoi,
  parseInput,
  planQueries,
  resolveLanguage,
  runFallback,
  searchProviders,
  suggestTypos,
  suggestedTerms,
  uniqueProviderHits,
  type ConceptQuery,
  type LookupOutcome,
  type Provider,
  type ScoredResult,
} from "@sourcly/core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { allResults, fullMatchCount, hasFewFullMatches, rankResults, scoringContext, type RankedView } from "../src/pipeline";
import { createProviders, DEFAULT_PROVIDERS } from "../src/providers";
import { prepareSearch } from "../src/queryText";
import { idleSearch, searchReducer, type ActiveSearch } from "../src/searchState";
import { DEFAULT_PER_SOURCE } from "../src/settings";

// The eval: the same steps the page takes for a search, run from Node against the live sources, printed as text.
//
// - Answers are kept on disk for a day (apps/web/eval/.cache, not committed) so running it again while changing the
//   code does not use up the free allowances of the sources. EVAL_REFRESH=1 asks again.
// - OPENALEX_API_KEY (optional, from the environment) is sent to OpenAlex like the page's own key field. It is never
//   written to the cache or to any output file. Without it OpenAlex allows a small shared daily budget, and says so with
//   HTTP 429 when it is used up: that is reported in the output, never hidden, and the answers already cached are kept
//   so a later run carries on from where this one stopped.
// - A report is also written to apps/web/eval/output/<query>.md (not committed).

const CACHE_DIR = new URL("./.cache/", import.meta.url).pathname;
const OUTPUT_DIR = new URL("./output/", import.meta.url).pathname;
const CACHE_HOURS = 24;
const OPENALEX_KEY = (process.env.OPENALEX_API_KEY ?? "").trim();

/** Set when a source answered that its budget is used up, so the report can say its results are missing. */
export const budget = { openalexExhausted: false, /** 429 answers with a short Retry-After, which the provider waits out. */ throttled: 0, notes: new Set<string>() };

/** The cache file of a request: the address without the API key, so the key never reaches the disk. */
function cacheFile(url: string): string {
  const clean = new URL(url);
  clean.searchParams.delete("api_key");
  return `${CACHE_DIR}${createHash("sha1").update(clean.toString()).digest("hex")}.json`;
}

export function cachedFetch(): typeof globalThis.fetch {
  mkdirSync(CACHE_DIR, { recursive: true });
  return async (input, init) => {
    const url = String(input instanceof URL ? input.toString() : typeof input === "string" ? input : (input as Request).url);
    const file = cacheFile(url);
    const fresh = existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_HOURS * 3_600_000;
    if (fresh && process.env.EVAL_REFRESH !== "1") {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { status: number; body: string };
      return new Response(saved.body, { status: saved.status, headers: { "content-type": "application/json" } });
    }
    const response = await fetch(url, { signal: init?.signal ?? null });
    if (response.status === 200) {
      const body = await response.clone().text();
      writeFileSync(file, JSON.stringify({ status: 200, body }));
    } else if (response.status === 429 && url.startsWith("https://api.openalex.org/")) {
      // A short Retry-After is OpenAlex's one-request-per-second limit on broad boolean queries: the provider waits and asks
      // again. Anything else (no hint, or a long one) is a spent daily budget, which the report says.
      const retry = Number(response.headers.get("retry-after"));
      const short = Number.isFinite(retry) && retry > 0 && retry <= 5;
      const body = (await response.clone().text()).replace(/\s+/g, " ").slice(0, 160);
      if (short) {
        budget.throttled += 1;
      } else {
        budget.openalexExhausted = true;
        budget.notes.add(
          `OpenAlex answered HTTP 429 without a short retry hint (remaining ${response.headers.get("x-ratelimit-remaining") ?? "?"}, retry-after ${response.headers.get("retry-after") ?? "none"}): its daily budget is probably used up, so its results are missing. Set OPENALEX_API_KEY, or run again later; answers already cached are kept. Body: ${body}`,
        );
      }
    }
    return response;
  };
}

const REFERENCE_YEAR = new Date().getFullYear();
const providersFor = (): Provider[] =>
  createProviders([...DEFAULT_PROVIDERS], { openAlexApiKey: OPENALEX_KEY, contactEmail: "", fetch: cachedFetch() });

export interface MustInclude {
  doi: string;
  title: string;
}

export interface BenchmarkQuery {
  text: string;
  check: "odor" | "pendulum" | "can-bus" | "english";
  expectSuggestion?: string;
  mustInclude: MustInclude[];
}

export interface Benchmark {
  queries: BenchmarkQuery[];
  lookups: { text: string; expectDoi: string }[];
}

export function loadBenchmark(): Benchmark {
  return JSON.parse(readFileSync(new URL("./benchmark.json", import.meta.url), "utf8")) as Benchmark;
}

export interface MustReport {
  doi: string;
  title: string;
  /** Where it landed, or null when it was not among the fetched results. */
  section: "main" | "partial" | "otherLanguages" | "otherTypes" | "hidden" | null;
  /** 1-based position in its section. */
  rank: number | null;
}

export interface QueryReport {
  text: string;
  lines: string[];
  ranked: RankedView | null;
  search: ActiveSearch | null;
  concepts: ConceptQuery | null;
  suggestion: string | null;
  lookup: LookupOutcome | null;
  titleMatch: string | null;
  must: MustReport[];
  /** OpenAlex's budget was used up during this search, so the numbers are not the real ones. */
  incomplete: boolean;
}

const names = (providers: readonly Pick<Provider, "id">[]) => providers.map((p) => PROVIDER_NAMES[p.id]).join(", ");

function describeStatuses(statuses: ActiveSearch["statuses"]): string {
  return statuses
    .map((s) => `${PROVIDER_NAMES[s.provider]} ${s.state === "ok" ? `${s.count}` : `${s.state}${"message" in s && s.message !== undefined ? ` (${s.message})` : ""}`}`)
    .join(" | ");
}

const SECTION_NAMES = { main: "main", partial: "partial", otherLanguages: "other-lang", otherTypes: "other-type" } as const;

export function sectionOf(ranked: RankedView, scored: ScoredResult): keyof typeof SECTION_NAMES | "hidden" {
  if (ranked.shown.includes(scored)) return "main";
  if (ranked.partial.includes(scored)) return "partial";
  if (ranked.otherLanguages.includes(scored)) return "otherLanguages";
  if (ranked.otherTypes.includes(scored)) return "otherTypes";
  return "hidden";
}

/** “odor (odour, title); AI (machine learning, abstract)”: every concept the result matched, with the variant and the field. */
export function describeMatched(scored: ScoredResult): string {
  const coverage = scored.coverage;
  if (coverage === null) return "-";
  const matched = coverage.units.filter((u) => u.matched).map((u) => `${u.label} (${u.variant ?? u.label}, ${u.fields[0] ?? "?"})`);
  const missing = coverage.units.filter((u) => !u.matched).map((u) => u.label);
  return `${matched.join("; ") || "none"} [${coverage.matchedCount}/${coverage.total}]${missing.length > 0 ? ` missing: ${missing.join(", ")}` : ""}`;
}

export function describeRanked(ranked: RankedView, limit = 15): string[] {
  const lines: string[] = [];
  const sections = [
    ["main list", ranked.shown],
    ["partial matches", ranked.partial],
    ["other languages", ranked.otherLanguages],
    ["datasets and other types", ranked.otherTypes],
  ] as const;
  lines.push(
    `  sections: ${sections.map(([name, list]) => `${name} ${list.length}`).join(", ")}${ranked.hidden.length > 0 ? `, hidden by filters ${ranked.hidden.length}` : ""}; results matching every concept: ${fullMatchCount(ranked)}`,
  );
  const shownRows = ranked.shown.slice(0, limit);
  const rows = shownRows.length > 0 ? shownRows : [...ranked.partial, ...ranked.otherLanguages, ...ranked.otherTypes].slice(0, limit);
  rows.forEach((scored, index) => {
    const section = SECTION_NAMES[sectionOf(ranked, scored) as keyof typeof SECTION_NAMES] ?? "hidden";
    const found = uniqueProviderHits(scored.result.hits)
      .map((hit) => `${PROVIDER_NAMES[hit.provider]}${scored.result.hits.filter((h) => h.provider === hit.provider).every((h) => h.fallback === true) ? "*" : ""}`)
      .join("+");
    const near = matchCountLabel(scored);
    lines.push(`  ${String(index + 1).padStart(2)}. [${section}] ${scored.result.title.slice(0, 92)} (${scored.result.year ?? "n.d."}) — ${(scored.result.venue ?? "no venue").slice(0, 40)}`);
    lines.push(`      ${found} | ${describeMatched(scored)}${near === null ? "" : ` | ${near}`} | ${languageBadge(resolveLanguage(scored.result))} | tier ${scored.tier}`);
  });
  return lines;
}

function mustReports(ranked: RankedView, must: readonly MustInclude[]): MustReport[] {
  return must.map(({ doi, title }) => {
    const wanted = normalizeDoi(doi) ?? doi.toLowerCase();
    const found = allResults(ranked).find((scored) => scored.result.doi !== null && (normalizeDoi(scored.result.doi) ?? "") === wanted);
    if (found === undefined) return { doi, title, section: null, rank: null };
    const section = sectionOf(ranked, found);
    const list = section === "main" ? ranked.shown : section === "partial" ? ranked.partial : section === "otherLanguages" ? ranked.otherLanguages : section === "otherTypes" ? ranked.otherTypes : ranked.hidden;
    return { doi, title, section, rank: list.indexOf(found) + 1 };
  });
}

function describeBlocks(concepts: ConceptQuery): string[] {
  const lines: string[] = [];
  lines.push(`  concepts: ${hardBlocks(concepts).map((block) => describeBlock(block)).join("  AND  ") || "(none)"}`);
  if (concepts.stopwords.length > 0) lines.push(`  common words left out: ${[...new Set(concepts.stopwords)].join(", ")}`);
  if (concepts.soft.length > 0) lines.push(`  generic (soft) words: ${concepts.soft.map((term) => term.text).join(", ")}${concepts.promotedSoft ? " (promoted to required: nothing else was left)" : ""}`);
  return lines;
}

/** The steps the page takes for a search: strict pass, then, when few results match every concept, the fallback passes. */
export async function runSearch(item: BenchmarkQuery | string): Promise<QueryReport> {
  const spec: BenchmarkQuery = typeof item === "string" ? { text: item, check: "english", mustInclude: [] } : item;
  const text = spec.text;
  const providers = providersFor();
  const prepared = prepareSearch(text);
  const concepts = prepared.concepts;
  const report: QueryReport = { text, lines: [], ranked: null, search: null, concepts, suggestion: null, lookup: null, titleMatch: null, must: [], incomplete: false };
  report.lines.push(`== ${text}`);
  if (!prepared.usable) {
    report.lines.push("  (not searched: nothing usable in the text)");
    return report;
  }
  report.lines.push(`  sources asked: ${names(providers)}`);
  report.lines.push(...describeBlocks(concepts));
  report.lines.push(...planQueries(providers, concepts).map((q) => `  query → ${PROVIDER_NAMES[q.provider]}: ${q.text}${q.notes.length > 0 ? `   (${q.notes.join("; ")})` : ""}`));

  let state = searchReducer(idleSearch, {
    type: "start",
    id: 1,
    concepts,
    sent: planQueries(providers, concepts),
    order: providers.map((p) => p.id),
    skipped: [],
  });
  await searchProviders(providers, concepts, {
    limit: DEFAULT_PER_SOURCE,
    onProviderDone: (update) => {
      state = searchReducer(state, { type: "provider-done", id: 1, update });
    },
  });
  state = searchReducer(state, { type: "finish", id: 1, at: new Date() });
  if (state.phase === "idle") throw new Error("expected an active search");

  const view = { scoring: defaultScoringSettings(), filters: defaultFilters(), overrides: new Map(), layout: defaultLayoutSettings() };
  const rank = (s: ActiveSearch) => rankResults(s.results, view, scoringContext(s, REFERENCE_YEAR));
  let ranked = rank(state);
  report.lines.push(`  strict pass: ${describeStatuses(state.statuses)}`);

  if (hasFewFullMatches(ranked) && !concepts.exact && hardBlocks(concepts).length >= 2) {
    state = searchReducer(state, { type: "fallback-start", id: 1 });
    let current = state;
    const fallback = await runFallback(
      providers,
      concepts,
      { limit: DEFAULT_PER_SOURCE, count: createOpenAlexCounter({ fetch: cachedFetch(), apiKey: OPENALEX_KEY }), have: state.phase === "idle" ? [] : state.results },
      {
        onPassStart: (pass, sent) => {
          current = searchReducer(current, { type: "fallback-pass-start", id: 1, dropped: pass.dropped, sent, order: providers.map((p) => p.id) });
        },
        onProviderDone: (update) => {
          current = searchReducer(current, { type: "fallback-provider-done", id: 1, update });
        },
      },
    );
    state = searchReducer(current, { type: "fallback-finish", id: 1 });
    if (state.phase === "idle") throw new Error("expected an active search");
    ranked = rank(state);
    report.lines.push(
      `  fallback ran (fewer than 15 results matched every concept). Works per concept alone (OpenAlex): ${hardBlocks(concepts).map((b) => `${b.label} ${fallback.counts.get(b.id)?.toLocaleString("en") ?? "?"}`).join("; ")}`,
    );
    for (const pass of fallback.passes) {
      report.lines.push(`  fallback pass without “${pass.dropped}”: ${pass.sent.map((q) => `${PROVIDER_NAMES[q.provider]}: ${q.text}`).join(" || ")}`);
      report.lines.push(`    answers: ${describeStatuses(pass.statuses)}`);
    }
    if (fallback.passes.length === 0) report.lines.push("  (no fallback pass could be planned or none was needed after counting)");
  } else {
    report.lines.push("  no fallback pass (15 or more results match every concept, or only one concept)");
  }

  const openalexDown = state.statuses.some((s) => s.provider === "openalex" && s.state !== "ok");
  report.incomplete = budget.openalexExhausted || openalexDown;
  if (report.incomplete) report.lines.push("  !! OpenAlex did not answer during this search (see the note at the end): its results are missing or partial in this report.");

  const suggestion = suggestTypos(concepts, allResults(ranked).map((scored) => scored.result));
  report.suggestion = suggestion?.text ?? null;
  report.lines.push(...describeRanked(ranked));
  report.lines.push(`  did you mean: ${suggestion === null ? "(no suggestion)" : `${suggestion.text}   [${suggestion.changes.map((c) => `${c.from} in ${c.resultsWithFrom} results, ${c.to} in ${c.resultsWithTo}`).join("; ")}]`}`);
  const suggested = suggestedTerms(ranked.shown.map((s) => s.result), concepts);
  report.lines.push(`  suggested terms: ${suggested.length === 0 ? "(fewer than 3: not shown)" : suggested.map((t) => `${t.term} (${t.count})`).join(", ")}`);

  report.must = mustReports(ranked, spec.mustInclude);
  for (const m of report.must) {
    report.lines.push(`  mustInclude ${m.doi} (${m.title.slice(0, 60)}): ${m.section === null ? "NOT FOUND among the fetched results" : `found, ${m.section === "main" ? "main list" : m.section} #${m.rank}`}`);
  }

  // A long title also gets its closest match on top.
  const detected = parseInput(text);
  if (detected.kind === "title") {
    const match = await closestTitleMatch(detected.title, { fetch: cachedFetch() });
    report.titleMatch = match === null ? null : match.result.title;
    report.lines.push(`  closest match for this title: ${match === null ? "(none close enough)" : `${match.result.title} (similarity ${match.similarity.toFixed(2)})`}`);
  }
  report.ranked = ranked;
  report.search = state;
  return report;
}

/** A DOI, link or ID: what was detected, and the work it resolved to. */
export async function runLookup(text: string): Promise<QueryReport> {
  const detected = parseInput(text);
  const report: QueryReport = { text, lines: [`== ${text}`], ranked: null, search: null, concepts: null, suggestion: null, lookup: null, titleMatch: null, must: [], incomplete: false };
  report.lines.push(`  detected: ${describeInput(detected)}${detected.kind === "doi" ? ` ${detected.doi}` : ""}`);
  if (detected.kind === "keywords" || detected.kind === "title") {
    report.lines.push("  (not a lookup)");
    return report;
  }
  const outcome = await lookupWork(detected, { fetch: cachedFetch(), ...(OPENALEX_KEY === "" ? {} : { openAlexApiKey: OPENALEX_KEY }) });
  report.lookup = outcome;
  const result = outcome.result;
  if (result === null) {
    report.lines.push(`  not resolved. ${outcome.notes.join(" ")}`);
    return report;
  }
  report.lines.push(`  resolved: ${result.title}`);
  report.lines.push(`    ${result.authors.slice(0, 4).map((a) => a.name).join(", ")}${result.authors.length > 4 ? ", …" : ""} | ${result.year ?? "n.d."} | ${result.venue ?? "no venue"} | DOI ${result.doi ?? "none"} | ${result.type}`);
  report.lines.push(`    from: ${outcome.sources.join(", ")} | OpenAlex id ${outcome.openAlexId ?? "none"} | related works ${outcome.relatedIds.length} | open access: ${result.openAccess.status}${result.openAccess.pdfUrl === null ? "" : " (PDF link)"} | retracted: ${result.retraction.retracted === null ? "unknown" : result.retraction.retracted}`);
  for (const note of outcome.notes) report.lines.push(`    note: ${note}`);
  return report;
}

/** apps/web/eval/output/<query>.md: the same lines, with the top 15 as a Markdown list. Not committed. */
export function writeReportFile(report: QueryReport): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const slug = report.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "query";
  const file = `${OUTPUT_DIR}${slug}.md`;
  writeFileSync(file, `# ${report.text}\n\n\`\`\`text\n${report.lines.join("\n")}\n\`\`\`\n`);
  return file;
}
