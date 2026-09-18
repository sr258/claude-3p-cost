import { render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as appState from "../state/app-state.js";
import { formatDateTime } from "../i18n/format.js";
import { translate } from "../i18n/translate.js";
import { StatusBar } from "./status-bar.js";

function resetSignals(): void {
  appState.locale.value = "en";
  appState.discovery.value = null;
  appState.report.value = null;
  appState.lastScanAt.value = null;
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

    appState.report.value = {
      sessions: [],
      projectGroups: [],
      folderGroups: [],
      totals: {
        costMicroUsd: 0,
        requests: 0,
        errorRequests: 0,
        numTurns: 0,
        durationMs: 0,
        durationApiMs: 0,
        subagentsSpawned: 0,
        tokens: {
          inputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          cacheCreationInputTokens: 0,
          cacheCreation1hInputTokens: 0,
          cacheCreation5mInputTokens: 0,
          cacheReadInputTokens: 0,
          webSearchRequests: 0,
          webFetchRequests: 0,
        },
      },
      models: { models: [], costMicroUsd: 0 },
      byDay: [],
      byMonth: [],
      undated: { requests: 0, costMicroUsd: 0 },
      gaps: {
        openRequests: 0,
        sessionsWithoutManifest: 0,
        costMicroUsdWithoutManifest: 0,
        archivedSessions: 0,
      },
      problems: [{ kind: "unreadable-file", scope: "x" }],
    };

    render(<StatusBar />);
    expect(screen.getByTestId("status-problems")).toBeTruthy();
  });
});
