import { describe, expect, it, vi } from "vitest";
import { createDevFileSystem, DEV_FS_PREFIX } from "./filesystem-dev.js";

function jsonResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  } as unknown as Response;
}

function bytesResponse(status: number, bytes: Uint8Array): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    body: null,
  } as unknown as Response;
}

function streamResponse(chunks: readonly Uint8Array[]): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else {
        controller.close();
      }
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe("createDevFileSystem", () => {
  it("encodes each path segment and never sends a raw space", async () => {
    const fetchImpl = vi.fn(async (_url: string) => jsonResponse(404, { error: "not-found" }));
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await fs.stat("a b/söme naïve");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).not.toContain(" ");
    expect(url.startsWith(`${DEV_FS_PREFIX}/stat?path=`)).toBe(true);
  });

  it("returns null from stat on 404 instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { error: "not-found" }));
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(fs.stat("missing/root")).resolves.toBeNull();
  });

  it("throws a FileSystemError whose message contains no path", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { error: "io" }));
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const secretPath = "account42/profile-secret/session-xyz/audit.jsonl";
    await expect(fs.readFileBytes(secretPath)).rejects.toMatchObject({
      name: "FileSystemError",
      code: "io",
    });
    try {
      await fs.readFileBytes(secretPath);
      throw new Error("expected readFileBytes to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("secret");
      expect((error as Error).message).not.toContain("session-xyz");
      expect((error as Error).message).toBe("filesystem:io");
    }
  });

  it("decodes a UTF-16LE body with a BOM into lines", async () => {
    const text = "hello\nworld";
    const codeUnits = new Uint8Array(text.length * 2 + 2);
    codeUnits[0] = 0xff;
    codeUnits[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      codeUnits[2 + i * 2] = code & 0xff;
      codeUnits[2 + i * 2 + 1] = (code >> 8) & 0xff;
    }
    const fetchImpl = vi.fn(async () => bytesResponse(200, codeUnits));
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const stream = fs.readLines("profile/audit.jsonl");
    const lines: string[] = [];
    for await (const line of stream) {
      lines.push(line);
    }
    expect(lines).toEqual(["hello", "world"]);
    expect(stream.encoding).toBe("utf-16le");
    expect(stream.hadReplacement).toBe(false);
  });

  it("yields a line split across two stream chunks exactly once", async () => {
    // "hügel\n" — the multi-byte ü (0xC3 0xBC) is split across the chunk
    // boundary. A per-chunk TextDecoder without persisted stream state, or
    // one re-created per chunk, mangles this; a decoder that reads the
    // whole body first also survives it, but never in one round trip.
    const full = new TextEncoder().encode("hügel\n");
    const chunk1 = full.slice(0, 2); // "h" + first byte of ü
    const chunk2 = full.slice(2); // second byte of ü + "gel\n"
    const fetchImpl = vi.fn(async () => streamResponse([chunk1, chunk2]));
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const stream = fs.readLines("profile/audit.jsonl");
    const lines: string[] = [];
    for await (const line of stream) {
      lines.push(line);
    }
    expect(lines).toEqual(["hügel"]);
  });

  it("reports hadReplacement for undecodable bytes", async () => {
    const bytes = new Uint8Array([0x68, 0xff, 0x0a]); // "h" + invalid byte + "\n"
    const fetchImpl = vi.fn(async () => streamResponse([bytes]));
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const stream = fs.readLines("profile/audit.jsonl");
    const lines: string[] = [];
    for await (const line of stream) {
      lines.push(line);
    }
    expect(stream.hadReplacement).toBe(true);
  });

  it("returns both dev root candidates even when info reports available false", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/info")) {
        return jsonResponse(200, { available: false, label: "" });
      }
      return jsonResponse(404, { error: "not-found" });
    });
    const fs = createDevFileSystem({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const candidates = await fs.rootCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.path)).toEqual([
      "local-agent-mode-sessions",
      "claude-code-sessions",
    ]);
  });
});
