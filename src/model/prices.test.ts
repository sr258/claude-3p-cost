import { describe, expect, it } from "vitest";
import { DEFAULT_PRICES } from "./default-prices.js";
import { PRICE_FIELDS, formatPriceInput, parsePriceInput } from "./prices.js";

describe("parsePriceInput", () => {
  it("accepts a dot decimal and yields integer micro-USD per Mtok", () => {
    expect(parsePriceInput("6.25")).toEqual({ kind: "ok", value: 6_250_000 });
  });

  it("accepts a comma decimal (German input)", () => {
    expect(parsePriceInput("6,25")).toEqual({ kind: "ok", value: 6_250_000 });
  });

  it("maps an empty and a whitespace-only string to null, never to zero", () => {
    expect(parsePriceInput("")).toEqual({ kind: "ok", value: null });
    expect(parsePriceInput("   ")).toEqual({ kind: "ok", value: null });
  });

  it("rejects a negative value, a non-numeric string, and a group separator", () => {
    expect(parsePriceInput("-5")).toEqual({ kind: "invalid" });
    expect(parsePriceInput("abc")).toEqual({ kind: "invalid" });
    expect(parsePriceInput("1,000.50")).toEqual({ kind: "invalid" });
    expect(parsePriceInput("1 000")).toEqual({ kind: "invalid" });
  });

  it("rounds to micro-USD per Mtok resolution", () => {
    expect(parsePriceInput("1.1234567")).toEqual({ kind: "ok", value: 1_123_457 });
  });
});

describe("formatPriceInput", () => {
  it("round-trips every shipped default exactly", () => {
    for (const price of DEFAULT_PRICES.values()) {
      for (const field of PRICE_FIELDS) {
        const value = price[field];
        expect(parsePriceInput(formatPriceInput(value))).toEqual({ kind: "ok", value });
      }
    }
  });

  it('renders null as the empty string, and zero as "0"', () => {
    expect(formatPriceInput(null)).toBe("");
    expect(formatPriceInput(0)).toBe("0");
  });
});
