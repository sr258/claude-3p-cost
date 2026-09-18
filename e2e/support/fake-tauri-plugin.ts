/**
 * The aliased stand-in for `@tauri-apps/plugin-fs` and `@tauri-apps/api/core`
 * (S8 plan §6.8, §2 Q1). `vite.config.ts` aliases both specifiers to this
 * module only under `--mode e2e`; `src/` never imports it and stays
 * test-unaware.
 *
 * This is the entire read surface `filesystem-tauri.ts` imports: no
 * `create`, `writeFile`, `mkdir`, `remove`, `rename`, `copyFile` or
 * `truncate` exists in this module at all, so
 * `read-only-guarantee.test.ts` is unaffected by its presence.
 *
 * The tree is read at module load from `globalThis.__C3P_E2E_TREE__`,
 * installed by `e2e/support/app.ts` via `addInitScript` before navigation.
 */

export interface FakeTree {
  readonly directories: readonly string[];
  /** Text content, UTF-8. Paths are POSIX-normalised, as src/model/paths.ts emits. */
  readonly files: Readonly<Record<string, string>>;
  readonly hostEnvironment: {
    readonly platform: "windows" | "macos" | "linux";
    readonly localAppData: string | null;
    readonly appData: string | null;
    readonly home: string | null;
  };
}

/**
 * The grep marker `scripts/check-no-fake.js` looks for in `dist/`. Chosen to
 * be impossible to occur in production source by accident. Do not rename
 * without updating that script and re-running its negative control (plan §8,
 * LEARNINGS: a static guard is only as good as its last negative control).
 */
export const C3P_E2E_FAKE_TAURI_PLUGIN_MARKER = "__C3P_E2E_FAKE_TAURI_PLUGIN__";

const EMPTY_TREE: FakeTree = Object.freeze({
  directories: Object.freeze([]),
  files: Object.freeze({}),
  hostEnvironment: Object.freeze({
    platform: "windows",
    localAppData: null,
    appData: null,
    home: null,
  }),
});

function currentTree(): FakeTree {
  const globalTree = (globalThis as Record<string, unknown>).__C3P_E2E_TREE__;
  return (globalTree as FakeTree | undefined) ?? EMPTY_TREE;
}

/** Every ancestor directory of `path`, shallowest first, excluding `path` itself. */
function ancestorsOf(path: string): readonly string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < segments.length - 1; i += 1) {
    current = current.length === 0 ? segments[i]! : `${current}/${segments[i]}`;
    out.push(current);
  }
  return out;
}

interface Index {
  readonly directories: ReadonlySet<string>;
  readonly files: ReadonlySet<string>;
}

function buildIndex(tree: FakeTree): Index {
  const directories = new Set<string>(tree.directories);
  for (const dir of tree.directories) {
    for (const ancestor of ancestorsOf(dir)) {
      directories.add(ancestor);
    }
  }
  const files = new Set<string>(Object.keys(tree.files));
  for (const file of files) {
    for (const ancestor of ancestorsOf(file)) {
      directories.add(ancestor);
    }
  }
  return { directories, files };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export async function exists(path: string): Promise<boolean> {
  const index = buildIndex(currentTree());
  return index.directories.has(path) || index.files.has(path);
}

export async function stat(
  path: string,
): Promise<{ size: number; isDirectory: boolean; isFile: boolean; mtime: Date | null }> {
  const tree = currentTree();
  const index = buildIndex(tree);
  if (index.files.has(path)) {
    return {
      size: encode(tree.files[path]!).byteLength,
      isDirectory: false,
      isFile: true,
      mtime: null,
    };
  }
  if (index.directories.has(path)) {
    return { size: 0, isDirectory: true, isFile: false, mtime: null };
  }
  throw new Error(`fake-tauri-plugin: stat of a non-existent path`);
}

export async function readDir(
  path: string,
): Promise<readonly { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }[]> {
  const index = buildIndex(currentTree());
  const prefix = `${path}/`;
  const children = new Map<string, "directory" | "file">();
  for (const dir of index.directories) {
    if (dir.startsWith(prefix)) {
      const rest = dir.slice(prefix.length);
      if (rest.length > 0 && !rest.includes("/")) {
        children.set(rest, "directory");
      }
    }
  }
  for (const file of index.files) {
    if (file.startsWith(prefix)) {
      const rest = file.slice(prefix.length);
      if (rest.length > 0 && !rest.includes("/")) {
        children.set(rest, "file");
      }
    }
  }
  return Object.freeze(
    [...children.entries()].map(([name, kind]) => ({
      name,
      isDirectory: kind === "directory",
      isFile: kind === "file",
      isSymlink: false,
    })),
  );
}

export async function readFile(path: string): Promise<Uint8Array> {
  const tree = currentTree();
  const content = tree.files[path];
  if (content === undefined) {
    throw new Error("fake-tauri-plugin: readFile of a non-existent path");
  }
  return encode(content);
}

export interface FakeFileHandle {
  read(buffer: Uint8Array): Promise<number | null>;
  close(): Promise<void>;
}

export async function open(path: string, _options: { read: true }): Promise<FakeFileHandle> {
  const tree = currentTree();
  const content = tree.files[path];
  if (content === undefined) {
    throw new Error("fake-tauri-plugin: open of a non-existent path");
  }
  const bytes = encode(content);
  let cursor = 0;

  return {
    async read(buffer: Uint8Array): Promise<number | null> {
      // MUST return null at EOF, never 0 (LEARNINGS, plan §0.3 item 1):
      // `filesystem-tauri.ts` breaks its read loop on null, and a fake
      // returning 0 hangs the app in the browser.
      if (cursor >= bytes.byteLength) {
        return null;
      }
      const remaining = bytes.byteLength - cursor;
      const n = Math.min(buffer.byteLength, remaining);
      buffer.set(bytes.subarray(cursor, cursor + n));
      cursor += n;
      return n;
    },
    async close(): Promise<void> {
      // Nothing to release.
    },
  };
}

export async function invoke<T>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  const tree = currentTree();
  if (cmd === "host_environment") {
    return tree.hostEnvironment as unknown as T;
  }
  if (cmd === "grant_read_access") {
    return 0 as unknown as T;
  }
  // An unexpected IPC call fails loudly rather than returning `undefined`
  // (plan §6.8). The marker is folded into this always-bundled function body
  // (rather than left as a stand-alone unused export) so a tree-shaking
  // bundler cannot drop it from the e2e bundle `check:no-fake` inspects.
  throw new Error(
    `fake-tauri-plugin: unexpected invoke "${cmd}" [${C3P_E2E_FAKE_TAURI_PLUGIN_MARKER}]`,
  );
}
