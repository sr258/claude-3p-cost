/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import licensesPlugin from "./plugins/vite-plugin-licenses.js";
import referenceFsPlugin from "./plugins/vite-plugin-reference-fs.js";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [preact(), licensesPlugin(), referenceFsPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
  },
});
