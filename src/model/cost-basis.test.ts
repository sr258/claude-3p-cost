import { describe, expect, it } from "vitest";
import { MAX_DISTINCT_VALUES, MAX_VALUE_LENGTH, summarizeCostBasis } from "./cost-basis.js";
import type { ModelUsageRecord, RequestRecord } from "./audit-types.js";
import type { SessionRow } from "./report-types.js";

function modelUsage(overrides: Partial<ModelUsageRecord> = {}): ModelUsageRecord {
  return {
    model: "claude-opus-5",
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    provider: "foundry",
    costBasis: "list",
    contextWindow: null,
    ...overrides,
  };
}

function request(models: readonly ModelUsageRecord[]): RequestRecord {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    costMicroUsd: 0,
    durationMs: 0,
    durationApiMs: 0,
    numTurns: 1,
    isError: false,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreation1hInputTokens: 0,
      cacheCreation5mInputTokens: 0,
      webSearchRequests: 0,
      webFetchRequests: 0,
    },
    models,
    subagents: null,
  };
}

function session(requests: readonly RequestRecord[]): SessionRow {
  return {
    sessionId: "abc123",
    sourceId: "abc123",
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
      costMicroUsd: 0,
      requests: requests.length,
      errorRequests: 0,
      numTurns: 0,
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
    models: { models: [], costMicroUsd: 0 },
    requests,
    toolUses: [],
    excludedRequests: 0,
    isPartial: false,
  };
}

describe("summarizeCostBasis", () => {
  it("collects distinct provider and costBasis values in code-unit order", () => {
    const sessions = [
      session([
        request([
          modelUsage({ provider: "zeta", costBasis: "negotiated" }),
          modelUsage({ provider: "alpha", costBasis: "list" }),
        ]),
      ]),
    ];
    const summary = summarizeCostBasis(sessions);
    expect(summary.providers).toEqual(["alpha", "zeta"]);
    expect(summary.costBases).toEqual(["list", "negotiated"]);
    expect(summary.entries).toBe(2);
  });

  it("counts entries with no costBasis rather than defaulting them to list", () => {
    const sessions = [
      session([request([modelUsage({ costBasis: null }), modelUsage({ costBasis: "list" })])]),
    ];
    const summary = summarizeCostBasis(sessions);
    expect(summary.unstatedCostBasisEntries).toBe(1);
    expect(summary.costBases).toEqual(["list"]);
    expect(summary.entries).toBe(2);
  });

  it("caps distinct values and value length and reports truncation", () => {
    const many = Array.from({ length: MAX_DISTINCT_VALUES + 3 }, (_, i) =>
      modelUsage({ provider: `provider-${String(i).padStart(2, "0")}` }),
    );
    const longName = "x".repeat(MAX_VALUE_LENGTH + 10);
    const sessions = [session([request([...many, modelUsage({ provider: longName })])])];
    const summary = summarizeCostBasis(sessions);
    expect(summary.providers.length).toBe(MAX_DISTINCT_VALUES);
    expect(summary.truncated).toBe(true);
    for (const value of summary.providers) {
      expect(value.length).toBeLessThanOrEqual(MAX_VALUE_LENGTH);
    }
  });
});
