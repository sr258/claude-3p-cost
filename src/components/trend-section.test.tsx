import { render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCurrency, formatDate, formatPercent } from "../i18n/format.js";
import { locale } from "../state/app-state.js";
import type { TrendPoint, TrendSeries } from "../model/trend.js";
import { TrendSection } from "./trend-section.js";

function point(overrides: Partial<TrendPoint> & Pick<TrendPoint, "key">): TrendPoint {
  return {
    costMicroUsd: 0,
    requests: 0,
    durationMs: 0,
    isZero: false,
    deltaRatio: null,
    share: 0,
    ...overrides,
  };
}

function series(points: readonly TrendPoint[], overrides: Partial<TrendSeries> = {}): TrendSeries {
  return {
    granularity: "day",
    points,
    costMicroUsd: points.reduce((sum, p) => sum + p.costMicroUsd, 0),
    requests: points.reduce((sum, p) => sum + p.requests, 0),
    undated: { requests: 0, costMicroUsd: 0 },
    filled: true,
    ...overrides,
  };
}

describe("TrendSection", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders one row per point, newest first, while the series stays ascending", () => {
    const s = series([
      point({ key: "2026-01-01", costMicroUsd: 100 }),
      point({ key: "2026-01-02", costMicroUsd: 200 }),
      point({ key: "2026-01-03", costMicroUsd: 300 }),
    ]);
    render(
      <TrendSection
        series={s}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("trend-row");
    expect(rows.map((r) => r.getAttribute("data-key"))).toEqual([
      "2026-01-03",
      "2026-01-02",
      "2026-01-01",
    ]);
    // The series object passed in is untouched.
    expect(s.points.map((p) => p.key)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("a zero-filled row carries data-zero true and a data row carries false", () => {
    const s = series([
      point({ key: "2026-01-01", costMicroUsd: 100, isZero: false }),
      point({ key: "2026-01-02", costMicroUsd: 0, isZero: true }),
    ]);
    render(
      <TrendSection
        series={s}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("trend-row");
    const byKey = (key: string) => rows.find((r) => r.getAttribute("data-key") === key)!;
    expect(byKey("2026-01-01").getAttribute("data-zero")).toBe("false");
    expect(byKey("2026-01-02").getAttribute("data-zero")).toBe("true");
  });

  it("the granularity control is a radiogroup and reports the clicked value", () => {
    const onGranularity = vi.fn();
    render(
      <TrendSection
        series={series([])}
        granularity="month"
        scope={{ kind: "all" }}
        onGranularity={onGranularity}
      />,
    );
    const group = screen.getByTestId("trend-granularity");
    expect(group.getAttribute("role")).toBe("radiogroup");
    const dayRadio = group.querySelector('[data-granularity="day"]')!;
    const monthRadio = group.querySelector('[data-granularity="month"]')!;
    expect(dayRadio.getAttribute("role")).toBe("radio");
    expect(monthRadio.getAttribute("aria-checked")).toBe("true");
    expect(dayRadio.getAttribute("aria-checked")).toBe("false");
    (dayRadio as HTMLElement).click();
    expect(onGranularity).toHaveBeenCalledWith("day");
  });

  it("the undated footnote appears only when the scoped undated total is non-zero", () => {
    const withUndated = series([point({ key: "2026-01-01", costMicroUsd: 1 })], {
      undated: { requests: 2, costMicroUsd: 500 },
    });
    const { unmount } = render(
      <TrendSection
        series={withUndated}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.getByTestId("trend-undated")).toBeTruthy();
    unmount();

    const withoutUndated = series([point({ key: "2026-01-01", costMicroUsd: 1 })]);
    render(
      <TrendSection
        series={withoutUndated}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.queryByTestId("trend-undated")).toBeNull();
  });

  it("the unfilled note appears only when series.filled is false", () => {
    const unfilled = series([point({ key: "2026-01-01", costMicroUsd: 1 })], { filled: false });
    const { unmount } = render(
      <TrendSection
        series={unfilled}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.getByTestId("trend-unfilled")).toBeTruthy();
    unmount();

    const filled = series([point({ key: "2026-01-01", costMicroUsd: 1 })], { filled: true });
    render(
      <TrendSection
        series={filled}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.queryByTestId("trend-unfilled")).toBeNull();
  });

  it("currency, share and date cells match formatCurrency/formatPercent/formatDate output", () => {
    locale.value = "en";
    const s = series([
      point({ key: "2026-03-15", costMicroUsd: 1_413_580_000, requests: 3, share: 0.5 }),
    ]);
    render(
      <TrendSection
        series={s}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    const row = screen.getByTestId("trend-row");
    expect(within(row).getByTestId("trend-cell-cost").textContent).toBe(
      formatCurrency("en", 1413.58),
    );
    expect(within(row).getByTestId("trend-cell-share").textContent).toBe(formatPercent("en", 0.5));
    expect(within(row).getByTestId("trend-cell-period").textContent).toBe(
      formatDate("en", Date.UTC(2026, 2, 15), { dateStyle: "medium", timeZone: "UTC" }),
    );
  });

  it("delta direction is carried as sign text and data-delta, not by colour", () => {
    const s = series([
      point({ key: "2026-01-01", costMicroUsd: 100, deltaRatio: null }),
      point({ key: "2026-01-02", costMicroUsd: 150, deltaRatio: 0.5 }),
      point({ key: "2026-01-03", costMicroUsd: 75, deltaRatio: -0.5 }),
      point({ key: "2026-01-04", costMicroUsd: 75, deltaRatio: 0 }),
    ]);
    render(
      <TrendSection
        series={s}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("trend-row");
    const byKey = (key: string) => rows.find((r) => r.getAttribute("data-key") === key)!;

    expect(byKey("2026-01-01").getAttribute("data-delta")).toBe("none");
    expect(byKey("2026-01-02").getAttribute("data-delta")).toBe("up");
    expect(byKey("2026-01-03").getAttribute("data-delta")).toBe("down");
    expect(byKey("2026-01-04").getAttribute("data-delta")).toBe("flat");

    const upText = within(byKey("2026-01-02")).getByTestId("trend-cell-delta").textContent!;
    const downText = within(byKey("2026-01-03")).getByTestId("trend-cell-delta").textContent!;
    // Direction is in the TEXT (a sign), not merely in data-delta. Expected
    // strings are DERIVED from the formatter, never typed out: `Intl` picks
    // its own sign glyph and its own U+00A0 placement (LEARNINGS).
    expect(upText).toBe(formatPercent("en", 0.5, { signDisplay: "exceptZero" }));
    expect(downText).toBe(formatPercent("en", -0.5, { signDisplay: "exceptZero" }));
    expect(upText).not.toBe(downText);
    // And the sign really is present: a plain formatPercent would not emit one
    // for the positive value.
    expect(upText).not.toBe(formatPercent("en", 0.5));
  });

  // S16a §7.1: the trend is a PAGE now (`page === "trend"`) — a page cannot
  // be closed, so the collapsed state and its disclosure are gone entirely
  // (re-homing table: "the property ceases to exist with the control;
  // recorded here as a deliberate removal, not an oversight").

  // S16a §7.1: the scope-reset control moved to the context bar's
  // `ScopeSelect` (re-homed to scope-select.test.tsx's "calls onChange with
  // null when the all-scope option is chosen"). What TrendSection keeps is
  // the scope LABEL.
  it("renders the scope label for a group scope", () => {
    render(
      <TrendSection
        series={series([])}
        granularity="day"
        scope={{ kind: "group", label: "Nebula Launch" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.getByTestId("trend-scope-label").textContent).toContain("Nebula Launch");
  });

  it("renders no reset control for the global scope", () => {
    render(
      <TrendSection
        series={series([])}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.queryByTestId("trend-scope-reset")).toBeNull();
  });

  it("renders the empty state when there are no points", () => {
    render(
      <TrendSection
        series={series([])}
        granularity="day"
        scope={{ kind: "all" }}
        onGranularity={() => {}}
      />,
    );
    expect(screen.getByTestId("trend-empty")).toBeTruthy();
    expect(screen.queryByTestId("trend-table")).toBeNull();
  });

  it("renders identical data-testids in German and in English", () => {
    const s = series([point({ key: "2026-01-01", costMicroUsd: 1 })], {
      undated: { requests: 1, costMicroUsd: 1 },
      filled: false,
    });
    locale.value = "de";
    const { unmount } = render(
      <TrendSection
        series={s}
        granularity="day"
        scope={{ kind: "group", label: "X" }}
        onGranularity={() => {}}
      />,
    );
    const deIds = screen.getByTestId("trend-section").querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(
      <TrendSection
        series={s}
        granularity="day"
        scope={{ kind: "group", label: "X" }}
        onGranularity={() => {}}
      />,
    );
    const enIds = screen.getByTestId("trend-section").querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });
});
