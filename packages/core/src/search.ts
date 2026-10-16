import type { SearchCache } from "./cache";
import { hardBlocks, isUsableConcepts, type ConceptQuery } from "./concepts";
import { renderConcepts, toConcepts } from "./conceptquery";
import type { ParsedQuery } from "./query";
import {
  ProviderError,
  type Provider,
  type ProviderId,
  type ProviderStatus,
  type Result,
  type SearchOptions,
} from "./types";

/** How long each provider gets before it is given up on. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** One provider's finished answer, delivered as soon as it is ready. */
export interface ProviderUpdate {
  provider: ProviderId;
  status: ProviderStatus;
  results: Result[];
}

/** The query as written for one provider: exactly what is sent to it. */
export interface SentQuery {
  provider: ProviderId;
  text: string;
  /** What this provider could not apply from the query, in plain language. */
  notes: string[];
}

export interface SearchRunOptions extends SearchOptions {
  /** This is a fallback pass (a concept dropped): every hit of every result is marked as found by it. */
  fallback?: boolean;
  /** Per-provider time limit in milliseconds. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** When given, successful answers are remembered and reused for the same query and limit. */
  cache?: SearchCache;
  /** Called once per provider the moment it finishes, so results can be shown progressively. */
  onProviderDone?: (update: ProviderUpdate) => void;
}

export interface SearchOutcome {
  /** Results from every provider that answered, in provider order (not yet de-duplicated). */
  results: Result[];
  /** One entry per provider asked, in the same order as `providers`. */
  statuses: ProviderStatus[];
}

/**
 * Writes the query for each provider's syntax. This is the single place where a query
 * becomes the text a provider receives, so what the page shows is what is sent.
 */
export function planQueries(
  providers: readonly Pick<Provider, "id" | "syntax" | "requestNotes">[],
  query: string | ParsedQuery | ConceptQuery,
): SentQuery[] {
  const concepts = toConcepts(query);
  return providers.map((provider) => {
    const rendered = renderConcepts(concepts, provider.syntax);
    return { provider: provider.id, text: rendered.text, notes: [...rendered.notes, ...(provider.requestNotes ?? [])] };
  });
}

/**
 * The order in which a fallback pass drops concepts: the least specific first, judged by how many works each
 * concept matches on its own (`counts`, by block id): the concept with the most matches narrows the search least,
 * so dropping it widens the search least harmfully. A concept with no count is tried last. Needs two or more concepts.
 */
export function fallbackOrder(query: ConceptQuery, counts: ReadonlyMap<string, number>): string[] {
  const hard = hardBlocks(query);
  if (hard.length < 2) return [];
  return hard
    .map((block, index) => ({ id: block.id, count: counts.get(block.id) ?? -1, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((entry) => entry.id);
}

/**
 * Asks one provider, giving up after `timeoutMs` even if the provider ignores the
 * cancellation signal. A user's own cancellation passes straight through.
 */
async function askWithTimeout(
  provider: Provider,
  query: string,
  limit: number,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Result[]> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted === true) cancel();
  signal?.addEventListener("abort", cancel, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderError("failed", `${provider.name} did not answer within ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([provider.search(query, { limit, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/**
 * Asks every provider at the same time, each in its own syntax. One provider failing, being
 * rate limited or timing out never affects the others: it just gets a status. Each provider's
 * answer is also reported through `onProviderDone` as soon as it arrives.
 *
 * `query` may be the text a person typed, a parsed query or the concept blocks. A query with nothing
 * searchable in it (only common words, say) asks no provider anything.
 */
export async function searchProviders(
  providers: readonly Provider[],
  query: string | ParsedQuery | ConceptQuery,
  options: SearchRunOptions,
): Promise<SearchOutcome> {
  const concepts = toConcepts(query);
  if (!isUsableConcepts(concepts)) return { results: [], statuses: [] };
  const { limit, signal, cache, onProviderDone, timeoutMs = DEFAULT_TIMEOUT_MS, fallback = false } = options;
  const asked = providers;

  const notify = (update: ProviderUpdate) => {
    try {
      onProviderDone?.(update);
    } catch {
      // A faulty listener must never break the search itself.
    }
  };

  const answers = await Promise.all(
    asked.map(async (provider): Promise<ProviderUpdate> => {
      const sent = renderConcepts(concepts, provider.syntax).text;
      const memory = sent;
      if (sent === "") {
        const update: ProviderUpdate = {
          provider: provider.id,
          status: { provider: provider.id, state: "skipped", message: `Nothing in the query could be sent to ${provider.name}` },
          results: [],
        };
        notify(update);
        return update;
      }

      const remembered = cache?.get(provider.id, memory, limit);
      if (remembered !== undefined) {
        const update: ProviderUpdate = {
          provider: provider.id,
          status: { provider: provider.id, state: "ok", count: remembered.length, cached: true },
          results: remembered,
        };
        notify(update);
        return update;
      }

      let update: ProviderUpdate;
      try {
        const found = await askWithTimeout(provider, sent, limit, signal, timeoutMs);
        const results = fallback ? found.map((result) => ({ ...result, hits: result.hits.map((hit) => ({ ...hit, fallback: true as const })) })) : found;
        cache?.set(provider.id, memory, limit, results);
        update = { provider: provider.id, status: { provider: provider.id, state: "ok", count: results.length }, results };
      } catch (error) {
        update = { provider: provider.id, status: failureStatus(provider, error), results: [] };
      }
      notify(update);
      return update;
    }),
  );

  return {
    results: answers.flatMap((answer) => answer.results),
    statuses: answers.map((answer) => answer.status),
  };
}

function failureStatus(provider: Provider, error: unknown): ProviderStatus {
  if (error instanceof ProviderError) {
    const network = error.kind === "failed" && error.cause instanceof TypeError;
    return { provider: provider.id, state: error.kind, message: error.message, ...(network ? { network: true as const } : {}) };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { provider: provider.id, state: "failed", message: `${provider.name} failed unexpectedly: ${detail}` };
}
