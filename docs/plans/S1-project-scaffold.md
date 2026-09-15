# S1 — Project scaffold from CalView

**Status.** Approved plan. Written in the planning phase of session S1.
**Implementer.** Sonnet agent. Follow this document literally; do not expand scope.
**Depends on.** Nothing. This is the first session.

---

## 0. Read this first — environment facts

You are working in the repository root. Use
absolute paths everywhere: the Bash tool resets its working directory between
calls.

**Rust is installed but is not on this session's PATH.** rustup wrote
`. "$HOME/.cargo/env"` into `~/.zshenv` after the shell environment had already
been snapshotted. Every command that touches `cargo`, `rustc`, `tauri-build`,
`npx tauri build` or `npx tauri dev` must therefore be written as a **single**
Bash invocation that begins with:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

Installed versions: `cargo 1.98.1`, `rustc 1.98.1`, default toolchain
`stable-aarch64-apple-darwin`. Apple clang and the Xcode Command Line Tools are
present, so linking works.

**The local target is `aarch64-apple-darwin`.** A successful
`npx tauri build --debug` on this machine proves that the Rust tree compiles and
links on macOS, that `lib.rs` is genuinely free of CalView's keyring and COM
code, and that `tauri-plugin-fs` resolves. It proves **nothing** about the
Windows NSIS bundle or the Linux `.deb`/AppImage — those are first exercised by
GitHub Actions on push. Do not claim otherwise in your report.

**Git.** The repository is already initialised: branch `main`, clean working
tree, three commits. The "Initialise git" item in the roadmap scope is done.
What remains is creating the GitHub remote and pushing (Tier 3 below).

**The repository will be public.** Everything you commit is world-readable from
the first push. Do not write a secret, an absolute path from this machine, a
username, or any other machine-specific detail into a committed file. The three
input directories `poc/`, `reference-material/` and `calview/` are gitignored
and must stay that way; no fragment of `reference-material/` may reach the
repository in any form, including quoted into a comment or a fixture.

---

## 1. Goal and scope

**Goal.** A Tauri v2 + Preact + TypeScript project that builds and opens a
window titled `Claude3PCost`, named correctly in every configuration file.

**In scope.** Copying and adapting CalView's build configuration, Tauri
configuration, licence-collection Vite plugin and GitHub Actions workflows;
applying the naming table in `CLAUDE.md`; stripping every CalView-specific
dependency and code path; adding `tauri-plugin-fs`; generating the icon set;
creating the GitHub remote and pushing.

**Out of scope.** Any application logic. Any UI beyond the placeholder shell
specified in §4. Any test. The i18n layer (S2), the parser (S3), the filesystem
service (S6/S7), Playwright (S8), a charting library (S18).

**The trap the roadmap flags.** `src-tauri/src/lib.rs` must end up genuinely
empty of CalView's commands. Leaving the keyring or the Windows COM code in
drags in dependencies this app does not want and breaks the Linux CI build.
§5.3 gives the replacement file in full.

---

## 2. Decisions made in planning

These eight questions were settled with the user before implementation. They are
recorded here because this plan is a committed artifact that should explain why
the session looks the way it does.

