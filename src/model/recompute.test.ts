import { describe, expect, it } from "vitest";
import {
  CATEGORY_PRICE_FIELD,
  recomputeBreakdown,
  recomputeReport,
  recomputeSession,
  recomputeSessions,
  type RecomputeCategory,
} from "./recompute.js";
import type { ModelPrice, PriceTable } from "./prices.js";
import type { ModelBreakdown, ModelTotal, Report, SessionRow } from "./report-types.js";
import type { RequestRecord } from "./audit-types.js";
import { ALL_TIME } from "./date-range.js";

function price(fields: Partial<ModelPrice> = {}): ModelPrice {
  return {
    input: 5_000_000,
    output: 25_000_000,
    cacheWrite5m: 6_250_000,
    cacheWrite1h: 10_000_000,
    cacheRead: 500_000,
    webSearch: 10_000,
    ...fields,
  };
}

function table(entries: Readonly<Record<string, ModelPrice>>): PriceTable {
  return new Map(Object.entries(entries));
}

function modelTotal(overrides: Partial<ModelTotal> = {}): ModelTotal {
  return {
    model: "model-a",
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    requests: 1,
    ...overrides,
  };
}

function breakdown(models: readonly ModelTotal[]): ModelBreakdown {
  return {
    models,
    costMicroUsd: models.reduce((sum, m) => sum + m.costMicroUsd, 0),
  };
}

function sessionRow(
  models: readonly ModelTotal[],
  overrides: Partial<SessionRow> = {},
): SessionRow {
  const models_ = breakdown(models);
  return {
    sessionId: overrides.sessionId ?? "session-1",
    sourceId: overrides.sourceId ?? "session-1",
    title: "",
    hasManifest: false,
    isArchived: false,
    isStarred: false,
    project: { kind: "none" },
    folder: { kind: "none" },
    model: null,
    openRequests: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    lastActivityAt: null,
    totals: {
      costMicroUsd: models_.costMicroUsd,
      requests: 1,
      errorRequests: 0,
      numTurns: 1,
      durationMs: 0,
      durationApiMs: 0,
      subagentsSpawned: 0,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheCreationInputTokens: 0,
        cacheCreation1hInputTokens: 0,
        cacheCreation5mInputTokens: 0,
        cacheReadInputTokens: 0,
        webSearchRequests: 0,
        webFetchRequests: 0,
      },
    },
    models: models_,
    requests: [] as readonly RequestRecord[],
    toolUses: [],
    excludedRequests: 0,
    isPartial: false,
    ...overrides,
  };
}

