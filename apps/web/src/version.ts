declare const __APP_VERSION__: string | undefined;

/** The version in package.json, filled in by Vite at build time. */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
