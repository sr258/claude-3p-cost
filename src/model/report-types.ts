/**
 * The `Report` type S8–S18 read from. Types only, no logic, no runtime export.
 * See `docs/plans/S5-aggregation.md` §4.2.
 */
import type { RequestRecord } from "./audit-types.js";
import type { Problem } from "./problems.js";
import type { FolderRef, ProjectRef, ScanGaps } from "./project-types.js";

export interface TokenTotals {
  readonly inputTokens: number;
  /** From RESULT lines only — never from an assistant line (MAP.md §4.1). */
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheCreation1hInputTokens: number;
  readonly cacheCreation5mInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly webSearchRequests: number;
  readonly webFetchRequests: number;
}

export interface CostTotals {
  /** Integer micro-USD. Divided by 1e6 exactly once, in the UI. Never here. */
  readonly costMicroUsd: number;
  readonly requests: number;
  /** Requests with is_error true. They still contribute cost. */
  readonly errorRequests: number;
  readonly numTurns: number;
  /** Sum of request durationMs — US-2.1's "total duration". See plan §2 Q6. */
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly subagentsSpawned: number;
  readonly tokens: TokenTotals;
}

export interface ModelTotal {
  /** The exact modelUsage key. The "[1m]" suffix is NEVER normalised away. */
  readonly model: string;
  readonly costMicroUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly webSearchRequests: number;
  /** result lines that mentioned this model. */
  readonly requests: number;
}

export interface ModelBreakdown {
  /** Cost descending, then model name ascending. */
  readonly models: readonly ModelTotal[];
  /**
   * Sum over `models`, from `modelUsage`. NOT the authoritative total — that is
   * `CostTotals.costMicroUsd`, from `total_cost_usd`. Shares are computed
   * against THIS figure so they sum to 100%. See plan §2 Q5.
   */
  readonly costMicroUsd: number;
}

export interface SessionRow {
  readonly sessionId: string;
  readonly sourceId: string;
  /** "" when there is no manifest. */
  readonly title: string;
  readonly hasManifest: boolean;
  readonly isArchived: boolean;
  readonly isStarred: boolean;
  readonly project: ProjectRef;
  readonly folder: FolderRef;
  /** Manifest model, falling back to the system/init model. */
  readonly model: string | null;
  readonly openRequests: number;
  /** Raw ISO strings, min/max lexicographically — all are the UTC "Z" form. */
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
  /** Manifest epoch ms, or null. */
  readonly lastActivityAt: number | null;
  readonly totals: CostTotals;
  readonly models: ModelBreakdown;
  /**
   * Every parsed `result` line of this session, timestamp ascending, nulls
   * last (S11 plan §2 Q8). Frozen. Aborted requests are NOT here — they have
   * no `result` line and are counted in `openRequests` instead (§2 Q2).
   * Carries no path and no free text; NFR-6 containment is asserted in
   * `report-privacy.test.ts`.
   */
  readonly requests: readonly RequestRecord[];
}

/** The UI maps a "none" kind to a translated label. The model never does. */
export type GroupLabel =
  | { readonly kind: "project"; readonly project: ProjectRef }
  | { readonly kind: "folder"; readonly folder: FolderRef };

export interface GroupRow {
  /** `projectKey(...)` or `folderKey(...)`. Stable across rebuilds. */
  readonly key: string;
  readonly label: GroupLabel;
  /** Cost descending, sessionId ascending as tie-break. */
  readonly sessions: readonly SessionRow[];
  readonly sessionCount: number;
  readonly totals: CostTotals;
  readonly models: ModelBreakdown;
}

export interface TimeBucket {
  /** "YYYY-MM-DD" for days, "YYYY-MM" for months, in the resolved zone. */
  readonly key: string;
  readonly costMicroUsd: number;
  readonly requests: number;
  readonly durationMs: number;
}

export interface UndatedTotals {
  readonly requests: number;
  readonly costMicroUsd: number;
}

export interface Report {
  /** Every session, cost descending. */
  readonly sessions: readonly SessionRow[];
  /** US-2.1. Cost descending. */
  readonly projectGroups: readonly GroupRow[];
  /** US-2.4. Cost descending. */
  readonly folderGroups: readonly GroupRow[];
  /** US-2.1's total row. */
  readonly totals: CostTotals;
  /** US-2.3, global. */
  readonly models: ModelBreakdown;
  /** Key ascending. */
  readonly byDay: readonly TimeBucket[];
  /** Key ascending. */
  readonly byMonth: readonly TimeBucket[];
  /** Requests whose timestamp could not be read. See plan §2 Q8. */
  readonly undated: UndatedTotals;
  /** S4's summarizeGaps, passed through unchanged. */
  readonly gaps: ScanGaps;
  readonly problems: readonly Problem[];
}
