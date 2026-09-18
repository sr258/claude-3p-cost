# S7 — Tauri filesystem implementation

**Stories.** US-1.1 (automatic discovery), US-1.2 (choosing a folder manually),
US-1.6 (read-only guarantee). Supporting: NFR-1, NFR-3, NFR-4, NFR-5, NFR-6,
NFR-7, NFR-11.

**Depends on.** S6 (`FileSystem` interface, `discover()`, `scanDiscovery()`,
`src/model/paths.ts`, `src/model/discovery-paths.ts`), S5 (`Report`), S2
(`src/i18n/`).

**Status.** Planned, approved. Not yet implemented.

---

## 0. Read this first — environment facts

You are working in the repository root. Use absolute paths everywhere: the Bash
tool resets its working directory between calls.

**This session touches Rust.** Unlike S3–S6 it changes `src-tauri/`, adds two
Tauri commands, rewrites the capability file, and adds a Cargo dependency.
`cargo` is part of the toolchain from here on.

- `rustc 1.95.0`, `cargo 1.95.0`, `webkit2gtk-4.1 2.52.6` are installed. The app
  *can* be built and run on this Linux machine.
- **`src-tauri/target/` does not exist.** The first `cargo check` is a cold
  build of the whole Tauri tree. Budget 5–15 minutes and **start it early**, in
  Stage 1, rather than discovering it at the end of the session.
- crates.io and the npm registry are reachable, so the two new dependencies can
  be installed.
- `tauri-plugin-dialog` is **not** in the local cargo registry cache; it will be
  downloaded.

**This machine cannot validate the happy path.** There is no Claude Desktop 3P
data here. The exit criterion is the *empty* state, and §9 is explicit about
what that does and does not prove. Everything the empty path cannot exercise is
written into the S22 checklist in §10.

**CalView has nothing to copy for this session.** It uses neither the fs plugin
nor the dialog plugin, and persists its secrets in the OS keyring. What it does
give us is the *shape*: a capability file with an `identifier`/`windows`/
`permissions` triple, and the `#[tauri::command]` + `serde(rename_all)` pattern
in `src-tauri/src/lib.rs`. Follow those; the fs specifics below come from
reading the plugin sources, not from CalView.

**The repository is public.** No fragment of `reference-material/` may reach
it — not a path, not a project name, not a space id, not a session id, not a
directory name, not a line of a real log. Every fixture this session adds is
invented. This plan quotes nothing from the real tree; the one number it names
(the largest audit log is under 8 MB) comes from a size measurement, not from
content.

---

## 1. Deviations this session takes, and owes

The roadmap's sizing rules are broken three ways here. The user chose a single
whole session over the split this plan originally recommended. That is a
legitimate call, but it is recorded rather than hidden, because a later reader
comparing this session against the sizing rules will otherwise conclude the
rules were forgotten.

**Deviation 1 — file count.** Fifteen new or changed production and
configuration files, against a rule of roughly three to six. See §3.

**Deviation 2 — a new layer *and* a new dependency in one session.** The rule
says never both. S7 introduces the whole Tauri backend surface (two commands,
runtime fs scope, a rewritten capability file) *and* adds
`tauri-plugin-dialog` / `@tauri-apps/plugin-dialog` for the US-1.2 folder
picker.

**Deviation 3 — a second new dependency.** `@testing-library/preact` as a
devDependency, because this session ships the first `.tsx` component in the
project and the repository has no component-testing tool at all — only jsdom.
Adding it here is deliberate: the alternative is an untested component, or a
component tested by poking at `document.body.innerHTML` by hand.

**Deviation 4 — US-1.6 acceptance-criterion wording.** The criterion says "the
app's own settings are written to the app config directory". S7 persists the
user's chosen folders in `localStorage` (§6.2), which in the WebView lives in
the app's *local data* directory, not literally the config directory. It is
app-specific, per-user storage and it satisfies the intent; it does not satisfy
the letter. Flagged for a possible revisit in S21, when a settings screen
exists and a store plugin might pay for itself.

### 1.1 End-of-session deliverable: two CLAUDE.md edits

These are part of the session, not paperwork to do later. The session is not
done until both are made:

1. **Technology Stack table — folder picker.** Add `@tauri-apps/plugin-dialog`
   as a justified NFR-8 deviation: US-1.2 requires a native folder picker;
   Tauri's sanctioned plugin is used rather than a hand-rolled `rfd` command;
   it adds no network capability (NFR-5 intact).
2. **Technology Stack table — unit testing.** The row currently reads "Vitest
   with jsdom". It becomes "Vitest with jsdom + `@testing-library/preact` for
   components", with the component-test convention of §7.3 recorded alongside
   it: query by accessible role where one exists, `data-testid` otherwise,
   **never by translated text**.

