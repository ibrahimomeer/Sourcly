import {
  coverageSpec,
  createCrossrefProvider,
  createOpenAlexProvider,
  defaultFilters,
  defaultLayoutSettings,
  defaultScoringSettings,
  measureCoverage,
  parseQuery,
  planQueries,
  queryTerms,
  renderQuery,
  type ProviderId,
  type Result,
} from "@sourcly/core";
import { makeResult } from "@sourcly/core/testing";
import { describe, expect, it } from "vitest";
import { queryChipsModel } from "./chipsModel";
import { allResults, rankResults, scoringContext, type RankedView } from "./pipeline";
import { prepareSearch } from "./queryText";
import { idleSearch, searchReducer } from "./searchState";
// Real answers, recorded on 2026-10-15 from the requests the app made for "caos double pendulum" before
// it sent strict queries, which is the pool of candidates that produced the bad top results:
// - OpenAlex's plain full-text `search` for "caos AND double AND pendulum" (15 of its 100 works);
// - Crossref's plain `query` for "caos double pendulum" (27 of its 100 items);
// and OpenAlex's `search.title_and_abstract` for "chaos AND double AND pendulum" (its first 12 works), which is
// what the app asks for now and where the real double pendulum papers come from.
// A selection of the items was kept so the files stay small; every item is as the source sent it, except
// that third-party email addresses in abstracts were replaced by redacted@example.org.
import crossrefPlain from "./__fixtures__/crossref-caos-plain.json";
import openalexFulltext from "./__fixtures__/openalex-caos-fulltext.json";
import openalexStrict from "./__fixtures__/openalex-chaos-double-pendulum.json";

// ---- The recorded answers, read by the app's own provider code.

const answering = (body: unknown) => () => Promise.resolve(Response.json(body));

async function recorded(): Promise<Result[]> {
  const options = { limit: 100 };
  const [oldOpenAlex, oldCrossref, strictOpenAlex] = await Promise.all([
    createOpenAlexProvider({ fetch: answering(openalexFulltext) }).search("caos AND double AND pendulum", options),
    createCrossrefProvider({ fetch: answering(crossrefPlain) }).search("caos double pendulum", options),
    createOpenAlexProvider({ fetch: answering(openalexStrict) }).search("chaos AND double AND pendulum", options),
  ]);
  return [...oldOpenAlex, ...oldCrossref, ...strictOpenAlex];
}

const providers: { id: ProviderId; syntax: "boolean" | "plain" }[] = [
  { id: "openalex", syntax: "boolean" },
  { id: "crossref", syntax: "plain" },
];

/** The recorded pool, ranked for a search typed as `text`, the way the page does it. */
function rankFor(pool: readonly Result[], text: string): RankedView {
  const parsed = parseQuery(text);
  const state = searchReducer(idleSearch, {
    type: "start",
    id: 1,
    parsed,
    sent: planQueries(providers, parsed),
    order: providers.map((p) => p.id),
    skipped: [],
  });
  if (state.phase === "idle") throw new Error("expected an active search");
  return rankResults(pool, { scoring: defaultScoringSettings(), filters: defaultFilters(), overrides: new Map(), layout: defaultLayoutSettings() }, scoringContext(state, 2026));
}

const titleOf = (scored: { result: Result }) => scored.result.title;
const everyone = (ranked: RankedView) => [...ranked.shown, ...ranked.partial];
const everything = (ranked: RankedView) => allResults(ranked);

/** Whether a ranked result contains the word as a term of the search, by the coverage that ranking worked out. */
const contains = (scored: RankedView["shown"][number], term: string) =>
  scored.coverage?.units.some((unit) => unit.label.toLowerCase() === term && unit.matched) === true;

// ---- The three results that were reported, by what they are.

const SLAG = /steel slag asphalt/i;
const CAOS_EDITORIAL = (result: Result) => /editorial/i.test(result.title) && /CAOS/.test(result.venue ?? "");
const SPANISH_CHAOS = /Rotura de maquinaria: Una explicación a partir de la Teoría del Caos/;

