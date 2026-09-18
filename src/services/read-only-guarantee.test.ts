/**
 * US-1.6: nothing this app can reach may write, rename, move or delete
 * inside a session root (S7 plan §8). This test does not trust the
 * implementation it is checking — it is built so a WRONG analyser gives a
 * different answer, per LEARNINGS ("build a test so the wrong
 * implementation gives a different answer"). Part 3 is the self-check that
 * makes that true.
 *
 * `node:fs` is used here, in a test file, to read the real module graph —
 * production code under `src/` never does this.
 */
// @vitest-environment node
//
// jsdom rewrites `new URL(relative, import.meta.url)` against its own
// document base URI (LEARNINGS: "a spec that boots a Vite dev server needs
// `// @vitest-environment node`" — the same jsdom-vs-Node realm mismatch).
// This file needs Node's real `import.meta.url` to locate the module graph
// and the capability file on disk, not a DOM.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = fileURLToPath(new URL("../", import.meta.url));

const BANNED_FS_NAMES = new Set([
  "create",
  "writeFile",
  "writeTextFile",
  "mkdir",
  "remove",
  "rename",
  "copyFile",
  "truncate",
]);

const ALLOWED_INVOKE_COMMANDS = new Set(["host_environment", "grant_read_access"]);

const FS_PLUGIN_SPECIFIER = "@tauri-apps/plugin-fs";
const CORE_SPECIFIER = "@tauri-apps/api/core";

type ViolationKind =
  | "write-import"
  | "namespace-import"
  | "write-call"
  | "invoke-not-allowlisted"
  | "raw-write-invoke";

interface Violation {
  readonly kind: ViolationKind;
  readonly file: string;
  readonly detail: string;
}

const STATIC_IMPORT_RE = /^\s*import\s+([^;]+?)\s+from\s*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;
const WRITE_CALL_RE = /\.(write|writeText|truncate)\s*\(/g;
const RAW_WRITE_INVOKE_RE = /plugin:fs\|(write|create|mkdir|remove|rename|copy|truncate)/g;

/**
 * Strips `/* *‍/` and `//` comments so a doc comment that happens to contain
 * the word "import" (this very file has one) cannot be mistaken for code.
 * Deliberately simple — it runs over this project's own source tree, not
 * arbitrary input — but still comment-aware rather than naive, per
 * LEARNINGS' "build a test so the wrong implementation gives a different
 * answer": a regex fooled by its own prose is exactly that trap.
 */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Resolves a relative specifier from `fromFile` to an existing `.ts` file, or null. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null; // a package specifier — not part of the traversal
  }
  const base = join(dirname(fromFile), specifier);
  const candidates = [
    base,
    base.endsWith(".js") ? base.slice(0, -3) + ".ts" : `${base}.ts`,
    join(base, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Every local name bound to `invoke` from `@tauri-apps/api/core` in this
 * file, aliases included. A bare `/\binvoke\(/` is not enough: the project's
 * own idiom is `import { invoke as tauriInvoke }`, so a check that only
 * knew the name `invoke` would sail straight past
 * `tauriInvoke("fs_delete_everything")` — verified as a real miss before
 * this was added.
 */
function invokeBindings(source: string): string[] {
  const names = new Set<string>(["invoke"]);
  for (const match of source.matchAll(STATIC_IMPORT_RE)) {
    if (match[2] !== CORE_SPECIFIER) {
      continue;
    }
    const named = /^\{([^}]*)\}$/.exec(match[1]!.trim());
    if (!named) {
      continue;
    }
    for (const rawName of named[1]!.split(",")) {
      const parts = rawName.split(/\s+as\s+/).map((part) => part.trim());
      const [imported, alias] = parts;
      if (imported === "invoke" && alias !== undefined && IDENTIFIER_RE.test(alias)) {
        names.add(alias);
      }
    }
  }
  return [...names];
}

function invokeCallRegExp(source: string): RegExp {
  const alternatives = invokeBindings(source).join("|");
  return new RegExp(`\\b(?:${alternatives})(?:<[^>()]*>)?\\s*\\(\\s*["']([^"']+)["']`, "g");
}

function collectSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(STATIC_IMPORT_RE)) {
    specifiers.push(match[2]!);
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
    specifiers.push(match[1]!);
  }
  return specifiers;
}

