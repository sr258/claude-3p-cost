/**
 * `localStorage` persistence of the US-4.2 price overrides (S15 plan §5.4).
 * `locale-store.ts`'s defensive shape (LEARNINGS): a throwing `localStorage`,
 * an absent key, malformed JSON, a non-object, or a bad value all degrade to
 * an empty override set, never to an exception (NFR-3).
 *
 * The serialised shape preserves `null` as "unknown" and distinguishes it
 * from an absent key (Q5): a field is written into the JSON object ONLY when
 * an override exists for it — `undefined`/absent for "use the default",
 * literal `null` for "the user cleared it". `JSON.stringify` already drops
 * an object property whose value is `undefined`, so building the per-field
 * object with only the overridden keys present is sufficient; there is no
 * separate "omit" step.
 */
import type { PriceField, PriceMicroUsdPerMtok, PriceOverrides } from "../model/prices.js";
import { PRICE_FIELDS } from "../model/prices.js";

const STORAGE_KEY = "claude3pcost.prices";

type SerializedOverrides = Record<string, Partial<Record<PriceField, PriceMicroUsdPerMtok | null>>>;

function isPriceField(key: string): key is PriceField {
  return (PRICE_FIELDS as readonly string[]).includes(key);
}

function isValidStoredValue(value: unknown): value is PriceMicroUsdPerMtok | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

/** Returns an empty override set for an absent key, malformed JSON, a non-object, a bad value, or a throwing `localStorage`. */
export function loadPriceOverrides(): PriceOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return new Map();
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return new Map();
    }

    const overrides = new Map<string, Map<PriceField, PriceMicroUsdPerMtok | null>>();
    for (const [model, fields] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
        continue; // one malformed model entry is dropped, not fatal (NFR-3)
      }
      const fieldMap = new Map<PriceField, PriceMicroUsdPerMtok | null>();
      for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
        if (isPriceField(field) && isValidStoredValue(value)) {
          fieldMap.set(field, value);
        }
      }
      if (fieldMap.size > 0) {
        overrides.set(model, fieldMap);
      }
    }
    return Object.freeze(overrides);
  } catch {
    return new Map();
  }
}

/** Serialises and stores. Swallows write failures (private mode, quota). */
export function storePriceOverrides(overrides: PriceOverrides): void {
  try {
    const serialized: SerializedOverrides = {};
    for (const [model, fields] of overrides) {
      if (fields.size === 0) {
        continue;
      }
      const entry: Partial<Record<PriceField, PriceMicroUsdPerMtok | null>> = {};
      for (const [field, value] of fields) {
        entry[field] = value;
      }
      serialized[model] = entry;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore: private mode, quota exceeded, or storage disabled.
  }
}
