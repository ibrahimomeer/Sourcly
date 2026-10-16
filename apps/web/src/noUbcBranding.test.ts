import { describe, expect, it } from "vitest";

// Sourcly names UBC Library only to say which library a link signs in to. It uses no UBC logo, crest, wordmark or colour,
// and nothing in the repository may look like an official UBC service.

// Vite names each file relative to this one (apps/web/src); this turns that into a path from the repository's root.
function fromRoot(key: string): string {
  const parts = ["apps", "web", "src"];
  for (const part of key.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

// Every file of the repository by path (nothing is read here), leaving out what is not the project's own.
const listing = import.meta.glob(
  [
    "../../../**/*",
    "!../../../**/node_modules/**",
    "!../../../.git/**",
    "!../../../**/dist/**",
    "!../../../**/.cache/**",
    "!../../../**/output/**",
  ],
  { eager: false },
);
const files = Object.keys(listing).map(fromRoot);

// The site's own sources, read as text.
const site = import.meta.glob<string>(["../**/*.{ts,tsx,css}", "../public/*.js", "../index.html"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const siteFiles = Object.entries(site)
  .map(([key, content]) => ({ file: fromRoot(key), content }))
  .filter(({ file }) => !file.endsWith(".test.ts"));

const IMAGE = /\.(png|jpe?g|gif|svg|ico|webp|avif|bmp|tiff?|eps|ai|psd)$/i;

describe("no UBC branding in the repository", () => {
  it("scans the repository (and finds the files it should)", () => {
    expect(files).toContain("README.md");
    expect(files).toContain("apps/web/public/config.js");
    expect(files).toContain("apps/web/src/App.tsx");
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((file) => file.includes("node_modules"))).toBe(false);
  });

  it("reads the site's own sources", () => {
    const names = siteFiles.map(({ file }) => file);
    expect(names).toContain("apps/web/src/Footer.tsx");
    expect(names).toContain("apps/web/src/styles.css");
    expect(names).toContain("apps/web/public/config.js");
    expect(siteFiles.length).toBeGreaterThan(40);
  });

  it("has no image or vector file named for UBC, a logo, a crest, a wordmark or a shield", () => {
    const suspicious = files.filter((file) => IMAGE.test(file) && /ubc|logo|crest|wordmark|shield|coat-of-arms/i.test(file));
    expect(suspicious).toEqual([]);
  });

  it("has no image or vector file at all in the site's folders: the page is plain text", () => {
    const images = files.filter((file) => IMAGE.test(file) && (file.startsWith("apps/web/") || file.startsWith("packages/")));
    expect(images).toEqual([]);
  });

  it("uses no UBC colour: UBC blue (#002145) is not in any style, page or script of the site", () => {
    for (const { file, content } of siteFiles) expect(content, file).not.toMatch(/#002145|rgb\(\s*0\s*,\s*33\s*,\s*69\s*\)/i);
  });

  it("loads no image from anywhere: no <img> and no url() in the site", () => {
    for (const { file, content } of siteFiles) {
      expect(content, file).not.toMatch(/<img\b/i);
      expect(content, file).not.toMatch(/(?<![\w.])url\(\s*['"]?(?!data:)/);
    }
  });

  it("does not word the site's text as if UBC offered it", () => {
    for (const { file, content } of siteFiles.filter(({ file }) => /\.tsx?$/.test(file))) {
      expect(content, file).not.toMatch(/\bUBC's\b/);
      expect(content, file).not.toMatch(/UBC Library presents/i);
      expect(content, file).not.toMatch(/(?<!not an )\bofficial UBC\b/i);
    }
  });
});
