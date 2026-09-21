import { render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as appState from "../state/app-state.js";
import { ALL_TIME, type DateRange } from "../model/date-range.js";
import { formatDate, formatDateTime } from "../i18n/format.js";
import { translate } from "../i18n/translate.js";
import type { Report } from "../model/report-types.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import { StatusBar } from "./status-bar.js";

function resetSignals(): void {
  appState.locale.value = "en";
  appState.discovery.value = null;
  appState.report.value = null;
  appState.lastScanAt.value = null;
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    sessions: [],
    projectGroups: [],
    folderGroups: [],
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

describe("StatusBar", () => {
  beforeEach(() => {
    resetSignals();
  });

  afterEach(() => {
    resetSignals();
  });

  it("shows root, account, profile and session counts", () => {
    appState.discovery.value = {
      roots: [{ candidate: { path: "/a", label: "a", origin: "auto" }, accounts: 1, profiles: 2 }],
      searched: [],
      profiles: [],
      sessions: [{}] as never,
      accountCount: 1,
      profileCount: 2,
      problems: [],
    };

    render(<StatusBar />);

    expect(screen.getByTestId("status-roots").textContent).toContain("1");
    expect(screen.getByTestId("status-accounts").textContent).toContain("1");
    expect(screen.getByTestId("status-profiles").textContent).toContain("2");
    expect(screen.getByTestId("status-sessions").textContent).toContain("1");
  });

  it("shows the last scan time once a scan has succeeded", () => {
    const scannedAt = new Date(2026, 8, 15, 14, 2).getTime();
    appState.lastScanAt.value = scannedAt;

    const { unmount } = render(<StatusBar />);

    const text = screen.getByTestId("status-last-scan").textContent ?? "";
    // The formatted instant itself has to be in there — not merely "some
    // non-empty string", which the never-scanned label would satisfy too.
    expect(text).toContain(formatDateTime("en", scannedAt));
    unmount();
  });

  it("shows the never-scanned label before the first scan", () => {
    appState.lastScanAt.value = null;

    const { unmount } = render(<StatusBar />);
    const beforeScan = screen.getByTestId("status-last-scan").textContent ?? "";
    expect(beforeScan).toBe(translate("en", "status.neverScanned"));
    unmount();

    const scannedAt = new Date(2026, 8, 15, 14, 2).getTime();
    appState.lastScanAt.value = scannedAt;
    render(<StatusBar />);
    // The two states must be distinguishable, or the branch is untested.
    expect(screen.getByTestId("status-last-scan").textContent).not.toBe(beforeScan);
  });

  it("shows a problem count only when problems exist", () => {
    render(<StatusBar />);
    expect(screen.queryByTestId("status-problems")).toBeNull();

    appState.report.value = makeReport({ problems: [{ kind: "unreadable-file", scope: "x" }] });

    render(<StatusBar />);
    expect(screen.getByTestId("status-problems")).toBeTruthy();
  });

  it("shows the active period and the in-range session count", () => {
    const range: DateRange = {
      fromMs: Date.UTC(2026, 2, 1),
      toMs: Date.UTC(2026, 3, 1),
    };
    appState.report.value = makeReport({
      sessions: [{}, {}] as never,
      range,
      excluded: { sessions: 3, requests: 10, costMicroUsd: 0, undatedRequests: 0 },
    });

    render(<StatusBar />);

    const expectedPeriod = translate("en", "range.span", {
      from: formatDate("en", range.fromMs!),
      to: formatDate("en", range.toMs! - 1),
    });
    expect(screen.getByTestId("status-range").textContent).toBe(
      translate("en", "status.range", { period: expectedPeriod }),
    );
    expect(screen.getByTestId("status-sessions").textContent).toBe(
      translate("en", "status.sessionsInRange", { included: "2", total: "5" }),
    );
  });

  it("shows the all-time label when no range is active", () => {
    appState.report.value = makeReport({ sessions: [{}] as never });

    render(<StatusBar />);

    expect(screen.getByTestId("status-range").textContent).toBe(translate("en", "status.rangeAll"));
  });
});
