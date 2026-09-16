# S6 — Filesystem interface + dev middleware

**Status.** Approved plan. Written in the planning phase of session S6.
**Implementer.** Sonnet agent. Follow this document literally; do not expand scope.
**Depends on.** S3 (`docs/plans/S3-audit-log-parser.md`), S4
(`docs/plans/S4-manifests-spaces-project-assignment.md`) and S5
(`docs/plans/S5-aggregation.md`), all done and green. S7 implements the same
`FileSystem` interface against Tauri; S8 replaces this session's dev-only
console log with `state/app-state.ts` and the first screen.

---

## 0. Read this first — environment facts

You are working in the repository root. Use absolute paths everywhere: the Bash
tool resets its working directory between calls.

**`poc/`, `reference-material/` and `calview/` are present in this worktree,
and all three are symlinks at the repository root pointing outside the working
directory.** That last fact is not trivia — it is the single hardest detail in
this session. `reference-material/` resolves to a directory somewhere else on
this machine, so anything that "confines paths to the served directory" must
resolve the symlink first and confine to the **resolved target**. A confinement
check written against the configured path rejects the entire tree. See §6.

All three are gitignored; `git status` is clean and must stay clean.

- `poc/cowork_costs.py` is the authority for the *discovery* logic, the way it
  was the authority for parsing in S3. Read the `ROOTS` list at the top and
  `find_files()` before writing anything. One deliberate deviation is recorded
  in §2 Q2: the POC's unbounded recursive walk is **not** ported.
- `reference-material/` is what makes this session's exit criterion real. It is
  still not in Git and CI still cannot see it, so the spec that reads it must
  skip cleanly when the directory is absent (§7).

**This session is pure frontend again.** Nothing here touches `src-tauri/`; no
Rust, no `cargo`. `npm test`, `npm run build`, `npm run lint`,
`npm run format:check` are the whole toolchain. The Tauri filesystem plugin,
its capabilities and the folder picker are **S7** and must not be started here.

**Zero new dependencies.** Everything below is TypeScript plus the platform's
`fetch`, `ReadableStream`, `TextDecoder` and `node:fs` (in the Vite plugin,
which runs in Node). Do not add a path library, a globbing library, a streaming
library, a static file server, or `serve-static`. The roadmap's sizing rule —
never both a new layer and a new dependency in one session — applies, and this
session introduces a whole new layer (`src/services/` as a real layer, rather
than the single `locale-store.ts` that lives there today).

**`tsc` sees every file under `src/`.** `include: ["src"]`, `strict: true`,
`noEmit: true`, and `npm run build` is `tsc && vite build`. A file under `src/`
is type-checked whether or not anything imports it. `plugins/` is *not* under
`include`, exactly as `vite-plugin-licenses.ts` is not today; it is type-checked
by the editor and by ESLint, not by `npm run build`.

**`test.include` changes this session, deliberately.** It becomes:

```ts
include: ["src/**/*.{test,spec}.{ts,tsx}", "plugins/**/*.test.ts"],
```

S3 said "do not change `test.include`", and the reason was that a wider glob
would start collecting `test/fixtures/`. That reason is untouched: `test/` stays
outside the glob. The middleware is the most security-relevant file in this
session — traversal, symlink confinement, privacy — and it must have unit tests
next to it. Do not widen the glob any further than the two entries above.

Tests may import `node:fs`. Production code under `src/model/` may not, and
production code under `src/services/` may not either: services run in a browser
and in a WebView, never in Node. The §8 greps enforce both.

**The repository is public.** No fragment of `reference-material/` may reach it:
not a project name, not a space id, not a session id, not a directory name, not
a path, not a title, not a prompt, not a line of a real audit log or manifest.
Every byte of every fixture in this session is invented. The reference spec of
§7 reads the real tree at runtime and asserts **counts and one total only**.
This plan quotes no value from the real data; the numbers it does name come via
`MAP.md` §4 and `LEARNINGS.md`, which already sanitised them.

---

## 1. Goal and scope

**Goal.** `npm run dev` runs the whole pipeline in a plain browser against the
real `reference-material/` tree: discover the roots, walk them, stream every
`audit.jsonl`, and compute S5's `Report` — 1,413.59 USD from 150 sessions,
printed to the console.

**In scope.**

- `src/model/paths.ts` — the one path-normalisation boundary (pure).
- `src/model/discovery-paths.ts` — US-1.1's candidate root list (pure).
- `src/services/filesystem.ts` — the `FileSystem` interface, its error type, a
  null implementation, and the single selection point.
- `src/services/filesystem-dev.ts` — the HTTP-backed dev implementation.
- `src/services/discovery.ts` — the shared walk from roots to sessions.
- `src/services/scan.ts` — discovery → `Report`, streaming.
- `plugins/vite-plugin-reference-fs.ts` — the read-only dev-server middleware.
- Two new `ProblemKind`s, already anticipated in `problems.ts`'s doc comment.
- A dev-only console log in `src/main.tsx`, which S8 deletes.

**Out of scope.**

- **The Tauri implementation, in every form** (S7): `@tauri-apps/plugin-fs`,
  capabilities, read scopes, the folder picker, persistence of chosen folders,
  the US-1.6 no-write test. `createFileSystem()` falls through to a null
  implementation with a `TODO(S7)`; that is the whole Tauri surface this session
  produces.
- **Every visible criterion of US-1.1** (S7/S8): the status bar naming roots,
  accounts and profiles; the empty state naming the searched paths and offering
  "Ordner wählen…". S6 produces the *data* those screens will render and stops.
