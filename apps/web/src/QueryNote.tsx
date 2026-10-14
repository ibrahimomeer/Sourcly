import { PROVIDER_NAMES } from "@sourcly/core";
import { droppedWords } from "./queryText";
import type { ActiveSearch } from "./searchState";

/**
 * What was actually searched for: a note when common words were removed from the question,
 * and the exact text each source received, so nothing about the query is hidden.
 */
export function QueryNote({ search }: { search: ActiveSearch }) {
  const dropped = droppedWords(search.parsed);

  return (
    <div className="query-note">
      {dropped.length > 0 && (
        <p>
          Common words were removed from “{search.parsed.original}” ({dropped.join(", ")}). Searched for:{" "}
          <strong>{search.query}</strong>. The search box now shows these words, so you can edit them and search again.
        </p>
      )}
      <details className="panel sent-queries">
        <summary>Exact query sent to each source</summary>
        <p className="muted">
          Sources read queries differently, so each one gets the same query written in the way it understands. This is the
          text each one received.
        </p>
        <ul>
          {search.sent.map((sent) => (
            <li key={sent.provider}>
              <strong>{PROVIDER_NAMES[sent.provider]}:</strong>{" "}
              {sent.text === "" ? <span className="muted">nothing could be sent</span> : <code>{sent.text}</code>}
              {sent.notes.map((note) => (
                <small key={note} className="sent-note">
                  {note}
                </small>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
