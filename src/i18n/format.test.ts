import { describe, expect, it, vi } from "vitest";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "./format.js";

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
});
