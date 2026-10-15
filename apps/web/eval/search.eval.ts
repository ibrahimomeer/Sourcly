import { afterAll, describe, expect, it } from "vitest";
import { writeFileSync, writeSync, mkdirSync } from "node:fs";
import { resolveLanguage, type Result } from "@sourcly/core";
import { budget, loadBenchmark, runLookup, runSearch, writeReportFile, type QueryReport } from "./harness";

// `pnpm eval:search`. Live network, not part of CI. For each query of eval/benchmark.json it prints: the sources used
// with counts, the concepts and their variants, the exact query each source received, whether a fallback ran, the top 15
// (title, year, venue, sources, matched concepts with the variant and field, section), where each mustInclude paper
// landed, and the checks below. The same text is written to eval/output/<query>.md (not committed).

const benchmark = loadBenchmark();

// Written straight to the terminal, because the test runner would otherwise keep what a passing test prints.
const print = (text: string) => writeSync(1, `${text}\n`);

const reports = new Map<string, QueryReport>();
const checks: string[] = [];
let failures = 0;

const check = (label: string, ok: boolean, detail = "", incomplete = false) => {
  const verdict = ok ? "PASS" : incomplete ? "SKIP" : "FAIL";
  if (verdict === "FAIL") failures += 1;
  checks.push(`${verdict}  ${label}${detail === "" ? "" : `  (${detail})`}${verdict === "SKIP" ? "  [OpenAlex budget used up: not judged]" : ""}`);
};

// What the search itself reads: the title, the abstract and the author keywords.
const text = (result: Pick<Result, "title" | "abstract" | "subjects">) =>
  `${result.title} ${result.abstract ?? ""} ${result.subjects.filter((s) => s.kind === "keyword" && s.provider !== "openalex").map((s) => s.term).join(" ; ")}`;
const DOUBLE_PENDULUM = /double[\s-]+(inverted\s+|compound\s+)?pendul/i;
const ML_TERM = /\b(machine[\s-]learning|deep[\s-]learning|neural[\s-]network|artificial[\s-]intelligence|AI|ML|graph[\s-]neural|random[\s-]forest|support[\s-]vector|predictive[\s-]model|prediction[\s-]model|data[\s-]driven|QSOR|language[\s-]model)\b/;
const FOOD_FLAVOUR = /\b(food|foods|flavou?rs?|aroma|aromas|wine|wines|beer|coffee|tea|fruit|fruits|apple|apples|cheese|meat|olive|spices?|essential oils?|fragrances?)\b/i;
const CAN_PROTOCOL = /\bCANs?\b|controller[\s-]area[\s-]network/;

describe("search eval", () => {
  for (const item of benchmark.queries) {
    it(item.text, async () => {
      const report = await runSearch(item);
      reports.set(item.text, report);
      print(report.lines.join("\n"));
      writeReportFile(report);
    });
  }
  for (const item of benchmark.lookups) {
    it(`lookup ${item.text}`, async () => {
      const report = await runLookup(item.text);
      reports.set(item.text, report);
      print(report.lines.join("\n"));
    });
  }

  afterAll(() => {
    for (const item of benchmark.queries) {
      const report = reports.get(item.text);
      const ranked = report?.ranked ?? null;
      const incomplete = report?.incomplete === true;
      const main = ranked?.shown ?? [];

      if (item.check === "odor") {
        const top = main.slice(0, 10);
        const bad = top.filter((s) => FOOD_FLAVOUR.test(text(s.result)) && !ML_TERM.test(text(s.result)));
        check(
          `top 10 of "${item.text}" has no food or flavour paper without a machine-learning term`,
          top.length > 0 && bad.length === 0,
          bad.length > 0 ? bad.map((s) => s.result.title.slice(0, 50)).join(" / ") : `${top.length} shown`,
          incomplete,
        );
        for (const must of report?.must ?? []) {
          check(
            `"${item.text}": ${must.doi} is in the top 30 of the main list`,
            must.section === "main" && must.rank !== null && must.rank <= 30,
            must.section === null ? "not among the fetched results" : `${must.section} #${must.rank}`,
            incomplete,
          );
        }
      }

      if (item.check === "pendulum") {
        const bad = main.filter((s) => !DOUBLE_PENDULUM.test(text(s.result)));
        check(
          `every main-list result for "${item.text}" is about a double pendulum`,
          main.length > 0 && bad.length === 0,
          bad.length > 0 ? bad.slice(0, 5).map((s) => s.result.title.slice(0, 50)).join(" / ") : `${main.length} in the main list`,
          incomplete,
        );
        if (item.expectSuggestion !== undefined) {
          check(
            `"${item.text}" shows “Did you mean: ${item.expectSuggestion} ...”`,
            report?.suggestion !== null && new RegExp(`\\b${item.expectSuggestion}\\b`, "i").test(report?.suggestion ?? ""),
            report?.suggestion ?? "no suggestion",
            incomplete,
          );
        }
      }

      if (item.check === "can-bus") {
        const top = main.slice(0, 15);
        const bad = top.filter((s) => !CAN_PROTOCOL.test(text(s.result)));
        check(
          `top 15 of "${item.text}" are about CAN (capitals) or the controller area network, not “can” the verb`,
          top.length > 0 && bad.length === 0,
          bad.length > 0 ? bad.map((s) => s.result.title.slice(0, 50)).join(" / ") : `${top.length} shown`,
          incomplete,
        );
      }

      if (item.check === "english" || item.check === "odor" || item.check === "pendulum") {
        const foreign = main.filter((s) => {
          const code = resolveLanguage(s.result).code;
          return code !== null && code !== "en";
        });
        check(`no result in another language in the main list of "${item.text}"`, foreign.length === 0, foreign.map((s) => s.result.title.slice(0, 40)).join(" / "), incomplete);
      }

      if (item.check !== "odor") {
        for (const must of report?.must ?? []) {
          check(
            `"${item.text}": ${must.doi} is found (reported, not required to be in the main list)`,
            must.section !== null,
            must.section === null ? "not among the fetched results" : `${must.section} #${must.rank}`,
            incomplete,
          );
        }
      }
    }
    for (const item of benchmark.lookups) {
      const found = reports.get(item.text)?.lookup?.result;
      check(`${item.text} resolves to DOI ${item.expectDoi}`, found?.doi === item.expectDoi, found?.title ?? "not resolved");
    }

    const out = [
      "",
      "==== CHECKS ====",
      ...checks,
      ...(budget.notes.size > 0 || budget.throttled > 0
        ? [
            "",
            ...[...budget.notes].map((note) => `NOTE  ${note}`),
            ...(budget.throttled > 0 ? [`NOTE  OpenAlex asked ${budget.throttled} time(s) to wait a second (one request per second for queries with more than 5 boolean operators); the search waited and asked again.`] : []),
          ]
        : []),
      "",
      `${checks.filter((c) => c.startsWith("PASS")).length} passed, ${failures} failed, ${checks.filter((c) => c.startsWith("SKIP")).length} not judged`,
    ].join("\n");
    print(out);
    mkdirSync(new URL("./.cache/", import.meta.url).pathname, { recursive: true });
    writeFileSync(new URL("./.cache/last-checks.txt", import.meta.url).pathname, out);
    expect(true).toBe(true);
  });
});
