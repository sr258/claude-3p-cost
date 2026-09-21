import { describe, expect, it } from "vitest";
import {
  ALL_TIME,
  containsInstant,
  dayStringsOf,
  isAllTime,
  isValidRange,
  rangeFromDayStrings,
  resolvePreset,
  startOfLocalDay,
} from "./date-range.js";
import { utcOffset, type ZoneOffsetResolver } from "./time-buckets.js";

describe("resolvePreset", () => {
  it("thisMonth begins at local midnight on the first, not at UTC midnight", () => {
    const plusTwo: ZoneOffsetResolver = () => 120; // UTC+2
    const nowMs = Date.parse("2026-03-15T10:00:00.000Z");

    const range = resolvePreset("thisMonth", nowMs, plusTwo);

    const utcMidnight = Date.UTC(2026, 2, 1);
    expect(range.fromMs).not.toBe(utcMidnight);
    expect(range.fromMs).toBe(utcMidnight - 120 * 60_000);
  });

  it("lastMonth ends exactly where thisMonth begins — no gap and no overlap", () => {
    const nowMs = Date.parse("2026-03-15T10:00:00.000Z");

    const thisMonth = resolvePreset("thisMonth", nowMs, utcOffset);
    const lastMonth = resolvePreset("lastMonth", nowMs, utcOffset);

    expect(lastMonth.toMs).toBe(thisMonth.fromMs);
  });

  it("an instant exactly on the month boundary belongs to thisMonth and to lastMonth's exclusive end", () => {
    // The composite of test 2 (adjacent bounds) and test 7 (half-open
    // membership) is the property US-5.1's month-end trap actually needs:
    // the shared instant must land in EXACTLY ONE of the two adjacent
    // presets. Neither test alone catches an inclusive upper bound composed
    // with adjacent bounds -- test 2 never calls `containsInstant` and test 7
    // never calls `resolvePreset`, so a `<=` upper bound double-counts a
    // boundary request while both still pass.
    const plusTwo: ZoneOffsetResolver = () => 120;
    const nowMs = Date.parse("2026-03-15T10:00:00.000Z");
    const thisMonth = resolvePreset("thisMonth", nowMs, plusTwo);
    const lastMonth = resolvePreset("lastMonth", nowMs, plusTwo);
    const boundary = thisMonth.fromMs!;

    expect(containsInstant(boundary, thisMonth)).toBe(true);
    expect(containsInstant(boundary, lastMonth)).toBe(false);
    // And one millisecond earlier is the mirror: February only.
    expect(containsInstant(boundary - 1, lastMonth)).toBe(true);
    expect(containsInstant(boundary - 1, thisMonth)).toBe(false);
  });

  it("thisQuarter spans three calendar months and ends at the next quarter's start", () => {
    const nowMs = Date.parse("2026-05-10T00:00:00.000Z"); // April-June quarter

    const range = resolvePreset("thisQuarter", nowMs, utcOffset);

    expect(range.fromMs).toBe(Date.UTC(2026, 3, 1)); // April 1
    expect(range.toMs).toBe(Date.UTC(2026, 6, 1)); // July 1
  });

  it("a preset resolved from an instant 30 minutes after local midnight on a DST-jump day lands in the correct month", () => {
    // A resolver engineered so a naive single-pass fixpoint gets the wrong
    // day: at the TRUE local midnight instant the offset is 60, but at the
    // naive (offset-0) guess one hour earlier it is 0. Only a second
    // correction converges on the right answer (plan §7).
    const trueMidnight = Date.UTC(2026, 3, 1); // 2026-04-01T00:00:00.000Z
    const threshold = trueMidnight - 30 * 60_000;
    const zone: ZoneOffsetResolver = (ms) => (ms < threshold ? 0 : 60);
    const nowMs = trueMidnight + 30 * 60_000; // 30 minutes after true local midnight

    const range = resolvePreset("thisMonth", nowMs, zone);

    expect(range.fromMs).toBe(trueMidnight);
    // The wrong answer a single-pass implementation would give: one hour
    // early, landing on the previous month entirely.
    expect(range.fromMs).not.toBe(trueMidnight - 60 * 60_000);
  });

  it("the injected resolver is honoured: a fixed +13:45 offset moves the month boundary", () => {
    // No default resolver can produce +13:45 (825 minutes): utcOffset is
    // always 0. This is the only way to prove the parameter is consulted.
    const plusOddOffset: ZoneOffsetResolver = () => 825;
    const nowMs = Date.parse("2026-06-15T10:00:00.000Z");

    const withOffset = resolvePreset("thisMonth", nowMs, plusOddOffset);
    const withUtc = resolvePreset("thisMonth", nowMs, utcOffset);

    expect(withOffset.fromMs).toBe(Date.UTC(2026, 5, 1) - 825 * 60_000);
    expect(withOffset.fromMs).not.toBe(withUtc.fromMs);
  });

  it('resolvePreset("all") returns ALL_TIME and isAllTime agrees', () => {
    const range = resolvePreset("all", Date.now(), utcOffset);
    expect(range).toBe(ALL_TIME);
    expect(isAllTime(range)).toBe(true);
  });
});