| # | Decision | Reasoning |
|---|----------|-----------|
| 1 | **Initial version `0.1.0`**, synchronised across `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. | CalView is at 1.1.0; this app has shipped nothing. NFR-10's tag check (`v` + the `package.json` version) works identically at 0.x. Reaching 1.0.0 becomes a deliberate act at S22. |
| 2 | **Create the GitHub repository and push, public from the start.** | The S1 exit criterion "CI passes on the first push" is otherwise unreachable. Public was chosen deliberately; the consequence is the privacy assertion in §9 Tier 3 and the rule in §0 about machine-specific detail. |
| 3 | **Generated placeholder icon**, produced by a committed script, from a committed SVG source. | No brand asset exists, and copying CalView's icons would ship another product's mark. A committed generator keeps the set regenerable instead of being an opaque binary blob. |
| 4 | **Named placeholder shell**: product name plus version, window 1200×800, minimum 900×600. | A literally blank `<div id="app">` cannot be distinguished from a Preact mount that failed silently — which is precisely the signal S1 exists to give. The minimum size is new relative to CalView: the main view from S8 is a wide table that stops being readable below roughly 900 px. |
| 5 | **`tauri-plugin-fs` added as a dependency and initialised, but capabilities grant `core:default` only.** | The scope line says to add the plugin, and having it compile in S1 is worth proving early. The read-only scopes are a US-1.6 design decision that belongs with the discovery paths in S7. An initialised plugin with no granted permission is inert. |
| 6 | **A restrictive CSP now**, instead of CalView's `"csp": null`. | NFR-5 starts in this session. A null CSP permits the webview to reach any origin; writing the policy while there is no content to break is far cheaper than retrofitting it at S21, and it makes "offline by design" enforceable rather than aspirational. |
| 7 | **Copy `dependabot.yml`; do not copy `dependabot-auto-merge.yml`.** | The grouped npm/cargo/actions update config applies unchanged. Auto-merging minor and patch bumps is reasonable for an app with broad test coverage; on a scaffold with zero tests it would land dependency changes into a tree that cannot detect breakage. Revisit at S21. |
| 8 | **Copy `CROSS_COMPILE.md` (adapted); do not copy `AGENTS.md`.** | NFR-10 names `CROSS_COMPILE.md` as the documented Linux fallback, so it must exist in this repository. `CLAUDE.md` is already this repo's AI-guidance document; a second copy would drift. The `CLAUDE.md` pointer at `calview/CROSS_COMPILE.md` is repointed at the local copy. |

---

## 3. File inventory

Exhaustive. Source paths are relative to `calview/`; destinations are relative to
the repository root.

### 3.1 Copied verbatim — byte for byte, no edits

| File | Why it needs no change |
|---|---|
| `LICENSE.md` | EUPL-1.2, Sebastian Rettig, © 2026. Already correct for this project (NFR-12). |
| `plugins/vite-plugin-licenses.ts` | Contains no CalView-specific string. It reads `package.json` and `cargo metadata` generically and emits `virtual:licenses` plus `license-texts.json`. |
| `src/virtual-licenses.d.ts` | Type declaration for that virtual module. Unused in S1, needed from S21's About dialog, and free to carry. |
| `src-tauri/build.rs` | Two lines: `fn main() { tauri_build::build(); }`. |
| `.github/dependabot.yml` | Grouped npm / cargo / github-actions weekly updates; all three ecosystems apply unchanged. |

### 3.2 Copied and adapted

| File | Adaptation summary (details in §5) |
|---|---|
| `package.json` | Rename, version, drop HTTP plugin, add fs plugin, `--passWithNoTests`. |
| `tsconfig.json` | No content change expected — verify `"include": ["src"]` and the strict/ES2022/preact-jsx settings survive the copy. |
| `vite.config.ts` | Delete the CalDAV dev proxy; add the version `define`. |
| `index.html` | Title and `lang`. |
| `src/main.tsx` | Drop the two CalView-only stylesheet imports. |
| `src-tauri/Cargo.toml` | Rename; drop four dependencies; add one. |
| `src-tauri/src/main.rs` | One identifier. |
| `src-tauri/tauri.conf.json` | Names, identifier, version, window, CSP. |
| `src-tauri/capabilities/default.json` | Remove the HTTP grant. |
| `.github/workflows/ci.yml` | Artifact names and the portable-exe path. |
| `.github/workflows/release.yml` | Artifact names, portable-exe path, release title. |
| `CROSS_COMPILE.md` | Product, crate and binary names; drop any CalDAV/keyring-specific paragraph. |

### 3.3 Written new

| File | What it is |
|---|---|
| `src/app.tsx` | The placeholder shell (§4). Replaces CalView's 154-line component entirely. |
| `src/styles/index.css` | CalView's reset plus a trimmed, re-prefixed token set (§5.10). |
| `src/vite-env.d.ts` | Declares the `__APP_VERSION__` build-time constant. |
| `scripts/make-icon.mjs` | Generates `src-tauri/icons/source.svg` → `source.png` and drives `tauri icon` (§6). |
| `src-tauri/icons/source.svg` | The placeholder mark, committed so the set is regenerable. |
| `src-tauri/icons/source.png` | 1024×1024 rasterisation, committed because `tauri icon` needs a PNG input and regenerating from SVG requires macOS. |
| `src-tauri/icons/*` | The generated icon set. |
| `src-tauri/Cargo.lock` | Resolved fresh (§6). Both workflows key their Rust cache on `hashFiles('src-tauri/Cargo.lock')`, so it must be committed. |
| `package-lock.json` | Resolved fresh. Required by `npm ci` in both workflows. |

### 3.4 Changed in place

| File | Change |
|---|---|
| `CLAUDE.md` | Line ~247: `calview/CROSS_COMPILE.md` → `CROSS_COMPILE.md`. Leave the line ~61 mention of the template's files alone — that sentence is about what the template contains, and is still true. |
| `.gitignore` | No change. It already excludes `poc/`, `reference-material/`, `calview/`, `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, IDE files, OS files and `.env*`. Playwright's `test-results/` and `playwright-report/` belong to S8. |

### 3.5 Explicitly NOT carried over

Do not copy any of these, and do not create placeholders for them:

- `src/components/` — all thirteen components.
- `src/model/schedule.ts`, `src/model/schedule.test.ts`, `src/model/types.ts`.
- `src/services/` — all six, notably `http.ts`, `credential-store.ts`,
  `outlook.ts`, `caldav-client.ts`, `ical-parser.ts`, `favorites-store.ts`.
- `src/state/app-state.ts` — S1 has no state to hold. It arrives when something
  needs it.
- `src/styles/schedule.css`, `src/styles/calendar.css`.
- `AGENTS.md` (decision 8).
- `.github/workflows/dependabot-auto-merge.yml` (decision 7).
- `src-tauri/Cargo.lock`, `package-lock.json` — both resolve fresh.
- The entire `src-tauri/icons/` tree, including its `android/` and `ios/`
  subdirectories.

---

## 4. The placeholder shell

`src/app.tsx`, in full:

```tsx
/**
 * Root application component.
 *
 * S1 scaffold: renders a placeholder shell only. Application logic arrives
 * from S8 onward.
 */
