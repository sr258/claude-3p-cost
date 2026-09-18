/**
 * `buildReport` — the one entry point S8+ reads from (S5 plan §4.6, §5).
 * Pure, O(requests), and frozen all the way down. No rounding anywhere in
 * this file except `costShare`'s ratio — see plan §2 Q9 and §6.
 */
import type { Problem } from "./problems.js";
import { folderKey, folderRefOf } from "./folder-grouping.js";
import { projectKey, summarizeGaps } from "./project-assignment.js";
import type { ResolvedSession } from "./project-types.js";
import type {
  CostTotals,
  GroupLabel,
  GroupRow,
  ModelBreakdown,
  Report,
  SessionRow,
  TimeBucket,
} from "./report-types.js";
import {
  dayKey,
  monthKey,
  parseTimestamp,
  utcOffset,
  type ZoneOffsetResolver,
} from "./time-buckets.js";
import {
  createModelAccumulator,
  createTotalsAccumulator,
  EMPTY_MODEL_BREAKDOWN,
  EMPTY_TOTALS,
} from "./totals.js";

export interface ReportOptions {
  /** Defaults to `utcOffset`. See plan §2 Q1. */
  readonly zone?: ZoneOffsetResolver;
}

interface TimeBucketAccumulator {
  costMicroUsd: number;
  requests: number;
  durationMs: number;
}

function bucketFor(map: Map<string, TimeBucketAccumulator>, key: string): TimeBucketAccumulator {
  let bucket = map.get(key);
  if (bucket === undefined) {
    bucket = { costMicroUsd: 0, requests: 0, durationMs: 0 };
    map.set(key, bucket);
  }
  return bucket;
}

function sortedBuckets(map: Map<string, TimeBucketAccumulator>): readonly TimeBucket[] {
  return Object.freeze(
    [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, bucket]) =>
        Object.freeze({
          key,
          costMicroUsd: bucket.costMicroUsd,
          requests: bucket.requests,
          durationMs: bucket.durationMs,
        }),
      ),
  );
}

function buildSessionRow(
  session: ResolvedSession,
  zone: ZoneOffsetResolver,
  dayMap: Map<string, TimeBucketAccumulator>,
  monthMap: Map<string, TimeBucketAccumulator>,
  undated: { requests: number; costMicroUsd: number },
): SessionRow {
  const totalsAcc = createTotalsAccumulator();
  const modelAcc = createModelAccumulator();
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;

  for (const request of session.audit.requests) {
    totalsAcc.add(request);
    modelAcc.add(request);

    if (request.timestamp !== null) {
      if (firstTimestamp === null || request.timestamp < firstTimestamp) {
        firstTimestamp = request.timestamp;
      }
      if (lastTimestamp === null || request.timestamp > lastTimestamp) {
        lastTimestamp = request.timestamp;
      }
    }

    const epochMs = parseTimestamp(request.timestamp);
    if (epochMs === null) {
      undated.requests += 1;
      undated.costMicroUsd += request.costMicroUsd;
    } else {
      const day = bucketFor(dayMap, dayKey(epochMs, zone));
      day.costMicroUsd += request.costMicroUsd;
      day.requests += 1;
      day.durationMs += request.durationMs;

      const month = bucketFor(monthMap, monthKey(epochMs, zone));
      month.costMicroUsd += request.costMicroUsd;
      month.requests += 1;
      month.durationMs += request.durationMs;
    }
  }

  return Object.freeze({
    sessionId: session.audit.sessionId,
    sourceId: session.audit.sourceId,
    title: session.meta?.title ?? "",
    hasManifest: session.meta !== null,
    isArchived: session.meta?.isArchived ?? false,
    isStarred: session.meta?.isStarred ?? false,
    project: session.project,
    folder: folderRefOf(session.folders),
    model: session.meta?.model ?? session.audit.initModel,
    openRequests: session.audit.openRequests,
    firstTimestamp,
    lastTimestamp,
    lastActivityAt: session.meta?.lastActivityAt ?? null,
    totals: totalsAcc.value,
    models: modelAcc.value,
  });
}

