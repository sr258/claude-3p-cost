/**
 * `runScan`'s NFR-2/NFR-3 wiring (S8 plan §6.7): `lastScanAt` on success,
 * the partial report reaching `report.value` before `scanState` flips to
 * "done", and a failure never throwing.
 *
 * `discovery.js`, `filesystem.js` and `scan.js` are mocked at the module
 * boundary `app-state.ts` imports them through, so `runScan`'s own logic is
 * exercised without a real filesystem or a real scan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_TIME, isAllTime } from "../model/date-range.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import type { Report } from "../model/report-types.js";
import type { Discovery } from "../services/discovery.js";
import type { ScanResult } from "../services/scan.js";

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
    range: ALL_TIME,
    excluded: Object.freeze({ sessions: 0, requests: 0, costMicroUsd: 0, undatedRequests: 0 }),
  });
}

/** `scanDiscovery` now returns a `ScanResult` (S13 plan §4.5, §4.9). */
function makeScanResult(sessionCount: number): ScanResult {
  return { report: makeReport(sessionCount), sessions: [], problems: [] };
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
import { DEFAULT_PRICES } from "../model/default-prices.js";
import {
  activeRange,
  clearGroupScope,
  clearRange,
  expandedGroups,
  expandedKeysFor,
  expandedSessionKeysFor,
  expandedSessions,
  grouping,
  lastScanAt,
  ownPricesConfigured,
  page,
  priceOverrides,
  priceTable,
  rangeInvalid,
  recomputation,
  rangePreset,
  report,
  resetAllPrices,
  runScan,
  scanState,
  selectedGroupKey,
  selectedGroups,
  sessionSortDirection,
  sessionSortField,
  setCustomDays,
  setGrouping,
  setGroupScope,
  setPage,
  setPrice,
  setRangePreset,
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
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));

    await runScan();

    expect(scanState.value).toBe("done");
    expect(lastScanAt.value).not.toBeNull();
  });

  it("publishes a partial report before scanState becomes done", async () => {
    const seenStates: string[] = [];
    vi.mocked(scanDiscovery).mockImplementation(async (_fs, _discovery, options) => {
      options?.onPartial?.(makeReport(1));
      seenStates.push(scanState.value);
      return makeScanResult(2);
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

describe("page / setPage (S16a §5.1)", () => {
  it("page defaults to overview", () => {
    expect(page.value).toBe("overview");
  });

  it("setPage changes the page", () => {
    setPage("models");
    expect(page.value).toBe("models");
    setPage("trend");
    expect(page.value).toBe("trend");
    setPage("prices");
    expect(page.value).toBe("prices");
    setPage("overview");
    expect(page.value).toBe("overview");
  });
});

describe("setGroupScope (S16a §5.1)", () => {
  beforeEach(() => {
    selectedGroups.value = { project: null, folder: null };
  });

  it("sets and clears the scope of one grouping without touching the other", () => {
    setGroupScope("project", "p1");
    setGroupScope("folder", "f1");
    expect(selectedGroupKey("project")).toBe("p1");
    expect(selectedGroupKey("folder")).toBe("f1");

    setGroupScope("project", null);
    expect(selectedGroupKey("project")).toBeNull();
    expect(selectedGroupKey("folder")).toBe("f1");
  });

  it("setting the same key again does not toggle it off (unlike toggleGroupScope)", () => {
    setGroupScope("project", "p1");
    setGroupScope("project", "p1");
    expect(selectedGroupKey("project")).toBe("p1");
  });
});

/**
 * The load-bearing test of S16a (plan §7.1): navigating through every page
 * and back must not reset expansion, session expansion, sort, scope,
 * grouping or the date range. Every value below is deliberately
 * NON-default — a test that navigates from a pristine state would agree
 * with a bug that resets everything to the default (LEARNINGS).
 */
describe("navigating does not reset report-scoped state", () => {
  beforeEach(() => {
    // Isolation from every other describe block in this file: these signals
    // are module-level and NOT reset by a global hook (each describe here
    // resets only what it touches).
    grouping.value = "project";
    expandedGroups.value = new Set();
    expandedSessions.value = new Set();
    selectedGroups.value = { project: null, folder: null };
    sessionSortField.value = "cost";
    sessionSortDirection.value = "desc";
    clearRange();
  });

  afterEach(() => {
    grouping.value = "project";
    expandedGroups.value = new Set();
    expandedSessions.value = new Set();
    selectedGroups.value = { project: null, folder: null };
    sessionSortField.value = "cost";
    sessionSortDirection.value = "desc";
    clearRange();
  });

  it("expansion, session expansion, sort, scope, grouping and range survive a round trip through every page", () => {
    setGrouping("folder");
    toggleGroup("folder", "f1");
    toggleSession("folder", "sess1");
    setSessionSort("duration");
    setGroupScope("folder", "f1");
    setRangePreset("thisMonth");

    const pages: readonly (typeof page.value)[] = ["models", "trend", "prices", "overview"];
    for (const next of pages) {
      setPage(next);
    }

    expect(page.value).toBe("overview");
    expect(grouping.value).toBe("folder");
    expect(expandedKeysFor("folder").has("f1")).toBe(true);
    expect(expandedSessionKeysFor("folder").has("sess1")).toBe(true);
    expect(sessionSortField.value).toBe("duration");
    expect(sessionSortDirection.value).toBe("desc");
    expect(selectedGroupKey("folder")).toBe("f1");
    expect(rangePreset.value).toBe("thisMonth");
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
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));

    await runScan();

    expect(expandedKeysFor("project").has("a")).toBe(true);
    expect(sessionSortField.value).toBe("title");
    expect(sessionSortDirection.value).toBe("asc");
  });

  it("grouping, expansion, sort, scope and the active page all survive a rescan", async () => {
    setGrouping("folder");
    toggleGroup("folder", "f1");
    toggleGroupScope("folder", "f1");
    setSessionSort("duration");
    // S16a review: CLAUDE.md rule 9 states "`runScan()` never touches it"
    // of `page`, and nothing pinned that. Non-default on purpose — asserting
    // "overview" after a rescan that started on "overview" agrees with a
    // bug that resets the page (LEARNINGS).
    setPage("trend");
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));

    await runScan();

    expect(grouping.value).toBe("folder");
    expect(expandedKeysFor("folder").has("f1")).toBe(true);
    expect(selectedGroupKey("folder")).toBe("f1");
    expect(sessionSortField.value).toBe("duration");
    expect(page.value).toBe("trend");
    setPage("overview");
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
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));

    await runScan();

    expect(expandedSessionKeysFor("project").has("sess1")).toBe(true);
  });
});

