#!/usr/bin/env node
/**
 * Generates a placeholder icon for Claude3PCost.
 *
 * Writes `src-tauri/icons/source.svg` (a 1024x1024 rounded square with a
 * white "3P" wordmark) and rasterises it to `source.png` via macOS's
 * `qlmanage`, which ships with every Mac and needs no extra dependency.
 *
 * macOS-only. This is a one-off developer tool, not part of the build; the
 * generated `source.svg` and `source.png` are committed so the mark is
 * regenerable without re-running this script.
 *
 * After running this script, generate the full icon set with:
 *   npx tauri icon src-tauri/icons/source.png
 */
import { writeFileSync, renameSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "src-tauri", "icons");
const svgPath = join(iconsDir, "source.svg");
const pngPath = join(iconsDir, "source.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="180" fill="#1676f3" />
  <text
    x="512"
    y="512"
    font-family="-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    font-size="440"
    font-weight="700"
    fill="#ffffff"
    text-anchor="middle"
    dominant-baseline="central"
  >3P</text>
</svg>
`;

writeFileSync(svgPath, svg, "utf-8");
console.log(`Wrote ${svgPath}`);

execFileSync("qlmanage", ["-t", "-s", "1024", "-o", iconsDir, svgPath], {
  stdio: "inherit",
});

const generated = `${svgPath}.png`;
if (!existsSync(generated)) {
  throw new Error(`Expected qlmanage to produce ${generated}, but it did not.`);
}
if (existsSync(pngPath)) {
  rmSync(pngPath);
}
renameSync(generated, pngPath);
console.log(`Wrote ${pngPath}`);

console.log("\nNext, run:");
console.log("  npx tauri icon src-tauri/icons/source.png");
