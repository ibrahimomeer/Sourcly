import { useLibraries } from "./LibraryContext";
import { searchElsewhereLinks } from "./searchLinks";

/** The same query on other search engines and in each library's own search, each opening in a new tab. Sourcly sends nothing to them. */
export function SearchElsewhere({ query }: { query: string }) {
  const links = searchElsewhereLinks(query, useLibraries());
  if (links.length === 0) return null;

  return (
    <nav className="elsewhere" aria-label="Search elsewhere">
      <span className="elsewhere-label">Search elsewhere:</span>
      {links.map((link) => (
        <a key={link.id} className="button" href={link.url} target="_blank" rel="noopener noreferrer">
          {link.label}
        </a>
      ))}
    </nav>
  );
}
