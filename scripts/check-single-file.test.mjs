import assert from "node:assert/strict";
import { test } from "node:test";
import { findProblems, formatSize } from "./check-single-file.mjs";

const page = (head, body = "") => `<!doctype html><html><head>${head}</head><body><div id="root"></div>${body}</body></html>`;
const app = '<script type="module" crossorigin>var a=1;</script><style>body{margin:0}</style>';

test("accepts a page with its script and style inlined and the optional config.js", () => {
  assert.deepEqual(findProblems(page(`<script src="./config.js"></script>${app}`)), []);
});

test("accepts the same page without config.js: the file is optional", () => {
  assert.deepEqual(findProblems(page(app)), []);
});

test("is not fooled by tag-like text inside the inlined code", () => {
  // A real inlined script cannot contain a literal closing script tag; bundlers write it as <\/script>.
  const code = 'var s=`<script src="/x.js"><\\/script><link href="/y.css">`;document.write(`<img src="/z.png">`)';
  assert.deepEqual(findProblems(page(`<script src="./config.js"></script><script type="module">${code}</script>`)), []);
});

test("rejects scripts, styles and images loaded from other files", () => {
  const bad = page(
    '<script src="./config.js"></script><script type="module" src="./assets/index.js"></script><link rel="stylesheet" href="./assets/index.css">',
    '<img src="./logo.png">',
  );
  assert.deepEqual(findProblems(bad), [
    "loads a script from ./assets/index.js",
    "links to ./assets/index.css",
    "loads ./logo.png",
    "has no inlined app script",
  ]);
});

test("rejects any script other than ./config.js, including a config.js from another place", () => {
  assert.deepEqual(findProblems(page(`<script src="/config.js"></script>${app}`)), ["loads a script from /config.js"]);
  assert.deepEqual(findProblems(page(`<script src="./js/other.js"></script>${app}`)), ["loads a script from ./js/other.js"]);
});

test("allows images given as data addresses", () => {
  assert.deepEqual(findProblems(page(app, '<img src="data:image/png;base64,AAAA">')), []);
});

test("rejects a style that loads a font or an image from another file, or imports another stylesheet", () => {
  const html = (css) => page(`<script type="module">1</script><style>${css}</style>`);
  assert.deepEqual(findProblems(html("@font-face{src:url(./fonts/a.woff2)}")), ["its style loads ./fonts/a.woff2"]);
  assert.deepEqual(findProblems(html('.a{background:url("img/b.png")}')), ["its style loads img/b.png"]);
  assert.deepEqual(findProblems(html('@import "other.css";')), ["its style imports other.css"]);
  assert.deepEqual(findProblems(html(".a{background:url(data:image/svg+xml;base64,AAAA)}.b{fill:url(#grad)}")), []);
});

test("rejects a page with no inlined app script", () => {
  assert.deepEqual(findProblems(page('<script src="./config.js"></script>')), ["has no inlined app script"]);
});

test("formats a size the way a file manager does", () => {
  assert.equal(formatSize(512), "512 bytes");
  assert.equal(formatSize(412_700), "412.7 kB");
  assert.equal(formatSize(2_500_000), "2.50 MB");
});
