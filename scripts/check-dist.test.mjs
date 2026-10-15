import assert from "node:assert/strict";
import { test } from "node:test";
import { findProblems } from "./check-dist.mjs";

const page = (head, body = "") => `<!doctype html><html><head>${head}</head><body><div id="root"></div>${body}</body></html>`;
const good = page('<script src="./config.js"></script><script type="module" crossorigin>var a=1;</script><style>body{margin:0}</style>');

test("accepts a page with inlined script and style and the external config.js", () => {
  assert.deepEqual(findProblems(good), []);
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

test("allows images given as data addresses", () => {
  assert.deepEqual(findProblems(page('<script src="./config.js"></script><script type="module">1</script>', '<img src="data:image/png;base64,AAAA">')), []);
});

test("rejects a page that does not load config.js, or has no app script", () => {
  assert.deepEqual(findProblems(page('<script type="module">1</script>')), ["does not load ./config.js, so the site could not be configured"]);
  assert.deepEqual(findProblems(page('<script src="./config.js"></script>')), ["has no inlined app script"]);
});

test("rejects config.js loaded from a different place", () => {
  assert.ok(findProblems(page('<script src="/config.js"></script><script type="module">1</script>')).length > 0);
});