`REQUIREMENTS.md` NFR-8 already lists the expected deviations and should gain
these two in the same edit if the reviewer agrees. `ROADMAP.md` is **not**
touched by this session.

---

## 2. What was verified in the plugin sources, so nobody has to re-derive it

The design in §5 rests on four facts read out of the crate sources in the local
cargo registry (`tauri-plugin-fs 2.5.2`, `tauri 2.11.5`). They are written down
here because getting any of them wrong produces an app that fails only on
Windows, where we cannot debug it.

### 2.1 The runtime fs scope is checked *in addition to* the capability scope

`tauri-plugin-fs-2.5.2/src/commands.rs`, in `resolve_path()`:

```rust
if fs_scope.scope.is_allowed(&resolved_path) || scope.is_allowed(&resolved_path) {
```

`scope` is built from the capability's `global_scope` + `command_scope`.
`fs_scope` is the **runtime** scope, reachable from Rust through the `FsExt`
trait (`src/lib.rs:435`) as `app.fs_scope()`. It is initialised **empty** —
`tauri::fs::Scope::new(app, &FsScope::default())` (`src/lib.rs:490`) — and
`tauri::fs::Scope` is `Arc`-backed, so the value `fs_scope()` returns shares
state with the one the commands consult.

**Consequence, and this is the whole design:** a capability that grants read
*permissions* with **no scope entries at all**, plus a Rust-side
`allow_directory(path, true)`, is both sufficient and the tightest possible
grant. Nothing is readable until we say so, at runtime, per directory.

### 2.2 `allow_directory` grants the directory *and* its subtree

`tauri-2.11.5/src/scope/fs.rs`, `Scope::allow_directory()` pushes two patterns:
the directory itself, and `directory/**` when `recursive` is true. So one call
per root covers both `readDir` on the root and `open` on a nested
`…/<session>/audit.jsonl`.

### 2.3 `fs:read-all` and `fs:default` are NOT read-only

`permissions/read-all.toml` bundles `open`. `commands::open` accepts a
caller-supplied `OpenOptions { write, truncate, create, append, … }` and honours
it — the permission is named for the *command*, not for the mode. A frontend
holding `fs:allow-open` can therefore open a file for writing.

**The capability must list individual `fs:allow-*` permissions and must never
be "simplified" to `fs:read-all`, `fs:default` or `fs:scope`.** The §8 analyser
check that forbids `.write(` / `.writeText(` / `.truncate(` on a file handle is
what actually guards this at the code level; the §8 capability check is what
guards it at the configuration level. Both exist because neither alone is
enough.

### 2.4 The Windows path-form question, answered

`src/model/paths.ts` emits forward slashes (`C:/Users/…`). Tauri's
`Scope::is_allowed` canonicalises the candidate path, which on Windows yields
the verbatim form `\\?\C:\Users\…`. A naive reading says the pattern would never
match.