export function App() {
  return (
    <main class="app-shell" data-testid="app-shell">
      {/* TODO(S2): route both strings through t() once src/i18n/ exists. */}
      <h1 class="app-shell__title">Claude3PCost</h1>
      <p class="app-shell__version">Version {__APP_VERSION__}</p>
    </main>
  );
}
```

No hooks, no signals, no imports beyond JSX. The `data-testid="app-shell"` hook
is deliberate: it is the first stable selector for S8's Playwright harness, and
NFR-9 requires specs to assert on roles and test ids rather than on translated
text.

Two English strings are hardcoded here, which architecture rule 7 forbids. This
is a knowingly incurred, single-session debt: the i18n layer does not exist until
S2, and S2's deliverable is explicitly "a demonstrably bilingual placeholder
screen" — meaning these two strings. The `TODO(S2)` comment is how S2 finds them.
Do not invent a stopgap translation mechanism.

`__APP_VERSION__` is a build-time constant so the displayed version cannot drift
from `package.json`. It is defined in `vite.config.ts` (§5.3) and declared in
`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
```

---

## 5. Adaptations in detail

### 5.1 `package.json`

Start from CalView's. Changes:

- `"name": "calview"` → `"claude-3p-cost"`
- `"version": "1.1.0"` → `"0.1.0"`
- **Remove** `"@tauri-apps/plugin-http": "^2.6.0"` from `dependencies`. This is
  where NFR-5 begins.
- **Add** `"@tauri-apps/plugin-fs": "^2"` to `dependencies`.
- `"test": "vitest run"` → `"test": "vitest run --passWithNoTests"` (§7).

Keep unchanged: `"private": true`, `"license": "EUPL-1.2"`, the `author` field,
`"type": "module"`, every other script (`dev`, `build`, `preview`, `test:watch`,
`tauri`), and every devDependency — `@preact/preset-vite`, `@tauri-apps/cli`,
`@types/node`, `jsdom`, `typescript`, `vite`, `vitest`.

Do not add Playwright (S8) or a charting library (S18). The sizing rule is
"never both a new layer and a new dependency in the same session"; the fs plugin
is this session's one dependency.

### 5.2 `tsconfig.json`

Copy as-is. Verify after copying that it still reads `"strict": true`,
`"target": "ES2022"`, `"moduleResolution": "bundler"`, `"jsx": "react-jsx"`,
`"jsxImportSource": "preact"`, `"noEmit": true` and `"include": ["src"]`. No
edit is expected; if one is needed, something went wrong with the copy.

### 5.3 `vite.config.ts`

CalView's file minus the CalDAV proxy, plus the version constant. In full:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import licensesPlugin from "./plugins/vite-plugin-licenses.js";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [preact(), licensesPlugin()],
  // S6: the reference-fs dev middleware plugin (NFR-13) is added here.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: "jsdom",
  },
});
```

