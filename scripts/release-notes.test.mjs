import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { releaseNotes, siteUrlFrom } from "./release-notes.mjs";

test("writes the version and the one line about opening the file", () => {
  assert.equal(
    releaseNotes({ version: "0.1.5", siteUrl: "https://example.org" }),
    "Sourcly 0.1.5\n\nDouble-click the file to open it. If your browser blocks it, use https://example.org.\n",
  );
});

test("reads the built-in siteUrl from the default config", () => {
  const source = 'export const DEFAULT_CONFIG: SourclyConfig = {\n  siteName: "Sourcly",\n  siteUrl: "https://example.org",\n  contactEmail: "",\n};\n';
  assert.equal(siteUrlFrom(source), "https://example.org");
  assert.equal(siteUrlFrom("nothing here"), null);
});

test("finds the real siteUrl in apps/web/src/config.ts", () => {
  const url = siteUrlFrom(readFileSync(new URL("../apps/web/src/config.ts", import.meta.url), "utf8"));
  assert.match(url ?? "", /^https:\/\/\S+$/);
});
