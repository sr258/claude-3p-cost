/**
 * US-4.1/US-4.2/US-4.3's recomputation at the user's own prices (S16 plan
 * §4.2). Pure, no I/O, no clock, no `src/i18n/` import, no `localeCompare`.
 *
 * Reads ONLY `ModelBreakdown` / `ModelTotal` (i.e. `modelUsage`), NEVER
 * `TokenTotals` / `RequestRecord.usage` (plan §0.1): `usage` on a `result`
 * line is the last assistant message's snapshot, `modelUsage` is the
 * aggregate that actually produced `total_cost_usd`. There are therefore
 * FOUR token recomputation categories (input, output, cache write, cache
 * read) plus web search — never S11's six token-category buckets, which read
 * `session.totals.tokens` and answer a different question (plan §0.1
 * consequence 2: the two tables must never share a display).
 *
 * The `[1m]` suffix is never normalised: `priceOf` (from `price-table.ts`)
 * looks up the EXACT model string.
 */
import { priceOf } from "./price-table.js";
import { PRICE_FIELD_UNIT, type PriceField, type PriceTable, type PriceUnit } from "./prices.js";
import type { ModelBreakdown, Report, SessionRow } from "./report-types.js";

export type RecomputeCategory = "input" | "output" | "cacheWrite" | "cacheRead" | "webSearch";

/**
 * The price field each category reads for the HEADLINE figure. `cacheWrite`
 * -> `cacheWrite1h` (Q3: the only TTL the result line's own `usage` block
 * ever reports, and exact for the three models that fit exactly).
 * `cacheWrite5m` is deliberately NOT a value in this map — it is read only by
 * the bracket (Q3b) and can never cause an exclusion.
 */
export const CATEGORY_PRICE_FIELD: Readonly<Record<RecomputeCategory, PriceField>> = Object.freeze({
  input: "input",
  output: "output",
  cacheWrite: "cacheWrite1h",
  cacheRead: "cacheRead",
  webSearch: "webSearch",
});

const CATEGORIES: readonly RecomputeCategory[] = [
  "input",
  "output",
  "cacheWrite",
  "cacheRead",
  "webSearch",
];

export interface RecomputeLine {
  readonly category: RecomputeCategory;
  /** Token count, or request count for `webSearch`. */
  readonly units: number;
  readonly unit: PriceUnit;
  readonly priceMicroUsd: number | null; // null = unknown, never 0
  readonly amountMicroUsd: number | null; // null iff the price is null
}

/** The 5-minute bound (Q3, Q3b). Null where it cannot honestly be stated. */
export interface CacheBracket {
  readonly costMicroUsd: number;
  readonly deviationMicroUsd: number;
  readonly deviationRatio: number | null;
}

export interface ModelRecompute {
  readonly model: string; // "[1m]" NEVER normalised
  readonly lines: readonly RecomputeLine[]; // always 5, zeros included
  readonly costMicroUsd: number; // 0 when !priced
  readonly listCostMicroUsd: number; // ModelTotal.costMicroUsd
  readonly priced: boolean;
  readonly missingFields: readonly PriceField[]; // untranslated identifiers
  /** Null iff this model has cache-creation tokens and no `cacheWrite5m`. */
  readonly bracket: CacheBracket | null;
  readonly webSearchRequests: number;
}

export interface RecomputeExclusion {
  readonly sessions: number;
  readonly models: readonly string[]; // distinct, code-unit order
  readonly listCostMicroUsd: number;
}

export interface Recomputation {
  readonly models: readonly ModelRecompute[]; // input order preserved
  readonly costMicroUsd: number; // INCLUDED sessions only
  readonly listCostMicroUsd: number; // INCLUDED only — the % base
  readonly scopeListCostMicroUsd: number; // everything in scope
  readonly deviationMicroUsd: number; // own - list(included)
  readonly deviationRatio: number | null; // null when the base is 0
  readonly excluded: RecomputeExclusion;
  /** Null when any included model with cache-creation tokens lacks a 5m price. */
  readonly bracket: CacheBracket | null;
  readonly bracketUnavailableModels: readonly string[];
  readonly webSearchRequests: number;
  readonly isEmpty: boolean; // nothing priced at all
}

export interface SessionRecomputation extends Recomputation {
  readonly sessionExcluded: boolean;
}

export interface ReportRecomputation {
  readonly total: Recomputation;
  /** Project AND folder group keys, so S10's toggle rebuilds nothing. */
  readonly byGroupKey: ReadonlyMap<string, Recomputation>;
  readonly bySessionId: ReadonlyMap<string, SessionRecomputation>;
}

/** The shape both `ModelTotal` and this module's own group-scope token sums share. */
interface ModelUsageLike {
  readonly model: string;
  readonly costMicroUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly webSearchRequests: number;
}

