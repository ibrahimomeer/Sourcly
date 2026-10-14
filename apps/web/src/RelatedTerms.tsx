import type { RelatedTerm, SubjectKind } from "@sourcly/core";
import { RELATED_FROM_TOP } from "./pipeline";

const KIND_NAMES: Partial<Record<SubjectKind, string>> = {
  topic: "OpenAlex topic",
  mesh: "MeSH heading",
};

function describeKinds(kinds: readonly SubjectKind[]): string {
  return kinds.map((kind) => KIND_NAMES[kind] ?? kind).join(" and ");
}

/**
 * Terms attached to the top results, offered as buttons. Clicking one only adds it to the
 * search box. Nothing is searched, and the query is never widened, until the person presses Search.
 */
export function RelatedTerms({ terms, onAdd }: { terms: readonly RelatedTerm[]; onAdd: (term: string) => void }) {
  if (terms.length === 0) return null;

  return (
    <section className="related" aria-label="Related terms">
      <h2>Related terms</h2>
      <p className="muted">
        Topics (OpenAlex) and MeSH headings (PubMed, Europe PMC) attached to the top {RELATED_FROM_TOP} results, most common
        first. MeSH’s routine tags for species and age group (“Humans”, “Adult”) are left out because they describe
        nearly every study. Choosing a term adds it to your search box, narrowing the search to results that match it as
        well. Nothing is searched until you press Search.
      </p>
      <ul className="chips">
        {terms.map((related) => (
          <li key={related.term}>
            <button
              type="button"
              className="chip"
              title={`${describeKinds(related.kinds)} on ${related.count} of the top ${RELATED_FROM_TOP} results`}
              onClick={() => onAdd(related.term)}
            >
              {related.term} <small>{related.count}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
