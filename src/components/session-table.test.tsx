import { render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import { locale } from "../state/app-state.js";
import { EMPTY_TOTALS } from "../model/totals.js";
import type { CostTotals, SessionRow } from "../model/report-types.js";
import { SessionTable } from "./session-table.js";

function totalsOf(partial: Partial<CostTotals>): CostTotals {
  return {
    ...EMPTY_TOTALS,
    ...partial,
    tokens: { ...EMPTY_TOTALS.tokens, ...partial.tokens },
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
    models: { models: [], costMicroUsd: 0 },
    requests: [],
    toolUses: [],
    ...partial,
  };
}

const NOOP_SORT = () => {};
const NOOP_TOGGLE_SESSION = () => {};
const EMPTY_EXPANDED = new Set<string>();

describe("SessionTable", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders the eight US-2.2 columns", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    for (const testId of [
      "cell-session-id",
      "cell-title",
      "cell-requests",
      "cell-cost",
      "cell-output-tokens",
      "cell-cache-read",
      "cell-duration",
      "cell-last-activity",
    ]) {
      expect(within(row).getByTestId(testId)).toBeTruthy();
    }
  });

  it("renders one row per session in the order given, and never re-sorts", () => {
    const sessions = [
      sessionRow({ sessionId: "s-b", totals: totalsOf({ costMicroUsd: 10 }) }),
      sessionRow({ sessionId: "s-a", totals: totalsOf({ costMicroUsd: 90 }) }),
    ];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const rows = screen.getAllByTestId("session-row");
    expect(rows.map((r) => r.getAttribute("data-session-id"))).toEqual(["s-b", "s-a"]);
  });

  it("marks an archived session with a text badge, not colour alone", () => {
    const sessions = [sessionRow({ sessionId: "s1", isArchived: true, title: "Retro" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    expect(row.getAttribute("data-archived")).toBe("true");
    expect(within(row).getByTestId("archived-badge")).toBeTruthy();
  });

  it("renders the untitled placeholder for a session with no title", () => {
    const sessions = [sessionRow({ sessionId: "s1", title: "" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    // Derived from the catalogue, never a quoted English string (LEARNINGS).
    expect(within(row).getByTestId("cell-title").textContent).toBe(t("session.untitled"));
  });

  it("renders the no-activity label for a session with no activity timestamp", () => {
    const sessions = [sessionRow({ sessionId: "s1", lastActivityAt: null, lastTimestamp: null })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    // Derived from the catalogue, never a quoted English string (LEARNINGS).
    expect(within(row).getByTestId("cell-last-activity").textContent).toBe(t("session.noActivity"));
  });

  it("sets aria-sort on the active column only", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="asc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    expect(screen.getByTestId("sort-cost").closest("th")?.getAttribute("aria-sort")).toBe(
      "ascending",
    );
    expect(screen.getByTestId("sort-title").closest("th")?.getAttribute("aria-sort")).toBe("none");
    expect(screen.getByTestId("sort-duration").closest("th")?.getAttribute("aria-sort")).toBe(
      "none",
    );
  });

  it("calls onSort with the field of the clicked header", () => {
    const onSort = vi.fn();
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={onSort}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    screen.getByTestId("sort-title").click();
    expect(onSort).toHaveBeenCalledWith("title");
  });

  it("renders no click handler and no link directly on a session row, only the disclosure button", () => {
    // S9 plan §3: session rows themselves are NOT clickable. S11 adds a
    // disclosure BUTTON inside the row (the session detail expansion), which
    // is deliberately the one interactive element there.
    // `hasAttribute("onclick")` would NOT catch a regression here — Preact
    // attaches JSX event props with addEventListener and never writes an
    // `onclick` content attribute, so that assertion is false whether or not
    // a handler exists. Spy on addEventListener instead and record which
    // elements got listeners.
    const listeners: { readonly target: EventTarget; readonly type: string }[] = [];
    const original = Element.prototype.addEventListener;
    const spy = vi.spyOn(Element.prototype, "addEventListener").mockImplementation(function (
      this: Element,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      listeners.push({ target: this, type });
      original.call(this, type, listener, options);
    } as typeof Element.prototype.addEventListener);

    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    spy.mockRestore();

    const row = screen.getAllByTestId("session-row")[0]!;
    expect(row.querySelector("a")).toBeNull();
    // Exactly one button — the disclosure — not a row full of clickable cells.
    expect(row.querySelectorAll("button")).toHaveLength(1);
    expect(row.querySelector("button")).toBe(within(row).getByTestId("session-disclosure"));
    // The <tr> itself never gets a listener; only the button inside it does.
    expect(listeners.filter((entry) => entry.target === row).map((entry) => entry.type)).toEqual(
      [],
    );
    expect(
      listeners
        .filter((entry) => entry.target === within(row).getByTestId("session-disclosure"))
        .map((e) => e.type),
    ).toEqual(["click"]);
    // The sort buttons in the header DO get listeners — proof the spy sees
    // what Preact attaches, so the empty list above is a real negative.
    expect(
      listeners
        .filter((entry) => entry.target === screen.getByTestId("sort-title"))
        .map((e) => e.type),
    ).toEqual(["click"]);
  });

  it("renders identical data-testids in German and in English", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];

    locale.value = "de";
    const { unmount } = render(
      <SessionTable
        groupKey="p1"
        groupLabel="Projekt Eins"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const deIds = screen.getAllByTestId("session-row")[0]!.querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const enIds = screen.getAllByTestId("session-row")[0]!.querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });

  it("each session row carries a disclosure button with aria-expanded", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    const disclosure = within(row).getByTestId("session-disclosure");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  });

  it("an expanded session renders a detail row spanning every column", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={new Set(["s1"])}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    expect(screen.getByTestId("session-row").getAttribute("data-session-id")).toBe("s1");
    const detailRow = screen.getByTestId("session-detail-row");
    const cell = detailRow.querySelector("td")!;
    // Scoped to the outer table's own header row -- nested tables inside the
    // detail box (category/model/request tables) have their own <thead>s and
    // would otherwise inflate this count.
    const totalColumns = screen
      .getByTestId("session-table")
      .querySelectorAll(":scope > thead > tr > th").length;
    expect(cell.getAttribute("colspan")).toBe(String(totalColumns));
    expect(within(detailRow).getByTestId("session-detail")).toBeTruthy();
  });

  it("a collapsed session renders no detail row", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    expect(screen.queryByTestId("session-detail-row")).toBeNull();
  });

  it("the disclosure button is labelled from the catalogue with the session id", () => {
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={NOOP_TOGGLE_SESSION}
      />,
    );
    const disclosure = within(screen.getByTestId("session-row")).getByTestId("session-disclosure");
    expect(disclosure.getAttribute("aria-label")).toBe(t("detail.expandSession", { id: "s1" }));
  });

  it("calls onToggleSession with the session id when the disclosure button is clicked", () => {
    const onToggleSession = vi.fn();
    const sessions = [sessionRow({ sessionId: "s1" })];
    render(
      <SessionTable
        groupKey="p1"
        groupLabel="Project One"
        sessions={sessions}
        sortField="cost"
        sortDirection="desc"
        onSort={NOOP_SORT}
        expandedSessionKeys={EMPTY_EXPANDED}
        onToggleSession={onToggleSession}
      />,
    );
    within(screen.getByTestId("session-row")).getByTestId("session-disclosure").click();
    expect(onToggleSession).toHaveBeenCalledWith("s1");
  });
});
