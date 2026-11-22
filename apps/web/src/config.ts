/** One library a result can be opened through: the name on its "Access with ..." button and the links that are built for it. */
export interface LibraryLink {
  /** On the button: "Access with <name>". Empty falls back to "your library" in labels. */
  name: string;
  /** The library's sign-in redirector: the link is this prefix followed by the work's address, percent-encoded as one value. Empty hides the button. */
  proxyPrefix: string;
  /** The library's search address, followed by the query, for the link under "Search elsewhere". Empty hides it. */
  searchUrl: string;
}

export interface SourclyConfig {
  siteName: string;
  authorName: string;
  /** The university the project is made at, named only in the "not affiliated" notice. Empty names none. */
  institutionName: string;
  /** The libraries that get an "Access with ..." button, in the order shown. Each library's name is also named in the notice. */
  libraries: LibraryLink[];
  /** The source repository. The header's GitHub link, the footer's links and the Download link are built from it. */
  repoUrl: string;
  /** Where the newest version of the site lives; shown by the offline copy, which cannot update itself. */
  siteUrl: string;
  contactEmail: string;
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
  libraries: [
    {
      name: "UBC Library",
      // UBC Library's OpenAthens redirector, its current method (see docs/methodology.md, "Access"). The link is this prefix
      // followed by the work's address, percent-encoded as one value.
      proxyPrefix: "https://go.openathens.net/redirector/ubc.ca?url=",
      // The address UBC Library's own search box submits to (a plain GET with the query in `s.q`), checked 2026-10-14.
      searchUrl: "https://ubc.summon.serialssolutions.com/search?s.q=",
    },
    {
      name: "UofT",
      // University of Toronto Libraries' proxy ("my.access"). Its `qurl` form takes the address percent-encoded as one value,
      // which is how the link is built. Checked 2026-11-21: the redirector answers HTTP 302 to login.library.utoronto.ca, which
      // asks for a UTORid, with the address decoded. The older ezproxy.* host names now redirect here too (see docs/methodology.md).
      proxyPrefix: "https://myaccess.library.utoronto.ca/login?qurl=",
      // LibrarySearch (Primo), checked 2026-11-21: this address followed by the query shows the results (the query must come last).
      searchUrl: "https://librarysearch.library.utoronto.ca/nde/search?vid=01UTORONTO_INST:UTORONTO_NDE&query=",
    },
  ],
  repoUrl: "https://github.com/ibrahimomeer/Sourcly",
  siteUrl: "https://sourcly.getscove.com",
  contactEmail: "",
};

/** Text fields where an empty string is a real answer ("no library link", "no institution named"), not a missing value. */
const MAY_BE_EMPTY = [
  "authorName",
  "institutionName",
  "repoUrl",
  "siteUrl",
  "contactEmail",
] as const;

const URL_FIELDS = ["repoUrl", "siteUrl"] as const;

/** At most this many libraries get a button. */
const MAX_LIBRARIES = 6;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

const cloneLibraries = (libraries: readonly LibraryLink[]): LibraryLink[] => libraries.map((library) => ({ ...library }));

/**
 * The libraries from config.js. Each needs a name; a link prefix or search address that is not http(s) (a typo) is dropped
 * to "" so that link is not shown instead of a broken one. A list that has no usable library keeps the default, and an
 * empty list ([]) means "no library buttons".
 */
function resolveLibraries(raw: unknown): LibraryLink[] {
  if (!Array.isArray(raw)) return cloneLibraries(DEFAULT_CONFIG.libraries);
  if (raw.length === 0) return [];
  const httpOnly = (value: unknown) => (typeof value === "string" && isHttpUrl(value.trim()) ? value.trim() : "");
  const libraries: LibraryLink[] = [];
  for (const item of raw.slice(0, MAX_LIBRARIES)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name === "" || name.length > 80) continue;
    libraries.push({ name, proxyPrefix: httpOnly(record.proxyPrefix), searchUrl: httpOnly(record.searchUrl) });
  }
  return libraries.length > 0 ? libraries : cloneLibraries(DEFAULT_CONFIG.libraries);
}

/**
 * Merges window.SOURCLY_CONFIG over the defaults. A missing config.js, a non-string value or one that is only spaces
 * leaves the default in place; an empty string ("") is an answer for the fields that may be empty (it hides that link).
 * URL fields are dropped back to the default unless they start with http(s)://, so a typo in config.js degrades to the
 * built-in link instead of a broken or unsafe one.
 */
export function resolveConfig(raw: unknown): SourclyConfig {
  const config: SourclyConfig = { ...DEFAULT_CONFIG, libraries: cloneLibraries(DEFAULT_CONFIG.libraries) };
  if (typeof raw !== "object" || raw === null) return config;

  const source = raw as Record<string, unknown>;
  config.libraries = resolveLibraries(source.libraries);
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof SourclyConfig)[]) {
    if (key === "libraries") continue;
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
