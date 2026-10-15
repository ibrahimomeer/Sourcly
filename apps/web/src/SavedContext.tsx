import type { Result } from "@sourcly/core";
import { createContext, useContext } from "react";

/** What a result card needs to know about the saved list, without every component passing it down. */
export interface SavedApi {
  isSaved: (id: string) => boolean;
  toggle: (result: Result) => void;
  /** False when the list is full. */
  canSave: boolean;
}

const SavedContext = createContext<SavedApi>({ isSaved: () => false, toggle: () => undefined, canSave: true });

export const SavedProvider = SavedContext.Provider;
export const useSaved = (): SavedApi => useContext(SavedContext);
