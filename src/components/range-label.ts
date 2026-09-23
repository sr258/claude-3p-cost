/**
 * The active date range as display text (S16b plan §5.1). Extracted from
 * `status-bar.tsx`'s private `rangePeriodText`, which the headline needs
 * verbatim — the same pattern as `group-label.ts`, a non-component `.ts`
 * living in `components/` with its own test file.
 */
import { t, tDate } from "../i18n/index.js";
import { isAllTime, type DateRange } from "../model/date-range.js";

/**
 * The active period, in the host zone (S13 plan §2 Q2, Q6). `fromMs`/`toMs`
 * are already correct instants regardless of zone, so `tDate` alone renders
 * them right — no need to round-trip through `dayStringsOf` here. `toMs` is
 * EXCLUSIVE (Q3), so the last included day is one ms earlier.
 */
export function rangePeriodText(fromMs: number | null, toMs: number | null): string {
  if (fromMs !== null && toMs !== null) {
    return t("range.span", { from: tDate(fromMs), to: tDate(toMs - 1) });
  }
  if (fromMs !== null) {
    return t("range.spanFrom", { from: tDate(fromMs) });
  }
  if (toMs !== null) {
    return t("range.spanTo", { to: tDate(toMs - 1) });
  }
  // Unreachable while isAllTime(range) is checked first, but total for NFR-3.
  return t("status.rangeAll");
}

/** `null` = all time — the caller omits the period slot entirely. */
export function rangeLabel(range: DateRange | null): string | null {
  if (range === null || isAllTime(range)) {
    return null;
  }
  return rangePeriodText(range.fromMs, range.toMs);
}
