import {
  NOTICE_LABELS,
  PROVIDER_NAMES,
  classify,
  doiUrl,
  findLexiconMatches,
  languageBadge,
  languageExplanation,
  matchCountLabel,
  noticeKind,
  resolveLanguage,
  uniqueProviderHits,
  type HighlightGroup,
  type LabelOverride,
  type ScoredResult,
  type SectionId,
  type UnitMatch,
} from "@sourcly/core";
import { Badge, type BadgeStyle } from "./Badge";
import { LabelEditor } from "./LabelEditor";
import { LabelRows } from "./LabelRows";
import { useSaved } from "./SavedContext";
import { accessBadgeText, describeLexiconMatches, formatAuthors, formatNumber, reviewBadgeText } from "./format";
import { Highlighted } from "./Highlighted";
import { useLibraryName } from "./LibraryContext";
import { libraryLabel, libraryUrl } from "./libraryLink";
import { WhyThisRank } from "./WhyThisRank";

/** “odor (odour, title)”: the concept, the variant that matched, and where. */
function describeMatch(unit: UnitMatch): string {
  return `${unit.label} (${unit.variant ?? unit.label}, ${unit.fields[0] ?? ""})`;
}

export function ResultCard({
  position,
  scored,
  override,
  libraryPrefix,
  onOverrideChange,
  highlight = [],
  section,
  detailed = false,
  heading,
}: {
  /** The card of a looked-up work: no score and no "Why this rank?" (there is no search), the abstract open, and more of the record. */
  detailed?: boolean;
  /** A line above the title, such as "Closest match for this title". */
  heading?: string;
  /** 1-based place in the current ordering. */
  position: number;
  /** Where on the page this card is, for the "Why this rank?" panel and the match count. Left out for cards that are not in a search. */
  section?: SectionId;
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
  const libraryName = libraryLabel(useLibraryName());
  const notice = noticeKind(result);
  const reviewText = reviewBadgeText(result);
  const language = resolveLanguage(result);
  // In the main list, a result that lacks a concept is there only because few results have them all: say how many it has.
  const matchCount = section === "main" ? matchCountLabel(scored) : null;
  // Found only by a fallback pass (a concept dropped), and not matching every concept.
  const fallbackOnly =
    result.hits.length > 0 && result.hits.every((hit) => hit.fallback === true) && matchCountLabel(scored) !== null;
  // One badge per source, even when a source found it in both the strict pass and a fallback pass (the best rank is kept).
  const foundBy = uniqueProviderHits(result.hits);
  const matches = findLexiconMatches(result, highlight);
  const coverage = scored.coverage;
  // What to mark: the places where the concepts of the search matched (lightly; these are the same places the ranking
  // counted) and the counterargument terms (heavily).
  const spansIn = (field: "title" | "abstract") => coverage?.spans[field] ?? [];
  const titleGroups: HighlightGroup[] = [
    { name: "query", terms: [], spans: spansIn("title") },
    { name: "counter", terms: highlight },
  ];
  const abstractGroups: HighlightGroup[] = [
    { name: "query", terms: [], spans: spansIn("abstract") },
    { name: "counter", terms: highlight },
  ];
  const saved = useSaved();
  const isSaved = saved.isSaved(result.id);
  // Borders, not color: solid = open, dashed = not open, faint dashed = not stated.
  const accessStyle: BadgeStyle =
    openAccess.isOpen === true ? "solid" : openAccess.isOpen === false ? "dashed" : "faint-dashed";

  return (
    <article className={detailed ? "card card-detailed" : "card"}>
      {heading !== undefined && <p className="card-heading">{heading}</p>}
      <div className="card-head">
        <h3 className="card-title">
          {!detailed && (
            <>
              <span className="position">{position}.</span>{" "}
            </>
          )}
          {result.url === null ? (
            <Highlighted text={title} groups={titleGroups} />
          ) : (
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              <Highlighted text={title} groups={titleGroups} />
            </a>
          )}
        </h3>
        {!detailed && (
          <p className="score" title="Score from 0 to 1. Open “Why this rank?” for the breakdown.">
            Score {formatNumber(scored.score)}
          </p>
        )}
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
          <Badge style={accessStyle}>{accessBadgeText(openAccess, libraryHref !== null, libraryName)}</Badge>
        </li>
        <li>
          <Badge style={language.status === "detected" ? "faint" : "faint-dashed"} title={languageExplanation(language)}>
            {languageBadge(language)}
          </Badge>
        </li>
        {matchCount !== null && (
          <li>
            <Badge style="dotted" title="This result does not match every concept of your search. It is in the main list because few results do.">
              {matchCount}
            </Badge>
          </li>
        )}
        {fallbackOnly && (
          <li>
            <Badge style="dashed" title="Only a fallback pass of the search (one concept dropped) found this result. See “How we searched”.">
              Fallback search: not every concept matched
            </Badge>
          </li>
        )}
        {foundBy.map((hit) => (
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
          {coverage.units.filter((unit) => unit.matched).map(describeMatch).join(" · ") || "none of your concepts"} (
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
            Access with {libraryName}
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
        <p className="muted note">Access depends on {libraryName} subscriptions; you may be asked to log in.</p>
      )}

      {result.abstract !== null && (
        <details className="panel" open={detailed}>
          <summary>Abstract</summary>
          <p>
            <Highlighted text={result.abstract} groups={abstractGroups} />
          </p>
        </details>
      )}

      {!detailed && <WhyThisRank scored={scored} section={section} />}

      <LabelEditor
        resultId={result.id}
        ruleLabels={classify(result)}
        override={override}
        onChange={(change) => onOverrideChange(result.id, change)}
      />
    </article>
  );
}
