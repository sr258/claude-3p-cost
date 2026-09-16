# AI TOOL GUIDANCE

Guidance for working with code in this repository.

## What this is

**Claude3PCost** is a Tauri v2 desktop application that reads
Claude Desktop's local third-party (3P) session audit logs and reports what the
inference cost — grouped by project, session, model and time.

Read first, in this order:

| Document | Content |
|----------|---------|
| `MAP.md` | What exists in the working directory, and the data model of the audit logs |
| `VISION.md` | What the product is for and what it deliberately is not |
| `REQUIREMENTS.md` | User stories with acceptance criteria, grouped by use case |
| `ROADMAP.md` | Which stories are built in which session, and in what order |
| `docs/plans/S<N>-*.md` | The approved plan for one session, written in its planning phase |

Development runs one roadmap session at a time through the `/session` skill
(`.claude/skills/session/`): an Opus agent plans it with the user, a Sonnet agent
implements it, an Opus agent reviews it. Start work with `/session` rather than
implementing straight from the roadmap.

## Naming

The product name is **Claude3PCost**. It has to be spelled several different
ways across the configuration files; keep them consistent, and follow CalView's
pattern for each.

| Where | Value |
|-------|-------|
| Display name (`tauri.conf.json` `productName`, window title, About dialog) | `Claude3PCost` |
| npm package (`package.json` `name`) | `claude-3p-cost` |
| Cargo package (`src-tauri/Cargo.toml` `[package] name`) | `claude-3p-cost` |
| Cargo lib (`[lib] name`) | `claude_3p_cost_lib` |
| Bundle identifier (`tauri.conf.json` `identifier`) | `de.bycsitsm.claude3pcost` |
| Windows binary | `Claude3PCost.exe`, portable copy `Claude3PCost-portable.exe` |
| CI artifact names | `claude3pcost-windows`, `claude3pcost-linux` |
| Repository / working directory | `claude-3p-cost` |

The identifier is baked into the installer and into the per-user install
location, so changing it after a release strands existing installations. Treat
it as fixed from the first tagged build.

## The three input directories

None of these are part of the product; all three are excluded from Git.

- **`poc/`** — a complete, working Python proof of concept. `cowork_costs.py` is
  the **specification for the parsing logic**. Before changing anything in
  `src/services/` or `src/model/`, read the corresponding part of that file. Its
  docstring and comments record traps that were verified against real logs.
- **`reference-material/`** — real 3P session data from a Windows machine. The
  only realistic test data available: Claude Desktop on this development machine
  uses first-party Anthropic APIs and produces no comparable records. Never
  commit it, never copy fragments of it into fixtures, never quote its contents
  into documents.
- **`calview/`** — a separate, shipping Tauri app by the same author, cloned
  here as a template. Its `AGENTS.md`, `CROSS_COMPILE.md`, `.github/workflows/`
  and `src-tauri/` configuration are the reference for stack and build. Copy
  from it rather than inventing; the point of the exercise is to reuse a
  toolchain that is already proven on Windows.

## Technology Stack

Deliberately identical to CalView (see NFR-8) — deviations need a justification
recorded here.

| Layer | Choice |
|-------|--------|
| UI Framework | Preact + JSX/TSX |
| Reactivity | Preact Signals (`@preact/signals`) |
| Build Tool | Vite + `@preact/preset-vite` |
| Language | TypeScript (strict mode, ES2022) |
| Styling | Plain CSS with custom properties |
| Localization | German + English, own lightweight translation layer + `Intl` |
| Filesystem access | `@tauri-apps/plugin-fs` (read-only scopes) |
| File watching | Tauri fs watch |
| Charts | A lightweight, maintained SVG/Canvas library — see "Charting library" below |
| Desktop Packaging | Tauri v2 |
| Unit testing | Vitest with jsdom |
| End-to-end testing | Playwright, against the Vite build with a faked fs layer |
| Package Manager | npm |
| CI | GitHub Actions, Windows runner, NSIS installer + portable exe |