The deleted block is CalView's entire `server.proxy` section, which forwarded
`/api/caldav` to `https://isb-kalender.zit.mwn.de`. It is a network dependency in
the dev server, and NFR-5 starts in this session. The `// S6:` comment marks the
insertion point so the next filesystem session does not have to rediscover it.

### 5.4 `index.html`

CalView's, with `<title>CalView</title>` → `<title>Claude3PCost</title>` and
`lang="de"` → `lang="en"`. S2 sets the `lang` attribute dynamically from the
locale signal; `en` is the correct placeholder because NFR-7 makes English the
default for any non-`de-*` OS locale. `<div id="app">` and the
`<script type="module" src="/src/main.tsx">` line are unchanged.

### 5.5 `src/main.tsx`

```tsx
import { render } from "preact";
import { App } from "./app";
import "./styles/index.css";

render(<App />, document.getElementById("app")!);
```

CalView additionally imported `./styles/schedule.css` and `./styles/calendar.css`;
neither is carried over.

### 5.6 `src-tauri/Cargo.toml`

In full:

```toml
[package]
name = "claude-3p-cost"
version = "0.1.0"
edition = "2021"
license = "EUPL-1.2"
authors = ["Sebastian Rettig <serettig@posteo.de>"]

[lib]
name = "claude_3p_cost_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Four things are dropped from CalView's file, all deliberately:

- `tauri-plugin-http = { version = "2", features = ["dangerous-settings"] }` —
  NFR-5.
- `keyring = { version = "3", features = ["windows-native", "apple-native", "sync-secret-service"] }`
  — this app stores no credentials.
- `log = "0.4"` — its only consumer was the Outlook command.
- The whole `[target.'cfg(windows)'.dependencies.windows]` block with its
  `Win32_Foundation`, `Win32_System_Com`, `Win32_System_Ole` and
  `Win32_System_Variant` features. **This is the specific block that would break
  the Linux CI job** if the COM code were left in `lib.rs`.

`serde` and `serde_json` are retained: Tauri command payloads need them from S7
onward, and they cost nothing now.

### 5.7 `src-tauri/src/main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claude_3p_cost_lib::run();
}
```

Only the crate identifier changes, and it must match `[lib] name` in
`Cargo.toml` exactly — underscores, not hyphens.

### 5.8 `src-tauri/src/lib.rs`

**Replace wholesale. Do not adapt.** CalView's 470-line file must go entirely:

- `use serde::{Deserialize, Serialize};`
- the `KEYRING_SERVICE` / `KEYRING_USER` constants and the `StoredCredentials`
  struct
- the commands `save_credentials`, `get_credentials`, `delete_credentials`
- the `OutlookCommandResult` struct
- the entire `#[cfg(windows)] mod outlook_com { … }` block, with `to_wide`,
  `get_dispid`, `invoke_method`, `get_property`, `put_property`,
  `variant_to_dispatch`, `variant_bstr`, `variant_i4`, `variant_date`,
  `create_appointment` and `create_appointment_inner`
