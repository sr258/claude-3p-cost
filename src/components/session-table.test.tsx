import { render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import { locale } from "../state/app-state.js";
import { EMPTY_TOTALS } from "../model/totals.js";
import type { CostTotals, SessionRow } from "../model/report-types.js";
import { SessionTable } from "./session-table.js";
import { formatCurrency, formatPercent } from "../i18n/format.js";
import type { SessionRecomputation } from "../model/recompute.js";

/**
 * The element's text with every `visually-hidden` alternative stripped —
 * i.e. what a sighted reader sees. S16b added hidden alternatives inside
 * two cells whose assertions were exact equalities; relaxing those to
 * `toContain` would have dropped the property they existed for ("nothing
 * else is in this cell"). Asserting exact equality on the VISIBLE text
 * keeps that property while allowing the hidden alternative.
 */
function visibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of Array.from(clone.querySelectorAll(".visually-hidden"))) {
    hidden.remove();
  }
  return clone.textContent ?? "";
}

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
    excludedRequests: 0,
    isPartial: false,
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

  it("renders eight columns", () => {
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
        rangeActive={false}
      />,
    );
    // LEARNINGS: a bare `querySelectorAll("th")` on this table also matches
    // the nested detail tables' headers and inflates the count — scope to
    // the outer table's own header row.
    const headerCount = screen
      .getByTestId("session-table")
      .querySelectorAll(":scope > thead > tr > th").length;
    expect(headerCount).toBe(8);

    const row = screen.getAllByTestId("session-row")[0]!;
    for (const testId of [
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

  it("renders no session-id cell", () => {
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
        rangeActive={false}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    expect(within(row).queryByTestId("cell-session-id")).toBeNull();
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
        rangeActive={false}
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
        rangeActive={false}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    expect(row.getAttribute("data-archived")).toBe("true");
    expect(within(row).getByTestId("archived-badge")).toBeTruthy();
  });

  it("uses the session id as the title of an untitled session", () => {
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
        rangeActive={false}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    // S16a: the session-ID column is gone (US-2.2 amended) — the id
    // survives as the title of an untitled session instead.
    expect(within(row).getByTestId("cell-title").textContent).toBe("s1");
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
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
        rangeActive={false}
      />,
    );
    within(screen.getByTestId("session-row")).getByTestId("session-disclosure").click();
    expect(onToggleSession).toHaveBeenCalledWith("s1");
  });

  it("a partial session row renders the badge and sets data-partial to true", () => {
    const sessions = [
      sessionRow({
        sessionId: "s1",
        isPartial: true,
        excludedRequests: 12,
        totals: totalsOf({ requests: 8 }),
      }),
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
        rangeActive={true}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    expect(row.getAttribute("data-partial")).toBe("true");
    const badge = within(row).getByTestId("partial-badge");
    // Exact equality on the VISIBLE text, as before S16b: the badge shows the
    // short label and nothing else. Only the hidden alternative is new.
    expect(visibleText(badge)).toBe(t("session.partial"));
    expect(badge.getAttribute("title")).toBe(
      t("session.partialTitle", { included: "8", total: "20" }),
    );
    // S16b D4: the counts are also reachable from the keyboard/screen reader,
    // not title-only.
    const hiddenAlt = badge.querySelector(".visually-hidden");
    expect(hiddenAlt?.textContent).toBe(t("session.partialTitle", { included: "8", total: "20" }));
  });

  it("a fully included row sets data-partial to false and renders no badge", () => {
    const sessions = [sessionRow({ sessionId: "s1", isPartial: false })];
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
        rangeActive={false}
      />,
    );
    const row = screen.getAllByTestId("session-row")[0]!;
    expect(row.getAttribute("data-partial")).toBe("false");
    expect(within(row).queryByTestId("partial-badge")).toBeNull();
  });
});

/** S16 test 30: the own-price secondary line inside the existing cost cell (plan §2.2). */
function sessionRecomputation(overrides: Partial<SessionRecomputation> = {}): SessionRecomputation {
  return {
    models: [],
    costMicroUsd: 900_000,
    listCostMicroUsd: 1_000_000,
    scopeListCostMicroUsd: 1_000_000,
    deviationMicroUsd: -100_000,
    deviationRatio: -0.1,
    excluded: { sessions: 0, models: [], listCostMicroUsd: 0 },
    bracket: null,
    bracketUnavailableModels: [],
    webSearchRequests: 0,
    isEmpty: false,
    sessionExcluded: false,
    ...overrides,
  };
}

describe("SessionTable - own price secondary line (S16)", () => {
  afterEach(() => {
    locale.value = "en";
  });

  const sessions = [
    sessionRow({ sessionId: "s1", totals: totalsOf({ costMicroUsd: 1_000_000 }) }),
    sessionRow({ sessionId: "s2", totals: totalsOf({ costMicroUsd: 2_000_000 }) }),
  ];

  function renderWith(map: ReadonlyMap<string, SessionRecomputation> | null) {
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
        rangeActive={false}
        sessionRecomputations={map}
      />,
    );
  }

  it("renders no secondary line at all when no own price is configured", () => {
    renderWith(null);
    expect(screen.queryByTestId("cell-cost-own")).toBeNull();
  });

  it("renders the own figure and a signed deviation per session", () => {
    renderWith(new Map([["s1", sessionRecomputation()]]));
    const rows = screen.getAllByTestId("session-row");
    const own = within(rows[0]!).getByTestId("cell-cost-own");
    expect(own.getAttribute("data-computed")).toBe("true");
    // Derived from the formatters, never typed out: Intl emits U+00A0 and
    // `no-irregular-whitespace` would not catch a typed one (LEARNINGS).
    expect(own.textContent).toContain(formatCurrency("en", 0.9));
    expect(own.textContent).toContain(formatPercent("en", -0.1, { signDisplay: "exceptZero" }));
    // The list figure is still in the same cell, unchanged.
    expect(within(rows[0]!).getByTestId("cell-cost").textContent).toContain(
      formatCurrency("en", 1),
    );
    // A session with no entry in the map gets no secondary line.
    expect(within(rows[1]!).queryByTestId("cell-cost-own")).toBeNull();
  });

  it("marks an excluded session instead of showing a zero-formatted figure", () => {
    renderWith(
      new Map([
        [
          "s1",
          sessionRecomputation({
            sessionExcluded: true,
            costMicroUsd: 0,
            listCostMicroUsd: 0,
            deviationRatio: null,
            excluded: { sessions: 1, models: ["model-x"], listCostMicroUsd: 1_000_000 },
          }),
        ],
      ]),
    );
    const own = within(screen.getAllByTestId("session-row")[0]!).getByTestId("cell-cost-own");
    // Exact equality on the VISIBLE text, as before S16b: the cell says
    // "not computable" and carries NO figure of any kind — the assertion
    // below is the belt, this one the braces.
    expect(visibleText(own)).toBe(t("session.costOwnNotComputable"));
    expect(own.textContent).not.toContain(formatCurrency("en", 0));
  });
});
