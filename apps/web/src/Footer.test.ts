import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, releasesUrl, resolveConfig } from "./config";
import { DOWNLOAD_LABEL, Footer } from "./Footer";
import { APP_VERSION } from "./version";

const render = (config = DEFAULT_CONFIG, isLocalFile = false) => renderToStaticMarkup(createElement(Footer, { config, isLocalFile }));
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
const links = (html: string) => [...html.matchAll(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((match) => ({ href: match[1], label: match[2] }));

describe("the footer on the website", () => {
  const html = render(DEFAULT_CONFIG, false);

  it("shows the copyright line with the project name", () => {
    const first = /<p class="footer-line">(.*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(text(first)).toMatch(/^© 20\d\d(–20\d\d)? Sourcly · MIT License · Source on GitHub · /);
  });

  it("shows the version being used", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(text(html)).toContain(`You are using v${APP_VERSION}`);
  });

  it("links to the GitHub Releases page, with the label for the offline copy", () => {
    const download = links(html).find((link) => link.label === DOWNLOAD_LABEL);
    expect(DOWNLOAD_LABEL).toBe("Download offline copy (GitHub Releases)");
    expect(download?.href).toBe(`${DEFAULT_CONFIG.repoUrl}/releases/latest`);
    expect(download?.href).toBe(releasesUrl(DEFAULT_CONFIG));
    expect(html).toMatch(new RegExp(`<a href="${download?.href}" target="_blank" rel="noopener noreferrer">${DOWNLOAD_LABEL.replace(/[()]/g, "\\$&")}</a>`));
  });

  it("derives the Download link from the configured repository", () => {
    const fork = resolveConfig({ repoUrl: "https://example.org/someone/fork/" });
    expect(links(render(fork)).find((link) => link.label === DOWNLOAD_LABEL)?.href).toBe("https://example.org/someone/fork/releases/latest");
  });

  it("does not offer the newest-version line, which is only for the offline copy", () => {
    expect(text(html)).not.toContain("Newest version");
  });

  it("shows the disclaimer as a second, short line below it", () => {
    expect(html).toContain('<p class="footer-notice">Independent student project. Not affiliated with or endorsed by UBC or UBC Library.</p>');
    expect(html.indexOf("footer-notice")).toBeGreaterThan(html.indexOf("footer-line"));
  });

  it("has no Download link when the repository is unknown", () => {
    const shown = text(render(resolveConfig({ repoUrl: "" })));
    expect(shown).not.toContain("Download");
    expect(shown).toContain("You are using v");
  });
});

describe("the footer when the page is opened as a file from disk", () => {
  const html = render(DEFAULT_CONFIG, true);

  it("hides the Download link", () => {
    expect(text(html)).not.toContain("Download");
    expect(links(html).some((link) => link.href?.endsWith("/releases/latest"))).toBe(false);
  });

  it("says where the newest version is, as a link to the site", () => {
    expect(text(html)).toContain("Newest version: https://sourcly.getscove.com");
    expect(links(html).find((link) => link.label === "https://sourcly.getscove.com")?.href).toBe("https://sourcly.getscove.com");
  });

  it("still shows the version and the disclaimer", () => {
    expect(text(html)).toContain(`You are using v${APP_VERSION}`);
    expect(text(html)).toContain("Independent student project. Not affiliated with or endorsed by UBC or UBC Library.");
  });

  it("leaves out the newest-version line when the site names no address", () => {
    expect(text(render(resolveConfig({ siteUrl: "" }), true))).not.toContain("Newest version");
  });
});

describe("the footer is plain text", () => {
  it("uses no image, no logo and no inline colour", () => {
    expect(render()).not.toMatch(/<img|<svg|style=|url\(/i);
  });

  it("names a fork's own institution and library instead of UBC", () => {
    const fork = resolveConfig({ institutionName: "Example University", libraryName: "Example Library" });
    const shown = text(render(fork));
    expect(shown).toContain("Not affiliated with or endorsed by Example University or Example Library.");
    expect(shown).not.toContain("UBC");
  });
});
