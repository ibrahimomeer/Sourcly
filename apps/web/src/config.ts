export interface SourclyConfig {
  siteName: string;
  authorName: string;
  /** The university the project is made at, named only in the "not affiliated" notice. Empty names none. */
  institutionName: string;
  /** The library the "Access with ..." button signs in to. Empty falls back to "your library" in labels. */
  libraryName: string;
  /** The source repository. The header's GitHub link, the footer's links and the Download link are built from it. */
  repoUrl: string;
  /** Where the newest version of the site lives; shown by the offline copy, which cannot update itself. */
  siteUrl: string;
  contactEmail: string;
  libraryProxyPrefix: string;
  librarySearchUrl: string;
}

declare global {
  interface Window {
    /** Set by the classic script public/config.js. Untrusted shape until resolved. */
    SOURCLY_CONFIG?: unknown;
  }
}

/**
 * The built-in value of every setting. The app needs nothing else to work: config.js is only an optional override
 * (for a fork), and a person's own choices in Settings, kept in their browser, come after both.
 * Nothing personal belongs here: no email, no key, no name.
 */
export const DEFAULT_CONFIG: SourclyConfig = {
  siteName: "Sourcly",
  authorName: "Sourcly",
  institutionName: "UBC",
  libraryName: "UBC Library",
  repoUrl: "https://github.com/ibrahimomeer/Sourcly",
  siteUrl: "https://sourcly.getscove.com",
  contactEmail: "",
  // UBC Library's OpenAthens redirector, its current method (see docs/methodology.md, "Access"). The link is this prefix
  // followed by the work's address, percent-encoded as one value.
  libraryProxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",
  // The address UBC Library's own search box submits to (a plain GET with the query in `s.q`), checked 2026-10-14.
  librarySearchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=",
};

/** Text fields where an empty string is a real answer ("no library link", "no institution named"), not a missing value. */
const MAY_BE_EMPTY = [
  "authorName",
  "institutionName",
  "libraryName",
  "repoUrl",
  "siteUrl",
  "contactEmail",
  "libraryProxyPrefix",
  "librarySearchUrl",
] as const;

const URL_FIELDS = ["repoUrl", "siteUrl", "libraryProxyPrefix", "librarySearchUrl"] as const;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Merges window.SOURCLY_CONFIG over the defaults. A missing config.js, a non-string value or one that is only spaces
 * leaves the default in place; an empty string ("") is an answer for the fields that may be empty (it hides that link).
 * URL fields are dropped back to the default unless they start with http(s)://, so a typo in config.js degrades to the
 * built-in link instead of a broken or unsafe one.
 */
export function resolveConfig(raw: unknown): SourclyConfig {
  const config: SourclyConfig = { ...DEFAULT_CONFIG };
  if (typeof raw !== "object" || raw === null) return config;

  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof SourclyConfig)[]) {
    const value = source[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") {
      if (value === "" && (MAY_BE_EMPTY as readonly string[]).includes(key)) config[key] = "";
      continue;
    }
    if ((URL_FIELDS as readonly string[]).includes(key) && !isHttpUrl(trimmed)) continue;
    config[key] = trimmed;
  }
  return config;
}

/** Link to the methodology doc in the configured repository, or "" if unknown. */
export function methodologyUrl(config: Pick<SourclyConfig, "repoUrl">): string {
  return config.repoUrl === "" ? "" : `${config.repoUrl.replace(/\/+$/, "")}/blob/main/docs/methodology.md`;
}

/** The GitHub Releases page that always shows the newest offline copy, or "" if the repository is unknown. */
export function releasesUrl(config: Pick<SourclyConfig, "repoUrl">): string {
  return config.repoUrl === "" ? "" : `${config.repoUrl.replace(/\/+$/, "")}/releases/latest`;
}
