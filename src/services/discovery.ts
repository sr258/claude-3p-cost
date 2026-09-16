/**
 * The shared walk from roots to sessions (S6 plan §4.5). A directory
 * containing `audit.jsonl` is a session directory: recorded, never
 * descended into. The walk is bounded in depth (default 4 levels below a
 * root) and skips dot-directories and payload names — a deliberate
 * deviation from the POC's unbounded `find_files()` (plan §2 Q2).
 */
import { createProblemCollector, type Problem } from "../model/problems.js";
import { joinPath, pathBasename } from "../model/paths.js";
import type { RootCandidate } from "../model/discovery-paths.js";
import type { DirEntry, FileSystem } from "./filesystem.js";

export interface DiscoveredSession {
  /** The session DIRECTORY name — the `sourceId` the S3 parser expects. */
  readonly sessionId: string;
  readonly auditPath: string;
  readonly rootPath: string;
  readonly accountId: string;
  readonly profileId: string;
}

export interface DiscoveredProfile {
  readonly rootPath: string;
  readonly accountId: string;
  readonly profileId: string;
  readonly path: string;
  readonly spacesPaths: readonly string[];
  readonly manifestPaths: readonly string[];
}

export interface DiscoveredRoot {
  readonly candidate: RootCandidate;
  readonly accounts: number;
  readonly profiles: number;
}

export interface Discovery {
  readonly roots: readonly DiscoveredRoot[]; // those that exist
  readonly searched: readonly RootCandidate[]; // every candidate, for the empty state
  readonly profiles: readonly DiscoveredProfile[];
  readonly sessions: readonly DiscoveredSession[];
  readonly accountCount: number; // only where data was found (§2 Q3)
  readonly profileCount: number;
  readonly problems: readonly Problem[];
}

export interface DiscoverOptions {
  readonly maxDepth?: number; // default 4
  readonly candidates?: readonly RootCandidate[]; // default: fs.rootCandidates()
}

const AUDIT_FILE = "audit.jsonl";
const SPACES_FILE = "spaces.json";
const LOCAL_PREFIX = "local_";
const JSON_SUFFIX = ".json";
const SKIP_NAMES: ReadonlySet<string> = new Set(["outputs", "uploads", "uploads-tmp"]);
const DEFAULT_MAX_DEPTH = 4;

function isDotName(name: string): boolean {
  return name.startsWith(".");
}

function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function profilePathOf(rootPath: string, accountId: string, profileId: string): string {
  if (accountId === "") {
    return rootPath;
  }
  if (profileId === "") {
    return joinPath(rootPath, accountId);
  }
  return joinPath(rootPath, accountId, profileId);
}

interface ProfileBucket {
  readonly accountId: string;
  readonly profileId: string;
  readonly spacesPaths: string[];
  readonly manifestPaths: string[];
  hasSession: boolean;
}

interface RootWalkState {
  readonly rootPath: string;
  readonly buckets: Map<string, ProfileBucket>;
  readonly sessions: DiscoveredSession[];
}

function bucketFor(state: RootWalkState, accountId: string, profileId: string): ProfileBucket {
  // NUL separator, not a space: directory names in a real tree contain
  // spaces, so "a b"/"c" would otherwise collide with "a"/"b c".
  const key = `${accountId}\u0000${profileId}`;
  let bucket = state.buckets.get(key);
  if (bucket === undefined) {
    bucket = { accountId, profileId, spacesPaths: [], manifestPaths: [], hasSession: false };
    state.buckets.set(key, bucket);
  }
  return bucket;
}