**Not used, on purpose:** any HTTP client or the Tauri HTTP plugin (the app is
offline by design, NFR-5), any date library, any i18n framework heavier than a
key→string lookup, and the XML/iCal parsing that CalView needs but we do not.

### Charting library

US-3.3 permits a charting dependency. It must be stable, actively maintained,
SVG- or Canvas-based, work with Preact, need no network at runtime, and carry an
EUPL-1.2-compatible licence — and it must not drag in React, a date library, or
a CSS-in-JS runtime. Check the bundle-size impact before adopting it, and record
the chosen library and the reason here once decided. Where a chart is simple
enough that hand-rolled SVG is less work than the dependency, hand-roll it.

### Localization

Every user-facing string goes through the translation layer; none is written
into a component. German and English are both complete at release — a missing
key fails the build rather than falling back silently. Language follows the OS
locale on first start (`de-*` → German, otherwise English) and is switchable in
settings without a restart. Numbers, currency and dates go through `Intl` with
the active locale, never through hand-written formatting.

**Implemented in S2** (`src/i18n/`). `de.ts` is the source of truth
(`as const`); `en.ts` is `as const satisfies Record<TranslationKey, string>` —
not a `: Record<…>` annotation, which would widen every value to `string` and
destroy the typed placeholder inference `t()` relies on. Key parity between
the two catalogues is enforced by `tsc` alone (a missing key is `TS1360`, an
extra key is `TS2353`); there is no separate parity script. Locale tags are
`de-DE` and `en-GB` (English is day-first, `en-GB`, not `en-US`). Currency is
formatted as `formatNumber(...) + " " + code` rather than via
`style: "currency"`, because `Intl`'s own currency style produces a symbol
(`1.413,58 $`) or a wrong-order code, not NFR-7's `1.413,58 USD` /
`1,413.58 USD`. The override is a bare locale string in `localStorage` under
`claude3pcost.locale`, behind `src/services/locale-store.ts`. The DE/EN
switcher (`src/components/language-switcher.tsx`) lives in a placeholder app
bar for now; its final home is a settings screen (S15+ / S21).

## Development Commands

```bash
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # tsc + vite build → dist/
npm test                 # vitest run
npm run test:watch       # vitest watch
npm run lint             # eslint .
npm run format           # prettier --write .
npm run format:check     # prettier --check .
npx tauri dev            # Tauri dev window (starts Vite automatically)
npx tauri build          # Production desktop build
```

Run `npm run lint` and `npm run format:check` before considering a change
done, alongside `npm test` — a session isn't finished if either fails. Fix
`lint` failures rather than disabling the rule, unless the flagged code is
deliberate (as with the NFR-7 non-breaking space in `src/i18n/format.ts`,
where the rule is scoped narrower in `eslint.config.js` instead). Prettier
formats `src/`, `plugins/`, `scripts/` and config files; it does not touch
Markdown (`.prettierignore`) — those are hand-formatted prose, not
Prettier's job.

```bash
npm run test:e2e         # playwright test
```

**`npm run dev` works against the real reference data.** A Vite dev-server
middleware exposes `reference-material/` read-only over HTTP, and the filesystem
service picks the dev implementation instead of the Tauri fs plugin (NFR-13).
So UI work happens in a normal browser with hot reload, against 150 real
sessions — no packaged build needed. Point it elsewhere with the env var; it
defaults to `../reference-material`.

Use `npx tauri dev` when the thing you are changing is the Tauri side itself:
real filesystem access, capabilities, file watching, the save dialog, packaging.

## Intended Project Structure

Mirrors CalView's layout.