- the command `open_outlook_appointment`

The new file, in full — this is the entire contents:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Note two removals relative to CalView's `run()`: the
`.plugin(tauri_plugin_http::init())` line, and the whole
`.invoke_handler(tauri::generate_handler![save_credentials, get_credentials, delete_credentials, open_outlook_appointment])`
call. S1 registers no commands at all, so there is no `invoke_handler`.

### 5.9 `src-tauri/tauri.conf.json`

In full:

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/config.schema.json",
  "productName": "Claude3PCost",
  "version": "0.1.0",
  "identifier": "de.bycsitsm.claude3pcost",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Claude3PCost",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    }
  },
  "bundle": {
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.png",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  },
  "plugins": {}
}
```

Three things to not touch:

- `"identifier": "de.bycsitsm.claude3pcost"` is baked into the installer and the
  per-user install location. `CLAUDE.md` treats it as fixed from the first
  tagged build; changing it after a release strands existing installations.
- `"installMode": "currentUser"` is NFR-1 — Windows installation without
  administrator rights.
- The `connect-src` entry includes `ipc:` and `http://ipc.localhost` because
  that is how the Tauri v2 webview reaches the Rust side; removing them breaks
  every future command call. It grants no network access: no `https:` scheme and
  no external host appears anywhere in the policy. If the dev window shows CSP
  violations for Vite's HMR websocket, do **not** widen the shipped policy —
  report it, since `devUrl` traffic is a dev-server concern.

### 5.10 `src-tauri/capabilities/default.json`

In full:

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-utils/schema/capability.json",
  "identifier": "default",
  "description": "Default capabilities for Claude3PCost",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

CalView's `{"identifier": "http:default", "allow": [{"url": "https://*"}]}` grant
is deleted. This file is where NFR-5 is actually enforced — the dependency being
absent is the first line of defence, the missing grant is the second.

No `fs:` permission and no scope is added in S1 (decision 5). S7 writes the
read-only scopes together with the discovery paths, under US-1.6.

### 5.11 `src/styles/index.css`

Written new, not copied. Take from CalView's `index.css`:

- the CSS reset verbatim — the
  `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`
  block and the `body` font-stack rules that follow it
- a **trimmed** custom-property set, re-prefixed `--cv-` → `--c3p-`

Keep only the tokens a scaffold and the near-term roadmap need:

`--c3p-primary`, `--c3p-primary-10`, `--c3p-primary-text`; `--c3p-warning`,
`--c3p-warning-text`; `--c3p-error`, `--c3p-error-10`, `--c3p-error-text`;
`--c3p-success-10`, `--c3p-success-text`; `--c3p-contrast-5`,
`--c3p-contrast-10`, `--c3p-contrast-20`; `--c3p-text-primary`,
`--c3p-text-secondary`; the `--c3p-font-xxs … --c3p-font-l` scale; the
`--c3p-space-xxs … --c3p-space-l` scale; `--c3p-radius-s`, `--c3p-radius-m`;
`--c3p-surface`, `--c3p-surface-raised`, `--c3p-border`. Keep CalView's colour
values — they are a coherent palette and S17's budget warning states will want
the warning/error pair.

Drop everything else in CalView's 982-line file: its calendar and schedule rules
and all its component classes.

Add the shell rules: `.app-shell` as a centred flex column filling the viewport,
`.app-shell__title` in `--c3p-text-primary`, `.app-shell__version` in
`--c3p-font-s` and `--c3p-text-secondary`. Target roughly 90–120 lines total.

### 5.12 `.github/workflows/ci.yml`

