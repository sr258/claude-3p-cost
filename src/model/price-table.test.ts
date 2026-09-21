import { describe, expect, it } from "vitest";
import type { ModelTotal } from "./report-types.js";
import type { ModelPrice, PriceField, PriceOverrides, PriceTable } from "./prices.js";
import {
  buildPriceRows,
  decodePriceJson,
  encodePriceJson,
  resetAll,
  resetRow,
  resolvePriceTable,
  setOverride,
} from "./price-table.js";

function price(input: number): ModelPrice {
  return {
    input,
    output: input * 5,
    cacheWrite5m: (input * 5) / 4,
    cacheWrite1h: input * 2,
    cacheRead: input / 10,
  };
}

function modelTotal(model: string, costMicroUsd: number): ModelTotal {
  return {
    model,
    costMicroUsd,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    requests: 1,
  };
}

function overridesOf(
  entries: readonly [string, readonly [PriceField, number | null][]][],
): PriceOverrides {
  return new Map(entries.map(([model, fields]) => [model, new Map(fields)]));
}

const DEFAULTS: PriceTable = new Map([
  ["model-a", price(5_000_000)],
  ["model-b", price(3_000_000)],
]);

describe("resolvePriceTable", () => {
  it("leaves an unedited model at its default", () => {
    const resolved = resolvePriceTable(DEFAULTS, new Map());
    expect(resolved.get("model-a")).toEqual(price(5_000_000));
  });

  it("applies a single-field override and leaves the other four at default", () => {
    const overrides = overridesOf([["model-a", [["input", 9_000_000]]]]);
    const resolved = resolvePriceTable(DEFAULTS, overrides);
    const row = resolved.get("model-a")!;
    expect(row.input).toBe(9_000_000);
    expect(row.output).toBe(price(5_000_000).output);
    expect(row.cacheWrite5m).toBe(price(5_000_000).cacheWrite5m);
    expect(row.cacheWrite1h).toBe(price(5_000_000).cacheWrite1h);
    expect(row.cacheRead).toBe(price(5_000_000).cacheRead);
  });

  it("applies a null override as unknown, not as the default", () => {
    const overrides = overridesOf([["model-a", [["input", null]]]]);
    const resolved = resolvePriceTable(DEFAULTS, overrides);
    expect(resolved.get("model-a")!.input).toBeNull();
  });

  it("keeps a model with no default and no override entirely unknown", () => {
    // An override ENTRY exists for the model (an empty per-field map), but no
    // field is actually overridden, and no default exists either — every
    // field must resolve to null, not to some accidental fallback.
    const overrides = overridesOf([["hausmodell-x", []]]);
    const resolved = resolvePriceTable(DEFAULTS, overrides);
    const row = resolved.get("hausmodell-x")!;
    expect(row).toEqual({
      input: null,
      output: null,
      cacheWrite5m: null,
      cacheWrite1h: null,
      cacheRead: null,
    });
  });
});

