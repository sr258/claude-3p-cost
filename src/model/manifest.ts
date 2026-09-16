/**
 * Manifest parsing, `sessionKeys()`, index build and lookup. Port of
 * `session_keys()` and `index_sessions()` in `poc/cowork_costs.py` (S4 plan
 * §4.3, §5). `session_id_from_cwd()` is already ported in `session-id.ts`;
 * this module reuses it rather than duplicating it.
 */
import { decodeText } from "./encoding.js";
import { toBool, toStringOrNull } from "./numbers.js";
import type { ProblemCollector } from "./problems.js";
import { sessionIdFromCwd } from "./session-id.js";
import type {
  ConnectedFolder,
  ManifestIndex,
  ParsedManifest,
  SessionMeta,
} from "./project-types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstTruthy(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value) {
      return value;
    }
  }
  return undefined;
}

/**
 * "local_<uuid>.json" -> "<uuid>".
 *
 * The POC slices positionally; this strips the prefix and suffix only when they
 * are actually present, which differs solely for a name that is not
 * `local_*.json` (the POC would eat six leading characters regardless).
 * Deliberate: a malformed file name keeps its stem instead of being mangled.
 */
function stripLocalPrefixAndJsonSuffix(fileName: string): string {
  let stem = fileName;
  if (stem.startsWith("local_")) {
    stem = stem.slice("local_".length);
  }
  if (stem.endsWith(".json")) {
    stem = stem.slice(0, -".json".length);
  }
  return stem;
}

function stripLocalPrefix(value: string): string {
  return value.startsWith("local_") ? value.slice("local_".length) : value;
}

/**
 * "\\a\\b\\c\\" -> "c". Basename only, forward- and backslash-tolerant, with
 * a trailing separator stripped first. Falls back to the original string if
 * the normalised form has no segment (mirrors `os.path.basename(...) or p`).
 */
function basename(raw: string): string {
  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : raw;
}

/** Port of `folders_of()`. `resolvedFolderKinds` wins; `userSelectedFolders` is the fallback. */
function foldersOf(obj: Record<string, unknown>): ConnectedFolder[] {
  const out: ConnectedFolder[] = [];
  const resolved = obj.resolvedFolderKinds;
  if (Array.isArray(resolved)) {
    for (const entry of resolved) {
      if (isPlainObject(entry) && entry.display) {
        out.push({
          display: basename(String(entry.display)),
          kind: toStringOrNull(entry.kind),
        });
      }
    }
  }
  if (out.length === 0) {
    const userSelected = obj.userSelectedFolders;
    if (Array.isArray(userSelected)) {
      for (const entry of userSelected) {
        if (typeof entry === "string") {
          if (entry) {
            out.push({ display: basename(entry), kind: null });
          }
        } else if (isPlainObject(entry)) {
          const value = firstTruthy(entry, ["display", "path", "hostPath", "name"]);
          if (value) {
            out.push({ display: basename(String(value)), kind: null });
          }
        }
      }
    }
  }
  return out;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Empty or whitespace-only normalised to null (POC truthiness, extended — see plan §4.1). */
function normalizeSpaceId(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }
  return value ? String(value) : null;
}

/** Transient input to sessionKeys. Never stored — cwd must not outlive this call. */
export interface ManifestRawIds {
  readonly sessionId: string | null;
  readonly cliSessionId: string | null;
  readonly cwd: string | null;
}

/**
 * Port of `session_keys()` in `poc/cowork_costs.py`. See plan §5.2 — do not
 * shorten it. The truncation applies to the `local_`-stripped form too; that
 * is what turns manifest `local_<8hex>-<rest>.json` into the directory name
 * `<8hex>`, and it is the entire reason the assignment works.
 */