It does match, because `tauri-2.11.5/src/scope/fs.rs::push_pattern` (line 92)
does three things when a pattern is added: it reconstructs the path with the
*native* separator (`C:/Users/x` → `C:\Users\x`), it strips a verbatim prefix
when one is present, and it additionally inserts a `canonicalize_parent()`
variant — which is where the `\\?\` form comes from.

So passing our normalised forward-slash path to `allow_directory` is correct.
**This is nevertheless the most likely thing to break on Windows and it cannot
be tested here.** See the S22 checklist, §10.

### 2.5 The dialog plugin grants scope automatically — and that is not enough

`plugins-workspace/v2/plugins/dialog/src/commands.rs` (line ~162) calls
`window.try_fs_scope()?.allow_directory(&path, options.recursive)` when a
directory is picked. Two consequences:

- The JS call **must** pass `recursive: true`, or only the picked directory
  itself is granted and every session subdirectory is forbidden.
- A folder restored from `localStorage` on the next start never goes through
  the dialog, so it gets no automatic grant. **The `grant_read_access` command
  of §5.1 is required regardless of the dialog's behaviour.** Do not delete it
  on the grounds that "the picker already does that".

### 2.6 `readTextFileLines` is rejected

The plugin's `read_text_file_lines` decodes on the Rust side as UTF-8. The
reference tree contains UTF-8, UTF-8-with-BOM **and UTF-16** files (MAP.md §4,
US-1.3). Using it would silently destroy every UTF-16 log and would move the
byte→line boundary out of `src/model/encoding.ts`, which S6 deliberately made
its single owner. Read bytes, decode in `createLineDecoder`. See §5.2.

### 2.7 Linux discovery would otherwise be degenerate

`rootCandidates()` emits candidates only where `localAppData` / `appData` are
non-null, plus a macOS branch. On Linux, as things stand today, that is **zero
candidates** — the empty state would name nothing and the only check this
machine can run would exercise no path joining at all.

Fixed in the Rust command, not in the model: `host_environment` maps Linux
`localAppData → $XDG_DATA_HOME` or `~/.local/share`, and `appData →
$XDG_CONFIG_HOME` or `~/.config`. `src/model/discovery-paths.ts` stays pure and
**is not edited by this session**.

---

## 3. File inventory — 15 production/config files

### 3.1 Created — `src/services/`

| File | Purpose |
|------|---------|
| `src/services/filesystem-tauri.ts` | The `FileSystem` implementation over `@tauri-apps/plugin-fs`, plus the `host_environment` / `grant_read_access` bridge. |
| `src/services/root-store.ts` | `localStorage` persistence of user-chosen roots. Mirrors `locale-store.ts`. |
| `src/services/folder-picker.ts` | The dialog call, the scope grant, the persistence, and the US-1.2 AC 4 "no session data here" probe. |

### 3.2 Created — `src/components/`

| File | Purpose |
|------|---------|
| `src/components/empty-state.tsx` | The US-1.1 empty state card, the chosen-folder list, and the provisional summary strip. |

### 3.3 Changed

| File | Change |
|------|--------|
| `src/services/filesystem.ts` | Replace the `TODO(S7)` with `createTauriFileSystem()`. The dev/Tauri guard itself is untouched. |
| `src/state/app-state.ts` | Add the discovery/scan signals and the three actions. |
| `src/app.tsx` | Render the empty state; delete the S2 demo stat card. |
| `src/i18n/de.ts` | 16 new keys (§7.2). Source of truth. |
| `src/i18n/en.ts` | The same 16 keys. |
| `src/styles/index.css` | Empty-state card styling, custom properties only. |
| `src-tauri/src/lib.rs` | Two commands, the `setup()` scope grant, the dialog plugin registration. |
| `src-tauri/capabilities/default.json` | The read-only permission list + `dialog:allow-open`. |
| `src-tauri/Cargo.toml` | `tauri-plugin-dialog = "2"`. |
| `package.json` | `@tauri-apps/plugin-dialog` (dependency), `@testing-library/preact` (devDependency). |
| `vite.config.ts` | `test.setupFiles` for component-test cleanup (§7.3). |

**Not touched, deliberately:** everything under `src/model/` — it stays pure and
this session adds no model code at all; `plugins/`; `src/main.tsx` (its dev-only
console block is *kept*, because §9 uses it as the manual evidence, and S8
deletes it); `tsconfig.json`; `.github/workflows/`.

### 3.4 Created — tests and test infrastructure

| File | Purpose |
|------|---------|
| `src/services/read-only-guarantee.test.ts` | US-1.6. The session's most important deliverable. §8. |
| `src/services/filesystem-tauri.test.ts` | The implementation, against an injected bridge. |
| `src/services/tauri-empty-state.test.ts` | The automatable half of the exit criterion. |
| `src/services/root-store.test.ts` | |
| `src/services/folder-picker.test.ts` | |
| `src/components/empty-state.test.tsx` | The first component test in the project. |
| `test/setup-component-tests.ts` | `afterEach(cleanup)` — see §7.3. |
| `test/fixtures/utf16le-lines.bin` | Invented UTF-16LE-with-BOM bytes for the chunked-read test. |

`test.include` in `vite.config.ts` is **not** widened: the existing glob
`src/**/*.{test,spec}.{ts,tsx}` already matches `.tsx`, and `test/` stays
outside it.

---

## 4. Build order — four stages, each green before the next

This session has two halves that can destabilise each other. Build them in this
order and run the stage gate each time. Do not start Stage 4 with Stage 2 red.

**Stage 1 — Rust and capability. Gate: `cargo check`.**
`src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`.
Start the cold build immediately; it is the long pole. `cargo check` is a real
gate, not a formality: `build.rs` runs `tauri_build::build()`, which parses the
capability files and **fails on an unknown or unregistered permission
identifier**. A capability naming a dialog permission before the plugin is
registered will not compile.

**Stage 2 — the filesystem implementation. Gate: `npm test` + `npm run build`.**
`src/services/filesystem-tauri.ts`, `src/services/filesystem.ts`,
`read-only-guarantee.test.ts`, `filesystem-tauri.test.ts`,
`tauri-empty-state.test.ts`, the byte fixture. **No UI file is touched in this
stage.** At the end of Stage 2 the session's US-1.1 and US-1.6 obligations are
complete and verifiable.

**Stage 3 — picker and persistence. Gate: `npm test`.**
`package.json` (`@tauri-apps/plugin-dialog`), `src/services/root-store.ts`,
`src/services/folder-picker.ts` and their tests. Still no UI.

**Stage 4 — the UI. Gate: the full §9 command list.**
`package.json` (`@testing-library/preact`), `vite.config.ts`,
`test/setup-component-tests.ts`, `src/components/empty-state.tsx`,
`src/state/app-state.ts`, `src/app.tsx`, both i18n catalogues,
`src/styles/index.css`, `empty-state.test.tsx`. Then the two CLAUDE.md edits of
§1.1.

---

## 5. Boundary types and signatures

### 5.1 `src-tauri/src/lib.rs`

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostEnvironment {
    platform: String,               // "windows" | "macos" | "linux"
    local_app_data: Option<String>,
    app_data: Option<String>,
    home: Option<String>,
}

/// Resolves the environment US-1.1's root list is derived from.
/// Windows: %LOCALAPPDATA%, %APPDATA%.
/// macOS:   ~/Library/Application Support for both (the model only uses `home`).
/// Linux:   $XDG_DATA_HOME|~/.local/share and $XDG_CONFIG_HOME|~/.config (§2.7).
#[tauri::command]
fn host_environment() -> HostEnvironment;

/// Extends the fs READ scope with directories the USER chose (US-1.2), and with
/// folders restored from persistence on start-up (§2.5). Returns how many were
/// granted. It is NEVER used for the five automatic roots: those are granted in
/// setup(), where the frontend cannot influence them.
#[tauri::command]
fn grant_read_access(app: tauri::AppHandle, paths: Vec<String>) -> Result<usize, String>;
```

