import type { LabelOverride, ScoredResult, SectionId } from "@sourcly/core";
import { useState } from "react";
import type { RankedView } from "./pipeline";
import { Pagination } from "./Pagination";
import { paginate } from "./paginate";
import { ResultCard } from "./ResultCard";

interface SectionProps {
  id: SectionId;
  title: string;
  description: string;
  items: readonly ScoredResult[];
  overrides: ReadonlyMap<string, LabelOverride>;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  /** Counterargument terms to mark, in the counterargument panel. */
  highlight?: readonly string[];
}

/** One collapsed section under the main list. Nothing in it is deleted: it has the same cards, a count and its own pages. */
function Section({ id, title, description, items, overrides, libraryPrefix, onOverrideChange, highlight }: SectionProps) {
  const [page, setPage] = useState(1);
  if (items.length === 0) return null;
  const current = paginate(items, page);

  return (
    <details className="panel partial">
      <summary>
        {title} ({items.length})
      </summary>
      <p className="muted">{description}</p>
      <Pagination page={current} shownOnPage={current.items.length} onPage={setPage} label={`${title} pages (top)`} />
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
              section={id}
            />
          </li>
        ))}
      </ol>
      <Pagination page={current} shownOnPage={current.items.length} onPage={setPage} label={`${title} pages (bottom)`} />
    </details>
  );
}

/**
 * The three collapsed sections under the main list: partial matches, other languages, and datasets and other types.
 * Results are kept here, never removed, and every card says what it matched.
 */
export function ResultSections({
  ranked,
  overrides,
  libraryPrefix,
  onOverrideChange,
  highlight,
}: {
  ranked: RankedView;
  overrides: ReadonlyMap<string, LabelOverride>;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  highlight?: readonly string[];
}) {
  const common = { overrides, libraryPrefix, onOverrideChange, highlight };
  return (
    <>
      <Section
        id="partial"
        title="Partial matches"
        description="These results lack more than one of your words or phrases. They are kept apart from the list above, not removed, and each one says what it matched."
        items={ranked.partial}
        {...common}
      />
      <Section
        id="otherLanguages"
        title="Other languages"
        description="These results are in a language that is not one of your preferred languages (see Settings). The language is detected from the title and abstract, so it can be wrong; each card says how it was found."
        items={ranked.otherLanguages}
        {...common}
      />
      <Section
        id="otherTypes"
        title="Datasets, presentations and other types"
        description="Datasets, theses, reports, presentations and other items that are not articles, and works that only Zenodo or DataCite hold. Turn on “Show non-article types in the main list” in Settings to move them up."
        items={ranked.otherTypes}
        {...common}
      />
    </>
  );
}
