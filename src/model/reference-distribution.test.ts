/**
 * The reference distribution, read against `reference-material/` at runtime
 * (S4 plan §6). Skips cleanly when that directory is absent — as it will be
 * in CI, since the directory is gitignored and never committed. Asserts
 * counts only; the discovered names are `console.log`ged for a human to
 * read and never written to disk or asserted on (NFR-6).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAuditBytes } from "./audit-parser.js";
import { buildManifestIndex, parseManifestBytes } from "./manifest.js";
import { createProblemCollector } from "./problems.js";
import { projectKey, resolveSessions, summarizeGaps } from "./project-assignment.js";
import { buildReport } from "./report.js";
import { mergeSpaceIndexes, parseSpacesBytes } from "./spaces.js";
import type { ParsedManifest } from "./project-types.js";

const repoRoot = process.cwd();
const dir = process.env.CLAUDE3P_REFERENCE_DIR ?? join(repoRoot, "reference-material");

function walk(root: string, predicate: (fileName: string) => boolean): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        stack.push(full);
      } else if (predicate(entry)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

describe.skipIf(!existsSync(dir))("reference distribution", () => {
  it("matches the known counts of the local reference-material tree", () => {
    const problems = createProblemCollector();

    const spacesFiles = walk(dir, (name) => name === "spaces.json");
    const spaceIndexes = spacesFiles.map((path) => parseSpacesBytes(readFileSync(path), problems));
    const spaces = mergeSpaceIndexes(spaceIndexes);

    const manifestFiles = walk(dir, (name) => name.startsWith("local_") && name.endsWith(".json"));
    const manifests: ParsedManifest[] = [];
    for (const path of manifestFiles) {
      const parsed = parseManifestBytes(readFileSync(path), basename(path), problems);
      if (parsed !== null) {
        manifests.push(parsed);
      }
    }
    const index = buildManifestIndex(manifests, problems);

    const auditFiles = walk(dir, (name) => name === "audit.jsonl");
    const audits = auditFiles.map((path) => {
      const sourceId = basename(dirname(path));
      return parseAuditBytes(sourceId, readFileSync(path));
    });

    const resolved = resolveSessions(audits, index, spaces, problems);
    const gaps = summarizeGaps(resolved);

    const buckets = new Map<string, string>();
    for (const session of resolved) {
      const key = projectKey(session.project);
      if (!buckets.has(key)) {
        const label =
          session.project.kind === "named"
            ? session.project.name
            : session.project.kind === "unknown"
              ? `unknown:${session.project.spaceId}`
              : "(no project)";
        buckets.set(key, label);
      }
    }
    // A human reads this to confirm seven entries: the six recognisable
    // project names plus the no-project bucket. Never asserted, never
    // written to a file (plan §6, §9 Tier 2) — the repository's guarantee is
    // the count below, not the names.
    console.log("Reference distribution buckets:", [...buckets.values()]);

    expect(spaces.size).toBe(6);
    expect(buckets.size).toBe(7);
    expect(manifests.length).toBe(152);
    expect(audits.length).toBe(150);
    expect(gaps.openRequests).toBe(14);
    expect(gaps.sessionsWithoutManifest).toBe(0);
    expect(resolved.filter((r) => r.project.kind === "unknown")).toHaveLength(0);
    expect(problems.problems.filter((p) => p.kind === "duplicate-session-key")).toHaveLength(2);

    // US-1.3's whole-tree regression (S5 plan §7). The exact sum is asserted
    // to the cent, not the POC's printed 1413.58 — the POC rounds per session
    // before summing, which is precisely the bug S5 does not port (plan §2 Q9).
    const report = buildReport(resolved, problems.problems);

    expect(report.sessions).toHaveLength(150);
    expect(report.totals.requests).toBe(508);
    expect(report.projectGroups).toHaveLength(7);
    expect(Math.round(report.totals.costMicroUsd / 10_000) / 100).toBe(1413.59);

    // A human reads these once; never asserted, never written to disk (NFR-6).
    console.log("Reference total, exact integer micro-USD:", report.totals.costMicroUsd);
    console.log("Reference folder group count:", report.folderGroups.length);
  });
});
