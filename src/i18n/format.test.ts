import { describe, expect, it, vi } from "vitest";
import {
  compareText,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from "./format.js";

describe("format", () => {
  it("formats 1413.58 as 1.413,58 USD in German", () => {
    expect(formatCurrency("de", 1413.58)).toBe("1.413,58 USD");
  });

  it("formats 1413.58 as 1,413.58 USD in English", () => {
    expect(formatCurrency("en", 1413.58)).toBe("1,413.58 USD");
  });

  it("always shows two fraction digits for currency", () => {
    expect(formatCurrency("de", 5)).toBe("5,00 USD");
    expect(formatCurrency("en", 5)).toBe("5.00 USD");
  });

  it("formats an integer with locale grouping", () => {
    expect(formatNumber("de", 1234)).toBe("1.234");
    expect(formatNumber("en", 1234)).toBe("1,234");
  });

  it("formats a date as day-first in both locales", () => {
    const date = new Date(2026, 8, 15); // 15 September 2026
    expect(formatDate("de", date)).toMatch(/^15\./);
    expect(formatDate("en", date)).toMatch(/^15 /);
  });

  it("formats a date and time together", () => {
    const date = new Date(2026, 8, 15, 20, 35);
    const result = formatDateTime("de", date);
    expect(result).toContain("15.");
    expect(result).toMatch(/20:35|8:35/);
  });

  it("reuses a cached Intl formatter for repeated calls", () => {
    const spy = vi.spyOn(Intl, "NumberFormat");
    formatNumber("de", 1);
    const callsAfterFirst = spy.mock.calls.length;
    formatNumber("de", 2);
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
    spy.mockRestore();
  });

  it("formatDuration renders hours and minutes above an hour", () => {
    const ms = (9 * 3600 + 12 * 60) * 1000;
    expect(formatDuration("de", ms)).toBe("9 Std. 12 Min.");
    expect(formatDuration("en", ms)).toBe("9 h 12 min");
  });

  it("formatDuration renders minutes only between a minute and an hour", () => {
    const ms = 41 * 60 * 1000;
    expect(formatDuration("de", ms)).toBe("41 Min.");
    expect(formatDuration("en", ms)).toBe("41 min");
  });

  it("formatDuration renders seconds below a minute", () => {
    const ms = 38 * 1000;
    expect(formatDuration("de", ms)).toBe("38 Sek.");
    expect(formatDuration("en", ms)).toBe("38 s");
  });

  it("formatDuration of zero renders the zero-seconds form", () => {
    expect(formatDuration("de", 0)).toBe("0 Sek.");
    expect(formatDuration("en", 0)).toBe("0 s");
    expect(formatDuration("de", -5000)).toBe("0 Sek.");
    expect(formatDuration("en", Number.NaN)).toBe("0 s");
  });

  it("formatDuration puts the digits through Intl in both locales", () => {
    const ms = (1234 * 3600 + 56 * 60) * 1000;
    // A four-digit hour count forces locale grouping in the hours digit.
    expect(formatDuration("de", ms)).toBe("1.234 Std. 56 Min.");
    expect(formatDuration("en", ms)).toBe("1,234 h 56 min");
  });

  it("compareText orders umlauts with their base letter in German", () => {
    // Code-unit order would put "Ärger" (U+00C4) after "Zulu" (U+005A); German
    // collation orders it with its base letter "A", before "Zulu".
    expect(compareText("de", "Ärger", "Zulu")).toBeLessThan(0);
    expect(["Zulu", "Ärger"].sort((a, b) => compareText("de", a, b))).toEqual(["Ärger", "Zulu"]);
  });

  it("formatPercent renders a locale-appropriate percent with one fraction digit", () => {
    // German Intl output uses U+00A0 (non-breaking space) before the sign.
    expect(formatPercent("de", 0.784)).toBe("78,4 %");
    expect(formatPercent("en", 0.784)).toBe("78.4%");
  });

  it("formatPercent of a zero ratio renders zero percent", () => {
    expect(formatPercent("de", 0)).toBe("0 %");
    expect(formatPercent("en", 0)).toBe("0%");
  });

  it("compareText orders by base letter before case, in the way the active locale expects", () => {
    // Code-unit order puts every uppercase letter before every lowercase one
    // (U+0042 "B" < U+0061 "a"), so "Banana" < "apple" by code unit. Collation
    // orders by base letter first, so "apple" comes before "Banana" instead.
    expect(compareText("en", "apple", "Banana")).toBeLessThan(0);
  });
});
