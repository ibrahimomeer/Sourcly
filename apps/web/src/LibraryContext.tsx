import { createContext, useContext } from "react";
import { DEFAULT_CONFIG } from "./config";

/**
 * The library's name for the button and notes ("Access with UBC Library"), without every component passing it down.
 * It is the site's default, or the name the person typed in Settings.
 */
const LibraryContext = createContext<string>(DEFAULT_CONFIG.libraryName);

export const LibraryNameProvider = LibraryContext.Provider;
export const useLibraryName = (): string => useContext(LibraryContext);
