/**
 * The `FileSystem` interface (S6 plan §4.3, NFR-13). One interface, two
 * implementations: the dev middleware client (`filesystem-dev.ts`, this
 * session) and the Tauri fs plugin (S7). `createFileSystem()` is the single
 * selection point — nothing above this module branches on which is active.
 */
import type { DetectedEncoding } from "../model/encoding.js";
import type { RootCandidate } from "../model/discovery-paths.js";
import { loadManualRoots } from "./root-store.js";

export type FileKind = "file" | "directory";

export interface DirEntry {
  /** A basename, never a path. */
  readonly name: string;
  readonly kind: FileKind;
}

export interface FileStat {
  readonly kind: FileKind;
  readonly size: number;
  readonly modifiedMs: number | null;
}

/**
 * Lines plus the encoding facts the parser needs; `encoding` and
 * `hadReplacement` are meaningful only after iteration has finished.
 */
export interface LineStream extends AsyncIterable<string> {
  readonly encoding: DetectedEncoding | null;
  readonly hadReplacement: boolean;
}

export type FileSystemErrorCode = "not-found" | "permission" | "io" | "protocol";

/** NFR-6: message is `filesystem:${code}`. Carries no path and no file content. */
export class FileSystemError extends Error {
  readonly code: FileSystemErrorCode;
  readonly hint?: string; // bounded token only, e.g. an HTTP status

  constructor(code: FileSystemErrorCode, hint?: string) {
    super(`filesystem:${code}`);
    this.name = "FileSystemError";
    this.code = code;
    this.hint = hint;
  }
}

export interface FileSystem {
  readonly kind: "dev" | "tauri" | "null" | "fake";
  /** Existence is NOT checked here — discovery does that, once, for both impls. */
  rootCandidates(): Promise<readonly RootCandidate[]>;
  /** null for "does not exist". Throws only for permission/IO. */
  stat(path: string): Promise<FileStat | null>;
  listDirectory(path: string): Promise<readonly DirEntry[]>;
  /** Small files only (manifests, spaces.json) — encoding detection needs bytes. */
  readFileBytes(path: string): Promise<Uint8Array>;
  /** Streaming; a whole audit.jsonl is never held in memory (NFR-4). */
  readLines(path: string): LineStream;
}

function emptyLineStream(): LineStream {
  return {
    encoding: null,
    hadReplacement: false,
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return (async function* (): AsyncGenerator<string> {
        // Nothing to yield: the null filesystem has no roots and no files.
      })();
    },
  };
}

export const nullFileSystem: FileSystem = Object.freeze({
  kind: "null",
  async rootCandidates(): Promise<readonly RootCandidate[]> {
    return [];
  },
  async stat(): Promise<FileStat | null> {
    return null;
  },
  async listDirectory(): Promise<readonly DirEntry[]> {
    return [];
  },
  async readFileBytes(): Promise<Uint8Array> {
    throw new FileSystemError("not-found");
  },
  readLines(): LineStream {
    return emptyLineStream();
  },
});

/**
 * The single selection point. Dev impl under `npm run dev` in a plain
 * browser; never under `npx tauri dev` (S6 plan §2 Q8), because that runs
 * the same Vite dev server inside the WebView and `import.meta.env.DEV` is
 * true there too. The Tauri impl arrives in S7.
 */
export async function createFileSystem(): Promise<FileSystem> {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in globalThis)) {
    const { createDevFileSystem } = await import("./filesystem-dev.js");
    return createDevFileSystem();
  }
  const { createTauriFileSystem } = await import("./filesystem-tauri.js");
  return createTauriFileSystem({ manualRoots: loadManualRoots() });
}
