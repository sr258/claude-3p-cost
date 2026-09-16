import { describe, expect, it } from "vitest";
import type { AuditSession, ModelUsageRecord, RequestRecord } from "./audit-types.js";
import type { Problem } from "./problems.js";
import type { ConnectedFolder, ProjectRef, ResolvedSession, SessionMeta } from "./project-types.js";
import { buildReport, compareGroupRows, compareSessionRows, costShare } from "./report.js";

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
};

function makeModel(overrides: Partial<ModelUsageRecord> = {}): ModelUsageRecord {
  return {
    model: "claude-sonnet-5",
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    provider: "foundry",
    costBasis: "list",
    contextWindow: 200_000,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    costMicroUsd: 0,
    durationMs: 0,
    durationApiMs: 0,
    numTurns: 0,
    isError: false,
    usage: { ...EMPTY_USAGE },
    models: [],
    subagents: null,
    ...overrides,
  };
}

function makeAudit(
  sourceId: string,
  requests: readonly RequestRecord[],
  overrides: Partial<AuditSession> = {},
): AuditSession {
  return {
    sourceId,
    sessionId: sourceId,
    cwd: null,
    initModel: null,
    cliSessionId: null,
    requests,
    lifecycle: { queued: 0, started: 0, completed: 0 },
    openRequests: 0,
    lineCount: requests.length,
    malformedLineCount: 0,
    encoding: null,
    problems: [],
    ...overrides,
  };
}

function makeSession(
  sourceId: string,
  requests: readonly RequestRecord[],
  options: {
    project?: ProjectRef;
    folders?: readonly ConnectedFolder[];
    meta?: Partial<SessionMeta> | null;
  } = {},
): ResolvedSession {
  const meta: SessionMeta | null =
    options.meta === null
      ? null
      : {
          sessionId: sourceId,
          title: "",
          spaceId: null,
          model: null,
          createdAt: null,
          lastActivityAt: null,
          isArchived: false,
          isStarred: false,
          folders: options.folders ?? [],
          ...options.meta,
        };

  return {
    audit: makeAudit(sourceId, requests),
    meta,
    project: options.project ?? { kind: "none" },
    folders: options.folders ?? [],
  };
}

