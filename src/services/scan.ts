/**
 * Discovery -> `Report`, streaming (S6 plan §4.6). Glue over model functions
 * that already exist: no new parsing, no new aggregation, no new grouping is
 * written here.
 */
import { parseAuditLines } from "../model/audit-parser.js";
import { pathBasename } from "../model/paths.js";
import { buildManifestIndex, parseManifestBytes } from "../model/manifest.js";
import { createProblemCollector, MAX_PROBLEMS_PER_SCOPE, type Problem } from "../model/problems.js";
import type { ParsedManifest, ResolvedSession } from "../model/project-types.js";
import { resolveSession } from "../model/project-assignment.js";
import { buildReport } from "../model/report.js";
import type { Report } from "../model/report-types.js";
import { mergeSpaceIndexes, parseSpacesBytes } from "../model/spaces.js";
import { utcOffset, type ZoneOffsetResolver } from "../model/time-buckets.js";
import type { Discovery } from "./discovery.js";
import type { FileSystem } from "./filesystem.js";

export interface ScanOptions {
  readonly zone?: ZoneOffsetResolver; // defaults to utcOffset, as S5
  readonly onProgress?: (done: number, total: number) => void;
  /** NFR-2: an interim Report from the sessions parsed so far. */
  readonly onPartial?: (report: Report) => void;
  /** Minimum ms between onPartial emissions. Default 250. */
  readonly partialIntervalMs?: number;
}

const DEFAULT_PARTIAL_INTERVAL_MS = 250;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function scanDiscovery(
  fs: FileSystem,
  discovery: Discovery,
  options?: ScanOptions,
): Promise<Report> {
  const zone = options?.zone ?? utcOffset;
  const problems = createProblemCollector();
  for (const problem of discovery.problems) {
    problems.add(problem);
  }

  const spaceIndexes = [];
  for (const profile of discovery.profiles) {
    for (const path of profile.spacesPaths) {
      try {
        const bytes = await fs.readFileBytes(path);
        spaceIndexes.push(parseSpacesBytes(bytes, problems));
      } catch {
        problems.add({ kind: "unreadable-file", scope: pathBasename(path) });
      }
    }
  }
  const spaces = mergeSpaceIndexes(spaceIndexes);

  const manifests: ParsedManifest[] = [];
  for (const profile of discovery.profiles) {
    for (const path of profile.manifestPaths) {
      try {
        const bytes = await fs.readFileBytes(path);
        const parsed = parseManifestBytes(bytes, pathBasename(path), problems);
        if (parsed !== null) {
          manifests.push(parsed);
        }
      } catch {
        problems.add({ kind: "unreadable-file", scope: pathBasename(path) });
      }
    }
  }
  const index = buildManifestIndex(manifests, problems);

  // Resolved once per session, as it is parsed — never re-resolved for a
  // later partial emit, which would call `problems.add` again for the same
  // session and diverge from a scan with no `onPartial` (plan §6.6: "the
  // collector is shared, so an interim report is a prefix view, never a
  // different computation").
  const resolved: ResolvedSession[] = [];
  const total = discovery.sessions.length;
  let done = 0;
  const partialIntervalMs = options?.partialIntervalMs ?? DEFAULT_PARTIAL_INTERVAL_MS;
  let lastPartialAt = Date.now();
  // Sequentially, one in flight at a time (NFR-4) — never Promise.all.
  for (const session of discovery.sessions) {
    try {
      const stream = fs.readLines(session.auditPath);
      const audit = await parseAuditLines(session.sessionId, stream);

      let auditProblems = audit.problems;
      if (stream.hadReplacement) {
        const decodeProblem: Problem = { kind: "decode-replacement", scope: session.sessionId };
        if (auditProblems.length < MAX_PROBLEMS_PER_SCOPE) {
          auditProblems = [...auditProblems, decodeProblem];
        }
        // Also surfaced in the scan-wide collector, so it reaches
        // Report.problems — SessionRow carries no problems field of its own.
        problems.add(decodeProblem);
      }
      const frozenAudit = Object.freeze({
        ...audit,
        encoding: stream.encoding,
        problems: auditProblems,
      });
      resolved.push(resolveSession(frozenAudit, index, spaces, problems));
    } catch {
      problems.add({ kind: "unreadable-file", scope: session.sessionId });
    }
    done += 1;
    options?.onProgress?.(done, total);

    if (options?.onPartial && Date.now() - lastPartialAt >= partialIntervalMs) {
      options.onPartial(buildReport(resolved, problems.problems, { zone }));
      lastPartialAt = Date.now();
      await yieldToEventLoop();
    }
  }

  return buildReport(resolved, problems.problems, { zone });
}
