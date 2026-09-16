import { describe, expect, it } from "vitest";
import type { ModelUsageRecord, RequestRecord } from "./audit-types.js";
import { createModelAccumulator, createTotalsAccumulator } from "./totals.js";

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
};

function makeModel(overrides: Partial<ModelUsageRecord> = {}): ModelUsageRecord {
  return {
    model: "claude-sonnet-5",
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    provider: "foundry",
    costBasis: "list",
    contextWindow: 200_000,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    costMicroUsd: 0,
    durationMs: 0,
    durationApiMs: 0,
    numTurns: 0,
    isError: false,
    usage: { ...EMPTY_USAGE },
    models: [],
    subagents: null,
    ...overrides,
  };
}

describe("createTotalsAccumulator", () => {
  it("an empty accumulator is all zeroes", () => {
    const acc = createTotalsAccumulator();
    expect(acc.value.costMicroUsd).toBe(0);
    expect(acc.value.requests).toBe(0);
    expect(acc.value.tokens.inputTokens).toBe(0);
  });

  it("costs accumulate as exact integers where the float sum would drift", () => {
    // 0.1 + 0.2 !== 0.3 in float; in integer micro-USD it is exact.
    const acc = createTotalsAccumulator();
    acc.add(makeRequest({ costMicroUsd: 100_000 }));
    acc.add(makeRequest({ costMicroUsd: 200_000 }));
    expect(acc.value.costMicroUsd).toBe(300_000);
  });

  it("output tokens come from the result usage block only", () => {
    const acc = createTotalsAccumulator();
    acc.add(makeRequest({ usage: { ...EMPTY_USAGE, outputTokens: 152_004 } }));
    expect(acc.value.tokens.outputTokens).toBe(152_004);
  });

  it("error requests are counted separately but still contribute cost", () => {
    const acc = createTotalsAccumulator();
    acc.add(makeRequest({ isError: true, costMicroUsd: 50_000 }));
    expect(acc.value.errorRequests).toBe(1);
    expect(acc.value.requests).toBe(1);
    expect(acc.value.costMicroUsd).toBe(50_000);
  });

  it("merge is equivalent to adding the same requests", () => {
    const requests = [
      makeRequest({ costMicroUsd: 10_000, durationMs: 100 }),
      makeRequest({ costMicroUsd: 20_000, durationMs: 200, isError: true }),
    ];

    const direct = createTotalsAccumulator();
    for (const r of requests) direct.add(r);

    const perRequest = requests.map((r) => {
      const acc = createTotalsAccumulator();
      acc.add(r);
      return acc.value;
    });
    const merged = createTotalsAccumulator();
    for (const subtotal of perRequest) merged.merge(subtotal);

    expect(merged.value).toEqual(direct.value);
  });
});

describe("createModelAccumulator", () => {
  it("model variants claude-opus-5 and claude-opus-5[1m] stay separate rows", () => {
    const acc = createModelAccumulator();
    acc.add(
      makeRequest({
        models: [
          makeModel({ model: "claude-opus-5", costMicroUsd: 10_000 }),
          makeModel({ model: "claude-opus-5[1m]", costMicroUsd: 20_000 }),
        ],
      }),
    );
    expect(acc.value.models.map((m) => m.model)).toEqual(["claude-opus-5[1m]", "claude-opus-5"]);
  });

  it("models are sorted by cost descending with the model name as tie-break", () => {
    const acc = createModelAccumulator();
    acc.add(
      makeRequest({
        models: [
          makeModel({ model: "claude-sonnet-5", costMicroUsd: 5_000 }),
          makeModel({ model: "claude-opus-5", costMicroUsd: 5_000 }),
          makeModel({ model: "claude-haiku-4-5", costMicroUsd: 9_000 }),
        ],
      }),
    );
    expect(acc.value.models.map((m) => m.model)).toEqual([
      "claude-haiku-4-5",
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
  });

  it("the model breakdown total is independent of the authoritative cost total", () => {
    const totalsAcc = createTotalsAccumulator();
    const modelAcc = createModelAccumulator();
    // The authoritative cost (total_cost_usd) and the modelUsage sum deliberately
    // disagree here, as they can in the real data (S5 plan §2 Q5).
    const request = makeRequest({
      costMicroUsd: 100_000,
      models: [makeModel({ model: "claude-sonnet-5", costMicroUsd: 90_000 })],
    });
    totalsAcc.add(request);
    modelAcc.add(request);
    expect(totalsAcc.value.costMicroUsd).toBe(100_000);
    expect(modelAcc.value.costMicroUsd).toBe(90_000);
  });

  it("an empty accumulator is all zeroes", () => {
    const acc = createModelAccumulator();
    expect(acc.value.models).toEqual([]);
    expect(acc.value.costMicroUsd).toBe(0);
  });
});