```
claude-3p-cost/                        # repository root
├── index.html
├── package.json / tsconfig.json / vite.config.ts
├── plugins/
│   ├── vite-plugin-licenses.ts       # copied from CalView
│   └── vite-plugin-reference-fs.ts   # dev-only: serves reference-material/
├── .github/workflows/{ci,release}.yml
├── src/
│   ├── main.tsx                      # renders <App /> into #app
│   ├── app.tsx
│   ├── components/                   # thin, presentational
│   ├── services/                     # I/O: discovery, file reading, watching, persistence
│   ├── i18n/                         # translation layer + de.ts / en.ts
│   ├── model/                        # PURE functions: parsing, aggregation, pricing
│   ├── state/app-state.ts            # all signals + action functions
│   └── styles/
├── src-tauri/                        # Rust backend, fs plugin, capabilities
├── e2e/                              # Playwright specs + committed fixtures
└── test/fixtures/                    # synthetic anonymised audit logs
```

## Architecture Rules

1. **Signal-based state.** All mutable state lives in `state/app-state.ts` as
   Preact Signals. Components read signals and re-render; they hold no state of
   their own beyond transient UI concerns.
2. **Pure model layer.** Everything in `src/model/` is a pure function over
   plain data: no Tauri imports, no filesystem, no DOM, no clock. This is where
   parsing, aggregation, pricing and budget logic live, and it is where the
   tests are. If something is hard to test, it is in the wrong layer.
3. **I/O only in `src/services/`.** Discovery, reading, watching and settings
   persistence. Services hand plain data to the model layer.
4. **Streaming, never slurping.** Audit logs are read line by line (NFR-4). A
   whole session tree is never in memory at once.
5. **Read-only against session data.** No code path that touches a session root
   may write, rename, move or delete (US-1.6). Tauri fs capabilities grant read
   scope only.
6. **One filesystem interface, two implementations.** The Tauri fs plugin in the
   packaged app, the Vite dev middleware under `npm run dev`. The choice is made
   once, inside `src/services/`; nothing above it branches on which is active,
   and the dev implementation is never in a production build.
7. **No hardcoded user-facing strings.** Every one goes through `src/i18n/`.
8. **Failures are collected, not thrown.** A bad file or line is recorded in a
   problem list and surfaced to the user; it never aborts a scan (NFR-3).

## Data Model Essentials

The full picture is in `MAP.md` §4. The things that will bite you:

- **Only `type == "result"` lines carry cost.** `total_cost_usd` is authoritative.
- **`output_tokens` on `assistant` lines is garbage** — it is the
  `message_start` snapshot (1–3 tokens). Measured 1,661 instead of 152,004.
  Input and cache tokens on those lines are exact after dedup by `request_id`.
- **Session IDs are truncated.** Manifest `sessionId` is
  `local_023dbcc7-5727-…`; the directory is `023dbcc7`. Strip `local_`, then
  take the first hyphen segment.
- **Aborted requests have no `result` line** — 550 started vs. 536 completed in
  the reference data. Report the difference, never hide it.
- **`provider` is `foundry`, `costBasis` is `list`** in every observed record,
  which is the entire reason for the price table in UC-4.
- **Model variants matter.** `claude-opus-5[1m]` is priced differently from
  `claude-opus-5`; never normalise the suffix away.
- **Encodings vary** — UTF-8, UTF-8-BOM and UTF-16 all occur.
- **`spaces.json` schema is loose.** Keep the POC's tolerant reader.
- **Cost is integer micro-USD from parse time onward.** `src/model/audit-parser.ts`
  produces `costMicroUsd` via `Math.round(value * 1e6)`; no `costUsd` float field
  exists anywhere past the parser. S5 sums integers and divides by `1e6` exactly
  once, at the display boundary — never per-record.
- **`Problem` (`src/model/problems.ts`) carries no path and no content.** `scope`
  is a non-sensitive identifier (a session directory name, never a path); `hint`
  is a bounded, content-free token (an error class name or a field name), never
  file content or a prompt (NFR-6).
- **`result.session_id` is not the session directory.** It is the CLI session
  UUID, exposed as `AuditSession.cliSessionId` for S4's manifest matching. The
  session id comes from `sessionIdFromCwd(cwd)`, falling back to the
  caller-supplied `sourceId`.
