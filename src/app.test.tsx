/**
 * S16a §7.1: `app.tsx` had no unit test before this session. Covers the
 * page dispatch (only the active page's content renders) and the NFR-11
 * focus-on-navigation rule (plan §6.1), including its load-bearing guard:
 * focus must NOT move on first mount.
 *
 * `services/filesystem.js`, `services/discovery.js` and `services/scan.js`
 * are mocked at the module boundary, exactly as in `state/app-state.test.ts`
 * — `App`'s mount effect calls `runScan()`, which must not touch a real
 * filesystem here.
 */
import { render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./services/filesystem.js", () => ({
  createFileSystem: vi.fn(async () => ({ kind: "fake" }) as never),
}));
vi.mock("./services/discovery.js", () => ({
  discover: vi.fn(async () => ({
    roots: [],
    searched: [],
    profiles: [],
    sessions: [],
    accountCount: 0,
    profileCount: 0,
    problems: [],
  })),
}));
// Deliberately never resolves: `App`'s mount effect fires `runScan()`
// fire-and-forget, and a resolving mock would eventually overwrite the
// fixture `report`/`scanState` this file sets directly — asynchronously,
// landing at an unpredictable point in a LATER test (signals are module-
// level, shared across tests). Since nothing here awaits `runScan()`,
// there is no need for it to ever settle.
vi.mock("./services/scan.js", () => ({
  scanDiscovery: vi.fn(() => new Promise(() => {})),
}));

import { App } from "./app.js";
import { tPlural } from "./i18n/index.js";
import { ALL_TIME } from "./model/date-range.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "./model/totals.js";
import type { GroupRow, Report, SessionRow } from "./model/report-types.js";
import * as appState from "./state/app-state.js";

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    sessionId: "sess1",
    sourceId: "sess1",
    title: "A session",
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
    toolUses: [],
    excludedRequests: 0,
    isPartial: false,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<GroupRow> = {}): GroupRow {
  const sessions = overrides.sessions ?? [makeSession()];
  return {
    key: "p1",
    label: { kind: "project", project: { kind: "none" } },
    sessions,
    sessionCount: sessions.length,
    totals: EMPTY_TOTALS,
    models: EMPTY_MODEL_BREAKDOWN,
    partialSessions: 0,
    ...overrides,
  };
}

function makeReport(overrides: Partial<Report> = {}): Report {
  const group = makeGroup();
  return {
    sessions: group.sessions,
    projectGroups: [group],
    folderGroups: [group],
    totals: EMPTY_TOTALS,
    models: EMPTY_MODEL_BREAKDOWN,
    byDay: [],
    byMonth: [],
    undated: { requests: 0, costMicroUsd: 0 },
    gaps: {
      openRequests: 0,
      sessionsWithoutManifest: 0,
      costMicroUsdWithoutManifest: 0,
      archivedSessions: 0,
    },
    problems: [],
    range: ALL_TIME,
    excluded: { sessions: 0, requests: 0, costMicroUsd: 0, undatedRequests: 0 },
    ...overrides,
  };
}

function resetSignals(): void {
  appState.locale.value = "en";
  appState.report.value = makeReport();
  appState.scanState.value = "done";
  appState.page.value = "overview";
  appState.grouping.value = "project";
  appState.selectedGroups.value = { project: null, folder: null };
  appState.expandedGroups.value = new Set();
  appState.expandedSessions.value = new Set();
}

describe("App", () => {
  beforeEach(() => {
    resetSignals();
  });

  afterEach(() => {
    resetSignals();
  });

  it("renders only the active page's content", () => {
    appState.page.value = "models";
    render(<App />);
    expect(screen.getByTestId("app-nav")).toBeTruthy();
    expect(screen.getByTestId("model-panel")).toBeTruthy();
    expect(screen.queryByTestId("overview-table")).toBeNull();
    expect(screen.queryByTestId("trend-table")).toBeNull();
    expect(screen.queryByTestId("price-table-editor")).toBeNull();
  });

  it("does not move focus on first mount", () => {
    render(<App />);
    const heading = screen.getByTestId("page-heading");
    expect(document.activeElement).not.toBe(heading);
  });

  it("moves focus to the page heading after a navigation", async () => {
    // `useEffect` (unlike `useLayoutEffect`) runs on a deferred schedule
    // (`requestAnimationFrame`/`setTimeout` in Preact's hooks), so the DOM
    // re-render from the click is synchronous but the focus side effect is
    // not — `waitFor` polls until it lands, rather than asserting on the
    // same tick.
    render(<App />);
    expect(document.activeElement).not.toBe(screen.getByTestId("page-heading"));

    screen.getByTestId("nav-models").click();

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("page-heading"));
    });
  });

  it("renders the headline total on each report page and not on the prices page", () => {
    for (const p of ["overview", "models", "trend"] as const) {
      appState.page.value = p;
      const { unmount } = render(<App />);
      expect(screen.getByTestId("headline-total")).toBeTruthy();
      unmount();
    }

    appState.page.value = "prices";
    render(<App />);
    expect(screen.queryByTestId("headline-total")).toBeNull();
  });

  it("passes the report-wide session count when no scope is selected and the group's own count when one is", () => {
    const groupA = makeGroup({
      key: "a",
      sessionCount: 2,
      sessions: [makeSession({ sessionId: "s1" }), makeSession({ sessionId: "s2" })],
    });
    const groupB = makeGroup({
      key: "b",
      sessionCount: 3,
      sessions: [
        makeSession({ sessionId: "s3" }),
        makeSession({ sessionId: "s4" }),
        makeSession({ sessionId: "s5" }),
      ],
    });
    appState.report.value = makeReport({
      sessions: [...groupA.sessions, ...groupB.sessions],
      projectGroups: [groupA, groupB],
      folderGroups: [groupA, groupB],
    });

    const { unmount } = render(<App />);
    expect(screen.getByTestId("headline-sessions").textContent).toBe(
      tPlural("scan.sessionCount", 5),
    );
    unmount();

    appState.selectedGroups.value = { project: "a", folder: null };
    render(<App />);
    expect(screen.getByTestId("headline-sessions").textContent).toBe(
      tPlural("scan.sessionCount", 2),
    );
  });
});
