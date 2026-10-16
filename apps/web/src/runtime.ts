/** The part of window.location the app looks at, so tests can pass a plain object. */
export interface LocationLike {
  protocol: string;
}

/**
 * True when the page was opened as a file from disk (double-clicked), not served by a website. The offline copy cannot
 * update itself, so it shows where the newest version is instead of a download link, and a blocked request is explained.
 */
export function runningFromFile(location: LocationLike | undefined = typeof window === "undefined" ? undefined : window.location): boolean {
  return location?.protocol === "file:";
}

/** What the page knows about where it runs: opened as a file from disk or served, and where the newest version lives. */
export interface RuntimeInfo {
  isLocalFile: boolean;
  /** The site's address (config siteUrl); "" when the site names none. */
  siteUrl: string;
}

/**
 * "Your browser blocked a request from a local file. Use the website instead: <siteUrl>." The text that explains a request
 * a browser refused for a page opened from disk.
 */
export function blockedRequestMessage(siteUrl: string): string {
  return siteUrl === "" ? "Your browser blocked a request from a local file. Use the website instead." : `Your browser blocked a request from a local file. Use the website instead: ${siteUrl}.`;
}

/**
 * Whether to show that message: the page runs from a file AND some request failed in the browser itself (a fetch TypeError).
 * A source's HTTP error or a rate limit is never explained this way, and neither is anything on the hosted site.
 */
export function looksBlockedFromFile(isLocalFile: boolean, failures: readonly { network?: true | undefined }[]): boolean {
  return isLocalFile && failures.some((failure) => failure.network === true);
}
