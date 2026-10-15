import {
  PROVIDER_NAMES,
  describeInput,
  languageBadge,
  resolveLanguage,
  type LabelOverride,
  type Neighbours,
  type Result,
  type ScoredResult,
} from "@sourcly/core";
import { useMemo, useState } from "react";
import { Pagination } from "./Pagination";
import { paginate } from "./paginate";
import { ResultCard } from "./ResultCard";
import { scoreWithoutQuery, type ViewSettings } from "./pipeline";
import type { NeighboursState, LookupState, TitleMatchState } from "./useLookup";

const NEIGHBOUR_BUTTONS: readonly { kind: Neighbours; label: string; empty: string }[] = [
  { kind: "references", label: "Show its references", empty: "OpenAlex lists no references for this work." },
  { kind: "citing", label: "Show works citing it", empty: "OpenAlex knows no work that cites this one." },
  { kind: "related", label: "Related papers", empty: "OpenAlex lists no related works for this work." },
];

/** The record in full: what the card does not say. */
function Record({ result }: { result: Result }) {
  const place = [result.volume === null ? null : `volume ${result.volume}`, result.issue === null ? null : `issue ${result.issue}`, result.pages === null ? null : `pages ${result.pages}`].filter((part) => part !== null);
  const rows: [string, string][] = [
    ["DOI", result.doi ?? "none"],
    ["Type", `${result.type}${result.rawType === null ? "" : ` (${PROVIDER_NAMES[result.rawType.provider]} says “${result.rawType.value}”)`}`],
    ["Published in", `${result.venue ?? "venue unknown"}${place.length > 0 ? `, ${place.join(", ")}` : ""}`],
    ["Year", result.year === null ? "unknown" : String(result.year)],
    ["Language", languageBadge(resolveLanguage(result)).replace(/^Language:? ?/, "")],
    ["Citations", result.citationCount === null ? "unknown" : String(result.citationCount)],
    ["Open access", `${result.openAccess.status}${result.openAccess.url === null ? "" : `, free copy at ${result.openAccess.url}`}`],
    ["Retraction", result.retraction.retracted === null ? "not stated by any source" : result.retraction.retracted ? `retracted (${result.retraction.source ?? "source unknown"})` : "not retracted"],
    ["Author countries", result.authorCountries.length === 0 ? "not given" : result.authorCountries.join(", ")],
    ["Subjects", result.subjects.length === 0 ? "none" : [...new Set(result.subjects.map((subject) => subject.term))].slice(0, 12).join("; ")],
    ["Found by", [...new Set(result.hits.map((hit) => PROVIDER_NAMES[hit.provider]))].join(", ")],
  ];
  return (
    <details className="panel" open>
      <summary>Everything the sources say</summary>
      <dl className="record">
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function List({
  items,
  overrides,
  libraryPrefix,
  onOverrideChange,
}: {
  items: readonly ScoredResult[];
  overrides: ReadonlyMap<string, LabelOverride>;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
}) {
  const [page, setPage] = useState(1);
  const current = paginate(items, page);
  return (
    <>
      <Pagination page={current} shownOnPage={current.items.length} onPage={setPage} label="List pages (top)" />
      <ol className="result-list" start={current.offset + 1}>
        {current.items.map((scored, index) => (
          <li key={scored.result.id}>
            <ResultCard
              position={current.offset + index + 1}
              scored={scored}
              override={overrides.get(scored.result.id)}
              libraryPrefix={libraryPrefix}
              onOverrideChange={onOverrideChange}
            />
          </li>
        ))}
      </ol>
      <Pagination page={current} shownOnPage={current.items.length} onPage={setPage} label="List pages (bottom)" />
    </>
  );
}

/**
 * A DOI, link or ID that was looked up: one detailed card, then buttons for the works around it. The lists use the
 * ordinary cards, with labels and "Why this rank?"; with no search words behind them, they are ordered by the weighted score.
 */
export function LookupPanel({
  lookup,
  neighbours,
  onLoad,
  view,
  referenceYear,
  libraryPrefix,
  onOverrideChange,
}: {
  lookup: LookupState;
  neighbours: NeighboursState;
  onLoad: (kind: Neighbours) => void;
  view: ViewSettings;
  referenceYear: number;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
}) {
  const card = useMemo(() => {
    if (lookup.phase !== "done" || lookup.outcome.result === null) return null;
    return scoreWithoutQuery([lookup.outcome.result], view, referenceYear)[0] ?? null;
  }, [lookup, view, referenceYear]);
  const items = useMemo(
    () => (neighbours.kind === null || neighbours.phase !== "done" ? [] : scoreWithoutQuery(neighbours.results, view, referenceYear)),
    [neighbours, view, referenceYear],
  );

  if (lookup.phase === "idle") return null;
  if (lookup.phase === "loading") {
    return (
      <section id="results" className="results lookup" aria-label="Lookup" aria-live="polite">
        <p>Looking up {describeInput(lookup.target)} …</p>
      </section>
    );
  }

  const { outcome } = lookup;
  const active = NEIGHBOUR_BUTTONS.find((button) => button.kind === neighbours.kind);
  return (
    <section id="results" className="results lookup" aria-label="Lookup" aria-live="polite">
      <p className="summary">
        Looked up by {describeInput(lookup.target)}
        {outcome.sources.length > 0 && ` in ${outcome.sources.join(", ")}`}. Nothing was searched for.
      </p>
      {outcome.notes.map((note) => (
        <p key={note} className="muted note">
          {note}
        </p>
      ))}
      {card === null && (
        <p className="warning">
          {lookup.target.kind === "url"
            ? "Could not identify this link. Paste the DOI or the title."
            : "No source knows this work. Check the identifier, or search for its title."}
        </p>
      )}
      {card !== null && (
        <>
          <ResultCard
            position={1}
            scored={card}
            override={view.overrides.get(card.result.id)}
            libraryPrefix={libraryPrefix}
            onOverrideChange={onOverrideChange}
            detailed
          />
          <Record result={card.result} />
          <div className="actions" role="group" aria-label="Works around this one">
            {NEIGHBOUR_BUTTONS.map((button) => (
              <button
                key={button.kind}
                type="button"
                aria-pressed={neighbours.kind === button.kind}
                disabled={outcome.openAlexId === null || (button.kind === "related" && outcome.relatedIds.length === 0)}
                onClick={() => onLoad(button.kind)}
              >
                {button.label}
              </button>
            ))}
          </div>
          {outcome.openAlexId === null && <p className="muted note">OpenAlex does not know this work, so its references, citing works and related works cannot be listed.</p>}
          {neighbours.kind !== null && neighbours.phase === "loading" && <p>Loading…</p>}
          {neighbours.kind !== null && neighbours.phase === "error" && <p className="warning">{neighbours.message}</p>}
          {neighbours.kind !== null && neighbours.phase === "done" && (
            <>
              <p className="summary">
                {neighbours.results.length === 0 ? active?.empty : `${neighbours.results.length} works from OpenAlex, most cited first and then ordered by the weighted score (no search words, so word matching does not apply).`}
              </p>
              <List items={items} overrides={view.overrides} libraryPrefix={libraryPrefix} onOverrideChange={onOverrideChange} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The best match for a long title, shown above the ordinary results. */
export function ClosestMatch({
  state,
  view,
  referenceYear,
  libraryPrefix,
  onOverrideChange,
}: {
  state: TitleMatchState;
  view: ViewSettings;
  referenceYear: number;
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
}) {
  const card = useMemo(() => {
    if (state.phase !== "done" || state.match === null) return null;
    return scoreWithoutQuery([state.match.result], view, referenceYear)[0] ?? null;
  }, [state, view, referenceYear]);
  if (state.phase === "idle") return null;
  if (state.phase === "loading") return <p className="muted">Looking for the closest match for this title…</p>;
  if (card === null) return <p className="muted">No work has a title close enough to this one to call it a match. The ordinary results follow.</p>;
  return (
    <ResultCard
      position={1}
      scored={card}
      override={view.overrides.get(card.result.id)}
      libraryPrefix={libraryPrefix}
      onOverrideChange={onOverrideChange}
      detailed
      heading={`Closest match for this title (the titles are ${Math.round((state.phase === "done" ? (state.match?.similarity ?? 0) : 0) * 100)}% alike)`}
    />
  );
}
