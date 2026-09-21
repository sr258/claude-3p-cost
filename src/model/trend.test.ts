/**
 * `src/model/trend.ts` (S14 plan §6). Every test pins concrete per-bucket
 * values from a fixture built so a wrong bucketing rule (UTC instead of the
 * injected zone, an off-by-one fill window) yields a DIFFERENT key set, not
 * merely a different distribution (LEARNINGS: a "sums to N" invariant over
 * two views derived from one array is a tautology).
 */
import { describe, expect, it } from "vitest";
import { ALL_TIME, type DateRange } from "./date-range.js";
import type { RequestRecord } from "./audit-types.js";
import type { SessionRow } from "./report-types.js";
import type { ZoneOffsetResolver } from "./time-buckets.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "./totals.js";
import { bucketRows, buildTrend, MAX_TREND_POINTS, nextKey } from "./trend.js";

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

function req(overrides: Partial<RequestRecord> = {}): RequestRecord {
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

function row(sessionId: string, requests: readonly RequestRecord[]): SessionRow {
  return {
    sessionId,
    sourceId: sessionId,
    title: "",
    hasManifest: false,
    isArchived: false,
    isStarred: false,
    project: { kind: "none" },
    folder: { kind: "none" },
    model: null,
    openRequests: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    lastActivityAt: null,
    totals: EMPTY_TOTALS,
    models: EMPTY_MODEL_BREAKDOWN,
    requests,
    toolUses: [],
    excludedRequests: 0,
    isPartial: false,
  };
}

// A resolver no default can produce (LEARNINGS: an injectable dependency
// whose default agrees with the injection on every fixture is untested by
// construction) — +13:45, minutes east of UTC.
const OFFBEAT_ZONE: ZoneOffsetResolver = () => 13 * 60 + 45;

describe("bucketRows", () => {
  it("groups requests into day keys in the INJECTED zone, not UTC", () => {
    // 2026-06-15T10:20:00Z + 13:45 = 2026-06-16T00:05:00 local -> "2026-06-16".
    // A UTC implementation would put this on "2026-06-15" instead: a
    // DIFFERENT key set, not merely a different distribution.
    const rows = [row("s1", [req({ timestamp: "2026-06-15T10:20:00.000Z", costMicroUsd: 500 })])];
    const { buckets } = bucketRows(rows, "day", OFFBEAT_ZONE);
    expect(buckets).toEqual([
      expect.objectContaining({ key: "2026-06-16", costMicroUsd: 500, requests: 1 }),
    ]);
  });

  it("groups into month keys and a local-midnight instant on the 1st lands in the right month", () => {
    // 2026-06-30T23:00:00Z + 13:45 = 2026-07-01T12:45:00 local -> July, not June.
    const rows = [row("s1", [req({ timestamp: "2026-06-30T23:00:00.000Z", costMicroUsd: 700 })])];
    const { buckets } = bucketRows(rows, "month", OFFBEAT_ZONE);
    expect(buckets).toEqual([
      expect.objectContaining({ key: "2026-07", costMicroUsd: 700, requests: 1 }),
    ]);
  });

  it("counts undated requests separately and never into a bucket", () => {
    const rows = [
      row("s1", [
        req({ timestamp: null, costMicroUsd: 42 }),
        req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 8 }),
      ]),
    ];
    const { buckets, undated } = bucketRows(rows, "day", OFFBEAT_ZONE);
    expect(undated).toEqual({ requests: 1, costMicroUsd: 42 });
    expect(buckets).toEqual([
      expect.objectContaining({ key: "2026-01-01", costMicroUsd: 8, requests: 1 }),
    ]);
  });
});

