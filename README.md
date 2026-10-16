# Sourcly

Sourcly is an open-source, fully client-side web app for transparent, tunable academic source discovery. You search several scholarly databases at once, and you can see and change exactly how the results are ranked.

Sourcly is an independent student project. Other students and universities are welcome to reuse it.

## Disclaimer

Sourcly is an independent student project. It is not an official UBC service and is not affiliated with, endorsed by or supported by UBC or UBC Library. UBC Library links use your own UBC login, and access depends on UBC Library's subscriptions. Labels and rankings are heuristics based on metadata; verify sources before citing.

> **Status: early development (v0.1).** Search across sources at once (OpenAlex, Crossref, PubMed and Europe PMC are on by default; DOAJ, DataCite, Zenodo, Wikipedia and Semantic Scholar are one click away in Settings), duplicate merging, source labels, transparent ranking (BM25 relevance, term coverage, phrase matching, citations, recency, peer review, open access, provider agreement), filters, a keyword-based counterarguments panel, a saved list with APA 7 references, a search-protocol export, and a single-file build all work. A DOI, link or ID looks up one work (with Unpaywall PDF links when a contact email is set). arXiv cannot be searched from a browser (see docs/methodology.md).

## How to write a good search

- **Write the key concepts as nouns**, not a question: `machine learning odor prediction` works better than `how can computers understand what things smell like`.
- **Avoid question words and generic verbs** ("how", "understand", "use", "help", "new", "effect of"). They are not required, so they only add noise.
- **Use quotes for a phrase** that must stay together (`"double pendulum"`), and capitals for an abbreviation (`AI`, `CAN`): an abbreviation is matched with its capitals, as a whole word.
- **Check "How we searched"** if the results surprise you: it shows how your text was read, and "Search exactly as typed" in Settings turns the reading off.
- Search is lexical, not semantic: it matches words, and finds other words only through the short curated thesaurus. If a paper uses a word you did not think of, add it with `OR`.

## Principles

1. **No LLM anywhere in search or ranking.** Ranking is deterministic, and every ranking decision can be explained.
2. **You control everything.** You choose which sources are searched, which factors count, every weight and every filter. Nothing is hidden or forced.
3. **Honest about bias.** Algorithms are not unbiased. Limitations are documented, not hidden.
4. **Labels, not hidden filtering.** All source types are searched and shown, each one labelled. Nothing is filtered unless you choose to.
5. **No backend, no accounts, no analytics, and no API key needed.** Everything runs in your browser. If you want a higher daily limit from OpenAlex, you can optionally paste your own free key into Settings. It stays in your browser and is never sent anywhere except OpenAlex.

Labels and rankings are heuristics based on metadata. Verify sources before citing.

## How to use

1. Type a query and press Search (or Enter). Every selected source is asked at once, and results appear as each one answers. Write the key concepts, or a question, or use `"quotes"` for a phrase and capitalised `OR`, `NOT` and parentheses. Your text is never changed. Common words ("how", "the") are never searched, generic words ("understand", "using", "novel") are not required, and every other word or phrase is a **concept** that a result must match, by the word you typed or by a few curated alternatives (spellings, abbreviations, close synonyms): `odor` also matches "odour" and "olfaction"; `AI` also matches "machine learning". The collapsed **"How we searched"** under the results heading shows the concepts, which alternatives came from the thesaurus, the words that were set aside and the exact query each source received. In Settings, "Search exactly as typed" sends your text unchanged and "Expand with curated synonyms" turns the alternatives off. Under the search box, a collapsed "Suggested terms" line appears when the best results share at least three author keywords or MeSH headings; clicking one adds it to the box.
2. Read the results, shown 25 to a page. The main list holds the results that match every concept of your search (and, while fewer than 15 do, results that lack one concept, labelled "Matches N of M concepts"), ordered by how many concepts they match, then by whether neighbouring concepts appear next to each other, then by score. Everything else is kept, never deleted, in collapsed sections under it, each with a count: "Partial matches", "Other languages" (language is detected from the title and abstract; choose your preferred languages in Settings) and "Datasets, presentations and other types". Each card says which concept matched, by which word and where (`Matched: odor (olfaction, title)`). If fewer than 15 results match every concept, up to three fallback searches run by themselves, each with one concept dropped, and their results are labelled. A "Did you mean …?" link appears when a word looks like a typo; you must click it. A work found by several sources appears once, with every source listed once. Each result shows its labels and why it got them.
3. Open "Why this rank?" on any result to see how each factor contributed: relevance (BM25 over title, abstract and author keywords), term coverage and phrase match, citations, recency, peer review, open access, provider agreement and study type, and, for each concept, about 80 characters of the text where it matched.
4. Press "Open" on the small "Counterarguments & limitations" bar above the results (it opens beside them on a wide screen), then "Search for counterarguments" to run a second search for sources that discuss limitations, criticism or corrections. Edit its terms, or type your own opposing search. Matched words are highlighted, and reviews, meta-analyses, retractions and corrections can be listed on their own. It is keyword-based and cannot tell whether a source actually disagrees: read before citing.
5. Paste a DOI, a link (a publisher address that holds the DOI, an arXiv, PubMed or OpenAlex address), an arXiv, PubMed or OpenAlex ID, or a whole title in the same box. The page says what it detected ("Detected: DOI. Search as keywords instead"). A DOI, link or ID looks up that one work: a detailed card, with buttons for its references, the works citing it and related papers. A title also shows its "Closest match for this title" above the ordinary results. A page that is not a DOI or an ID is looked up by its address in OpenAlex only; Sourcly cannot read arbitrary pages. Change sources, filters or weights in Settings. Results re-rank instantly without re-fetching. If a label looks wrong, change it on the card.
6. Press "Save to list" on the sources you want to keep. Open "Saved list" to see them as APA 7 references (each with a small "Access with UBC Library" link), then copy them (italics are kept when you paste into Word or Google Docs) or download them as a text file. The list is kept in your browser only. Metadata can be incomplete, so each reference says what to check.
7. Open "In-text citations" to copy the APA 7 in-text citation for each saved source, in brackets or in a sentence, such as `(Stickgold, 2005)` and `Stickgold (2005)`. They match your reference list.
8. Press "Download search protocol (JSON)" to record the query, what each source received, the sources, filters, weights, date and how each source answered, so the search can be written up and repeated. It contains no API key.

