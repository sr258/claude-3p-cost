/**
 * Read-only dev-server middleware exposing `reference-material/` over HTTP
 * (NFR-13, S6 plan §4.7). `apply: "serve"` — never instantiated during
 * `vite build`. Confines every request to the REALPATH'd configured
 * directory, resolved once at server start: `poc/`, `reference-material/`
 * and `calview/` are symlinks at the repository root (CLAUDE.md), and a
 * confinement check written against the configured path rejects the whole
 * tree (plan §10 trap 1). No response body, header or log line ever
 * contains a path, a file name or file content (NFR-6).
 */
import { promises as fsp } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { isUnsafeRelativePath, joinPath, normalizePath, pathBasename } from "../src/model/paths.js";

export interface ReferenceFsOptions {
  readonly dir?: string; // default: process.env.CLAUDE3P_REFERENCE_DIR ?? "./reference-material"
  readonly prefix?: string; // default: "/@claude3p-fs"
}

const DEFAULT_DIR = "./reference-material";
const DEFAULT_PREFIX = "/@claude3p-fs";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

interface ResolvedBase {
  /** realpath'd, forward-slash normalised. */
  readonly norm: string;
}

type ConfineResult =
  | { readonly outcome: "ok"; readonly real: string }
  | { readonly outcome: "not-found" }
  | { readonly outcome: "forbidden" };

/** Joins a root-relative request path onto the realpath'd base and confines
 * the result to it, catching a symlink INSIDE the tree that points out
 * (plan §10 trap 1: realpathing the joined result, not just resolving the
 * string, is what catches that case). Caller must reject an unsafe raw path
 * before calling this. */
async function resolveConfined(base: ResolvedBase, rawPath: string): Promise<ConfineResult> {
  const joined = joinPath(base.norm, rawPath);
  let real: string;
  try {
    real = await fsp.realpath(joined);
  } catch {
    return { outcome: "not-found" };
  }
  const realNorm = normalizePath(real);
  if (realNorm !== base.norm && !realNorm.startsWith(`${base.norm}/`)) {
    return { outcome: "forbidden" };
  }
  return { outcome: "ok", real };
}

export default function referenceFsPlugin(options?: ReferenceFsOptions): Plugin {
  const configuredDir = options?.dir ?? process.env.CLAUDE3P_REFERENCE_DIR ?? DEFAULT_DIR;
  const prefix = options?.prefix ?? DEFAULT_PREFIX;

  return {
    name: "vite-plugin-reference-fs",
    apply: "serve",

    async configureServer(server) {
      // Resolved once, at server start (plan §10 trap 1).
      const target = resolve(server.config.root, configuredDir);
      let base: ResolvedBase | null = null;
      try {
        const native = await fsp.realpath(target);
        base = { norm: normalizePath(native) };
      } catch {
        base = null;
      }
      const label = base !== null ? pathBasename(base.norm) : "";

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url || !req.url.startsWith(prefix)) {
          next();
          return;
        }

        if (req.method !== "GET") {
          sendJson(res, 405, { error: "method-not-allowed" });
          return;
        }

        const url = new URL(req.url, "http://localhost");
        const endpoint = url.pathname.slice(prefix.length);

        if (endpoint === "/info") {
          sendJson(res, 200, { available: base !== null, label });
          return;
        }

        if (base === null) {
          sendJson(res, 404, { error: "not-found" });
          return;
        }

        const rawPath = url.searchParams.get("path") ?? "";
        if (isUnsafeRelativePath(rawPath)) {
          sendJson(res, 400, { error: "bad-path" });
          return;
        }

        const confined = await resolveConfined(base, rawPath);
        if (confined.outcome === "not-found") {
          sendJson(res, 404, { error: "not-found" });
          return;
        }
        if (confined.outcome === "forbidden") {
          sendJson(res, 403, { error: "forbidden" });
          return;
        }
        const real = confined.real;

        if (endpoint === "/list") {
          let entries;
          try {
            entries = await fsp.readdir(real, { withFileTypes: true });
          } catch {
            sendJson(res, 404, { error: "not-found" });
            return;
          }
          sendJson(res, 200, {
            entries: entries.map((entry) => ({
              name: entry.name,
              kind: entry.isDirectory() ? "directory" : "file",
            })),
          });
          return;
        }

        if (endpoint === "/stat") {
          let stats;
          try {
            stats = await fsp.stat(real);
          } catch {
            sendJson(res, 404, { error: "not-found" });
            return;
          }
          sendJson(res, 200, {
            kind: stats.isDirectory() ? "directory" : "file",
            size: stats.size,
            modifiedMs: stats.mtimeMs,
          });
          return;
        }

        if (endpoint === "/read") {
          let data: Buffer;
          try {
            data = await fsp.readFile(real);
          } catch {
            sendJson(res, 404, { error: "not-found" });
            return;
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.end(data);
          return;
        }

        sendJson(res, 404, { error: "not-found" });
      });
    },
  };
}