function unitsFor(category: RecomputeCategory, model: ModelUsageLike): number {
  switch (category) {
    case "input":
      return model.inputTokens;
    case "output":
      return model.outputTokens;
    case "cacheWrite":
      return model.cacheCreationInputTokens;
    case "cacheRead":
      return model.cacheReadInputTokens;
    case "webSearch":
      return model.webSearchRequests;
  }
}

/**
 * Q7: `Math.round(tokens * priceMicroUsd / 1e6)` per line, EXCEPT web search,
 * which is `requests * priceMicroUsd` exactly — no division, because the
 * `x 1e6` in the stored value and the "per request" unit already cancel. A
 * wrong implementation dividing web search by 1e6 is off by a factor of a
 * million (test 10 / negative control C6).
 */
function amountFor(category: RecomputeCategory, units: number, priceMicroUsd: number): number {
  if (category === "webSearch") {
    return units * priceMicroUsd;
  }
  return Math.round((units * priceMicroUsd) / 1_000_000);
}

function findLine(lines: readonly RecomputeLine[], category: RecomputeCategory): RecomputeLine {
  const line = lines.find((l) => l.category === category);
  if (line === undefined) {
    throw new Error(`unreachable: missing ${category} line`);
  }
  return line;
}

/** Builds one model's recomputation. Never falls back to a suffix-stripped model key (test 3). */
function buildModelRecompute(model: ModelUsageLike, table: PriceTable): ModelRecompute {
  const price = priceOf(table, model.model);
  const missingFields: PriceField[] = [];
  const lines: RecomputeLine[] = [];
  let sumMicroUsd = 0;

  for (const category of CATEGORIES) {
    const field = CATEGORY_PRICE_FIELD[category];
    const units = unitsFor(category, model);
    const priceMicroUsd = price ? price[field] : null;
    const unit = PRICE_FIELD_UNIT[field];
    let amountMicroUsd: number | null = null;
    if (priceMicroUsd !== null) {
      amountMicroUsd = amountFor(category, units, priceMicroUsd);
      sumMicroUsd += amountMicroUsd;
    } else if (units > 0) {
      // Q2: a null price excludes only when the category actually has
      // non-zero usage. A null price on a zero-usage category never lands
      // here.
      missingFields.push(field);
    }
    lines.push(Object.freeze({ category, units, unit, priceMicroUsd, amountMicroUsd }));
  }

  const priced = missingFields.length === 0;
  const costMicroUsd = priced ? sumMicroUsd : 0;

  // Q3b: the bracket is a SEPARATE predicate from `priced` — a missing
  // `cacheWrite5m` never excludes, it only hides the bracket.
  let bracket: CacheBracket | null = null;
  if (priced) {
    const cacheTokens = model.cacheCreationInputTokens;
    if (cacheTokens === 0) {
      // No cache-creation tokens: the 5 m bound IS the headline figure, so
      // the bracket's deviation from the logged list cost is the headline's
      // own deviation — never a hardcoded 0, which would claim this model
      // priced exactly as logged.
      const deviationMicroUsd = costMicroUsd - model.costMicroUsd;
      bracket = Object.freeze({
        costMicroUsd,
        deviationMicroUsd,
        deviationRatio: model.costMicroUsd === 0 ? null : deviationMicroUsd / model.costMicroUsd,
      });
    } else if (price && price.cacheWrite5m !== null) {
      const headlineCacheWrite = findLine(lines, "cacheWrite");
      const bracketCacheWriteAmount = amountFor("cacheWrite", cacheTokens, price.cacheWrite5m);
      const bracketCost =
        costMicroUsd - (headlineCacheWrite.amountMicroUsd ?? 0) + bracketCacheWriteAmount;
      const deviationMicroUsd = bracketCost - model.costMicroUsd;
      bracket = Object.freeze({
        costMicroUsd: bracketCost,
        deviationMicroUsd,
        deviationRatio: model.costMicroUsd === 0 ? null : deviationMicroUsd / model.costMicroUsd,
      });
    }
    // else: cacheWrite5m unknown -> bracket stays null (Q3b, test 11).
  }

  return Object.freeze({
    model: model.model,
    lines: Object.freeze(lines),
    costMicroUsd,
    listCostMicroUsd: model.costMicroUsd,
    priced,
    missingFields: Object.freeze(missingFields),
    bracket,
    webSearchRequests: model.webSearchRequests,
  });
}

function isEmptyRecomputation(models: readonly ModelRecompute[]): boolean {
  return (
    models.length === 0 || models.every((m) => m.lines.every((l) => l.amountMicroUsd === null))
  );
}