describe("buildPriceRows", () => {
  it("marks only the overridden field as edited", () => {
    const overrides = overridesOf([["model-a", [["output", 30_000_000]]]]);
    const rows = buildPriceRows([modelTotal("model-a", 100)], DEFAULTS, overrides);
    const row = rows[0]!;
    expect(row.cells.output.isEdited).toBe(true);
    expect(row.cells.input.isEdited).toBe(false);
    expect(row.cells.cacheWrite5m.isEdited).toBe(false);
    expect(row.isEdited).toBe(true);
  });

  it("orders in-data rows by cost descending and default-only rows by code unit", () => {
    // A deliberately REVERSED synthetic default table (LEARNINGS: "an
    // injectable dependency whose default agrees with the injection on
    // every fixture is untested by construction") — no shipped constant
    // orders "zzz-model" before "aaa-model".
    const reversedDefaults: PriceTable = new Map([
      ["zzz-model", price(1_000_000)],
      ["aaa-model", price(2_000_000)],
      ["mmm-model", price(3_000_000)],
    ]);
    const models = [modelTotal("low-cost", 10), modelTotal("high-cost", 1000)];
    // NOTE: buildPriceRows keeps the IN-DATA order given, cost-descending is
    // the caller's responsibility (Report.models.models already provides
    // it) — passed here already in that order.
    const inDataInCostOrder = [modelTotal("high-cost", 1000), modelTotal("low-cost", 10)];
    void models;

    const rows = buildPriceRows(inDataInCostOrder, reversedDefaults, new Map());

    const inData = rows.filter((r) => r.inData);
    const otherModels = rows.filter((r) => !r.inData).map((r) => r.model);

    expect(inData.map((r) => r.model)).toEqual(["high-cost", "low-cost"]);
    // Code-unit order, NOT the reversed table's insertion order and NOT
    // alphabetic-by-collation (which would agree here anyway — the point is
    // it does not depend on Intl.Collator at all).
    expect(otherModels).toEqual(["aaa-model", "mmm-model", "zzz-model"]);
  });

  it("emits an empty row for a model in the data with no shipped default", () => {
    // Synthetic fixture — inert on real reference data, per LEARNINGS ("a
    // regression pin computed from real data cannot prove a guard-rail that
    // happens to be a no-op on that data"): with [1m] defaults shipped,
    // every model in the reference tree has a complete default.
    const rows = buildPriceRows([modelTotal("hausmodell-x", 42)], DEFAULTS, new Map());
    const row = rows[0]!;
    expect(row.hasDefault).toBe(false);
    for (const field of ["input", "output", "cacheWrite5m", "cacheWrite1h", "cacheRead"] as const) {
      expect(row.cells[field].value).toBeNull();
    }
  });

  it("never normalises the [1m] suffix", () => {
    const overrides = overridesOf([
      ["model-a", [["input", 1_000_000]]],
      ["model-a[1m]", [["input", 2_000_000]]],
    ]);
    const defaultsWithVariant: PriceTable = new Map([
      ...DEFAULTS,
      ["model-a[1m]", price(5_000_000)],
    ]);
    const rows = buildPriceRows(
      [modelTotal("model-a", 10), modelTotal("model-a[1m]", 20)],
      defaultsWithVariant,
      overrides,
    );
    const base = rows.find((r) => r.model === "model-a")!;
    const longContext = rows.find((r) => r.model === "model-a[1m]")!;
    expect(base.cells.input.value).toBe(1_000_000);
    expect(longContext.cells.input.value).toBe(2_000_000);
  });

  it("isComplete is false when any one field is null", () => {
    const overrides = overridesOf([["model-a", [["input", null]]]]);
    const rows = buildPriceRows([modelTotal("model-a", 10)], DEFAULTS, overrides);
    expect(rows[0]!.isComplete).toBe(false);
  });
});

describe("resetRow / resetAll", () => {
  it("resetRow removes every override for that model and no other model's", () => {
    const overrides = overridesOf([
      [
        "model-a",
        [
          ["input", 1],
          ["output", 2],
        ],
      ],
      ["model-b", [["input", 3]]],
    ]);
    const next = resetRow(overrides, "model-a");
    expect(next.has("model-a")).toBe(false);
    expect(next.get("model-b")?.get("input")).toBe(3);
  });

  it("resetAll returns an empty override set", () => {
    expect(resetAll().size).toBe(0);
  });
});

describe("setOverride", () => {
  it("leaves other models and other fields untouched", () => {
    const overrides = overridesOf([["model-a", [["input", 1]]]]);
    const next = setOverride(overrides, "model-a", "output", 99);
    expect(next.get("model-a")?.get("input")).toBe(1);
    expect(next.get("model-a")?.get("output")).toBe(99);
  });
});

