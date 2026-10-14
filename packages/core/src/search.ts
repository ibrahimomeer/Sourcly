import type { SearchCache } from "./cache";
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
 * Asks every provider at the same time. One provider failing, being rate limited or
 * timing out never affects the others: it just gets a status. Each provider's answer
 * is also reported through `onProviderDone` as soon as it arrives.
 */
export async function searchProviders(
  providers: readonly Provider[],
  query: string,
  options: SearchRunOptions,
): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (trimmed === "") return { results: [], statuses: [] };
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
      const remembered = cache?.get(provider.id, trimmed, limit);
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
        const results = await askWithTimeout(provider, trimmed, limit, signal, timeoutMs);
        cache?.set(provider.id, trimmed, limit, results);
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
