# Sourcly

Sourcly is an open-source, fully client-side web app for transparent, tunable academic source discovery. You search several scholarly databases at once, and you can see and change exactly how the results are ranked.

It is made by a UBC first-year student for UBC's SCIE 113 course. Other students and universities are welcome to reuse it.

> **Status: early development (v0.1).** Search across nine sources at once (OpenAlex, Crossref, PubMed, Europe PMC, DOAJ, DataCite, Zenodo, Wikipedia and Semantic Scholar), duplicate merging, source labels, transparent ranking (BM25 relevance, citations, recency, peer review, open access, provider agreement), filters, a keyword-based counterarguments panel, a saved list with APA 7 references, a search-protocol export, and a single-file build all work. Unpaywall PDF links are not built yet, and arXiv cannot be searched from a browser (see docs/methodology.md).

## Principles

1. **No LLM anywhere in search or ranking.** Ranking is deterministic, and every ranking decision can be explained.
2. **You control everything.** You choose which sources are searched, which factors count, every weight and every filter. Nothing is hidden or forced.
3. **Honest about bias.** Algorithms are not unbiased. Limitations are documented, not hidden.
4. **Labels, not hidden filtering.** All source types are searched and shown, each one labelled. Nothing is filtered unless you choose to.
5. **No backend, no accounts, no analytics, and no API key needed.** Everything runs in your browser. If you want a higher daily limit from OpenAlex, you can optionally paste your own free key into Settings. It stays in your browser and is never sent anywhere except OpenAlex.

Labels and rankings are heuristics based on metadata. Verify sources before citing.

## How to use

1. Type a query and press Search (or Enter). Every selected source is asked at once, and results appear as each one answers. You can type a question ("what is the effect of sleep on memory?"), which is reduced to its keywords, or use `"quotes"` for a phrase and capitalised `OR`, `NOT` and parentheses. The box shows what was searched, and "Exact query sent to each source" shows what every source received.
2. Read the results, sorted by score and shown 25 to a page. A work found by several sources appears once, with every source listed. Each result shows its labels and why it got them.
3. Open "Why this rank?" on any result to see how each factor contributed: relevance (BM25 over title, abstract and subject terms), citations, recency, peer review, open access, provider agreement and study type. "Related terms" under the results suggests topics and MeSH headings from the top results; clicking one adds it to the search box, and nothing is searched until you press Search.
4. Press "Open" on the small "Counterarguments & limitations" bar above the results (it opens beside them on a wide screen), then "Search for counterarguments" to run a second search for sources that discuss limitations, criticism or corrections. Edit its terms, or type your own opposing search. Matched words are highlighted, and reviews, meta-analyses, retractions and corrections can be listed on their own. It is keyword-based and cannot tell whether a source actually disagrees: read before citing.
5. Change sources, filters or weights in Settings. Results re-rank instantly without re-fetching. If a label looks wrong, change it on the card.
6. Press "Save to list" on the sources you want to keep. Open "Saved list" to see them as APA 7 references (each with a small "Open via UBC Library" link), then copy them (italics are kept when you paste into Word or Google Docs) or download them as a text file. The list is kept in your browser only. Metadata can be incomplete, so each reference says what to check.
7. Press "Download search protocol (JSON)" to record the query, what each source received, the sources, filters, weights, date and how each source answered, so the search can be written up and repeated. It contains no API key.

Each result can offer an "Open access PDF" button (when a free PDF is known), an "Open via UBC Library" button (on every result with a DOI or link, if `libraryProxyPrefix` is set in `config.js`), and a DOI button. Open access does not affect the ranking by default, so results are never pushed down for being behind a paywall.

"Search elsewhere" links under the search box open the same query in Google Scholar, Google, DuckDuckGo and UBC Library's search.

Every source gets a status line (ok, rate-limited, failed or skipped), so a gap in the results is never silent. arXiv is skipped because its API cannot be used from a browser, and Semantic Scholar's free shared pool is often busy; see [docs/methodology.md](docs/methodology.md) for the details of each source.

Without an API key, OpenAlex allows roughly 100 searches a day. If you reach the limit, Sourcly shows OpenAlex as rate-limited. You can paste a free personal key from [openalex.org/settings/api](https://openalex.org/settings/api) into Settings to raise it.

## Install

Four ways to run Sourcly. All of them work the same way: your searches go straight from your browser to the scholarly databases, and nothing passes through a Sourcly server.

1. **Use the hosted site.** Open the hosted version in your browser. Nothing to install.
2. **Download and double-click.** Download `sourcly-<version>.zip` from the [latest release](https://github.com/ibrahimomeer/Sourcly/releases/latest), unzip it, and open `index.html`. The whole app is that one file, and it works from a folder without a server. Keep `config.js` beside it.
3. **Zip with a local server.** Unzip, then run `npx serve` in the folder and open the address it prints. Some people prefer this to opening a file.
4. **Development setup.** See below.

Everything you might want to change is in one plain file, `config.js`, which sits next to `index.html` and is not bundled: the site name, the name in the footer, the repository and download links, the library sign-in prefix for the "Open via UBC Library" button (empty hides it), and an optional contact email. Forks and downloaders edit only that file to rebrand, with no rebuild.

Checked in Chrome from a downloaded folder (`file://`): all sources that allow browser requests answered, and the saved list, exports and counterarguments panel worked. Other browsers treat files differently and were not checked.

### Hosting it yourself

The site is two static files, so any static host works. The `Dockerfile` builds it and serves it with nginx, and `railway.toml` points [Railway](https://railway.com) at that Dockerfile; Railway builds whichever branch you connect (`main` for the hosted site). Nothing in the container runs Sourcly's own code.

## Development

Requirements: Node.js 22.12 or newer, and [pnpm](https://pnpm.io) (run `corepack enable` to get the version pinned in `package.json`).

```bash
pnpm install
pnpm dev            # start the web app
pnpm typecheck
pnpm test
pnpm test:scripts   # tests for the build checker
pnpm build          # apps/web/dist: index.html (one file) and config.js
pnpm check:dist     # fails if index.html needs any file other than config.js
```

[CONTRIBUTING.md](CONTRIBUTING.md) explains how to work on the code, and [docs/adding-a-source.md](docs/adding-a-source.md) how to add a data source.

Repository layout:

```
packages/core/   providers, query parsing, BM25, classification, scoring, dedupe, APA formatting,
                 search protocol, saved list (no UI code)
apps/web/        the web app (React + Vite)
docs/            methodology and the guide to adding a source
scripts/         the single-file build checker
deploy/          nginx configuration used by the Dockerfile
```

## Branch workflow

Work happens on `dev`. `main` only receives reviewed, working states, and the hosted site is built from `main`. Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`).

## License

[MIT](LICENSE). Copyright (c) 2026 Sourcly.