describe("the recorded answers", () => {
  it("are read by the providers, and hold the three results that were reported", async () => {
    const pool = await recorded();
    expect(pool.length).toBeGreaterThanOrEqual(50);
    expect(pool.filter((r) => SLAG.test(r.title))).toHaveLength(1);
    expect(pool.filter((r) => SPANISH_CHAOS.test(r.title))).toHaveLength(1);
    expect(pool.filter(CAOS_EDITORIAL).length).toBeGreaterThanOrEqual(1);
  });

  it("also hold real papers about the double pendulum", async () => {
    const pool = await recorded();
    const double = pool.filter((r) => /double/i.test(r.title) && /pendul/i.test(r.title));
    expect(double.length).toBeGreaterThanOrEqual(10);
  });

  it("have no third-party email address left in them", () => {
    for (const body of [crossrefPlain, openalexFulltext, openalexStrict]) {
      expect(JSON.stringify(body).match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi)?.filter((m) => m !== "redacted@example.org") ?? []).toEqual([]);
    }
  });
});

describe("“caos double pendulum”: results that lack “pendulum” never outrank results that have “double pendulum”", () => {
  const adjacent = (r: RankedView["shown"][number]) => r.coverage?.pairs.find((pair) => pair.text === "double pendulum")?.found != null;

  it("holds in the main list and the partial matches read in order", async () => {
    const pool = await recorded();
    const order = everyone(rankFor(pool, "caos double pendulum"));
    expect(order.length).toBeGreaterThan(30);

    const without = order.map((r, index) => ({ r, index })).filter(({ r }) => !contains(r, "pendulum"));
    const withBoth = order.map((r, index) => ({ r, index })).filter(({ r }) => contains(r, "double") && contains(r, "pendulum"));
    expect(without.length).toBeGreaterThan(3);
    expect(withBoth.length).toBeGreaterThan(10);
    expect(Math.max(...withBoth.map(({ index }) => index))).toBeLessThan(Math.min(...without.map(({ index }) => index)));
  });

  it("fails when the order ignores how many words a result contains", async () => {
    // The same results ordered by score alone: the check above would not hold.
    const pool = await recorded();
    const ranked = rankFor(pool, "caos double pendulum");
    const byScore = [...ranked.shown, ...ranked.partial].sort((a, b) => b.score - a.score);
    const lastBoth = Math.max(...byScore.map((r, i) => (contains(r, "double") && contains(r, "pendulum") ? i : -1)));
    const firstWithout = Math.min(...byScore.map((r, i) => (!contains(r, "pendulum") ? i : Number.MAX_SAFE_INTEGER)));
    expect(lastBoth).toBeGreaterThan(firstWithout);
  });

  it("puts the Spanish paper in Other languages and the CAOS editorials in Partial matches, and deletes none of them", async () => {
    const pool = await recorded();
    const ranked = rankFor(pool, "caos double pendulum");
    expect(ranked.shown.filter((r) => SPANISH_CHAOS.test(r.result.title) || CAOS_EDITORIAL(r.result))).toEqual([]);
    expect(ranked.otherLanguages.filter((r) => SPANISH_CHAOS.test(r.result.title))).toHaveLength(1);
    expect(ranked.partial.filter((r) => CAOS_EDITORIAL(r.result)).length).toBeGreaterThanOrEqual(1);
    expect(ranked.hidden).toEqual([]);
  });

  it("lists in the main list only results that lack at most one word, and says what each partial match has", async () => {
    const pool = await recorded();
    const ranked = rankFor(pool, "caos double pendulum");
    for (const scored of ranked.shown) expect(scored.coverage?.matchedCount).toBeGreaterThanOrEqual((scored.coverage?.total ?? 0) - 1);
    for (const scored of ranked.partial) {
      expect(scored.coverage?.matchedCount).toBeLessThan((scored.coverage?.total ?? 0) - 1);
      expect(scored.tier).toBeGreaterThan(1);
    }
  });

  it("ranks the three reported results below every result that contains every word", async () => {
    const pool = await recorded();
    // The main list and the sections, one after the other: the main list comes first and its full matches come first in it.
    const ranked = rankFor(pool, "caos double pendulum");
    const order = [...ranked.shown, ...ranked.partial, ...ranked.otherLanguages, ...ranked.otherTypes];
    const lastFull = Math.max(...order.map((r, i) => (r.tier === 1 ? i : -1)));
    const reported = order.map((r, i) => ({ r, i })).filter(({ r }) => SLAG.test(titleOf(r)) || SPANISH_CHAOS.test(titleOf(r)) || CAOS_EDITORIAL(r.result));
    expect(reported.length).toBeGreaterThanOrEqual(3);
    for (const { i } of reported) expect(i).toBeGreaterThan(lastFull);
  });

  it("ranks the steel slag paper below every result that has the words “double pendulum” next to each other", async () => {
    const pool = await recorded();
    const order = everyone(rankFor(pool, "caos double pendulum"));
    const slag = order.findIndex((r) => SLAG.test(titleOf(r)));
    const lastAdjacent = Math.max(...order.map((r, i) => (adjacent(r) ? i : -1)));
    expect(slag).toBeGreaterThan(-1);
    expect(lastAdjacent).toBeGreaterThan(-1);
    expect(slag).toBeGreaterThan(lastAdjacent);
  });

  it("matches the Spanish paper and the CAOS editorials on “caos” alone, or on nothing, so they are in the lowest tier", async () => {
    const pool = await recorded();
    const order = everything(rankFor(pool, "caos double pendulum"));
    const spanish = order.find((r) => SPANISH_CHAOS.test(titleOf(r)));
    expect(spanish?.tier).toBe(3);
    expect(spanish?.coverage?.units.filter((u) => u.matched).map((u) => u.label)).toEqual(["caos"]);
    // A journal called CAOS is not a match: only a result's title, keywords and abstract are read, not its venue.
    const editorials = order.filter((r) => CAOS_EDITORIAL(r.result));
    expect(editorials.length).toBeGreaterThanOrEqual(1);
    for (const editorial of editorials) {
      expect(editorial.tier).toBe(3);
      // Most are titled just "EDITORIAL" and match nothing; one says "Revista Caos" in its title and matches only "caos".
      expect(editorial.coverage?.units.filter((u) => u.matched).every((u) => u.label === "caos")).toBe(true);
    }
    expect(editorials.some((e) => e.coverage?.matchedCount === 0)).toBe(true);
  });

  it("no longer matches “caos” in the steel slag paper: its abstract says “CaO” (calcium oxide), and “caos” is not “cao”", async () => {
    const pool = await recorded();
    const ranked = rankFor(pool, "caos double pendulum");
    const slag = everything(ranked).find((r) => SLAG.test(titleOf(r)));
    expect(slag?.coverage?.units.map((u) => [u.label, u.matched])).toEqual([["caos", false], ["double", false], ["pendulum", true]]);
    expect(slag?.tier).toBe(3);
    // It is kept apart in Partial matches, not deleted, and the card says what it matched.
    expect(ranked.partial.some((r) => SLAG.test(titleOf(r)))).toBe(true);
    expect(ranked.shown.some((r) => SLAG.test(titleOf(r)))).toBe(false);
  });
});

