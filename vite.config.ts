/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import licensesPlugin from "./plugins/vite-plugin-licenses.js";
import referenceFsPlugin from "./plugins/vite-plugin-reference-fs.js";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig(({ mode }) => ({
  plugins: [preact(), licensesPlugin(), referenceFsPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    // e2e mode only (S8 plan §2 Q1, §8.3): the Playwright harness's fake
    // stands in for the real Tauri fs plugin and `invoke`. `src/` stays
    // entirely test-unaware — nothing here branches for any other mode.
    alias:
      mode === "e2e"
        ? [
            {
              find: "@tauri-apps/plugin-fs",
              replacement: new URL("./e2e/support/fake-tauri-plugin.ts", import.meta.url).pathname,
            },
            {
              find: "@tauri-apps/api/core",
              replacement: new URL("./e2e/support/fake-tauri-plugin.ts", import.meta.url).pathname,
            },
          ]
        : [],
  },
  test: {
    environment: "jsdom",
    // Vitest's default include glob is repo-wide and would otherwise pick up
    // calview/'s test suite (present locally, gitignored, not part of this
    // project — see CLAUDE.md "The three input directories"). plugins/ is
    // included too (S6): the middleware is the most security-relevant file
    // this session adds and needs its own unit tests, but the glob stays
    // no wider than these two entries — test/fixtures/ stays outside it.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "plugins/**/*.test.ts"],
    // @testing-library/preact's auto-cleanup registers itself onto a
    // global `afterEach` (S7 plan §7.3), which this project does not set
    // via `globals: true` and should not start setting.
    setupFiles: ["./test/setup-component-tests.ts"],
  },
}));
