import { FEW_FULL_MATCHES, PROVIDER_NAMES, type SentQuery } from "@sourcly/core";
import { droppedWords } from "./queryText";
import type { ActiveSearch } from "./searchState";

/** The exact text each source received, and what it could not apply, so nothing about the query is hidden. */
export function SentQueries({ sent, title = "Queries sent", intro }: { sent: readonly SentQuery[]; title?: string; intro?: string }) {
  return (
    <details className="panel sent-queries">
      <summary>{title}</summary>
      <p className="muted">
        {intro ??
          "Sources read queries differently, so each one gets the same query written in the way it understands. This is the exact text each source received."}
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
      {search.expansion !== null && (
        <>
          <p>
            <strong>A second, expanded pass ran</strong>, because fewer than {FEW_FULL_MATCHES} results contained every word.
            {search.expansion.phase === "searching" && " It is still running."} Its results are labelled “Expanded search:
            not every word matched”.
          </p>
          <SentQueries
            sent={search.expansion.sent}
            title="Queries sent in the expanded pass"
            intro="The expanded pass asks the sources that have a looser way of searching, with the same words and without requiring every word. This is the exact text each one received."
          />
        </>
      )}
    </div>
  );
}
