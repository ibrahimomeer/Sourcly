export interface SearchLink {
  id: "google-scholar" | "google" | "duckduckgo" | "library";
  label: string;
  url: string;
}

/**
 * Links that run the same query on other search engines, for the "Search
 * elsewhere" row. They are plain links the person opens in a new tab: Sourcly
 * sends nothing to these sites itself.
 *
 * `librarySearchUrl` is config.librarySearchUrl: the library's search address up
 * to and including the query parameter (for UBC Library: its Summon search
 * `https://ubc.summon.serialssolutions.com/search?s.q=`). When it is empty the
 * library link is left out.
 */
export function searchElsewhereLinks(query: string, librarySearchUrl: string): SearchLink[] {
  const q = encodeURIComponent(query.trim());
  if (q === "") return [];

  const links: SearchLink[] = [
    { id: "google-scholar", label: "Google Scholar", url: `https://scholar.google.com/scholar?q=${q}` },
    { id: "google", label: "Google", url: `https://www.google.com/search?q=${q}` },
    { id: "duckduckgo", label: "DuckDuckGo", url: `https://duckduckgo.com/?q=${q}` },
  ];
  const library = librarySearchUrl.trim();
  if (library !== "") links.push({ id: "library", label: "UBC Library search", url: `${library}${q}` });
  return links;
}
