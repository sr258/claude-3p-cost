import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeFileSystem } from "../../test/fixtures/fs/index.js";
import { pickRootFolders, removeRoot, type DialogBridge } from "./folder-picker.js";
import { loadManualRoots, storeManualRoots } from "./root-store.js";

function makeBridge(overrides: Partial<DialogBridge> = {}): DialogBridge {
  return {
    pickDirectories: vi.fn(async () => null),
    grantReadAccess: vi.fn(async () => 0),
    ...overrides,
  };
}

describe("pickRootFolders", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("a cancelled pick returns cancelled and stores nothing", async () => {
    const bridge = makeBridge({ pickDirectories: vi.fn(async () => null) });
    const fs = createFakeFileSystem({});

    const outcome = await pickRootFolders(fs, { bridge });

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(loadManualRoots()).toEqual([]);
  });

  it("an empty array pick returns cancelled and stores nothing", async () => {
    const bridge = makeBridge({ pickDirectories: vi.fn(async () => []) });
    const fs = createFakeFileSystem({});

    const outcome = await pickRootFolders(fs, { bridge });

    expect(outcome).toEqual({ kind: "cancelled" });
  });

  it("a picked folder containing audit.jsonl is added and persisted", async () => {
    const bridge = makeBridge({ pickDirectories: vi.fn(async () => ["/invented/backup"]) });
    const fs = createFakeFileSystem({
      auditLogs: { "/invented/backup/acct1/profile1/sess1/audit.jsonl": { lines: [] } },
    });

    const outcome = await pickRootFolders(fs, { bridge });

    expect(outcome).toEqual({ kind: "added", paths: ["/invented/backup"] });
    expect(loadManualRoots()).toEqual(["/invented/backup"]);
  });

  it("a picked folder without audit.jsonl returns no-session-data and is not persisted", async () => {
    const bridge = makeBridge({ pickDirectories: vi.fn(async () => ["/invented/empty"]) });
    const fs = createFakeFileSystem({ directories: ["/invented/empty"] });

    const outcome = await pickRootFolders(fs, { bridge });

    expect(outcome).toEqual({ kind: "no-session-data", paths: ["/invented/empty"] });
    expect(loadManualRoots()).toEqual([]);
  });

  it("picking requests recursive scope and grants read access exactly once", async () => {
    const grantReadAccess = vi.fn(async () => 1);
    const bridge = makeBridge({
      pickDirectories: vi.fn(async () => ["/invented/backup"]),
      grantReadAccess,
    });
    const fs = createFakeFileSystem({
      auditLogs: { "/invented/backup/acct1/profile1/sess1/audit.jsonl": { lines: [] } },
    });

    await pickRootFolders(fs, { bridge });

    expect(grantReadAccess).toHaveBeenCalledTimes(1);
    expect(grantReadAccess).toHaveBeenCalledWith(["/invented/backup"]);
  });

  it("a failing dialog call returns failed", async () => {
    const bridge = makeBridge({
      pickDirectories: vi.fn(async () => {
        throw new Error("dialog unavailable");
      }),
    });
    const fs = createFakeFileSystem({});

    const outcome = await pickRootFolders(fs, { bridge });

    expect(outcome).toEqual({ kind: "failed" });
  });

  it("a failing scope grant returns failed and stores nothing", async () => {
    const bridge = makeBridge({
      pickDirectories: vi.fn(async () => ["/invented/backup"]),
      grantReadAccess: vi.fn(async () => {
        throw new Error("scope grant failed");
      }),
    });
    const fs = createFakeFileSystem({
      auditLogs: { "/invented/backup/acct1/profile1/sess1/audit.jsonl": { lines: [] } },
    });

    const outcome = await pickRootFolders(fs, { bridge });

    expect(outcome).toEqual({ kind: "failed" });
    expect(loadManualRoots()).toEqual([]);
  });
});

describe("removeRoot", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("removes a stored root and returns the remainder", () => {
    storeManualRoots(["/invented/a", "/invented/b"]);

    const remaining = removeRoot("/invented/a");

    expect(remaining).toEqual(["/invented/b"]);
    expect(loadManualRoots()).toEqual(["/invented/b"]);
  });
});
