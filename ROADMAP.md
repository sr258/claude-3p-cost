# Implementation Roadmap — Claude3PCost

Every session below is scoped to be **planned by an Opus agent and implemented by
a Sonnet agent in one sitting**. The sequence is a dependency order: each session
assumes everything before it exists and is green.

Read `CLAUDE.md`, `MAP.md` and `REQUIREMENTS.md` first. This document says *when*
things get built; `REQUIREMENTS.md` says *what* they must do, and its acceptance
criteria are the definition of done — this roadmap never restates them.

---

## How a session runs

**Opus plans.** Before any code is written, the planning agent produces:
a list of files to create or change; the function signatures and types at the
layer boundaries; which acceptance criteria from `REQUIREMENTS.md` this session
satisfies and which it explicitly defers; the tests to write, named; and the
exact commands that prove the session is done.

**Sonnet implements.** The implementing agent follows the plan, writes the tests
alongside the code, and runs the exit commands. It does not expand scope. If the
plan turns out to be wrong — a trap in the data, a library that does not fit —
it stops and reports rather than improvising a different design.

**Sizing rules.** These are what keep a session tractable:

- One vertical concern per session. Never "the parser *and* the UI for it".
- Roughly 3–6 new or changed production files, plus their tests.
- Never both a new layer and a new dependency in the same session.
- Exit criteria must be checkable by running a command, not by reading code.
- A session that needs a decision the requirements do not make (which charting
  library, what the default prices are) makes that decision *first*, in writing,
  as its own deliverable.

**Every session ends green.** `npm test` passes, `npm run build` type-checks,
and from S8 onward `npm run test:e2e` passes. A session that leaves the tree red
is not finished, and the next session does not start.

**Every session from S8 onward adds its own Playwright spec** for the path it
introduced. E2E coverage grows with the app; it is never a phase at the end.

---

## Overview

| # | Session | Stories / NFRs | Depends on |
|---|---------|----------------|------------|
| **Phase 1 — Foundation** ||||
| S1 | ✅ Project scaffold from CalView | NFR-8, NFR-10, NFR-12, NFR-5 | — |
| S2 | ✅ Localization layer | NFR-7 | S1 |
| **Phase 2 — Reading the data (no UI)** ||||
| S3 | Audit log parser | US-1.3, NFR-3, NFR-4 | S1 |
| S4 | Manifests, spaces, project assignment | US-1.4, US-1.5 | S3 |
| S5 | Aggregation | US-2.1, US-2.3, US-2.4 (model only) | S4 |
| **Phase 3 — Getting at the filesystem** ||||
| S6 | Filesystem interface + dev middleware | NFR-13, US-1.1 (dev) | S3 |
| S7 | Tauri filesystem implementation | US-1.1, US-1.2, US-1.6 | S6 |
| **Phase 4 — The main view** ||||
| S8 | Project overview + Playwright harness | US-2.1, NFR-9, NFR-2 | S5, S6, S2 |
| S9 | Session drill-down | US-2.2 | S8 |
| S10 | Model breakdown, folder grouping, data gaps | US-2.3, US-2.4, US-1.5 (UI) | S9 |
| **Phase 5 — Depth** ||||
| S11 | Session detail: cost drivers | US-3.1 | S10 |
| S12 | Tool usage per session | US-3.2 | S11 |
| S13 | Date range filter | US-5.1 | S10 |
| S14 | Trend over time | US-5.2 | S13 |
| **Phase 6 — Money** ||||
| S15 | Price table: storage and editor | US-4.2 | S10 |
| S16 | Dual cost display + transparency | US-4.1, US-4.3 | S15, S11 |
| S17 | Budgets | US-6.1, US-6.2 | S13, S15 |
| **Phase 7 — Output and liveness** ||||
| S18 | Charts | US-3.3 | S14, S11 |
| S19 | Export | US-7.1, US-7.2, NFR-6 | S13, S16 |
| S20 | Live update + manual refresh | US-8.1, US-8.2 | S7, S10 |
| **Phase 8 — Ship** ||||
| S21 | Accessibility and robustness pass | NFR-11, NFR-3, NFR-2, NFR-5 | S20 |
| S22 | Release verification on Windows | NFR-1, NFR-10, NFR-12 | S21 |

