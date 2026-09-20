/**
 * US-3.1's token-category breakdown (S11 plan §4.3). Pure: no i18n import,
 * no clock, no DOM. `kind` is an untranslated identifier the UI maps to a
 * translation key.
 */

export type TokenCategoryKind =
  "input" | "output" | "cacheWrite1h" | "cacheWrite5m" | "cacheWriteOther" | "cacheRead";
// NOTE: deliberately no "thinking" member — see plan §2 Q3. Thinking tokens
// are a SUBSET of "output", never a sixth sibling category: listing them
// separately would make the shares exceed 100% and double-count the total.

/** Structural: both `TokenTotals` (a session) and `TokenUsage` (one request) satisfy it. */
export interface TokenCategorySource {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheCreation1hInputTokens: number;
  readonly cacheCreation5mInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export interface TokenCategory {
  readonly kind: TokenCategoryKind;
  readonly tokens: number;
  /** 0..1 of `TokenCategoryBreakdown.totalTokens`; 0 when that is 0. Not a display rounding. */
  readonly share: number;
}

export interface TokenCategoryBreakdown {
  /**
   * Fixed order: input, output, cacheWrite1h, cacheWrite5m, cacheWriteOther,
   * cacheRead. The five base kinds are ALWAYS present, zero included — a
   * missing category and a zero category mean different things.
   * "cacheWriteOther" appears only when positive (§2 Q4).
   */
  readonly categories: readonly TokenCategory[];
  /** Sum over `categories`. The share denominator. Excludes thinking (§2 Q3). */
  readonly totalTokens: number;
  /** A SUBSET of the "output" category. Never a category of its own. */
  readonly thinkingTokens: number;
  /** thinkingTokens / outputTokens as 0..1; 0 when output is 0. */
  readonly thinkingShareOfOutput: number;
}

function shareOf(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

export function tokenCategories(source: TokenCategorySource): TokenCategoryBreakdown {
  const cacheWriteOther = Math.max(
    0,
    source.cacheCreationInputTokens -
      source.cacheCreation1hInputTokens -
      source.cacheCreation5mInputTokens,
  );

  const totalTokens =
    source.inputTokens +
    source.outputTokens +
    source.cacheCreation1hInputTokens +
    source.cacheCreation5mInputTokens +
    cacheWriteOther +
    source.cacheReadInputTokens;

  const base: { kind: TokenCategoryKind; tokens: number }[] = [
    { kind: "input", tokens: source.inputTokens },
    { kind: "output", tokens: source.outputTokens },
    { kind: "cacheWrite1h", tokens: source.cacheCreation1hInputTokens },
    { kind: "cacheWrite5m", tokens: source.cacheCreation5mInputTokens },
  ];
  if (cacheWriteOther > 0) {
    base.push({ kind: "cacheWriteOther", tokens: cacheWriteOther });
  }
  base.push({ kind: "cacheRead", tokens: source.cacheReadInputTokens });

  const categories: readonly TokenCategory[] = Object.freeze(
    base.map((c) =>
      Object.freeze({ kind: c.kind, tokens: c.tokens, share: shareOf(c.tokens, totalTokens) }),
    ),
  );

  return Object.freeze({
    categories,
    totalTokens,
    thinkingTokens: source.thinkingTokens,
    thinkingShareOfOutput: shareOf(source.thinkingTokens, source.outputTokens),
  });
}
