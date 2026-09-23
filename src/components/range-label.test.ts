import { afterEach, describe, expect, it } from "vitest";
import { locale } from "../state/app-state.js";
import { formatDate } from "../i18n/format.js";
import { translate } from "../i18n/translate.js";
import { ALL_TIME, type DateRange } from "../model/date-range.js";
import { rangeLabel, rangePeriodText } from "./range-label.js";

describe("rangePeriodText", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("formats a bounded span with an inclusive end day", () => {
    // toMs is EXCLUSIVE (S13 plan §2 Q3): the day before it is what a
    // reader must see as the last included day. `tDate` renders in the
    // HOST zone (rangePeriodText applies no explicit `timeZone: "UTC"`,
    // unlike trend-section.tsx's bucket-key formatting) — so the boundary
    // is built from local-time `Date` components, not `Date.UTC`, or the
    // pin is only correct on a host whose offset happens to be zero
    // (LEARNINGS: a zone test using a UTC-midnight instant passes under
    // some offsets and silently fails to exercise the boundary under
    // others; local midnight is a day boundary in every host zone).
    const fromMs = new Date(2026, 7, 24, 12).getTime();
    const toMs = new Date(2026, 8, 24, 0, 0, 0, 0).getTime(); // exclusive -> last day is local 2026-09-23
    const text = rangePeriodText(fromMs, toMs);
    const expected = translate("en", "range.span", {
      from: formatDate("en", fromMs),
      to: formatDate("en", toMs - 1),
    });
    expect(text).toBe(expected);
    // The off-by-one this pins: using toMs itself (not toMs - 1) would show
    // 2026-09-24, one day past the actual last included day.
    expect(text).not.toBe(
      translate("en", "range.span", { from: formatDate("en", fromMs), to: formatDate("en", toMs) }),
    );
  });

  it("formats an unbounded end as a 'from' span", () => {
    const fromMs = new Date(2026, 7, 24, 12).getTime();
    expect(rangePeriodText(fromMs, null)).toBe(
      translate("en", "range.spanFrom", { from: formatDate("en", fromMs) }),
    );
  });

  it("formats an unbounded start as a 'to' span, with the inclusive end day", () => {
    const toMs = new Date(2026, 8, 24, 0, 0, 0, 0).getTime();
    expect(rangePeriodText(null, toMs)).toBe(
      translate("en", "range.spanTo", { to: formatDate("en", toMs - 1) }),
    );
  });
});

describe("rangeLabel", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("returns null for an all-time range", () => {
    expect(rangeLabel(ALL_TIME)).toBeNull();
  });

  it("returns null when the range argument itself is null", () => {
    expect(rangeLabel(null)).toBeNull();
  });

  it("returns the formatted span for a bounded range", () => {
    const range: DateRange = {
      fromMs: new Date(2026, 7, 24, 12).getTime(),
      toMs: new Date(2026, 8, 24, 0, 0, 0, 0).getTime(),
    };
    expect(rangeLabel(range)).toBe(rangePeriodText(range.fromMs, range.toMs));
  });
});