Twenty-two sessions. S3–S5 are pure logic and could run in parallel with S6–S7
if two agents are available; everything else is sequential.

---

## Phase 1 — Foundation

### S1 — Project scaffold from CalView

**Status. Done 2026-09-15.** Plan: `docs/plans/S1-project-scaffold.md`.

**Goal.** A Tauri v2 + Preact + TypeScript project that builds and shows an empty
window, named correctly everywhere.

**Scope.** Copy and adapt CalView's `package.json`, `tsconfig.json`,
`vite.config.ts`, `index.html`, `src-tauri/` (config, `Cargo.toml`, `build.rs`,
`main.rs`, `lib.rs`, capabilities), `plugins/vite-plugin-licenses.ts`,
`.github/workflows/{ci,release}.yml`, `.gitignore`, `LICENSE.md`. Apply the
naming table in `CLAUDE.md` to every file. Strip everything CalView-specific:
HTTP plugin, keyring, Outlook COM, CalDAV dev proxy. Add `tauri-plugin-fs`.
Generate icons. Initialise git.

**Deliverables.** Empty app window titled `Claude3PCost`; `npm test` runs (zero
tests); `npm run build` type-checks; CI workflow green.

**Exit.** `npm run build && npx tauri build --debug` succeeds locally, CI passes
on the first push.

**Out of scope.** Any application logic, any UI beyond a placeholder.

**NFR-5 starts here.** The HTTP plugin is not installed and no network
capability is granted. Leaving them in "for later" is how an offline-by-design
app quietly stops being one.

**Trap.** `lib.rs` must end up genuinely empty of CalView's commands — leaving
the keyring or COM code in drags in dependencies we do not want and breaks the
Linux build.

### S2 — Localization layer

**Status. Done 2026-09-15.** Plan: `docs/plans/S2-localization-layer.md`.

**Goal.** `NFR-7` infrastructure, before any string exists to retrofit.

**Scope.** `src/i18n/` with a typed key→string lookup, `de.ts`, `en.ts`, a
`t()` accessor bound to a locale signal, OS-locale detection on first start, a
persisted override, and `Intl`-based number/currency/date formatters. A
build-time check that both catalogues have identical key sets, wired into
`npm run build` so a missing key fails the build. A settings control to switch
language.

**Deliverables.** A demonstrably bilingual placeholder screen.

**Exit.** `npm test` covers key-parity and both formatters; deleting a key from
`en.ts` fails the build.

**Trap.** The typed key list is the point. If `t()` takes a bare `string`, the
build check cannot work and the whole NFR degrades to a convention.

---

## Phase 2 — Reading the data (no UI)

These three sessions are pure functions in `src/model/`. No Tauri, no DOM, no
filesystem — they take strings and plain objects and return plain objects. They
are where the traps in `MAP.md` §4 get encoded, once, with tests.

### S3 — Audit log parser

**Goal.** Turn one `audit.jsonl` into a typed session record.

**Scope.** Types for the audit line variants; a streaming line-by-line parser;
extraction of `result` lines into per-request records (cost, all token
categories, model usage, duration, turns, error flag, server tool use, subagent
stats); `command_lifecycle` counting for started-vs-completed; `system/init` for
cwd and model; malformed-line collection; encoding detection (UTF-8, UTF-8-BOM,
UTF-16).

**Deliverables.** Committed synthetic fixtures in `test/fixtures/` reproducing
every trap: a truncated session ID, a missing `result` line, each encoding, a
malformed line, a model variant suffix, an unknown `spaceId`.

**Exit.** `npm test` — parser tests green, including an explicit test asserting
that `assistant` line `output_tokens` is never read.

**Trap.** All of `MAP.md` §4. Read `poc/cowork_costs.py` `parse_audit()` before
writing anything; it is the specification.

### S4 — Manifests, spaces, project assignment

**Goal.** Map sessions to the projects the user actually sees in Claude Desktop.

