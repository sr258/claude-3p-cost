import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end harness (S8 plan §8.2). Self-contained: `webServer.command`
 * builds the `e2e`-mode bundle and serves it, so a local run can never
 * accidentally exercise a stale `dist/`, and CI needs no extra step. The
 * build lands in `dist-e2e/`, never `dist/` — that keeps `check:no-fake`'s
 * grep over `dist/` meaningful (plan §8.2).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build:e2e && vite preview --outDir dist-e2e --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