- Any component, any CSS, any signal, any translation key. See §2 Q7.
- Any file watching or re-scan (S20), any caching or concurrency in the dev
  filesystem (§2 Q4), any Worker.
- The Playwright fixture-backed fake filesystem (S8). S6's fake lives in
  `test/fixtures/fs/` and serves Vitest only.

**The trap the roadmap flags.** *Path handling. Normalise at the boundary, once,
or this leaks everywhere.* That boundary is `src/model/paths.ts`, and §2 Q6
explains why it is a second normaliser rather than a reuse of `manifest.ts`'s.

---

## 2. Decisions made in planning

Eight questions were put to the user. All eight are settled. Do not re-litigate
them in code, and do not re-open them in S7 or S8 — the reasoning is recorded
here so a later session does not have to guess.

### Q1 — `src/services/scan.ts` is in scope. The session is not split.

Discovery on its own proves nothing about `readLines()`, and S7 would then build
on an interface that no parser had ever driven. The orchestrator is glue over
model functions that already exist — `parseAuditLines`, `parseManifestBytes`,
`parseSpacesBytes`, `resolveSessions`, `buildReport` — and its test is the
reference spec this session writes anyway.

Including it makes the exit criterion **"1,413.59 USD computed in a browser from
the real tree"** instead of "150 paths found", and it takes work off S8, which
the roadmap already flags as the largest session. The price is seven production
files instead of six: acceptable, because there is no new dependency, no new UI,
and no second new layer.

### Q2 — The walk is bounded in depth and stops at session directories.

From a root: list it. **A directory containing `audit.jsonl` is a session
directory** — record it and do not descend into it. Otherwise descend, at most
`maxDepth` (default 4) levels below the root, skipping dot-directories and the
payload names `outputs`, `uploads`, `uploads-tmp`. Collect `spaces.json` and
`local_*.json` wherever they are found on the way.

This deviates from the POC's `find_files()`, which recurses without a bound.
The deviation is measured, not aesthetic: in the reference tree every
`audit.jsonl` sits at exactly root/account/profile/session, while an unbounded
walk additionally descends a large plugin/skills tree under a second,
data-free account directory, plus every session's `uploads/` and `outputs/`.
Over HTTP that is the difference between roughly two hundred round trips and
well over a thousand, for nothing. The depth cap keeps the walk bounded on a
tree whose shape we do not control.

### Q3 — Accounts and profiles are counted only where data was found.

An account or profile directory counts towards `accountCount` / `profileCount`
only if it yielded a session, a manifest or a `spaces.json`. Counting every
directory at depth 1 inflates the number the status bar of US-1.1 will show,
because the reference tree contains a decoy account directory holding no session
data at all. For the reference tree the answer is **2 accounts and 2 profiles**,
one of each per root; §7 pins it.

### Q4 — The middleware gets no bulk-listing endpoint.

An endpoint returning the whole file tree in one response would make the dev
scan fast and would simultaneously stop the dev path from exercising
`discovery.ts` — the shared code S7 depends on and *cannot validate on this
machine*, because there is no 3P data here. The round trips are the point.

Consequently the dev filesystem gets no caching, no request batching and no
parallelism in this session. Expect a full scan of the reference tree to take
tens of seconds in the browser: roughly two hundred listing and stat requests
plus about 127 MB of audit logs, streamed. That is a known, accepted cost. If it
proves painful for UI work, a "first N sessions" dev cap is **S8's** business.

### Q5 — `test.include` gains `plugins/**/*.test.ts`. See §0.

### Q6 — There are two path normalisers, deliberately.

`src/model/manifest.ts` already has a private `normalizePath`/`basename` pair.
This session does **not** reuse it, extend it or replace it, and a reviewer must
not read the new module as duplication:

- `manifest.ts`'s pair normalises **display data** — path-shaped strings read
  out of manifest JSON, produced on a Windows machine, used for folder grouping
  and hover text. Its `basename` has POC-specific fallback semantics
  (`os.path.basename(p) or p`), and it is pinned by S4's and S5's tests.
- `paths.ts` normalises **addresses** — strings this application constructs and
  hands back to a filesystem. It collapses repeated separators (except a leading
  `//`, which is a UNC prefix and load-bearing) and answers the question
  "is this relative path safe to send?", which display data never asks.

Merging them would change behaviour that is already tested, for a cosmetic win.
Keep them apart, and keep this paragraph in mind if you are tempted to "tidy up".

### Q7 — S6 ships no UI.

No component, no CSS, no translation key, no signal. The only frontend footprint
is a dev-only block in `src/main.tsx` that logs the discovery and scan result to
the console, and which S8 deletes when `app-state.ts` arrives. US-1.1's visible
acceptance criteria — the status bar showing roots, accounts and profiles, and
the empty state naming the searched paths and offering "Ordner wählen…" — are
**S7 and S8**. Do not add a key to `de.ts`/`en.ts` in this session.

### Q8 — The dev implementation is guarded against `npx tauri dev`.

`npx tauri dev` starts the same Vite dev server inside the Tauri WebView, so
`import.meta.env.DEV` is `true` there too. The selection condition is therefore

```ts
import.meta.env.DEV && !("__TAURI_INTERNALS__" in globalThis)
```

Without the second half, S7's exit criterion — "`npx tauri dev` on this machine
reaches the empty state cleanly, because there is no 3P data here" — would
silently be exercising the dev middleware against the reference tree and would
appear to pass while testing the wrong implementation. Write the guard now.

---

## 3. File inventory

