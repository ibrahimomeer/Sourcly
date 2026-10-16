import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "./config";
import { Footer } from "./Footer";

const render = (config = DEFAULT_CONFIG) => renderToStaticMarkup(createElement(Footer, { config }));
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");

describe("the footer", () => {
  const config = resolveConfig({ repoUrl: "https://example.org/repo", downloadUrl: "https://example.org/repo/releases/latest" });

  it("shows the copyright line with the project name", () => {
    const html = render(config);
    const first = /<p class="footer-line">(.*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(text(first)).toMatch(/^© 20\d\d(–20\d\d)? Sourcly · MIT License · Source on GitHub · Download · v\d/);
  });

  it("shows the disclaimer as a second, short line below it", () => {
    const html = render(config);
    expect(html).toContain('<p class="footer-notice">Independent student project. Not affiliated with or endorsed by UBC or UBC Library.</p>');
    expect(html.indexOf("footer-notice")).toBeGreaterThan(html.indexOf("footer-line"));
  });

  it("shows the disclaimer even with no links configured", () => {
    expect(text(render(DEFAULT_CONFIG))).toContain("Independent student project. Not affiliated with or endorsed by UBC or UBC Library.");
  });

  it("names a fork's own institution and library instead", () => {
    const fork = resolveConfig({ institutionName: "Example University", libraryName: "Example Library" });
    const shown = text(render(fork));
    expect(shown).toContain("Not affiliated with or endorsed by Example University or Example Library.");
    expect(shown).not.toContain("UBC");
  });

  it("uses plain text only: no image, no logo, no inline colour", () => {
    const html = render(config);
    expect(html).not.toMatch(/<img|<svg|style=|url\(/i);
  });
});
