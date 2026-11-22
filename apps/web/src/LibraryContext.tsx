import { createContext, useContext } from "react";
import { DEFAULT_CONFIG, type LibraryLink } from "./config";

/**
 * The libraries that get an "Access with ..." button and a search link, without every component passing them down.
 * They are the site's own (UBC Library and UofT by default) with the person's choices from Settings on top.
 */
const LibrariesContext = createContext<readonly LibraryLink[]>(DEFAULT_CONFIG.libraries);

export const LibrariesProvider = LibrariesContext.Provider;
export const useLibraries = (): readonly LibraryLink[] => useContext(LibrariesContext);
