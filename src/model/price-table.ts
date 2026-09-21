/**
 * Resolution, row-building and the JSON exchange format for the price table
 * (US-4.2, S15 plan §5.3). Pure, no I/O, no clock, no `src/i18n/` import.
 *
 * `resolvePriceTable` and `buildPriceRows` take the default table as a
 * PARAMETER rather than reading `DEFAULT_PRICES` directly (LEARNINGS: "an
 * injectable dependency whose default agrees with the injection on every
 * fixture is untested by construction") — their tests inject a deliberately
 * reversed synthetic table no shipped constant could produce.
 */
import type { ModelTotal } from "./report-types.js";
import {
  PRICE_FIELDS,
  type ModelPrice,
  type PriceField,
  type PriceMicroUsdPerMtok,
  type PriceOverrides,
  type PriceTable,
} from "./prices.js";

/** `table.get(model) ?? null` — reads without ever seeing overrides. */
export function priceOf(table: PriceTable, model: string): ModelPrice | null {
  return table.get(model) ?? null;
}

/**
 * The merged, effective table (Q5): for each field, an override's value
 * (a number OR an explicit `null`) wins when present; otherwise the shipped
 * default's value for that field, or `null` when there is none. Includes
 * every model key mentioned in EITHER `defaults` OR `overrides` — a model
 * present only in `overrides` (e.g. imported for a model this machine's data
 * has never seen) still resolves, field by field, against nothing but
 * `null`.
 */
export function resolvePriceTable(defaults: PriceTable, overrides: PriceOverrides): PriceTable {
  const models = new Set<string>([...defaults.keys(), ...overrides.keys()]);
  const resolved = new Map<string, ModelPrice>();

  for (const model of models) {
    const defaultPrice = defaults.get(model) ?? null;
    const override = overrides.get(model);
    const price: Record<PriceField, PriceMicroUsdPerMtok | null> = {
      input: null,
      output: null,
      cacheWrite5m: null,
      cacheWrite1h: null,
      cacheRead: null,
    };
    for (const field of PRICE_FIELDS) {
      if (override && override.has(field)) {
        price[field] = override.get(field)!;
      } else {
        price[field] = defaultPrice ? defaultPrice[field] : null;
      }
    }
    resolved.set(model, price);
  }

  return Object.freeze(resolved);
}

export interface PriceCell {
  readonly value: PriceMicroUsdPerMtok | null;
  readonly defaultValue: PriceMicroUsdPerMtok | null;
  /** An override exists for THIS field (key present in `overrides`), regardless of its value. */
  readonly isEdited: boolean;
}

export interface PriceRow {
  /** The exact variant string — the "[1m]" suffix is never normalised away. */
  readonly model: string;
  readonly cells: Readonly<Record<PriceField, PriceCell>>;
  readonly hasDefault: boolean;
  readonly isEdited: boolean;
  /** Every field non-null -> S16 can price this model. */
  readonly isComplete: boolean;
  readonly inData: boolean;
  /** 0 when not in the data; the primary sort key for in-data rows. */
  readonly costMicroUsd: number;
}

function buildRow(
  model: string,
  costMicroUsd: number,
  inData: boolean,
  defaults: PriceTable,
  overrides: PriceOverrides,
): PriceRow {
  const defaultPrice = defaults.get(model) ?? null;
  const override = overrides.get(model);
  const cells: Record<PriceField, PriceCell> = {
    input: { value: null, defaultValue: null, isEdited: false },
    output: { value: null, defaultValue: null, isEdited: false },
    cacheWrite5m: { value: null, defaultValue: null, isEdited: false },
    cacheWrite1h: { value: null, defaultValue: null, isEdited: false },
    cacheRead: { value: null, defaultValue: null, isEdited: false },
  };
  let anyEdited = false;
  let allComplete = true;
  for (const field of PRICE_FIELDS) {
    const defaultValue = defaultPrice ? defaultPrice[field] : null;
    const isEdited = override !== undefined && override.has(field);
    const value = isEdited ? override!.get(field)! : defaultValue;
    cells[field] = { value, defaultValue, isEdited };
    if (isEdited) {
      anyEdited = true;
    }
    if (value === null) {
      allComplete = false;
    }
  }
  return Object.freeze({
    model,
    cells: Object.freeze(cells),
    hasDefault: defaultPrice !== null,
    isEdited: anyEdited,
    isComplete: allComplete,
    inData,
    costMicroUsd,
  });
}

/**
 * `models` is `Report.models.models`, already cost descending (S15 plan
 * §5.3). Order: in-data rows kept in that exact order (never re-sorted),
 * then the remaining shipped-default-only models, sorted ascending BY CODE
 * UNIT — a bare string comparison, never `localeCompare` (LEARNINGS:
 * "`localeCompare` is the model layer's back door to i18n").
 */
export function buildPriceRows(
  models: readonly ModelTotal[],
  defaults: PriceTable,
  overrides: PriceOverrides,
): readonly PriceRow[] {
  const inDataModels = new Set(models.map((m) => m.model));
  const inDataRows = models.map((m) =>
    buildRow(m.model, m.costMicroUsd, true, defaults, overrides),
  );

  const otherModels = [...defaults.keys()].filter((model) => !inDataModels.has(model)).sort();
  const otherRows = otherModels.map((model) => buildRow(model, 0, false, defaults, overrides));

  return Object.freeze([...inDataRows, ...otherRows]);
}

