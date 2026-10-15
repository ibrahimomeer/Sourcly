import type { LabelOverride, ScoredResult } from "@sourcly/core";
import { useState } from "react";
import { Pagination } from "./Pagination";
import { paginate } from "./paginate";
import { ResultCard } from "./ResultCard";

/**
 * Results that lack some of the search's terms. They are kept here, collapsed, instead of in the main list.
 * Nothing is deleted: each card says what it matched and what it did not.
 */
export function PartialMatches({
  items,
  overrides,
  libraryPrefix,
  onOverrideChange,
  highlight,
}: {
  items: readonly ScoredResult[];
  overrides: ReadonlyMap<string, LabelOverride>;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  /** Counterargument terms to mark, in the counterargument panel. */
  highlight?: readonly string[];
}) {
  const [page, setPage] = useState(1);
  if (items.length === 0) return null;
  const current = paginate(items, page);

  return (
    <details className="panel partial">
      <summary>Partial matches ({items.length})</summary>
      <p className="muted">
        These results do not contain every word or phrase of your search. They are kept apart from the list above, not
        removed, and each one says what it matched. Change “Term matching” in Settings to mix them into the list.
      </p>
      <Pagination page={current} shownOnPage={current.items.length} onPage={setPage} label="Partial matches pages (top)" />
      <ol className="result-list" start={current.offset + 1}>
        {current.items.map((scored, index) => (
          <li key={scored.result.id}>
            <ResultCard
              position={current.offset + index + 1}
              scored={scored}
              override={overrides.get(scored.result.id)}
              libraryPrefix={libraryPrefix}
              onOverrideChange={onOverrideChange}
              highlight={highlight}
            />
          </li>
        ))}
      </ol>
      <Pagination page={current} shownOnPage={current.items.length} onPage={setPage} label="Partial matches pages (bottom)" />
    </details>
  );
}
