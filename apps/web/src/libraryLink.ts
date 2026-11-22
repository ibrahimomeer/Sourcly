import { doiUrl, type Result } from "@sourcly/core";
import type { LibraryLink } from "./config";

// "Access with <library>" links are  prefix + encoded address  (each library's proxyPrefix).
//
// The address is percent-encoded as one value, the way any web address is passed
// inside a link's query string. UBC Library's OpenAthens redirector accepts it for
// both landing pages and doi.org links (confirmed for a ScienceDirect book chapter),
// and University of Toronto Libraries' proxy takes it in its `qurl` form. Encoding keeps "&", "?" and "#"
// inside the address from being read as part of the link. See docs/methodology.md.

/** Pages that describe a work rather than hold it; a library cannot open these for you. */
const RECORD_PAGE_HOSTS = ["openalex.org", "pubmed.ncbi.nlm.nih.gov", "europepmc.org", "semanticscholar.org"];

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
 * The "Access with <library>" link, or null when the prefix is empty (the button
 * is then hidden) or the result has no address to open.
 */
export function libraryUrl(prefix: string, result: Pick<Result, "doi" | "url">): string | null {
  const trimmed = prefix.trim();
  if (trimmed === "") return null;
  const target = libraryTarget(result);
  return target === null ? null : trimmed + encodeURIComponent(target);
}

/** The library's name for a label: the name as set, or "your library" when there is none. */
export function libraryLabel(libraryName: string): string {
  const name = libraryName.trim();
  return name === "" ? "your library" : name;
}

/** A library's link for one result. */
export interface LibraryAccess {
  name: string;
  url: string;
}

/** The "Access with ..." links a result gets: one for each library whose link prefix is not empty, in the order of the libraries. */
export function libraryLinks(libraries: readonly Pick<LibraryLink, "name" | "proxyPrefix">[], result: Pick<Result, "doi" | "url">): LibraryAccess[] {
  const links: LibraryAccess[] = [];
  for (const library of libraries) {
    const url = libraryUrl(library.proxyPrefix, result);
    if (url !== null) links.push({ name: libraryLabel(library.name), url });
  }
  return links;
}

/** "A", "A or B", "A, B or C" (with `word` "and": "A and B"); each name once, empty ones left out. */
export function joinNames(names: readonly string[], word: "or" | "and" = "or"): string {
  const unique = names.filter((name, index) => name !== "" && names.indexOf(name) === index);
  if (unique.length <= 1) return unique.join("");
  return `${unique.slice(0, -1).join(", ")} ${word} ${unique[unique.length - 1]}`;
}
