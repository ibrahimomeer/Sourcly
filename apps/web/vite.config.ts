import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";
import packageJson from "./package.json";

export default defineConfig({
  // Relative base so the built site works from any path, including file://.
  base: "./",
  // The app's version, from package.json, so the search protocol can say which version made it.
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  // One self-contained index.html (scripts and styles inlined) that works when double-clicked from a
  // folder. config.js stays a separate file next to it, so it can be edited after the build.
  plugins: [react(), viteSingleFile()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
