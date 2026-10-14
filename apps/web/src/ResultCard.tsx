import { PROVIDER_NAMES, classify, doiUrl, type LabelOverride, type ScoredResult } from "@sourcly/core";
import { Badge, type BadgeStyle } from "./Badge";
import { LabelEditor } from "./LabelEditor";
import { LabelRows } from "./LabelRows";
import { accessBadgeText, formatAuthors, formatNumber } from "./format";
import { libraryUrl } from "./libraryLink";
import { WhyThisRank } from "./WhyThisRank";

export function ResultCard({
  position,
  scored,
  override,
  libraryPrefix,
  onOverrideChange,
}: {
  /** 1-based place in the current ordering. */
  position: number;
  scored: ScoredResult;
  override: LabelOverride | undefined;
  /** config.libraryProxyPrefix; empty hides the library button. */
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
}) {
  const { result, labels } = scored;
  const { openAccess, retraction } = result;
  const title = result.title === "" ? "(untitled)" : result.title;
  const libraryHref = libraryUrl(libraryPrefix, result);
  // Borders, not color: solid = open, dashed = not open, faint dashed = not stated.
  const accessStyle: BadgeStyle =
    openAccess.isOpen === true ? "solid" : openAccess.isOpen === false ? "dashed" : "faint-dashed";

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
        <li>
          <Badge style={accessStyle}>{accessBadgeText(openAccess, libraryHref !== null)}</Badge>
        </li>
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

      {(openAccess.pdfUrl !== null || libraryHref !== null || result.doi !== null) && (
        <div className="actions">
          {openAccess.pdfUrl !== null && (
            <a
              className="button"
              href={openAccess.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Direct link to a free PDF, as reported by OpenAlex"
            >
              Open access PDF
            </a>
          )}
          {libraryHref !== null && (
            <a className="button" href={libraryHref} target="_blank" rel="noopener noreferrer">
              Open via UBC Library
            </a>
          )}
          {result.doi !== null && (
            <a className="button" href={doiUrl(result.doi)} target="_blank" rel="noopener noreferrer">
              DOI
            </a>
          )}
        </div>
      )}
      {libraryHref !== null && (
        <p className="muted note">Access depends on UBC Library subscriptions; you may be asked to log in.</p>
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