`run()` additionally:

- registers `tauri_plugin_dialog::init()` alongside `tauri_plugin_fs::init()`;
- in `setup()`, computes the same `HostEnvironment`, derives the five US-1.1
  roots **in Rust**, and calls `app.fs_scope().allow_directory(p, true)` for
  each. Deriving them a second time in Rust is deliberate duplication of the
  five path shapes: it is what keeps the automatic grant out of the frontend's
  reach. Keep the two lists adjacent in a comment so a future change to
  `discovery-paths.ts` is obviously paired with a change here.
- A failing grant is logged as a class name and swallowed — it never aborts
  start-up (NFR-3), and **no path ever appears in a returned error string or a
  log line** (NFR-6). `grant_read_access` returns `Err(String)` carrying an
  error *kind*, never an OS message and never the offending path.

### 5.2 `src/services/filesystem-tauri.ts`

```ts
/** Everything this module needs from Tauri, injected so tests need no globals. */
export interface TauriBridge {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; isDirectory: boolean; isFile: boolean; mtime: Date | null }>;
  readDir(path: string): Promise<readonly {
    name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean;
  }[]>;
  readFile(path: string): Promise<Uint8Array>;
  open(path: string, options: { read: true }): Promise<TauriFileHandle>;
}

export interface TauriFileHandle {
  read(buffer: Uint8Array): Promise<number | null>;
  close(): Promise<void>;
}

export interface TauriFileSystemOptions {
  readonly bridge?: TauriBridge;              // defaults to the real plugin
  readonly manualRoots?: readonly string[];   // the persisted US-1.2 list
}

export async function createTauriFileSystem(
  options?: TauriFileSystemOptions,
): Promise<FileSystem>;   // kind: "tauri"
```

Behaviour, method by method:

- **`rootCandidates()`** — `invoke<HostEnvironment>("host_environment")`, fed
  straight into S6's pure `rootCandidates(env)`. Unchanged model function. Then
  `manualRoots` are appended as `{ path, label: path, origin: "manual" }`, and
  `invoke("grant_read_access", { paths: manualRoots })` is called **once**,
  before the candidates are returned.
- **`stat()`** — `exists()` first; `null` when false, otherwise map `stat()`.
  Two IPC round trips, but only for the handful of root candidates: the
  directory walk uses `listDirectory`, never `stat`.
- **`listDirectory()`** — `readDir()` mapped to `{ name, kind }`. An entry with
  `isSymlink` gets one follow-up `stat()` on the joined path to determine its
  kind; if that fails the entry is dropped rather than guessed. **No
  `String.prototype.normalize()` on `name`** — filenames are opaque bytes (S6
  §6; every non-ASCII name in the reference tree is NFD).
- **`readFileBytes()`** — `readFile()`. Manifests and `spaces.json` only.
- **`readLines()`** — `open(path, { read: true })`, then a loop reading into a
  reused 64 KiB `Uint8Array`, pushing `buffer.subarray(0, n)` into
  `createLineDecoder()`, then `decoder.finish()`. `close()` in a `finally`, so a
  throwing consumer cannot leak the handle. Same single-iteration guard as the
  dev implementation: a second `[Symbol.asyncIterator]()` throws
  `new FileSystemError("protocol", "readLines-reused")`.
