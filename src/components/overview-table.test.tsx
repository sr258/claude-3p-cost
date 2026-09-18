import { render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { locale } from "../state/app-state.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import type { CostTotals, GroupRow } from "../model/report-types.js";
import { OverviewTable } from "./overview-table.js";

function totalsOf(partial: Partial<CostTotals>): CostTotals {
  return { ...EMPTY_TOTALS, ...partial };
}

function groupRow(partial: Partial<GroupRow> & Pick<GroupRow, "key" | "label">): GroupRow {
  return {
    sessions: [],
    sessionCount: 0,
    totals: EMPTY_TOTALS,
    models: EMPTY_MODEL_BREAKDOWN,
    ...partial,
  };
}

describe("OverviewTable", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders one row per group in the order given", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessionCount: 3,
        totals: totalsOf({ costMicroUsd: 2_000_000, requests: 10 }),
      }),
      groupRow({
        key: "b",
        label: { kind: "project", project: { kind: "named", spaceId: "b", name: "Beta" } },
        sessionCount: 2,
        totals: totalsOf({ costMicroUsd: 1_000_000, requests: 5 }),
      }),
    ];

    render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);

    const rows = screen.getAllByTestId("group-row");
    expect(rows.map((row) => row.getAttribute("data-group-key"))).toEqual(["a", "b"]);
  });

  it("renders exactly the five US-2.1 columns", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);

    const row = screen.getAllByTestId("group-row")[0]!;
    const cells = within(row).getAllByRole("cell");
    expect(cells).toHaveLength(5);
    expect(within(row).getByTestId("cell-project")).toBeTruthy();
    expect(within(row).getByTestId("cell-sessions")).toBeTruthy();
    expect(within(row).getByTestId("cell-requests")).toBeTruthy();
    expect(within(row).getByTestId("cell-cost")).toBeTruthy();
    expect(within(row).getByTestId("cell-duration")).toBeTruthy();
  });

  it("renders a total row from the totals prop, not a re-sum of the rows", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessionCount: 1,
        totals: totalsOf({ costMicroUsd: 1_000_000, requests: 1 }),
      }),
    ];
    // Deliberately different from the sum of the visible rows.
    const totals = totalsOf({ costMicroUsd: 999_000_000, requests: 999 });

    render(<OverviewTable groups={groups} totals={totals} />);

    const totalRow = screen.getByTestId("total-row");
    expect(within(totalRow).getByTestId("cell-cost").textContent).toContain("999.00");
    expect(within(totalRow).getByTestId("cell-requests").textContent).toBe("999");
  });

  it("formats cost for the active locale in German and in English", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        totals: totalsOf({ costMicroUsd: 1_413_580_000 }),
      }),
    ];

    locale.value = "de";
    const { unmount } = render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);
    expect(screen.getAllByTestId("cell-cost")[0]!.textContent).toBe("1.413,58 USD");
    unmount();

    locale.value = "en";
    render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);
    expect(screen.getAllByTestId("cell-cost")[0]!.textContent).toBe("1,413.58 USD");
  });

  it("renders a group with zero sessions without crashing", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "empty",
        label: { kind: "project", project: { kind: "none" } },
        sessionCount: 0,
        totals: EMPTY_TOTALS,
      }),
    ];

    render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);

    expect(screen.getAllByTestId("group-row")).toHaveLength(1);
  });

  it("renders in both locales with identical data-testids", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    locale.value = "de";
    const { unmount } = render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);
    const deIds = screen.getAllByTestId("group-row")[0]!.querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(<OverviewTable groups={groups} totals={EMPTY_TOTALS} />);
    const enIds = screen.getAllByTestId("group-row")[0]!.querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });
});
