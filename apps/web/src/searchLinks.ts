import type { LibraryLink } from "./config";
import { libraryLabel } from "./libraryLink";

export interface SearchLink {
  id: "google-scholar" | "google" | "duckduckgo" | `library-${number}`;
  label: string;
  url: string;
}

/**
 * Links that run the same query on other search engines, for the "Search
 * elsewhere" row. They are plain links the person opens in a new tab: Sourcly
 * sends nothing to these sites itself.
 *
 * Each library's `searchUrl` is its search address up to and including the query parameter (for UBC Library: its Summon
 * search `https://ubc.summon.serialssolutions.com/search?s.q=`). A library whose address is empty has no link.
 */
export function searchElsewhereLinks(query: string, libraries: readonly Pick<LibraryLink, "name" | "searchUrl">[] = []): SearchLink[] {
  const q = encodeURIComponent(query.trim());
  if (q === "") return [];

  const links: SearchLink[] = [
    { id: "google-scholar", label: "Google Scholar", url: `https://scholar.google.com/scholar?q=${q}` },
    { id: "google", label: "Google", url: `https://www.google.com/search?q=${q}` },
    { id: "duckduckgo", label: "DuckDuckGo", url: `https://duckduckgo.com/?q=${q}` },
  ];
  libraries.forEach((library, index) => {
    const address = library.searchUrl.trim();
    if (address !== "") links.push({ id: `library-${index}`, label: `${libraryLabel(library.name)} search`, url: `${address}${q}` });
  });
  return links;
}