describe("buildReport", () => {
  it("an empty session list yields a zeroed report, not a crash", () => {
    const report = buildReport([], []);
    expect(report.sessions).toEqual([]);
    expect(report.projectGroups).toEqual([]);
    expect(report.folderGroups).toEqual([]);
    expect(report.totals.costMicroUsd).toBe(0);
    expect(report.totals.requests).toBe(0);
    expect(report.models).toEqual({ models: [], costMicroUsd: 0 });
    expect(report.byDay).toEqual([]);
    expect(report.byMonth).toEqual([]);
    expect(report.undated).toEqual({ requests: 0, costMicroUsd: 0 });
  });

  it("project group totals sum exactly to the report total", () => {
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 100_000 })], {
        project: { kind: "named", spaceId: "p1", name: "Project One" },
      }),
      makeSession("s2", [makeRequest({ costMicroUsd: 250_000 })], {
        project: { kind: "named", spaceId: "p2", name: "Project Two" },
      }),
      makeSession("s3", [makeRequest({ costMicroUsd: 7_000 })]),
    ];
    const report = buildReport(sessions, []);
    const sumOfGroups = report.projectGroups.reduce((sum, g) => sum + g.totals.costMicroUsd, 0);
    expect(sumOfGroups).toBe(report.totals.costMicroUsd);
    expect(report.totals.costMicroUsd).toBe(357_000);
  });

  it("folder group totals sum exactly to the report total", () => {
    const folderA: ConnectedFolder[] = [{ display: "a", path: "/p/a", kind: "local" }];
    const folderB: ConnectedFolder[] = [{ display: "b", path: "/p/b", kind: "local" }];
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 40_000 })], { folders: folderA }),
      makeSession("s2", [makeRequest({ costMicroUsd: 60_000 })], { folders: folderB }),
      makeSession("s3", [makeRequest({ costMicroUsd: 5_000 })]),
    ];
    const report = buildReport(sessions, []);
    const sumOfGroups = report.folderGroups.reduce((sum, g) => sum + g.totals.costMicroUsd, 0);
    expect(sumOfGroups).toBe(report.totals.costMicroUsd);
    expect(report.folderGroups).toHaveLength(3);
  });

  it("every session appears in exactly one project group and exactly one folder group", () => {
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 1 })], {
        project: { kind: "named", spaceId: "p1", name: "One" },
      }),
      makeSession("s2", [makeRequest({ costMicroUsd: 2 })]),
    ];
    const report = buildReport(sessions, []);
    const totalSessionsInProjectGroups = report.projectGroups.reduce(
      (n, g) => n + g.sessionCount,
      0,
    );
    const totalSessionsInFolderGroups = report.folderGroups.reduce((n, g) => n + g.sessionCount, 0);
    expect(totalSessionsInProjectGroups).toBe(sessions.length);
    expect(totalSessionsInFolderGroups).toBe(sessions.length);
  });

  it("groups are sorted by cost descending with a stable tie-break", () => {
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 5 })], {
        project: { kind: "named", spaceId: "zzz", name: "Z" },
      }),
      makeSession("s2", [makeRequest({ costMicroUsd: 5 })], {
        project: { kind: "named", spaceId: "aaa", name: "A" },
      }),
      makeSession("s3", [makeRequest({ costMicroUsd: 999 })], {
        project: { kind: "named", spaceId: "big", name: "Big" },
      }),
    ];
    const report = buildReport(sessions, []);
    expect(report.projectGroups.map((g) => g.key)).toEqual(["big", "aaa", "zzz"]);
  });

  it("sessions within a group are sorted by cost descending", () => {
    const sessions = [
      makeSession("low", [makeRequest({ costMicroUsd: 10 })], {
        project: { kind: "named", spaceId: "p", name: "P" },
      }),
      makeSession("high", [makeRequest({ costMicroUsd: 90 })], {
        project: { kind: "named", spaceId: "p", name: "P" },
      }),
    ];
    const report = buildReport(sessions, []);
    expect(report.projectGroups[0].sessions.map((s) => s.sessionId)).toEqual(["high", "low"]);
  });

  it("the global model breakdown equals the merge of the per-group breakdowns", () => {
    const sessions = [
      makeSession(
        "s1",
        [makeRequest({ models: [makeModel({ model: "claude-opus-5", costMicroUsd: 10_000 })] })],
        { project: { kind: "named", spaceId: "p1", name: "One" } },
      ),
      makeSession(
        "s2",
        [makeRequest({ models: [makeModel({ model: "claude-opus-5", costMicroUsd: 20_000 })] })],
        { project: { kind: "named", spaceId: "p2", name: "Two" } },
      ),
    ];
    const report = buildReport(sessions, []);
    expect(report.models.costMicroUsd).toBe(30_000);
    expect(report.models.models).toEqual([
      expect.objectContaining({ model: "claude-opus-5", costMicroUsd: 30_000, requests: 2 }),
    ]);
  });

  it("a session-scoped model breakdown is a subset of its project's", () => {
    const sessions = [
      makeSession(
        "s1",
        [makeRequest({ models: [makeModel({ model: "claude-opus-5", costMicroUsd: 10_000 })] })],
        { project: { kind: "named", spaceId: "p1", name: "One" } },
      ),
      makeSession(
        "s2",
        [makeRequest({ models: [makeModel({ model: "claude-sonnet-5", costMicroUsd: 5_000 })] })],
        { project: { kind: "named", spaceId: "p1", name: "One" } },
      ),
    ];
    const report = buildReport(sessions, []);
    const group = report.projectGroups.find((g) => g.key === "p1")!;
    const s1 = report.sessions.find((s) => s.sessionId === "s1")!;
    expect(group.models.costMicroUsd).toBe(15_000);
    expect(s1.models.costMicroUsd).toBe(10_000);
    expect(s1.models.costMicroUsd).toBeLessThanOrEqual(group.models.costMicroUsd);
  });

  it("day buckets plus undated cost equal the report total", () => {
    const sessions = [
      makeSession("s1", [
        makeRequest({ costMicroUsd: 10_000, timestamp: "2026-01-01T00:00:00.000Z" }),
        makeRequest({ costMicroUsd: 20_000, timestamp: null }),
      ]),
    ];
    const report = buildReport(sessions, []);
    const dayTotal = report.byDay.reduce((sum, b) => sum + b.costMicroUsd, 0);
    expect(dayTotal + report.undated.costMicroUsd).toBe(report.totals.costMicroUsd);
  });

  it("month buckets equal the day buckets rolled up", () => {
    const sessions = [
      makeSession("s1", [
        makeRequest({ costMicroUsd: 10_000, timestamp: "2026-01-01T00:00:00.000Z" }),
        makeRequest({ costMicroUsd: 5_000, timestamp: "2026-01-31T23:00:00.000Z" }),
        makeRequest({ costMicroUsd: 7_000, timestamp: "2026-02-01T00:00:00.000Z" }),
      ]),
    ];
    const report = buildReport(sessions, []);
    const dayTotal = report.byDay.reduce((sum, b) => sum + b.costMicroUsd, 0);
    const monthTotal = report.byMonth.reduce((sum, b) => sum + b.costMicroUsd, 0);
    expect(monthTotal).toBe(dayTotal);
    expect(report.byMonth).toEqual([
      expect.objectContaining({ key: "2026-01", costMicroUsd: 15_000 }),
      expect.objectContaining({ key: "2026-02", costMicroUsd: 7_000 }),
    ]);
  });

  it("requests with no timestamp land in undated and are not dropped", () => {
    const sessions = [makeSession("s1", [makeRequest({ costMicroUsd: 42, timestamp: null })])];
    const report = buildReport(sessions, []);
    expect(report.undated).toEqual({ requests: 1, costMicroUsd: 42 });
    expect(report.totals.requests).toBe(1);
    expect(report.totals.costMicroUsd).toBe(42);
  });

  it("no rounding happens anywhere: the total is the exact integer sum", () => {
    // Chosen so the naive float sum (0.1 + 0.2 = 0.30000000000000004) would
    // differ from the exact integer sum if a cent had leaked in as a float.
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 100_000 })]),
      makeSession("s2", [makeRequest({ costMicroUsd: 200_000 })]),
      makeSession("s3", [makeRequest({ costMicroUsd: 1 })]),
    ];
    const report = buildReport(sessions, []);
    expect(report.totals.costMicroUsd).toBe(300_001);
  });

  it("gaps and problems pass through unchanged", () => {
    const problems: Problem[] = [{ kind: "missing-cost", scope: "s1", hint: "total_cost_usd" }];
    const sessions = [makeSession("s1", [makeRequest({ costMicroUsd: 1 })], { meta: null })];
    const report = buildReport(sessions, problems);
    expect(report.problems).toEqual(problems);
    expect(report.gaps.sessionsWithoutManifest).toBe(1);
  });

  it("costShare returns 0 for a zero total", () => {
    expect(costShare(100, 0)).toBe(0);
    expect(costShare(50, 200)).toBe(0.25);
  });

  it("comparators are stable and total in both directions", () => {
    const sessions = [
      makeSession("b", [makeRequest({ costMicroUsd: 10 })]),
      makeSession("a", [makeRequest({ costMicroUsd: 10 })]),
      makeSession("c", [makeRequest({ costMicroUsd: 99 })]),
    ];
    const report = buildReport(sessions, []);
    const asc = [...report.sessions].sort(compareSessionRows("cost", "asc"));
    const desc = [...report.sessions].sort(compareSessionRows("cost", "desc"));
    // The tie-break is ascending in both directions; the primary field is not.
    expect(asc.map((s) => s.sessionId)).toEqual(["a", "b", "c"]);
    expect(desc.map((s) => s.sessionId)).toEqual(["c", "a", "b"]);

    const groupAsc = [...report.projectGroups].sort(compareGroupRows("cost", "asc"));
    expect(groupAsc.length).toBe(report.projectGroups.length);
  });

  it("a null lastActivity sorts last in both directions", () => {
    const sessions = [
      makeSession("dated-old", [makeRequest()], {
        project: { kind: "named", spaceId: "old", name: "Old" },
        meta: { lastActivityAt: 1_000 },
      }),
      makeSession("undated", [makeRequest()], {
        project: { kind: "named", spaceId: "undated", name: "Undated" },
        meta: { lastActivityAt: null },
      }),
      makeSession("dated-new", [makeRequest()], {
        project: { kind: "named", spaceId: "new", name: "New" },
        meta: { lastActivityAt: 2_000 },
      }),
    ];
    const report = buildReport(sessions, []);

    const asc = [...report.sessions].sort(compareSessionRows("lastActivity", "asc"));
    const desc = [...report.sessions].sort(compareSessionRows("lastActivity", "desc"));
    expect(asc.map((s) => s.sessionId)).toEqual(["dated-old", "dated-new", "undated"]);
    expect(desc.map((s) => s.sessionId)).toEqual(["dated-new", "dated-old", "undated"]);

    const groupsDesc = [...report.projectGroups].sort(compareGroupRows("lastActivity", "desc"));
    expect(groupsDesc.map((g) => g.key)).toEqual(["new", "old", "undated"]);
  });
});