**Scope.** `local_<uuid>.json` manifest parsing (only the fields we use); the
tolerant `spaces.json` reader (list or map; several id and name keys); the
session-key matching that survives the `local_` prefix and the 8-hex directory
truncation; `(ohne Projekt)` bucketing; unknown-`spaceId` fallback to the raw ID;
connected-folder extraction from `resolvedFolderKinds` with fallback to
`userSelectedFolders`; archived and starred flags; gap counting for US-1.5.

**Exit.** Tests reproduce the reference distribution: 7 projects with the
expected names, sessions without `spaceId` in their own bucket, 14 open
requests.

**Trap.** `session_keys()` in the POC. The truncation rule is not guessable.

### S5 — Aggregation

**Goal.** Roll per-request records up into everything the UI will display.

**Scope.** Pure aggregation into project totals, session totals, per-model
totals (variant strings kept distinct), per-day and per-month buckets, and
grouping by connected folder as an alternative to project. Sorting. A single
`Report` type that the whole UI reads from.

**Exit.** `npm test`; plus a manual script, not in CI, that runs the pipeline
over the local `reference-material/` tree and asserts **1,413.58 USD, 150
sessions, 508 requests, 7 projects** — the US-1.3 regression, matching the POC
to the cent.

**Trap.** Rounding. The POC accumulates model costs in integer micro-USD to
avoid float drift; do the same, and compare against the POC's output rather than
against intuition.

---

## Phase 3 — Getting at the filesystem

### S6 — Filesystem interface + dev middleware

**Goal.** `npm run dev` runs against the real `reference-material/` tree in a
browser.

**Scope.** One `FileSystem` interface in `src/services/` (list a directory,
stat, read a file as a stream of lines). A dev implementation backed by
`plugins/vite-plugin-reference-fs.ts`, which serves a configurable directory
read-only over the dev server — path from an env var, defaulting to
`../reference-material`. Root discovery logic (the candidate path list) written
once, shared. The middleware must be absent from production builds.

**Exit.** `npm run dev` in a browser reaches the discovery step and logs 150
discovered sessions from the real data. A production build contains no trace of
the middleware.

**Trap.** Path handling. The reference data contains Windows backslashes,
umlauts, and network-drive UNC paths, while the dev middleware serves POSIX
paths over HTTP. Normalise at the boundary, once, or this leaks everywhere.

### S7 — Tauri filesystem implementation

**Goal.** The same interface, backed by the real filesystem.

**Scope.** The `tauri-plugin-fs` implementation; capability configuration
granting **read scope only** for discovered and user-selected roots; the folder
picker for US-1.2 with persistence; merging multiple accounts and profiles under
one root with the count surfaced; the empty state naming the paths searched.

**Exit.** `npx tauri dev` on this machine reaches the empty state cleanly (there
is no 3P data here — that is the expected result and the test). A unit test
asserts no write API is reachable from the scanner module (US-1.6).

**Trap.** This machine cannot validate the happy path. Only the Windows machine
with real 3P data can, so keep the Tauri-specific surface as thin as possible
and put the logic in S6's shared code, which the dev server *does* exercise.

---

## Phase 4 — The main view

### S8 — Project overview + Playwright harness

**Goal.** The screen from the vision statement: open the app, see what it cost.

**Scope.** `state/app-state.ts` with the signals; the project table with exactly
the five columns of US-2.1 (project, sessions, requests, cost USD, total
duration) plus a total row; locale-aware formatting; the status bar showing
roots, accounts, profiles and last scan time. **Plus** the Playwright harness:
config, the fixture-backed fake filesystem, the first spec (start → overview),
`npm run test:e2e`, and the CI job.

**Exit.** `npm run test:e2e` green; the overview renders the reference data's
seven projects in the correct order; first aggregate on screen within 2 seconds
(NFR-2).

**Note.** This is the largest session in the roadmap because the harness and the
first screen are hard to separate — the harness needs something to drive. If it
turns out too big in planning, split the harness into S8a and the table into S8b
rather than letting it sprawl.

**Trap.** Specs must assert on roles and `data-testid`, never on translated
text, or S2's language switch breaks every test later.

### S9 — Session drill-down

**Goal.** Expand a project, see its sessions.

**Scope.** Inline expandable session table; sorting by cost, time and title in
both directions; expansion state surviving sorts; archived sessions marked;
multiple projects open at once.

