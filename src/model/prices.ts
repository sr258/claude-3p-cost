/**
 * US-4.2's price representation — pure, no I/O, no clock, no `src/i18n/`
 * import, no `localeCompare` (S15 plan §5.3, LEARNINGS: "`localeCompare` is
 * the model layer's back door to i18n").
 *
 * A price is an integer number of MICRO-USD PER MILLION TOKENS: "$5.00/Mtok"
 * -> `5_000_000`. Every default and every plausible negotiated rate is exact
 * in this unit, it composes with the existing money rule (integer µUSD)
 * without a unit conversion — USD-per-Mtok is numerically identical to
 * µUSD-per-token, so this is that figure scaled by 1e6 for sub-µUSD
 * precision — and the range is safe (plan §5.3 point 3). `null` always means
 * "unknown", never `0` (Q5).
 *
 * S16 Q4 adds a SIXTH field, `webSearch`, in a DIFFERENT unit: micro-USD PER
 * REQUEST, not per million tokens. The stored integer is still `USD * 1e6`
 * for all six fields, so `parsePriceInput`/`formatPriceInput` stay
 * unit-agnostic below — only the amount arithmetic in `src/model/recompute.ts`
 * treats `webSearch` differently (no division by token count).
 */

export type PriceMicroUsdPerMtok = number;
export type PriceMicroUsdPerRequest = number;

export interface ModelPrice {
  readonly input: PriceMicroUsdPerMtok | null;
  readonly output: PriceMicroUsdPerMtok | null;
  readonly cacheWrite5m: PriceMicroUsdPerMtok | null;
  readonly cacheWrite1h: PriceMicroUsdPerMtok | null;
  readonly cacheRead: PriceMicroUsdPerMtok | null;
  /** S16 Q4. Per REQUEST, not per Mtok. */
  readonly webSearch: PriceMicroUsdPerRequest | null;
}

export type PriceField = keyof ModelPrice;

/**
 * Fixes the column order everywhere a price is rendered or serialised.
 * `webSearch` is appended LAST, so the five existing columns keep their order
 * (S16 plan §4.1) — every hand-built five-field object literal elsewhere in
 * this codebase now needs a sixth key, which is expected `tsc` fallout, not
 * scope creep (LEARNINGS).
 */
export const PRICE_FIELDS: readonly PriceField[] = [
  "input",
  "output",
  "cacheWrite5m",
  "cacheWrite1h",
  "cacheRead",
  "webSearch",
];

export type PriceUnit = "per-mtok" | "per-request";

/** Drives the editor's per-column unit label and the recompute panel's price column. */
export const PRICE_FIELD_UNIT: Readonly<Record<PriceField, PriceUnit>> = {
  input: "per-mtok",
  output: "per-mtok",
  cacheWrite5m: "per-mtok",
  cacheWrite1h: "per-mtok",
  cacheRead: "per-mtok",
  webSearch: "per-request",
};

/**
 * Model variant string -> field -> value. The "[1m]" suffix is NEVER
 * stripped anywhere in this codebase. An ABSENT field means "use the shipped
 * default"; a `null` VALUE means the user deliberately cleared it to unknown
 * (Q5). A nested `Map` rather than `Partial<Record<...>>`, because
 * `tsconfig.json` does not set `exactOptionalPropertyTypes`, and only a
 * `Map` makes "absent" and "present but null" distinguishable both in the
 * type and at runtime.
 */
export type PriceOverrides = ReadonlyMap<
  string,
  ReadonlyMap<PriceField, PriceMicroUsdPerMtok | null>
>;

/** The merged, effective table. S16 consumes this; it never sees overrides. */
export type PriceTable = ReadonlyMap<string, ModelPrice>;

export type PriceParse =
  | { readonly kind: "ok"; readonly value: PriceMicroUsdPerMtok | null }
  | { readonly kind: "invalid" };

/**
 * Accepts a plain, non-negative dot- OR comma-decimal number (Q6: a German
 * user typing "6,25" must work) and rejects a group separator outright —
 * exactly one decimal mark, digits only, no leading sign, no whitespace
 * inside. An empty or whitespace-only string maps to `null` ("unknown"),
 * NEVER to `0` — clearing a field is not the same as pricing it at zero.
 */
const PLAIN_NUMBER_RE = /^\d+([.,]\d+)?$/;

export function parsePriceInput(text: string): PriceParse {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "ok", value: null };
  }
  if (!PLAIN_NUMBER_RE.test(trimmed)) {
    return { kind: "invalid" };
  }
  const normalized = trimmed.replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return { kind: "invalid" };
  }
  // Resolution is 1e-6 USD per Mtok: round rather than truncate, so a value
  // entered with more precision than that is not silently biased downward.
  return { kind: "ok", value: Math.round(numeric * 1_000_000) };
}

/**
 * Renders a stored micro-USD-per-Mtok value back into the raw dot-decimal
 * text `parsePriceInput` accepts (Q6) — never through `formatNumber`, which
 * would emit a locale group separator this field explicitly refuses to
 * parse back (U+00A0 trap, LEARNINGS). `null` renders as the empty string;
 * `0` renders as "0", not as empty — clearing a field and pricing it at
 * zero are different states and must render differently.
 */
export function formatPriceInput(value: PriceMicroUsdPerMtok | null): string {
  if (value === null) {
    return "";
  }
  return String(value / 1_000_000);
}
