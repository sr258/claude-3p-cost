/**
 * The `CostTotals` and `ModelBreakdown` accumulators (S5 plan §4.5). Every
 * field is an integer; no `/ 1e6`, `toFixed` or per-request `Math.round` on a
 * cost anywhere in this file — see plan §2 Q9 and §6.
 */
import type { RequestRecord } from "./audit-types.js";
import type { CostTotals, ModelBreakdown, ModelTotal, TokenTotals } from "./report-types.js";

const EMPTY_TOKEN_TOTALS: TokenTotals = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheCreationInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  cacheReadInputTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
});

/** All-zero totals. Used for the empty report and as a merge identity. */
export const EMPTY_TOTALS: CostTotals = Object.freeze({
  costMicroUsd: 0,
  requests: 0,
  errorRequests: 0,
  numTurns: 0,
  durationMs: 0,
  durationApiMs: 0,
  subagentsSpawned: 0,
  tokens: EMPTY_TOKEN_TOTALS,
});

export const EMPTY_MODEL_BREAKDOWN: ModelBreakdown = Object.freeze({
  models: Object.freeze([]),
  costMicroUsd: 0,
});

export interface TotalsAccumulator {
  add(request: RequestRecord): void;
  /** Fold an already-computed subtotal in. Used when rolling sessions into groups. */
  merge(other: CostTotals): void;
  /** A frozen snapshot. Safe to read repeatedly. */
  readonly value: CostTotals;
}

export function createTotalsAccumulator(): TotalsAccumulator {
  let costMicroUsd = 0;
  let requests = 0;
  let errorRequests = 0;
  let numTurns = 0;
  let durationMs = 0;
  let durationApiMs = 0;
  let subagentsSpawned = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  let cacheCreationInputTokens = 0;
  let cacheCreation1hInputTokens = 0;
  let cacheCreation5mInputTokens = 0;
  let cacheReadInputTokens = 0;
  let webSearchRequests = 0;
  let webFetchRequests = 0;

  return {
    add(request: RequestRecord): void {
      costMicroUsd += request.costMicroUsd;
      requests += 1;
      if (request.isError) {
        errorRequests += 1;
      }
      numTurns += request.numTurns;
      durationMs += request.durationMs;
      durationApiMs += request.durationApiMs;
      if (request.subagents !== null) {
        subagentsSpawned += request.subagents.spawned;
      }
      inputTokens += request.usage.inputTokens;
      outputTokens += request.usage.outputTokens;
      thinkingTokens += request.usage.thinkingTokens;
      cacheCreationInputTokens += request.usage.cacheCreationInputTokens;
      cacheCreation1hInputTokens += request.usage.cacheCreation1hInputTokens;
      cacheCreation5mInputTokens += request.usage.cacheCreation5mInputTokens;
      cacheReadInputTokens += request.usage.cacheReadInputTokens;
      webSearchRequests += request.usage.webSearchRequests;
      webFetchRequests += request.usage.webFetchRequests;
    },
    merge(other: CostTotals): void {
      costMicroUsd += other.costMicroUsd;
      requests += other.requests;
      errorRequests += other.errorRequests;
      numTurns += other.numTurns;
      durationMs += other.durationMs;
      durationApiMs += other.durationApiMs;
      subagentsSpawned += other.subagentsSpawned;
      inputTokens += other.tokens.inputTokens;
      outputTokens += other.tokens.outputTokens;
      thinkingTokens += other.tokens.thinkingTokens;
      cacheCreationInputTokens += other.tokens.cacheCreationInputTokens;
      cacheCreation1hInputTokens += other.tokens.cacheCreation1hInputTokens;
      cacheCreation5mInputTokens += other.tokens.cacheCreation5mInputTokens;
      cacheReadInputTokens += other.tokens.cacheReadInputTokens;
      webSearchRequests += other.tokens.webSearchRequests;
      webFetchRequests += other.tokens.webFetchRequests;
    },
    get value(): CostTotals {
      return Object.freeze({
        costMicroUsd,
        requests,
        errorRequests,
        numTurns,
        durationMs,
        durationApiMs,
        subagentsSpawned,
        tokens: Object.freeze({
          inputTokens,
          outputTokens,
          thinkingTokens,
          cacheCreationInputTokens,
          cacheCreation1hInputTokens,
          cacheCreation5mInputTokens,
          cacheReadInputTokens,
          webSearchRequests,
          webFetchRequests,
        }),
      });
    },
  };
}

export interface ModelAccumulator {
  add(request: RequestRecord): void;
  merge(other: ModelBreakdown): void;
  /** Frozen; `models` sorted cost desc, then model name asc. */
  readonly value: ModelBreakdown;
}

interface MutableModelTotal {
  model: string;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  requests: number;
}

function sortModelTotals(models: readonly MutableModelTotal[]): readonly ModelTotal[] {
  return Object.freeze(
    [...models]
      // Code-unit comparison, not `localeCompare`: the model layer may not
      // reach for host-locale collation (that is why S9 injects a collator for
      // title sorting), and a locale-dependent order would not be stable
      // across machines.
      .sort(
        (a, b) =>
          b.costMicroUsd - a.costMicroUsd || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0),
      )
      .map((m) => Object.freeze({ ...m })),
  );
}

export function createModelAccumulator(): ModelAccumulator {
  const byModel = new Map<string, MutableModelTotal>();
  let costMicroUsd = 0;

  function entryFor(model: string): MutableModelTotal {
    let entry = byModel.get(model);
    if (entry === undefined) {
      entry = {
        model,
        costMicroUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        requests: 0,
      };
      byModel.set(model, entry);
    }
    return entry;
  }

  return {
    add(request: RequestRecord): void {
      for (const modelUsage of request.models) {
        const entry = entryFor(modelUsage.model);
        entry.costMicroUsd += modelUsage.costMicroUsd;
        entry.inputTokens += modelUsage.inputTokens;
        entry.outputTokens += modelUsage.outputTokens;
        entry.cacheReadInputTokens += modelUsage.cacheReadInputTokens;
        entry.cacheCreationInputTokens += modelUsage.cacheCreationInputTokens;
        entry.webSearchRequests += modelUsage.webSearchRequests;
        entry.requests += 1;
        costMicroUsd += modelUsage.costMicroUsd;
      }
    },
    merge(other: ModelBreakdown): void {
      for (const model of other.models) {
        const entry = entryFor(model.model);
        entry.costMicroUsd += model.costMicroUsd;
        entry.inputTokens += model.inputTokens;
        entry.outputTokens += model.outputTokens;
        entry.cacheReadInputTokens += model.cacheReadInputTokens;
        entry.cacheCreationInputTokens += model.cacheCreationInputTokens;
        entry.webSearchRequests += model.webSearchRequests;
        entry.requests += model.requests;
      }
      costMicroUsd += other.costMicroUsd;
    },
    get value(): ModelBreakdown {
      return Object.freeze({
        models: sortModelTotals([...byModel.values()]),
        costMicroUsd,
      });
    },
  };
}