### 3.1 Created — `src/model/` (pure)

| File | Content |
|---|---|
| `src/model/paths.ts` | `normalizePath`, `joinPath`, `pathBasename`, `pathSegments`, `isUnsafeRelativePath`. No I/O, no `node:path`. |
| `src/model/discovery-paths.ts` | `HostPlatform`, `HostEnvironment`, `RootCandidate`, `rootCandidates()`. US-1.1's five paths, in order. |

### 3.2 Created — `src/services/` (I/O)

| File | Content |
|---|---|
| `src/services/filesystem.ts` | `DirEntry`, `FileStat`, `LineStream`, `FileSystemError`, `FileSystem`, `nullFileSystem`, `createFileSystem()`. The single selection point (architecture rule 6). |
| `src/services/filesystem-dev.ts` | `DEV_FS_PREFIX`, `createDevFileSystem()`. The HTTP client for the middleware; owns the byte→line boundary. Never in a production bundle. |
| `src/services/discovery.ts` | `DiscoveredSession`, `DiscoveredProfile`, `DiscoveredRoot`, `Discovery`, `DiscoverOptions`, `discover()`. |
| `src/services/scan.ts` | `ScanOptions`, `scanDiscovery()`. Discovery → `Report`, one audit log in flight at a time. |

### 3.3 Created — `plugins/`

| File | Content |
|---|---|
| `plugins/vite-plugin-reference-fs.ts` | `ReferenceFsOptions`, default-exported `referenceFsPlugin()`. `apply: "serve"`. |

### 3.4 Created — tests

| File | Covers |
|---|---|
| `src/model/paths.test.ts` | §9.1 |
| `src/model/discovery-paths.test.ts` | §9.2 |
| `src/services/filesystem-dev.test.ts` | §9.3 |
| `src/services/discovery.test.ts` | §9.4 |
| `src/services/scan.test.ts` | §9.5 |
| `plugins/vite-plugin-reference-fs.test.ts` | §9.6 |
| `src/services/reference-fs.test.ts` | §9.7 / §7 — skips when the tree is absent |

### 3.5 Created — fixtures

| File | Content |
|---|---|
| `test/fixtures/fs/index.ts` | An in-memory fake `FileSystem` builder for Vitest, mirroring the existing `test/fixtures/audit/index.ts` and `test/fixtures/sessions/index.ts` convention. It must be able to: hold a directory tree, serve bytes and lines from an invented audit log, throw on a named directory or file, and report a configurable set of root candidates. Nothing in it comes from the real data. |

### 3.6 Changed in place

| File | Change |
|---|---|
| `vite.config.ts` | Register `referenceFsPlugin()` where the S6 placeholder comment sits; delete that comment; widen `test.include` per §0. |
| `src/model/problems.ts` | Add `"unreadable-file"` and `"unreadable-directory"` to `ProblemKind`, with the one-line comments the existing entries have. The file's doc comment already names them as S6's. |
| `src/main.tsx` | The dev-only log block of §5.4. |
| `CLAUDE.md` | The note of §11. |

### 3.7 Explicitly NOT touched

`src-tauri/**` (S7), `src/app.tsx`, `src/components/**`, `src/styles/**`,
`src/i18n/**`, `src/state/app-state.ts`, `src/services/locale-store.ts`, and
every existing module under `src/model/` other than `problems.ts` — in
particular **`src/model/manifest.ts`**, for the reason in §2 Q6.

---

## 4. Boundary types and signatures

Every signature below is normative. Do not rename, do not widen, do not add
optional fields "while you are there".

### 4.1 `src/model/paths.ts`

```ts
/** Backslashes → "/", repeated separators collapsed EXCEPT a leading "//" (UNC),
 *  one trailing separator stripped. Never resolves "." or ".."; never calls
 *  String.prototype.normalize() — filenames are opaque, byte-faithful strings. */
export function normalizePath(raw: string): string;

/** Joins normalised segments with "/". An empty base yields the first segment unprefixed. */
export function joinPath(base: string, ...segments: string[]): string;

/** Last segment of a normalised path; "" for "" and for "/". */
export function pathBasename(path: string): string;

export function pathSegments(path: string): readonly string[];

/** True for an absolute path, a drive-letter prefix, a NUL byte, or any segment
 *  exactly "." or ".." — and FALSE for a legal name such as "..foo" or "a.b". */
export function isUnsafeRelativePath(path: string): boolean;
```

### 4.2 `src/model/discovery-paths.ts`

```ts
export type HostPlatform = "windows" | "macos" | "linux";

export interface HostEnvironment {
  readonly platform: HostPlatform;
  readonly localAppData: string | null;  // %LOCALAPPDATA%
  readonly appData: string | null;       // %APPDATA%
  readonly home: string | null;
}

export interface RootCandidate {
  /** Passed back to the FileSystem verbatim; opaque to every caller. */
  readonly path: string;
  /** For display and for the US-1.1 empty state: the UNEXPANDED form,
   *  e.g. "%LOCALAPPDATA%\\Claude-3p\\local-agent-mode-sessions". */
  readonly label: string;
  readonly origin: "auto" | "manual";
}

/** US-1.1's five paths, in order. A candidate whose variable is null or empty
 *  is omitted entirely — never joined into a bogus relative path. */
export function rootCandidates(env: HostEnvironment): readonly RootCandidate[];
```

The order is `REQUIREMENTS.md` US-1.1's order, which is the POC's `ROOTS` order
plus the macOS path:

