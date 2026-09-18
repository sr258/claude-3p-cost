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
import { lastScanAt, report, runScan, scanState } from "./app-state.js";

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
