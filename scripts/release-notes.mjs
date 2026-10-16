// The text of a GitHub Release: the version and one line saying how to open the file. The release workflow writes it with
//
//   node scripts/release-notes.mjs v0.1.5 > release-notes.md
//
// The site's address is read from the built-in default in apps/web/src/config.ts, so it is written in one place.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The built-in siteUrl in config.ts's DEFAULT_CONFIG, or null if it cannot be found. */
export function siteUrlFrom(configSource) {
  const defaults = /DEFAULT_CONFIG\b[^=]*=\s*\{([\s\S]*?)\n\};/.exec(configSource)?.[1] ?? "";
  return /^\s*siteUrl:\s*"([^"]+)"/m.exec(defaults)?.[1] ?? null;
}

/** The release notes for a version (without the leading v) and the site address. */
export function releaseNotes({ version, siteUrl }) {
  return `Sourcly ${version}\n\nDouble-click the file to open it. If your browser blocks it, use ${siteUrl}.\n`;
}

function main() {
  const tag = process.argv[2] ?? "";
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const version = tag.replace(/^v/, "") || JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const siteUrl = siteUrlFrom(readFileSync(join(root, "apps", "web", "src", "config.ts"), "utf8"));
  if (siteUrl === null) {
    console.error("Could not find siteUrl in apps/web/src/config.ts");
    process.exit(1);
  }
  process.stdout.write(releaseNotes({ version, siteUrl }));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
