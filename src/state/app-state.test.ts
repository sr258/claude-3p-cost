/**
 * `runScan`'s NFR-2/NFR-3 wiring (S8 plan §6.7): `lastScanAt` on success,
 * the partial report reaching `report.value` before `scanState` flips to
 * "done", and a failure never throwing.
 *
 * `discovery.js`, `filesystem.js` and `scan.js` are mocked at the module
 * boundary `app-state.ts` imports them through, so `runScan`'s own logic is
 * exercised without a real filesystem or a real scan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import type { Report } from "../model/report-types.js";
import type { Discovery } from "../services/discovery.js";

const fakeDiscovery: Discovery = Object.freeze({
  roots: [],
  searched: [],
  profiles: [],
  sessions: [],
  accountCount: 0,
  profileCount: 0,
  problems: [],
});

function makeReport(sessionCount: number): Report {
  return Object.freeze({
    sessions: Object.freeze(Array.from({ length: sessionCount }, () => ({}) as never)),
    projectGroups: Object.freeze([]),
    folderGroups: Object.freeze([]),
    totals: EMPTY_TOTALS,
    models: EMPTY_MODEL_BREAKDOWN,
    byDay: Object.freeze([]),
    byMonth: Object.freeze([]),
    undated: Object.freeze({ requests: 0, costMicroUsd: 0 }),
    gaps: Object.freeze({
      openRequests: 0,
      sessionsWithoutManifest: 0,
      costMicroUsdWithoutManifest: 0,
      archivedSessions: 0,
    }),
    problems: Object.freeze([]),
  });
}

vi.mock("../services/filesystem.js", () => ({
  createFileSystem: vi.fn(async () => ({ kind: "fake" }) as never),
}));
vi.mock("../services/discovery.js", () => ({
  discover: vi.fn(async () => fakeDiscovery),
}));
vi.mock("../services/scan.js", () => ({
  scanDiscovery: vi.fn(),
}));

import { scanDiscovery } from "../services/scan.js";
import {
  clearGroupScope,
  expandedGroups,
  expandedKeysFor,
  expandedSessionKeysFor,
  expandedSessions,
  grouping,
  lastScanAt,
  modelPanelOpen,
  report,
  runScan,
  scanState,
  selectedGroupKey,
  selectedGroups,
  sessionSortDirection,
  sessionSortField,
  setGrouping,
  setModelPanelOpen,
  setSessionSort,
  toggleGroup,
  toggleGroupScope,
  toggleSession,
} from "./app-state.js";

describe("runScan", () => {
  beforeEach(() => {
    lastScanAt.value = null;
    report.value = null;
    scanState.value = "idle";
    vi.mocked(scanDiscovery).mockReset();
  });

  it("sets lastScanAt on success", async () => {
    vi.mocked(scanDiscovery).mockResolvedValue(makeReport(0));

    await runScan();

    expect(scanState.value).toBe("done");
    expect(lastScanAt.value).not.toBeNull();
  });

  it("publishes a partial report before scanState becomes done", async () => {
    const seenStates: string[] = [];
    vi.mocked(scanDiscovery).mockImplementation(async (_fs, _discovery, options) => {
      options?.onPartial?.(makeReport(1));
      seenStates.push(scanState.value);
      return makeReport(2);
    });

    await runScan();

    expect(seenStates).toEqual(["scanning"]);
    expect(report.value?.sessions).toHaveLength(2);
  });

  it("a failed scan sets scanState failed and leaves lastScanAt null", async () => {
    vi.mocked(scanDiscovery).mockRejectedValue(new Error("boom"));

    await runScan();

    expect(scanState.value).toBe("failed");
    expect(lastScanAt.value).toBeNull();
  });
});

describe("expandedGroups / toggleGroup", () => {
  beforeEach(() => {
    expandedGroups.value = new Set();
  });

  // Amended for S10 (plan §0.3 item 5, §9.1): toggleGroup gains a leading
  // `grouping` argument. Both cases below keep the exact property they were
  // written to guard — "toggling twice removes the key" and "toggling keeps
  // other expanded keys" — now scoped to one grouping ("project").
  it("toggleGroup adds a key and toggling again removes it", () => {
    toggleGroup("project", "a");
    expect(expandedKeysFor("project").has("a")).toBe(true);
    toggleGroup("project", "a");
    expect(expandedKeysFor("project").has("a")).toBe(false);
  });

  it("toggleGroup keeps other expanded keys", () => {
    toggleGroup("project", "a");
    toggleGroup("project", "b");
    expect([...expandedKeysFor("project")].sort()).toEqual(["a", "b"]);
    toggleGroup("project", "a");
    expect([...expandedKeysFor("project")]).toEqual(["b"]);
  });

  it("expansion is tracked per grouping: the same key open under projects is closed under folders", () => {
    toggleGroup("project", "shared-key");
    expect(expandedKeysFor("project").has("shared-key")).toBe(true);
    expect(expandedKeysFor("folder").has("shared-key")).toBe(false);
  });
});

describe("setGrouping", () => {
  it("switches the grouping signal", () => {
    grouping.value = "project";
    setGrouping("folder");
    expect(grouping.value).toBe("folder");
    setGrouping("project");
    expect(grouping.value).toBe("project");
  });
});

describe("selectedGroups / toggleGroupScope / clearGroupScope", () => {
  beforeEach(() => {
    selectedGroups.value = { project: null, folder: null };
  });

  it("toggleGroupScope selects a group and selecting it again returns to all", () => {
    toggleGroupScope("project", "p1");
    expect(selectedGroupKey("project")).toBe("p1");
    toggleGroupScope("project", "p1");
    expect(selectedGroupKey("project")).toBeNull();
  });

  it("scope is tracked per grouping: switching grouping restores that grouping's scope", () => {
    toggleGroupScope("project", "p1");
    toggleGroupScope("folder", "f1");
    expect(selectedGroupKey("project")).toBe("p1");
    expect(selectedGroupKey("folder")).toBe("f1");
  });

  it("clearGroupScope returns the panel to all", () => {
    toggleGroupScope("project", "p1");
    clearGroupScope("project");
    expect(selectedGroupKey("project")).toBeNull();
  });

  it("a scope key for a group that vanished is kept, not pruned", () => {
    toggleGroupScope("project", "vanished");
    // No rescan-triggered pruning: the signal itself is untouched by anything
    // but an explicit toggle/clear call.
    expect(selectedGroupKey("project")).toBe("vanished");
  });
});

describe("modelPanelOpen / setModelPanelOpen", () => {
  it("closes and reopens the panel", () => {
    modelPanelOpen.value = true;
    setModelPanelOpen(false);
    expect(modelPanelOpen.value).toBe(false);
    setModelPanelOpen(true);
    expect(modelPanelOpen.value).toBe(true);
  });
});

describe("sessionSortField / sessionSortDirection / setSessionSort", () => {
  beforeEach(() => {
    sessionSortField.value = "cost";
    sessionSortDirection.value = "desc";
  });

  it("setSessionSort flips the direction when the same field is chosen again", () => {
    setSessionSort("cost");
    expect(sessionSortField.value).toBe("cost");
    expect(sessionSortDirection.value).toBe("asc");
    setSessionSort("cost");
    expect(sessionSortDirection.value).toBe("desc");
  });

  it("setSessionSort switches field and applies that field's default direction", () => {
    setSessionSort("title");
    expect(sessionSortField.value).toBe("title");
    expect(sessionSortDirection.value).toBe("asc");

    setSessionSort("duration");
    expect(sessionSortField.value).toBe("duration");
    expect(sessionSortDirection.value).toBe("desc");
  });

  it("expansion and sort state survive a rescan", async () => {
    toggleGroup("project", "a");
    setSessionSort("title");
    vi.mocked(scanDiscovery).mockResolvedValue(makeReport(0));

    await runScan();

    expect(expandedKeysFor("project").has("a")).toBe(true);
    expect(sessionSortField.value).toBe("title");
    expect(sessionSortDirection.value).toBe("asc");
  });

  it("grouping, expansion, sort and scope all survive a rescan", async () => {
    setGrouping("folder");
    toggleGroup("folder", "f1");
    toggleGroupScope("folder", "f1");
    setSessionSort("duration");
    setModelPanelOpen(false);
    vi.mocked(scanDiscovery).mockResolvedValue(makeReport(0));

    await runScan();

    expect(grouping.value).toBe("folder");
    expect(expandedKeysFor("folder").has("f1")).toBe(true);
    expect(selectedGroupKey("folder")).toBe("f1");
    expect(sessionSortField.value).toBe("duration");
    expect(modelPanelOpen.value).toBe(false);
  });
});

describe("expandedSessions / toggleSession / expandedSessionKeysFor", () => {
  beforeEach(() => {
    expandedSessions.value = new Set();
  });

  it("toggleSession expands and collapses one session", () => {
    toggleSession("project", "sess1");
    expect(expandedSessionKeysFor("project").has("sess1")).toBe(true);
    toggleSession("project", "sess1");
    expect(expandedSessionKeysFor("project").has("sess1")).toBe(false);
  });

  it("session expansion is tracked separately per grouping", () => {
    toggleSession("project", "sess1");
    expect(expandedSessionKeysFor("project").has("sess1")).toBe(true);
    expect(expandedSessionKeysFor("folder").has("sess1")).toBe(false);
  });

  it("session expansion survives a rescan", async () => {
    toggleSession("project", "sess1");
    vi.mocked(scanDiscovery).mockResolvedValue(makeReport(0));

    await runScan();

    expect(expandedSessionKeysFor("project").has("sess1")).toBe(true);
  });
});
