import { PROVIDER_NAMES, type SentQuery } from "@sourcly/core";
import { droppedWords } from "./queryText";
import type { ActiveSearch } from "./searchState";

/** The exact text each source received, and what it could not apply, so nothing about the query is hidden. */
export function SentQueries({ sent }: { sent: readonly SentQuery[] }) {
  return (
    <details className="panel sent-queries">
      <summary>Queries sent</summary>
      <p className="muted">
        Sources read queries differently, so each one gets the same query written in the way it understands. This is the
        exact text each source received.
      </p>
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
    </details>
  );
}

/** What was actually searched for: a note when common words were removed from the question, then the exact queries. */
export function QueryNote({ search, restorable = false }: { search: ActiveSearch; restorable?: boolean }) {
  const dropped = droppedWords(search.parsed);

  return (
    <div className="query-note">
      {search.parsed.exact === true && (
        <p>
          Searched exactly as typed: <strong>{search.query}</strong>. Nothing was removed, and no operators were added.
        </p>
      )}
      {search.parsed.exact !== true && dropped.length > 0 && (
        <p>
          Common words not used in “{search.parsed.original}”: {dropped.join(", ")}. Searched for:{" "}
          <strong>{search.query}</strong>.
          {restorable && " Click a dashed word under the search box to use one of them."}
        </p>
      )}
      <SentQueries sent={search.sent} />
    </div>
  );
}