function bracketUnavailableModelsOf(models: readonly ModelRecompute[]): readonly string[] {
  return Object.freeze(
    models
      .filter((m) => m.priced && m.bracket === null && findLine(m.lines, "cacheWrite").units > 0)
      .map((m) => m.model)
      .sort(),
  );
}

function scopeBracketOf(
  models: readonly ModelRecompute[],
  bracketUnavailableModels: readonly string[],
  listCostMicroUsd: number,
): CacheBracket | null {
  if (bracketUnavailableModels.length > 0) {
    return null;
  }
  const costMicroUsd = models.reduce((sum, m) => sum + (m.bracket?.costMicroUsd ?? 0), 0);
  const deviationMicroUsd = costMicroUsd - listCostMicroUsd;
  return Object.freeze({
    costMicroUsd,
    deviationMicroUsd,
    deviationRatio: listCostMicroUsd === 0 ? null : deviationMicroUsd / listCostMicroUsd,
  });
}

/**
 * Q2: a whole `ModelBreakdown` is one exclusion unit — if ANY of its models
 * lacks a price for a category it actually used, the ENTIRE recomputation is
 * excluded (never a partially-priced figure). This is what makes it suitable
 * ONLY for a single session's own breakdown (`recomputeSession` below);
 * `recomputeSessions`/`recomputeReport` never call this on a multi-session
 * aggregate (Q7) — see their own doc comments.
 */
export function recomputeBreakdown(breakdown: ModelBreakdown, table: PriceTable): Recomputation {
  const models = breakdown.models.map((m) => buildModelRecompute(m, table));
  const excludedModelNames = models.filter((m) => !m.priced).map((m) => m.model);
  const excluded = excludedModelNames.length > 0;

  const scopeListCostMicroUsd = breakdown.costMicroUsd;
  const listCostMicroUsd = excluded ? 0 : scopeListCostMicroUsd;
  const costMicroUsd = excluded ? 0 : models.reduce((sum, m) => sum + m.costMicroUsd, 0);
  const deviationMicroUsd = costMicroUsd - listCostMicroUsd;
  const deviationRatio = listCostMicroUsd === 0 ? null : deviationMicroUsd / listCostMicroUsd;

  const bracketUnavailableModels = excluded ? [] : bracketUnavailableModelsOf(models);
  const bracket = excluded
    ? null
    : scopeBracketOf(models, bracketUnavailableModels, listCostMicroUsd);

  return Object.freeze({
    models: Object.freeze(models),
    costMicroUsd,
    listCostMicroUsd,
    scopeListCostMicroUsd,
    deviationMicroUsd,
    deviationRatio,
    excluded: Object.freeze({
      sessions: excluded ? 1 : 0,
      models: Object.freeze([...new Set(excludedModelNames)].sort()),
      listCostMicroUsd: excluded ? scopeListCostMicroUsd : 0,
    }),
    bracket,
    bracketUnavailableModels: Object.freeze(bracketUnavailableModels),
    webSearchRequests: models.reduce((sum, m) => sum + m.webSearchRequests, 0),
    isEmpty: isEmptyRecomputation(models),
  });
}

export function recomputeSession(session: SessionRow, table: PriceTable): SessionRecomputation {
  const base = recomputeBreakdown(session.models, table);
  return Object.freeze({ ...base, sessionExcluded: base.excluded.sessions > 0 });
}

/**
 * Q7's second half: one model's scope figure is the SUM of that model's
 * per-session figures, never a repricing of the pooled token counts. The two
 * differ by the rounding of `Math.round(tokens * price / 1e6)`: pooling first
 * rounds once for the whole scope, summing rounds once per session. Measured
 * over the whole reference tree the gap is 22 µUSD on the headline figure and
 * 40 µUSD on the bracket — invisible on screen, but it would make a group's
 * own-price figure differ from the sum of the session figures displayed
 * underneath it, which is exactly the arithmetic §2.1 asks a reader to check
 * at a glance. `units`, `costMicroUsd`, `listCostMicroUsd` and the bracket all
 * add up exactly this way.
 */
