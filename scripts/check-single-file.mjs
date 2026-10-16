// Checks that the built site is the ONE file it promises to be: apps/web/dist/index.html, with all its scripts and styles
// inlined. That file is what is hosted, and what people download from GitHub Releases and open by double-click, so it
// must not need any other file. The only external thing it may mention is an OPTIONAL ./config.js (a classic script
// that overrides the built-in defaults; the page works when it is missing).
//
//   node scripts/check-single-file.mjs [path-to-index.html-or-dist-folder]
//
// In the repository this is `pnpm check:single-file`. It prints the file's size.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The only external file the page may name. It is optional: nothing breaks when it is missing. */
const OPTIONAL_SCRIPT = "./config.js";

const isData = (address) => /^data:/i.test(address);

/** Problems with a built index.html: every other local file it would need to load. Empty when it is self-contained. */
export function findProblems(html) {
  const problems = [];

  // The contents of inline scripts and styles are code, not page structure, so they are cut out first (the style text is
  // kept for its own check below).
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1] ?? "");
  const structure = html
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, "<script$1></script>")
    .replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, "<style$1></style>");

  let hasInlinedApp = false;
  for (const match of structure.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1];
    if (src !== undefined && src !== OPTIONAL_SCRIPT) problems.push(`loads a script from ${src}`);
    if (src === undefined && /\btype\s*=\s*["']module["']/i.test(attributes)) hasInlinedApp = true;
  }
  for (const match of structure.matchAll(/<link\b([^>]*)>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(match[1] ?? "")?.[1];
    problems.push(`links to ${href ?? "another file"}`);
  }
  for (const match of structure.matchAll(/<(?:img|source|video|audio|iframe|embed|object|input)\b([^>]*)>/gi)) {
    const src = /\b(?:src|data)\s*=\s*["']([^"']*)["']/i.exec(match[1] ?? "")?.[1];
    if (src !== undefined && !isData(src)) problems.push(`loads ${src}`);
  }
  // A stylesheet that reaches for another file (a font, an image, an @import) breaks when the page is moved on its own.
  for (const css of styles) {
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const address = match[1] ?? "";
      if (!isData(address) && !address.startsWith("#")) problems.push(`its style loads ${address}`);
    }
    for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) problems.push(`its style imports ${match[1]}`);
  }
  if (!hasInlinedApp) problems.push("has no inlined app script");
  return problems;
}

/** "412.7 kB" for a byte count (kilobytes of 1000 bytes, as file managers show them). */
export function formatSize(bytes) {
  if (bytes < 1000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const given = resolve(process.argv[2] ?? join(root, "apps", "web", "dist"));
  const index = existsSync(given) && statSync(given).isDirectory() ? join(given, "index.html") : given;
  if (!existsSync(index)) {
    console.error(`Missing ${index}. Run the build first: pnpm build`);
    process.exit(1);
  }
  const problems = findProblems(readFileSync(index, "utf8"));
  if (problems.length > 0) {
    console.error(`${index} is not one self-contained file:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${index} is one self-contained file: ${formatSize(statSync(index).size)}. config.js is an optional override and is not needed.`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