describe("recomputeSession / recomputeBreakdown", () => {
  it("prices from modelUsage token counts, never from the result line usage block", () => {
    // `usage` (session.totals.tokens) and `modelUsage` (session.models)
    // deliberately disagree by a large factor — a wrong implementation
    // reading `totals.tokens` produces a visibly different total (plan
    // §0.1). Only `session.models` may be read.
    const model = modelTotal({ inputTokens: 1_000_000, costMicroUsd: 5_000_000 });
    const session = sessionRow([model]);
    // Poison the usage block with a wildly different input token count.
    const poisoned: SessionRow = {
      ...session,
      totals: {
        ...session.totals,
        tokens: { ...session.totals.tokens, inputTokens: 397 },
      },
    };
    const t = table({ "model-a": price() });
    const result = recomputeSession(poisoned, t);
    // 1_000_000 tokens * 5_000_000 microUSD/Mtok / 1e6 = 5_000_000 microUSD.
    expect(result.costMicroUsd).toBe(5_000_000);
  });

  it("computes the deviation against the list cost of the included sessions only", () => {
    // model-a's OWN price (5_000_000/Mtok) differs from its LOGGED list cost
    // (4_000_000 for the same 1M tokens) — a non-zero deviation, deliberately,
    // so a denominator swap is visible in the RATIO even though the excluded
    // session contributes nothing to the numerator either way (LEARNINGS: a
    // self-agreeing fixture where the numerator is 0 cannot distinguish the
    // two denominators at all).
    const includedModel = modelTotal({
      model: "model-a",
      inputTokens: 1_000_000,
      costMicroUsd: 4_000_000,
    });
    const excludedModel = modelTotal({
      model: "model-b",
      inputTokens: 1_000_000,
      costMicroUsd: 50_000_000, // large, so a wrong denominator is visibly different
    });
    const includedSession = sessionRow([includedModel], { sessionId: "s1" });
    const excludedSession = sessionRow([excludedModel], { sessionId: "s2" });
    // model-a is fully priced; model-b has no price at all.
    const t = table({ "model-a": price() });

    const result = recomputeSessions([includedSession, excludedSession], t);

    expect(result.listCostMicroUsd).toBe(4_000_000);
    expect(result.scopeListCostMicroUsd).toBe(54_000_000);
    // costMicroUsd for model-a: 1_000_000 * 5_000_000 / 1e6 = 5_000_000.
    // deviationMicroUsd = 5_000_000 - 4_000_000 = 1_000_000.
    // Against the included-only base: 1_000_000 / 4_000_000 = 0.25.
    // Against the full-scope base it would be 1_000_000 / 54_000_000 ≈ 0.0185
    // — visibly different, which is what makes this a real control.
    expect(result.deviationMicroUsd).toBe(1_000_000);
    expect(result.deviationRatio).toBeCloseTo(0.25, 10);
  });

  it("uses the exact variant key and never falls back to the base model", () => {
    const base = modelTotal({ model: "model-a", inputTokens: 1_000_000, costMicroUsd: 1_000 });
    const variant = modelTotal({
      model: "model-a[1m]",
      inputTokens: 1_000_000,
      costMicroUsd: 1_000,
    });
    const t = table({
      "model-a": price({ input: 1_000_000 }),
      "model-a[1m]": price({ input: 9_000_000 }),
    });
    const result = recomputeBreakdown(breakdown([base, variant]), t);
    const baseResult = result.models.find((m) => m.model === "model-a")!;
    const variantResult = result.models.find((m) => m.model === "model-a[1m]")!;
    expect(baseResult.lines.find((l) => l.category === "input")!.priceMicroUsd).toBe(1_000_000);
    expect(variantResult.lines.find((l) => l.category === "input")!.priceMicroUsd).toBe(9_000_000);
  });

  it("excludes a whole session when one model lacks a price for a category with non-zero tokens", () => {
    const priced = modelTotal({ model: "model-a", inputTokens: 100, costMicroUsd: 1 });
    const unpriced = modelTotal({ model: "model-b", inputTokens: 100, costMicroUsd: 1 });
    const t = table({ "model-a": price() });
    const result = recomputeBreakdown(breakdown([priced, unpriced]), t);
    expect(result.excluded.sessions).toBe(1);
    expect(result.costMicroUsd).toBe(0);
  });

  it("keeps a session whose null price belongs to a zero-token category", () => {
    const model = modelTotal({
      model: "model-a",
      inputTokens: 1_000_000,
      outputTokens: 0,
      costMicroUsd: 5_000_000,
    });
    // output price missing, but outputTokens is 0 -> must not exclude.
    const t = table({ "model-a": price({ output: null }) });
    const result = recomputeBreakdown(breakdown([model]), t);
    expect(result.excluded.sessions).toBe(0);
    expect(result.costMicroUsd).toBe(5_000_000);
  });

  it("reports the excluded session count, the affected model keys and their logged list cost", () => {
    const unpriced = modelTotal({ model: "model-x", inputTokens: 10, costMicroUsd: 12_000 });
    const session = sessionRow([unpriced], { sessionId: "s1" });
    const result = recomputeSessions([session], table({}));
    expect(result.excluded.sessions).toBe(1);
    expect(result.excluded.models).toEqual(["model-x"]);
    expect(result.excluded.listCostMicroUsd).toBe(12_000);
  });

  it("treats a model absent from the price table as unknown, never as zero", () => {
    const model = modelTotal({ model: "not-in-table", inputTokens: 10, costMicroUsd: 5 });
    const result = recomputeBreakdown(breakdown([model]), table({}));
    const line = result.models[0]!.lines.find((l) => l.category === "input")!;
    expect(line.priceMicroUsd).toBeNull();
    expect(line.amountMicroUsd).toBeNull();
  });

  it("returns a null amount, never zero, for an unknown price", () => {
    const model = modelTotal({ model: "model-a", inputTokens: 100, costMicroUsd: 1 });
    const t = table({ "model-a": price({ input: null }) });
    const result = recomputeBreakdown(breakdown([model]), t);
    const line = result.models[0]!.lines.find((l) => l.category === "input")!;
    expect(line.amountMicroUsd).toBeNull();
    expect(line.amountMicroUsd).not.toBe(0);
  });

  it("prices aggregate cache-creation tokens with cacheWrite1h", () => {
    const model = modelTotal({
      model: "model-a",
      cacheCreationInputTokens: 1_000_000,
      costMicroUsd: 10_000_000,
    });
    // 5m and 1h set far apart so reading the wrong field is visible.
    const t = table({ "model-a": price({ cacheWrite5m: 1_000_000, cacheWrite1h: 20_000_000 }) });
    const result = recomputeBreakdown(breakdown([model]), t);
    const line = result.models[0]!.lines.find((l) => l.category === "cacheWrite")!;
    expect(line.priceMicroUsd).toBe(20_000_000);
    expect(line.amountMicroUsd).toBe(20_000_000); // 1_000_000 tok * 20_000_000 / 1e6
  });

  it("prices web search per request and never divides it by a million", () => {
    const model = modelTotal({ model: "model-a", webSearchRequests: 12, costMicroUsd: 120_000 });
    const t = table({ "model-a": price({ webSearch: 10_000 }) });
    const result = recomputeBreakdown(breakdown([model]), t);
    const line = result.models[0]!.lines.find((l) => l.category === "webSearch")!;
    expect(line.amountMicroUsd).toBe(120_000); // 12 * 10_000, NOT 12*10_000/1e6
  });

  it("a missing cacheWrite5m hides the bracket and does not exclude the session", () => {
    const model = modelTotal({
      model: "model-a",
      cacheCreationInputTokens: 1_000_000,
      costMicroUsd: 10_000_000,
    });
    const t = table({ "model-a": price({ cacheWrite5m: null }) });
    const session = sessionRow([model]);
    const result = recomputeSession(session, t);
    expect(result.sessionExcluded).toBe(false);
    expect(result.costMicroUsd).toBeGreaterThan(0);
    expect(result.bracket).toBeNull();
    expect(result.bracketUnavailableModels).toEqual(["model-a"]);
  });

  it("suppresses the scope bracket when any included cache-using model lacks a 5m price", () => {
    const withBracket = modelTotal({
      model: "model-a",
      cacheCreationInputTokens: 1_000,
      costMicroUsd: 10_000,
    });
    const withoutBracket = modelTotal({
      model: "model-b",
      cacheCreationInputTokens: 1_000,
      costMicroUsd: 10_000,
    });
    const t = table({
      "model-a": price(),
      "model-b": price({ cacheWrite5m: null }),
    });
    const session = sessionRow([withBracket, withoutBracket]);
    const result = recomputeSessions([session], t);
    expect(result.bracket).toBeNull();
    expect(result.bracketUnavailableModels).toEqual(["model-b"]);
  });

  it("excludes a session with web-search requests when the webSearch price is null, and keeps one with zero web-search requests", () => {
    const t = table({ "model-a": price({ webSearch: null }) });
    const withSearch = sessionRow(
      [modelTotal({ model: "model-a", webSearchRequests: 3, costMicroUsd: 1 })],
      { sessionId: "s-search" },
    );
    const withoutSearch = sessionRow(
      [modelTotal({ model: "model-a", webSearchRequests: 0, costMicroUsd: 1 })],
      { sessionId: "s-no-search" },
    );
    expect(recomputeSession(withSearch, t).sessionExcluded).toBe(true);
    expect(recomputeSession(withoutSearch, t).sessionExcluded).toBe(false);
  });

  it("a group figure is the sum of its included sessions, not a recompute of the group breakdown", () => {
    const includedModel = modelTotal({
      model: "model-a",
      inputTokens: 1_000_000,
      costMicroUsd: 5_000_000,
    });
    const excludedModel = modelTotal({
      model: "model-a",
      inputTokens: 1_000_000,
      costMicroUsd: 5_000_000,
    });
    const unpricedInExcluded = modelTotal({
      model: "model-b",
      inputTokens: 10,
      costMicroUsd: 1,
    });
    const includedSession = sessionRow([includedModel], { sessionId: "s1" });
    const excludedSession = sessionRow([excludedModel, unpricedInExcluded], { sessionId: "s2" });
    const t = table({ "model-a": price() });

    const result = recomputeSessions([includedSession, excludedSession], t);
    // If this wrongly recomputed from the AGGREGATE breakdown (model-a's
    // tokens summed across BOTH sessions plus model-b), the result would
    // differ: model-b would drag the whole aggregate into exclusion (cost 0)
    // even though session 1 is perfectly priced.
    expect(result.costMicroUsd).toBe(5_000_000);
    expect(result.excluded.sessions).toBe(1);
  });

  it("sums the included sessions' own figures, down to the per-session rounding", () => {
    // Q7 says the session is the unit of summation, not merely the unit of
    // exclusion. Built so the two orderings give DIFFERENT numbers: at 1
    // microUSD/Mtok, 500_000 tokens costs `Math.round(0.5)` = 1 per session,
    // so two sessions cost 2 — while pooling their tokens first gives
    // `Math.round(1_000_000 * 1 / 1e6)` = 1. On the reference tree the same
    // difference is worth 22 microUSD (plan §5.8).
    const t = table({ "model-a": price({ input: 1, cacheWrite5m: 1 }) });
    const half = () => modelTotal({ model: "model-a", inputTokens: 500_000, costMicroUsd: 0 });
    const s1 = sessionRow([half()], { sessionId: "s1" });
    const s2 = sessionRow([half()], { sessionId: "s2" });

    const result = recomputeSessions([s1, s2], t);
    expect(recomputeSession(s1, t).costMicroUsd).toBe(1);
    expect(result.costMicroUsd).toBe(2);
    expect(result.models[0]!.costMicroUsd).toBe(2);
    // The units still aggregate, so the panel's "tokens x price" line is
    // the scope's real token count even though the amount is a sum.
    expect(result.models[0]!.lines.find((l) => l.category === "input")!.units).toBe(1_000_000);
  });

  it("reports a null deviation ratio, not Infinity, when the included list cost is zero", () => {
    const model = modelTotal({ model: "model-a", inputTokens: 0, costMicroUsd: 0 });
    const session = sessionRow([model]);
    const result = recomputeSessions([session], table({ "model-a": price() }));
    expect(result.deviationRatio).toBeNull();
    expect(Number.isFinite(result.deviationMicroUsd)).toBe(true);
  });

  it("stays empty and finite when every price is unknown", () => {
    const model = modelTotal({ model: "model-a", inputTokens: 100, costMicroUsd: 500 });
    const session = sessionRow([model]);
    const result = recomputeSessions([session], table({}));
    expect(result.isEmpty).toBe(true);
    expect(Number.isFinite(result.costMicroUsd)).toBe(true);
    expect(Number.isNaN(result.costMicroUsd)).toBe(false);
  });

  it("emits only integer micro-USD amounts", () => {
    const model = modelTotal({
      model: "model-a",
      inputTokens: 1_234_567,
      outputTokens: 987,
      cacheCreationInputTokens: 333,
      cacheReadInputTokens: 999_999,
      webSearchRequests: 7,
      costMicroUsd: 123_456,
    });
    const result = recomputeBreakdown(breakdown([model]), table({ "model-a": price() }));
    for (const line of result.models[0]!.lines) {
      if (line.amountMicroUsd !== null) {
        expect(Number.isInteger(line.amountMicroUsd)).toBe(true);
      }
    }
    expect(Number.isInteger(result.costMicroUsd)).toBe(true);
  });
});

