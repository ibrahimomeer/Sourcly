// The app's version is written in ONE place: "version" in the root package.json. The web app reads it
// from there at build time (footer, search protocol), and the release workflow checks the git tag
// against it. The only other file that repeats it is CITATION.cff, which this script keeps in step.
//
//   node scripts/version.mjs                 show the version
//   node scripts/version.mjs set 0.2.0       change it (package.json and CITATION.cff)
//   node scripts/version.mjs check [v0.2.0]  fail if anything disagrees (with a tag: if the tag differs)
//
// In the repository these are `pnpm version:set 0.2.0` and `pnpm version:check`.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** "v0.2.0" and "0.2.0" both give "0.2.0"; anything that is not a version gives null. */
export function parseVersion(text) {
  const bare = String(text ?? "").trim().replace(/^v/i, "");
  return SEMVER.test(bare) ? bare : null;
}

/** The version in CITATION.cff, or null if the file has none. */
export function cffVersion(cffText) {
  return /^version:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/m.exec(cffText)?.[1] ?? null;
}

/** CITATION.cff text with its version set. An existing `version:` line is replaced; otherwise one is added after `license:`. */
export function withCffVersion(cffText, version) {
  if (/^version:/m.test(cffText)) return cffText.replace(/^version:.*$/m, `version: ${version}`);
  if (/^license:.*$/m.test(cffText)) return cffText.replace(/^(license:.*)$/m, `$1\nversion: ${version}`);
  return `${cffText.replace(/\n*$/, "\n")}version: ${version}\n`;
}

/** package.json text with its top-level version set, keeping the rest of the file exactly as it was. */
export function withPackageVersion(jsonText, version) {
  const pattern = /^(\s*"version"\s*:\s*)"[^"]*"/m;
  if (!pattern.test(jsonText)) throw new Error('package.json has no "version" line');
  return jsonText.replace(pattern, `$1"${version}"`);
}

/**
 * What is wrong with the version setup, in plain words. Empty when it is all in step.
 * `workspaceVersions` maps a workspace package.json path to its "version" (null when it has none).
 */
export function findProblems({ packageVersion, cffText, workspaceVersions = {}, tag = null }) {
  const problems = [];
  if (parseVersion(packageVersion) === null || packageVersion !== parseVersion(packageVersion)) {
    problems.push(`package.json version "${packageVersion}" is not a version like 1.2.3`);
  }
  const citation = cffVersion(cffText);
  if (citation !== packageVersion) {
    problems.push(`CITATION.cff says version ${citation ?? "(none)"} but package.json says ${packageVersion}. Run: pnpm version:set ${packageVersion}`);
  }
  for (const [path, version] of Object.entries(workspaceVersions)) {
    if (version !== null) problems.push(`${path} has its own version (${version}). Remove it: the version lives only in the root package.json`);
  }
  if (tag !== null) {
    // The release workflow runs this first. The tag must be exactly "v" plus the version in the root package.json.
    const expected = `v${packageVersion}`;
    if (!/^v/.test(tag) || parseVersion(tag) === null) {
      problems.push(`the tag "${tag}" is not a version tag like v1.2.3`);
    } else if (tag !== expected) {
      problems.push(`the tag ${tag} does not match package.json (version ${packageVersion}): the tag must be ${expected}. Fix the version with pnpm version:set, commit, and tag again`);
    }
  }
  return problems;
}

// ---- Command line

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  rootPackage: join(root, "package.json"),
  cff: join(root, "CITATION.cff"),
  workspaces: ["apps/web/package.json", "packages/core/package.json"],
};

const read = (path) => readFileSync(path, "utf8");

function currentVersion() {
  return JSON.parse(read(files.rootPackage)).version;
}

function main(args) {
  const [command, value] = args;
  if (command === undefined) {
    console.log(currentVersion());
    return 0;
  }

  if (command === "set") {
    const version = parseVersion(value);
    if (version === null) {
      console.error(`Give a version like 0.2.0 (or v0.2.0). Got: ${value ?? "nothing"}`);
      return 1;
    }
    const before = currentVersion();
    writeFileSync(files.rootPackage, withPackageVersion(read(files.rootPackage), version));
    if (existsSync(files.cff)) writeFileSync(files.cff, withCffVersion(read(files.cff), version));
    console.log(`Version ${before} -> ${version} (package.json and CITATION.cff).`);
    console.log(`Next: commit it, merge to main, then tag the commit: git tag v${version} && git push origin v${version}`);
    return 0;
  }

  if (command === "check") {
    const problems = findProblems({
      packageVersion: currentVersion(),
      cffText: existsSync(files.cff) ? read(files.cff) : "",
      workspaceVersions: Object.fromEntries(
        files.workspaces.map((path) => [path, JSON.parse(read(join(root, path))).version ?? null]),
      ),
      tag: value ?? null,
    });
    if (problems.length > 0) {
      console.error(`Version problems:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
      return 1;
    }
    console.log(`Version ${currentVersion()} is in step everywhere${value ? ` and matches the tag ${value}` : ""}.`);
    return 0;
  }

  console.error("Usage: node scripts/version.mjs [set <version> | check [tag]]");
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