function sumModelRecomputes(
  model: string,
  parts: readonly ModelRecompute[],
  table: PriceTable,
): ModelRecompute {
  const price = priceOf(table, model);
  const lines: RecomputeLine[] = CATEGORIES.map((category) => {
    const field = CATEGORY_PRICE_FIELD[category];
    let units = 0;
    let amountMicroUsd: number | null = null;
    for (const part of parts) {
      const line = findLine(part.lines, category);
      units += line.units;
      if (line.amountMicroUsd !== null) {
        amountMicroUsd = (amountMicroUsd ?? 0) + line.amountMicroUsd;
      }
    }
    return Object.freeze({
      category,
      units,
      unit: PRICE_FIELD_UNIT[field],
      priceMicroUsd: price ? price[field] : null,
      amountMicroUsd,
    });
  });

  const costMicroUsd = parts.reduce((sum, p) => sum + p.costMicroUsd, 0);
  const listCostMicroUsd = parts.reduce((sum, p) => sum + p.listCostMicroUsd, 0);

  // Q3b: a model loses its scope bracket as soon as ONE session could not
  // state it — substituting the 1 h figure there would not be a lower bound.
  let bracket: CacheBracket | null = null;
  if (parts.every((p) => p.bracket !== null)) {
    const bracketCost = parts.reduce((sum, p) => sum + p.bracket!.costMicroUsd, 0);
    const deviationMicroUsd = bracketCost - listCostMicroUsd;
    bracket = Object.freeze({
      costMicroUsd: bracketCost,
      deviationMicroUsd,
      deviationRatio: listCostMicroUsd === 0 ? null : deviationMicroUsd / listCostMicroUsd,
    });
  }

  return Object.freeze({
    model,
    lines: Object.freeze(lines),
    costMicroUsd,
    listCostMicroUsd,
    // Every part comes from an INCLUDED session, so every part is priced.
    priced: true,
    missingFields: Object.freeze([]),
    bracket,
    webSearchRequests: parts.reduce((sum, p) => sum + p.webSearchRequests, 0),
  });
}

/**
 * Q7, load-bearing: sums the figures of the sessions Q2 actually kept — it
 * NEVER recomputes from an aggregated `ModelBreakdown` (a `GroupRow.models`
 * includes every session in the group, excluded ones too, so pricing that
 * aggregate directly would silently let an excluded session's tokens back
 * into the total). The session is the unit of exclusion, so it is also the
 * unit of summation, down to the rounding (test 14 / control C5, and
 * `sumModelRecomputes` above).
 */
export function recomputeSessions(
  sessions: readonly SessionRow[],
  table: PriceTable,
): Recomputation {
  const included = new Map<string, ModelRecompute[]>();
  let listCostMicroUsd = 0;
  let scopeListCostMicroUsd = 0;
  let excludedSessions = 0;
  let excludedListCostMicroUsd = 0;
  const excludedModelNames = new Set<string>();

  for (const session of sessions) {
    scopeListCostMicroUsd += session.models.costMicroUsd;
    const sessionRecompute = recomputeSession(session, table);
    if (sessionRecompute.sessionExcluded) {
      excludedSessions += 1;
      excludedListCostMicroUsd += session.models.costMicroUsd;
      for (const name of sessionRecompute.excluded.models) {
        excludedModelNames.add(name);
      }
      continue;
    }
    listCostMicroUsd += session.models.costMicroUsd;
    for (const model of sessionRecompute.models) {
      const parts = included.get(model.model);
      if (parts === undefined) {
        included.set(model.model, [model]);
      } else {
        parts.push(model);
      }
    }
  }

  const models = [...included.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([model, parts]) => sumModelRecomputes(model, parts, table));

  const costMicroUsd = models.reduce((sum, m) => sum + m.costMicroUsd, 0);
  const deviationMicroUsd = costMicroUsd - listCostMicroUsd;
  const deviationRatio = listCostMicroUsd === 0 ? null : deviationMicroUsd / listCostMicroUsd;

  const bracketUnavailableModels = bracketUnavailableModelsOf(models);
  const bracket = scopeBracketOf(models, bracketUnavailableModels, listCostMicroUsd);

  return Object.freeze({
    models: Object.freeze(models),
    costMicroUsd,
    listCostMicroUsd,
    scopeListCostMicroUsd,
    deviationMicroUsd,
    deviationRatio,
    excluded: Object.freeze({
      sessions: excludedSessions,
      models: Object.freeze([...excludedModelNames].sort()),
      listCostMicroUsd: excludedListCostMicroUsd,
    }),
    bracket,
    bracketUnavailableModels,
    webSearchRequests: models.reduce((sum, m) => sum + m.webSearchRequests, 0),
    isEmpty: isEmptyRecomputation(models),
  });
}

export function recomputeReport(report: Report, table: PriceTable): ReportRecomputation {
  const bySessionId = new Map<string, SessionRecomputation>();
  for (const session of report.sessions) {
    bySessionId.set(session.sessionId, recomputeSession(session, table));
  }

  const byGroupKey = new Map<string, Recomputation>();
  for (const group of report.projectGroups) {
    byGroupKey.set(group.key, recomputeSessions(group.sessions, table));
  }
  for (const group of report.folderGroups) {
    byGroupKey.set(group.key, recomputeSessions(group.sessions, table));
  }

  const total = recomputeSessions(report.sessions, table);

  return Object.freeze({
    total,
    byGroupKey: Object.freeze(byGroupKey),
    bySessionId: Object.freeze(bySessionId),
  });
}