Each result can offer an "Open access PDF" button (when a free PDF is known), an "Access with UBC Library" button (on every result with a DOI or link, if `libraryProxyPrefix` is set in `config.js`), and a DOI button. Open access does not affect the ranking by default, so results are never pushed down for being behind a paywall.

"Search elsewhere" links under the search box open the same query in Google Scholar, Google, DuckDuckGo and UBC Library's search.

Every source that is asked gets a status line (ok, rate-limited, failed or skipped), so a gap in the results is never silent. The four default sources are the ones that give clean scholarly records; DataCite and Zenodo (anyone can upload), DOAJ, Wikipedia (at most 5 pages) and Semantic Scholar (its free shared pool is often busy) are off until you switch them on. arXiv is skipped because its API cannot be used from a browser; see [docs/methodology.md](docs/methodology.md) for the details of each source.

Without an API key, OpenAlex allows roughly 100 searches a day, shared with everyone on your network address (a search with a second page, or a fallback, uses more than one). If you reach the limit, Sourcly shows OpenAlex as rate-limited. You can paste a free personal key from [openalex.org/settings/api](https://openalex.org/settings/api) into Settings to raise it.

## Install

Four ways to run Sourcly. All of them work the same way: your searches go straight from your browser to the scholarly databases, and nothing passes through a Sourcly server.

1. **Use the hosted site.** Open the hosted version in your browser. Nothing to install.
2. **Download and double-click.** Download `sourcly-<version>.zip` from the [latest release](https://github.com/ibrahimomeer/Sourcly/releases/latest), unzip it, and open `index.html`. The whole app is that one file, and it works from a folder without a server. Keep `config.js` beside it.
3. **Zip with a local server.** Unzip, then run `npx serve` in the folder and open the address it prints. Some people prefer this to opening a file.
4. **Development setup.** See below.

Everything you might want to change is in one plain file, `config.js`, which sits next to `index.html` and is not bundled: the site name, the name in the footer, the institution and library names used in the "not affiliated" notice (forks: change them and the README Disclaimer), the repository and download links, the library sign-in prefix for the "Access with UBC Library" button (empty hides it), and an optional contact email. Forks and downloaders edit only that file to rebrand, with no rebuild.

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
pnpm test:scripts   # tests for the build checker and the version tools
pnpm build          # apps/web/dist: index.html (one file) and config.js
pnpm check:dist     # fails if index.html needs any file other than config.js
pnpm eval:search    # live-network search quality check; not part of CI
pnpm version:set 0.2.0   # change the version: the one place it is written is package.json
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

## Evaluating search quality

`pnpm eval:search` runs twelve real searches (`apps/web/eval/benchmark.json`) and two lookups against the live sources and prints, for each, the sources used with counts, the concepts and their variants, the exact query each source received, whether a fallback ran, the top 15 results with the concepts they matched (variant and field) and their section, and where the papers a good search should find (`mustInclude`, DOIs checked against Crossref or DataCite) landed, then PASS, FAIL or SKIP checks. It also writes `apps/web/eval/output/<query>.md` (not committed). It needs the network and is not part of `pnpm test` or CI. Answers are kept on disk for a day (`apps/web/eval/.cache/`, not committed) so repeated runs do not use up the free allowances; `EVAL_REFRESH=1` asks again, and an optional `OPENALEX_API_KEY` in the environment raises OpenAlex's allowance. See "The benchmark" in [docs/methodology.md](docs/methodology.md).