CalView's file, renames only. The structure stays exactly as it is: a `test` job
on `ubuntu-latest` running `npm ci` then `npm test`, with `build-windows` and
`build-linux` both `needs: test`; Node 22; `dtolnay/rust-toolchain@stable`;
`actions/cache@v6` keyed on `hashFiles('src-tauri/Cargo.lock')`; the
`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf file` apt line
on Linux. Node 22 is kept for parity with CalView even though this machine runs
Node 26 — CI pins the floor, not the developer's version.

Renames:

| From | To |
|---|---|
| artifact `calview-windows-installer` | `claude3pcost-windows-installer` |
| artifact `calview-windows-portable` | `claude3pcost-windows-portable` |
| path `src-tauri/target/release/CalView.exe` | `src-tauri/target/release/Claude3PCost.exe` |
| artifact `calview-linux-deb` | `claude3pcost-linux-deb` |
| artifact `calview-linux-appimage` | `claude3pcost-linux-appimage` |

### 5.13 `.github/workflows/release.yml`

CalView's file, renames only. The `version` job — which reads
`require('./package.json').version`, compares it to `${GITHUB_REF#refs/tags/}`
and fails when they differ — is unchanged; it is the mechanism NFR-10 describes.
`draft: true` stays: releases are reviewed and published by hand.

Renames:

| From | To |
|---|---|
| `cp src-tauri/target/release/CalView.exe src-tauri/target/release/CalView-portable.exe` | `cp src-tauri/target/release/Claude3PCost.exe src-tauri/target/release/Claude3PCost-portable.exe` |
| artifact `calview-windows` | `claude3pcost-windows` |
| artifact `calview-linux` | `claude3pcost-linux` |
| upload path `src-tauri/target/release/CalView-portable.exe` | `src-tauri/target/release/Claude3PCost-portable.exe` |
| release `name: CalView ${{ … }}` | `name: Claude3PCost ${{ … }}` |
| `files:` globs `artifacts/calview-windows/**`, `artifacts/calview-linux/**` | `artifacts/claude3pcost-windows/**`, `artifacts/claude3pcost-linux/**` |

These two artifact names match the naming table in `CLAUDE.md` exactly. Keep them
that way.

### 5.14 `CROSS_COMPILE.md`

Copy and adapt. Read it before editing — do not run a blind substitution.
Substitute `calview` → `claude-3p-cost`, `CalView` → `Claude3PCost`,
`CalView.exe` → `Claude3PCost.exe`. The `cargo-xwin` procedure itself is
unchanged. Drop any paragraph that is specific to CalDAV, the keyring or the
Windows COM dependency, since those crates no longer exist here. Then update
`CLAUDE.md` line ~247 to point at the local copy rather than
`calview/CROSS_COMPILE.md`.

---

## 6. Generated artifacts

### 6.1 Icons

No brand asset exists, so the icon set is generated from a committed placeholder.
Write `scripts/make-icon.mjs` as a zero-dependency Node script that:

1. writes `src-tauri/icons/source.svg` — a 1024×1024 rounded square in
   `#1676f3` with a white `3P` wordmark, centred, bold, sans-serif;
2. rasterises it to `src-tauri/icons/source.png` by invoking macOS
   `qlmanage -t -s 1024 -o <icons dir> <source.svg>` and renaming the resulting
   `source.svg.png` to `source.png`;
3. prints the `npx tauri icon` command to run next, rather than running it
   itself, so the Tauri CLI step stays visible in the transcript.

The `qlmanage` path is verified to work on this machine and produces a valid
1024×1024 8-bit RGBA PNG. The script is macOS-only and that is acceptable: it is
a one-off developer tool, not part of the build, and it is committed so the mark
can be regenerated or replaced later.

Then:

```bash
export PATH="$HOME/.cargo/bin:$PATH"; node scripts/make-icon.mjs
export PATH="$HOME/.cargo/bin:$PATH"; npx tauri icon src-tauri/icons/source.png
```

`tauri icon` writes `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`,
`icon.png`, `icon.ico`, `icon.icns`, the `Square*Logo.png` Windows Store set, and
`android/` plus `ios/` trees. **Delete `src-tauri/icons/android/` and
`src-tauri/icons/ios/` afterwards** — this is a desktop-only app, and CalView
carries those directories only as leftovers.

