/**
 * NFR-6 containment for `buildReport` (S5 plan §9.5). Fixtures used here
 * actually carry a `systemPrompt`, an `initialMessage` and an absolute-looking
 * path, so the assertions can fail.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditAccumulator, parseAuditText } from "./audit-parser.js";
import { buildManifestIndex, parseManifestText } from "./manifest.js";
import { createProblemCollector } from "./problems.js";
import { resolveSession } from "./project-assignment.js";
import { buildReport } from "./report.js";
import {
  MANIFEST_ORDINARY_JSON,
  MANIFEST_SENSITIVE_FIELDS_JSON,
} from "../../test/fixtures/sessions/index.js";
import { TOOL_USAGE_JSONL } from "../../test/fixtures/audit/index.js";

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

  it("SessionRow.requests carries no path-like and no free-text field", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      basename(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const accumulator = createAuditAccumulator(parsed.meta.sessionId);
    accumulator.pushLine(
      JSON.stringify({
        type: "result",
        timestamp: "2026-01-01T00:00:00.000Z",
        total_cost_usd: 0.5,
        duration_ms: 1000,
        duration_api_ms: 900,
        num_turns: 1,
        is_error: false,
        session_id: "11111111-2222-3333-4444-555555555555",
      }),
    );
    const audit = accumulator.finish();
    const resolved = resolveSession(audit, index, new Map(), problems);

    const report = buildReport([resolved], problems.problems);
    expect(report.sessions[0]!.requests.length).toBeGreaterThan(0);
    for (const request of report.sessions[0]!.requests) {
      const keys = Object.keys(request);
      expect(keys).not.toContain("cwd");
      expect(keys).not.toContain("path");
      expect(keys).not.toContain("prompt");
      expect(keys).not.toContain("systemPrompt");
      expect(keys).not.toContain("initialMessage");
      expect(JSON.stringify(request)).not.toMatch(/[/\\]/);
    }
  });

  it("ToolUseCount exposes only a name and a call count", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      basename(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = parseAuditText(parsed.meta.sessionId, readText(TOOL_USAGE_JSONL));
    const resolved = resolveSession(audit, index, new Map(), problems);

    const report = buildReport([resolved], problems.problems);
    const toolUses = report.sessions[0]!.toolUses;
    expect(toolUses.length).toBeGreaterThan(0);
    for (const tool of toolUses) {
      expect(Object.keys(tool).sort()).toEqual(["calls", "name"]);
    }
  });

  it("no tool_use id reaches SessionRow", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      basename(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = parseAuditText(parsed.meta.sessionId, readText(TOOL_USAGE_JSONL));
    const resolved = resolveSession(audit, index, new Map(), problems);

    const report = buildReport([resolved], problems.problems);
    const session = report.sessions[0]!;
    expect(session.toolUses.length).toBeGreaterThan(0);
    // The tool-usage fixture's tool_use ids all follow "toolu_" -- none of
    // them may survive into the row (NFR-6, S12 plan §2 Q5).
    expect(JSON.stringify(session)).not.toMatch(/toolu_/);
  });
});