**Exit.** Playwright spec for expand → sort → collapse; unit tests for the sort
comparators.

### S10 — Model breakdown, folder grouping, data gaps

**Goal.** Finish the overview.

**Scope.** Per-model breakdown with cost shares, global and scoped, variants
kept distinct (US-2.3). The project/folder grouping toggle, with basenames shown
and full paths on hover, and network drives marked (US-2.4). The US-1.5 gap
indicators made visible in the main view: open requests, sessions without
manifests, archived sessions.

**Exit.** Playwright spec toggling grouping and asserting the gap indicators
are present with the reference numbers.

---

## Phase 5 — Depth

### S11 — Session detail: cost drivers

**Goal.** Where the money went inside one session.

**Scope.** The session detail view: breakdown by token category (input, output,
thinking, cache write 1h, cache write 5m, cache read) with counts and shares;
web search and fetch counts when non-zero; subagents spawned when non-zero; the
per-request list with timestamp, cost, turns, duration, error flag.

**Note.** Until S16 there is no price table, so shares are shown as *token*
shares, explicitly labelled, with only the measured `total_cost_usd` shown as
money. Build that labelling now — do not leave a placeholder for it.

**Exit.** Playwright spec drilling project → session → detail.

### S12 — Tool usage per session

**Goal.** Which tools a session used, and how often.

**Scope.** Count `tool_use` blocks from `assistant` lines, deduplicated by
`request_id`; ranked list by tool name; the explicit statement in the UI that
these are call counts and **not** a cost attribution.

**Out of scope.** The `MAY` estimate of per-tool cost share. It is an open
research question (`REQUIREMENTS.md` open point 2), and it needs its own session
with its own validation if it is ever attempted.

**Exit.** Unit test against a fixture with known tool counts.

### S13 — Date range filter

**Goal.** Restrict everything to a period.

**Scope.** Quick choices plus free from/to; filtering applied to **individual
requests** by `result` timestamp, not to whole sessions; sessions straddling the
boundary marked as partially included; every view and the status bar honouring
the filter.

**Exit.** Playwright spec: set a range, assert the total changes and the partial
marker appears. Unit tests for boundary conditions — a session spanning a month
end is the interesting case.

**Trap.** "Filter by session" is the easy wrong implementation and gives subtly
wrong monthly totals.

### S14 — Trend over time

**Scope.** Cost per day and per calendar month as tables; scope selectable
between all projects and one project; days without activity rendered as zero so
the axis stays linear.

**Note.** Tables only. Charts are S18 — the data shape must be right before
anything is drawn on it.

---

## Phase 6 — Money

### S15 — Price table: storage and editor

**Goal.** The user can see and change the prices used for recomputation.

**Scope.** The price table type and persisted store; **the shipped defaults with
public Anthropic list prices and their "as of" date** — deciding and writing
those values is the first deliverable of this session; the editor with columns
for input, output, cache write 5m and 1h, and cache read in USD per Mtok;
edited-versus-default marking; reset per row and for the whole table; JSON
export and import; empty field meaning "unknown", never zero.

**Exit.** Playwright spec: edit a price, restart, value persists; reset restores
the default.

**Trap.** Model variant strings are the keys. `claude-opus-5[1m]` and
`claude-opus-5` are different rows with different prices; never normalise the
suffix away.

### S16 — Dual cost display + transparency

**Goal.** List price and own price, side by side.

**Scope.** Recomputation from raw token counts using the S15 table; both figures
shown in the overview, per project and per session, the recomputed one visibly
marked as computed; `provider` and `costBasis` from the data surfaced; sessions
with unknown prices excluded from the recomputed total **and the exclusion
reported**; the per-model, per-category calculation shown in the session detail
(tokens × price = amount) with absolute and percentage deviation from list.

**Exit.** Playwright spec asserting both figures and a deviation; unit tests for
the recomputation, including the unknown-price exclusion path.

**This is the session that justifies the app's existence** — `costBasis` is
`list` in every observed record. Get the exclusion reporting right; a silently
partial "own price" total is exactly the dishonesty the vision rules out.

### S17 — Budgets

