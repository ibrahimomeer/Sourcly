import {
  PROVIDER_NAMES,
  buildReferenceList,
  referenceListHtml,
  referenceListText,
  referencesFileName,
  savedResults,
  type ApaPart,
  type SavedItem,
} from "@sourcly/core";
import { useMemo, useState } from "react";
import { copyRichText, downloadTextFile } from "./exportFiles";
import { pluralize } from "./format";
import { libraryUrl } from "./libraryLink";

/** The small links under a saved reference: open it through the library, or take it off the list. */
function SavedLinks({
  result,
  libraryPrefix,
  onRemove,
}: {
  result: SavedItem["result"];
  libraryPrefix: string;
  onRemove: (id: string) => void;
}) {
  const library = libraryUrl(libraryPrefix, result);
  return (
    <>
      {library !== null && (
        <>
          <a href={library} target="_blank" rel="noopener noreferrer">
            Open via UBC Library
          </a>
          {" · "}
        </>
      )}
      <button type="button" className="link-button" onClick={() => onRemove(result.id)}>
        Remove from list
      </button>
    </>
  );
}

function Reference({ parts }: { parts: readonly ApaPart[] }) {
  return (
    <>
      {parts.map((part, index) => (part.italic ? <i key={index}>{part.text}</i> : <span key={index}>{part.text}</span>))}
    </>
  );
}

/**
 * The list of sources the person has saved, shown as the APA 7 references it will export. Kept
 * in this browser only. Each reference lists what to check, because the sources' data is often
 * incomplete.
 */
export function SavedPanel({
  items,
  onRemove,
  onClear,
  isStored,
  libraryPrefix,
}: {
  items: readonly SavedItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  /** False when the browser would not store the list. */
  isStored: boolean;
  /** config.libraryProxyPrefix; empty hides the library links. */
  libraryPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  // Built when the list changes, in the order it is exported (alphabetical), and not before it is opened.
  const entries = useMemo(
    () => (open ? buildReferenceList(savedResults(items), { retrievedOn: new Date() }) : []),
    [open, items],
  );

  async function handleCopy() {
    const all = buildReferenceList(savedResults(items), { retrievedOn: new Date() });
    const outcome = await copyRichText(referenceListHtml(all), referenceListText(all));
    setMessage(
      outcome === "rich"
        ? `Copied ${pluralize(all.length, "reference")}. Italics are kept when you paste into Word or Google Docs.`
        : outcome === "plain"
          ? `Copied ${pluralize(all.length, "reference")} as plain text, without italics. Italicise journal names and volumes after pasting.`
          : "Your browser did not allow copying. Use “Download references” instead.",
    );
  }

  function handleDownload() {
    const all = buildReferenceList(savedResults(items), { retrievedOn: new Date() });
    downloadTextFile(referencesFileName(new Date()), referenceListText(all));
    setMessage(`Downloaded ${pluralize(all.length, "reference")} as a text file. It has no italics: italicise journal names and volumes in your document.`);
  }

  function handleClear() {
    if (window.confirm(`Remove all ${pluralize(items.length, "saved source")} from the list?`)) {
      onClear();
      setMessage("");
    }
  }

  return (
    <div className="saved">
      <button
        type="button"
        className="settings-toggle"
        aria-expanded={open}
        aria-controls="saved-panel"
        onClick={() => setOpen((current) => !current)}
      >
        Saved list ({items.length})
      </button>

      <div id="saved-panel" className="settings-panel" hidden={!open}>
        <p className="muted">
          Press “Save to list” on any result to add it here. The list stays in this browser for your next visit and is
          never sent anywhere.{" "}
          {!isStored && (
            <strong>This browser would not store it, so it will be lost when you close the page.</strong>
          )}
        </p>

        {items.length === 0 ? (
          <p>Nothing saved yet.</p>
        ) : (
          <>
            <p className="muted">
              {pluralize(items.length, "source")}, shown as APA 7 references in the order they will be exported
              (alphabetical, by first author).
            </p>
            <ol className="saved-list">
              {entries.map((entry) => (
                <li key={entry.result.id}>
                  <p className="reference">
                    <Reference parts={entry.parts} />
                  </p>
                  {entry.checks.length > 0 && (
                    <ul className="checks">
                      {entry.checks.map((check) => (
                        <li key={check}>Check: {check}</li>
                      ))}
                    </ul>
                  )}
                  <p className="note muted">
                    Found by {entry.result.hits.map((hit) => PROVIDER_NAMES[hit.provider]).join(", ") || "an earlier search"}.{" "}
                    <SavedLinks result={entry.result} libraryPrefix={libraryPrefix} onRemove={onRemove} />
                  </p>
                </li>
              ))}
            </ol>

            <div className="actions">
              <button type="button" onClick={() => void handleCopy()}>
                Copy references (APA 7)
              </button>
              <button type="button" onClick={handleDownload}>
                Download references (.txt)
              </button>
              <button type="button" onClick={handleClear}>
                Clear list
              </button>
            </div>
            <p role="status" className="muted">
              {message}
            </p>
            {libraryPrefix.trim() !== "" && (
              <p className="muted note">
                “Open via UBC Library” depends on UBC Library subscriptions; you may be asked to log in.
              </p>
            )}
            <p className="muted note">
              Metadata can be incomplete: volume, issue and pages, editors and publishers are often missing, author names
              may be split wrongly, and APA 7 wants titles in sentence case. Check every reference before you submit.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