- **Errors.** Every failure leaving this module is a `FileSystemError` with a
  code and at most a bounded `hint` (an error class name). **Never an OS
  message** — on Windows those contain the full path (NFR-6).

### 5.3 `src/services/filesystem.ts` — one change

```ts
const { createTauriFileSystem } = await import("./filesystem-tauri.js");
return createTauriFileSystem({ manualRoots: loadManualRoots() });
```

The `import.meta.env.DEV && !("__TAURI_INTERNALS__" in globalThis)` guard is
**unchanged** and is now load-bearing in both directions: under `npx tauri dev`
the Vite middleware is live inside the WebView, and only that guard keeps the
Tauri implementation selected. §9 turns this into a falsifiable check.

### 5.4 `src/services/root-store.ts`

```ts
export function loadManualRoots(): readonly string[];
export function storeManualRoots(roots: readonly string[]): void;
```

Key `claude3pcost.roots`, a JSON string array. Same defensive shape as
`locale-store.ts`: a throwing `localStorage`, an absent key, a non-array value
or a non-string element all degrade to `[]`, never to an exception. Paths are
run through `normalizePath()` and de-duplicated on store.

### 5.5 `src/services/folder-picker.ts`

```ts
export type PickOutcome =
  | { kind: "cancelled" }
  | { kind: "added"; paths: readonly string[] }
  | { kind: "no-session-data"; paths: readonly string[] }   // US-1.2 AC 4
  | { kind: "failed" };

export async function pickRootFolders(fs: FileSystem): Promise<PickOutcome>;
export function removeRoot(path: string): readonly string[];
```

`pickRootFolders` calls `open({ directory: true, multiple: true, recursive: true })`
(`recursive` matters — §2.5), calls `grant_read_access` for the result, then
probes each picked path with a bounded `discover()` over that single candidate.
A path yielding zero sessions is returned as `no-session-data` and is **not**
persisted. No new walking logic is written here; the probe is S6's `discover()`
with `{ candidates: [thisOne] }`.

### 5.6 `src-tauri/capabilities/default.json`

Permissions, with **no scope entries**:

```
"core:default",
"fs:allow-exists", "fs:allow-stat", "fs:allow-read-dir",
"fs:allow-open",   "fs:allow-read", "fs:allow-read-file",
"dialog:allow-open"
```

Deliberately absent: `fs:default`, `fs:read-all`, `fs:write-all`, `fs:scope`,
and anything matching write / create / mkdir / remove / rename / copy /
truncate. `fs:allow-watch` belongs to S20, not here. See §2.3 for why
`fs:read-all` is not the shortcut it looks like.

### 5.7 `src/state/app-state.ts`

```ts
export type ScanState = "idle" | "scanning" | "done" | "failed";

export const scanState: Signal<ScanState>;
export const discovery: Signal<Discovery | null>;
export const report: Signal<Report | null>;
export const manualRoots: Signal<readonly string[]>;
export const pickMessage: Signal<"none" | "no-session-data" | "failed">;

export async function runScan(): Promise<void>;
export async function chooseFolder(): Promise<void>;
export function removeManualRoot(path: string): void;
```

`runScan()` is the only caller of `createFileSystem()` → `discover()` →
`scanDiscovery()`. It never throws: a failure sets `scanState` to `"failed"`
(NFR-3). The existing `locale` signal and `setLocale` are untouched.

---

## 6. The UI

### 6.1 Layout — the centred card

```
+-----------------------------------------------+
|  Claude3PCost           [DE|EN]        v0.1.0 |
+-----------------------------------------------+
|                                               |
|          Keine Sitzungsdaten gefunden         |
|                                               |
|   Claude3PCost hat an diesen Orten gesucht:   |
|                                               |
|     %LOCALAPPDATA%\Claude-3p\local-agent-...  |
|     %LOCALAPPDATA%\Claude-3p\claude-code-...  |
|     %APPDATA%\Claude\local-agent-mode-ses...  |
|     %APPDATA%\Claude\claude-code-sessions     |
|                                               |
|            [  Ordner wählen...  ]             |
|                                               |
+-----------------------------------------------+
```

Single column, one focus order, one call to action. The locations are a `<ul>`;
each `<li>` carries `RootCandidate.label` — the **unexpanded** form — as its
text, and the expanded absolute path in `title`. That satisfies US-1.1's "naming
the paths it looked in" and CLAUDE.md's "display basenames, keep full paths to
hover text" at the same time, and it keeps the user's home directory and
username off a screenshot.

