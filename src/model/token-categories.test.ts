import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAuditText } from "./audit-parser.js";
import {
  tokenCategories,
  type TokenCategoryKind,
  type TokenCategorySource,
} from "./token-categories.js";
import { COST_DRIVERS_JSONL } from "../../test/fixtures/audit/index.js";

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function source(overrides: Partial<TokenCategorySource> = {}): TokenCategorySource {
  return {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheReadInputTokens: 0,
    ...overrides,
  };
}

describe("tokenCategories", () => {
  it("returns the five base categories in a fixed order", () => {
    const breakdown = tokenCategories(
      source({
        inputTokens: 10,
        outputTokens: 20,
        cacheCreation1hInputTokens: 30,
        cacheCreation5mInputTokens: 40,
        cacheCreationInputTokens: 70,
        cacheReadInputTokens: 50,
      }),
    );
    expect(breakdown.categories.map((c) => c.kind)).toEqual([
      "input",
      "output",
      "cacheWrite1h",
      "cacheWrite5m",
      "cacheRead",
    ]);
  });

  it("shares sum to 1 and exclude thinking tokens from the denominator", () => {
    const breakdown = tokenCategories(
      source({
        inputTokens: 100,
        outputTokens: 200,
        thinkingTokens: 50,
        cacheCreation1hInputTokens: 300,
        cacheCreation5mInputTokens: 0,
        cacheCreationInputTokens: 300,
        cacheReadInputTokens: 400,
      }),
    );
    const shareSum = breakdown.categories.reduce((sum, c) => sum + c.share, 0);
    expect(shareSum).toBeCloseTo(1, 10);
    // Thinking is a subset of output; the total excludes it separately.
    expect(breakdown.totalTokens).toBe(100 + 200 + 300 + 0 + 400);
  });

  it("reports thinking tokens as a subset of output, with a share of output", () => {
    const breakdown = tokenCategories(source({ outputTokens: 1000, thinkingTokens: 250 }));
    expect(breakdown.thinkingTokens).toBe(250);
    expect(breakdown.thinkingShareOfOutput).toBeCloseTo(0.25, 10);
    // Not present among the six-category list at all.
    const kinds: readonly TokenCategoryKind[] = breakdown.categories.map((c) => c.kind);
    expect(kinds).not.toContain("thinking" as never);
  });

  it("adds a cacheWriteOther category only when 1h + 5m falls short of the total", () => {
    const breakdown = tokenCategories(
      source({
        cacheCreationInputTokens: 1000,
        cacheCreation1hInputTokens: 600,
        cacheCreation5mInputTokens: 200,
      }),
    );
    const other = breakdown.categories.find((c) => c.kind === "cacheWriteOther");
    expect(other).toBeDefined();
    expect(other?.tokens).toBe(200);
  });

  it("omits cacheWriteOther when the ephemeral split is exact", () => {
    const breakdown = tokenCategories(
      source({
        cacheCreationInputTokens: 800,
        cacheCreation1hInputTokens: 600,
        cacheCreation5mInputTokens: 200,
      }),
    );
    expect(breakdown.categories.find((c) => c.kind === "cacheWriteOther")).toBeUndefined();
  });

  it("clamps a negative cache-write remainder to zero", () => {
    const breakdown = tokenCategories(
      source({
        cacheCreationInputTokens: 100,
        cacheCreation1hInputTokens: 90,
        cacheCreation5mInputTokens: 90,
      }),
    );
    expect(breakdown.categories.find((c) => c.kind === "cacheWriteOther")).toBeUndefined();
    // The clamp never produces a negative total either.
    expect(breakdown.totalTokens).toBeGreaterThanOrEqual(0);
  });

  it("returns a zero total and zero shares for a session with no tokens", () => {
    const breakdown = tokenCategories(source());
    expect(breakdown.totalTokens).toBe(0);
    for (const category of breakdown.categories) {
      expect(category.share).toBe(0);
    }
    expect(breakdown.thinkingShareOfOutput).toBe(0);
  });

  it("accepts a per-request TokenUsage and a session TokenTotals alike", () => {
    // TokenUsage and TokenTotals both satisfy TokenCategorySource structurally —
    // this is a compile-time check exercised at runtime with the same shape.
    const usageShaped: TokenCategorySource = {
      inputTokens: 1,
      outputTokens: 2,
      thinkingTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreation1hInputTokens: 0,
      cacheCreation5mInputTokens: 0,
    };
    expect(tokenCategories(usageShaped).totalTokens).toBe(3);
  });

  it('exposes no "thinking" TokenCategoryKind', () => {
    const breakdown = tokenCategories(source({ thinkingTokens: 999, outputTokens: 1000 }));
    expect(breakdown.categories.some((c) => c.kind === ("thinking" as TokenCategoryKind))).toBe(
      false,
    );
  });
});