1. `%LOCALAPPDATA%\Claude-3p\local-agent-mode-sessions`
2. `%LOCALAPPDATA%\Claude-3p\claude-code-sessions`
3. `%APPDATA%\Claude\local-agent-mode-sessions`
4. `%APPDATA%\Claude\claude-code-sessions`
5. `~/Library/Application Support/Claude/local-agent-mode-sessions` (macOS only)

`label` keeps the variable unexpanded. That is both the privacy-safest form and
the one a user recognises. `path` is the expanded, normalised form.

### 4.3 `src/services/filesystem.ts`

```ts
import type { DetectedEncoding } from "../model/encoding.js";
import type { RootCandidate } from "../model/discovery-paths.js";

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

/** Lines plus the encoding facts the parser needs; `encoding` and
 *  `hadReplacement` are meaningful only after iteration has finished. */
export interface LineStream extends AsyncIterable<string> {
  readonly encoding: DetectedEncoding | null;
  readonly hadReplacement: boolean;
}

export type FileSystemErrorCode = "not-found" | "permission" | "io" | "protocol";

/** NFR-6: message is `filesystem:${code}`. Carries no path and no file content. */
export class FileSystemError extends Error {
  readonly code: FileSystemErrorCode;
  readonly hint?: string;      // bounded token only, e.g. an HTTP status
  constructor(code: FileSystemErrorCode, hint?: string);
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

export const nullFileSystem: FileSystem;   // zero candidates, empty listings — S7 replaces the branch

/** The single selection point. Dev impl under `npm run dev` in a plain browser;
 *  never under `npx tauri dev` (see §2 Q8); the Tauri impl arrives in S7. */
export async function createFileSystem(): Promise<FileSystem>;
```

Implementation of the selection point, verbatim in shape:

```ts
export async function createFileSystem(): Promise<FileSystem> {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in globalThis)) {
    const { createDevFileSystem } = await import("./filesystem-dev.js");
    return createDevFileSystem();
  }
  // TODO(S7): return createTauriFileSystem() once the fs plugin is wired up.
  return nullFileSystem;
}
```

The dynamic `import()` is not decoration. It was measured during planning: with
`vite build`, Rollup eliminates both the dynamic-import and the static-import
form of a dev-only branch — no marker string survives in `dist/` and no extra
chunk is emitted. The dynamic form is specified anyway, because it keeps holding
if `filesystem-dev.ts` ever gains a top-level side effect. §8 greps `dist/` to
prove it every time.

`stat()` returning `null` rather than throwing for absence is deliberate: it is
the "does this root exist?" primitive, and absence is the normal case (US-1.1
searches five paths and expects most to be missing). Errors are for permission
and I/O only.

### 4.4 `src/services/filesystem-dev.ts`

```ts
export const DEV_FS_PREFIX = "/@claude3p-fs";   // the grep marker for the dist check

export interface DevFileSystemOptions {
  readonly baseUrl?: string;                      // default DEV_FS_PREFIX
  readonly fetchImpl?: typeof fetch;              // tests inject a stub
}

export function createDevFileSystem(options?: DevFileSystemOptions): FileSystem;
```

Wire protocol. All paths are **root-relative POSIX** strings in a single `path`
query parameter, `encodeURIComponent`-encoded; `""` is the served root:

| Request | Response |
|---|---|
| `GET {prefix}/info` | `{ "available": boolean, "label": string }` |
| `GET {prefix}/list?path=…` | `{ "entries": [{ "name": string, "kind": "file" \| "directory" }] }` |
| `GET {prefix}/stat?path=…` | a `FileStat` as JSON, or 404 |
| `GET {prefix}/read?path=…` | raw bytes, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` |

`label` is the **basename** of the resolved directory, never the absolute path.
Absolute paths are sensitive (`CLAUDE.md`, Privacy Rules), and the dev client
displays this string.

`rootCandidates()` always returns the two dev candidates — `local-agent-mode-sessions`
and `claude-code-sessions`, labelled with the served basename, `origin: "auto"` —
**whether or not the reference directory exists**. A missing directory then takes
exactly the same path as a missing root on Windows: `stat()` → `null` → zero
roots in `Discovery.roots`, both candidates in `Discovery.searched`, and the
US-1.1 empty state. No special case, no error, and the code path that S7 relies
on is the one being exercised. NFR-13 requires precisely this degradation.

`readLines()` requests `{prefix}/read`, takes `response.body` as a byte stream
and feeds each chunk to `createLineDecoder()` from `src/model/encoding.ts`.
**That is where the byte→line boundary sits**: once per implementation, inside
the service, so `src/model/` keeps owning the UTF-8 / UTF-8-BOM / UTF-16 rules
and no implementation re-invents them. The returned object exposes the
decoder's `encoding` and `hadReplacement` through `LineStream`.

`readFileBytes()` is for manifests and `spaces.json` only — small files whose
parsers (`parseManifestBytes`, `parseSpacesBytes`) take bytes because they do
their own encoding detection. Never call it on an `audit.jsonl`.

### 4.5 `src/services/discovery.ts`

```ts
export interface DiscoveredSession {
  /** The session DIRECTORY name — the `sourceId` the S3 parser expects. */
  readonly sessionId: string;
  readonly auditPath: string;
  readonly rootPath: string;
  readonly accountId: string;
  readonly profileId: string;
}

export interface DiscoveredProfile {
  readonly rootPath: string;
  readonly accountId: string;
  readonly profileId: string;
  readonly path: string;
  readonly spacesPaths: readonly string[];
  readonly manifestPaths: readonly string[];
}

