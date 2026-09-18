import { afterEach, describe, expect, it } from "vitest";
import { loadManualRoots, storeManualRoots } from "./root-store.js";

const STORAGE_KEY = "claude3pcost.roots";

describe("root-store", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("loads an empty list when the key is absent", () => {
    expect(loadManualRoots()).toEqual([]);
  });

  it("ignores a malformed or non-array stored value", () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(loadManualRoots()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(loadManualRoots()).toEqual([]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(["ok", 42, "also-ok"]));
    expect(loadManualRoots()).toEqual([]);
  });

  it("round-trips, de-duplicates and normalises stored roots", () => {
    storeManualRoots(["C:\\Users\\invented\\backup\\", "C:/Users/invented/backup", "/other/root"]);

    expect(loadManualRoots()).toEqual(["C:/Users/invented/backup", "/other/root"]);
  });

  it("survives a throwing localStorage", () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(): string {
          throw new Error("quota exceeded");
        },
        setItem(): void {
          throw new Error("quota exceeded");
        },
      },
    });

    try {
      expect(loadManualRoots()).toEqual([]);
      expect(() => storeManualRoots(["/x"])).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
