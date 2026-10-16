import { languageExplanation, resolveLanguage, type Coverage, type ScoredResult, type SectionId } from "@sourcly/core";
import { formatNumber, formatRaw } from "./format";

const TIER_TEXT = { 1: "every concept", 2: "most of the concepts", 3: "few of the concepts" } as const;

const SECTION_TEXT: Record<SectionId, string> = {
  main: "the main list",
  partial: "Partial matches: it lacks more than one of your concepts",
  otherLanguages: "Other languages: it is not in one of your preferred languages",
  otherTypes: "Datasets, presentations and other types: it is not an article, or only a repository holds it",
};

/** For every concept: what matched, where, and about 80 characters of the text around it, so each match can be checked by eye. */
function Matches({ coverage }: { coverage: Coverage }) {
  return (
    <div className="match-snippets">
      <p>
        <strong>Where each concept matched.</strong> Whole words or phrases only, in the title, the author keywords or the abstract.
      </p>
      <ul>
        {coverage.units.map((unit) => (
          <li key={unit.label}>
            <strong>{unit.label}</strong>
            {unit.matched && unit.snippet !== null ? (
              <>
                {" "}
                as “{unit.variant}”{unit.fromThesaurus ? " (from the thesaurus)" : ""}, in the {unit.snippet.field === "keywords" ? "author keywords" : unit.snippet.field}:{" "}
                <span className="snippet">
                  {unit.snippet.before}
                  <mark className="mark-query">{unit.snippet.match}</mark>
                  {unit.snippet.after}
                </span>
                {unit.found.length > 1 && <small className="muted"> Also found as: {unit.found.filter((text) => text !== unit.variant).join(", ")}.</small>}
              </>
            ) : (
              <span className="muted"> not found</span>
            )}
          </li>
        ))}
      </ul>
      {coverage.soft.length > 0 && (
        <p className="muted">
          Generic words it contains (small boost, never required): {coverage.soft.map((term) => `${term.text} ×${term.count}`).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** Where the result sits and the three things that put it there, before the score is used. Empty when it is not in a search. */
function Placement({ scored, section }: { scored: ScoredResult; section: SectionId | undefined }) {
  const coverage = scored.coverage;
  const language = resolveLanguage(scored.result);
  return (
    <div className="placement">
      <p>
        <strong>Placement.</strong> {section !== undefined && <>It is in {SECTION_TEXT[section]}. </>}Results are ordered by three
        things, in this order: how many of your concepts they match, whether neighbouring concepts appear next to each other, in
        order, and then the score below.
      </p>
      <ol>
        <li>
          <strong>Coverage tier {coverage === null ? "1" : scored.tier}</strong>
          {coverage === null || coverage.total === 0
            ? ": the search has no concepts to look for."
            : `: contains ${TIER_TEXT[scored.tier]} (${coverage.matchedCount} of ${coverage.total}).`}
        </li>
        <li>
          <strong>Phrase match {coverage?.phraseScore === null || coverage === null ? "none" : formatNumber(coverage.phraseScore)}</strong>
          {coverage === null || coverage.phraseScore === null
            ? ": the search has no two neighbouring concepts."
            : `: ${coverage.pairs.filter((pair) => pair.found !== null).length} of ${coverage.pairs.length} neighbouring pairs are adjacent (in the title 1, in the abstract 0.7).`}
        </li>
        <li>
          <strong>Score {formatNumber(scored.score, 3)}</strong>: the table below.
        </li>
      </ol>
      {coverage !== null && coverage.total > 0 && <Matches coverage={coverage} />}
      <p className="muted">
        Type: {scored.result.type}
        {scored.result.rawType !== null ? ` (the source says “${scored.result.rawType.value}”)` : ""}. Language: {languageExplanation(language)}
      </p>
    </div>
  );
}

/** Every ranking decision, factor by factor, so the order can be checked by hand. */
export function WhyThisRank({ scored, section }: { scored: ScoredResult; section?: SectionId | undefined }) {
  return (
    <details className="panel why">
      <summary>Why this rank?</summary>
      <Placement scored={scored} section={section} />
      <p>
        Score = sum of (weight × normalized value) ÷ sum of the weights of the factors that are on. Every normalized
        value is between 0 and 1.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Factor</th>
              <th scope="col">Raw value</th>
              <th scope="col">Normalized</th>
              <th scope="col">Weight</th>
              <th scope="col">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {scored.factors.map((factor) => (
              <tr key={factor.factor} className={factor.enabled ? undefined : "row-off"}>
                <th scope="row">
                  {factor.label}
                  {factor.enabled ? "" : " (off)"}
                  <small>{factor.detail}</small>
                </th>
                <td>{formatRaw(factor.raw)}</td>
                <td>{formatNumber(factor.normalized)}</td>
                <td>{factor.enabled ? factor.weight : "off"}</td>
                <td>{formatNumber(factor.contribution, 3)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4}>
                Score (the contributions added up)
              </th>
              <td>{formatNumber(scored.score, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted">
        Relevance is BM25 over the title, abstract and author keywords of all the results fetched for this search (each concept
        of your search weighs 1.0, each generic word 0.3), divided by the best score among them (in the counterarguments panel it is multiplied by a second reading, of the terms). Provider agreement is how many of the sources that answered returned this result.
        Equal scores are ordered by DOI. Level and peer-review values come from the labels shown on this card, including
        any change you made.
      </p>
    </details>
  );
}