export interface DiscoveredRoot {
  readonly candidate: RootCandidate;
  readonly accounts: number;
  readonly profiles: number;
}

export interface Discovery {
  readonly roots: readonly DiscoveredRoot[];                 // those that exist
  readonly searched: readonly RootCandidate[];               // every candidate, for the empty state
  readonly profiles: readonly DiscoveredProfile[];
  readonly sessions: readonly DiscoveredSession[];
  readonly accountCount: number;                             // only where data was found (§2 Q3)
  readonly profileCount: number;
  readonly problems: readonly Problem[];
}

export interface DiscoverOptions {
  readonly maxDepth?: number;                                // default 4
  readonly candidates?: readonly RootCandidate[];            // default: fs.rootCandidates()
}

export async function discover(fs: FileSystem, options?: DiscoverOptions): Promise<Discovery>;
```

Rules, all of them load-bearing:

- `accountId` is the directory name one level below the root; `profileId` the
  one below that. Where the tree is shallower than that, both are `""` and the
  entry still counts once — do not throw the sessions away because the shape
  surprised you.
- A directory that contains `audit.jsonl` **is** a session directory: record it,
  do not descend (§2 Q2).
- Skip dot-directories and `outputs`, `uploads`, `uploads-tmp`.
- `listDirectory` throwing raises `"unreadable-directory"` and the walk
  continues with the next sibling (NFR-3). `scope` is the directory **name**
  only — never a path (NFR-6).
- Results are ordered deterministically: roots in candidate order, then entries
  in the order `listDirectory` returns them, sorted by `name` using code-unit
  comparison. No `localeCompare` anywhere (`LEARNINGS.md`).
- The returned `Discovery` is frozen, and its arrays are copies.

### 4.6 `src/services/scan.ts`

```ts
export interface ScanOptions {
  readonly zone?: ZoneOffsetResolver;                       // defaults to utcOffset, as S5
  readonly onProgress?: (done: number, total: number) => void;
}

export async function scanDiscovery(
  fs: FileSystem,
  discovery: Discovery,
  options?: ScanOptions,
): Promise<Report>;
```

The algorithm, in order. Every function named here already exists; write no new
parsing, no new aggregation and no new grouping in this session.

1. One `createProblemCollector()` for the whole scan, seeded with
   `discovery.problems`.
2. Per profile: `readFileBytes` each `spacesPaths` entry → `parseSpacesBytes`;
   `mergeSpaceIndexes` across all of them.
3. Per profile: `readFileBytes` each `manifestPaths` entry →
   `parseManifestBytes(bytes, pathBasename(path), problems)`; collect the
   non-null results; `buildManifestIndex(manifests, problems)`.
4. Per session, **sequentially, one in flight at a time** (NFR-4):
   `const stream = fs.readLines(session.auditPath)` then
   `await parseAuditLines(session.sessionId, stream)`. Afterwards read
   `stream.encoding` and `stream.hadReplacement` and produce the final
   `AuditSession` with `encoding` set and, where `hadReplacement` is true, a
   `"decode-replacement"` problem appended — the same shape `parseAuditBytes`
   produces. Do **not** re-read the file to get the encoding.
5. A throwing `readLines` or `readFileBytes` raises `"unreadable-file"` with
   `scope` = the session id (or the file's basename for a manifest) and the scan
   continues (NFR-3).
6. `onProgress?.(done, discovery.sessions.length)` after each session.
7. `resolveSessions(audits, index, spaces, problems)` → `summarizeGaps` is *not*
   called here; `buildReport(resolved, problems.problems, { zone })` is the
   return value.

No rounding, no `/ 1e6`, no formatting — S5's rule still holds, and this layer
is below the display boundary.

### 4.7 `plugins/vite-plugin-reference-fs.ts`

```ts
export interface ReferenceFsOptions {
  readonly dir?: string;      // default: process.env.CLAUDE3P_REFERENCE_DIR ?? "./reference-material"
  readonly prefix?: string;   // default: "/@claude3p-fs"
}

export default function referenceFsPlugin(options?: ReferenceFsOptions): Plugin;  // apply: "serve"
```

The default is `./reference-material`, the symlink at the repository root —
**not** `../reference-material`. `CLAUDE.md` already records this; NFR-13's
parenthetical still says `../reference-material` and is the stale one. Resolve
the configured value against the Vite root.

Behaviour:

- `apply: "serve"`, and the handler is installed in `configureServer`. The
  plugin is therefore not even instantiated during `vite build`.
- **At server start, once:** `await fs.promises.realpath(dir)` and keep the
  result as the confinement base. This is the step that makes the repository-root
  symlink work. If it throws, remember that and answer `{"available": false}`
  from `/info` while every other endpoint returns 404 — the dev filesystem then
  degrades to the empty state (§4.4).
- **Per request:** parse with `new URL(req.url, "http://localhost")`; take
  `searchParams.get("path") ?? ""`; reject `isUnsafeRelativePath` with 400; join
  onto the base; `realpath` the **result** and require it to equal the base or
  to start with the base plus a separator, 403 otherwise. Realpath'ing the
  result — not just resolving the string — is what catches a symlink *inside*
  the tree pointing out of it.
- Non-`GET` methods: 405. The middleware has no write verb, no rename, no
  delete; there is no code path in it that opens a file for writing (US-1.6).
- A path that does not exist: 404.
- **No response body, no header and no server log line contains a path, a file
  name or file content** (NFR-6). Errors are `{"error":"not-found"}` and the
  like. Do not `console.log` the request path "for debugging".
- Never set an `Access-Control-*` header. The surface is same-origin,
  dev-server-only, and serves a tree full of prompt text.
- Requests whose URL does not start with the prefix must call `next()`
  untouched.

---

## 5. Wiring

### 5.1 `vite.config.ts`

```ts
import referenceFsPlugin from "./plugins/vite-plugin-reference-fs.js";
// …
plugins: [preact(), licensesPlugin(), referenceFsPlugin()],
```

Delete the placeholder comment `// S6: the reference-fs dev middleware plugin
(NFR-13) is added here.` — it has been honoured.

### 5.2 `test.include`

Per §0. Two entries, no more.

### 5.3 `src/model/problems.ts`

```ts
  | "unreadable-directory"     // listing a directory failed; the walk continued
  | "unreadable-file";         // reading a file failed; the scan continued
