import { parseSaved, serializeSaved, type SavedItem } from "@sourcly/core";
import type { KeyStorage } from "./apiKey";

// The saved list is kept in this browser's localStorage so it is still there next visit. Nothing is
// sent anywhere. Everything read back is checked by parseSaved, so damaged or edited data cannot
// break the page.

export const SAVED_STORAGE_KEY = "sourcly.savedList";

/** The saved list, or an empty one if there is none, it is unreadable, or storage is blocked. */
export function loadSavedList(storage: KeyStorage | null): SavedItem[] {
  try {
    return parseSaved(storage?.getItem(SAVED_STORAGE_KEY));
  } catch {
    return [];
  }
}

/**
 * Stores the list, or forgets it when empty. Returns false when the browser refused (storage
 * blocked or full), so the page can say the list lasts only until it is closed.
 */
export function persistSavedList(storage: KeyStorage | null, list: readonly SavedItem[]): boolean {
  if (storage === null) return false;
  try {
    if (list.length === 0) storage.removeItem(SAVED_STORAGE_KEY);
    else storage.setItem(SAVED_STORAGE_KEY, serializeSaved(list));
    return true;
  } catch {
    return false;
  }
}
