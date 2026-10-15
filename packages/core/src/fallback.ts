import type { SearchCache } from "./cache";
import { hardBlocks, withoutBlock, type ConceptQuery } from "./concepts";
import { renderConcepts } from "./conceptquery";
import { coverageSpec, measureCoverage } from "./coverage";
import { mergeResults } from "./dedupe";
import { fallbackOrder, planQueries, searchProviders, type ProviderUpdate, type SentQuery } from "./search";
import type { Provider, ProviderStatus, Result } from "./types";

// Fallback passes. When the strict search (every concept required) finds fewer than FALLBACK_BELOW results, more
// searches are run, each with ONE concept dropped, the least specific first. How specific a concept is is judged by
// how many works the biggest index (OpenAlex) matches for it alone: the concept that matches the most works narrows
// the search least, so it is the one dropped first. The results of these passes are labelled "Matches N of M concepts"
// and never mixed in as if they matched everything.

/** Fewer full matches than this start the fallback passes. */
export const FALLBACK_BELOW = 15;
/** At most this many passes are run, one per dropped concept. */
export const MAX_FALLBACK_PASSES = 3;

/** Asks for the number of works a query matches, or null when it cannot be known. */
export type Counter = (query: string, signal?: AbortSignal) => Promise<number | null>;

/** The text that asks for one concept alone, as it is sent to a source with Boolean syntax. */
function oneConcept(query: ConceptQuery, id: string): string {
  const block = hardBlocks(query).find((candidate) => candidate.id === id);
  return block === undefined ? "" : renderConcepts({ ...query, blocks: [block], soft: [], exclusions: [] }, "boolean").text;
}

/**
 * How many works each hard concept matches on its own, by block id. A concept whose count could not be had is left
 * out. `memory` keeps answers between searches (the same concept text is asked once); the counts are small requests
 * (one work per page), so they cost little of a source's daily allowance.
 */
export async function countConcepts(
  query: ConceptQuery,
  count: Counter,
  memory: Map<string, number | null> = new Map(),
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const blocks = hardBlocks(query);
  const counts = new Map<string, number>();
  if (blocks.length < 2) return counts;
  await Promise.all(
    blocks.map(async (block) => {
      const text = oneConcept(query, block.id);
      if (text === "") return;
      let value = memory.get(text);
      if (value === undefined) {
        value = await count(text, signal);
        memory.set(text, value);
      }
      if (value !== null) counts.set(block.id, value);
    }),
  );
  return counts;
}

export interface FallbackPass {
  /** The label of the concept this pass leaves out. */
  dropped: string;
  droppedId: string;
  /** The query without it. */
  query: ConceptQuery;
}

/**
 * The passes to run, in order: one per concept, the least specific dropped first (see fallbackOrder), at most
 * MAX_FALLBACK_PASSES. A query of one concept has none, since there is nothing to drop.
 */
export function fallbackPasses(query: ConceptQuery, counts: ReadonlyMap<string, number>, max = MAX_FALLBACK_PASSES): FallbackPass[] {
  const blocks = hardBlocks(query);
  return fallbackOrder(query, counts)
    .slice(0, max)
    .map((id) => {
      const block = blocks.find((candidate) => candidate.id === id);
      return { dropped: block?.label ?? id, droppedId: id, query: withoutBlock(query, id) };
    });
}

/**
 * Whether the results so far are enough to stop widening: at least FALLBACK_BELOW distinct results match every
 * concept or all but one. Every distinct result counts here, before the page puts any in a language or type section.
 */
export function enoughResults(results: readonly Result[], query: ConceptQuery): boolean {
  const spec = coverageSpec(query);
  if (spec.blocks.length === 0) return true;
  let near = 0;
  for (const result of mergeResults(results)) {
    const coverage = measureCoverage(result, spec);
    if (coverage.matchedCount >= coverage.total - 1) near += 1;
  }
  return near >= FALLBACK_BELOW;
}

export interface FallbackRunOptions {
  limit: number;
  signal?: AbortSignal;
  cache?: SearchCache;
  timeoutMs?: number;
  /** Asks how many works a query matches (see createOpenAlexCounter). */
  count: Counter;
  /** Remembers the counts between searches. */
  memory?: Map<string, number | null>;
  /** What the strict search found, to know when there are enough results to stop. */
  have: readonly Result[];
}

export interface FallbackHooks {
  onCounts?: (counts: ReadonlyMap<string, number>) => void;
  onPassStart?: (pass: FallbackPass, sent: SentQuery[]) => void;
  onProviderDone?: (update: ProviderUpdate, pass: FallbackPass) => void;
  onPassDone?: (pass: FallbackPass, statuses: ProviderStatus[]) => void;
}

export interface FallbackReport {
  counts: Map<string, number>;
  passes: { dropped: string; sent: SentQuery[]; statuses: ProviderStatus[] }[];
  /** The results the passes found, each hit marked as found by a fallback pass. */
  results: Result[];
}

/**
 * The fallback passes of a search whose strict pass found few results: judge how specific each concept is, then
 * drop one concept at a time, the least specific first, until there are enough results or the passes run out.
 * Passes run one after the other. Nothing here changes the strict results: the caller merges the new ones in.
 */
export async function runFallback(
  providers: readonly Provider[],
  query: ConceptQuery,
  options: FallbackRunOptions,
  hooks: FallbackHooks = {},
): Promise<FallbackReport> {
  const { limit, signal, cache, timeoutMs, count, memory, have } = options;
  const counts = await countConcepts(query, count, memory, signal);
  hooks.onCounts?.(counts);
  const report: FallbackReport = { counts, passes: [], results: [] };
  for (const pass of fallbackPasses(query, counts)) {
    if (signal?.aborted === true) break;
    if (enoughResults([...have, ...report.results], query)) break;
    const sent = planQueries(providers, pass.query);
    hooks.onPassStart?.(pass, sent);
    const outcome = await searchProviders(providers, pass.query, {
      limit,
      fallback: true,
      ...(signal === undefined ? {} : { signal }),
      ...(cache === undefined ? {} : { cache }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      onProviderDone: (update) => {
        report.results.push(...update.results);
        hooks.onProviderDone?.(update, pass);
      },
    });
    report.passes.push({ dropped: pass.dropped, sent, statuses: outcome.statuses });
    hooks.onPassDone?.(pass, outcome.statuses);
  }
  return report;
}