describe("the same words in another order, or with a phrase, give the same top set", () => {
  const typed = ["chaos double pendulum", "double pendulum chaos", '"double pendulum" chaos'];
  const ids = (list: RankedView["shown"]) => list.map((r) => r.result.id).sort();

  it("lists exactly the same results in the main list and in Partial matches when only the order of the words changes", async () => {
    const pool = await recorded();
    const [first, second] = [rankFor(pool, typed[0] as string), rankFor(pool, typed[1] as string)];
    expect(first.shown.length).toBeGreaterThan(5);
    expect(ids(second.shown)).toEqual(ids(first.shown));
    expect(ids(second.partial)).toEqual(ids(first.partial));
  });

  it("puts the same ten results at the top for all three", async () => {
    const pool = await recorded();
    const tops = typed.map((text) => ids(rankFor(pool, text).shown.slice(0, 10)));
    expect(tops[0]).toHaveLength(10);
    expect(tops[1]).toEqual(tops[0]);
    expect(tops[2]).toEqual(tops[0]);
  });

  it("makes the quoted phrase the stricter search: its main list is part of the other, and the difference lacks the adjacent words", async () => {
    const pool = await recorded();
    const loose = rankFor(pool, typed[0] as string);
    const quoted = rankFor(pool, typed[2] as string);
    const looseIds = new Set(loose.shown.map((r) => r.result.id));
    expect(quoted.shown.every((r) => looseIds.has(r.result.id))).toBe(true);

    const quotedIds = new Set(quoted.shown.map((r) => r.result.id));
    const dropped = loose.shown.filter((r) => !quotedIds.has(r.result.id));
    for (const scored of dropped) {
      // "double pendulum" is in the text, but not as adjacent words in the title or abstract.
      expect(scored.coverage?.pairs.find((pair) => pair.text === "double pendulum")?.found).toBeNull();
    }
  });
});

