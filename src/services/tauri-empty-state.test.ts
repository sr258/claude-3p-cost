/**
 * The automatable half of S7's empty-path exit criterion (plan §9.1, §9.3).
 * `npx tauri dev` proves the rest manually; this file proves the selection
 * guard and the empty walk in isolation, without a real WebView.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RootCandidate } from "../model/discovery-paths.js";
import { createFakeFileSystem } from "../../test/fixtures/fs/index.js";
import { discover } from "./discovery.js";
import { scanDiscovery } from "./scan.js";

describe("createFileSystem selection (S6 guard, still load-bearing in S7)", () => {
  const originalTauriInternals = (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;

  afterEach(() => {
    if (originalTauriInternals === undefined) {
      delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    } else {
      (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = originalTauriInternals;
    }
    vi.resetModules();
  });

  it("returns the tauri implementation when __TAURI_INTERNALS__ is present", async () => {
    (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    vi.resetModules();
    const { createFileSystem } = await import("./filesystem.js");

    const fs = await createFileSystem();

    expect(fs.kind).toBe("tauri");
  });

  it("returns the dev implementation under DEV without Tauri internals", async () => {
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.resetModules();
    const { createFileSystem } = await import("./filesystem.js");

    const fs = await createFileSystem();

    expect(fs.kind).toBe("dev");
  });
});

describe("the empty-state walk", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("discovery with no existing root yields zero roots and five searched candidates", async () => {
    // An invented macOS host with every base set: the four Windows-shaped
    // candidates plus the macOS branch, none of them present on disk.
    const candidates: RootCandidate[] = [
      { path: "invented/local/Claude-3p/local-agent-mode-sessions", label: "a", origin: "auto" },
      { path: "invented/local/Claude-3p/claude-code-sessions", label: "b", origin: "auto" },
      { path: "invented/app/Claude/local-agent-mode-sessions", label: "c", origin: "auto" },
      { path: "invented/app/Claude/claude-code-sessions", label: "d", origin: "auto" },
      {
        path: "invented/home/Library/Application Support/Claude/local-agent-mode-sessions",
        label: "e",
        origin: "auto",
      },
    ];
    const fs = createFakeFileSystem({ candidates });

    const discovery = await discover(fs);

    expect(discovery.roots).toHaveLength(0);
    expect(discovery.searched).toHaveLength(5);
    expect(discovery.sessions).toHaveLength(0);
    expect(discovery.accountCount).toBe(0);
    expect(discovery.profileCount).toBe(0);
  });

  it("scanDiscovery over an empty discovery yields a zero report and no problems", async () => {
    const fs = createFakeFileSystem({ candidates: [] });
    const discovery = await discover(fs);

    const report = await scanDiscovery(fs, discovery);

    expect(report.sessions).toHaveLength(0);
    expect(report.projectGroups).toHaveLength(0);
    expect(report.folderGroups).toHaveLength(0);
    expect(report.totals.costMicroUsd).toBe(0);
    expect(report.totals.requests).toBe(0);
    expect(report.problems).toHaveLength(0);
  });
});
