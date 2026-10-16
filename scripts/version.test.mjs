import assert from "node:assert/strict";
import { test } from "node:test";
import { cffVersion, findProblems, parseVersion, withCffVersion, withPackageVersion } from "./version.mjs";

const cff = 'cff-version: 1.2.0\ntitle: "Sourcly"\nlicense: MIT\nversion: 0.1.0\nkeywords:\n  - a\n';

test("reads versions, with or without a leading v", () => {
  assert.equal(parseVersion("0.2.0"), "0.2.0");
  assert.equal(parseVersion("v0.2.0"), "0.2.0");
  assert.equal(parseVersion(" V1.10.3 "), "1.10.3");
  assert.equal(parseVersion("1.0.0-beta.1"), "1.0.0-beta.1");
});

test("refuses things that are not versions", () => {
  for (const text of ["", "1.2", "1.2.3.4", "latest", "v", "a.b.c", undefined, null, "1.2.3 beta"]) {
    assert.equal(parseVersion(text), null, String(text));
  }
});

test("reads the version from CITATION.cff", () => {
  assert.equal(cffVersion(cff), "0.1.0");
  assert.equal(cffVersion('version: "0.3.1" # released\n'), "0.3.1");
  assert.equal(cffVersion("cff-version: 1.2.0\n"), null, "cff-version is not the version");
  assert.equal(cffVersion(""), null);
});

test("changes only the version line of CITATION.cff", () => {
  assert.equal(withCffVersion(cff, "0.2.0"), cff.replace("version: 0.1.0", "version: 0.2.0"));
});

test("adds a version line to a CITATION.cff that has none", () => {
  const without = 'cff-version: 1.2.0\nlicense: MIT\nkeywords:\n  - a\n';
  assert.equal(withCffVersion(without, "1.0.0"), 'cff-version: 1.2.0\nlicense: MIT\nversion: 1.0.0\nkeywords:\n  - a\n');
  assert.equal(withCffVersion("title: x", "1.0.0"), "title: x\nversion: 1.0.0\n");
});

test("changes only the top-level version in package.json and keeps the formatting", () => {
  const pkg = '{\n  "name": "sourcly",\n  "version": "0.1.0",\n  "private": true,\n  "scripts": {\n    "x": "node -v"\n  }\n}\n';
  assert.equal(withPackageVersion(pkg, "0.2.0"), pkg.replace('"0.1.0"', '"0.2.0"'));
  assert.throws(() => withPackageVersion('{ "name": "x" }', "1.0.0"));
});

test("finds nothing wrong when everything agrees", () => {
  assert.deepEqual(findProblems({ packageVersion: "0.1.0", cffText: cff }), []);
  assert.deepEqual(findProblems({ packageVersion: "0.1.0", cffText: cff, workspaceVersions: { "apps/web/package.json": null }, tag: "v0.1.0" }), []);
});

test("says when CITATION.cff has drifted, and how to fix it", () => {
  const problems = findProblems({ packageVersion: "0.2.0", cffText: cff });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /CITATION\.cff says version 0\.1\.0 but package\.json says 0\.2\.0\. Run: pnpm version:set 0\.2\.0/);
  assert.match(findProblems({ packageVersion: "0.1.0", cffText: "title: x" })[0], /\(none\)/);
});

test("says when a workspace package has its own version", () => {
  const problems = findProblems({ packageVersion: "0.1.0", cffText: cff, workspaceVersions: { "apps/web/package.json": "0.1.0", "packages/core/package.json": null } });
  assert.deepEqual(problems, ["apps/web/package.json has its own version (0.1.0). Remove it: the version lives only in the root package.json"]);
});

test("checks a git tag against the version", () => {
  assert.match(findProblems({ packageVersion: "0.1.0", cffText: cff, tag: "v0.2.0" })[0], /tag v0\.2\.0 does not match package\.json \(version 0\.1\.0\): the tag must be v0\.1\.0/);
  assert.match(findProblems({ packageVersion: "0.1.0", cffText: cff, tag: "latest" })[0], /not a version tag/);
  assert.deepEqual(findProblems({ packageVersion: "0.1.0", cffText: cff, tag: "v0.1.0" }), []);
});

test("requires the tag to be exactly v + the package.json version, with the v", () => {
  assert.match(findProblems({ packageVersion: "0.1.0", cffText: cff, tag: "0.1.0" })[0], /not a version tag/);
  assert.match(findProblems({ packageVersion: "0.1.5", cffText: cff.replace("0.1.0", "0.1.5"), tag: "v0.1.50" })[0], /the tag must be v0\.1\.5/);
  assert.match(findProblems({ packageVersion: "0.1.5", cffText: cff.replace("0.1.0", "0.1.5"), tag: "v0.1.4" })[0], /Fix the version with pnpm version:set, commit, and tag again/);
  assert.deepEqual(findProblems({ packageVersion: "0.1.5", cffText: cff.replace("0.1.0", "0.1.5"), tag: "v0.1.5" }), []);
});

test("rejects a package.json version that is not a version", () => {
  assert.match(findProblems({ packageVersion: "v0.1.0", cffText: 'version: v0.1.0\n' })[0], /is not a version like 1\.2\.3/);
});
