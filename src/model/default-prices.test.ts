import { describe, expect, it } from "vitest";
import { DEFAULT_PRICES, DEFAULT_PRICES_AS_OF } from "./default-prices.js";
import { PRICE_FIELDS } from "./prices.js";

/**
 * The eight distinct `modelUsage` keys observed in the reference tree
 * (S15 plan §1.1) — hardcoded so this test runs in CI without that
 * gitignored data (LEARNINGS: "a regression pin computed from real data
 * cannot prove a guard-rail that happens to be a no-op on that data" — the
 * companion check in `reference-distribution.test.ts` is the one that is
 * inert on real data; this one is the one that actually runs everywhere).
 */
const OBSERVED_MODELS = [
  "claude-fable-5[1m]",
  "claude-haiku-4-5",
  "claude-opus-4-7",
  "claude-opus-5",
  "claude-opus-5[1m]",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-sonnet-5[1m]",
];

describe("DEFAULT_PRICES", () => {
  it("has 16 rows: 8 base models and 8 corresponding [1m] variants", () => {
    expect(DEFAULT_PRICES.size).toBe(16);
  });

  it("every default has all five fields non-null", () => {
    for (const price of DEFAULT_PRICES.values()) {
      for (const field of PRICE_FIELDS) {
        expect(price[field]).not.toBeNull();
      }
    }
  });

  it("cache columns are exactly 1.25x, 2.0x and 0.1x the input price", () => {
    for (const price of DEFAULT_PRICES.values()) {
      expect(price.cacheWrite5m).toBe(price.input! * 1.25);
      expect(price.cacheWrite1h).toBe(price.input! * 2);
      expect(price.cacheRead).toBe(price.input! * 0.1);
    }
  });

  it("claude-opus-5 and claude-opus-5[1m] are separate entries with equal rates", () => {
    const base = DEFAULT_PRICES.get("claude-opus-5");
    const longContext = DEFAULT_PRICES.get("claude-opus-5[1m]");
    expect(base).toBeDefined();
    expect(longContext).toBeDefined();
    // Separate KEYS in the map (independently overridable via
    // src/model/price-table.ts, keyed by model string, per Q1), at the
    // SAME rates (§1.3) — not a claim about object identity.
    expect(DEFAULT_PRICES.has("claude-opus-5")).toBe(true);
    expect(DEFAULT_PRICES.has("claude-opus-5[1m]")).toBe(true);
    expect(longContext).toEqual(base);
  });

  it("every model observed in the reference tree has a shipped default", () => {
    for (const model of OBSERVED_MODELS) {
      expect(DEFAULT_PRICES.has(model)).toBe(true);
    }
  });
});

describe("DEFAULT_PRICES_AS_OF", () => {
  it("is an ISO day string", () => {
    expect(DEFAULT_PRICES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
