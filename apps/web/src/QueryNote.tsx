import { FALLBACK_BELOW, PROVIDER_NAMES, hardBlocks, type SentQuery, type Variant } from "@sourcly/core";
import type { ActiveSearch } from "./searchState";

/** The exact text each source received, and what it could not apply, so nothing about the query is hidden. */
export function SentQueries({ sent, title, intro }: { sent: readonly SentQuery[]; title?: string; intro?: string }) {
  return (
    <div className="sent-queries">
      {title !== undefined && <h4>{title}</h4>}
      {intro !== undefined && <p className="muted">{intro}</p>}
      <ul>
        {sent.map((entry) => (
          <li key={entry.provider}>
            <strong>{PROVIDER_NAMES[entry.provider]}:</strong>{" "}
            {entry.text === "" ? <span className="muted">nothing could be sent</span> : <code>{entry.text}</code>}
            {entry.notes.map((note) => (
              <small key={note} className="sent-note">
                {note}
              </small>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TYPE_NAMES = { spelling: "spelling", abbreviation: "abbreviation", synonym: "synonym" } as const;

function VariantItem({ variant }: { variant: Variant }) {
  if (variant.origin === "typed") return <>{variant.text}</>;
  const kind = variant.entryType === undefined ? "thesaurus" : TYPE_NAMES[variant.entryType];
  return (
    <span title={variant.note}>
      {variant.text} <small className="muted">(thesaurus: {kind})</small>
    </span>
  );
}

/**
 * How the text was read and what was done with it, collapsed: the concepts and their variants (and which came from the
 * thesaurus), the words treated as filler or as generic, the exact query each source received, and whether a fallback ran.
 */
export function QueryNote({ search }: { search: ActiveSearch }) {
  const { concepts } = search;
  const blocks = hardBlocks(concepts);
  const fallback = search.fallback;

  return (
    <details className="panel query-note">
      <summary>How we searched</summary>

      {concepts.exact ? (
        <p>
          Searched exactly as typed: <strong>{concepts.original}</strong>. Nothing was removed, no alternative was added and no
          operator was written for you.
        </p>
      ) : (
        <>
          <p className="muted">
            Your text was read as concepts. A result has to match every concept, by any of its variants, as a whole word or
            phrase in the title, abstract or author keywords.
          </p>
          <ol className="concepts">
            {blocks.map((block) => (
              <li key={block.id}>
                <strong>{block.label}</strong>
                {block.quoted && <small className="muted"> (kept exactly: quoted)</small>}
                {block.variants.length > 1 ? (
                  <>
                    {": "}
                    {block.variants.map((variant, index) => (
                      <span key={variant.text + variant.origin}>
                        {index > 0 && " · "}
                        <VariantItem variant={variant} />
                      </span>
                    ))}
                  </>
                ) : block.variants[0]?.caseSensitive === true ? (
                  <small className="muted"> (abbreviation: matched with its capitals, as a whole word)</small>
                ) : null}
              </li>
            ))}
          </ol>
          {concepts.promotedSoft && (
            <p className="muted">There was no specific word in the search, so its generic words were all treated as required.</p>
          )}
          {concepts.stopwords.length > 0 && (
            <p>
              <strong>Left out as common words:</strong> {[...new Set(concepts.stopwords)].join(", ")}.
            </p>
          )}
          {concepts.soft.length > 0 && !concepts.promotedSoft && (
            <p>
              <strong>Generic words, not required:</strong> {concepts.soft.map((term) => term.text).join(", ")}. A result that
              has them gets a small boost; one without them is not penalised.
            </p>
          )}
          {concepts.exclusions.length > 0 && (
            <p>
              <strong>Left out on purpose (NOT):</strong> {concepts.exclusions.map((variant) => variant.text).join(", ")}.
            </p>
          )}
        </>
      )}

      <SentQueries
        sent={search.sent}
        title="Query sent to each source"
        intro="Sources read queries differently, so each one gets the same concepts written the way it understands. This is the exact text each source received."
      />

      {fallback === null ? (
        !concepts.exact && blocks.length >= 2 && <p className="muted">No fallback search ran.</p>
      ) : (
        <div className="fallback-note">
          <p>
            <strong>A fallback search ran</strong>, because fewer than {FALLBACK_BELOW} results matched every concept. It searched
            again with one concept dropped at a time, the least specific first.
            {fallback.phase === "searching" && " It is still running."} Its results are labelled “Matches N of M concepts”.
          </p>
          {fallback.counts.length > 0 && (
            <p className="muted">
              How many works OpenAlex matches for each concept alone (the larger the number, the less it narrows):{" "}
              {fallback.counts.map((entry) => `${entry.concept}: ${entry.works.toLocaleString("en")}`).join("; ")}.
            </p>
          )}
          {fallback.passes.map((pass) => (
            <SentQueries key={pass.dropped} sent={pass.sent} title={`Fallback pass without “${pass.dropped}”`} />
          ))}
        </div>
      )}
    </details>
  );
}