With chosen folders present it grows a second block, basenames on screen and
full path in `title`:

```
|  Eigene Ordner                                |
|    sessions-backup            [ Entfernen ]   |
|    claude-archiv              [ Entfernen ]   |
|    + Ordner wählen...                         |
```

US-1.2 AC 4 is the same card with the headline swapped to
`empty.noDataInFolder`. The `[Entfernen]` control carries an aria-label built
from `empty.removeRootLabel` so it is distinguishable by screen reader
(NFR-11).

### 6.2 The summary strip, and the S7/S8 boundary

US-1.1 also requires that the roots actually used, and the number of accounts
and profiles, are visible. **S8 owns the status bar** — its scope says so
explicitly. To avoid building the same thing twice, S7 surfaces the counts as a
one-line **provisional summary strip** rendered only when roots *were* found:

```
3 Orte · 2 Konten · 4 Profile · 150 Sitzungen
```

The merging itself is not written here: S6's `discover()` already returns
`accountCount`, `profileCount` and per-root `accounts` / `profiles`. S7 adds no
merging logic at all.

**Permanent — S8 inherits and must not rewrite:**
`src/services/filesystem-tauri.ts`, `root-store.ts`, `folder-picker.ts`, all of
`src-tauri/`, the `EmptyState` component itself, all §7.2 i18n keys, and the
signals and actions of §5.7.

**Provisional — S8 may replace freely:** the summary strip (S8's status bar
supersedes it, and its four `scan.*Count` keys move there), the `app.tsx` layout
*around* the card, and the dev-only `console.log` block in `src/main.tsx`, which
S7 keeps as the §9 manual evidence and S8 deletes.

---

## 7. Localization and the component-test convention

### 7.1 Removed

The S2 demo stat card goes, and with it the `placeholder.noData` key. The
`card.*` keys stay — S8 uses them.

### 7.2 Added — 16 keys, 24 entries with plurals

```
empty.title                 Keine Sitzungsdaten gefunden
empty.searchedIntro         Claude3PCost hat an diesen Orten gesucht:
empty.noKnownLocations      (fallback: no candidate paths on this system)
empty.chooseFolder          Ordner wählen…
empty.noDataInFolder        Keine Sitzungsdaten in diesem Ordner gefunden
empty.manualRootsTitle      Eigene Ordner
empty.removeRoot            Entfernen
empty.removeRootLabel       {name} entfernen          (aria-label, NFR-11)
empty.pickFailed            (the folder picker could not be opened)
scan.running                Suche läuft…
scan.rootCount.one/.other
scan.accountCount.one/.other
scan.profileCount.one/.other
scan.sessionCount.one/.other
```

`de.ts` is the source of truth and stays `as const`; `en.ts` stays
`as const satisfies Record<TranslationKey, string>`. Key parity is enforced by
`tsc` alone — a missing key is TS1360, an extra key TS2353. No parity script.
English is `en-GB`.

### 7.3 The component-test convention this session establishes

S7 ships the first `.tsx` test in the project, so it sets the pattern every
session from S8 onward follows:

- **Query by accessible role** where one exists (`getByRole("button", …)`,
  `getByRole("list")`), **`data-testid` otherwise**, and **never by translated
  text.** This is the same rule CLAUDE.md already sets for Playwright, applied
  one layer down, and for the same reason: the language switch must not break
  every test.
- `empty-state.test.tsx`'s **`renders in both locales`** case is what enforces
  it. It renders the component under `de` and under `en` and asserts the *same*
  queries succeed in both. A test that reached for German text would fail its
  English half immediately.

**Wiring.** `@testing-library/preact` registers its auto-cleanup only when a
global `afterEach` exists. Vitest does not provide one unless `globals: true`,
which this project does not set and should not start setting. So:

```ts
// vite.config.ts  →  test:
setupFiles: ["./test/setup-component-tests.ts"],
```

```ts
// test/setup-component-tests.ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/preact";
afterEach(cleanup);
```

This is why `vite.config.ts` is on the changed list and the count is 15 rather
than 14 — announced here rather than appearing unexplained during Stage 4.
`test/` is outside `tsconfig.json`'s `include`, exactly as `plugins/` is; the
setup file is type-checked by the editor and by ESLint, not by `npm run build`.
`@testing-library/preact` is MIT, dev-only, and never reaches a production
bundle.

---

## 8. The US-1.6 test, in detail

`src/services/read-only-guarantee.test.ts`. A test that cannot fail is worth
nothing, so this one is built so a broken *analyser* fails too.

