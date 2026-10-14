// Opt-in smoke test against the real OpenAlex API: `pnpm --filter @sourcly/core test:live`.
// Excluded from `pnpm test` so CI never depends on the network or spends OpenAlex's small
// keyless daily budget. Run it when OpenAlex changes something, to check the provider still works.
import { describe, expect, it } from "vitest";
import { classify } from "../classify";
import { searchProviders } from "../search";
import { createOpenAlexProvider } from "./openalex";

describe("OpenAlex (live)", () => {
  it("answers a real search with usable, classifiable results", async () => {
    const outcome = await searchProviders([createOpenAlexProvider()], "sleep and memory consolidation", {
      limit: 10,
    });

    expect(outcome.statuses).toEqual([{ provider: "openalex", state: "ok", count: expect.any(Number) }]);
    expect(outcome.results.length).toBeGreaterThan(0);

    for (const [index, result] of outcome.results.entries()) {
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.hits[0]).toMatchObject({ provider: "openalex", rank: index + 1 });
      expect(result.hits[0]?.score).toEqual(expect.any(Number));
      expect(classify(result).level.reason.length).toBeGreaterThan(0);
    }
    // Sorted by OpenAlex's relevance score, best first.
    const scores = outcome.results.map((result) => result.hits[0]?.score ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
