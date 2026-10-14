import { PROVIDER_NAMES, classify, doiUrl, type LabelOverride, type ScoredResult } from "@sourcly/core";
import { Badge } from "./Badge";
import { LabelEditor } from "./LabelEditor";
import { LabelRows } from "./LabelRows";
import { formatAuthors, formatNumber } from "./format";
import { WhyThisRank } from "./WhyThisRank";

export function ResultCard({
  position,
  scored,
  override,
  onOverrideChange,
}: {
  /** 1-based place in the current ordering. */
  position: number;
  scored: ScoredResult;
  override: LabelOverride | undefined;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
}) {
  const { result, labels } = scored;
  const { openAccess, retraction } = result;
  const title = result.title === "" ? "(untitled)" : result.title;

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">
          <span className="position">{position}.</span>{" "}
          {result.url === null ? (
            title
          ) : (
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              {title}
            </a>
          )}
        </h3>
        <p className="score" title="Score from 0 to 1. Open “Why this rank?” for the breakdown.">
          Score {formatNumber(scored.score)}
        </p>
      </div>

      <p className="meta">{formatAuthors(result.authors)}</p>
      <p className="meta">
        {result.year ?? "Year unknown"} · {result.venue ?? "Venue unknown"}
      </p>

      <ul className="badges" aria-label="Badges">
        {retraction.retracted === true && (
          <li>
            <Badge style="bold" title={retraction.source ?? undefined}>
              RETRACTED
            </Badge>
          </li>
        )}
        {openAccess.isOpen === true && (
          <li>
            <Badge style="solid">
              Open access{openAccess.status === "unknown" ? "" : ` (${openAccess.status})`}
            </Badge>
          </li>
        )}
        {openAccess.isOpen === false && (
          <li>
            <Badge style="faint">Not open access</Badge>
          </li>
        )}
        {result.hits.map((hit) => (
          <li key={hit.provider}>
            <Badge style="faint" title={`Ranked #${hit.rank} of ${hit.listSize} by ${PROVIDER_NAMES[hit.provider]}`}>
              Found by {PROVIDER_NAMES[hit.provider]}
            </Badge>
          </li>
        ))}
      </ul>

      {retraction.retracted === true && (
        <p className="warning">
          This work is marked as retracted ({retraction.source ?? "source unknown"}). Read the retraction notice before
          citing it.
        </p>
      )}

      <LabelRows labels={labels} />

      {result.doi !== null && (
        <div className="actions">
          <a className="button" href={doiUrl(result.doi)} target="_blank" rel="noopener noreferrer">
            DOI
          </a>
        </div>
      )}

      {result.abstract !== null && (
        <details className="panel">
          <summary>Abstract</summary>
          <p>{result.abstract}</p>
        </details>
      )}

      <WhyThisRank scored={scored} />

      <LabelEditor
        resultId={result.id}
        ruleLabels={classify(result)}
        override={override}
        onChange={(change) => onOverrideChange(result.id, change)}
      />
    </article>
  );
}
