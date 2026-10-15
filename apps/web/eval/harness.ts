import {
  closestTitleMatch,
  defaultFilters,
  defaultLayoutSettings,
  defaultScoringSettings,
  describeInput,
  expandable,
  languageBadge,
  lookupWork,
  matchCountLabel,
  parseInput,
  PROVIDER_NAMES,
  planExpandedQueries,
  planQueries,
  resolveLanguage,
  searchProviders,
  suggestTypos,
  type LookupOutcome,
  type Provider,
} from "@sourcly/core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { allResults, fullMatchCount, hasFewFullMatches, rankResults, scoringContext, type RankedView } from "../src/pipeline";
import { createProviders, DEFAULT_PROVIDERS } from "../src/providers";
import { prepareSearch } from "../src/queryText";
import { idleSearch, searchReducer, type ActiveSearch } from "../src/searchState";
import { DEFAULT_PER_SOURCE } from "../src/settings";

// The eval: the same steps the page takes for a search, run from Node against the live sources, printed as text.
// Answers are kept on disk for a day (apps/web/eval/.cache, not committed) so running it again while changing the
// code does not use up the free allowances of the sources. EVAL_REFRESH=1 asks again.

const CACHE_DIR = new URL("./.cache/", import.meta.url).pathname;
const CACHE_HOURS = 24;

export function cachedFetch(): typeof globalThis.fetch {
  mkdirSync(CACHE_DIR, { recursive: true });
  return async (input, init) => {
    const url = String(input instanceof URL ? input.toString() : typeof input === "string" ? input : (input as Request).url);
    const file = `${CACHE_DIR}${createHash("sha1").update(url).digest("hex")}.json`;
    const fresh = existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_HOURS * 3_600_000;
    if (fresh && process.env.EVAL_REFRESH !== "1") {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { status: number; body: string };
      return new Response(saved.body, { status: saved.status, headers: { "content-type": "application/json" } });
    }
    const response = await fetch(url, { signal: init?.signal ?? null });
    if (response.status === 200) {
      const body = await response.clone().text();
      writeFileSync(file, JSON.stringify({ status: 200, body }));
    }
    return response;
  };
}

const REFERENCE_YEAR = new Date().getFullYear();
const providersFor = () => createProviders([...DEFAULT_PROVIDERS], { openAlexApiKey: "", contactEmail: "", fetch: cachedFetch() });

export interface QueryReport {
  text: string;
  lines: string[];
  /** For the checks: the ranked view and the search, or the lookup outcome. */
  ranked: RankedView | null;
  search: ActiveSearch | null;
  suggestion: string | null;
  lookup: LookupOutcome | null;
  titleMatch: string | null;
}

const names = (providers: readonly Pick<Provider, "id">[]) => providers.map((p) => PROVIDER_NAMES[p.id]).join(", ");

function describeStatuses(search: ActiveSearch): string {
  return search.statuses.map((s) => `${PROVIDER_NAMES[s.provider]} ${s.state === "ok" ? `${s.count}` : s.state}`).join(" | ");
}

export function describeRanked(ranked: RankedView, search: ActiveSearch, limit = 15): string[] {
  const lines: string[] = [];
  const sections = [
    ["main list", ranked.shown],
    ["partial matches", ranked.partial],
    ["other languages", ranked.otherLanguages],
    ["datasets and other types", ranked.otherTypes],
  ] as const;
  lines.push(`  sections: ${sections.map(([name, list]) => `${name} ${list.length}`).join(", ")}${ranked.hidden.length > 0 ? `, hidden by filters ${ranked.hidden.length}` : ""}; results containing every word: ${fullMatchCount(ranked)}`);
  const shownRows = ranked.shown.slice(0, limit);
  const rows = shownRows.length > 0 ? shownRows : [...ranked.partial, ...ranked.otherLanguages, ...ranked.otherTypes].slice(0, limit);
  rows.forEach((scored, index) => {
    const section = ranked.shown.includes(scored) ? "main" : ranked.partial.includes(scored) ? "partial" : ranked.otherLanguages.includes(scored) ? "other-lang" : "other-type";
    const coverage = scored.coverage;
    const matched = coverage === null ? "-" : `${coverage.units.filter((u) => u.matched).map((u) => u.found.join(" ")).join(", ") || "none"} (${coverage.matchedCount}/${coverage.total})`;
    const byProvider = new Map<string, boolean>();
    for (const hit of scored.result.hits) byProvider.set(PROVIDER_NAMES[hit.provider], (byProvider.get(PROVIDER_NAMES[hit.provider]) ?? true) && hit.expanded === true);
    const found = [...byProvider].map(([name, onlyExpanded]) => `${name}${onlyExpanded ? "*" : ""}`).join("+");
    const near = matchCountLabel(scored);
    lines.push(`  ${String(index + 1).padStart(2)}. [${section}] ${scored.result.title.slice(0, 92)} (${scored.result.year ?? "n.d."})`);
    lines.push(`      ${found} | matched: ${matched}${near === null ? "" : ` | ${near}`} | ${languageBadge(resolveLanguage(scored.result))} | tier ${scored.tier}`);
  });
  void search;
  return lines;
}

