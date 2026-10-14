import { ProviderError, type Provider, type ProviderStatus, type Result, type SearchOptions } from "./types";

export interface SearchOutcome {
  /** Results from every provider that answered, in provider order (not yet de-duplicated). */
  results: Result[];
  /** One entry per provider asked, in the same order as `providers`. */
  statuses: ProviderStatus[];
}

/**
 * Asks every provider at the same time. One provider failing, being rate
 * limited or timing out never affects the others: it just gets a status.
 */
export async function searchProviders(
  providers: readonly Provider[],
  query: string,
  options: SearchOptions,
): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (trimmed === "") return { results: [], statuses: [] };

  const answers = await Promise.all(
    providers.map(async (provider): Promise<{ status: ProviderStatus; results: Result[] }> => {
      try {
        const results = await provider.search(trimmed, options);
        return { status: { provider: provider.id, state: "ok", count: results.length }, results };
      } catch (error) {
        return { status: failureStatus(provider, error), results: [] };
      }
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
