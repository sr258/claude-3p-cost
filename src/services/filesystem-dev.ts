/**
 * The HTTP-backed dev `FileSystem` (S6 plan §4.4). Client for
 * `plugins/vite-plugin-reference-fs.ts`. Never in a production bundle — the
 * only importer is `filesystem.ts`'s dynamic `import()`, guarded by
 * `createFileSystem()`'s dev/Tauri check.
 *
 * Owns the byte -> line boundary: `readLines()` feeds the response body's
 * chunks to `createLineDecoder()` from `src/model/encoding.ts`, once per
 * implementation, so the parser never sees bytes and `src/model/` keeps
 * owning the UTF-8 / UTF-8-BOM / UTF-16 rules.
 */
import { createLineDecoder, type DetectedEncoding } from "../model/encoding.js";
import type { RootCandidate } from "../model/discovery-paths.js";
import {
  FileSystemError,
  type DirEntry,
  type FileKind,
  type FileStat,
  type FileSystem,
  type LineStream,
} from "./filesystem.js";

/** The grep marker exit criterion 5 (§8) checks for in `dist/`. */
export const DEV_FS_PREFIX = "/@claude3p-fs";

export interface DevFileSystemOptions {
  readonly baseUrl?: string; // default DEV_FS_PREFIX
  readonly fetchImpl?: typeof fetch; // tests inject a stub
}

interface InfoResponseBody {
  readonly available: boolean;
  readonly label: string;
}

interface StatResponseBody {
  readonly kind: FileKind;
  readonly size: number;
  readonly modifiedMs: number | null;
}

interface ListResponseBody {
  readonly entries: readonly DirEntry[];
}

function buildUrl(baseUrl: string, endpoint: string, path?: string): string {
  if (path === undefined) {
    return `${baseUrl}${endpoint}`;
  }
  const query = new URLSearchParams({ path }).toString();
  return `${baseUrl}${endpoint}?${query}`;
}

function statusToError(status: number): FileSystemError {
  if (status === 401 || status === 403) {
    return new FileSystemError("permission", String(status));
  }
  if (status === 400 || status === 405) {
    return new FileSystemError("protocol", String(status));
  }
  return new FileSystemError("io", String(status));
}

export function createDevFileSystem(options?: DevFileSystemOptions): FileSystem {
  const baseUrl = options?.baseUrl ?? DEV_FS_PREFIX;
  const fetchImpl = options?.fetchImpl ?? fetch;

  let infoPromise: Promise<InfoResponseBody> | null = null;

  async function fetchInfo(): Promise<InfoResponseBody> {
    if (infoPromise === null) {
      infoPromise = (async (): Promise<InfoResponseBody> => {
        try {
          const response = await fetchImpl(buildUrl(baseUrl, "/info"));
          if (!response.ok) {
            return { available: false, label: "" };
          }
          const data = (await response.json()) as Partial<InfoResponseBody>;
          return {
            available: data.available === true,
            label: typeof data.label === "string" ? data.label : "",
          };
        } catch {
          return { available: false, label: "" };
        }
      })();
    }
    return infoPromise;
  }

  return {
    kind: "dev",

    async rootCandidates(): Promise<readonly RootCandidate[]> {
      // Both candidates are always reported — whether or not the reference
      // directory exists. A missing directory then degrades exactly like a
      // missing root on Windows: stat() -> null -> zero roots (S6 plan §4.4).
      const info = await fetchInfo();
      const prefix = info.label.length > 0 ? `${info.label}\\` : "";
      return Object.freeze([
        {
          path: "local-agent-mode-sessions",
          label: `${prefix}local-agent-mode-sessions`,
          origin: "auto",
        },
        {
          path: "claude-code-sessions",
          label: `${prefix}claude-code-sessions`,
          origin: "auto",
        },
      ]);
    },

    async stat(path: string): Promise<FileStat | null> {
      const response = await fetchImpl(buildUrl(baseUrl, "/stat", path));
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw statusToError(response.status);
      }
      const data = (await response.json()) as StatResponseBody;
      return { kind: data.kind, size: data.size, modifiedMs: data.modifiedMs ?? null };
    },

    async listDirectory(path: string): Promise<readonly DirEntry[]> {
      const response = await fetchImpl(buildUrl(baseUrl, "/list", path));
      if (!response.ok) {
        throw statusToError(response.status);
      }
      const data = (await response.json()) as ListResponseBody;
      return Object.freeze(
        data.entries.map((entry) => Object.freeze({ name: entry.name, kind: entry.kind })),
      );
    },

    async readFileBytes(path: string): Promise<Uint8Array> {
      const response = await fetchImpl(buildUrl(baseUrl, "/read", path));
      if (!response.ok) {
        throw statusToError(response.status);
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    },

    readLines(path: string): LineStream {
      const decoder = createLineDecoder();
      let started = false;

      async function* generate(): AsyncGenerator<string> {
        const response = await fetchImpl(buildUrl(baseUrl, "/read", path));
        if (!response.ok) {
          throw statusToError(response.status);
        }
        const body = response.body;
        if (body === null || body === undefined) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          yield* decoder.push(bytes);
          yield* decoder.finish();
          return;
        }
        const reader = body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            yield* decoder.push(value);
          }
        }
        yield* decoder.finish();
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