describe("rangeFromDayStrings / dayStringsOf", () => {
  it("rangeFromDayStrings treats the to day as inclusive by taking the next day's start", () => {
    const range = rangeFromDayStrings(null, "2026-01-05", utcOffset);
    expect(range.toMs).toBe(startOfLocalDay(2026, 1, 6, utcOffset));
  });

  it("a malformed day string yields an unbounded side rather than throwing", () => {
    expect(() => rangeFromDayStrings("not-a-date", null, utcOffset)).not.toThrow();
    expect(rangeFromDayStrings("not-a-date", null, utcOffset).fromMs).toBeNull();
    expect(rangeFromDayStrings(null, "2026/01/05", utcOffset).toMs).toBeNull();
    expect(rangeFromDayStrings("", "", utcOffset)).toEqual({ fromMs: null, toMs: null });
  });

  it("dayStringsOf round-trips rangeFromDayStrings under a non-UTC resolver", () => {
    const minusFive: ZoneOffsetResolver = () => -300; // UTC-5
    const from = "2026-03-01";
    const to = "2026-03-31";

    const range = rangeFromDayStrings(from, to, minusFive);
    const result = dayStringsOf(range, minusFive);

    expect(result.from).toBe(from);
    expect(result.to).toBe(to);
  });

  it("dayStringsOf returns null for an unbounded side", () => {
    expect(dayStringsOf(ALL_TIME, utcOffset)).toEqual({ from: null, to: null });
  });
});

describe("containsInstant", () => {
  it("is half-open: an instant equal to toMs is excluded, one equal to fromMs is included", () => {
    const range = { fromMs: 100, toMs: 200 };
    expect(containsInstant(100, range)).toBe(true);
    expect(containsInstant(199, range)).toBe(true);
    expect(containsInstant(200, range)).toBe(false);
  });

  it("an undated request is excluded by every bounded range and included under ALL_TIME", () => {
    expect(containsInstant(null, ALL_TIME)).toBe(true);
    expect(containsInstant(null, { fromMs: 0, toMs: 100 })).toBe(false);
    // One bound present is already "bounded" — not ALL_TIME.
    expect(containsInstant(null, { fromMs: null, toMs: 100 })).toBe(false);
    expect(containsInstant(null, { fromMs: 0, toMs: null })).toBe(false);
  });
});

describe("isValidRange", () => {
  it("a from after a to is invalid and is never silently swapped", () => {
    expect(isValidRange({ fromMs: 200, toMs: 100 })).toBe(false);
    // rangeFromDayStrings/resolvePreset never reorder the bounds themselves —
    // isValidRange is purely a verdict, and the caller (app-state, Q15) is
    // responsible for keeping the previous range rather than swapping.
    expect(isValidRange({ fromMs: 100, toMs: 200 })).toBe(true);
    expect(isValidRange({ fromMs: 100, toMs: 100 })).toBe(true);
  });

  it("a one-sided or unbounded range is always valid", () => {
    expect(isValidRange(ALL_TIME)).toBe(true);
    expect(isValidRange({ fromMs: 100, toMs: null })).toBe(true);
    expect(isValidRange({ fromMs: null, toMs: 100 })).toBe(true);
  });
});
