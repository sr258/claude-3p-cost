/**
 * Types for S4 — manifest data, project (space) assignment, and the US-1.5
 * gap counts. See `docs/plans/S4-manifests-spaces-project-assignment.md` §4.1.
 */
import type { AuditSession } from "./audit-types.js";

export interface ConnectedFolder {
  /** Basename only — what the UI shows (US-2.4). */
  readonly display: string;
  /**
   * Normalised full path (backslashes → "/", trailing separators stripped), or
   * null when the manifest gave no path-like value. SENSITIVE (NFR-6): the
   * grouping key is derived from it, S10 may put it in hover text, and S19
   * MUST strip it from every export. It never reaches a `Problem`.
   */
  readonly path: string | null;
  /** "local" | "network-drive" | anything else observed. */
  readonly kind: string | null;
}

/**
 * US-2.4's folder bucketing. The sibling of `ProjectRef`: a discriminated kind,
 * never a nullable name, because the UI translates "no connected folder" and
 * the model layer never imports `src/i18n/`. One session belongs to exactly one
 * bucket, keyed on its whole folder SET — see S5 plan §2 Q4.
 */
export type FolderRef =
  | { readonly kind: "none" }
  | {
      readonly kind: "folders";
      readonly key: string;
      readonly folders: readonly ConnectedFolder[];
    };

export interface SessionMeta {
  /** `local_` stripped. NEVER truncated — the truncation is a key form, not an identity. */
  readonly sessionId: string;
  readonly title: string;
  /** Empty or whitespace-only normalised to null (POC truthiness). */
  readonly spaceId: string | null;
  readonly model: string | null;
  /** Raw epoch ms exactly as it appears. Never parsed here — no clock in src/model. */
  readonly createdAt: number | null;
  readonly lastActivityAt: number | null;
  readonly isArchived: boolean;
  readonly isStarred: boolean;
  readonly folders: readonly ConnectedFolder[];
}

/**
 * US-1.4's three-way bucketing. No German literal here — Architecture rule 7
 * and "the model layer never imports src/i18n/" forbid it. A translated
 * label, a real project name, and a raw id shown because spaces.json did not
 * know it are genuinely three cases; do not collapse them into a nullable
 * `name` (see plan §2 Q1).
 */
export type ProjectRef =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly spaceId: string; readonly name: string }
  | { readonly kind: "unknown"; readonly spaceId: string };

/** spaceId -> display name. */
export type SpaceIndex = ReadonlyMap<string, string>;

/** Session key -> meta. One meta appears under many keys. */
export type ManifestIndex = ReadonlyMap<string, SessionMeta>;

export interface ParsedManifest {
  readonly meta: SessionMeta;
  /** All spellings this session can appear under. Derived from cwd among others. */
  readonly keys: readonly string[];
}

export interface ResolvedSession {
  readonly audit: AuditSession;
  readonly meta: SessionMeta | null;
  readonly project: ProjectRef;
  readonly folders: readonly ConnectedFolder[];
}

export interface ScanGaps {
  /** Sum of AuditSession.openRequests — US-1.5 "offene Anfragen". */
  readonly openRequests: number;
  readonly sessionsWithoutManifest: number;
  /** Integer micro-USD, per CLAUDE.md. Divided by 1e6 once, at the display boundary. */
  readonly costMicroUsdWithoutManifest: number;
  readonly archivedSessions: number;
}
