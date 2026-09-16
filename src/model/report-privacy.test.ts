/**
 * NFR-6 containment for `buildReport` (S5 plan §9.5). Fixtures used here
 * actually carry a `systemPrompt`, an `initialMessage` and an absolute-looking
 * path, so the assertions can fail.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditAccumulator } from "./audit-parser.js";
import { buildManifestIndex, parseManifestText } from "./manifest.js";
import { createProblemCollector } from "./problems.js";
import { resolveSession } from "./project-assignment.js";
import { buildReport } from "./report.js";
import {
  MANIFEST_ORDINARY_JSON,
  MANIFEST_SENSITIVE_FIELDS_JSON,
} from "../../test/fixtures/sessions/index.js";

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("report privacy", () => {
  it("a SessionRow carries no cwd, systemPrompt, initialMessage or instructions field", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_SENSITIVE_FIELDS_JSON),
      basename(MANIFEST_SENSITIVE_FIELDS_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = createAuditAccumulator(parsed.meta.sessionId).finish();
    const resolved = resolveSession(audit, index, new Map(), problems);

    const report = buildReport([resolved], problems.problems);
    const keys = Object.keys(report.sessions[0]);
    expect(keys).not.toContain("cwd");
    expect(keys).not.toContain("systemPrompt");
    expect(keys).not.toContain("initialMessage");
    expect(keys).not.toContain("instructions");
  });

  it("no Problem emitted while building a report contains a path separator", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      basename(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = createAuditAccumulator(parsed.meta.sessionId).finish();
    const resolved = resolveSession(audit, index, new Map(), problems);

    const report = buildReport([resolved], problems.problems);
    for (const problem of report.problems) {
      expect(problem.scope).not.toMatch(/[/\\]/);
      expect(problem.hint ?? "").not.toMatch(/[/\\]/);
    }
  });

  it("the full folder path is reachable only through ConnectedFolder.path", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      basename(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = createAuditAccumulator(parsed.meta.sessionId).finish();
    const resolved = resolveSession(audit, index, new Map(), problems);

    const report = buildReport([resolved], problems.problems);
    const session = report.sessions[0];
    expect(session.folder.kind).toBe("folders");
    if (session.folder.kind === "folders") {
      const fullPath = session.folder.folders[0].path;
      expect(fullPath).toContain("/");
      // The only other place the full path could leak into is the group key,
      // which is expected and documented (S5 plan §2 Q3) — not a Problem,
      // not a title, not anywhere else on the row.
      expect(JSON.stringify(session.title)).not.toContain(fullPath);
    }
  });
});
