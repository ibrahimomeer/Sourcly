import { describe, expect, it } from "vitest";

// The page never asks GitHub for anything: not its API, not the latest release, not a file. The footer's Download link is a
// plain link the person opens in a new tab, and the version they are using comes from package.json at build time.

const web = import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.test.ts"], { query: "?raw", import: "default", eager: true });
const core = import.meta.glob<string>(["../../../packages/core/src/**/*.ts", "!../../../packages/core/src/**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const sources = [...Object.entries(web), ...Object.entries(core)].map(([file, content]) => ({ file, content }));
const name = (file: string) => file.split("/").pop() ?? file;

describe("the page sends no request to GitHub", () => {
  it("reads its own sources (and finds them)", () => {
    expect(sources.length).toBeGreaterThan(60);
    expect(sources.some(({ file }) => file.endsWith("/config.ts"))).toBe(true);
    expect(sources.some(({ file }) => file.endsWith("/providers/openalex.ts"))).toBe(true);
  });

  it("names no GitHub API, raw-file or release-download address anywhere", () => {
    for (const { file, content } of sources) {
      expect(content, file).not.toMatch(/api\.github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com|github\.com\/[^"'\s]*\/releases\/download/i);
    }
  });

  it("mentions GitHub only where the site's own links are built (config.ts) and in comments or labels about them", () => {
    const mentions = sources.filter(({ content }) => /github/i.test(content)).map(({ file }) => name(file));
    expect(mentions.sort()).toEqual(["Footer.tsx", "Header.tsx", "config.ts"]);
  });

  it("builds the Download link with no fetch: only config.ts and Footer.tsx know it, and neither calls fetch", () => {
    for (const wanted of ["config.ts", "Footer.tsx", "runtime.ts", "version.ts"]) {
      const found = Object.entries(web).find(([file]) => name(file) === wanted);
      expect(found, wanted).toBeDefined();
      expect(found?.[1], wanted).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource/);
    }
  });

  it("makes requests only in the provider and lookup code in packages/core, never in the web app's own files", () => {
    for (const { file, content } of Object.entries(web).map(([f, c]) => ({ file: f, content: c }))) {
      expect(content, file).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon/);
    }
  });
});
