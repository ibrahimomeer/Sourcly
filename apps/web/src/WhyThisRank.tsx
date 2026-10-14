import type { ScoredResult } from "@sourcly/core";
import { formatNumber, formatRaw } from "./format";

/** Every ranking decision, factor by factor, so the order can be checked by hand. */
export function WhyThisRank({ scored }: { scored: ScoredResult }) {
  return (
    <details className="panel why">
      <summary>Why this rank?</summary>
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
        Relevance is BM25 over the title, abstract and subject terms of all the results fetched for this search, divided by
        the best score among them (in the counterarguments panel it is multiplied by a second reading, of the terms). Provider agreement is how many of the sources that answered returned this result.
        Equal scores are ordered by DOI. Level and peer-review values come from the labels shown on this card, including
        any change you made.
      </p>
    </details>
  );
}