describe("buildTrend", () => {
  it("inserts zero points for every gap day and marks them isZero", () => {
    const rows = [
      row("s1", [
        req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 100 }),
        req({ timestamp: "2026-01-04T00:00:00.000Z", costMicroUsd: 400 }),
      ]),
    ];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    expect(series.points.map((p) => p.key)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
    expect(series.points.map((p) => p.isZero)).toEqual([false, true, true, false]);
    expect(series.points.map((p) => p.costMicroUsd)).toEqual([100, 0, 0, 400]);
  });

  it("under an unbounded range spans first observed to last observed bucket, with no padding", () => {
    const rows = [
      row("s1", [
        req({ timestamp: "2026-02-10T00:00:00.000Z", costMicroUsd: 1 }),
        req({ timestamp: "2026-02-12T00:00:00.000Z", costMicroUsd: 2 }),
      ]),
    ];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    expect(series.points.map((p) => p.key)).toEqual(["2026-02-10", "2026-02-11", "2026-02-12"]);
  });

  it("under a bounded range pads to the range bounds, and the last point is the last INCLUDED day", () => {
    // range.toMs is the start of the day AFTER the last included day
    // (S13 Q3) -- using it directly would append one spurious trailing zero
    // row. The off-by-one pin for §4.1 implementation note 3.
    const rows = [row("s1", [req({ timestamp: "2026-03-15T00:00:00.000Z", costMicroUsd: 9 })])];
    const range: DateRange = {
      fromMs: Date.parse("2026-03-13T00:00:00.000Z"),
      toMs: Date.parse("2026-03-16T00:00:00.000Z"), // last included day is 2026-03-15
    };
    const series = buildTrend(rows, "day", () => 0, range);
    expect(series.points.map((p) => p.key)).toEqual(["2026-03-13", "2026-03-14", "2026-03-15"]);
    expect(series.points[series.points.length - 1]!.key).toBe("2026-03-15");
  });

  it("month fill crosses a year boundary", () => {
    const rows = [
      row("s1", [
        req({ timestamp: "2025-11-15T00:00:00.000Z", costMicroUsd: 1 }),
        req({ timestamp: "2026-02-15T00:00:00.000Z", costMicroUsd: 2 }),
      ]),
    ];
    const series = buildTrend(rows, "month", () => 0, ALL_TIME);
    expect(series.points.map((p) => p.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(series.points.map((p) => p.isZero)).toEqual([false, true, true, false]);
  });

  it("returns filled false and the observed buckets when the window exceeds MAX_TREND_POINTS", () => {
    const rows = [
      row("s1", [
        req({ timestamp: "2020-01-01T00:00:00.000Z", costMicroUsd: 1 }),
        req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 2 }),
      ]),
    ];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    expect(series.points.length).toBeLessThanOrEqual(MAX_TREND_POINTS);
    expect(series.filled).toBe(false);
    expect(series.points.map((p) => p.key)).toEqual(["2020-01-01", "2026-01-01"]);
    expect(series.points.every((p) => p.isZero === false)).toBe(true);
  });

  it("deltaRatio is null for the first point and for a zero previous bucket, never Infinity", () => {
    const rows = [
      row("s1", [
        req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 100 }),
        // 2026-01-02 has no data: zero-filled.
        req({ timestamp: "2026-01-03T00:00:00.000Z", costMicroUsd: 50 }),
      ]),
    ];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    const [first, mid, last] = series.points;
    expect(first!.deltaRatio).toBeNull();
    expect(mid!.deltaRatio).toBe((0 - 100) / 100);
    // Previous bucket (mid) is 0 -- must be null, never Infinity or NaN.
    expect(last!.deltaRatio).toBeNull();
    for (const point of series.points) {
      expect(Number.isFinite(point.deltaRatio ?? 0)).toBe(true);
    }
  });

  it("shares sum to 1 AND the series cost equals a hand-pinned figure", () => {
    const rows = [
      row("s1", [
        req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 300 }),
        req({ timestamp: "2026-01-02T00:00:00.000Z", costMicroUsd: 700 }),
      ]),
    ];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    expect(series.costMicroUsd).toBe(1_000);
    // Per-bucket shares are pinned CONCRETELY, not only as a sum: a
    // "shares sum to 1" assertion survives a wrong denominator and a wrong
    // distribution alike (LEARNINGS).
    expect(series.points.map((p) => p.share)).toEqual([0.3, 0.7]);
    const shareSum = series.points.reduce((sum, p) => sum + p.share, 0);
    expect(shareSum).toBeCloseTo(1, 10);
  });

  it("points are key-ascending regardless of session order", () => {
    const rows = [
      row("later", [req({ timestamp: "2026-01-05T00:00:00.000Z", costMicroUsd: 5 })]),
      row("earlier", [req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 1 })]),
    ];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    const keys = series.points.map((p) => p.key);
    expect(keys).toEqual([...keys].sort());
  });

  it("an empty row set yields zero points, filled true, and no throw (NFR-3)", () => {
    expect(() => buildTrend([], "day", () => 0, ALL_TIME)).not.toThrow();
    const series = buildTrend([], "day", () => 0, ALL_TIME);
    expect(series.points).toEqual([]);
    expect(series.filled).toBe(true);
    expect(series.costMicroUsd).toBe(0);
    expect(series.requests).toBe(0);
    expect(series.undated).toEqual({ requests: 0, costMicroUsd: 0 });
  });

  it("scopes undated totals to the given rows, not the global report", () => {
    const rows = [row("s1", [req({ timestamp: null, costMicroUsd: 77 })])];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    expect(series.undated).toEqual({ requests: 1, costMicroUsd: 77 });
    expect(series.points).toEqual([]);
  });

  it("is frozen all the way down", () => {
    const rows = [row("s1", [req({ timestamp: "2026-01-01T00:00:00.000Z", costMicroUsd: 1 })])];
    const series = buildTrend(rows, "day", () => 0, ALL_TIME);
    expect(Object.isFrozen(series)).toBe(true);
    expect(Object.isFrozen(series.points)).toBe(true);
    expect(Object.isFrozen(series.points[0])).toBe(true);
  });
});

describe("nextKey", () => {
  it("steps a day forward, rolling over a month end", () => {
    expect(nextKey("2026-09-17", "day")).toBe("2026-09-18");
    expect(nextKey("2026-09-30", "day")).toBe("2026-10-01");
  });

  it("steps a month forward, rolling over a year end", () => {
    expect(nextKey("2026-12", "month")).toBe("2027-01");
    expect(nextKey("2026-05", "month")).toBe("2026-06");
  });
});
