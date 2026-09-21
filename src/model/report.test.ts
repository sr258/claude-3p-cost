import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAuditText } from "./audit-parser.js";
import type { AuditSession, ModelUsageRecord, RequestRecord } from "./audit-types.js";
import { ALL_TIME, type DateRange } from "./date-range.js";
import type { Problem } from "./problems.js";
import type { ConnectedFolder, ProjectRef, ResolvedSession, SessionMeta } from "./project-types.js";
import type { ZoneOffsetResolver } from "./time-buckets.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "./totals.js";
import { DST_STRADDLE_JSONL, MONTH_STRADDLE_JSONL } from "../../test/fixtures/audit/index.js";
import {
  buildReport,
  compareGroupRows,
  compareSessionRows,
  costShare,
  findGroup,
  sessionLastActivity,
  unattributedCostMicroUsd,
} from "./report.js";

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
    toolUses: [],
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

  it("unattributedCostMicroUsd is the authoritative total minus the model-usage sum", () => {
    const totals = { ...EMPTY_TOTALS, costMicroUsd: 100 };
    const models = { ...EMPTY_MODEL_BREAKDOWN, costMicroUsd: 60 };
    expect(unattributedCostMicroUsd(totals, models)).toBe(40);
  });

  it("unattributedCostMicroUsd is zero when modelUsage covers the whole total", () => {
    const totals = { ...EMPTY_TOTALS, costMicroUsd: 100 };
    const models = { ...EMPTY_MODEL_BREAKDOWN, costMicroUsd: 100 };
    expect(unattributedCostMicroUsd(totals, models)).toBe(0);
  });

  it("unattributedCostMicroUsd clamps a negative difference to zero", () => {
    const totals = { ...EMPTY_TOTALS, costMicroUsd: 50 };
    const models = { ...EMPTY_MODEL_BREAKDOWN, costMicroUsd: 100 };
    expect(unattributedCostMicroUsd(totals, models)).toBe(0);
  });

  it("findGroup returns the group with the given key", () => {
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 1 })], {
        project: { kind: "named", spaceId: "p1", name: "One" },
      }),
    ];
    const report = buildReport(sessions, []);
    expect(findGroup(report.projectGroups, "p1")?.key).toBe("p1");
  });

  it("findGroup returns null for a null key", () => {
    const report = buildReport([], []);
    expect(findGroup(report.projectGroups, null)).toBeNull();
  });

  it("findGroup returns null for a key no group carries", () => {
    const sessions = [
      makeSession("s1", [makeRequest({ costMicroUsd: 1 })], {
        project: { kind: "named", spaceId: "p1", name: "One" },
      }),
    ];
    const report = buildReport(sessions, []);
    expect(findGroup(report.projectGroups, "vanished")).toBeNull();
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
    // Amended for S9 (plan §2 Q5, deliberate — see LEARNINGS): "undated" has no
    // manifest lastActivityAt, but every session here shares the same default
    // request timestamp (2026-01-01), so sessionLastActivity's audit-timestamp
    // fallback gives "undated" a far LARGER value than the other two sessions'
    // tiny manifest epoch-ms values (1_000 / 2_000). It therefore now sorts
    // FIRST on the descending pass, not last — it is no longer a null value by
    // the time compareSessionRows sees it.
    expect(desc.map((s) => s.sessionId)).toEqual(["undated", "dated-new", "dated-old"]);

    const groupsDesc = [...report.projectGroups].sort(compareGroupRows("lastActivity", "desc"));
    expect(groupsDesc.map((g) => g.key)).toEqual(["new", "old", "undated"]);
  });

  it("sorts sessions by title ascending and descending with the injected comparator", () => {
    const sessions = [
      makeSession("s-mike", [makeRequest()], { meta: { title: "Mike" } }),
      makeSession("s-alpha", [makeRequest()], { meta: { title: "Alpha" } }),
      makeSession("s-zulu", [makeRequest()], { meta: { title: "Zulu" } }),
    ];
    const report = buildReport(sessions, []);

    const asc = [...report.sessions].sort(compareSessionRows("title", "asc"));
    const desc = [...report.sessions].sort(compareSessionRows("title", "desc"));
    expect(asc.map((s) => s.title)).toEqual(["Alpha", "Mike", "Zulu"]);
    expect(desc.map((s) => s.title)).toEqual(["Zulu", "Mike", "Alpha"]);
  });

  it("uses the injected text comparator rather than the code-unit default", () => {
    // Without this case nothing proves `options.compareText` is consulted at
    // all: the default and an Intl.Collator agree on every ASCII fixture, so
    // an implementation that ignored the option would pass every other title
    // test here (LEARNINGS: build a test so the wrong implementation gives a
    // different answer). The injected comparator is deliberately the REVERSE
    // of code-unit order, which no default can produce.
    const sessions = [
      makeSession("s-alpha", [makeRequest()], { meta: { title: "Alpha" } }),
      makeSession("s-mike", [makeRequest()], { meta: { title: "Mike" } }),
      makeSession("s-zulu", [makeRequest()], { meta: { title: "Zulu" } }),
    ];
    const report = buildReport(sessions, []);
    const reversed = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0);

    const asc = [...report.sessions].sort(
      compareSessionRows("title", "asc", { compareText: reversed }),
    );
    expect(asc.map((s) => s.title)).toEqual(["Zulu", "Mike", "Alpha"]);
  });

  it("the default title comparator orders by code unit, not host locale", () => {
    // "Ärger" starts with U+00C4, which sorts AFTER "Z" (U+005A) in code-unit
    // order, but before it under German collation. The default must give the
    // code-unit answer; only an injected Intl.Collator may give the other.
    const sessions = [
      makeSession("s-umlaut", [makeRequest()], { meta: { title: "Ärger" } }),
      makeSession("s-zulu", [makeRequest()], { meta: { title: "Zulu" } }),
    ];
    const report = buildReport(sessions, []);

    const asc = [...report.sessions].sort(compareSessionRows("title", "asc"));
    expect(asc.map((s) => s.title)).toEqual(["Zulu", "Ärger"]);
  });

  it("an empty title sorts last in both directions", () => {
    const sessions = [
      makeSession("s-untitled", [makeRequest()], { meta: { title: "" } }),
      makeSession("s-alpha", [makeRequest()], { meta: { title: "Alpha" } }),
      makeSession("s-zulu", [makeRequest()], { meta: { title: "Zulu" } }),
    ];
    const report = buildReport(sessions, []);

    const asc = [...report.sessions].sort(compareSessionRows("title", "asc"));
    const desc = [...report.sessions].sort(compareSessionRows("title", "desc"));
    expect(asc.map((s) => s.sessionId)).toEqual(["s-alpha", "s-zulu", "s-untitled"]);
    expect(desc.map((s) => s.sessionId)).toEqual(["s-zulu", "s-alpha", "s-untitled"]);
  });

  it("the title sort is stable on equal titles via sessionId", () => {
    const sessions = [
      makeSession("s-b", [makeRequest()], { meta: { title: "Same" } }),
      makeSession("s-a", [makeRequest()], { meta: { title: "Same" } }),
    ];
    const report = buildReport(sessions, []);

    const asc = [...report.sessions].sort(compareSessionRows("title", "asc"));
    const desc = [...report.sessions].sort(compareSessionRows("title", "desc"));
    expect(asc.map((s) => s.sessionId)).toEqual(["s-a", "s-b"]);
    expect(desc.map((s) => s.sessionId)).toEqual(["s-a", "s-b"]);
  });

  it("sessionLastActivity prefers the manifest value over the audit timestamp", () => {
    const session = makeSession("s1", [makeRequest({ timestamp: "2020-01-01T00:00:00.000Z" })], {
      meta: { lastActivityAt: 5_000 },
    });
    const report = buildReport([session], []);
    expect(sessionLastActivity(report.sessions[0]!)).toBe(5_000);
  });

  it("sessionLastActivity falls back to the last result timestamp when the manifest has none", () => {
    const session = makeSession("s1", [makeRequest({ timestamp: "2020-01-01T00:00:00.000Z" })], {
      meta: { lastActivityAt: null },
    });
    const report = buildReport([session], []);
    expect(sessionLastActivity(report.sessions[0]!)).toBe(Date.parse("2020-01-01T00:00:00.000Z"));
  });

  it("a session with neither manifest activity nor a result timestamp sorts last in both directions", () => {
    const sessions = [
      makeSession("s-none", [makeRequest({ timestamp: null })], { meta: { lastActivityAt: null } }),
      makeSession("s-dated", [makeRequest({ timestamp: "2020-01-01T00:00:00.000Z" })], {
        meta: { lastActivityAt: null },
      }),
    ];
    const report = buildReport(sessions, []);
    expect(sessionLastActivity(report.sessions.find((s) => s.sessionId === "s-none")!)).toBeNull();

    const asc = [...report.sessions].sort(compareSessionRows("lastActivity", "asc"));
    const desc = [...report.sessions].sort(compareSessionRows("lastActivity", "desc"));
    expect(asc.map((s) => s.sessionId)).toEqual(["s-dated", "s-none"]);
    expect(desc.map((s) => s.sessionId)).toEqual(["s-dated", "s-none"]);
  });

  describe("SessionRow.requests (S11 plan §4.2, §7)", () => {
    it("keeps every parsed request", () => {
      const requests = [
        makeRequest({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 1 }),
        makeRequest({ timestamp: "2026-01-02T00:00:00.000Z", costMicroUsd: 2 }),
        makeRequest({ timestamp: "2026-01-03T00:00:00.000Z", costMicroUsd: 3 }),
      ];
      const report = buildReport([makeSession("s1", requests)], []);
      expect(report.sessions[0]!.requests).toHaveLength(3);
    });

    it("is ordered by timestamp ascending", () => {
      const requests = [
        makeRequest({ timestamp: "2026-01-03T00:00:00.000Z", costMicroUsd: 3 }),
        makeRequest({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 1 }),
        makeRequest({ timestamp: "2026-01-02T00:00:00.000Z", costMicroUsd: 2 }),
      ];
      const report = buildReport([makeSession("s1", requests)], []);
      expect(report.sessions[0]!.requests.map((r) => r.costMicroUsd)).toEqual([1, 2, 3]);
    });

    it("puts a request with no timestamp last", () => {
      const requests = [
        makeRequest({ timestamp: null, costMicroUsd: 9 }),
        makeRequest({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 1 }),
      ];
      const report = buildReport([makeSession("s1", requests)], []);
      expect(report.sessions[0]!.requests.map((r) => r.costMicroUsd)).toEqual([1, 9]);
    });

    it("is frozen", () => {
      const report = buildReport([makeSession("s1", [makeRequest()])], []);
      expect(Object.isFrozen(report.sessions[0]!.requests)).toBe(true);
    });

    it("an aborted request yields no request row and is counted in openRequests", () => {
      const session = makeSession("s1", [makeRequest()], {});
      // Simulate an aborted request: openRequests > 0, but no extra RequestRecord.
      const audit = { ...session.audit, openRequests: 1 };
      const report = buildReport([{ ...session, audit }], []);
      expect(report.sessions[0]!.requests).toHaveLength(1);
      expect(report.sessions[0]!.openRequests).toBe(1);
    });

    it("keeping the request list changes no total, bucket or group", () => {
      const sessions = [
        makeSession(
          "s1",
          [makeRequest({ costMicroUsd: 100_000, timestamp: "2026-01-01T00:00:00.000Z" })],
          { project: { kind: "named", spaceId: "p1", name: "One" } },
        ),
      ];
      const report = buildReport(sessions, []);
      // Same totals, group and day-bucket figures as before `requests` was
      // added to `SessionRow` -- restoring the list changes no aggregate.
      expect(report.totals.costMicroUsd).toBe(100_000);
      expect(report.projectGroups[0]!.totals.costMicroUsd).toBe(100_000);
      expect(report.byDay).toEqual([
        expect.objectContaining({ key: "2026-01-01", costMicroUsd: 100_000, requests: 1 }),
      ]);
    });
  });

  describe("SessionRow.toolUses (S12 plan §4.4, §5, §6)", () => {
    const toolUses = [
      { name: "Bash", calls: 3 },
      { name: "Read", calls: 1 },
    ];

    it("carries the parser's ranked counts", () => {
      const session = makeSession("s1", [makeRequest()]);
      const audit = { ...session.audit, toolUses };
      const report = buildReport([{ ...session, audit }], []);
      expect(report.sessions[0]!.toolUses).toEqual(toolUses);
    });

    it("is frozen and not re-sorted by the report", () => {
      // Deliberately NOT calls-descending: proves the report passes the
      // parser's order through rather than re-deriving it.
      const unsorted = Object.freeze([
        { name: "Read", calls: 1 },
        { name: "Bash", calls: 3 },
      ]);
      const session = makeSession("s1", [makeRequest()]);
      const audit = { ...session.audit, toolUses: unsorted };
      const report = buildReport([{ ...session, audit }], []);
      expect(report.sessions[0]!.toolUses).toEqual(unsorted);
      expect(report.sessions[0]!.toolUses).toBe(unsorted);
      expect(Object.isFrozen(report.sessions[0]!.toolUses)).toBe(true);
    });

    it("adding tool counts changes no total, bucket or group", () => {
      const session = makeSession(
        "s1",
        [makeRequest({ costMicroUsd: 100_000, timestamp: "2026-01-01T00:00:00.000Z" })],
        { project: { kind: "named", spaceId: "p1", name: "One" } },
      );
      const audit = { ...session.audit, toolUses };
      const report = buildReport([{ ...session, audit }], []);
      expect(report.totals.costMicroUsd).toBe(100_000);
      expect(report.totals.requests).toBe(1);
      expect(report.projectGroups[0]!.totals.costMicroUsd).toBe(100_000);
      expect(report.byDay).toEqual([
        expect.objectContaining({ key: "2026-01-01", costMicroUsd: 100_000, requests: 1 }),
      ]);
    });
  });

  describe("date range filtering (S13 plan §6)", () => {
    // Half-open [2026-03-01, 2026-04-01): a UTC calendar March.
    const marchRange: DateRange = {
      fromMs: Date.parse("2026-03-01T00:00:00.000Z"),
      toMs: Date.parse("2026-04-01T00:00:00.000Z"),
    };

    function fixtureSession(): ResolvedSession {
      const audit = parseAuditText("straddle", readFileSync(MONTH_STRADDLE_JSONL, "utf-8"));
      return { audit, meta: null, project: { kind: "none" }, folders: [] };
    }

    it("a session straddling a month end contributes only its in-range requests", () => {
      // Load-bearing pin (LEARNINGS: build the test so the wrong
      // implementation gives a different answer). "Filter by session" (keep
      // everything, or drop everything) both give a DIFFERENT total here —
      // see plan §5's table.
      const report = buildReport([fixtureSession()], [], { range: marchRange });
      expect(report.totals.costMicroUsd).toBe(3_000_000);
      expect(report.totals.requests).toBe(2);
    });

    it("a straddling session is marked isPartial and reports its excluded request count", () => {
      const report = buildReport([fixtureSession()], [], { range: marchRange });
      const row = report.sessions[0]!;
      expect(row.isPartial).toBe(true);
      expect(row.excludedRequests).toBe(3);
    });

    it("a session wholly outside the range is dropped from sessions and from both groupings", () => {
      const janRange: DateRange = {
        fromMs: Date.parse("2026-01-01T00:00:00.000Z"),
        toMs: Date.parse("2026-02-01T00:00:00.000Z"),
      };
      const report = buildReport([fixtureSession()], [], { range: janRange });
      expect(report.sessions).toEqual([]);
      expect(report.projectGroups).toEqual([]);
      expect(report.folderGroups).toEqual([]);
    });

    it("group session counts still sum to report.sessions.length under a filter", () => {
      // Includes the straddling fixture session alongside two whole-session
      // cases: the fixed EXPECTED count of 3 (not merely "groups sum to
      // whatever sessions.length happens to be") is what makes this fail
      // under NC2 -- a group-sum check alone is a structural tautology in
      // this codebase (both groupings are always derived from the same
      // `sessionRows` array), so it cannot by itself catch "drop the whole
      // session unless every request is in range" dropping the straddling
      // session entirely (LEARNINGS: build the test so the wrong
      // implementation gives a different answer).
      const sessions = [
        makeSession(
          "also-in-range",
          [makeRequest({ timestamp: "2026-03-20T00:00:00.000Z", costMicroUsd: 2 })],
          { project: { kind: "named", spaceId: "p2", name: "Two" } },
        ),
        makeSession(
          "outside",
          [makeRequest({ timestamp: "2026-05-01T00:00:00.000Z", costMicroUsd: 3 })],
          { project: { kind: "named", spaceId: "p3", name: "Three" } },
        ),
        fixtureSession(),
      ];
      const report = buildReport(sessions, [], { range: marchRange });
      const projectSum = report.projectGroups.reduce((n, g) => n + g.sessionCount, 0);
      const folderSum = report.folderGroups.reduce((n, g) => n + g.sessionCount, 0);
      expect(report.sessions.length).toBe(2);
      expect(projectSum).toBe(report.sessions.length);
      expect(folderSum).toBe(report.sessions.length);
    });

    it("byDay and byMonth contain only in-range requests under a filter", () => {
      const report = buildReport([fixtureSession()], [], { range: marchRange });
      expect(report.byDay.map((b) => b.key)).toEqual(["2026-03-30", "2026-03-31"]);
      expect(report.byMonth.map((b) => b.key)).toEqual(["2026-03"]);
    });

    it("a partial session's model breakdown covers only its in-range requests", () => {
      const sessions = [
        makeSession("s1", [
          makeRequest({
            timestamp: "2026-03-05T00:00:00.000Z",
            models: [makeModel({ model: "claude-opus-5", costMicroUsd: 1_000 })],
          }),
          makeRequest({
            timestamp: "2026-05-05T00:00:00.000Z",
            models: [makeModel({ model: "claude-opus-5", costMicroUsd: 9_000 })],
          }),
        ]),
      ];
      const report = buildReport(sessions, [], { range: marchRange });
      expect(report.sessions[0]!.models.costMicroUsd).toBe(1_000);
    });

    it("SessionRow.requests lists only the in-range requests of a partial session", () => {
      const report = buildReport([fixtureSession()], [], { range: marchRange });
      expect(report.sessions[0]!.requests).toHaveLength(2);
      expect(report.sessions[0]!.requests.map((r) => r.costMicroUsd)).toEqual([
        1_000_000, 2_000_000,
      ]);
    });

    it("undated requests are excluded under a bounded range and counted in report.excluded", () => {
      const report = buildReport([fixtureSession()], [], { range: marchRange });
      expect(report.undated).toEqual({ requests: 0, costMicroUsd: 0 });
      expect(report.excluded.undatedRequests).toBe(1);
      expect(report.excluded.requests).toBe(3);
      expect(report.excluded.costMicroUsd).toBe(4_000_000 + 8_000_000 + 16_000_000);
    });

    it("openRequests and gaps are unchanged by a filter on a retained session", () => {
      const withoutRange = buildReport([fixtureSession()], []);
      const withRange = buildReport([fixtureSession()], [], { range: marchRange });
      expect(withRange.sessions[0]!.openRequests).toBe(withoutRange.sessions[0]!.openRequests);
      expect(withRange.sessions[0]!.openRequests).toBe(1);
      expect(withRange.gaps).toEqual(withoutRange.gaps);
    });

    it("ALL_TIME produces a report deeply equal to one built with no range option", () => {
      const sessions = [makeSession("s1", [makeRequest({ costMicroUsd: 5 })])];
      const withOption = buildReport(sessions, [], { range: ALL_TIME });
      const withoutOption = buildReport(sessions, []);
      expect(withOption).toEqual(withoutOption);
    });

    it("a session with zero result lines but a non-zero openRequests still appears under ALL_TIME (Q8)", () => {
      // The dropping rule is gated on `!isAllTime(range)` -- a session with NO
      // requests at all must still survive when no range is active, exactly
      // as it did before this session existed. This is the case an
      // implementation that drops zero-request sessions unconditionally
      // breaks, even though both `{ range: ALL_TIME }` and "no options" agree
      // with each other on it (LEARNINGS: build the test so the wrong
      // implementation gives a different answer).
      const session = makeSession("s1", []);
      const audit = { ...session.audit, openRequests: 1 };
      const report = buildReport([{ ...session, audit }], []);
      expect(report.sessions).toHaveLength(1);
      expect(report.sessions[0]!.openRequests).toBe(1);
      expect(report.sessions[0]!.totals.requests).toBe(0);
    });

    it("GroupRow.partialSessions counts only partially included sessions", () => {
      const sessions = [
        makeSession(
          "partial",
          [
            makeRequest({ timestamp: "2026-03-05T00:00:00.000Z", costMicroUsd: 1 }),
            makeRequest({ timestamp: "2026-05-05T00:00:00.000Z", costMicroUsd: 2 }),
          ],
          { project: { kind: "named", spaceId: "p", name: "P" } },
        ),
        makeSession(
          "whole",
          [makeRequest({ timestamp: "2026-03-10T00:00:00.000Z", costMicroUsd: 3 })],
          { project: { kind: "named", spaceId: "p", name: "P" } },
        ),
      ];
      const report = buildReport(sessions, [], { range: marchRange });
      expect(report.projectGroups[0]!.partialSessions).toBe(1);
      expect(report.projectGroups[0]!.sessionCount).toBe(2);
    });

    it("report.excluded is all zeroes under ALL_TIME", () => {
      const report = buildReport([fixtureSession()], []);
      expect(report.excluded).toEqual({
        sessions: 0,
        requests: 0,
        costMicroUsd: 0,
        undatedRequests: 0,
      });
    });

    it("the DST fixture's two requests fall on different local days under a per-instant zone, despite sharing a UTC day", () => {
      const audit = parseAuditText("dst", readFileSync(DST_STRADDLE_JSONL, "utf-8"));
      const session: ResolvedSession = {
        audit,
        meta: null,
        project: { kind: "none" },
        folders: [],
      };
      // Both raw timestamps fall on 2026-03-29 in UTC. This resolver is
      // engineered (not the host zone, LEARNINGS) so the offset differs
      // before/after a threshold BETWEEN the two requests, splitting them
      // onto different local days — proof the day key is derived per
      // instant, not once for the whole session.
      const jump = Date.parse("2026-03-29T01:00:00.000Z");
      const zone: ZoneOffsetResolver = (ms) => (ms < jump ? -60 : 120);

      const report = buildReport([session], [], { zone });

      expect(report.byDay.map((b) => b.key)).toEqual(["2026-03-28", "2026-03-29"]);
      expect(report.byDay.map((b) => b.costMicroUsd)).toEqual([1_000_000, 2_000_000]);
    });
  });
});
