import { protocolFileName } from "@sourcly/core";
import { useState } from "react";
import { downloadTextFile } from "./exportFiles";

/**
 * One button that saves the search protocol: a JSON record of this search so it can be written up
 * and repeated. It holds no API key and no email address.
 */
export function ProtocolExport({ build }: { build: (date: Date) => string }) {
  const [message, setMessage] = useState("");

  function handleDownload() {
    const date = new Date();
    downloadTextFile(protocolFileName(date), build(date), "application/json");
    setMessage("Downloaded the search protocol.");
  }

  return (
    <div className="protocol">
      <button type="button" onClick={handleDownload}>
        Download search protocol (JSON)
      </button>
      <span className="muted help">
        Records the query, the exact text each source received, the sources, filters, weights, date and how each source
        answered, so the search can be repeated. It contains no API key. Sources change, so results may differ later.
      </span>
      <span role="status" className="muted help">
        {message}
      </span>
    </div>
  );
}
