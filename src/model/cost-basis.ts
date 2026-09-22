/**
 * US-4.1's "the app shows the `costBasis` and `provider` values found in the
 * data" (S16 plan §4.3, Q5). Pure, no I/O, no clock, no `src/i18n/` import,
 * no `localeCompare` — sorted by code unit like every other model-layer list.
 *
 * Measured during planning: `provider` is `"foundry"` in 509 of 509
 * `modelUsage` entries in the reference tree; `costBasis` is `"list"` in 304
 * and ABSENT in 205 — "not stated" is a common, real value and must never be
 * silently folded into `"list"`.
 */
import type { SessionRow } from "./report-types.js";

/** Caps rendering so a pathological log cannot push arbitrary strings into the UI (NFR-6-adjacent, though these are vendor product identifiers, not user content). */
export const MAX_DISTINCT_VALUES = 8;
export const MAX_VALUE_LENGTH = 32;

export interface CostBasisSummary {
  /** Distinct, code-unit order, capped at MAX_DISTINCT_VALUES and MAX_VALUE_LENGTH each. */
  readonly providers: readonly string[];
  /** Distinct, code-unit order, capped — excludes null (see `unstatedCostBasisEntries`). */
  readonly costBases: readonly string[];
  /** Entries whose costBasis is `null` — counted explicitly, never defaulted to "list". */
  readonly unstatedCostBasisEntries: number;
  /** Total modelUsage entries seen (the denominator for the count above). */
  readonly entries: number;
  /** True when either list was capped at MAX_DISTINCT_VALUES. */
  readonly truncated: boolean;
}

function capValue(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) : value;
}

function sortedCapped(values: ReadonlySet<string>): {
  values: readonly string[];
  truncated: boolean;
} {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const truncated = sorted.length > MAX_DISTINCT_VALUES;
  return { values: Object.freeze(sorted.slice(0, MAX_DISTINCT_VALUES)), truncated };
}

/** Walks every session's requests' per-model usage entries in scope (already range-filtered by S13). */
export function summarizeCostBasis(sessions: readonly SessionRow[]): CostBasisSummary {
  const providers = new Set<string>();
  const costBases = new Set<string>();
  let unstatedCostBasisEntries = 0;
  let entries = 0;

  for (const session of sessions) {
    for (const request of session.requests) {
      for (const modelUsage of request.models) {
        entries += 1;
        if (modelUsage.provider !== null) {
          providers.add(capValue(modelUsage.provider));
        }
        if (modelUsage.costBasis === null) {
          unstatedCostBasisEntries += 1;
        } else {
          costBases.add(capValue(modelUsage.costBasis));
        }
      }
    }
  }

  const providerResult = sortedCapped(providers);
  const costBasisResult = sortedCapped(costBases);

  return Object.freeze({
    providers: providerResult.values,
    costBases: costBasisResult.values,
    unstatedCostBasisEntries,
    entries,
    truncated: providerResult.truncated || costBasisResult.truncated,
  });
}
