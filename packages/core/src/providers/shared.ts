import { normalizeDoi } from "../doi";
import { asInteger, asString } from "../json";
import { parseYear } from "../text";
import {
  ProviderError,
  type Author,
  type OaStatus,
  type OpenAccessInfo,
  type ProviderId,
  type Sourced,
} from "../types";

// Helpers shared by the providers added after OpenAlex: one way to make a
// request and report failure, and a few small constructors.

export type Fetch = typeof globalThis.fetch;

/** The global fetch, called as a function so `this` stays correct in browsers. */
export const defaultFetch: Fetch = (input, init) => globalThis.fetch(input, init);

export function describeNetworkFailure(name: string, cause: unknown): string {
  if (cause instanceof Error && cause.name === "AbortError") return "Search was cancelled";
  return `Could not reach ${name} (network error or request blocked)`;
}

/**
 * One plain GET (no custom headers, so the browser sends no CORS preflight).
 * Any failure becomes a ProviderError: HTTP 429 is "rate-limited", everything
 * else is "failed". The message never includes the request address.
 */
export async function requestText(
  doFetch: Fetch,
  url: URL,
  name: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  let response: Response;
  try {
    response = await doFetch(url, { signal });
  } catch (cause) {
    throw new ProviderError("failed", describeNetworkFailure(name, cause), { cause });
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new ProviderError(
      "rate-limited",
      `${name} rate limit reached (HTTP 429)${retryAfter !== null ? `; retry after ${retryAfter} s` : ""}`,
      { httpStatus: 429 },
    );
  }
  if (!response.ok) {
    throw new ProviderError("failed", `${name} answered HTTP ${response.status}`, { httpStatus: response.status });
  }
  try {
    return await response.text();
  } catch (cause) {
    throw new ProviderError("failed", `${name} response could not be read`, { cause });
  }
}

export async function requestJson(
  doFetch: Fetch,
  url: URL,
  name: string,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const text = await requestText(doFetch, url, name, signal);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ProviderError("failed", `${name} sent a response that is not valid JSON`, { cause });
  }
}

/** Clamps a requested result count into [1, max] as a whole number. */
export function clampLimit(limit: number, max: number): number {
  return Math.min(max, Math.max(1, Math.floor(limit)));
}

export function sourced<T>(value: T, provider: ProviderId, field: string): Sourced<T> {
  return { value, provider, field };
}

export function openAccess(
  isOpen: boolean | null,
  options: { status?: OaStatus; url?: string | null; pdfUrl?: string | null } = {},
): OpenAccessInfo {
  return {
    isOpen,
    status: options.status ?? "unknown",
    url: options.url ?? null,
    pdfUrl: options.pdfUrl ?? null,
  };
}

/** A person's name the way providers usually give it: "Family, Given" or just "Given Family". */
export function authorFromName(raw: string): Author | null {
  const name = asString(raw);
  if (name === null) return null;
  const comma = name.indexOf(",");
  if (comma > 0 && comma < name.length - 1) {
    const family = name.slice(0, comma).trim();
    const given = name.slice(comma + 1).trim();
    return { name: `${given} ${family}`, family, given };
  }
  return { name };
}

/** An author from separate family and given names (and/or a full name). */
export function authorFromParts(family: unknown, given: unknown, fullName?: unknown): Author | null {
  const familyName = asString(family);
  const givenName = asString(given);
  if (familyName !== null) {
    const author: Author = { name: [givenName, familyName].filter(Boolean).join(" "), family: familyName };
    if (givenName !== null) author.given = givenName;
    return author;
  }
  const full = asString(fullName) ?? givenName;
  return full === null ? null : { name: full };
}

/** DOI from a value that may be a bare DOI, a doi.org link or null. */
export function doiOf(value: unknown): string | null {
  return normalizeDoi(asString(value));
}

export { asInteger, parseYear };