**Scope.** Monthly budget, global and per project; consumption bar with
percentage; warning state at a configurable threshold, default 80%; exceeded
state above 100%; both marked by text as well as colour; persistence; no warning
where no budget is set. Plus the `MAY` linear projection, labelled an estimate
and hidden before three days of the month have elapsed.

**Exit.** Playwright spec: set a low budget, assert the warning state appears.

---

## Phase 7 — Output and liveness

### S18 — Charts

**Goal.** The breakdowns as pictures.

**Scope.** **First deliverable: choose the charting library**, against the
US-3.3 criteria — stable, maintained, SVG or Canvas, Preact-compatible, no
runtime network, EUPL-1.2-compatible licence, no React or date library or
CSS-in-JS in its transitive tree, acceptable bundle size. Record the choice and
the reasoning in `CLAUDE.md` before writing chart code. Then: cost per project as
bars, cost over time as line or columns, token categories per session as stacked
bars. Every chart keeps its tabular equivalent visible on the same screen.
Charts use the app's CSS custom properties and survive a window resize.

**Exit.** Playwright spec asserting chart *and* table are both present; a
bundle-size check recorded before and after.

**Trap.** If no library clears the bar, hand-rolled SVG is the correct outcome,
not a reason to lower the bar.

### S19 — Export

**Scope.** CSV and JSON export honouring the active range and grouping and
stating them in a header; locale-dependent CSV (German: semicolons, decimal
comma; English: commas, decimal point; UTF-8 BOM in both); the save dialog;
copy-a-figure to clipboard.

**The NFR-6 session.** Exports carry aggregates and session metadata only.
Write the test that asserts an export contains no `systemPrompt`, no
`initialMessage`, no `instructions`, no prompt or response text, and no absolute
paths — and run it against fixtures that *contain* all of those, so the test can
actually fail.

**Exit.** Playwright spec exporting both formats and asserting file contents;
the privacy test green.

### S20 — Live update + manual refresh

**Scope.** Watching the discovered roots; updates within ~5 seconds of a new
`result` line; only changed files re-parsed; UI state preserved across an update
(expansion, sort, scroll, filter); debouncing of change bursts; tolerance of a
partially written last line; an on/off switch; the manual "Aktualisieren" action
with last-scan time and progress for long scans.

**Exit.** Test that appends a `result` line to a fixture and asserts the total
updates and expansion state survives. A test that appends **half** a line and
asserts it is not counted as malformed, then completes it and asserts it counts.

**Trap.** The partial-line case is the one that will actually happen in
production, because Claude Desktop is writing the file while we read it.

---

## Phase 8 — Ship

### S21 — Accessibility and robustness pass

**Scope.** NFR-11: keyboard operation of every table and dialog, no state
conveyed by colour alone, contrast check. NFR-3: the collected-problems summary
made reachable from the UI; unreadable, locked and schema-variant files verified
not to abort a scan. NFR-2 and NFR-4: measure scan time and peak memory against
the reference data and record the numbers. NFR-5: audit the dependency tree and
the built bundle for any network call, and confirm no network capability is
granted in `src-tauri/capabilities/`.

**Exit.** Keyboard-only Playwright spec for the main path; a robustness spec
with deliberately broken fixtures.

### S22 — Release verification on Windows

**Scope.** Version synchronised across `package.json`, `tauri.conf.json` and
`Cargo.toml`; tag a `v0.1.0`; verify the release workflow produces the NSIS
installer and the portable exe; the About dialog with the generated third-party
licence list (NFR-12); install and run on a Windows machine **without
administrator rights** (NFR-1); confirm the app finds real 3P data and that its
totals match the POC on that machine.

**Exit.** A draft GitHub release with both Windows artifacts, verified installed
and running on a production Windows workstation.

**This is the first session that validates S7 against real data**, because no
machine in the development loop has 3P session data. Budget for finding bugs
here, and keep the session's scope free of new features so there is room.

---

## Deferred beyond v1.0

- Tool-level cost *attribution* (US-3.2 `MAY`) — open research question.
- `claude-code-sessions` support — untestable until a machine is found that has
  `audit.jsonl` under that root (`REQUIREMENTS.md` open point 1).
- Anything in the vision's out-of-scope list: team roll-ups, network access,
  invoice reconciliation, session management.