/** BFS over relative imports/`import()`s, starting from `entryFiles`. Absolute paths -> source text. */
function loadReachableGraph(entryFiles: readonly string[]): Map<string, string> {
  const graph = new Map<string, string>();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (graph.has(file)) {
      continue;
    }
    const source = stripComments(readFileSync(file, "utf-8"));
    graph.set(file, source);
    for (const specifier of collectSpecifiers(source)) {
      const resolved = resolveRelative(file, specifier);
      if (resolved !== null && !graph.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return graph;
}

/** The checks Part 1 and Part 3 both run, over a `file -> source` map. */
function analyse(sources: ReadonlyMap<string, string>): Violation[] {
  const violations: Violation[] = [];

  for (const [file, source] of sources) {
    for (const match of source.matchAll(STATIC_IMPORT_RE)) {
      const [, clause, specifier] = match;
      if (specifier !== FS_PLUGIN_SPECIFIER) {
        continue;
      }
      const trimmedClause = clause!.trim();
      const namedMatch = /^\{([^}]*)\}$/.exec(trimmedClause);
      if (namedMatch) {
        for (const rawName of namedMatch[1]!.split(",")) {
          const name = rawName.split(/\s+as\s+/)[0]!.trim();
          if (name.length > 0 && BANNED_FS_NAMES.has(name)) {
            violations.push({ kind: "write-import", file, detail: name });
          }
        }
      } else {
        // A namespace (`* as x`) or default (`x`) import — either defeats
        // name-level analysis (S7 plan §2.2) and is banned outright.
        violations.push({ kind: "namespace-import", file, detail: trimmedClause });
      }
    }

    for (const match of source.matchAll(WRITE_CALL_RE)) {
      violations.push({ kind: "write-call", file, detail: match[0] });
    }

    for (const match of source.matchAll(invokeCallRegExp(source))) {
      const command = match[1]!;
      if (!ALLOWED_INVOKE_COMMANDS.has(command)) {
        violations.push({ kind: "invoke-not-allowlisted", file, detail: command });
      }
    }

    for (const match of source.matchAll(RAW_WRITE_INVOKE_RE)) {
      violations.push({ kind: "raw-write-invoke", file, detail: match[0] });
    }
  }

  return violations;
}

const ENTRY_FILES = [
  join(SRC_ROOT, "services/scan.ts"),
  join(SRC_ROOT, "services/discovery.ts"),
  join(SRC_ROOT, "services/filesystem.ts"),
  join(SRC_ROOT, "services/filesystem-tauri.ts"),
];

describe("US-1.6 read-only guarantee — static analysis over the real module graph", () => {
  const graph = loadReachableGraph(ENTRY_FILES);
  const violations = analyse(graph);

  it("reaches more than the four entry files (the traversal itself works)", () => {
    // A sanity floor: if resolution silently stopped working the checks
    // below would trivially pass over a near-empty graph.
    expect(graph.size).toBeGreaterThan(6);
  });

  it("no reachable module imports a write API from @tauri-apps/plugin-fs", () => {
    expect(violations.filter((v) => v.kind === "write-import")).toEqual([]);
  });

  it("no reachable module uses a namespace or default import of the fs plugin", () => {
    expect(violations.filter((v) => v.kind === "namespace-import")).toEqual([]);
  });

  it("no reachable module calls .write / .writeText / .truncate on a file handle", () => {
    expect(violations.filter((v) => v.kind === "write-call")).toEqual([]);
  });

  it("the scanner graph invokes only host_environment and grant_read_access", () => {
    expect(violations.filter((v) => v.kind === "invoke-not-allowlisted")).toEqual([]);
  });

  it("no reachable module contains a raw plugin:fs write invoke string", () => {
    expect(violations.filter((v) => v.kind === "raw-write-invoke")).toEqual([]);
  });
});

describe("US-1.6 read-only guarantee — the capability file", () => {
  const capabilityPath = join(SRC_ROOT, "../src-tauri/capabilities/default.json");
  const capability = JSON.parse(readFileSync(capabilityPath, "utf-8")) as {
    permissions: readonly string[];
  };

  it("the capability file grants no write permission and no blanket fs set", () => {
    const writeLike = capability.permissions.filter((p) =>
      /^fs:.*(write|create|mkdir|remove|rename|copy|truncate)/.test(p),
    );
    expect(writeLike).toEqual([]);

    const blanket = new Set(["fs:default", "fs:read-all", "fs:write-all", "fs:scope"]);
    expect(capability.permissions.filter((p) => blanket.has(p))).toEqual([]);
  });
});

describe("US-1.6 read-only guarantee — the analyser self-check", () => {
  it("reports exactly three violations for a known-bad source", () => {
    const knownBad = `
import { writeTextFile } from "@tauri-apps/plugin-fs";

export async function bad(handle: { write(b: Uint8Array): Promise<number> }) {
  await handle.write(new Uint8Array());
  await invoke("fs_delete_everything");
}
`;
    const violations = analyse(new Map([["known-bad.ts", knownBad]]));

    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.kind).sort()).toEqual(
      ["invoke-not-allowlisted", "write-call", "write-import"].sort(),
    );
  });

  it("reports an invoke that reaches a non-allowlisted command through an alias", () => {
    const knownBad = `
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export async function bad() {
  await tauriInvoke("host_environment");
  await tauriInvoke("fs_delete_everything");
}
`;
    const violations = analyse(new Map([["known-bad-alias.ts", knownBad]]));

    expect(violations).toEqual([
      {
        kind: "invoke-not-allowlisted",
        file: "known-bad-alias.ts",
        detail: "fs_delete_everything",
      },
    ]);
  });
});
