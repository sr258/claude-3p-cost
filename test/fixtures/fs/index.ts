/**
 * In-memory fake `FileSystem` for Vitest (S6 plan §3.5). Mirrors the
 * `test/fixtures/audit/` and `test/fixtures/sessions/` convention: tests
 * build a tree here and then ask discovery/scan questions of it. Every value
 * is invented — nothing from `reference-material/`.
 */
import type { DetectedEncoding } from "../../../src/model/encoding.js";
import type { RootCandidate } from "../../../src/model/discovery-paths.js";
import { joinPath } from "../../../src/model/paths.js";
import {
  FileSystemError,
  type DirEntry,
  type FileKind,
  type FileStat,
  type FileSystem,
  type LineStream,
} from "../../../src/services/filesystem.js";

export interface FakeAuditLog {
  readonly lines: readonly string[];
  readonly encoding?: DetectedEncoding;
  readonly hadReplacement?: boolean;
}

export interface FakeFileSystemSpec {
  readonly candidates?: readonly RootCandidate[];
  /** Directories with no files of their own — e.g. a data-free decoy account. */
  readonly directories?: readonly string[];
  /** Small files: manifests, spaces.json. */
  readonly files?: Readonly<Record<string, string | Uint8Array>>;
  /** audit.jsonl content, served line by line via readLines(). */
  readonly auditLogs?: Readonly<Record<string, FakeAuditLog>>;
  /** listDirectory() throws for these exact paths. */
  readonly unreadableDirectories?: readonly string[];
  /** stat() throws for these exact paths — a permission-denied root. */
  readonly unstatablePaths?: readonly string[];
  /** readFileBytes() / readLines() throw for these exact paths. */
  readonly unreadableFiles?: readonly string[];
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

export function createFakeFileSystem(spec: FakeFileSystemSpec = {}): FileSystem {
  const kinds = new Map<string, FileKind>();
  const children = new Map<string, Set<string>>();
  const fileBytes = new Map<string, Uint8Array>();
  const auditLogs = new Map<string, FakeAuditLog>();
  const unreadableDirectories = new Set(spec.unreadableDirectories ?? []);
  const unreadableFiles = new Set(spec.unreadableFiles ?? []);
  const unstatablePaths = new Set(spec.unstatablePaths ?? []);

  function ensureDir(path: string): void {
    if (!children.has(path)) {
      children.set(path, new Set());
    }
    if (path === "") {
      return;
    }
    if (kinds.get(path) === undefined) {
      kinds.set(path, "directory");
    }
    const parent = parentOf(path);
    ensureDir(parent);
    children.get(parent)!.add(basenameOf(path));
  }

  function addFile(path: string, bytes: Uint8Array): void {
    const parent = parentOf(path);
    ensureDir(parent);
    kinds.set(path, "file");
    children.get(parent)!.add(basenameOf(path));
    fileBytes.set(path, bytes);
  }

  ensureDir(""); // the implicit fake root; never listed directly
  for (const dir of spec.directories ?? []) {
    ensureDir(dir);
  }
  for (const [path, content] of Object.entries(spec.files ?? {})) {
    addFile(path, typeof content === "string" ? new TextEncoder().encode(content) : content);
  }
  for (const [path, log] of Object.entries(spec.auditLogs ?? {})) {
    const parent = parentOf(path);
    ensureDir(parent);
    kinds.set(path, "file");
    children.get(parent)!.add(basenameOf(path));
    auditLogs.set(path, log);
  }

  return {
    kind: "fake",

    async rootCandidates(): Promise<readonly RootCandidate[]> {
      return spec.candidates ?? [];
    },

    async stat(path: string): Promise<FileStat | null> {
      if (unstatablePaths.has(path)) {
        throw new FileSystemError("permission", "fake-unstatable");
      }
      const kind = kinds.get(path);
      if (kind === undefined) {
        return path === "" ? { kind: "directory", size: 0, modifiedMs: null } : null;
      }
      const size = kind === "file" ? (fileBytes.get(path)?.byteLength ?? 0) : 0;
      return { kind, size, modifiedMs: null };
    },

    async listDirectory(path: string): Promise<readonly DirEntry[]> {
      if (unreadableDirectories.has(path)) {
        throw new FileSystemError("io", "fake-unreadable-directory");
      }
      const names = children.get(path);
      if (names === undefined) {
        throw new FileSystemError("not-found");
      }
      return Object.freeze(
        [...names].map((name) => Object.freeze({ name, kind: kinds.get(joinPath(path, name))! })),
      );
    },

    async readFileBytes(path: string): Promise<Uint8Array> {
      if (unreadableFiles.has(path)) {
        throw new FileSystemError("io", "fake-unreadable-file");
      }
      const bytes = fileBytes.get(path);
      if (bytes === undefined) {
        throw new FileSystemError("not-found");
      }
      return bytes;
    },

    readLines(path: string): LineStream {
      const log = auditLogs.get(path);
      const encoding: DetectedEncoding = log?.encoding ?? "utf-8";
      const hadReplacement = log?.hadReplacement ?? false;
      const shouldFail = unreadableFiles.has(path);

      async function* generate(): AsyncGenerator<string> {
        if (shouldFail) {
          throw new FileSystemError("io", "fake-unreadable-file");
        }
        if (log === undefined) {
          throw new FileSystemError("not-found");
        }
        for (const line of log.lines) {
          yield line;
        }
      }

      return {
        [Symbol.asyncIterator](): AsyncIterator<string> {
          return generate();
        },
        get encoding(): DetectedEncoding | null {
          return encoding;
        },
        get hadReplacement(): boolean {
          return hadReplacement;
        },
      };
    },
  };
}