async function walkDirectory(
  fs: FileSystem,
  dirPath: string,
  depth: number,
  accountId: string,
  profileId: string,
  maxDepth: number,
  problems: ReturnType<typeof createProblemCollector>,
  state: RootWalkState,
): Promise<void> {
  let entries: readonly DirEntry[];
  try {
    entries = await fs.listDirectory(dirPath);
  } catch {
    problems.add({ kind: "unreadable-directory", scope: pathBasename(dirPath) });
    return;
  }

  const hasAudit = entries.some((entry) => entry.kind === "file" && entry.name === AUDIT_FILE);
  if (hasAudit) {
    state.sessions.push(
      Object.freeze({
        sessionId: pathBasename(dirPath),
        auditPath: joinPath(dirPath, AUDIT_FILE),
        rootPath: state.rootPath,
        accountId,
        profileId,
      }),
    );
    bucketFor(state, accountId, profileId).hasSession = true;
    return; // a session directory is never descended into (§2 Q2)
  }

  const bucket = bucketFor(state, accountId, profileId);
  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue;
    }
    if (entry.name === SPACES_FILE) {
      bucket.spacesPaths.push(joinPath(dirPath, entry.name));
    } else if (entry.name.startsWith(LOCAL_PREFIX) && entry.name.endsWith(JSON_SUFFIX)) {
      bucket.manifestPaths.push(joinPath(dirPath, entry.name));
    }
  }

  if (depth >= maxDepth) {
    return;
  }

  const subdirectories = [...entries]
    .filter(
      (entry) =>
        entry.kind === "directory" && !isDotName(entry.name) && !SKIP_NAMES.has(entry.name),
    )
    .sort((a, b) => compareCodeUnit(a.name, b.name));

  for (const subdirectory of subdirectories) {
    const nextAccountId = depth === 0 ? subdirectory.name : accountId;
    const nextProfileId = depth === 1 ? subdirectory.name : profileId;
    await walkDirectory(
      fs,
      joinPath(dirPath, subdirectory.name),
      depth + 1,
      nextAccountId,
      nextProfileId,
      maxDepth,
      problems,
      state,
    );
  }
}

export async function discover(fs: FileSystem, options?: DiscoverOptions): Promise<Discovery> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const candidates = options?.candidates ?? (await fs.rootCandidates());
  const problems = createProblemCollector();

  const roots: DiscoveredRoot[] = [];
  const profiles: DiscoveredProfile[] = [];
  const sessions: DiscoveredSession[] = [];
  let accountCount = 0;
  let profileCount = 0;

  for (const candidate of candidates) {
    let stat;
    try {
      stat = await fs.stat(candidate.path);
    } catch {
      // A permission or IO failure on a candidate root is collected, never
      // thrown: one unreadable root must not abort the whole discovery
      // (NFR-3). `scope` is the root's basename, never a path (NFR-6).
      problems.add({ kind: "unreadable-directory", scope: pathBasename(candidate.path) });
      continue;
    }
    if (stat === null || stat.kind !== "directory") {
      continue; // searched (below), not a root
    }

    const state: RootWalkState = { rootPath: candidate.path, buckets: new Map(), sessions: [] };
    await walkDirectory(fs, candidate.path, 0, "", "", maxDepth, problems, state);

    const dataBuckets = [...state.buckets.values()].filter(
      (bucket) =>
        bucket.hasSession || bucket.spacesPaths.length > 0 || bucket.manifestPaths.length > 0,
    );
    const accountIds = new Set(dataBuckets.map((bucket) => bucket.accountId));

    for (const bucket of dataBuckets) {
      profiles.push(
        Object.freeze({
          rootPath: candidate.path,
          accountId: bucket.accountId,
          profileId: bucket.profileId,
          path: profilePathOf(candidate.path, bucket.accountId, bucket.profileId),
          spacesPaths: Object.freeze([...bucket.spacesPaths]),
          manifestPaths: Object.freeze([...bucket.manifestPaths]),
        }),
      );
    }
    sessions.push(...state.sessions);

    roots.push(
      Object.freeze({ candidate, accounts: accountIds.size, profiles: dataBuckets.length }),
    );
    accountCount += accountIds.size;
    profileCount += dataBuckets.length;
  }

  return Object.freeze({
    roots: Object.freeze(roots),
    searched: Object.freeze([...candidates]),
    profiles: Object.freeze(profiles),
    sessions: Object.freeze(sessions),
    accountCount,
    profileCount,
    problems: Object.freeze([...problems.problems]),
  });
}
