// Getting text out of the page: a file download and the clipboard. Both are plain browser
// features that work when the page is opened from a file as well as from a server.

/** Saves text as a file through the browser's normal download. */
export function downloadTextFile(fileName: string, text: string, mimeType = "text/plain"): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** How a copy ended: with formatting, as plain text only, or not at all. */
export type CopyOutcome = "rich" | "plain" | "failed";

/**
 * Copies a reference list with its italics (word processors paste the HTML) and as plain text.
 * Falls back to plain text where rich copying is not available, and to an older copy method as
 * a last resort.
 */
export async function copyRichText(html: string, text: string): Promise<CopyOutcome> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write !== undefined) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return "rich";
    }
  } catch {
    // Not allowed or not supported: try plain text.
  }
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return "plain";
    }
  } catch {
    // Fall through to the older method.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied ? "plain" : "failed";
  } catch {
    return "failed";
  }
}