**Ordering matters.** Do the icons *before* the first `npx tauri build`.
`tauri.conf.json` lists `icons/icon.ico` under `bundle.icon`, and a missing file
there fails the build with a message that reads like a configuration error rather
than a missing asset.

### 6.2 Lockfiles

```bash
npm install
export PATH="$HOME/.cargo/bin:$PATH"; cargo generate-lockfile --manifest-path src-tauri/Cargo.toml
```

Commit both `package-lock.json` and `src-tauri/Cargo.lock`. CalView's
`Cargo.lock` is **not** vendored: it pins 539 crates including `keyring`, the
`windows` crate and the entire `reqwest`/`tauri-plugin-http` tree — precisely
what this session removes. Committing the fresh lock is mandatory regardless,
because both workflows key their Rust cache on it.

---

## 7. Tests

**Zero tests, by design.** The roadmap's deliverable is "`npm test` runs (zero
tests)".

`npm test` must nonetheless exit 0. CalView's `"test": "vitest run"` exits **1**
on an empty suite with "No test files found", which would fail the CI `test` job
and, because both build jobs declare `needs: test`, block the Windows and Linux
builds. Hence:

```json
"test": "vitest run --passWithNoTests"
```

Keep the flag permanently. It costs nothing once S3 adds real specs, and removing
it later is a silent trap for whoever next adds a package with no tests.

Create no test files. The `jsdom` devDependency and the `test.environment`
setting in `vite.config.ts` stay so that S3 can add its first spec with no
configuration work.

---

## 8. Requirements coverage

### Satisfied by this session

- **NFR-5 — Offline.** First enforcement, at four independent points:
  `tauri-plugin-http` absent from `Cargo.toml`; `@tauri-apps/plugin-http` absent
  from `package.json`; no `http:` grant in `capabilities/default.json`; no proxy
  in `vite.config.ts`. Reinforced by the restrictive CSP. Verified by the greps
  in §9 Tier 1.
- **NFR-8 — Stack parity with CalView.** Preact, Preact Signals (dependency
  present, not yet used), TypeScript strict/ES2022, Vite, plain CSS with custom
  properties, Vitest + jsdom, Tauri v2, npm, GitHub Actions. The deviations
  present in S1 — `@tauri-apps/plugin-fs` added, HTTP/keyring/COM dropped — are
  exactly the ones NFR-8 already sanctions. No new deviation is introduced, so
  nothing new needs recording in `CLAUDE.md`.
- **NFR-10 — Release process.** Version `0.1.0` synchronised across the three
  files; the tag-versus-`package.json` check in `release.yml` intact; draft
  release; `CROSS_COMPILE.md` present in this repository and referenced from
  `CLAUDE.md`.
- **NFR-12 — Licensing.** EUPL-1.2 and the author recorded in `LICENSE.md`,
  `package.json` and `Cargo.toml`; `vite-plugin-licenses.ts` collecting npm and
  Cargo licences at build time, ready for the S21 About dialog.

### Partially satisfied

- **NFR-1 — Installation without admin rights.** `installMode: currentUser` is
  configured and the release workflow produces both the NSIS installer and the
  portable exe. Actually *verified on Windows* at S22.

### Explicitly deferred

- **NFR-7** (localization) → S2. The two hardcoded strings in `app.tsx` are the
  known, commented debt, and they are S2's starting material.
- **NFR-13** (dev middleware against real data) → S6. `vite.config.ts` carries
  the insertion-point comment and is otherwise clean.
- **US-1.1, US-1.2, US-1.6**, and the fs capability scopes → S7.
- **NFR-2, NFR-3, NFR-4, NFR-6, NFR-11** → there is nothing yet to be fast,
  robust, memory-bounded, confidential or accessible about.
- **NFR-9** → unit tests begin at S3; Playwright begins at S8.
- **Every user story, US-1 through US-8.**

---

## 9. Exit criteria

Run everything from the repository root. All three
tiers must pass before the session is reported done.

