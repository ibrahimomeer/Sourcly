import { it } from "vitest";
import { writeSync } from "node:fs";
import { normalizeDoi } from "@sourcly/core";
import { runSearch } from "./harness";

// TEMPORARY debugging aid (delete before finishing): DEBUG_Q="query" DEBUG_N=70 DEBUG_DOIS="a,b" vitest run eval/zzdebug.eval.ts
const q = process.env.DEBUG_Q ?? "";
const n = Number(process.env.DEBUG_N ?? "40");
const dois = (process.env.DEBUG_DOIS ?? "").split(",").filter(Boolean);
const print = (text: string) => writeSync(1, `${text}\n`);

it("debug", async () => {
  const report = await runSearch({ text: q, check: "english", mustInclude: [] });
  const ranked = report.ranked;
  if (ranked === null) return;
  print(report.lines.filter((l) => !l.startsWith("   ") || l.startsWith("  query")).slice(0, 14).join("\n"));
  const row = (i: number, s: (typeof ranked.shown)[number]) => {
    const f = Object.fromEntries(s.factors.map((x) => [x.factor, x.normalized.toFixed(2)]));
    const c = s.coverage;
    print(
      `${String(i + 1).padStart(3)} ${s.result.title.slice(0, 80)} (${s.result.year}) cites=${s.result.citationCount} | phr=${c?.phraseScore?.toFixed(2)} sc=${s.score.toFixed(3)} rel=${f.relevance} cov=${f.termCoverage} ph=${f.phraseMatch} cit=${f.citations} rec=${f.recency} pr=${f.peerReview} agr=${f.providerAgreement} | ${c?.units.map((u) => `${u.label}:${u.variant}@${u.fields[0]}`).join(" ; ")} | ${s.result.hits.map((h) => h.provider).join("+")}`,
    );
  };
  ranked.shown.slice(0, n).forEach((s, i) => row(i, s));
  for (const d of dois) {
    const want = normalizeDoi(d) ?? d;
    const i = ranked.shown.findIndex((s) => s.result.doi !== null && (normalizeDoi(s.result.doi) ?? "") === want);
    print(`--- ${d}: ${i < 0 ? "not in main" : `main #${i + 1}`}`);
    if (i >= 0) row(i, ranked.shown[i] as never);
    const s = ranked.shown[i];
    if (s) print(`    abstract: ${(s.result.abstract ?? "").slice(0, 600)}`);
  }
}, 240_000);