- **The model layer never imports `src/i18n/`.** `src/model/` stores problem
  kinds, never translated or translatable messages; the UI maps `kind` to a
  translation key.
- **`ProjectRef` is a three-kind union, not a nullable name.** `{ kind: "none" }`
  (no `spaceId`), `{ kind: "named", spaceId, name }` (found in the merged
  `spaces.json` index) and `{ kind: "unknown", spaceId }` (a `spaceId` no
  `spaces.json` knows about — the session is kept, not dropped, and a
  `"unknown-space"` problem is recorded with `hint: "spaceId"`, never the id's
  value). `src/model/project-assignment.ts`, S4. `cwd` is read only to derive
  `session_keys()` (S4's port of the POC function of the same name) and is then
  dropped — it never reaches `SessionMeta`. Two real key collisions exist in
  the reference data, both a manifest `cwd` pointing at a shared user folder
  rather than a session directory; first-wins is kept and a
  `"duplicate-session-key"` problem makes each one visible.

## Testing

**Unit tests (Vitest)** run against **synthetic, anonymised fixtures** in
`test/fixtures/`, committed to the repository. They must reproduce the
structural traps above (truncated session IDs, missing `result` lines, mixed
encodings, an unknown `spaceId`, a malformed line, model variant suffixes).

**End-to-end tests (Playwright)** cover the main paths: start → project
overview, expand project → expand session, date range, price entry → both cost
figures, budget → warning state, CSV and JSON export, language switch. They run
headless on Linux CI against the Vite build with a fixture-backed fake
filesystem — not against `reference-material/`, which is not in Git. Assert on
accessible roles and `data-testid`, never on translated text, so the specs work
in both locales; one spec runs the overview path in each.

The end-to-end regression check — full `reference-material/` tree yields
1,413.59 USD, 150 sessions, 508 requests, 7 projects — is run manually against
the local, uncommitted data. (The POC prints 1,413.58: it rounds each session to
four decimals before summing. The exact sum is 1413.5852 and the app
accumulates in integer micro-USD, so 1,413.59 is the correct figure.) Keep a script for it; do not wire it into CI, since
CI has no access to that data.

## Privacy Rules

Session manifests contain `systemPrompt`, `initialMessage` and project
`instructions`; `spaces.json` contains free-text project instructions; audit
logs contain full prompt and response text. All of it is read where aggregation
needs it and **none of it** may reach an export, a log file, an error message, a
crash report, or a document in this repository (NFR-6).

Absolute paths count as sensitive: display basenames, keep full paths to hover
text and never export them.

## Release Process

As in CalView. Bump the version in **all three** files so they stay in sync —
`package.json` (the only one the workflow verifies), `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` — commit to `main`, then `git tag vX.Y.Z && git push
origin vX.Y.Z`. The tag must equal `v` + the `package.json` version or the
workflow fails in its `version` job. GitHub Actions builds Windows (NSIS
installer + portable exe) and Linux (deb + AppImage) and creates a **draft**
release to be reviewed and published by hand.

Windows builds must stay installable without administrator rights: NSIS
`installMode: currentUser` (NFR-1). `CROSS_COMPILE.md` documents the
`cargo-xwin` route for building a Windows exe from Linux, should the GitHub
Windows runner ever be unavailable.

## Language Conventions

- **User-facing text** (labels, buttons, tooltips, notifications, placeholders,
  error messages) exists in **German and English**, via `src/i18n/`. Never
  hardcode it, and never ship a key in only one language.
- **Code** — variable names, comments, documentation, commit messages — is
  **English**, always.
- Numbers, currency and dates are formatted through `Intl` for the active
  locale: `1.413,58 USD` in German, `1,413.58 USD` in English.
- CSV export follows the locale too: German gets semicolons and a decimal comma
  so Excel on a German Windows opens it correctly; English gets commas and a
  decimal point. Both get a UTF-8 BOM.