function compareByCostDescThenKeyAsc(
  aCost: number,
  aKey: string,
  bCost: number,
  bKey: string,
): number {
  if (aCost !== bCost) {
    return bCost - aCost;
  }
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

function groupSessions(
  rows: readonly SessionRow[],
  keyOf: (row: SessionRow) => string,
  labelOf: (row: SessionRow) => GroupLabel,
): readonly GroupRow[] {
  interface MutableGroup {
    key: string;
    label: GroupLabel;
    sessions: SessionRow[];
  }
  const groups = new Map<string, MutableGroup>();

  for (const row of rows) {
    const key = keyOf(row);
    let group = groups.get(key);
    if (group === undefined) {
      group = { key, label: labelOf(row), sessions: [] };
      groups.set(key, group);
    }
    group.sessions.push(row);
  }

  const result: GroupRow[] = [];
  for (const group of groups.values()) {
    const sortedSessions = [...group.sessions].sort((a, b) =>
      compareByCostDescThenKeyAsc(
        a.totals.costMicroUsd,
        a.sessionId,
        b.totals.costMicroUsd,
        b.sessionId,
      ),
    );
    const totalsAcc = createTotalsAccumulator();
    const modelAcc = createModelAccumulator();
    for (const session of sortedSessions) {
      totalsAcc.merge(session.totals);
      modelAcc.merge(session.models);
    }
    result.push(
      Object.freeze({
        key: group.key,
        label: group.label,
        sessions: Object.freeze(sortedSessions),
        sessionCount: sortedSessions.length,
        totals: totalsAcc.value,
        models: modelAcc.value,
      }),
    );
  }

  result.sort((a, b) =>
    compareByCostDescThenKeyAsc(a.totals.costMicroUsd, a.key, b.totals.costMicroUsd, b.key),
  );
  return Object.freeze(result);
}

/**
 * Pure, O(requests), and frozen all the way down. S13 will add an optional
 * per-request predicate here; the loop is already request-granular so that
 * it can.
 */
export function buildReport(
  sessions: readonly ResolvedSession[],
  problems: readonly Problem[],
  options?: ReportOptions,
): Report {
  const zone = options?.zone ?? utcOffset;

  const dayMap = new Map<string, TimeBucketAccumulator>();
  const monthMap = new Map<string, TimeBucketAccumulator>();
  const undated: { requests: number; costMicroUsd: number } = {
    requests: 0,
    costMicroUsd: 0,
  };

  const sessionRows = sessions.map((session) =>
    buildSessionRow(session, zone, dayMap, monthMap, undated),
  );

  const sortedSessions = [...sessionRows].sort((a, b) =>
    compareByCostDescThenKeyAsc(
      a.totals.costMicroUsd,
      a.sessionId,
      b.totals.costMicroUsd,
      b.sessionId,
    ),
  );

  const projectGroups = groupSessions(
    sessionRows,
    (row) => projectKey(row.project),
    (row) => ({ kind: "project", project: row.project }),
  );
  const folderGroups = groupSessions(
    sessionRows,
    (row) => folderKey(row.folder),
    (row) => ({ kind: "folder", folder: row.folder }),
  );

  const totalsAcc = createTotalsAccumulator();
  const modelAcc = createModelAccumulator();
  for (const group of projectGroups) {
    totalsAcc.merge(group.totals);
    modelAcc.merge(group.models);
  }

  return Object.freeze({
    sessions: Object.freeze(sortedSessions),
    projectGroups,
    folderGroups,
    totals: sessionRows.length === 0 ? EMPTY_TOTALS : totalsAcc.value,
    models: sessionRows.length === 0 ? EMPTY_MODEL_BREAKDOWN : modelAcc.value,
    byDay: sortedBuckets(dayMap),
    byMonth: sortedBuckets(monthMap),
    undated: Object.freeze({ requests: undated.requests, costMicroUsd: undated.costMicroUsd }),
    gaps: summarizeGaps(sessions),
    problems: Object.freeze([...problems]),
  });
}

/** part / total as a 0..1 ratio; 0 when total is 0. Not a display rounding. */
export function costShare(partMicroUsd: number, totalMicroUsd: number): number {
  return totalMicroUsd === 0 ? 0 : partMicroUsd / totalMicroUsd;
}

/**
 * `totals.costMicroUsd - models.costMicroUsd`, clamped at 0. Cost carried by
 * a `result` line that named no `modelUsage` key. Never given a share (plan
 * §2 Q5) -- `ModelBreakdown.costMicroUsd` is deliberately not the
 * authoritative total, so this is the honest remainder rather than a rounding
 * artefact. A negative difference would mean `modelUsage` over-counts, which
 * no observed data does; clamping to 0 keeps a parser bug from ever drawing a
 * negative bar instead of surfacing it.
 */
export function unattributedCostMicroUsd(totals: CostTotals, models: ModelBreakdown): number {
  return Math.max(0, totals.costMicroUsd - models.costMicroUsd);
}

/**
 * The group with this key, or null. The panel's scope is derived through
 * this, so a key for a group that vanished on a rescan falls back silently to
 * the global scope (plan §2 Q12). Keys are never pruned.
 */
export function findGroup(groups: readonly GroupRow[], key: string | null): GroupRow | null {
  if (key === null) {
    return null;
  }
  return groups.find((group) => group.key === key) ?? null;
}

export type SortDirection = "asc" | "desc";
export type RowSortField = "cost" | "requests" | "duration" | "lastActivity";

function fieldValue(field: RowSortField, totals: CostTotals): number {
  switch (field) {
    case "cost":
      return totals.costMicroUsd;
    case "requests":
      return totals.requests;
    case "duration":
      return totals.durationMs;
    case "lastActivity":
      return 0; // unreachable: comparePrimary handles it before calling here
  }
}

/**
 * A null `lastActivity` sorts LAST in both directions (plan §4.6). The null
 * verdict is therefore NOT multiplied by the direction sign — doing so would
 * float every undated row to the top of a descending sort. Returns `null` when
 * both sides are present and the ordinary signed comparison applies.
 */
function compareNullsLast(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return null;
}

function comparePrimary(
  field: RowSortField,
  sign: number,
  aValue: number | null,
  bValue: number | null,
  aTotals: CostTotals,
  bTotals: CostTotals,
): number {
  if (field === "lastActivity") {
    const nulls = compareNullsLast(aValue, bValue);
    if (nulls !== null) {
      return nulls;
    }
    return sign * ((aValue ?? 0) - (bValue ?? 0));
  }
  return sign * (fieldValue(field, aTotals) - fieldValue(field, bTotals));
}

export type SessionSortField = RowSortField | "title";
export type TextComparator = (a: string, b: string) => number;

export interface SessionSortOptions {
  /**
   * Defaults to code-unit order. NEVER call localeCompare in this module
   * (LEARNINGS): the UI injects an Intl.Collator bound to the active locale.
   */
  readonly compareText?: TextComparator;
}

/**
 * The manifest's lastActivityAt, falling back to the last result timestamp.
 * Null only when the session has neither. Used for BOTH the displayed
 * last-activity cell and the "lastActivity" sort field, so they can never
 * disagree (S9 plan §2 Q5).
 */
export function sessionLastActivity(row: SessionRow): number | null {
  return row.lastActivityAt ?? parseTimestamp(row.lastTimestamp);
}

function defaultCompareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * An empty title sorts LAST in both directions — exactly the `lastActivity`
 * null rule above, and for the same reason: the null/empty verdict is NOT
 * multiplied by the direction sign (LEARNINGS — the nulls-last-times-
 * direction-sign trap). Returns `null` when neither title is empty, so the
 * ordinary signed text comparison applies.
 */
function compareEmptyTitleLast(a: string, b: string): number | null {
  const aEmpty = a === "";
  const bEmpty = b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return null;
}

export function compareSessionRows(
  field: SessionSortField,
  direction: SortDirection,
  options?: SessionSortOptions,
): (a: SessionRow, b: SessionRow) => number {
  const sign = direction === "asc" ? 1 : -1;
  const compareText = options?.compareText ?? defaultCompareText;
  return (a, b) => {
    let primary: number;
    if (field === "title") {
      const nulls = compareEmptyTitleLast(a.title, b.title);
      primary = nulls !== null ? nulls : sign * compareText(a.title, b.title);
    } else {
      primary = comparePrimary(
        field,
        sign,
        sessionLastActivity(a),
        sessionLastActivity(b),
        a.totals,
        b.totals,
      );
    }
    if (primary !== 0) {
      return primary;
    }
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
  };
}

function groupLastActivity(row: GroupRow): number | null {
  let max: number | null = null;
  for (const session of row.sessions) {
    if (session.lastActivityAt !== null && (max === null || session.lastActivityAt > max)) {
      max = session.lastActivityAt;
    }
  }
  return max;
}

export function compareGroupRows(
  field: RowSortField,
  direction: SortDirection,
): (a: GroupRow, b: GroupRow) => number {
  const sign = direction === "asc" ? 1 : -1;
  return (a, b) => {
    const primary = comparePrimary(
      field,
      sign,
      groupLastActivity(a),
      groupLastActivity(b),
      a.totals,
      b.totals,
    );
    if (primary !== 0) {
      return primary;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  };
}
