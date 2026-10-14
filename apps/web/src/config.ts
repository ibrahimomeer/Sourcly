export interface SourclyConfig {
  siteName: string;
  authorName: string;
  repoUrl: string;
  contactEmail: string;
  libraryProxyPrefix: string;
  librarySearchUrl: string;
  downloadUrl: string;
}

declare global {
  interface Window {
    /** Set by the classic script public/config.js. Untrusted shape until resolved. */
    SOURCLY_CONFIG?: unknown;
  }
}

/** Used for any field config.js leaves out. Nothing personal belongs here. */
export const DEFAULT_CONFIG: SourclyConfig = {
  siteName: "Sourcly",
  authorName: "",
  repoUrl: "",
  contactEmail: "",
  libraryProxyPrefix: "",
  librarySearchUrl: "",
  downloadUrl: "",
};

const URL_FIELDS = ["repoUrl", "libraryProxyPrefix", "librarySearchUrl", "downloadUrl"] as const;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Merges window.SOURCLY_CONFIG over the defaults. Non-string and blank values
 * are ignored, and URL fields are dropped unless they start with http(s)://, so
 * a typo in config.js degrades to "link not shown" instead of a broken or
 * unsafe link.
 */
export function resolveConfig(raw: unknown): SourclyConfig {
  const config: SourclyConfig = { ...DEFAULT_CONFIG };
  if (typeof raw !== "object" || raw === null) return config;

  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof SourclyConfig)[]) {
    const value = source[key];
    if (typeof value !== "string" || value.trim() === "") continue;
    const trimmed = value.trim();
    if ((URL_FIELDS as readonly string[]).includes(key) && !isHttpUrl(trimmed)) continue;
    config[key] = trimmed;
  }
  return config;
}

/** Link to the methodology doc in the configured repository, or "" if unknown. */
export function methodologyUrl(config: SourclyConfig): string {
  return config.repoUrl === "" ? "" : `${config.repoUrl.replace(/\/+$/, "")}/blob/main/docs/methodology.md`;
}
