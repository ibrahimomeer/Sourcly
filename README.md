# Sourcly

Sourcly is an open-source, fully client-side web app for transparent, tunable academic source discovery. You search several scholarly databases at once, and you can see and change exactly how the results are ranked.

It is made by a UBC first-year student for UBC's SCIE 113 course. Other students and universities are welcome to reuse it.

> **Status: early development.** Search across nine sources at once (OpenAlex, Crossref, PubMed, Europe PMC, DOAJ, DataCite, Zenodo, Wikipedia and Semantic Scholar), duplicate merging, source labels, ranking, filters and the Settings panel work. Relevance is scored locally with BM25, results are compared across sources, and the query box understands phrases, `AND`/`OR`/`NOT` and plain questions. Reference and search-protocol export, a counterarguments panel and the release build are still to come. Sections marked _(planned)_ describe what is coming.

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
4. Change sources, filters or weights in Settings. Results re-rank instantly without re-fetching. If a label looks wrong, change it on the card.
5. Export a reference list (APA 7) or a search protocol (JSON). _(planned)_

Each result can offer an "Open access PDF" button (when a free PDF is known), an "Open via UBC Library" button (on every result with a DOI or link, if `libraryProxyPrefix` is set in `config.js`), and a DOI button. Open access does not affect the ranking by default, so results are never pushed down for being behind a paywall.

"Search elsewhere" links under the search box open the same query in Google Scholar, Google, DuckDuckGo and UBC Library's search.

Every source gets a status line (ok, rate-limited, failed or skipped), so a gap in the results is never silent. arXiv is skipped because its API cannot be used from a browser, and Semantic Scholar's free shared pool is often busy; see [docs/methodology.md](docs/methodology.md) for the details of each source.

Without an API key, OpenAlex allows roughly 100 searches a day. If you reach the limit, Sourcly shows OpenAlex as rate-limited. You can paste a free personal key from [openalex.org/settings/api](https://openalex.org/settings/api) into Settings to raise it.

## Install _(planned)_

The first release will offer four ways to run Sourcly:

1. **Hosted site.** Open the hosted version in your browser.
2. **Download and double-click.** Download the release zip and open `index.html`.
3. **Zip with a local server.** Unzip, then run `npx serve` in the folder.
4. **Development setup.** See below.

Everything is configured in one plain file, `config.js`, which sits next to `index.html` and is not bundled. Forks and downloaders edit only that file to rebrand.

## Development

Requirements: Node.js 22.12 or newer, and [pnpm](https://pnpm.io) (run `corepack enable` to get the version pinned in `package.json`).

```bash
pnpm install
pnpm dev        # start the web app
pnpm typecheck
pnpm test
pnpm build
```

Repository layout:

```
packages/core/   providers, classification, scoring, dedupe, APA formatting (no UI code)
apps/web/        the web app (React + Vite)
docs/            methodology and contributor docs
```

## Branch workflow

Work happens on `dev`. `main` only receives reviewed, working states, and the hosted site is built from `main`. Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`).

## License

[MIT](LICENSE). Copyright (c) 2026 Sourcly.