/** The first look at a search: strict pass, then, like the page, the expanded pass when few results contain every word. */
export async function runSearch(text: string): Promise<QueryReport> {
  const providers = providersFor();
  const prepared = prepareSearch(text);
  const parsed = prepared.parsed;
  const report: QueryReport = { text, lines: [], ranked: null, search: null, suggestion: null, lookup: null, titleMatch: null };
  report.lines.push(`== ${text}`);
  if (!prepared.usable) {
    report.lines.push("  (not searched: nothing usable in the text)");
    return report;
  }
  report.lines.push(`  sources asked: ${names(providers)}`);
  report.lines.push(`  queries sent: ${planQueries(providers, parsed).map((q) => `${PROVIDER_NAMES[q.provider]}: ${q.text}`).join(" || ")}`);

  let state = searchReducer(idleSearch, {
    type: "start",
    id: 1,
    parsed,
    sent: planQueries(providers, parsed),
    order: providers.map((p) => p.id),
    skipped: [],
  });
  const strict = await searchProviders(providers, parsed, {
    limit: DEFAULT_PER_SOURCE,
    onProviderDone: (update) => {
      state = searchReducer(state, { type: "provider-done", id: 1, update });
    },
  });
  void strict;
  state = searchReducer(state, { type: "finish", id: 1, at: new Date() });
  if (state.phase === "idle") throw new Error("expected an active search");

  const view = { scoring: defaultScoringSettings(), filters: defaultFilters(), overrides: new Map(), layout: defaultLayoutSettings() };
  const rank = (s: ActiveSearch) => rankResults(s.results, view, scoringContext(s, REFERENCE_YEAR));
  let ranked = rank(state);
  report.lines.push(`  strict pass: ${describeStatuses(state)}`);

  if (hasFewFullMatches(ranked) && parsed.exact !== true && expandable(providers).length > 0) {
    const asked = expandable(providers);
    state = searchReducer(state, { type: "expand-start", id: 1, sent: planExpandedQueries(asked, parsed), order: asked.map((p) => p.id) });
    report.lines.push(`  expanded pass ran (fewer than 10 results contain every word): ${planExpandedQueries(asked, parsed).map((q) => `${PROVIDER_NAMES[q.provider]}: ${q.text}`).join(" || ")}`);
    await searchProviders(asked, parsed, {
      limit: DEFAULT_PER_SOURCE,
      expanded: true,
      onProviderDone: (update) => {
        state = searchReducer(state, { type: "expand-provider-done", id: 1, update });
      },
    });
    state = searchReducer(state, { type: "expand-finish", id: 1 });
    if (state.phase === "idle") throw new Error("expected an active search");
    ranked = rank(state);
    report.lines.push(`  expanded pass: ${state.expansion?.statuses.map((s) => `${PROVIDER_NAMES[s.provider]} ${s.state === "ok" ? s.count : s.state}`).join(" | ")}`);
  }

  const suggestion = suggestTypos(parsed, allResults(ranked).map((scored) => scored.result));
  report.suggestion = suggestion?.text ?? null;
  report.lines.push(...describeRanked(ranked, state));
  report.lines.push(`  did you mean: ${suggestion === null ? "(no suggestion)" : `${suggestion.text}   [${suggestion.changes.map((c) => `${c.from} in ${c.resultsWithFrom} results, ${c.to} in ${c.resultsWithTo}`).join("; ")}]`}`);

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
  const report: QueryReport = { text, lines: [`== ${text}`], ranked: null, search: null, suggestion: null, lookup: null, titleMatch: null };
  report.lines.push(`  detected: ${describeInput(detected)}${detected.kind === "doi" ? ` ${detected.doi}` : ""}`);
  if (detected.kind === "keywords" || detected.kind === "title") {
    report.lines.push("  (not a lookup)");
    return report;
  }
  const outcome = await lookupWork(detected, { fetch: cachedFetch() });
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