function cloneOverrides(
  o: PriceOverrides,
): Map<string, Map<PriceField, PriceMicroUsdPerMtok | null>> {
  const next = new Map<string, Map<PriceField, PriceMicroUsdPerMtok | null>>();
  for (const [model, fields] of o) {
    next.set(model, new Map(fields));
  }
  return next;
}

/** Sets a single field's override, leaving every other field and every other model untouched. */
export function setOverride(
  o: PriceOverrides,
  model: string,
  field: PriceField,
  value: PriceMicroUsdPerMtok | null,
): PriceOverrides {
  const next = cloneOverrides(o);
  const fields = next.get(model) ?? new Map<PriceField, PriceMicroUsdPerMtok | null>();
  const nextFields = new Map(fields);
  nextFields.set(field, value);
  next.set(model, nextFields);
  return Object.freeze(next);
}

/** Removes every override for `model`, and no other model's. */
export function resetRow(o: PriceOverrides, model: string): PriceOverrides {
  const next = cloneOverrides(o);
  next.delete(model);
  return Object.freeze(next);
}

/** The whole-table reset. */
export function resetAll(): PriceOverrides {
  return Object.freeze(new Map());
}

const PRICE_JSON_FORMAT = "claude3pcost.prices";
const PRICE_JSON_VERSION = 1;
/** Never a real own property of anything this module builds — defence against prototype pollution
 * from an imported file (S15 plan §5.3): these keys are dropped, not merely rejected. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** micro-USD-per-Mtok -> plain USD-per-Mtok, human readable, for the export file. */
function toDisplayUnit(value: PriceMicroUsdPerMtok | null): number | null {
  return value === null ? null : value / 1_000_000;
}

/**
 * Emits every row's EFFECTIVE (resolved) value, in human-readable USD per
 * Mtok — never the internal integer, since a file a colleague can read and
 * edit is the point (S15 plan §5.3).
 */
export function encodePriceJson(rows: readonly PriceRow[]): string {
  const prices: Record<string, Record<PriceField, number | null>> = {};
  for (const row of rows) {
    const entry: Record<PriceField, number | null> = {
      input: null,
      output: null,
      cacheWrite5m: null,
      cacheWrite1h: null,
      cacheRead: null,
    };
    for (const field of PRICE_FIELDS) {
      entry[field] = toDisplayUnit(row.cells[field].value);
    }
    prices[row.model] = entry;
  }
  const document = {
    format: PRICE_JSON_FORMAT,
    version: PRICE_JSON_VERSION,
    currency: "USD",
    unit: "USD per 1M tokens",
    prices,
  };
  return JSON.stringify(document, null, 2);
}

export type PriceDecode =
  | { readonly kind: "ok"; readonly overrides: PriceOverrides; readonly models: number }
  | { readonly kind: "invalid"; readonly reason: "json" | "shape" | "value" };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidFieldValue(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/**
 * Replaces the whole override set (Q4) — never merges. An imported value
 * equal to the shipped default is stored as NOT an override, so the
 * edited-vs-default marking stays meaningful after an import (Q4). Rejects
 * `__proto__` / `constructor` / `prototype` keys by dropping them rather
 * than trusting `Object.entries` alone (S15 plan §5.3) — this is the one
 * place a user-controlled string becomes a would-be object key.
 */
export function decodePriceJson(text: string, defaults: PriceTable): PriceDecode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "json" };
  }

  if (
    !isPlainObject(parsed) ||
    parsed["format"] !== PRICE_JSON_FORMAT ||
    typeof parsed["version"] !== "number" ||
    !isPlainObject(parsed["prices"])
  ) {
    return { kind: "invalid", reason: "shape" };
  }

  const rawPrices = parsed["prices"];
  const overrides = new Map<string, Map<PriceField, PriceMicroUsdPerMtok | null>>();
  let modelCount = 0;

  for (const [model, rawPrice] of Object.entries(rawPrices)) {
    if (DANGEROUS_KEYS.has(model)) {
      continue;
    }
    if (!isPlainObject(rawPrice)) {
      return { kind: "invalid", reason: "shape" };
    }
    const defaultPrice = defaults.get(model) ?? null;
    const fieldOverrides = new Map<PriceField, PriceMicroUsdPerMtok | null>();

    for (const field of PRICE_FIELDS) {
      const rawValue = rawPrice[field];
      if (!isValidFieldValue(rawValue)) {
        return { kind: "invalid", reason: "value" };
      }
      const microValue = rawValue === null ? null : Math.round(rawValue * 1_000_000);
      const defaultValue = defaultPrice ? defaultPrice[field] : null;
      if (microValue !== defaultValue) {
        fieldOverrides.set(field, microValue);
      }
    }

    if (fieldOverrides.size > 0) {
      overrides.set(model, fieldOverrides);
    }
    modelCount += 1;
  }

  return { kind: "ok", overrides: Object.freeze(overrides), models: modelCount };
}
