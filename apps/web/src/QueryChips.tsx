import { Fragment } from "react";
import type { ChipTree, QueryChipsModel } from "./chipsModel";

function Term({
  node,
  onExclude,
  negated,
}: {
  node: Extract<ChipTree, { kind: "term" }>;
  onExclude: (key: string) => void;
  negated: boolean;
}) {
  const label = node.phrase ? `“${node.text}”` : node.text;
  return (
    <button
      type="button"
      className="chip"
      aria-label={`${negated ? "Stop leaving out" : "Leave out"} ${label}`}
      title={negated ? "Click to take this word out of the search" : "Click to leave this word out of the search"}
      onClick={() => onExclude(node.key)}
    >
      {label}
    </button>
  );
}

function Tree({ node, onExclude, negated = false, nested = false }: { node: ChipTree; onExclude: (key: string) => void; negated?: boolean; nested?: boolean }) {
  switch (node.kind) {
    case "term":
      return <Term node={node} onExclude={onExclude} negated={negated} />;
    case "not":
      return (
        <>
          <span className="chip-op">NOT</span> <Tree node={node.item} onExclude={onExclude} negated nested />
        </>
      );
    case "or":
    case "and": {
      const wrap = nested;
      return (
        <>
          {wrap && <span className="chip-op">(</span>}
          {node.items.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && node.kind === "or" && <span className="chip-op"> OR </span>}
              <Tree node={item} onExclude={onExclude} negated={negated} nested={node.kind === "or" || item.kind === "or"} />{" "}
            </Fragment>
          ))}
          {wrap && <span className="chip-op">)</span>}
        </>
      );
    }
  }
}

/**
 * Under the search box: what the text is going to search for (click a word to leave it out), the common
 * words that were not used (click a dashed word to use it) and any term the person left out. The text
 * in the box is never changed by these.
 */
export function QueryChips({
  model,
  onExclude,
  onRestoreCommon,
  onRestoreLeftOut,
  needsSearch,
}: {
  model: QueryChipsModel;
  onExclude: (key: string) => void;
  onRestoreCommon: (word: string) => void;
  onRestoreLeftOut: (key: string) => void;
  /** The terms changed since the last search; the results are for the earlier terms. */
  needsSearch: boolean;
}) {
  return (
    <div className="query-chips" aria-label="How your search is read">
      <p className="chips-line">
        <span className="chips-label">Searching for:</span>{" "}
        {model.terms === null ? (
          <span className="muted">nothing yet</span>
        ) : (
          <Tree node={model.terms} onExclude={onExclude} />
        )}
      </p>

      {model.ignored.length > 0 && (
        <p className="chips-line">
          <span className="chips-label">Ignored common words:</span>{" "}
          {model.ignored.map((word) => (
            <Fragment key={word}>
              <button
                type="button"
                className="chip chip-dashed"
                aria-label={`Use the word ${word} in the search`}
                title="Click to use this word in the search"
                onClick={() => onRestoreCommon(word)}
              >
                {word}
              </button>{" "}
            </Fragment>
          ))}
        </p>
      )}

      {model.leftOut.length > 0 && (
        <p className="chips-line">
          <span className="chips-label">Left out by you:</span>{" "}
          {model.leftOut.map((term) => (
            <Fragment key={term.key}>
              <button
                type="button"
                className="chip chip-dashed"
                aria-label={`Use ${term.text} in the search again`}
                title="Click to use this term in the search again"
                onClick={() => onRestoreLeftOut(term.key)}
              >
                {term.text}
              </button>{" "}
            </Fragment>
          ))}
        </p>
      )}

      {model.questionNote !== null && <p className="muted chips-note">{model.questionNote}</p>}
      {needsSearch && <p className="muted chips-note">The words above have changed since the last search. Press Search to use them.</p>}
    </div>
  );
}