export function sessionKeys(raw: ManifestRawIds, fileName: string): readonly string[] {
  const keys = new Set<string>();

  const candidates: (string | null)[] = [
    stripLocalPrefixAndJsonSuffix(fileName),
    raw.sessionId,
    raw.cliSessionId,
  ];
  if (raw.cwd) {
    candidates.push(sessionIdFromCwd(raw.cwd));
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const value = String(candidate);
    const stripped = stripLocalPrefix(value);
    for (const form of [value, stripped]) {
      keys.add(form);
      keys.add(form.split("-")[0]);
    }
  }

  keys.delete("");
  return Array.from(keys).sort();
}

function buildMeta(obj: Record<string, unknown>, fileName: string): SessionMeta {
  const sessionIdField = toStringOrNull(obj.sessionId);
  const sessionIdRaw = sessionIdField ?? stripLocalPrefixAndJsonSuffix(fileName);
  const sessionId = stripLocalPrefix(sessionIdRaw);

  const titleRaw = obj.title;
  const title = titleRaw ? String(titleRaw) : "";

  return Object.freeze({
    sessionId,
    title,
    spaceId: normalizeSpaceId(obj.spaceId),
    model: toStringOrNull(obj.model),
    createdAt: numberOrNull(obj.createdAt),
    lastActivityAt: numberOrNull(obj.lastActivityAt),
    isArchived: toBool(obj.isArchived),
    isStarred: toBool(obj.isStarred),
    folders: foldersOf(obj),
  });
}

/** fileName is the bare "local_<uuid>.json" — never a path (NFR-6). */
export function parseManifestText(
  text: string,
  fileName: string,
  problems: ProblemCollector,
): ParsedManifest | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    problems.add({
      kind: "malformed-manifest",
      scope: stripLocalPrefixAndJsonSuffix(fileName),
      hint: error instanceof Error ? error.constructor.name : "Error",
    });
    return null;
  }

  if (!isPlainObject(data)) {
    return null;
  }

  const meta = buildMeta(data, fileName);
  const raw: ManifestRawIds = {
    sessionId: toStringOrNull(data.sessionId),
    cliSessionId: toStringOrNull(data.cliSessionId),
    cwd: toStringOrNull(data.cwd),
  };
  const keys = sessionKeys(raw, fileName);

  return Object.freeze({ meta, keys });
}

export function parseManifestBytes(
  bytes: Uint8Array,
  fileName: string,
  problems: ProblemCollector,
): ParsedManifest | null {
  const { text } = decodeText(bytes);
  return parseManifestText(text, fileName, problems);
}

/** Input MUST be in a deterministic order (sorted by file name): first wins. See plan §2 Q5. */
export function buildManifestIndex(
  manifests: readonly ParsedManifest[],
  problems: ProblemCollector,
): ManifestIndex {
  const index = new Map<string, SessionMeta>();
  for (const manifest of manifests) {
    for (const key of manifest.keys) {
      const existing = index.get(key);
      if (existing === undefined) {
        index.set(key, manifest.meta);
      } else if (existing.sessionId !== manifest.meta.sessionId) {
        // First-wins is kept (§2 Q5); this makes the collision visible instead
        // of letting it silently decide a project assignment. The colliding
        // key itself is never carried in the hint — it can be a cwd-derived
        // folder name, which is sensitive (NFR-6).
        problems.add({
          kind: "duplicate-session-key",
          scope: manifest.meta.sessionId,
          hint: "sessionKey",
        });
      }
    }
  }
  return index;
}

export function lookupManifest(
  index: ManifestIndex,
  id: { readonly sessionId: string; readonly sourceId: string },
): SessionMeta | null {
  // The POC only tries sessionId and sessionId.split("-")[0]. Trying sourceId
  // too is a strict superset — see plan §2 Q4. On the reference data this
  // never fires: all 150 audit logs match on sessionId alone.
  const candidates = [
    id.sessionId,
    id.sessionId.split("-")[0],
    id.sourceId,
    id.sourceId.split("-")[0],
  ];
  for (const candidate of candidates) {
    const found = index.get(candidate);
    if (found) {
      return found;
    }
  }
  return null;
}
