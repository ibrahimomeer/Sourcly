# Adding a source

A source (a "provider") is one scholarly database that Sourcly searches straight from the browser. This page is the checklist for adding one. Please follow the order: most mistakes come from writing code before checking what the source really does.

## 1. Check that a browser may call it

Sourcly has no server and never will, so a source that browsers cannot read cannot be added. Check **from a web origin and from `file://`** (the single-file build is opened from a file, and a page opened that way sends the origin `null`):

```bash
URL='https://api.example.org/search?q=sleep'
curl -s -D - -o /dev/null -H 'Origin: https://example.org' "$URL" | grep -i '^access-control'
curl -s -D - -o /dev/null -H 'Origin: null'                "$URL" | grep -i '^access-control'
```

You need `access-control-allow-origin` to be `*` or to echo the origin, for both. Also check:

- A **plain GET with no custom headers** works (a custom header makes the browser send a "preflight" request first, which many APIs refuse).
- **No key or sign-up** is needed (a user may paste a personal key in Settings only for OpenAlex).
- An **error answer** (for example HTTP 429) also carries the CORS header. If it does not, the browser cannot read it and the page can only say "no readable answer" (Semantic Scholar behaves like this).

If the source fails these checks, **do not add a proxy.** Add it to `UNAVAILABLE_PROVIDERS` in `apps/web/src/providers.ts` with the reason, as arXiv is, so the gap is shown instead of silent.

## 2. Read the official documentation, then check real behaviour

Write down, with the date you checked: the endpoint; the query parameter; the largest page size (and ask for no more, as an over-large request may be refused or slow); the rate limit; which fields hold title, authors, year, venue, DOI, abstract, type, citation count, language, open-access information and retraction status; and **how the query is read**.

For the last point, test it: search for a word, then the word in quotes, with `OR`, with `NOT`, and in parentheses, and compare the result counts. Then set the provider's `syntax`:

- `"boolean"`: understands `AND`, `OR`, `NOT`, quoted phrases and parentheses (Sourcly writes every `AND` out and puts a leave-out last, as `x NOT y`).
- `"plain"`: takes only a list of words. Sourcly sends just the words and tells the user what it could not apply.

Never use a field you have not seen in a real response.

## 3. Register the source

- `packages/core/src/types.ts`: add the id to `ProviderId` and a name to `PROVIDER_NAMES`.
- `packages/core/src/dedupe.ts`: put it in `PROVIDER_PRIORITY`. When two sources disagree about a field, the one earlier in this list wins, so put the best-curated metadata first.

## 4. Write the provider

Create `packages/core/src/providers/<name>.ts`. Follow `wikipedia.ts` (the smallest) and `doaj.ts` (a typical one). Two exports:

- `parse<Name>Record(raw, rank, listSize): Result | null`. Defensive: the response is untrusted, so read every field through the helpers in `../json` (`asString`, `asRecord`, ...) and `./shared`, and return `null` for a record you cannot identify. Anything unknown is `null` or empty, never guessed.
- `create<Name>Provider(options)`, which returns a `Provider`: `id`, `name`, `syntax`, and `search(query, { limit, signal })`. Use `requestJson` (it makes one plain GET and turns every failure into a `ProviderError` with a clear, key-free message, and HTTP 429 into "rate-limited"), `clampLimit` for the page size, and return `[]` for a blank query. Accept `fetch` in the options so tests can pass a fake.

Fill the whole `Result`: title, authors (family and given names when the source gives them), year, venue and its kind, `volume`/`issue`/`pages` (for APA references), DOI, link, abstract, type and the raw type it came from, citation count, language, author countries, open access, retraction, `subjects` (topics, keywords, MeSH headings) and `hits` (which source, its id, the rank and the list size).

Labels need the raw type: map the source's own type vocabulary onto `WorkType`, and keep the original in `rawType`, so a label can always say which field it came from.

## 5. Test it

- Save a **real response** to `packages/core/src/providers/__fixtures__/<name>.json` and scrub personal data (researchers' emails become `redacted@example.org`).
- `<name>.test.ts`: parse every record in the fixture, a sparse record (no authors, no date, no abstract), and a record it must reject. Check type mapping, open-access and retraction handling, `volume`/`issue`/`pages`, and subjects.
- Add the provider to the `cases` list in `contract.test.ts`. It checks, for every source, that there is one plain GET to the documented host, that the page size is capped, that the caller's cancellation is passed on, that the query is sent exactly as given, and that each kind of failure gives a clear message.
- Export it from `packages/core/src/index.ts`.

## 6. Add it to the app

In `apps/web/src/providers.ts`, add an entry to `PROVIDER_OPTIONS` (name and a one-line description for Settings) and a case in `create()`. Update `providers.test.ts`.

## 7. Document it

- `docs/methodology.md`: a section under "Provider notes" saying what was checked and when (endpoint, page size, limits, CORS from a web origin and from `file://`, query syntax, how types are mapped), and an entry under "Known limitations" if the source has a bias or a gap the user should know about.
- The list of sources in `README.md`, and the query table in "Writing a search" if it reads queries differently.

## 8. Try it for real

Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Then search in `pnpm dev`, and **open the built `apps/web/dist/index.html` from a folder** and search again: the source must answer from `file://` too. If it works in one and not the other, say so in the methodology rather than hiding it.
