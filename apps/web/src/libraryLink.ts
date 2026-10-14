import { doiUrl, type Result } from "@sourcly/core";

// "Open via UBC Library" links are  prefix + encoded address  (config.libraryProxyPrefix).
//
// The address is percent-encoded as one value, the way any web address is passed
// inside a link's query string. UBC Library's OpenAthens redirector accepts it for
// both landing pages and doi.org links (confirmed for a ScienceDirect book chapter),
// and encoding keeps "&", "?" and "#" inside the address from being read as part of
// the link. See docs/methodology.md.

/** Pages that describe a work rather than hold it; a library cannot open these for you. */
const RECORD_PAGE_HOSTS = ["openalex.org"];

function isUsableLandingPage(address: string): boolean {
  if (!/^https?:\/\//i.test(address)) return false;
  try {
    const host = new URL(address).hostname.toLowerCase();
    return !RECORD_PAGE_HOSTS.some((record) => host === record || host.endsWith(`.${record}`));
  } catch {
    return false;
  }
}

/**
 * The address the library should open: the publisher's landing page when the
 * result has one, otherwise the DOI link. Null when it has neither.
 */
export function libraryTarget(result: Pick<Result, "doi" | "url">): string | null {
  if (result.url !== null && isUsableLandingPage(result.url)) return result.url;
  return result.doi !== null ? doiUrl(result.doi) : null;
}

/**
 * The "Open via UBC Library" link, or null when the prefix is empty (the button
 * is then hidden) or the result has no address to open.
 */
export function libraryUrl(prefix: string, result: Pick<Result, "doi" | "url">): string | null {
  const trimmed = prefix.trim();
  if (trimmed === "") return null;
  const target = libraryTarget(result);
  return target === null ? null : trimmed + encodeURIComponent(target);
}