describe("date range filter (S13 plan §4.7)", () => {
  beforeEach(async () => {
    clearRange();
    vi.mocked(scanDiscovery).mockReset();
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));
    await runScan();
    vi.mocked(scanDiscovery).mockClear();
  });

  it("changing the preset rebuilds the report without calling scanDiscovery again", () => {
    expect(isAllTime(report.value!.range)).toBe(true);

    setRangePreset("thisMonth");

    expect(isAllTime(report.value!.range)).toBe(false);
    expect(scanDiscovery).not.toHaveBeenCalled();
  });

  it("an invalid custom pair leaves the previously active range applied", () => {
    setRangePreset("custom");

    setCustomDays("2026-03-01", "2026-01-01"); // "from" after "to"

    expect(rangeInvalid.value).toBe(true);
    // "all" (ALL_TIME) was the last valid range before the invalid pair.
    expect(isAllTime(activeRange.value)).toBe(true);
    expect(isAllTime(report.value!.range)).toBe(true);
  });

  it("runScan does not reset the active range", async () => {
    setRangePreset("thisMonth");
    const rangeBefore = activeRange.value;
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));

    await runScan();

    expect(rangePreset.value).toBe("thisMonth");
    expect(activeRange.value).toEqual(rangeBefore);
  });
});

describe("price signals (S15 plan §5.4)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllPrices();
  });

  it("setPrice persists through price-store and updates priceTable", () => {
    const [firstModel] = DEFAULT_PRICES.keys();
    setPrice(firstModel!, "input", 1_234_000);

    expect(priceTable.value.get(firstModel!)!.input).toBe(1_234_000);

    // Round-trips through localStorage, independent of the live signal.
    const stored = JSON.parse(localStorage.getItem("claude3pcost.prices")!) as Record<
      string,
      Record<string, number>
    >;
    expect(stored[firstModel!]!.input).toBe(1_234_000);
  });

  it("resetAllPrices restores every default", () => {
    const [firstModel] = DEFAULT_PRICES.keys();
    setPrice(firstModel!, "input", 1_234_000);

    resetAllPrices();

    expect(priceOverrides.value.size).toBe(0);
    expect(priceTable.value.get(firstModel!)).toEqual(DEFAULT_PRICES.get(firstModel!));
  });

  it("runScan leaves priceOverrides untouched", async () => {
    const [firstModel] = DEFAULT_PRICES.keys();
    setPrice(firstModel!, "input", 1_234_000);
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));

    await runScan();

    expect(priceOverrides.value.get(firstModel!)?.get("input")).toBe(1_234_000);
  });

  it("ownPricesConfigured is false with no overrides and true after one edit", () => {
    expect(ownPricesConfigured.value).toBe(false);
    const [firstModel] = DEFAULT_PRICES.keys();
    setPrice(firstModel!, "input", 1_234_000);
    expect(ownPricesConfigured.value).toBe(true);
    resetAllPrices();
    expect(ownPricesConfigured.value).toBe(false);
  });

  it("recomputation is null while no own price is configured", async () => {
    vi.mocked(scanDiscovery).mockResolvedValue(makeScanResult(0));
    await runScan();
    expect(report.value).not.toBeNull();
    expect(ownPricesConfigured.value).toBe(false);
    expect(recomputation.value).toBeNull();

    const [firstModel] = DEFAULT_PRICES.keys();
    setPrice(firstModel!, "input", 1_234_000);
    expect(recomputation.value).not.toBeNull();
  });
});