describe("recomputeReport", () => {
  it("builds a per-session and per-group map without touching sessions outside their own scope", () => {
    const model = modelTotal({ model: "model-a", inputTokens: 100, costMicroUsd: 500 });
    const session = sessionRow([model], { sessionId: "s1" });
    const projectGroup = {
      key: "project-key",
      label: { kind: "project" as const, project: { kind: "none" as const } },
      sessions: [session],
      sessionCount: 1,
      totals: session.totals,
      models: session.models,
      partialSessions: 0,
    };
    const folderGroup = {
      ...projectGroup,
      key: "folder-key",
      label: { kind: "folder" as const, folder: { kind: "none" as const } },
    };
    const report: Report = {
      sessions: [session],
      projectGroups: [projectGroup],
      folderGroups: [folderGroup],
      totals: session.totals,
      models: session.models,
      byDay: [],
      byMonth: [],
      undated: { requests: 0, costMicroUsd: 0 },
      gaps: {
        sessionsWithoutManifest: 0,
        costMicroUsdWithoutManifest: 0,
        openRequests: 0,
        archivedSessions: 0,
      },
      problems: [],
      range: ALL_TIME,
      excluded: { sessions: 0, requests: 0, costMicroUsd: 0, undatedRequests: 0 },
    };

    const result = recomputeReport(report, table({ "model-a": price() }));
    expect(result.bySessionId.size).toBe(1);
    expect(result.bySessionId.get("s1")?.costMicroUsd).toBe(500);
    expect(result.byGroupKey.get("project-key")?.costMicroUsd).toBe(500);
    expect(result.byGroupKey.get("folder-key")?.costMicroUsd).toBe(500);
  });
});

/** Sanity check that CATEGORY_PRICE_FIELD never maps to cacheWrite5m. */
describe("CATEGORY_PRICE_FIELD", () => {
  it("never reads cacheWrite5m for the headline figure", () => {
    const fields = Object.values(CATEGORY_PRICE_FIELD) as readonly string[];
    expect(fields).not.toContain("cacheWrite5m");
  });

  it("covers exactly the five recompute categories", () => {
    const categories = Object.keys(CATEGORY_PRICE_FIELD) as RecomputeCategory[];
    expect([...categories].sort()).toEqual(
      ["cacheRead", "cacheWrite", "input", "output", "webSearch"].sort(),
    );
  });
});
