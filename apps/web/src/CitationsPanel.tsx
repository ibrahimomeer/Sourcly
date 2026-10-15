import { apaInlineHtml, apaText, buildReferenceList, savedResults, type ApaPart, type SavedItem } from "@sourcly/core";
import { useMemo, useState } from "react";
import { copyRichText } from "./exportFiles";
import { pluralize } from "./format";

function Citation({ parts }: { parts: readonly ApaPart[] }) {
  return (
    <>
      {parts.map((part, index) => (part.italic ? <i key={index}>{part.text}</i> : <span key={index}>{part.text}</span>))}
    </>
  );
}

/**
 * APA 7 in-text citations for the saved list, each ready to copy: in brackets at the end of a sentence,
 * or with the author in the sentence. They are worked out together with the reference list, so the same
 * letters (2020a, 2020b) and the same extra names appear in both.
 */
export function CitationsPanel({ items, open }: { items: readonly SavedItem[]; open: boolean }) {
  const [message, setMessage] = useState("");

  // Built only while the panel is open, in the order of the reference list.
  const entries = useMemo(() => (open ? buildReferenceList(savedResults(items), { retrievedOn: new Date() }) : []), [open, items]);

  async function copy(parts: readonly ApaPart[], what: string) {
    const outcome = await copyRichText(apaInlineHtml(parts), apaText(parts));
    setMessage(
      outcome === "failed"
        ? "Your browser did not allow copying. Select the citation and copy it by hand."
        : `Copied ${what}.`,
    );
  }

  async function copyAllInBrackets() {
    const text = entries.map((entry) => apaText(entry.citation.parenthetical)).join("\n");
    const html = entries.map((entry) => `<p>${apaInlineHtml(entry.citation.parenthetical)}</p>`).join("");
    const outcome = await copyRichText(html, text);
    setMessage(outcome === "failed" ? "Your browser did not allow copying." : `Copied ${pluralize(entries.length, "citation")}, one per line.`);
  }

  return (
    <div className="citations">
      <div id="citations-panel" className="settings-panel" hidden={!open}>
        <p className="muted">
          APA 7 in-text citations for the sources on your saved list. Use the first form at the end of a sentence and the
          second when the author is part of the sentence. They match your reference list, in the same order.
        </p>

        {items.length === 0 ? (
          <p>Nothing saved yet. Press “Save to list” on a result and its in-text citations will appear here.</p>
        ) : (
          <>
            <ul className="citation-list">
              {entries.map((entry) => (
                <li key={entry.result.id}>
                  <p className="citation-source">{entry.result.title === "" ? "(untitled)" : entry.result.title}</p>
                  <div className="citation-row">
                    <span className="citation-kind">In brackets</span>
                    <span className="citation">
                      <Citation parts={entry.citation.parenthetical} />
                    </span>
                    <button
                      type="button"
                      aria-label={`Copy ${apaText(entry.citation.parenthetical)}`}
                      onClick={() => void copy(entry.citation.parenthetical, apaText(entry.citation.parenthetical))}
                    >
                      Copy
                    </button>
                  </div>
                  <div className="citation-row">
                    <span className="citation-kind">In a sentence</span>
                    <span className="citation">
                      <Citation parts={entry.citation.narrative} />
                    </span>
                    <button
                      type="button"
                      aria-label={`Copy ${apaText(entry.citation.narrative)}`}
                      onClick={() => void copy(entry.citation.narrative, apaText(entry.citation.narrative))}
                    >
                      Copy
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="actions">
              <button type="button" onClick={() => void copyAllInBrackets()}>
                Copy all in brackets ({entries.length})
              </button>
            </div>
            <p role="status" className="muted">
              {message}
            </p>
            <p className="muted note">
              For a direct quotation add the page after the year: (Smith, 2020, p. 5). To cite several sources in one pair of
              brackets, put them in alphabetical order with semicolons between them: (Jones, 2019; Smith, 2020). If the
              same author has two works in one bracket, give the author once: (Smith, 2019, 2020). A group author may be
              abbreviated after its first use. Check each citation against your reference list.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
