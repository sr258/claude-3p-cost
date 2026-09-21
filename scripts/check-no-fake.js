#!/usr/bin/env node
/**
 * "No fake in the production bundle" guard (S8 plan §8, LEARNINGS). Greps
 * `dist/` for the e2e fakes' marker identifiers and exits non-zero on a hit.
 *
 * S15 (plan §5.4) adds a SECOND fake module (`fake-dialog-plugin.ts`, for
 * US-4.2's export/import dialog) with its own marker — a single-marker
 * script would pass over a bundle containing that fake alone, so both are
 * checked.
 *
 * The negative control is a COMMAND, not a reasoning exercise (LEARNINGS: a
 * name-level static guard is only as good as its last negative control):
 * build in `e2e` mode into `dist/` deliberately, confirm this script reports
 * hits for BOTH markers and exits non-zero, then rebuild normally and
 * confirm it passes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKERS = ["__C3P_E2E_FAKE_TAURI_PLUGIN__", "__C3P_E2E_FAKE_DIALOG_PLUGIN__"];
const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

let files;
try {
  files = walk(distDir);
} catch (error) {
  console.error(`check-no-fake: could not read ${distDir}: ${error.message}`);
  process.exit(1);
}

const hits = [];
for (const file of files) {
  const content = readFileSync(file, "utf-8");
  for (const marker of MARKERS) {
    if (content.includes(marker)) {
      hits.push(`${file} (${marker})`);
    }
  }
}

if (hits.length > 0) {
  console.error("check-no-fake: an e2e fake's marker was found in dist/:");
  for (const hit of hits) {
    console.error(`  ${hit}`);
  }
  process.exit(1);
}

console.log("check-no-fake: clean — no e2e fake marker in dist/");