describe("“what is the best way to predict odor”", () => {
  const text = "what is the best way to predict odor";

  it("shows the removed common words as ignored chips, in order, and keeps the others as terms", () => {
    const parsed = prepareSearch(text).parsed;
    const model = queryChipsModel(parsed, "best way predict odor");
    expect(model.ignored).toEqual(["what", "is", "the", "to"]);
    expect(queryTerms(parsed)).toEqual(["best", "way", "predict", "odor"]);
    expect(model.questionNote).toBe("Question reduced to keywords: best way predict odor. You can edit or restore words above.");
  });

  it("never changes the text in the box", () => {
    const prepared = prepareSearch(text);
    expect(prepared.parsed.original).toBe(text);
    expect("box" in prepared).toBe(false);
  });

  it("restores a word as an ordinary term when it is clicked", () => {
    const parsed = prepareSearch(text, { restored: new Set(["is"]) }).parsed;
    expect(queryTerms(parsed)).toEqual(["is", "best", "way", "predict", "odor"]);
    expect(queryChipsModel(parsed, "").ignored).toEqual(["what", "the", "to"]);
    // Restoring one word restores no other.
    expect(queryTerms(parsed)).not.toContain("what");
  });

  it("removes nothing when “Ignore common words” is off", () => {
    const parsed = prepareSearch(text, { ignoreCommon: false }).parsed;
    expect(queryTerms(parsed)).toEqual(["what", "is", "the", "best", "way", "to", "predict", "odor"]);
    expect(queryChipsModel(parsed, "").ignored).toEqual([]);
    expect(parsed.droppedStopwords).toEqual([]);
  });

  it("sends the raw text, unchanged, to every source when searched exactly as typed", () => {
    const parsed = prepareSearch(text, { exact: true }).parsed;
    for (const syntax of ["boolean", "boolean-flat", "pubmed", "europepmc", "plain", "plain-spaced"] as const) {
      expect(renderQuery(parsed, syntax).text).toBe(text);
    }
  });

  it("sends the words that remain, joined by AND, to a source that reads Boolean searches", () => {
    expect(renderQuery(prepareSearch(text).parsed, "boolean").text).toBe("best AND way AND predict AND odor");
  });
});

describe("all-capital words, quoted phrases and single words", () => {
  it("keeps an all-capital word as a term, but drops the same word in lowercase", () => {
    expect(queryTerms(parseQuery("CAN bus message"))).toEqual(["CAN", "bus", "message"]);
    expect(queryTerms(parseQuery("can bus message"))).toEqual(["bus", "message"]);
    expect(queryTerms(parseQuery("US IT policy"))).toEqual(["US", "IT", "policy"]);
    expect(queryChipsModel(parseQuery("CAN bus"), "").ignored).toEqual([]);
  });

  it("keeps every word inside quotes, common ones too, and writes the phrase out as it is", () => {
    const parsed = parseQuery('"state of the art" and "to be or not to be"');
    expect(parsed.droppedStopwords).toEqual(["and"]);
    expect(renderQuery(parsed, "boolean").text).toBe('"state of the art" AND "to be or not to be"');
  });

  it("matches a quoted phrase only as adjacent words, in that order", () => {
    const spec = coverageSpec(parseQuery('"state of the art"'));
    const adjacent = makeResult({ title: "The state of the art in odor prediction" });
    const scattered = makeResult({ title: "The art of the state: a history" });
    expect(measureCoverage(adjacent, spec).matchedCount).toBe(1);
    expect(measureCoverage(scattered, spec).matchedCount).toBe(0);
  });

  it("still works for a single word: it is a term, it is sent as it is, and results are ranked by it", async () => {
    const parsed = parseQuery("odor");
    expect(queryTerms(parsed)).toEqual(["odor"]);
    expect(renderQuery(parsed, "boolean").text).toBe("odor");
    expect(renderQuery(parsed, "plain").text).toBe("odor");
    const pool = [
      makeResult({ id: "10.1/a", doi: "10.1/a", title: "Odor prediction from molecules" }),
      makeResult({ id: "10.1/b", doi: "10.1/b", title: "Gardening" }),
    ];
    const ranked = rankFor(pool, "odor");
    expect(ranked.shown.map((r) => r.result.id)).toEqual(["10.1/a"]);
    expect(ranked.partial.map((r) => r.result.id)).toEqual(["10.1/b"]);
  });

  it("does not use a single common word as a search, and says what to do (the page shows the message)", () => {
    expect(prepareSearch("the").usable).toBe(false);
    expect(prepareSearch("the", { ignoreCommon: false }).usable).toBe(true);
  });
});
