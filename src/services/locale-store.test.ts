import { afterEach, describe, expect, it } from "vitest";
import { loadStoredLocale, storeLocale } from "./locale-store.js";

describe("locale-store", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("stores and reads back a locale", () => {
    storeLocale("de");
    expect(loadStoredLocale()).toBe("de");
  });

  it("returns null when nothing is stored", () => {
    expect(loadStoredLocale()).toBeNull();
  });

  it("returns null for an unrecognised stored value", () => {
    localStorage.setItem("claude3pcost.locale", "fr");
    expect(loadStoredLocale()).toBeNull();
  });

  it("survives a throwing localStorage", () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
      },
    });

    expect(loadStoredLocale()).toBeNull();
    expect(() => storeLocale("en")).not.toThrow();

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original,
    });
  });
});
