import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPriceOverrides, storePriceOverrides } from "./price-store.js";

const STORAGE_KEY = "claude3pcost.prices";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("loadPriceOverrides", () => {
  it("returns an empty set for an absent key", () => {
    expect(loadPriceOverrides().size).toBe(0);
  });

  it("returns an empty set for malformed JSON, a non-object, and a throwing localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadPriceOverrides().size).toBe(0);

    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(loadPriceOverrides().size).toBe(0);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(42));
    expect(loadPriceOverrides().size).toBe(0);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(loadPriceOverrides().size).toBe(0);
  });

  it("preserves a null value as unknown", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "model-a": { input: null, output: 25_000_000 } }),
    );
    const overrides = loadPriceOverrides();
    expect(overrides.get("model-a")?.get("input")).toBeNull();
    expect(overrides.get("model-a")?.has("input")).toBe(true);
    expect(overrides.get("model-a")?.get("output")).toBe(25_000_000);
  });
});

describe("storePriceOverrides", () => {
  it("round-trips through loadPriceOverrides", () => {
    const overrides = new Map([
      [
        "model-a",
        new Map([
          ["input" as const, 9_000_000],
          ["output" as const, null],
        ]),
      ],
    ]);
    storePriceOverrides(overrides);
    const reloaded = loadPriceOverrides();
    expect(reloaded.get("model-a")?.get("input")).toBe(9_000_000);
    expect(reloaded.get("model-a")?.get("output")).toBeNull();
  });

  it("swallows a quota error", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => storePriceOverrides(new Map())).not.toThrow();
  });
});
