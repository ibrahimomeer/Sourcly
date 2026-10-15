// Checks that the built site is the single file it promises to be: apps/web/dist/index.html with its
// scripts and styles inlined, plus config.js next to it. Anything else it loads would stop working
// when the file is double-clicked from a folder or moved on its own.
//
//   node scripts/check-dist.mjs [path-to-dist]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The only external file the page may load. It stays separate so it can be edited after the build. */
const ALLOWED_SCRIPT = "./config.js";

/** Problems with a built index.html: every other file it would need to load. Empty when it is self-contained. */
export function findProblems(html) {
  const problems = [];

  // The contents of inline scripts and styles are code, not page structure, so they are cut out first.
  const structure = html
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, "<script$1></script>")
    .replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, "<style$1></style>");

  let hasInlinedApp = false;
  for (const match of structure.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1];
    if (src !== undefined && src !== ALLOWED_SCRIPT) problems.push(`loads a script from ${src}`);
    if (src === undefined && /\btype\s*=\s*["']module["']/i.test(attributes)) hasInlinedApp = true;
  }
  for (const match of structure.matchAll(/<link\b([^>]*)>/gi)) {
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(match[1] ?? "")?.[1];
    problems.push(`links to ${href ?? "another file"}`);
  }
  for (const match of structure.matchAll(/<(?:img|source|video|audio|iframe|embed|object)\b([^>]*)>/gi)) {
    const src = /\b(?:src|data)\s*=\s*["']([^"']*)["']/i.exec(match[1] ?? "")?.[1];
    if (src !== undefined && !src.startsWith("data:")) problems.push(`loads ${src}`);
  }
  if (!new RegExp(`<script[^>]*\\bsrc\\s*=\\s*["']${ALLOWED_SCRIPT.replace(".", "\\.")}["']`, "i").test(structure)) {
    problems.push("does not load ./config.js, so the site could not be configured");
  }
  if (!hasInlinedApp) problems.push("has no inlined app script");
  return problems;
}

function main() {
  const dist = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist"));
  const index = join(dist, "index.html");
  if (!existsSync(index)) {
    console.error(`Missing ${index}. Run the build first.`);
    process.exit(1);
  }
  const problems = findProblems(readFileSync(index, "utf8"));
  if (!existsSync(join(dist, "config.js"))) problems.push("config.js is missing next to index.html");
  if (problems.length > 0) {
    console.error(`dist/index.html is not a single self-contained file:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log("dist/index.html is a single file (config.js beside it is the only extra).");
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
