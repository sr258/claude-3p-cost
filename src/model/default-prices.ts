/**
 * The shipped default price table — Anthropic's public list prices, baked
 * in at build time (US-4.2, S15 plan §5.3, NFR-5: nothing is ever fetched).
 *
 * Q1, decided: a `[1m]` variant gets its OWN explicit row, at the SAME rates
 * as its base model — never a runtime fallback that strips the suffix and
 * reuses the base price (that is the roadmap's stated trap: normalising the
 * suffix away at the exact moment it matters, and it would silently hide the
 * day Anthropic starts charging a long-context premium). 16 rows total: 8
 * base models, independently editable from their 16 `[1m]` counterparts.
 *
 * Both input AND output are written out explicitly per model (S15 plan
 * §5.3): "output = 5 × input" holds for all eight current models but is a
 * coincidence, not a law, and writing it out keeps that visible rather than
 * derived. The three cache columns ARE derived, by the multipliers §1.2
 * confirmed against real billing data:
 *   cacheWrite5m = 1.25 × input, cacheWrite1h = 2.00 × input,
 *   cacheRead    = 0.10 × input.
 * Every one of these divisions/multiplications lands on an exact integer for
 * every base price below (each input is a whole multiple of 1_000_000), so
 * plain integer arithmetic is used rather than floating-point multiplication
 * — no rounding, no float artefact ever enters this table.
 *
 * S16 Q4 adds a sixth field, `webSearch`, shipped at a flat `10_000`
 * micro-USD PER REQUEST (= $0.01/request) for all 16 rows — the same rate for
 * every model, because the reference data gives no evidence it varies by
 * model. Not derived from `input`: it is a different unit (per request, not
 * per Mtok) and a coincidental multiplier here would be exactly the kind of
 * derived-looking-but-arbitrary number this table otherwise avoids.
 */
import type {
  ModelPrice,
  PriceMicroUsdPerMtok,
  PriceMicroUsdPerRequest,
  PriceTable,
} from "./prices.js";

/**
 * ISO day string, not a `Date` — `src/model/` has no clock, and a plain
 * string stays diffable and greppable next to the literals it describes.
 * Q2's rule nothing can mechanically enforce: whoever edits a price literal
 * below edits this constant in the same commit.
 */
export const DEFAULT_PRICES_AS_OF = "2026-09-21";

/** S16 Q4: a flat $0.01/request for every model, shipped under the same "as of" date above. */
const WEB_SEARCH_PRICE: PriceMicroUsdPerRequest = 10_000;

interface BaseRate {
  readonly model: string;
  readonly input: PriceMicroUsdPerMtok;
  readonly output: PriceMicroUsdPerMtok;
}

const BASE_RATES: readonly BaseRate[] = [
  { model: "claude-fable-5", input: 10_000_000, output: 50_000_000 },
  { model: "claude-opus-5", input: 5_000_000, output: 25_000_000 },
  { model: "claude-opus-4-8", input: 5_000_000, output: 25_000_000 },
  { model: "claude-opus-4-7", input: 5_000_000, output: 25_000_000 },
  { model: "claude-opus-4-6", input: 5_000_000, output: 25_000_000 },
  { model: "claude-sonnet-5", input: 3_000_000, output: 15_000_000 },
  { model: "claude-sonnet-4-6", input: 3_000_000, output: 15_000_000 },
  { model: "claude-haiku-4-5", input: 1_000_000, output: 5_000_000 },
];

function priceFromInput(input: PriceMicroUsdPerMtok, output: PriceMicroUsdPerMtok): ModelPrice {
  return {
    input,
    output,
    cacheWrite5m: (input * 5) / 4, // 1.25x, exact for every input above
    cacheWrite1h: input * 2, // 2.00x
    cacheRead: input / 10, // 0.10x, exact for every input above
    webSearch: WEB_SEARCH_PRICE,
  };
}

function buildDefaultPrices(): PriceTable {
  const table = new Map<string, ModelPrice>();
  for (const rate of BASE_RATES) {
    const price = priceFromInput(rate.input, rate.output);
    table.set(rate.model, price);
    // Q1: the "[1m]" row is a SEPARATE entry, at identical rates — never
    // derived at read time from the base model, so the two stay
    // independently editable (Q1's whole point).
    table.set(`${rate.model}[1m]`, price);
  }
  return Object.freeze(table);
}

export const DEFAULT_PRICES: PriceTable = buildDefaultPrices();
