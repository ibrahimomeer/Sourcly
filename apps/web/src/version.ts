declare const __APP_VERSION__: string | undefined;

/**
 * The app's version. It is written in one place, "version" in the root package.json, and Vite fills it
 * in at build time. Change it with `pnpm version:set 0.2.0` (see CONTRIBUTING.md).
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";

/** "v0.1.0" for a version number, or "" when the version is not known (it never shows "vunknown"). */
export function versionLabel(version: string): string {
  return /^\d/.test(version) ? `v${version}` : "";
}
