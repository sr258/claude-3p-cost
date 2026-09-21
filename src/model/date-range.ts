/**
 * US-5.1's date range filter — pure, no clock, no DOM, no i18n import (S13
 * plan §4.1). "Now" is always a parameter (`resolvePreset`'s `nowMs`); the
 * only place that reads `Date.now()` is `src/state/app-state.ts`.
 */
import { dayKey, monthKey, type ZoneOffsetResolver } from "./time-buckets.js";

/** Half-open [fromMs, toMs). `null` on a side means unbounded there. */
export interface DateRange {
  readonly fromMs: number | null;
  readonly toMs: number | null;
}

/** Both bounds null. The unfiltered path. */
export const ALL_TIME: DateRange = Object.freeze({ fromMs: null, toMs: null });

export type RangePresetId = "all" | "thisMonth" | "lastMonth" | "thisQuarter" | "custom";

/** Both bounds null. The unfiltered path. */
export function isAllTime(range: DateRange): boolean {
  return range.fromMs === null && range.toMs === null;
}

/** False only when both bounds are present and fromMs > toMs (Q15). */
export function isValidRange(range: DateRange): boolean {
  if (range.fromMs === null || range.toMs === null) {
    return true;
  }
  return range.fromMs <= range.toMs;
}

/**
 * Half-open membership. A null timestamp (unparseable) is a member ONLY of
 * ALL_TIME (Q9). fromMs is inclusive, toMs is exclusive.
 */
export function containsInstant(epochMs: number | null, range: DateRange): boolean {
  if (isAllTime(range)) {
    return true;
  }
  if (epochMs === null) {
    return false;
  }
  if (range.fromMs !== null && epochMs < range.fromMs) {
    return false;
  }
  if (range.toMs !== null && epochMs >= range.toMs) {
    return false;
  }
  return true;
}

/**
 * `Date.UTC` normalises out-of-range month/day fields itself (month 13 rolls
 * into next January, day 32 rolls into the following month), so callers may
 * pass a 1-based month or a day one past the end of its month without any
 * manual carry arithmetic.
 */
function naiveUtcMillis(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Epoch ms of the local midnight that begins y-m-d in the resolver's zone.
 * This is the INVERSE of ZoneOffsetResolver (instant -> offset), so it is
 * solved with a two-pass fixpoint: guess with the offset at the UTC-naive
 * instant, then re-read the offset at the candidate and correct once. A
 * second pass is enough for every real zone rule (no jurisdiction changes its
 * UTC offset twice within one candidate correction) — do not simplify this to
 * a single pass, and do not add a third: test 4 and test 25 (S13 plan §6, §7)
 * exist to catch exactly the one-hour, twice-a-year window where a single
 * pass gives the wrong local day.
 */
export function startOfLocalDay(y: number, m: number, d: number, zone: ZoneOffsetResolver): number {
  const naive = naiveUtcMillis(y, m, d);
  const offset1 = zone(naive);
  const guess1 = naive - Math.round(offset1) * 60_000;
  const offset2 = zone(guess1);
  return naive - Math.round(offset2) * 60_000;
}

function monthKeyParts(nowMs: number, zone: ZoneOffsetResolver): { y: number; m: number } {
  const key = monthKey(nowMs, zone);
  return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) };
}

/**
 * Whole calendar periods (Q14), resolved against an INJECTED nowMs — never
 * `Date.now()` (that stays banned in src/model/, LEARNINGS).
 */
export function resolvePreset(
  id: Exclude<RangePresetId, "custom">,
  nowMs: number,
  zone: ZoneOffsetResolver,
): DateRange {
  if (id === "all") {
    return ALL_TIME;
  }
  const { y, m } = monthKeyParts(nowMs, zone);
  if (id === "thisMonth") {
    return {
      fromMs: startOfLocalDay(y, m, 1, zone),
      toMs: startOfLocalDay(y, m + 1, 1, zone),
    };
  }
  if (id === "lastMonth") {
    return {
      fromMs: startOfLocalDay(y, m - 1, 1, zone),
      toMs: startOfLocalDay(y, m, 1, zone),
    };
  }
  // thisQuarter: months 1-3, 4-6, 7-9, 10-12.
  const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return {
    fromMs: startOfLocalDay(y, quarterStartMonth, 1, zone),
    toMs: startOfLocalDay(y, quarterStartMonth + 3, 1, zone),
  };
}

interface DayStringParts {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

/** Strict "YYYY-MM-DD"; anything else (including null) is not a valid day string. */
function parseDayString(value: string | null): DayStringParts | null {
  if (value === null) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * "YYYY-MM-DD" day strings as the UI holds them. `to` is the last INCLUDED
 * day and becomes the start of the following local day (Q3). A malformed or
 * empty string is treated as an unbounded side, never as an exception (NFR-3).
 */
export function rangeFromDayStrings(
  from: string | null,
  to: string | null,
  zone: ZoneOffsetResolver,
): DateRange {
  const fromParts = parseDayString(from);
  const toParts = parseDayString(to);
  return {
    fromMs: fromParts ? startOfLocalDay(fromParts.y, fromParts.m, fromParts.d, zone) : null,
    // The day AFTER the last included day (Q3): startOfLocalDay tolerates a
    // day one past the end of its month via Date.UTC's own normalisation.
    toMs: toParts ? startOfLocalDay(toParts.y, toParts.m, toParts.d + 1, zone) : null,
  };
}

/** Inverse of the above: seeds the inputs and renders the indicator. */
export function dayStringsOf(
  range: DateRange,
  zone: ZoneOffsetResolver,
): { readonly from: string | null; readonly to: string | null } {
  return {
    from: range.fromMs === null ? null : dayKey(range.fromMs, zone),
    // toMs is the start of the day AFTER the last included day; one ms
    // earlier falls back onto that last included day.
    to: range.toMs === null ? null : dayKey(range.toMs - 1, zone),
  };
}
