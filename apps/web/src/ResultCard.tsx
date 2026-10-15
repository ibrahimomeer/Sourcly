import {
  NOTICE_LABELS,
  PROVIDER_NAMES,
  classify,
  doiUrl,
  findLexiconMatches,
  noticeKind,
  type HighlightGroup,
  type LabelOverride,
  type ScoredResult,
} from "@sourcly/core";
import { Badge, type BadgeStyle } from "./Badge";
import { LabelEditor } from "./LabelEditor";
import { LabelRows } from "./LabelRows";
import { useSaved } from "./SavedContext";
import { accessBadgeText, describeLexiconMatches, formatAuthors, formatNumber, languageBadgeText, reviewBadgeText } from "./format";
import { Highlighted } from "./Highlighted";
import { libraryUrl } from "./libraryLink";
import { WhyThisRank } from "./WhyThisRank";

export function ResultCard({
  position,
  scored,
  override,
  libraryPrefix,
  onOverrideChange,
  highlight = [],
}: {
  /** 1-based place in the current ordering. */
  position: number;
  scored: ScoredResult;
  override: LabelOverride | undefined;
  /** config.libraryProxyPrefix; empty hides the library button. */
  libraryPrefix: string;
  onOverrideChange: (resultId: string, change: LabelOverride) => void;
  /** Counterargument terms to mark in the title and abstract. Empty (the default) marks nothing. */
  highlight?: readonly string[];
}) {
  const { result, labels } = scored;
  const { openAccess, retraction } = result;
  const title = result.title === "" ? "(untitled)" : result.title;
  const libraryHref = libraryUrl(libraryPrefix, result);
  const notice = noticeKind(result);
  const reviewText = reviewBadgeText(result);
  const matches = findLexiconMatches(result, highlight);
  const coverage = scored.coverage;
  // What to mark: the words of the search that were found (lightly) and the counterargument terms (heavily).
  const groups: HighlightGroup[] = [
    { name: "query", terms: coverage?.foundTerms ?? [], query: true, exact: coverage?.exact === true },
    { name: "counter", terms: highlight },
  ];
  const saved = useSaved();
  const isSaved = saved.isSaved(result.id);
  // Borders, not color: solid = open, dashed = not open, faint dashed = not stated.
  const accessStyle: BadgeStyle =
    openAccess.isOpen === true ? "solid" : openAccess.isOpen === false ? "dashed" : "faint-dashed";

  return (
    <article className="card">
      <div className="card-head">
        <h3 className="card-title">
          <span className="position">{position}.</span>{" "}
          {result.url === null ? (
            <Highlighted text={title} groups={groups} />
          ) : (
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              <Highlighted text={title} groups={groups} />
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
        {notice !== null && (
          <li>
            <Badge style="bold" title="Recognised from the way the title begins">
              {NOTICE_LABELS[notice]}
            </Badge>
          </li>
        )}
        {reviewText !== null && (
          <li>
            <Badge style="dotted" title="The source says this is a review article">
              {reviewText}
            </Badge>
          </li>
        )}
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
        <li>
          <Badge
            style={result.language === null ? "faint-dashed" : "faint"}
            title="As reported by the sources that found this work (OpenAlex detects it from the text). “unknown” means none of them gave a language."
          >
            {languageBadgeText(result.language)}
          </Badge>
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

      {coverage !== null && coverage.total > 0 && (
        <p className="matched-terms">
          <strong>Matched:</strong>{" "}
          {coverage.units.filter((unit) => unit.matched).map((unit) => unit.found.join(" ")).join(", ") || "none of your terms"} (
          {coverage.matchedCount} of {coverage.total})
          {coverage.matchedCount < coverage.total && (
            <>
              {" "}
              · <strong>Not found:</strong> {coverage.units.filter((unit) => !unit.matched).map((unit) => unit.label).join(", ")}
            </>
          )}
        </p>
      )}

      {notice !== null && (
        <p className="warning">
          This record is a notice about another article, not research itself. Find the article it concerns and read both
          before citing either.
        </p>
      )}

      {matches.length > 0 && (
        <p className="matched">
          <strong>Counterargument terms found:</strong> {describeLexiconMatches(matches)}
        </p>
      )}

      <LabelRows labels={labels} />

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
            Access with UBC Library
          </a>
        )}
        {result.doi !== null && (
          <a className="button" href={doiUrl(result.doi)} target="_blank" rel="noopener noreferrer">
            DOI
          </a>
        )}
        <button
          type="button"
          className={isSaved ? "save-button saved-on" : "save-button"}
          aria-pressed={isSaved}
          disabled={!isSaved && !saved.canSave}
          title={!isSaved && !saved.canSave ? "The saved list is full" : undefined}
          onClick={() => saved.toggle(result)}
        >
          {isSaved ? "Saved (remove)" : "Save to list"}
        </button>
      </div>
      {libraryHref !== null && (
        <p className="muted note">Access depends on UBC Library subscriptions; you may be asked to log in.</p>
      )}

      {result.abstract !== null && (
        <details className="panel">
          <summary>Abstract</summary>
          <p>
            <Highlighted text={result.abstract} groups={groups} />
          </p>
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