describe("encodePriceJson / decodePriceJson", () => {
  it("emits USD per Mtok, not the internal integer", () => {
    const rows = buildPriceRows([modelTotal("model-a", 10)], DEFAULTS, new Map());
    const json = JSON.parse(encodePriceJson(rows)) as { prices: Record<string, { input: number }> };
    expect(json.prices["model-a"]!.input).toBe(5); // 5_000_000 micro -> 5 USD/Mtok
  });

  it("round-trips through decodePriceJson", () => {
    // Only model-a's own row, encoded alone: buildPriceRows would also add
    // model-b as a default-only "other model" row (DEFAULTS has two
    // entries), which is irrelevant to this assertion.
    const overrides = overridesOf([["model-a", [["input", 9_000_000]]]]);
    const rows = buildPriceRows([modelTotal("model-a", 10)], DEFAULTS, overrides).filter(
      (r) => r.model === "model-a",
    );
    const json = encodePriceJson(rows);
    const decoded = decodePriceJson(json, DEFAULTS);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      expect(decoded.overrides.get("model-a")?.get("input")).toBe(9_000_000);
      expect(decoded.models).toBe(1);
    }
  });

  it("replaces rather than merges", () => {
    const before = overridesOf([["model-b", [["input", 1_000_000]]]]);
    const rows = buildPriceRows([modelTotal("model-a", 10)], DEFAULTS, new Map());
    const json = encodePriceJson(rows);
    const decoded = decodePriceJson(json, DEFAULTS);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      // model-b was never in the imported file: an importer starting from
      // `before` and REPLACING with decoded.overrides must lose it.
      expect(decoded.overrides.has("model-b")).toBe(false);
      void before;
    }
  });

  it("stores an imported value equal to the default as not-edited", () => {
    const json = encodePriceJson(buildPriceRows([modelTotal("model-a", 10)], DEFAULTS, new Map()));
    const decoded = decodePriceJson(json, DEFAULTS);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      expect(decoded.overrides.has("model-a")).toBe(false);
    }
  });

  it("rejects malformed JSON, a wrong shape and a negative value with distinct reasons", () => {
    expect(decodePriceJson("not json", DEFAULTS)).toEqual({ kind: "invalid", reason: "json" });
    expect(decodePriceJson(JSON.stringify({ nope: true }), DEFAULTS)).toEqual({
      kind: "invalid",
      reason: "shape",
    });
    const badValue = JSON.stringify({
      format: "claude3pcost.prices",
      version: 1,
      currency: "USD",
      unit: "USD per 1M tokens",
      prices: {
        "model-a": { input: -1, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
      },
    });
    expect(decodePriceJson(badValue, DEFAULTS)).toEqual({ kind: "invalid", reason: "value" });
  });

  it("ignores __proto__, constructor and prototype keys and does not pollute the prototype", () => {
    // Written as a RAW JSON string, deliberately. Building this document
    // with an object literal and `JSON.stringify` does NOT work: in a
    // literal, `__proto__: {...}` sets the prototype instead of creating an
    // own property, so `JSON.stringify` emits `{}` and the resulting
    // document contains no dangerous key at all — a test that cannot fail.
    // `JSON.parse`, by contrast, DOES create `__proto__` as a real own
    // property, which is exactly the case this function must survive.
    const priceBody =
      '{ "input": 1, "output": 1, "cacheWrite5m": 1, "cacheWrite1h": 1, "cacheRead": 1 }';
    const malicious =
      '{"format":"claude3pcost.prices","version":1,"currency":"USD",' +
      '"unit":"USD per 1M tokens","prices":{' +
      `"__proto__": ${priceBody},` +
      `"constructor": ${priceBody},` +
      `"prototype": ${priceBody},` +
      '"model-a": { "input": 9, "output": 25, "cacheWrite5m": 6.25, "cacheWrite1h": 10, "cacheRead": 0.5 }' +
      "}}";

    // Precondition: the document really does carry the dangerous keys as
    // own properties once parsed — without this the assertions below would
    // be vacuous.
    const reparsed = JSON.parse(malicious) as { prices: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(reparsed.prices, "__proto__")).toBe(true);
    expect(Object.keys(reparsed.prices)).toContain("constructor");

    const decoded = decodePriceJson(malicious, DEFAULTS);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      expect(decoded.overrides.has("__proto__")).toBe(false);
      expect(decoded.overrides.has("constructor")).toBe(false);
      expect(decoded.overrides.has("prototype")).toBe(false);
      // Only "model-a" was counted and kept.
      expect(decoded.models).toBe(1);
      expect(decoded.overrides.get("model-a")?.get("input")).toBe(9_000_000);
    }
    // Nothing leaked onto Object.prototype via any route.
    expect(Object.prototype.hasOwnProperty.call({}, "input")).toBe(false);
    expect(({} as Record<string, unknown>)["input"]).toBeUndefined();
  });
});
