/**
 * The `FileSystem` implementation over `@tauri-apps/plugin-fs` (S7 plan
 * §5.2). Everything it needs from Tauri is injected through `TauriBridge`,
 * so tests need no globals and no mocked module — the default bridge is the
 * only place that touches `@tauri-apps/plugin-fs` / `@tauri-apps/api/core`.
 *
 * Read-only by construction (US-1.6, NFR-6): only `exists`, `stat`,
 * `readDir`, `readFile` and `open({ read: true })` are used; the returned
 * handle is never written or truncated. `src/services/read-only-guarantee
 * .test.ts` enforces this statically over the whole reachable module graph.
 *
 * Owns no encoding logic of its own beyond feeding bytes to
 * `createLineDecoder()` — the byte -> line boundary stays
 * `src/model/encoding.ts`'s, exactly as in `filesystem-dev.ts` (S6).
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
// Named imports ONLY — never a namespace or default import of the fs
// plugin (S7 plan §2.2, §8 Part 1(b)): that would defeat the read-only
// analyser's name-level check. This is the entire read surface: no
// `create`, `writeFile`, `writeTextFile`, `mkdir`, `remove`, `rename`,
// `copyFile` or `truncate` is ever imported here.
import { exists, open, readDir, readFile, stat } from "@tauri-apps/plugin-fs";
import { createLineDecoder, type DetectedEncoding } from "../model/encoding.js";
import { joinPath } from "../model/paths.js";
import {
  rootCandidates as deriveRootCandidates,
  type RootCandidate,
} from "../model/discovery-paths.js";
import {
  FileSystemError,
  type DirEntry,
  type FileKind,
  type FileStat,
  type FileSystem,
  type LineStream,
} from "./filesystem.js";

/** Everything this module needs from Tauri, injected so tests need no globals. */
export interface TauriBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  exists(path: string): Promise<boolean>;
  stat(
    path: string,
  ): Promise<{ size: number; isDirectory: boolean; isFile: boolean; mtime: Date | null }>;
  readDir(
    path: string,
  ): Promise<
    readonly { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }[]
  >;
  readFile(path: string): Promise<Uint8Array>;
  open(path: string, options: { read: true }): Promise<TauriFileHandle>;
}

export interface TauriFileHandle {
  read(buffer: Uint8Array): Promise<number | null>;
  close(): Promise<void>;
}

export interface TauriFileSystemOptions {
  readonly bridge?: TauriBridge; // defaults to the real plugin
  readonly manualRoots?: readonly string[]; // the persisted US-1.2 list
}

interface HostEnvironmentResponse {
  readonly platform: "windows" | "macos" | "linux";
  readonly localAppData: string | null;
  readonly appData: string | null;
  readonly home: string | null;
}

const READ_CHUNK_SIZE = 64 * 1024;

function createDefaultBridge(): TauriBridge {
  return {
    invoke: (cmd, args) => tauriInvoke(cmd, args),
    exists: (path) => exists(path),
    stat: (path) => stat(path),
    readDir: (path) => readDir(path),
    readFile: (path) => readFile(path),
    open: (path, options) => open(path, options),
  };
}

function toFileKind(entry: { isDirectory: boolean; isFile: boolean }): FileKind | null {
  if (entry.isDirectory) {
    return "directory";
  }
  if (entry.isFile) {
    return "file";
  }
  return null;
}

/** Never an OS message (NFR-6): `hint` is the error's class name, bounded and content-free. */
function toFileSystemError(error: unknown): FileSystemError {
  if (error instanceof FileSystemError) {
    return error;
  }
  const hint = error instanceof Error ? error.name : typeof error;
  return new FileSystemError("io", hint.slice(0, 64));
}

export async function createTauriFileSystem(options?: TauriFileSystemOptions): Promise<FileSystem> {
  const bridge = options?.bridge ?? createDefaultBridge();
  const manualRoots = options?.manualRoots ?? [];

  return {
    kind: "tauri",

    async rootCandidates(): Promise<readonly RootCandidate[]> {
      const env = await bridge.invoke<HostEnvironmentResponse>("host_environment");
      const auto = deriveRootCandidates({
        platform: env.platform,
        localAppData: env.localAppData,
        appData: env.appData,
        home: env.home,
      });
      const manual: RootCandidate[] = manualRoots.map((path) => ({
        path,
        label: path,
        origin: "manual",
      }));
      // Restored from persistence, never through the dialog on this run, so
      // the runtime scope needs an explicit grant (S7 plan §2.5) — called
      // once, unconditionally, before the candidates are returned.
      await bridge.invoke<number>("grant_read_access", { paths: manualRoots });
      return Object.freeze([...auto, ...manual]);
    },

    async stat(path: string): Promise<FileStat | null> {
      let doesExist: boolean;
      try {
        doesExist = await bridge.exists(path);
      } catch (error) {
        throw toFileSystemError(error);
      }
      if (!doesExist) {
        return null;
      }
      try {
        const info = await bridge.stat(path);
        const kind: FileKind = info.isDirectory ? "directory" : "file";
        return { kind, size: info.size, modifiedMs: info.mtime ? info.mtime.getTime() : null };
      } catch (error) {
        throw toFileSystemError(error);
      }
    },

    async listDirectory(path: string): Promise<readonly DirEntry[]> {
      let rawEntries;
      try {
        rawEntries = await bridge.readDir(path);
      } catch (error) {
        throw toFileSystemError(error);
      }
      const out: DirEntry[] = [];
      for (const entry of rawEntries) {
        // Filenames are opaque bytes: never String.prototype.normalize() the
        // name (S6 §6; every non-ASCII name in the reference tree is NFD).
        if (entry.isSymlink) {
          try {
            const info = await bridge.stat(joinPath(path, entry.name));
            const kind: FileKind = info.isDirectory ? "directory" : "file";
            out.push(Object.freeze({ name: entry.name, kind }));
          } catch {
            // Dropped rather than guessed (S7 plan §5.2).
          }
          continue;
        }
        const kind = toFileKind(entry);
        if (kind !== null) {
          out.push(Object.freeze({ name: entry.name, kind }));
        }
      }
      return Object.freeze(out);
    },

    async readFileBytes(path: string): Promise<Uint8Array> {
      try {
        return await bridge.readFile(path);
      } catch (error) {
        throw toFileSystemError(error);
      }
    },

    readLines(path: string): LineStream {
      const decoder = createLineDecoder();
      let started = false;

      async function* generate(): AsyncGenerator<string> {
        let handle: TauriFileHandle;
        try {
          handle = await bridge.open(path, { read: true });
        } catch (error) {
          throw toFileSystemError(error);
        }
        try {
          const buffer = new Uint8Array(READ_CHUNK_SIZE);
          for (;;) {
            let n: number | null;
            try {
              n = await handle.read(buffer);
            } catch (error) {
              throw toFileSystemError(error);
            }
            if (n === null) {
              break;
            }
            yield* decoder.push(buffer.subarray(0, n));
          }
          yield* decoder.finish();
        } finally {
          await handle.close();
        }
      }

      return {
        [Symbol.asyncIterator](): AsyncIterator<string> {
          if (started) {
            throw new FileSystemError("protocol", "readLines-reused");
          }
          started = true;
          return generate();
        },
        get encoding(): DetectedEncoding | null {
          return decoder.encoding;
        },
        get hadReplacement(): boolean {
          return decoder.hadReplacement;
        },
      };
    },
  };
}
