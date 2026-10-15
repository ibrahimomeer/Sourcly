import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync, writeSync } from "node:fs";
import { resolveLanguage } from "@sourcly/core";
import { runLookup, runSearch, type QueryReport } from "./harness";

// `pnpm eval:search`. Live network, not part of CI. Prints, for each query: the sources used with counts, the
// top 15 (title, year, sources, matched words, section, detected language), and any "Did you mean" suggestion.

const QUERIES = [
  "chaos double pendulum",
  "caos double pendulum",
  "double pendulum chaos",
  "machine learning odor prediction molecular structure",
  "can AI predict what a molecule smells like",
  "quantitative structure-odor relationship",
  "CAN bus protocol",
  "climate change impact on coral reefs",
];
const LOOKUPS = ["10.1016/B978-0-323-99796-6.00014-X", "https://www.nature.com/articles/s42004-024-01373-2"];

// Written straight to the terminal, because the test runner would otherwise keep what a passing test prints.
const print = (text: string) => writeSync(1, `${text}\n`);

const reports = new Map<string, QueryReport>();
const checks: string[] = [];

const check = (label: string, ok: boolean, detail = "") => {
  checks.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail === "" ? "" : `  (${detail})`}`);
  return ok;
};

describe("search eval", () => {
  for (const query of QUERIES) {
    it(query, async () => {
      const report = await runSearch(query);
      reports.set(query, report);
      print(report.lines.join("\n"));
    });
  }
  for (const input of LOOKUPS) {
    it(`lookup ${input}`, async () => {
      const report = await runLookup(input);
      reports.set(input, report);
      print(report.lines.join("\n"));
    });
  }

  afterAll(() => {
    const phrase = (title: string, abstract: string | null) => /double[\s-]+(inverted\s+|compound\s+)?pendul/i.test(`${title} ${abstract ?? ""}`);
    for (const query of ["chaos double pendulum", "caos double pendulum", "double pendulum chaos"]) {
      const ranked = reports.get(query)?.ranked;
      const top = ranked?.shown.slice(0, 10) ?? [];
      const bad = top.filter((s) => !phrase(s.result.title, s.result.abstract) && !s.result.hits.every((h) => h.expanded === true));
      check(`top 10 of "${query}" contain "double pendulum" (or are labelled expanded)`, top.length >= 10 && bad.length === 0, `${top.length} shown, ${bad.length} without it: ${bad.map((s) => s.result.title.slice(0, 40)).join(" / ")}`);
    }
    const typo = reports.get("caos double pendulum");
    check(`"caos double pendulum" shows "Did you mean: chaos ..."`, typo?.suggestion !== null && /\bchaos\b/i.test(typo?.suggestion ?? ""), typo?.suggestion ?? "no suggestion");
    for (const query of ["chaos double pendulum", "machine learning odor prediction molecular structure", "climate change impact on coral reefs", "quantitative structure-odor relationship"]) {
      const main = reports.get(query)?.ranked?.shown ?? [];
      const foreign = main.filter((s) => {
        const code = resolveLanguage(s.result).code;
        return code !== null && code !== "en";
      });
      check(`no result in another language in the main list of "${query}"`, foreign.length === 0, foreign.map((s) => s.result.title.slice(0, 40)).join(" / "));
    }
    const doi = reports.get(LOOKUPS[0] as string)?.lookup?.result;
    check(`the DOI resolves to a work`, doi !== undefined && doi !== null && doi.doi === "10.1016/b978-0-323-99796-6.00014-x", doi?.title ?? "not resolved");
    const nature = reports.get(LOOKUPS[1] as string)?.lookup?.result;
    check(`the nature.com link resolves to the paper with DOI 10.1038/s42004-024-01373-2`, nature?.doi === "10.1038/s42004-024-01373-2", nature?.title ?? "not resolved");

    const out = ["", "==== CHECKS ====", ...checks].join("\n");
    print(out);
    writeFileSync(new URL("./.cache/last-checks.txt", import.meta.url).pathname, out);
    expect(true).toBe(true);
  });
});
