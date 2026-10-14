import type { ProviderId, Result } from "./types";

/**
 * Remembers each provider's answer for the rest of the visit, so searching the
 * same words again does not spend a provider's rate limit twice. It lives in
 * memory only: nothing is written to storage, and closing the page clears it.
 */
export interface SearchCache {
  get(provider: ProviderId, query: string, limit: number): Result[] | undefined;
  set(provider: ProviderId, query: string, limit: number, results: Result[]): void;
  clear(): void;
  readonly size: number;
}

export function createSearchCache(): SearchCache {
  const entries = new Map<string, Result[]>();
  const keyOf = (provider: ProviderId, query: string, limit: number) => `${provider}\u0000${limit}\u0000${query.trim()}`;

  return {
    get: (provider, query, limit) => entries.get(keyOf(provider, query, limit)),
    set: (provider, query, limit, results) => void entries.set(keyOf(provider, query, limit), results),
    clear: () => entries.clear(),
    get size() {
      return entries.size;
    },
  };
}
