import { render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import { locale } from "../state/app-state.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import type { CostTotals, GroupRow, SessionRow } from "../model/report-types.js";
import { OverviewTable, type OverviewTableProps } from "./overview-table.js";

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

function sessionRow(partial: Partial<SessionRow> & Pick<SessionRow, "sessionId">): SessionRow {
  return {
    sourceId: partial.sessionId,
    title: "",
    hasManifest: true,
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
    requests: [],
    ...partial,
  };
}

const NOOP_TOGGLE = () => {};
const NOOP_SORT = () => {};
const NOOP_SELECT = () => {};
const NOOP_TOGGLE_SESSION = () => {};
const EMPTY_EXPANDED = new Set<string>();

function defaultProps(overrides: Partial<OverviewTableProps> = {}): OverviewTableProps {
  return {
    groups: [],
    totals: EMPTY_TOTALS,
    expandedKeys: new Set(),
    sortField: "cost",
    sortDirection: "desc",
    onToggle: NOOP_TOGGLE,
    onSort: NOOP_SORT,
    grouping: "project",
    selectedKey: null,
    onSelect: NOOP_SELECT,
    expandedSessionKeys: EMPTY_EXPANDED,
    onToggleSession: NOOP_TOGGLE_SESSION,
    ...overrides,
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

    render(<OverviewTable {...defaultProps({ groups })} />);

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

    render(<OverviewTable {...defaultProps({ groups })} />);

    const row = screen.getAllByTestId("group-row")[0]!;
    // The project cell is a `<th scope="row">` (plan §6.4), so it is counted
    // by test id rather than by the "cell" role, which it no longer carries.
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

    render(<OverviewTable {...defaultProps({ groups, totals })} />);

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
    const { unmount } = render(<OverviewTable {...defaultProps({ groups })} />);
    expect(screen.getAllByTestId("cell-cost")[0]!.textContent).toBe("1.413,58 USD");
    unmount();

    locale.value = "en";
    render(<OverviewTable {...defaultProps({ groups })} />);
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

    render(<OverviewTable {...defaultProps({ groups })} />);

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
    const { unmount } = render(<OverviewTable {...defaultProps({ groups })} />);
    const deIds = screen.getAllByTestId("group-row")[0]!.querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(<OverviewTable {...defaultProps({ groups })} />);
    const enIds = screen.getAllByTestId("group-row")[0]!.querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });

  it("a collapsed group renders no session table", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessions: [sessionRow({ sessionId: "s1" })],
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, expandedKeys: new Set() })} />);

    expect(screen.queryByTestId("session-table")).toBeNull();
    expect(screen.queryByTestId("session-panel-row")).toBeNull();
  });

  it("an expanded group renders its session table directly after its group row", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessions: [sessionRow({ sessionId: "s1" })],
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, expandedKeys: new Set(["a"]) })} />);

    const table = screen.getByTestId("overview-table");
    const rows = [...table.querySelectorAll("tbody > tr")];
    expect(rows[0]!.getAttribute("data-testid")).toBe("group-row");
    expect(rows[1]!.getAttribute("data-testid")).toBe("session-panel-row");
    expect(within(rows[1] as HTMLElement).getByTestId("session-table")).toBeTruthy();
  });

  it("the disclosure button reflects the expansion state in aria-expanded", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    const { unmount } = render(
      <OverviewTable {...defaultProps({ groups, expandedKeys: new Set() })} />,
    );
    expect(screen.getByTestId("group-disclosure").getAttribute("aria-expanded")).toBe("false");
    unmount();

    render(<OverviewTable {...defaultProps({ groups, expandedKeys: new Set(["a"]) })} />);
    expect(screen.getByTestId("group-disclosure").getAttribute("aria-expanded")).toBe("true");
  });

  it("activating the disclosure calls onToggle with the group key", () => {
    const onToggle = vi.fn();
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, onToggle })} />);
    screen.getByTestId("group-disclosure").click();

    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("two expanded groups render two session tables", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessions: [sessionRow({ sessionId: "s1" })],
      }),
      groupRow({
        key: "b",
        label: { kind: "project", project: { kind: "named", spaceId: "b", name: "Beta" } },
        sessions: [sessionRow({ sessionId: "s2" })],
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, expandedKeys: new Set(["a", "b"]) })} />);

    expect(screen.getAllByTestId("session-table")).toHaveLength(2);
  });

  it("the first column header follows the grouping prop", () => {
    // Expected strings come from the catalogue, never quoted here: a quoted
    // English label is the translated-text trap (LEARNINGS), and it would
    // pass in one locale and fail in the other.
    const { unmount } = render(<OverviewTable {...defaultProps({ grouping: "project" })} />);
    const projectHeader = screen.getByTestId("overview-table").querySelector("thead th");
    expect(projectHeader?.textContent).toBe(t("overview.columnProject"));
    unmount();

    render(<OverviewTable {...defaultProps({ grouping: "folder" })} />);
    const folderHeader = screen.getByTestId("overview-table").querySelector("thead th");
    expect(folderHeader?.textContent).toBe(t("overview.columnFolder"));
    // The two keys must genuinely differ, or the assertion above is vacuous.
    expect(t("overview.columnFolder")).not.toBe(t("overview.columnProject"));
  });

  it("a folder group row renders a network-drive badge only on the network folder", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "f1",
        label: {
          kind: "folder",
          folder: {
            kind: "folders",
            key: "f1",
            folders: [
              { display: "local-src", path: "/home/me/local-src", kind: "local" },
              { display: "share", path: "//nas/share", kind: "network-drive" },
            ],
          },
        },
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, grouping: "folder" })} />);

    expect(screen.getAllByTestId("network-drive-badge")).toHaveLength(1);
  });

  it("a folder group row carries the full path as hover text and never as visible text", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "f1",
        label: {
          kind: "folder",
          folder: {
            kind: "folders",
            key: "f1",
            folders: [{ display: "src", path: "/home/me/projects/src", kind: "local" }],
          },
        },
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, grouping: "folder" })} />);

    const part = screen.getByTestId("folder-part");
    expect(part.textContent).toBe("src");
    expect(part.getAttribute("title")).toBe("/home/me/projects/src");
    expect(screen.queryByText("/home/me/projects/src")).toBeNull();
  });

  it("the scope control reflects selection in aria-pressed, not by row colour alone", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    const { unmount } = render(<OverviewTable {...defaultProps({ groups, selectedKey: null })} />);
    expect(screen.getByTestId("scope-select").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("group-row").getAttribute("data-selected")).toBe("false");
    unmount();

    render(<OverviewTable {...defaultProps({ groups, selectedKey: "a" })} />);
    expect(screen.getByTestId("scope-select").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("group-row").getAttribute("data-selected")).toBe("true");
  });

  it("activating the scope control calls onSelect with the group key", () => {
    const onSelect = vi.fn();
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, onSelect })} />);
    screen.getByTestId("scope-select").click();

    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("clicking the scope control does not toggle expansion", () => {
    // Spies on the toggle callback with a POSITIVE control (a row click that
    // DOES expand) — an assertion that some attribute is absent would be
    // vacuous in Preact (LEARNINGS).
    const onToggle = vi.fn();
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, onToggle })} />);
    screen.getByTestId("scope-select").click();
    expect(onToggle).not.toHaveBeenCalled();

    // Positive control: clicking the row itself (outside any button) DOES toggle.
    screen.getByTestId("group-row").click();
    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("the expanded panel wraps the session table in a scroll container", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessions: [sessionRow({ sessionId: "s1" })],
      }),
    ];

    render(<OverviewTable {...defaultProps({ groups, expandedKeys: new Set(["a"]) })} />);

    const scroll = screen.getByTestId("session-table-scroll");
    expect(within(scroll).getByTestId("session-table")).toBeTruthy();
  });

  it("the total row is still the totals prop, not a re-sum of visible rows", () => {
    const groups: GroupRow[] = [
      groupRow({
        key: "a",
        label: { kind: "project", project: { kind: "named", spaceId: "a", name: "Alpha" } },
        sessionCount: 1,
        sessions: [sessionRow({ sessionId: "s1" })],
        totals: totalsOf({ costMicroUsd: 1_000_000, requests: 1 }),
      }),
    ];
    const totals = totalsOf({ costMicroUsd: 999_000_000, requests: 999 });

    render(<OverviewTable {...defaultProps({ groups, totals, expandedKeys: new Set(["a"]) })} />);

    const totalRow = screen.getByTestId("total-row");
    expect(within(totalRow).getByTestId("cell-cost").textContent).toContain("999.00");
  });
});