**Part 1 — static analysis over the real module graph.** A helper local to the
test file (tests may import `node:fs`; production code under `src/` may not)
starts from four entry points — `scan.ts`, `discovery.ts`, `filesystem.ts`,
`filesystem-tauri.ts` — resolves every relative `import` and `import()`
specifier transitively (`.js` → `.ts`), and collects the source of each
reachable module. Over that set it asserts:

- **(a)** No named import from `@tauri-apps/plugin-fs` intersects
  `{create, writeFile, writeTextFile, mkdir, remove, rename, copyFile, truncate}`.
- **(b)** No namespace or default import from `@tauri-apps/plugin-fs` — a
  namespace import would defeat name-level analysis, so it is banned outright.
- **(c)** No member call matching `/\.(write|writeText|truncate)\s*\(/`. **This
  is the one that matters.** `open()` returns a handle that *has* `write` and
  `truncate`; the import check alone would sail past `handle.write(bytes)`. It
  is also the code-level guard behind §2.3.
- **(d)** The set of string literals passed to `invoke(...)` is a subset of
  `{"host_environment", "grant_read_access"}` — so adding a Rust write command
  and calling it from the scanner goes red.
- **(e)** No string literal matching
  `/plugin:fs\|(write|create|mkdir|remove|rename|copy|truncate)/` — catches a
  raw IPC call bypassing the JS wrapper.

**Part 2 — the capability file.** Parse `src-tauri/capabilities/default.json`
and assert: no permission identifier matches
`/^fs:.*(write|create|mkdir|remove|rename|copy|truncate)/`, and the list
contains none of `fs:default`, `fs:read-all`, `fs:write-all`, `fs:scope`. This
goes red on the *other* half of the acceptance criterion — somebody widening the
grant — and it reads a file `cargo check` also consumes, so it is not
tautological.

**Part 3 — the self-check that makes this a real test.** The analyser is run
over an inline known-bad source containing
`import { writeTextFile } from "@tauri-apps/plugin-fs"`, a `handle.write(buf)`
call and `invoke("fs_delete_everything")`, and the test asserts it reports
**exactly three** violations. A regex that silently stops matching now fails the
suite instead of certifying a clean tree. This is LEARNINGS' "build a test so
the wrong implementation gives a different answer", applied directly.

**What it catches.** A write import; a write method call on a file handle; a new
Rust command invoked from the scanner graph; a raw `plugin:fs|write*` invoke; a
widened capability.

**What it misses, stated honestly.** Computed access
(`fsModule["write" + "File"]`); a write reached through a module not statically
imported from the four entry points; a write inside `src-tauri/` Rust that
nothing calls from the frontend; `localStorage` writes, which are deliberately
allowed because they touch no session root; and anything in `src/components/` or
`src/state/` unless it is reachable from the entry set. Part 2 is the backstop
for the Rust side: even a rogue Rust write is not reachable from the frontend
without a permission Part 2 forbids.

---

## 9. Tests to write, and the exit commands

### 9.1 Tests, by name

`src/services/read-only-guarantee.test.ts`
- `no reachable module imports a write API from @tauri-apps/plugin-fs`
- `no reachable module uses a namespace or default import of the fs plugin`
- `no reachable module calls .write / .writeText / .truncate on a file handle`
- `the scanner graph invokes only host_environment and grant_read_access`
- `no reachable module contains a raw plugin:fs write invoke string`
- `the capability file grants no write permission and no blanket fs set`
- `the analyser reports exactly three violations for a known-bad source`

`src/services/filesystem-tauri.test.ts`
- `rootCandidates maps the Rust host environment through the pure model function`
- `rootCandidates on a Linux host yields the XDG-mapped candidates`
- `rootCandidates appends persisted manual roots and grants read access for them`
- `stat returns null for a path that does not exist`
- `stat maps a directory and a file`
- `listDirectory maps entries and resolves a symlink entry with a follow-up stat`
- `listDirectory does not Unicode-normalise an NFD filename`
- `readLines decodes a UTF-16LE BOM fixture delivered in three chunks`
- `readLines reports encoding and hadReplacement after iteration`
- `readLines closes the file handle when the consumer throws`
- `readLines rejects a second iteration`
- `a failing read surfaces a FileSystemError whose message contains no path`

`src/services/tauri-empty-state.test.ts`
- `createFileSystem returns the tauri implementation when __TAURI_INTERNALS__ is present`
- `createFileSystem returns the dev implementation under DEV without Tauri internals`
- `discovery with no existing root yields zero roots and five searched candidates`
- `scanDiscovery over an empty discovery yields a zero report and no problems`

`src/services/root-store.test.ts`
- `loads an empty list when the key is absent`
- `ignores a malformed or non-array stored value`
- `round-trips, de-duplicates and normalises stored roots`
- `survives a throwing localStorage`