/**
 * S11 plan §0.3: the parser is the step that populates `TokenUsage` from raw
 * JSON — a hand-filled `TokenUsage` literal would not exercise field
 * extraction (`output_tokens_details.thinking_tokens`, `cache_creation.
 * ephemeral_1h_input_tokens`, etc). These tests run `tokenCategories` over
 * `RequestRecord.usage` produced by `parseAuditText` on the synthetic
 * `cost-drivers.jsonl` fixture (S11 plan §5), never a hand-built object.
 */
describe("tokenCategories over parseAuditText(cost-drivers.jsonl)", () => {
  const session = parseAuditText("cd000001", readText(COST_DRIVERS_JSONL));

  it("extracts mutually distinct category values from the first (fully-populated) request", () => {
    const breakdown = tokenCategories(session.requests[0]!.usage);
    const byKind = new Map(breakdown.categories.map((c) => [c.kind, c.tokens]));
    expect(byKind.get("input")).toBe(1111);
    expect(byKind.get("output")).toBe(8000);
    expect(byKind.get("cacheWrite1h")).toBe(3000);
    expect(byKind.get("cacheWrite5m")).toBe(700);
    expect(byKind.get("cacheRead")).toBe(9999);
    // Thinking strictly between 0 and output: catches both "sixth sibling"
    // (shares > 100%) and "subtracted from output" (output row too small).
    expect(breakdown.thinkingTokens).toBe(2500);
    expect(breakdown.thinkingTokens).toBeGreaterThan(0);
    expect(breakdown.thinkingTokens).toBeLessThan(8000);
    expect(byKind.get("cacheWriteOther")).toBeUndefined();
  });

  it("surfaces a cacheWriteOther remainder from the second request's real ephemeral split", () => {
    const breakdown = tokenCategories(session.requests[1]!.usage);
    const other = breakdown.categories.find((c) => c.kind === "cacheWriteOther");
    expect(other?.tokens).toBe(1000); // 5000 - 3000 - 1000
    expect(session.requests[1]!.usage.webSearchRequests).toBe(2);
    expect(session.requests[1]!.usage.webFetchRequests).toBe(1);
    expect(session.requests[1]!.isError).toBe(true);
    expect(session.requests[1]!.subagents?.spawned).toBe(2);
  });

  it("omits cacheWriteOther for the third request's exact ephemeral split, with zero server tools and no subagents", () => {
    const breakdown = tokenCategories(session.requests[2]!.usage);
    expect(breakdown.categories.find((c) => c.kind === "cacheWriteOther")).toBeUndefined();
    expect(session.requests[2]!.usage.webSearchRequests).toBe(0);
    expect(session.requests[2]!.usage.webFetchRequests).toBe(0);
    expect(session.requests[2]!.subagents).toBeNull();
  });

  it("the fourth request has no timestamp, and a fifth is aborted (started with no result)", () => {
    expect(session.requests[3]!.timestamp).toBeNull();
    expect(session.requests).toHaveLength(4);
    expect(session.openRequests).toBe(1);
  });
});
