# Contributing to Sourcly

Thank you for helping. Sourcly is small on purpose, and clarity and trustworthiness matter more than the number of features. Please read the principles first: a change that breaks one of them will not be merged, however useful it is.

## Principles

1. **No LLM anywhere in search or ranking.** Ranking is deterministic and every decision can be explained.
2. **The user controls everything.** Sources, factors, weights and filters are theirs to change. Nothing is hidden or forced.
3. **Honest about bias.** Limitations are documented in `docs/methodology.md`, not hidden.
4. **Labels, not hidden filtering.** Every source type is searched and shown, with a label. Nothing is filtered unless the user chooses.
5. **No backend, no accounts, no analytics, no API key needed.** Everything runs in the browser. The one optional key (a personal OpenAlex key) lives only in the user's browser, never in the repository.

Every ranking factor, label and panel must be explained **in the app** and **in `docs/methodology.md`**. If you change how something works, change both.

## Setting up

You need Node.js 22.12 or newer and [pnpm](https://pnpm.io) (run `corepack enable` to get the version pinned in `package.json`).

```bash
pnpm install
pnpm dev            # the web app, with live reload
pnpm typecheck
pnpm test           # core and web unit tests
pnpm test:scripts   # tests for the scripts in scripts/ (single-file check, version tools)
pnpm version:check  # the version in package.json and CITATION.cff agree
pnpm version:set 0.2.0   # change the version (the only place to change it)
pnpm build          # builds apps/web/dist: index.html (one file) and config.js
pnpm check:dist     # fails if index.html needs any file other than config.js
```

`pnpm --filter @sourcly/core test:live` is an opt-in smoke test against the real OpenAlex API. It is not part of `pnpm test`, so CI never depends on the network or spends OpenAlex's small keyless daily allowance. Please run it sparingly.

## Where things live

```
packages/core/   providers, query parsing, BM25 relevance, labels, scoring, merging, APA 7 references,
                 search protocol, saved list. No UI code and no DOM, so it can be tested in Node
                 (and used by a command-line tool later).
apps/web/        the React app and its plain CSS. Logic that is not about drawing lives in plain
                 modules with tests (pipeline.ts, searchState.ts, queryText.ts, savedStore.ts, ...).
docs/            methodology.md (how everything is worked out) and adding-a-source.md.
scripts/         the single-file build checker and the version tools.
```

## Rules for code

- TypeScript everywhere, no `any`. Keep dependencies minimal: ask before adding one.
- **Never invent an API field or parameter.** Check the source's current official documentation, and check real behaviour (a real request, from a browser origin and from `file://`). Say what was checked and when in a comment or in `docs/methodology.md`.
- Test fixtures are **real recorded responses**, never hand-written ones that pretend to be real. Scrub anything personal (researchers' email addresses become `redacted@example.org`). Hand-written test input is fine when it is clearly a small case.
- **No secrets and no personal data** in the repository: no API keys, no email addresses, no personal names beyond what is public metadata inside a recorded fixture. The copyright holder is "Sourcly".
- Plain grayscale UI: no colours, gradients, shadows, animations or icon sets. Things are told apart by text and border style.
- Anything that talks to a source must fail gracefully: one source failing never breaks the search, and its status is shown.

## Branches and commits

- Work on `dev`. `main` receives reviewed, working states only, and the hosted site is built from it.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`.
- Before you open a pull request, run `pnpm typecheck`, `pnpm test`, `pnpm test:scripts`, `pnpm build` and `pnpm check:dist`. CI runs the same.
- Try the change in a real browser, and try the built `dist/index.html` by double-clicking it (a page opened from a file is treated differently from one served by a server).

## Adding a data source

See [docs/adding-a-source.md](docs/adding-a-source.md). The short version: check that the source allows browser requests first, and if it does not, do not add a proxy or a server. List it as unavailable instead, with the reason.

## Making a release

1. Set the new version in **one place**, the `version` line of the root `package.json`, with `pnpm version:set 0.2.0` (it also updates `CITATION.cff`, the one file that repeats it). The footer ("v0.2.0"), the search protocol and the release zip name all read it from there; the other `package.json` files carry no version on purpose. `pnpm version:check` (also run by CI) fails if anything disagrees. Commit on `dev`, review, and merge to `main`.
2. Tag the commit on `main`: `git tag v0.2.0 && git push origin v0.2.0`.
3. The `Release` workflow typechecks, tests and builds, checks that `index.html` is a single file, checks that the tag equals the version, and attaches `sourcly-0.2.0.zip` (the site, `config.js`, a short README and the licence) to a GitHub Release. The footer's "Download" link points at `releases/latest`.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).
