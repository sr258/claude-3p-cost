// @vitest-environment node
//
// jsdom rewrites `new URL(relative, import.meta.url)` against its own
// document base URI (LEARNINGS: "a spec that boots a Vite dev server needs
// `// @vitest-environment node`" — the same jsdom-vs-Node realm mismatch,
// here hitting `fileURLToPath` instead of `TextEncoder`). This file needs
// Node's URL/fs to locate the UTF-16LE fixture, not a DOM.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FileSystemError } from "./filesystem.js";
import {
  createTauriFileSystem,
  type TauriBridge,
  type TauriFileHandle,
} from "./filesystem-tauri.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../test/fixtures/utf16le-lines.bin", import.meta.url),
);

function makeBridge(overrides: Partial<TauriBridge> = {}): TauriBridge {
  return {
    invoke: vi.fn(async () => {
      throw new Error("invoke not stubbed");
    }),
    exists: vi.fn(async () => false),
    stat: vi.fn(async () => {
      throw new Error("stat not stubbed");
    }),
    readDir: vi.fn(async () => []),
    readFile: vi.fn(async () => new Uint8Array()),
    open: vi.fn(async () => {
      throw new Error("open not stubbed");
    }),
    ...overrides,
  };
}

describe("createTauriFileSystem", () => {
  describe("rootCandidates", () => {
    it("maps the Rust host environment through the pure model function", async () => {
      const bridge = makeBridge({
        invoke: vi.fn(async (cmd: string) => {
          if (cmd === "host_environment") {
            return {
              platform: "windows",
              localAppData: "C:/Users/invented/AppData/Local",
              appData: "C:/Users/invented/AppData/Roaming",
              home: null,
            } as never;
          }
          return 0 as never;
        }),
      });
      const fs = await createTauriFileSystem({ bridge });

      const candidates = await fs.rootCandidates();

      expect(candidates.map((c) => c.path)).toEqual([
        "C:/Users/invented/AppData/Local/Claude-3p/local-agent-mode-sessions",
        "C:/Users/invented/AppData/Local/Claude-3p/claude-code-sessions",
        "C:/Users/invented/AppData/Roaming/Claude/local-agent-mode-sessions",
        "C:/Users/invented/AppData/Roaming/Claude/claude-code-sessions",
      ]);
      expect(candidates.every((c) => c.origin === "auto")).toBe(true);
    });

    it("on a Linux host with only XDG-mapped bases yields those candidates", async () => {
      const bridge = makeBridge({
        invoke: vi.fn(async (cmd: string) => {
          if (cmd === "host_environment") {
            return {
              platform: "linux",
              localAppData: "/home/invented/.local/share",
              appData: "/home/invented/.config",
              home: "/home/invented",
            } as never;
          }
          return 0 as never;
        }),
      });
      const fs = await createTauriFileSystem({ bridge });

      const candidates = await fs.rootCandidates();

      expect(candidates.map((c) => c.path)).toEqual([
        "/home/invented/.local/share/Claude-3p/local-agent-mode-sessions",
        "/home/invented/.local/share/Claude-3p/claude-code-sessions",
        "/home/invented/.config/Claude/local-agent-mode-sessions",
        "/home/invented/.config/Claude/claude-code-sessions",
      ]);
    });

    it("appends persisted manual roots and grants read access for them", async () => {
      const invoke = vi.fn(async (cmd: string) => {
        if (cmd === "host_environment") {
          return { platform: "linux", localAppData: null, appData: null, home: null } as never;
        }
        return 2 as never;
      });
      const bridge = makeBridge({ invoke });
      const fs = await createTauriFileSystem({
        bridge,
        manualRoots: ["/invented/backup", "/invented/archive"],
      });

      const candidates = await fs.rootCandidates();

      expect(candidates).toEqual([
        { path: "/invented/backup", label: "/invented/backup", origin: "manual" },
        { path: "/invented/archive", label: "/invented/archive", origin: "manual" },
      ]);
      expect(invoke).toHaveBeenCalledWith("grant_read_access", {
        paths: ["/invented/backup", "/invented/archive"],
      });
    });
  });

  describe("stat", () => {
    it("returns null for a path that does not exist", async () => {
      const bridge = makeBridge({ exists: vi.fn(async () => false) });
      const fs = await createTauriFileSystem({ bridge });

      await expect(fs.stat("invented/missing")).resolves.toBeNull();
    });

    it("maps a directory and a file", async () => {
      const bridge = makeBridge({
        exists: vi.fn(async () => true),
        stat: vi.fn(async () => ({
          size: 0,
          isDirectory: true,
          isFile: false,
          mtime: new Date("2026-01-01T00:00:00Z"),
        })),
      });
      const fs = await createTauriFileSystem({ bridge });
      await expect(fs.stat("invented/dir")).resolves.toEqual({
        kind: "directory",
        size: 0,
        modifiedMs: new Date("2026-01-01T00:00:00Z").getTime(),
      });

      const fileBridge = makeBridge({
        exists: vi.fn(async () => true),
        stat: vi.fn(async () => ({ size: 42, isDirectory: false, isFile: true, mtime: null })),
      });
      const fileFs = await createTauriFileSystem({ bridge: fileBridge });
      await expect(fileFs.stat("invented/file.txt")).resolves.toEqual({
        kind: "file",
        size: 42,
        modifiedMs: null,
      });
    });
  });

  describe("listDirectory", () => {
    it("maps entries and resolves a symlink entry with a follow-up stat", async () => {
      const bridge = makeBridge({
        readDir: vi.fn(async () => [
          { name: "sessA", isDirectory: true, isFile: false, isSymlink: false },
          { name: "linked", isDirectory: false, isFile: false, isSymlink: true },
        ]),
        stat: vi.fn(async () => ({ size: 0, isDirectory: true, isFile: false, mtime: null })),
      });
      const fs = await createTauriFileSystem({ bridge });

      const entries = await fs.listDirectory("invented/root");

      expect(entries).toEqual([
        { name: "sessA", kind: "directory" },
        { name: "linked", kind: "directory" },
      ]);
    });

    it("drops a symlink entry rather than guessing when the follow-up stat fails", async () => {
      const bridge = makeBridge({
        readDir: vi.fn(async () => [
          { name: "broken-link", isDirectory: false, isFile: false, isSymlink: true },
        ]),
        stat: vi.fn(async () => {
          throw new Error("dangling symlink");
        }),
      });
      const fs = await createTauriFileSystem({ bridge });

      const entries = await fs.listDirectory("invented/root");

      expect(entries).toEqual([]);
    });

    it("does not Unicode-normalise an NFD filename", async () => {
      // "é" as NFD (e + combining acute) — every non-ASCII name in the
      // reference tree is NFD; normalising it would break a later join.
      const nfdName = "caf\u0065\u0301";
      const bridge = makeBridge({
        readDir: vi.fn(async () => [
          { name: nfdName, isDirectory: true, isFile: false, isSymlink: false },
        ]),
      });
      const fs = await createTauriFileSystem({ bridge });

      const entries = await fs.listDirectory("invented/root");

      expect(entries[0]!.name).toBe(nfdName);
      expect(entries[0]!.name.normalize("NFC")).not.toBe(entries[0]!.name);
    });
  });

  describe("readLines", () => {
    function makeHandle(chunks: readonly Uint8Array[]): {
      handle: TauriFileHandle;
      close: () => number;
    } {
      let index = 0;
      let closeCount = 0;
      const handle: TauriFileHandle = {
        async read(buffer) {
          if (index >= chunks.length) {
            return null;
          }
          const chunk = chunks[index]!;
          buffer.set(chunk, 0);
          index += 1;
          return chunk.byteLength;
        },
        async close() {
          closeCount += 1;
        },
      };
      return { handle, close: () => closeCount };
    }

    function chunk3(bytes: Uint8Array): Uint8Array[] {
      const third = Math.ceil(bytes.length / 3);
      return [
        bytes.subarray(0, third),
        bytes.subarray(third, third * 2),
        bytes.subarray(third * 2),
      ];
    }

    it("decodes a UTF-16LE BOM fixture delivered in three chunks", async () => {
      const bytes = readFileSync(FIXTURE_PATH);
      const chunks = chunk3(new Uint8Array(bytes));
      const { handle } = makeHandle(chunks);
      const bridge = makeBridge({ open: vi.fn(async () => handle) });
      const fs = await createTauriFileSystem({ bridge });

      const stream = fs.readLines("invented/audit.jsonl");
      const lines: string[] = [];
      for await (const line of stream) {
        lines.push(line);
      }

      expect(lines).toEqual(["invented-line-one", "invented-läne-two"]);
      expect(stream.encoding).toBe("utf-16le");
      expect(stream.hadReplacement).toBe(false);
    });

    it("reports encoding and hadReplacement after iteration", async () => {
      const bytes = new TextEncoder().encode("plain\n");
      const { handle } = makeHandle([bytes]);
      const bridge = makeBridge({ open: vi.fn(async () => handle) });
      const fs = await createTauriFileSystem({ bridge });

      const stream = fs.readLines("invented/audit.jsonl");
      expect(stream.encoding).toBeNull();
      for await (const _line of stream) {
        // draining
      }
      expect(stream.encoding).toBe("utf-8");
      expect(stream.hadReplacement).toBe(false);
    });

    it("closes the file handle when the consumer throws", async () => {
      const bytes = new TextEncoder().encode("one\ntwo\n");
      const { handle, close } = makeHandle([bytes]);
      const bridge = makeBridge({ open: vi.fn(async () => handle) });
      const fs = await createTauriFileSystem({ bridge });

      const stream = fs.readLines("invented/audit.jsonl");
      await expect(
        (async () => {
          for await (const _line of stream) {
            throw new Error("consumer failure");
          }
        })(),
      ).rejects.toThrow("consumer failure");
      expect(close()).toBe(1);
    });

    it("rejects a second iteration", async () => {
      const bytes = new TextEncoder().encode("one\n");
      const { handle } = makeHandle([bytes]);
      const bridge = makeBridge({ open: vi.fn(async () => handle) });
      const fs = await createTauriFileSystem({ bridge });

      const stream = fs.readLines("invented/audit.jsonl");
      for await (const _line of stream) {
        // first, legitimate iteration
      }
      expect(() => stream[Symbol.asyncIterator]()).toThrow(FileSystemError);
    });

    it("surfaces a FileSystemError whose message contains no path when open fails", async () => {
      const secretPath = "account42/profile-secret/session-xyz/audit.jsonl";
      const bridge = makeBridge({
        open: vi.fn(async () => {
          throw new Error(`ENOENT: no such file or directory, open '${secretPath}'`);
        }),
      });
      const fs = await createTauriFileSystem({ bridge });

      const stream = fs.readLines(secretPath);
      try {
        for await (const _line of stream) {
          // never reached
        }
        throw new Error("expected readLines to reject");
      } catch (error) {
        expect(error).toBeInstanceOf(FileSystemError);
        expect((error as Error).message).toBe("filesystem:io");
        expect((error as Error).message).not.toContain("secret");
        expect((error as Error).message).not.toContain("session-xyz");
      }
    });
  });

  describe("readFileBytes", () => {
    it("surfaces a FileSystemError whose message contains no path", async () => {
      const secretPath = "account42/profile-secret/spaces.json";
      const bridge = makeBridge({
        readFile: vi.fn(async () => {
          throw new Error(`permission denied: '${secretPath}'`);
        }),
      });
      const fs = await createTauriFileSystem({ bridge });

      await expect(fs.readFileBytes(secretPath)).rejects.toMatchObject({
        name: "FileSystemError",
        code: "io",
        message: "filesystem:io",
      });
    });
  });
});