```

Update the module doc comment's "Extended by … and S6 (…)" clause to say that
S6 has done so.

### 5.4 `src/main.tsx`

```ts
if (import.meta.env.DEV) {
  void (async () => {
    const { createFileSystem } = await import("./services/filesystem.js");
    const { discover } = await import("./services/discovery.js");
    const { scanDiscovery } = await import("./services/scan.js");
    const fs = await createFileSystem();
    const discovery = await discover(fs);
    console.log(`[claude3pcost] roots=${discovery.roots.length} sessions=${discovery.sessions.length}`);
    const report = await scanDiscovery(fs, discovery);
    console.log(`[claude3pcost] requests=${report.totals.requests} costMicroUsd=${report.totals.costMicroUsd}`);
  })();
}
```

This block is temporary scaffolding and says so in a comment naming S8 as the
session that deletes it. It logs **counts and one integer** — never a project
name, a session id or a path (NFR-6). It is not the exit proof; §7 is.

---

## 6. The path boundary, restated

There is exactly one normalisation point for addresses, `src/model/paths.ts`,
and three rules that are easy to get wrong:

1. **A leading `//` survives.** `\\server\share\dir` normalises to
   `//server/share/dir`. Collapsing it to `/server/share/dir` turns a UNC path
   into a bogus absolute path. Every other run of separators collapses.
2. **Filenames are opaque bytes.** In the reference tree, 96 names contain
   non-ASCII characters and **all 96 are NFD** (macOS decomposes on disk), and
   168 names contain spaces. Encode per segment with `encodeURIComponent`;
   compare only against ASCII literals (`audit.jsonl`, `spaces.json`, the
   `local_` prefix, `outputs`, `uploads`, `uploads-tmp`). **Never call
   `String.prototype.normalize()`** — it is the same class of host-dependent
   back door as `localeCompare` (`LEARNINGS.md`), and it would break the
   round trip of a name that exists on disk in decomposed form.
3. **`..` is rejected, not resolved.** `isUnsafeRelativePath` returns true for a
   segment that is exactly `..` or `.`, for an absolute path, for a drive-letter
   prefix and for a NUL byte — and false for a legal name like `..foo`. The
   client refuses to build such a path; the middleware refuses to serve one.
   Neither resolves it.

---

## 7. The reference check

`src/services/reference-fs.test.ts`, guarded exactly as S4's and S5's reference
spec is:

```ts
const dir = process.env.CLAUDE3P_REFERENCE_DIR ?? join(process.cwd(), "reference-material");
describe.skipIf(!existsSync(dir))("reference filesystem", () => { … });
```

The spec boots a **real Vite dev server** with `createServer()` from `vite`,
carrying the plugin, listens on an ephemeral port, and then drives the real
`createDevFileSystem({ baseUrl: \`http://127.0.0.1:${port}${DEV_FS_PREFIX}\` })`
through the real `discover()` and the real `scanDiscovery()`. No fixture, no
stub, no shortcut: the point is that every line of this session's production
code runs against the real tree once.

Asserted values, pinned from `LEARNINGS.md` and from measurements taken during
planning:

| Quantity | Value |
|---|---|
| Sessions discovered | 150 |
| Accounts / profiles | 2 / 2 |
| Manifests found across both roots | 152 |
| `report.totals.requests` | 508 |
| `report.projectGroups.length` | 7 |
| `report.folderGroups.length` | 26 |
| `report.totals.costMicroUsd` | 1_413_585_188 |

`LEARNINGS.md` records that Vitest's default reporter swallows `console.log`
from passing tests. Nothing here is logged for a human to read: every number
above is an assertion. The browser console line of §5.4 is a convenience, not
the proof.

If a number comes out different, **stop and report it**. Do not adjust the
constant to match what you measured — these are the numbers S3, S4 and S5 were
verified against, and a change means discovery is finding the wrong set of
files.

---

## 8. Exit criteria

