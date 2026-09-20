import type { DetectedEncoding } from "./encoding.js";
import type { Problem } from "./problems.js";
import type { ToolUseCount } from "./tool-usage.js";

export interface TokenUsage {
  readonly inputTokens: number;
  /**
   * From the RESULT line's usage block only — never from an assistant line.
   * `output_tokens` on `assistant` lines is the `message_start` snapshot (1–3
   * tokens), not the true total (MAP.md §4.1). See `audit-parser.ts` §5.
   */
  readonly outputTokens: number;
  /** usage.output_tokens_details.thinking_tokens */
  readonly thinkingTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  /** usage.cache_creation.ephemeral_1h_input_tokens */
  readonly cacheCreation1hInputTokens: number;
  /** usage.cache_creation.ephemeral_5m_input_tokens */
  readonly cacheCreation5mInputTokens: number;
  /** usage.server_tool_use.web_search_requests */
  readonly webSearchRequests: number;
  /** usage.server_tool_use.web_fetch_requests */
  readonly webFetchRequests: number;
}

export interface ModelUsageRecord {
  /** The exact modelUsage key. The "[1m]" suffix is NEVER normalised away. */
  readonly model: string;
  readonly costMicroUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly webSearchRequests: number;
  readonly provider: string | null;
  readonly costBasis: string | null;
  readonly contextWindow: number | null;
}

export interface SubagentStats {
  readonly requested: number;
  readonly spawned: number;
  readonly spawnedBySubagents: number;
  readonly startedInBackground: number;
  readonly completed: number;
  readonly failed: number;
  readonly killed: number;
  readonly refused: number;
  readonly maxDepth: number;
}

export interface RequestRecord {
  /** Raw ISO-8601 string exactly as it appears. NEVER parsed here — no clock in src/model. */
  readonly timestamp: string | null;
  readonly costMicroUsd: number;
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly numTurns: number;
  readonly isError: boolean;
  readonly usage: TokenUsage;
  readonly models: readonly ModelUsageRecord[];
  /** Absent on a large share of real result lines — null, not an empty object. */
  readonly subagents: SubagentStats | null;
}

export interface LifecycleCounts {
  readonly queued: number;
  readonly started: number;
  readonly completed: number;
}

export interface AuditSession {
  /** Caller-supplied: the session directory name. The parser does no I/O and cannot know it. */
  readonly sourceId: string;
  /** Derived from the system/init cwd; falls back to sourceId. */
  readonly sessionId: string;
  /** Sensitive-ish: displayed as a basename at most, never exported (NFR-6). */
  readonly cwd: string | null;
  readonly initModel: string | null;
  /** result.session_id — the CLI session UUID. NOT the session directory. See §10. */
  readonly cliSessionId: string | null;
  readonly requests: readonly RequestRecord[];
  readonly lifecycle: LifecycleCounts;
  /** max(0, started - completed) — the "offene Anfragen" figure of US-1.5. */
  readonly openRequests: number;
  /** Non-empty lines seen, malformed ones included. */
  readonly lineCount: number;
  /** Uncapped, unlike `problems`. */
  readonly malformedLineCount: number;
  readonly encoding: DetectedEncoding | null;
  /** Capped at MAX_PROBLEMS_PER_SCOPE. */
  readonly problems: readonly Problem[];
  /**
   * Tool calls by name, ranked (calls desc, then name asc by code unit),
   * deduplicated by (request_id, tool_use.id) — S12 plan §2 Q1. Never derived
   * from an assistant line's token snapshot; the block's `input` and `id` are
   * never carried here (NFR-6, §2 Q5).
   */
  readonly toolUses: readonly ToolUseCount[];
}
