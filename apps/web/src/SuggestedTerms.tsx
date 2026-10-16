import { SUGGESTION_MIN_RESULTS, SUGGESTION_POOL, type SuggestedTerm } from "@sourcly/core";

/**
 * Terms the best results use for themselves (author keywords and MeSH headings found in at least three of them),
 * offered as buttons, collapsed. Choosing one only adds it to the search box; nothing is searched until Search is pressed.
 * Rendered only when there are enough terms to be worth a line (the list is empty otherwise).
 */
export function SuggestedTerms({ terms, onAdd }: { terms: readonly SuggestedTerm[]; onAdd: (term: string) => void }) {
  if (terms.length === 0) return null;
  return (
    <details className="panel suggested-terms">
      <summary>Suggested terms ({terms.length})</summary>
      <p className="muted">
        Author keywords and MeSH headings that at least {SUGGESTION_MIN_RESULTS} of the top {SUGGESTION_POOL} results share, most
        common first. Choosing one adds it to your search box as one more concept; nothing is searched until you press Search.
      </p>
      <ul className="chips">
        {terms.map((suggestion) => (
          <li key={suggestion.term}>
            <button
              type="button"
              className="chip"
              title={`${suggestion.kinds.map((kind) => (kind === "mesh" ? "MeSH heading" : "Author keyword")).join(" and ")} on ${suggestion.count} of the top ${SUGGESTION_POOL} results`}
              onClick={() => onAdd(suggestion.term)}
            >
              {suggestion.term} <small>{suggestion.count}</small>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