```bash
# 1. Everything green, including the new plugin suite
npm test

# 2. The reference spec RUNS here (reference-material/ is present) and asserts §7
npx vitest run src/services/reference-fs.test.ts --reporter=verbose

# 3. It skips cleanly when the data is absent — as it will in CI
CLAUDE3P_REFERENCE_DIR=/nonexistent npx vitest run src/services/reference-fs.test.ts

# 4. Type-check and production build clean
npm run build

# 5. NO TRACE OF THE MIDDLEWARE IN THE BUILD — MUST print nothing
grep -rn "claude3p-fs\|reference-fs\|CLAUDE3P_REFERENCE_DIR" dist/

# 6. No extra dev chunk was emitted
ls dist/assets/

# 7. No Unicode normalisation anywhere in the path or service code — MUST print nothing
grep -rn "\.normalize(" src/model/paths.ts src/services/

# 8. Services run in a browser, not in Node — MUST print nothing
grep -rn "node:" src/services/ --include=*.ts | grep -v "\.test\.ts"

# 9. The dev implementation has no Tauri import — MUST print nothing
grep -rn "@tauri-apps" src/services/filesystem-dev.ts src/services/discovery.ts src/services/scan.ts

# 10. The model layer stays pure — MUST print nothing
grep -rn "fetch(\|node:\|@tauri-apps" src/model/ --include=*.ts | grep -v "\.test\.ts"

# 11. No host-locale collation crept in — MUST print nothing
grep -rn "localeCompare" src/model/paths.ts src/services/

# 12. No reference data leaked into fixtures or specs — MUST print nothing.
#     Build the alternation from the real project names in the local, gitignored
#     reference-material/ tree; never write them into this file or any other
#     committed document (NFR-6, CLAUDE.md "Privacy Rules").
names=$(ls reference-material/local-agent-mode-sessions/*/*/spaces.json >/dev/null 2>&1 \
  && node -e '…derive names from spaces.json…')
grep -rniF "$names" src/ test/ plugins/ docs/

# 13. No new dependency — MUST print nothing but the existing script lines
git diff --stat package.json package-lock.json

# 14. Lint and format
npm run lint && npm run format:check

# 15. Nothing untracked or ignored got committed
git status --porcelain
```

And the human check, which is the roadmap's stated goal rather than the proof:

```bash
npm run dev
# Browser console at http://localhost:5173:
#   [claude3pcost] roots=2 sessions=150
#   [claude3pcost] requests=508 costMicroUsd=1413585188
```

---

## 9. Tests, by name

A test earns its place by giving a different answer for the wrong
implementation (`LEARNINGS.md`). Each name below is followed by what it kills.

### 9.1 `src/model/paths.test.ts`

- *converts Windows separators and strips one trailing separator*
- *keeps the leading double slash of a UNC path while collapsing other repeats* —
  an impl that collapses every run yields `/server/share`
- *joins onto an empty base without a leading separator* — an impl that always
  emits `base + "/" + segment` produces `/local-agent-mode-sessions`, which the
  middleware then rejects as absolute
- *leaves a decomposed umlaut byte-identical* — fails any impl calling
  `.normalize("NFC")`
- *treats "..foo" and "a.b" as legal names but rejects ".." and "." segments* —
  fails an `includes("..")` check
- *rejects absolute paths, drive letters and NUL bytes*

### 9.2 `src/model/discovery-paths.test.ts`

- *lists the four Windows candidates in the US-1.1 order*
- *omits a candidate whose environment variable is empty* — the POC's
  `os.path.join("", …)` produces a bogus relative path; an impl that ports it
  faithfully fails here
- *returns the macOS Application Support candidate for platform macos*
- *labels candidates with the unexpanded variable form* — an impl that puts the
  expanded home path in `label` fails

### 9.3 `src/services/filesystem-dev.test.ts`

Driven by an injected `fetchImpl`; no server, no network.

- *encodes each path segment and never sends a raw space*
- *returns null from stat on 404 instead of throwing*
- *throws a FileSystemError whose message contains no path* — asserts the path
  substring is absent from `error.message` (NFR-6)
- *decodes a UTF-16LE body with a BOM into lines* — an impl calling
  `response.text()` yields mojibake
- *yields a line split across two stream chunks exactly once* — fails per-chunk
  decoding, and fails an impl that concatenates the whole body first (NFR-4)
- *reports hadReplacement for undecodable bytes*
- *returns both dev root candidates even when info reports available false* —
  pins the §4.4 degradation

### 9.4 `src/services/discovery.test.ts`

Driven by the fake filesystem of §3.5. No reference data.

- *treats a directory containing audit.jsonl as a session and does not descend
  into it* — the fake nests `uploads/audit.jsonl` inside a session directory; a
  descending impl reports two sessions
- *counts only accounts and profiles that yielded data* — the fake carries a
  data-free decoy account directory; counting every depth-1 directory fails
- *reports a candidate whose stat is null as searched but not as a root*
- *records unreadable-directory and continues with the other root* — and the
  problem carries no path
- *stops at the depth limit instead of walking a deep payload tree*
- *collects spaces.json and manifests per profile*
- *orders roots by candidate order and entries by code unit*

### 9.5 `src/services/scan.test.ts`

The fake filesystem is seeded with the **committed** fixtures in
`test/fixtures/audit/` — the byte→line→parse path must be exercised, not
assumed (`LEARNINGS.md`).

- *builds a Report whose totals match the fixture audit logs*
- *carries the decode-replacement problem from the stream into the report* — an
  impl that ignores `stream.hadReplacement` loses it, because `parseAuditLines`
  cannot see the bytes
- *records unreadable-file for one session and still reports the others*
- *reports progress once per session*

### 9.6 `plugins/vite-plugin-reference-fs.test.ts`

Against a temp directory built inside the test, reached through a symlink.
Nothing from `reference-material/`.

- *serves a file under a root reached through a symlink* — the case this
  repository actually has; a `resolve()`-only confinement check 403s the whole
  tree
- *rejects a path containing a ".." segment with 403*
- *rejects a symlink inside the tree that points outside it* — a string-prefix
  check on the joined path passes this wrongly
- *returns 404 for a missing path and names no path in the body*
- *lists and serves back a decomposed-umlaut filename unchanged*
- *rejects a non-GET method with 405*
- *reports available false when the configured directory does not exist*
- *passes through a request that does not start with the prefix*
- *applies only to the dev server* — asserts `apply === "serve"`

