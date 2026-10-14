import type { SearchCache } from "./cache";
import { isUsable, parseQuery, renderQuery, type ParsedQuery } from "./query";
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
  providers: readonly Pick<Provider, "id" | "syntax">[],
  query: string | ParsedQuery,
): SentQuery[] {
  const parsed = typeof query === "string" ? parseQuery(query) : query;
  return providers.map((provider) => ({ provider: provider.id, ...renderQuery(parsed, provider.syntax) }));
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
 * `query` may be the text a person typed or an already parsed query. A query with nothing
 * searchable in it (only common words, say) asks no provider anything.
 */
export async function searchProviders(
  providers: readonly Provider[],
  query: string | ParsedQuery,
  options: SearchRunOptions,
): Promise<SearchOutcome> {
  const parsed = typeof query === "string" ? parseQuery(query.trim()) : query;
  if (!isUsable(parsed)) return { results: [], statuses: [] };
  const { limit, signal, cache, onProviderDone, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const notify = (update: ProviderUpdate) => {
    try {
      onProviderDone?.(update);
    } catch {
      // A faulty listener must never break the search itself.
    }
  };

  const answers = await Promise.all(
    providers.map(async (provider): Promise<ProviderUpdate> => {
      const sent = renderQuery(parsed, provider.syntax).text;
      if (sent === "") {
        const update: ProviderUpdate = {
          provider: provider.id,
          status: { provider: provider.id, state: "skipped", message: `Nothing in the query could be sent to ${provider.name}` },
          results: [],
        };
        notify(update);
        return update;
      }

      const remembered = cache?.get(provider.id, sent, limit);
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
        const results = await askWithTimeout(provider, sent, limit, signal, timeoutMs);
        cache?.set(provider.id, sent, limit, results);
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
    return { provider: provider.id, state: error.kind, message: error.message };
  }
  const detail = error instanceof Error ? error.message : String(error);
  return { provider: provider.id, state: "failed", message: `${provider.name} failed unexpectedly: ${detail}` };
}
