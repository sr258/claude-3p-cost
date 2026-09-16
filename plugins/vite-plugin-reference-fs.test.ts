import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import referenceFsPlugin, { type ReferenceFsOptions } from "./vite-plugin-reference-fs.js";

const PREFIX = "/@claude3p-fs";

class FakeRes {
  statusCode = 200;
  headers: Record<string, string> = {};
  body: Buffer | null = null;
  ended = false;

  setHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  end(data?: unknown): void {
    this.ended = true;
    if (data === undefined) {
      this.body = null;
    } else if (Buffer.isBuffer(data)) {
      this.body = data;
    } else {
      this.body = Buffer.from(String(data));
    }
  }
}

interface CallResult {
  readonly res: FakeRes;
  readonly nextCalled: boolean;
}

async function callMiddleware(
  options: ReferenceFsOptions | undefined,
  root: string,
  urlPath: string,
  method = "GET",
): Promise<CallResult> {
  const plugin = referenceFsPlugin(options);
  let handler:
    ((req: { url: string; method: string }, res: FakeRes, next: () => void) => unknown) | undefined;
  const server = {
    config: { root },
    middlewares: { use: (h: typeof handler) => (handler = h) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hook = (plugin.configureServer as any)(server);
  if (hook && typeof hook.then === "function") {
    await hook;
  }
  if (handler === undefined) {
    throw new Error("middleware was never registered");
  }
  let nextCalled = false;
  const res = new FakeRes();
  await handler({ url: urlPath, method }, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

function bodyJson(res: FakeRes): unknown {
  return JSON.parse(res.body?.toString("utf-8") ?? "null");
}

describe("referenceFsPlugin", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempTree(): { realDir: string; symlinkDir: string } {
    const base = mkdtempSync(join(tmpdir(), "claude3pcost-fs-"));
    tempDirs.push(base);
    const realDir = join(base, "real");
    mkdirSync(realDir);
    const symlinkDir = join(base, "link");
    symlinkSync(realDir, symlinkDir, "dir");
    return { realDir, symlinkDir };
  }

  it("serves a file under a root reached through a symlink", async () => {
    // The case this repository actually has: reference-material/ is a
    // symlink. A resolve()-only confinement check 403s the whole tree.
    const { realDir, symlinkDir } = makeTempTree();
    writeFileSync(join(realDir, "note.txt"), "hello world");

    const listResult = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/list?path=`,
    );
    expect(listResult.res.statusCode).toBe(200);
    const listBody = bodyJson(listResult.res) as { entries: { name: string; kind: string }[] };
    expect(listBody.entries).toEqual([{ name: "note.txt", kind: "file" }]);

    const readResult = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/read?path=note.txt`,
    );
    expect(readResult.res.statusCode).toBe(200);
    expect(readResult.res.body?.toString("utf-8")).toBe("hello world");
  });

  it("rejects a path containing a '..' segment", async () => {
    const { symlinkDir } = makeTempTree();
    const result = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/read?path=${encodeURIComponent("../secret")}`,
    );
    // isUnsafeRelativePath rejects ".." before any filesystem access (§4.7).
    expect(result.res.statusCode).toBe(400);
  });

  it("rejects a symlink inside the tree that points outside it", async () => {
    // A string-prefix check on the joined path passes this wrongly.
    const base = mkdtempSync(join(tmpdir(), "claude3pcost-fs-"));
    tempDirs.push(base);
    const outside = join(base, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "top secret");
    const served = join(base, "served");
    mkdirSync(served);
    symlinkSync(join(outside, "secret.txt"), join(served, "escape.txt"));

    const result = await callMiddleware(
      { dir: served },
      process.cwd(),
      `${PREFIX}/read?path=escape.txt`,
    );
    expect(result.res.statusCode).toBe(403);
    const body = bodyJson(result.res) as { error: string };
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("returns 404 for a missing path and names no path in the body", async () => {
    const { symlinkDir } = makeTempTree();
    const result = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/stat?path=doesnotexist.txt`,
    );
    expect(result.res.statusCode).toBe(404);
    expect(JSON.stringify(bodyJson(result.res))).not.toContain("doesnotexist");
  });

  it("lists and serves back a decomposed-umlaut filename unchanged", async () => {
    const { realDir, symlinkDir } = makeTempTree();
    const nfdName = "München.txt"; // "u" + combining diaeresis, decomposed
    writeFileSync(join(realDir, nfdName), "bavaria");

    const listResult = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/list?path=`,
    );
    const listBody = bodyJson(listResult.res) as { entries: { name: string }[] };
    expect(listBody.entries.map((e) => e.name)).toEqual([nfdName]);

    const readResult = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/read?path=${encodeURIComponent(nfdName)}`,
    );
    expect(readResult.res.body?.toString("utf-8")).toBe("bavaria");
  });

  it("rejects a non-GET method with 405", async () => {
    const { symlinkDir } = makeTempTree();
    const result = await callMiddleware(
      { dir: symlinkDir },
      process.cwd(),
      `${PREFIX}/list?path=`,
      "POST",
    );
    expect(result.res.statusCode).toBe(405);
  });

  it("reports available false when the configured directory does not exist", async () => {
    const base = mkdtempSync(join(tmpdir(), "claude3pcost-fs-"));
    tempDirs.push(base);
    const missing = join(base, "does-not-exist");

    const result = await callMiddleware({ dir: missing }, process.cwd(), `${PREFIX}/info`);
    expect(result.res.statusCode).toBe(200);
    const body = bodyJson(result.res) as { available: boolean; label: string };
    expect(body.available).toBe(false);

    const readResult = await callMiddleware(
      { dir: missing },
      process.cwd(),
      `${PREFIX}/read?path=`,
    );
    expect(readResult.res.statusCode).toBe(404);
  });

  it("passes through a request that does not start with the prefix", async () => {
    const { symlinkDir } = makeTempTree();
    const result = await callMiddleware({ dir: symlinkDir }, process.cwd(), "/index.html");
    expect(result.nextCalled).toBe(true);
    expect(result.res.ended).toBe(false);
  });

  it("applies only to the dev server", () => {
    const plugin = referenceFsPlugin();
    expect(plugin.apply).toBe("serve");
  });
});
