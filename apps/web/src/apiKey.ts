// The user's optional personal OpenAlex API key. It lives only in this browser's
// localStorage: never in the repository, config.js, the page URL or an export.

const STORAGE_KEY = "sourcly.openalexApiKey";

/** The slice of the Web Storage API we use, so tests can pass a fake. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, or null when the browser blocks it (private mode, blocked site data, ...). */
export function browserStorage(): KeyStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved key, or "" if there is none or storage is unavailable. */
export function loadApiKey(storage: KeyStorage | null): string {
  try {
    return storage?.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Saves the key (trimmed), or forgets it when blank. Returns false when the
 * browser refused to store it, so the UI can say it only lasts for this visit.
 */
export function saveApiKey(storage: KeyStorage | null, key: string): boolean {
  if (storage === null) return false;
  try {
    const trimmed = key.trim();
    if (trimmed === "") storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Shows just enough to recognise a key without revealing it, e.g. "…a1b2". */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") return "";
  return trimmed.length <= 8 ? "…" : `…${trimmed.slice(-4)}`;
}
