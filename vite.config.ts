/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import licensesPlugin from "./plugins/vite-plugin-licenses.js";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [preact(), licensesPlugin()],
  // S6: the reference-fs dev middleware plugin (NFR-13) is added here.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: "jsdom",
    // Vitest's default include glob is repo-wide and would otherwise pick up
    // calview/'s test suite (present locally, gitignored, not part of this
    // project — see CLAUDE.md "The three input directories").
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
