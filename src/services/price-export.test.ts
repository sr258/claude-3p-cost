import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const saveDialogMock = vi.fn();
const openDialogMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => saveDialogMock(...args),
  open: (...args: unknown[]) => openDialogMock(...args),
}));

import { loadJson, saveJson } from "./price-export.js";

function installTauriGlobal(): void {
  (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function removeTauriGlobal(): void {
  delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
}

beforeEach(() => {
  invokeMock.mockReset();
  saveDialogMock.mockReset();
  openDialogMock.mockReset();
  removeTauriGlobal();
  // jsdom does not implement URL.createObjectURL — stub it so the browser
  // transport's happy path is deterministic rather than always "failed".
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(
    () => "blob:fake",
  );
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
});

afterEach(() => {
  removeTauriGlobal();
});

describe("saveJson", () => {
  it("takes the Tauri branch when __TAURI_INTERNALS__ is present", async () => {
    installTauriGlobal();
    saveDialogMock.mockResolvedValue("/somewhere/out.json");
    invokeMock.mockResolvedValue(undefined);

    const outcome = await saveJson("out.json", "{}");

    expect(outcome).toEqual({ kind: "saved" });
    expect(saveDialogMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("write_export_file", {
      path: "/somewhere/out.json",
      contents: "{}",
    });
  });

  it("takes the browser branch otherwise", async () => {
    const outcome = await saveJson("out.json", "{}");

    // Never reaches the Tauri path at all.
    expect(saveDialogMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "saved" });
  });

  it("reports cancelled when the dialog returns null", async () => {
    installTauriGlobal();
    saveDialogMock.mockResolvedValue(null);

    const outcome = await saveJson("out.json", "{}");

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reports failed when the command rejects, and never throws", async () => {
    installTauriGlobal();
    saveDialogMock.mockResolvedValue("/somewhere/out.json");
    invokeMock.mockRejectedValue(new Error("protected-root"));

    await expect(saveJson("out.json", "{}")).resolves.toEqual({ kind: "failed" });
  });
});

describe("loadJson", () => {
  it("reports cancelled when the dialog returns null", async () => {
    installTauriGlobal();
    openDialogMock.mockResolvedValue(null);

    await expect(loadJson()).resolves.toEqual({ kind: "cancelled" });
  });

  it("reports loaded with the file contents", async () => {
    installTauriGlobal();
    openDialogMock.mockResolvedValue("/somewhere/in.json");
    invokeMock.mockResolvedValue('{"a":1}');

    await expect(loadJson()).resolves.toEqual({ kind: "loaded", text: '{"a":1}' });
  });

  it("reports failed when the command rejects", async () => {
    installTauriGlobal();
    openDialogMock.mockResolvedValue("/somewhere/in.json");
    invokeMock.mockRejectedValue(new Error("io"));

    await expect(loadJson()).resolves.toEqual({ kind: "failed" });
  });
});
