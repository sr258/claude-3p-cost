/**
 * US-1.4's bucketing and US-1.5's gap counts. Joins an already-parsed
 * `AuditSession` (S3) to its manifest (this session) and its project name
 * (from the merged `spaces.json` index) — see plan §4.4.
 */
import type { AuditSession } from "./audit-types.js";
import { lookupManifest } from "./manifest.js";
import type { ProblemCollector } from "./problems.js";
import type {
  ManifestIndex,
  ProjectRef,
  ResolvedSession,
  ScanGaps,
  SessionMeta,
  SpaceIndex,
} from "./project-types.js";

export function resolveProject(
  meta: SessionMeta | null,
  spaces: SpaceIndex,
  problems: ProblemCollector,
): ProjectRef {
  if (meta === null || meta.spaceId === null) {
    return { kind: "none" };
  }

  const name = spaces.get(meta.spaceId);
  if (name !== undefined) {
    return { kind: "named", spaceId: meta.spaceId, name };
  }

  problems.add({ kind: "unknown-space", scope: meta.sessionId, hint: "spaceId" });
  return { kind: "unknown", spaceId: meta.spaceId };
}

/**
 * A plain string key for grouping in a `Map` (S5). `"\u0000none"` (NUL-prefixed)
 * for the no-project bucket, so it cannot collide with a real space id: NUL is
 * not legal in a JSON-sourced identifier, so even a space id equal to the
 * literal string "none" stays distinct from the no-project bucket.
 */
export function projectKey(ref: ProjectRef): string {
  return ref.kind === "none" ? "\u0000none" : ref.spaceId;
}

export function resolveSession(
  audit: AuditSession,
  index: ManifestIndex,
  spaces: SpaceIndex,
  problems: ProblemCollector,
): ResolvedSession {
  const meta = lookupManifest(index, { sessionId: audit.sessionId, sourceId: audit.sourceId });
  const project = resolveProject(meta, spaces, problems);
  return Object.freeze({
    audit,
    meta,
    project,
    folders: meta?.folders ?? [],
  });
}

export function resolveSessions(
  audits: readonly AuditSession[],
  index: ManifestIndex,
  spaces: SpaceIndex,
  problems: ProblemCollector,
): readonly ResolvedSession[] {
  return audits.map((audit) => resolveSession(audit, index, spaces, problems));
}

export function summarizeGaps(sessions: readonly ResolvedSession[]): ScanGaps {
  let openRequests = 0;
  let sessionsWithoutManifest = 0;
  let costMicroUsdWithoutManifest = 0;
  let archivedSessions = 0;

  for (const session of sessions) {
    openRequests += session.audit.openRequests;
    if (session.meta === null) {
      sessionsWithoutManifest += 1;
      for (const request of session.audit.requests) {
        costMicroUsdWithoutManifest += request.costMicroUsd;
      }
    }
    if (session.meta?.isArchived) {
      archivedSessions += 1;
    }
  }

  return Object.freeze({
    openRequests,
    sessionsWithoutManifest,
    costMicroUsdWithoutManifest,
    archivedSessions,
  });
}