### 9.7 `src/services/reference-fs.test.ts`

See §7. Skips when the tree is absent.

- *discovers 150 sessions, 2 accounts and 2 profiles through the dev middleware*
- *finds 152 manifests across both roots*
- *reproduces the reference totals through the dev filesystem* — 508 requests,
  7 project groups, 26 folder groups, 1_413_585_188 micro-USD
- *degrades to zero roots and no error when the configured directory is absent*

---

## 10. Three things that will bite you

**1. The served root is a symlink out of the working directory.** `poc/`,
`reference-material/` and `calview/` are all symlinks at the repository root.
Confine to the **realpath'd target**, resolved once at server start, and
realpath the joined result per request. A confinement check written against the
configured path — the obvious implementation — rejects every single file in the
tree, and you will spend an hour blaming the URL encoding.

**2. `import.meta.env.DEV` is true inside `npx tauri dev`.** It is the same Vite
dev server, just rendered in a WebView. Without the `__TAURI_INTERNALS__` guard
of §2 Q8, S7's exit criterion — "reaches the empty state cleanly, because this
machine has no 3P data" — would silently run the dev middleware against the
reference tree and appear to pass while testing the wrong implementation.

**3. Filenames are opaque bytes, and yours are decomposed.** 96 names in the
reference tree are NFD and 168 contain spaces. Encode per segment, compare only
against ASCII literals, and never call `.normalize()`. A round trip that
normalises to NFC will work for some names on some filesystems and fail for
others on the same machine, which is the worst possible failure mode to debug.

---

## 11. The `CLAUDE.md` note

Append to "Data Model Essentials", after the existing `Report` bullet. Keep it
to this:

- **One `FileSystem` interface, two implementations, one path boundary.**
  `src/services/filesystem.ts`, S6. `createFileSystem()` is the only place that
  chooses, and it chooses the dev implementation only under
  `import.meta.env.DEV && !("__TAURI_INTERNALS__" in globalThis)` — `npx tauri
  dev` runs the same Vite server inside the WebView, so the second half is what
  keeps S7's empty-state check honest. `readLines()` returns a `LineStream`
  carrying `encoding` and `hadReplacement`, because the byte→line boundary sits
  in the service (using `src/model/encoding.ts`'s `createLineDecoder`) and the
  parser never sees bytes. Addresses are normalised exactly once, in
  `src/model/paths.ts`; `manifest.ts`'s private normaliser stays separate on
  purpose — that one normalises *display* data out of manifest JSON, this one
  normalises *addresses* we hand back to a filesystem. Filenames are opaque
  bytes: no `String.prototype.normalize()` anywhere, because every non-ASCII
  name in the reference tree is NFD on macOS. `plugins/vite-plugin-reference-fs.ts`
  is `apply: "serve"`, confines to the **realpath'd** target of the
  `reference-material` symlink, and never puts a path in a response body or a
  log line (NFR-6).

---

## 12. Commit

One commit at the end, message in English, following the form of S1–S5:

```
S6: filesystem interface and dev middleware (NFR-13, US-1.1 dev)
```

`git status` must be clean afterwards, with `poc/`, `reference-material/` and
`calview/` still untracked and still ignored.

---

## 13. Requirements coverage

### Satisfied by this session

| Criterion | How |
|---|---|
| NFR-13 — a Vite dev middleware exposes the configured reference directory read-only over HTTP | `plugins/vite-plugin-reference-fs.ts`, §4.7 |
| NFR-13 — two implementations behind one interface; nothing above the service layer branches | `FileSystem`, `createFileSystem()`, §4.3 |
| NFR-13 — the directory is configurable by env var | `CLAUDE3P_REFERENCE_DIR`, default `./reference-material` |
| NFR-13 — the middleware is never part of a production build | `apply: "serve"` plus the dynamic import; exit greps 5 and 6 |
| NFR-13 — a missing reference directory degrades to the empty state, not an error | §4.4, tests 9.3 and 9.7 |
| NFR-4 — streaming; a whole session tree is never in memory | `LineStream`, `scanDiscovery` step 4 |
| NFR-3 — a bad file or directory is collected as a problem, never aborts the scan | `"unreadable-file"`, `"unreadable-directory"` |
| NFR-6 — no path, no file content in any problem, error message, response body or log line | `FileSystemError`, §4.7, tests 9.3 and 9.6 |
| US-1.1 — the known roots are searched in order; every root that exists is scanned; multiple roots merge into one result | `rootCandidates()`, `discover()` |
| US-1.1 — several accounts and profiles under one root are merged, and counted | `Discovery.accountCount` / `profileCount`, §2 Q3 |
| US-1.6 — the middleware has no write, rename, move or delete path | §4.7, test "rejects a non-GET method with 405" |

### Explicitly deferred

| Thing | Session |
|---|---|
| The Tauri `FileSystem` implementation, read-only capability scopes, the US-1.6 no-write assertion on the scanner module | **S7** |
| US-1.2 — the folder picker, persistence of chosen folders, removing one, the "no session data in this folder" message | **S7** |
| US-1.1's *visible* criteria — the status bar naming roots, accounts and profiles; the empty state naming the searched paths and offering "Ordner wählen…" | **S7 / S8** |
| `state/app-state.ts`, the project table, locale formatting, NFR-2's 2-second budget | **S8** |
| The Playwright fixture-backed fake filesystem and `npm run test:e2e` | **S8** |
| A "first N sessions" dev cap, if the full scan proves too slow for UI work | **S8** |
| File watching and re-scan | **S20** |
