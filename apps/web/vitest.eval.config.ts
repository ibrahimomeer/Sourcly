import { defineConfig } from "vitest/config";

// `pnpm eval:search`: runs the live search eval. It needs the network and is not part of `pnpm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["eval/**/*.eval.ts"],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One query at a time, so the sources are not asked for ten searches at once.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