### Tier 1 — automated, local

```bash
# 1. Clean install
npm install

# 2. Type-check + production build
npm run build

# 3. Test runner green on an empty suite
npm test

# 4. Rust compiles and links (macOS / aarch64-apple-darwin only)
export PATH="$HOME/.cargo/bin:$PATH"; npx tauri build --debug

# 5. NFR-5 guard — each of these three MUST print nothing
grep -rn "plugin-http\|tauri-plugin-http" package.json src-tauri/Cargo.toml src-tauri/src/lib.rs
grep -n "http:" src-tauri/capabilities/default.json
grep -rn "proxy" vite.config.ts

# 6. Trap guard — MUST print nothing
grep -rniE "keyring|outlook|caldav|calview" \
  src/ src-tauri/src/ src-tauri/Cargo.toml src-tauri/tauri.conf.json \
  src-tauri/capabilities/ package.json index.html .github/ CROSS_COMPILE.md

# 7. Version sync — all three MUST show 0.1.0
node -p "require('./package.json').version"
grep -m1 '"version"' src-tauri/tauri.conf.json
grep -m1 '^version' src-tauri/Cargo.toml

# 8. Workflow files exist and are readable
node -e "['ci','release'].forEach(n=>require('fs').readFileSync('.github/workflows/'+n+'.yml','utf8'))"
```

Command 4 produces `src-tauri/target/debug/Claude3PCost`. Remember what it does
and does not prove — see §0.

Command 6 uses `grep -i`, so it also catches `CalView`, `Outlook` and `CalDAV`.
A hit anywhere is a failed session, not a warning.

### Tier 2 — manual, eyes on the window

```bash
export PATH="$HOME/.cargo/bin:$PATH"; npx tauri dev
```

Confirm all four:

1. A window opens.
2. Its title bar reads exactly `Claude3PCost`.
3. The shell renders: the product name and `Version 0.1.0`.
4. The DevTools console is free of errors, including CSP violations from the
   app's own assets.

Then resize the window down and confirm it stops at roughly 900×600.

### Tier 3 — publish

**Run the privacy assertion before pushing anything.** The repository is public
from the first push, and a mistake here is not retractable.

```bash
# A. No input directory may be tracked. MUST print nothing.
git ls-files | grep -E "^(poc|reference-material|calview)/"

# B. Belt and braces — the tracked set must contain none of those path
#    segments anywhere. MUST print nothing.
git ls-files | grep -E "(^|/)(poc|reference-material|calview)(/|$)"

# C. Nothing untracked-but-unignored from those trees is about to be added.
#    MUST print nothing.
git status --porcelain --untracked-files=all | grep -E "(poc|reference-material|calview)/"

# D. No absolute path from this machine leaked into a committed file.
#    MUST print nothing.
git ls-files -z | xargs -0 grep -ln "/Users/" 2>/dev/null

# E. Review the complete tracked file list by eye before pushing.
git ls-files
```

If **A through D** are all silent and **E** contains nothing you did not intend
to publish, create the remote and push:

```bash
gh repo create claude-3p-cost --public --source=. --remote=origin --push
```

Then confirm the CI run:

```bash
gh run list --limit 1
gh run watch
```

**The session is done when the CI workflow is green on the first push** — the
`test` job on Ubuntu, `build-windows` on `windows-latest`, and `build-linux` on
`ubuntu-latest`. This is the point at which the Windows and Linux builds are
verified for the first time; the local `tauri build --debug` did not cover them.

If a build job fails for a platform-specific reason, fix it and push again — a
red `main` is not a finished session, and S2 does not start until it is green.

---

## 10. Reporting back

State plainly: which Tier 1 commands passed; what the window looked like; the
repository URL; the CI run conclusion. If anything in this plan turned out to be
wrong — a Tauri v2 config key that has moved, a CSP directive that breaks the
webview, a `tauri icon` invocation that behaves differently — **stop and report
it rather than improvising a different design.** That is the standing rule for
implementing agents in this project.