`src/services/folder-picker.test.ts`
- `a cancelled pick returns cancelled and stores nothing`
- `a picked folder containing audit.jsonl is added and persisted`
- `a picked folder without audit.jsonl returns no-session-data and is not persisted`
- `picking requests recursive scope and grants read access exactly once`

`src/components/empty-state.test.tsx`
- `names every searched location using the unexpanded label`
- `puts the expanded path only in the title attribute`
- `renders the chosen-folder list with basenames and a remove control`
- `swaps the headline when a chosen folder contains no session data`
- `renders in both locales without a hardcoded string`

The UTF-16 case reads **bytes from a fixture**, not a pre-decoded string:
decoding is the step under test, and LEARNINGS is explicit that a hand-built
literal which pre-fills the field under test assumes away the only thing that
can go wrong.

### 9.2 Exit commands

```bash
npm test
npm run build
npm run lint
npm run format:check
grep -rlP '\x00' src/ plugins/ test/            # must print nothing (LEARNINGS)
cargo check --manifest-path src-tauri/Cargo.toml
npx tauri dev                                    # manual
```

`cargo check` is real evidence, not ceremony: `build.rs` → `tauri_build::build()`
parses `capabilities/*.json` and **fails on an unknown or unregistered
permission identifier**. It is the strongest automated proof this machine can
produce that the capability file is valid and read-only. Cold build: 5–15
minutes.

Optionally, and slower: `npx tauri build --debug --no-bundle` proves the
frontend and backend actually link.

### 9.3 The manual check, and what it proves

`npx tauri dev` starts `npm run dev` as its `beforeDevCommand`, so the
`reference-material` middleware is live inside the WebView and
`import.meta.env.DEV` is true. The dev-only block in `src/main.tsx` therefore
runs. The implementer records the devtools console line, which **must literally
read**:

```
[claude3pcost] roots=0 sessions=0
```

This is falsifiable in a useful way. If the S6 selection guard regressed and the
dev filesystem were chosen, the same line would report two roots and 150
sessions. A `0 / 0` therefore proves: the Tauri implementation was selected; both
commands are registered and callable over IPC; the capability file loaded
without an ACL error; and the discovery walk completed against a real
filesystem and produced the empty state rather than an error.

**What it does not prove.** Nothing about Windows. Not `%LOCALAPPDATA%`
resolution, not the forward-slash → `\\?\C:\…` scope-pattern match of §2.4, not
a UNC network root, not the NSIS per-user install (NFR-1), and not one single
happy path — there is no 3P data on this machine and Linux is not a target
platform. It proves the app boots and the empty path is clean. That is the whole
of what the exit criterion claims.

---

## 10. Handover: the S22 Windows checklist this session creates

S22 verifies the release on Windows. These items exist because of decisions made
here and cannot be checked anywhere else:

1. **Scope pattern form.** Confirm `allow_directory` with a forward-slash
   `C:/Users/…` path actually grants read access on Windows (§2.4). If it does
   not, the fix is to hand `allow_directory` a backslash path; the failure mode
   is `PathForbidden` on every read.
2. **UNC roots.** Confirm a `//server/share/…` root survives `normalizePath`,
   the scope grant and `readDir`.
3. **Real environment variables.** Confirm `host_environment` returns
   `%LOCALAPPDATA%` and `%APPDATA%` and that all four Windows candidates are
   produced in US-1.1's order.
4. **The happy path.** Roots found, accounts and profiles merged and counted,
   and the regression figures of US-1.3 reproduced from a real tree.
5. **The picker end to end.** Pick a folder, restart, confirm it is still there
   and still readable — i.e. that `grant_read_access` re-grants a persisted
   root without a dialog (§2.5).
6. **`claude-code-sessions`.** REQUIREMENTS "Open points" 1: the sample has
   manifests but no `audit.jsonl` under that root, so the code path is still
   unvalidated against real data.

---

## 11. Risks

- **Cold Tauri build time.** Start Stage 1 first. Discovering a 12-minute build
  at the end of the session is how a session runs out of room.
- **`fs:allow-open` is write-capable if the caller asks** (§2.3). The guard is
  the §8 Part 1(c) analyser check, not the capability. Anyone who later
  "simplifies" the permission list to `fs:read-all` has widened it, not
  tidied it.
- **Symlink entries cost an extra IPC round trip each.** Expected to be zero on
  Windows. If it turns out hot, S20 revisits.
- **Two new dependencies in one session** (§1). If either turns out not to fit,
  stop and report rather than improvising a different design — the plan is
  wrong at that point, and improvising is how the tree goes red.
