import { describe, expect, it } from "vitest";
import {
  dayKey,
  monthKey,
  parseTimestamp,
  utcOffset,
  type ZoneOffsetResolver,
} from "./time-buckets.js";

describe("parseTimestamp", () => {
  it("returns null for null, empty and non-ISO input", () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("not-a-date")).toBeNull();
  });

  it("reads the Z-suffixed ISO form used by the audit logs", () => {
    expect(parseTimestamp("2026-01-03T08:00:00.000Z")).toBe(Date.parse("2026-01-03T08:00:00.000Z"));
  });
});

describe("dayKey and monthKey", () => {
  it("agree with the POC's string slice under a UTC zone", () => {
    const epochMs = Date.parse("2026-03-07T14:22:00.000Z");
    expect(dayKey(epochMs)).toBe("2026-03-07");
    expect(monthKey(epochMs)).toBe("2026-03");
  });

  it("a positive offset moves a late-evening UTC instant to the next local day", () => {
    // 23:30 UTC + 120 minutes (UTC+2) = 01:30 the next day.
    const epochMs = Date.parse("2026-03-07T23:30:00.000Z");
    const plusTwo: ZoneOffsetResolver = () => 120;
    expect(dayKey(epochMs, plusTwo)).toBe("2026-03-08");
    expect(dayKey(epochMs, utcOffset)).toBe("2026-03-07");
  });

  it("a negative offset moves an early-morning UTC instant to the previous local day", () => {
    // 00:30 UTC - 300 minutes (UTC-5) = 19:30 the previous day.
    const epochMs = Date.parse("2026-03-07T00:30:00.000Z");
    const minusFive: ZoneOffsetResolver = () => -300;
    expect(dayKey(epochMs, minusFive)).toBe("2026-03-06");
  });

  it("the resolver is consulted per instant, so a DST change splits two days correctly", () => {
    // Before the DST jump: UTC+60. After: UTC+120. Each instant gets its own offset.
    const beforeJump = Date.parse("2026-03-29T00:30:00.000Z");
    const afterJump = Date.parse("2026-03-30T00:30:00.000Z");
    const dstResolver: ZoneOffsetResolver = (ms) =>
      ms < Date.parse("2026-03-29T12:00:00.000Z") ? 60 : 120;

    expect(dayKey(beforeJump, dstResolver)).toBe("2026-03-29");
    expect(dayKey(afterJump, dstResolver)).toBe("2026-03-30");
  });

  it("month and year rollovers produce the right key", () => {
    const endOfMonth = Date.parse("2026-01-31T23:30:00.000Z");
    const plusOneHour: ZoneOffsetResolver = () => 60;
    expect(dayKey(endOfMonth, plusOneHour)).toBe("2026-02-01");
    expect(monthKey(endOfMonth, plusOneHour)).toBe("2026-02");

    const endOfYear = Date.parse("2025-12-31T23:30:00.000Z");
    expect(dayKey(endOfYear, plusOneHour)).toBe("2026-01-01");
    expect(monthKey(endOfYear, plusOneHour)).toBe("2026-01");
  });

  it("keys are zero-padded to a fixed width so lexicographic order is chronological", () => {
    const januaryFirst = Date.parse("2026-01-01T00:00:00.000Z");
    expect(dayKey(januaryFirst)).toBe("2026-01-01");
    expect(monthKey(januaryFirst)).toBe("2026-01");
    expect(dayKey(januaryFirst) < dayKey(Date.parse("2026-01-10T00:00:00.000Z"))).toBe(true);
  });
});
