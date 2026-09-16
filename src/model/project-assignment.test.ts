import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditAccumulator } from "./audit-parser.js";
import { buildManifestIndex, parseManifestText } from "./manifest.js";
import { createProblemCollector } from "./problems.js";
import {
  projectKey,
  resolveProject,
  resolveSession,
  resolveSessions,
  summarizeGaps,
} from "./project-assignment.js";
import { parseSpacesText } from "./spaces.js";
import type { SessionMeta } from "./project-types.js";
import {
  ALL_MANIFEST_FIXTURES,
  MANIFEST_ARCHIVED_STARRED_JSON,
  MANIFEST_ORDINARY_JSON,
  SPACES_LIST_JSON,
} from "../../test/fixtures/sessions/index.js";

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function baseMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: "aaaaaaaa-0000-0000-0000-000000000000",
    title: "Fixture",
    spaceId: null,
    model: null,
    createdAt: null,
    lastActivityAt: null,
    isArchived: false,
    isStarred: false,
    folders: [],
    ...overrides,
  };
}

describe("resolveProject", () => {
  it("resolves a named project from the space index", () => {
    const problems = createProblemCollector();
    const spaces = parseSpacesText(readText(SPACES_LIST_JSON), problems);
    const meta = baseMeta({ spaceId: "aaaaaaaa-1111-4a11-8a11-000000000001" });
    const ref = resolveProject(meta, spaces, problems);
    expect(ref).toEqual({
      kind: "named",
      spaceId: "aaaaaaaa-1111-4a11-8a11-000000000001",
      name: "Alpha",
    });
  });

  it("returns kind: none when spaceId is absent", () => {
    const problems = createProblemCollector();
    const spaces = new Map<string, string>();
    const ref = resolveProject(baseMeta({ spaceId: null }), spaces, problems);
    expect(ref).toEqual({ kind: "none" });
  });

  it("returns kind: none with meta: null when the manifest is absent", () => {
    const problems = createProblemCollector();
    const ref = resolveProject(null, new Map(), problems);
    expect(ref).toEqual({ kind: "none" });
  });

  it("falls back to kind: unknown for a spaceId not in the space index, keeps the session, and records a problem", () => {
    const problems = createProblemCollector();
    const meta = baseMeta({ sessionId: "session-x", spaceId: "raw-unknown-id" });
    const ref = resolveProject(meta, new Map(), problems);
    expect(ref).toEqual({ kind: "unknown", spaceId: "raw-unknown-id" });
    expect(problems.problems).toHaveLength(1);
    expect(problems.problems[0]).toMatchObject({
      kind: "unknown-space",
      scope: "session-x",
      hint: "spaceId",
    });
    // The raw id must never appear as the hint (NFR-6) — only in ProjectRef.
    expect(problems.problems[0].hint).not.toBe("raw-unknown-id");
  });
});

describe("projectKey", () => {
  it("distinguishes the no-project bucket from a space whose id is the literal string 'none'", () => {
    const noneKey = projectKey({ kind: "none" });
    const literalNoneKey = projectKey({ kind: "named", spaceId: "none", name: "Literally None" });
    expect(noneKey).not.toBe(literalNoneKey);
  });
});

describe("resolveSessions over the fixture set", () => {
  it("yields seven distinct projectKeys", () => {
    const problems = createProblemCollector();
    const spaces = parseSpacesText(readText(SPACES_LIST_JSON), problems);
    const parsed = ALL_MANIFEST_FIXTURES.map((path) =>
      parseManifestText(readText(path), basename(path), problems),
    ).filter((p): p is NonNullable<typeof p> => p !== null);
    const sorted = [...parsed].sort((a, b) => a.meta.sessionId.localeCompare(b.meta.sessionId));
    const index = buildManifestIndex(sorted, problems);

    const audits = parsed.map((p) => {
      const acc = createAuditAccumulator(p.meta.sessionId);
      return acc.finish();
    });

    const resolved = resolveSessions(audits, index, spaces, problems);
    const keys = new Set(resolved.map((r) => projectKey(r.project)));
    // Alpha (fixtures 1, 9), none (2, 3), unknown (4), Beta (5), Gamma (6),
    // Delta (7), Epsilon (8a and 8b share a spaceId) — seven buckets, matching
    // the plan's §11 test name. Zeta (in spaces-list.json) is not referenced
    // by any manifest and so contributes no bucket here.
    expect(keys.size).toBe(7);
  });
});

describe("summarizeGaps", () => {
  it("sums openRequests, counts orphan sessions with their cost in integer micro-USD, and counts archived sessions", () => {
    const problems = createProblemCollector();

    const withManifestAudit = createAuditAccumulator("with-manifest");
    withManifestAudit.pushLine(JSON.stringify({ type: "command_lifecycle", state: "started" }));
    const withManifest = withManifestAudit.finish();

    const orphanAudit = createAuditAccumulator("orphan");
    orphanAudit.pushLine(JSON.stringify({ type: "command_lifecycle", state: "started" }));
    orphanAudit.pushLine(JSON.stringify({ type: "result", total_cost_usd: 1.5, usage: {} }));
    const orphan = orphanAudit.finish();

    const archivedMeta = baseMeta({ sessionId: "with-manifest", isArchived: true });

    const resolved = [
      resolveSession(withManifest, new Map([["with-manifest", archivedMeta]]), new Map(), problems),
      resolveSession(orphan, new Map(), new Map(), problems),
    ];

    const gaps = summarizeGaps(resolved);
    expect(gaps.openRequests).toBe(2);
    expect(gaps.sessionsWithoutManifest).toBe(1);
    expect(gaps.costMicroUsdWithoutManifest).toBe(1_500_000);
    expect(gaps.archivedSessions).toBe(1);
  });
});

// Sanity check that the ordinary and archived fixtures parse into sessions
// resolveSession can actually join against.
describe("resolveSession", () => {
  it("attaches folders from the manifest to the resolved session", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      basename(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = createAuditAccumulator(parsed.meta.sessionId).finish();
    const resolved = resolveSession(audit, index, new Map(), problems);
    expect(resolved.folders).toEqual(parsed.meta.folders);
  });

  it("carries isArchived through to the resolved session's meta", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ARCHIVED_STARRED_JSON),
      basename(MANIFEST_ARCHIVED_STARRED_JSON),
      problems,
    )!;
    const index = buildManifestIndex([parsed], problems);
    const audit = createAuditAccumulator(parsed.meta.sessionId).finish();
    const resolved = resolveSession(audit, index, new Map(), problems);
    expect(resolved.meta?.isArchived).toBe(true);
  });
});
