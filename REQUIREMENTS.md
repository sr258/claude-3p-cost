# Requirements — Claude3PCost

User stories grouped by use case. Every story has acceptance criteria that are
checkable against the reference data in `reference-material/`.

**Role.** There is one role, **the user**: a person who uses Claude Desktop in
the third-party configuration on their own Windows workstation and wants to know
what it costs. No administrator, no team lead, no second role.

**Conventions.** Documents and code are English. The app itself ships in German
and English (NFR-7); where a German UI label is quoted below it is an
illustrative example of the German string, not a statement that the text is
German-only. Priority is `MUST` (v1.0), `SHOULD` (v1.0 if it fits),
`MAY` (later).

---

## UC-1 — Getting at the data

*The app must find and read the Claude Desktop session data without the user
knowing where it lives.*

### US-1.1 Automatic discovery `MUST`

**As the user, I want the app to find my Claude Desktop session data by itself,
so that I see my costs immediately after starting it without configuring
anything.**

Acceptance criteria:
- On start, the app searches the known roots in order:
  `%LOCALAPPDATA%\Claude-3p\local-agent-mode-sessions`,
  `%LOCALAPPDATA%\Claude-3p\claude-code-sessions`,
  `%APPDATA%\Claude\local-agent-mode-sessions`,
  `%APPDATA%\Claude\claude-code-sessions`, and on macOS
  `~/Library/Application Support/Claude/local-agent-mode-sessions`.
- Every root that exists is scanned; multiple roots are merged into one result.
- The set of roots actually used is visible in the UI (status bar or info
  dialog), so the user can tell what the numbers cover.
- Several account and profile directories under one root are **merged** into a
  single report. The number of accounts and profiles found is displayed
  alongside the roots, so a user with more than one can see that the total spans
  them.
- If no root exists, the app shows an explanatory empty state naming the paths
  it looked in and offering "Ordner wählen…" — it does not show an error dialog
  and does not show a zero total as if it were a real result.

### US-1.2 Choosing a folder manually `MUST`

**As the user, I want to point the app at a folder myself, so that it also works
with a non-standard installation path or with data I copied from elsewhere.**

Acceptance criteria:
- The user can select one or more root directories via a folder picker.
- Chosen folders persist across restarts.
- A chosen folder can be removed again.
- Selecting a folder that contains no `audit.jsonl` produces a clear message
  ("Keine Sitzungsdaten in diesem Ordner gefunden"), not an empty table.

### US-1.3 Correct cost extraction `MUST`

**As the user, I want the displayed cost to be the real cost from the log rather
than an estimate, so that I can rely on the numbers.**

Acceptance criteria:
- Cost comes exclusively from `type == "result"` lines
  (`total_cost_usd`, `usage`, `modelUsage`, `num_turns`, `duration_ms`).
- `output_tokens` from `assistant` lines is never used for cost or for token
  totals. (Verified trap: these carry the `message_start` snapshot of 1–3
  tokens; measured 1,661 instead of 152,004 in one session.)
- Malformed JSONL lines are counted and skipped, never abort the scan.
- JSON files are read as UTF-8, UTF-8-with-BOM, or UTF-16, in that order.
- Regression test: the full `reference-material/` tree yields **1,413.59 USD**
  across **150 sessions**, **508 requests** and **7 projects**.
  The Python POC prints **1,413.58** for the same data, and the app is *not*
  expected to reproduce that: `summarize()` rounds each session to four decimals
  before summing (1413.5848), while the exact sum of `total_cost_usd` is
  1413.5852. The app accumulates in integer micro-USD and reports the exact
  figure. The POC is the specification for parsing, not for rounding.

### US-1.4 Project assignment `MUST`

**As the user, I want my sessions grouped by the Cowork projects (Spaces) I
actually created, so that the breakdown matches what I see in Claude Desktop.**

Acceptance criteria:
- `spaces.json` maps `spaceId` → project name; the tolerant schema handling of
  the POC is preserved (list or map form; id from `id`/`uuid`/`spaceId`; name
  from `name`/`title`/`label`/`displayName`).
- Sessions are matched to manifests across all ID spellings, including the
  verified trap that the manifest says `local_023dbcc7-5727-…` while the session
  directory is named `023dbcc7`.
- Sessions with no `spaceId` are grouped under "(ohne Projekt)".
- A `spaceId` with no matching entry in `spaces.json` falls back to displaying
  the raw ID rather than being dropped.
- Against the reference data this produces exactly: Projekt A, Projekt B,
  Projekt C, Projekt D, Projekt E, Projekt F, (ohne Projekt).

### US-1.5 Visible data gaps `MUST`

**As the user, I want to be told what the report cannot account for, so that I
do not mistake an incomplete total for a complete one.**

Acceptance criteria:
- Requests that were started but never completed (`command_lifecycle` `started`
  minus `completed`) are counted and reported as "offene Anfragen" with the
  explanation that their cost is not recorded. Reference data: 14.
- Sessions with an `audit.jsonl` but no manifest are counted separately, with
  their total cost shown.
- Sessions marked `isArchived` are included but visually marked as archived.
- These indicators are always visible in the main view, not hidden behind a
  detail dialog.

### US-1.6 Read-only guarantee `MUST`

**As the user, I want to be certain the app cannot damage my Claude Desktop
sessions, so that I can run it while I am working.**

Acceptance criteria:
- The app opens every file under a session root read-only. No write, rename,
  move, or delete operation exists anywhere in the code path that touches those
  directories.
- Tauri filesystem capabilities grant read scope only for discovered/selected
  roots; the app's own settings are written to the app config directory.
- A test asserts that no write API is reachable from the scanner module.

---

## UC-2 — Seeing what it cost

*The overview that answers "where did the money go" in one screen.*

### US-2.1 Cost by project `MUST`

**As the user, I want the total cost per project at a glance, so that I know
which work is expensive.**

Acceptance criteria:
- Table of projects sorted by cost descending, with exactly these columns:
  project, sessions, requests, cost USD, total duration. Token counts belong in
  the detail views (US-2.3, US-3.1), not in the overview — the overview answers
  "where did the money go", nothing else.
- A total row.
- Amounts are formatted for the active locale (NFR-7): `1.413,58` in German,
  `1,413.58` in English.
- The first meaningful number is on screen within 2 seconds of app start for a
  dataset the size of the reference data (see NFR-2).

### US-2.2 Drill down to sessions `MUST`

**As the user, I want to expand a project to see its sessions, so that I can
find the expensive ones.**

Acceptance criteria:
- Clicking a project row expands an inline session table: session ID, title,
  requests, cost, output tokens, cache-read, duration, last activity.
- Sessions can be sorted by cost, time, or title, ascending or descending.
- Archived sessions are visually distinct.
- Multiple projects can be expanded at once; expansion state survives sorting.

### US-2.3 Cost by model `MUST`

**As the user, I want cost broken down by model, so that I can see what the
expensive models and the long-context variants cost me.**

Acceptance criteria:
- Model breakdown with cost and share of total, derived from `modelUsage`.
- Model variants are kept distinct: `claude-opus-5` and `claude-opus-5[1m]` are
  separate rows, never merged.
- Available both globally and scoped to a selected project or session.

### US-2.4 Grouping by connected folder `SHOULD`

**As the user, I want to group by the connected working folder instead of the
project, so that I can attribute cost when I did not use Spaces.**

Acceptance criteria:
- A toggle switches grouping between "nach Projekt" and "nach Ordner", using
  `resolvedFolderKinds[].display` with fallback to `userSelectedFolders`.
- Folder names are shown as basenames; the full path is available on hover.
- Sessions with no connected folder group under "(ohne verbundenen Ordner)".
- Network drives (`kind: "network-drive"`) are marked as such.

---

## UC-3 — Understanding a single session

*Where the money went inside one session.*

### US-3.1 Cost drivers per session `MUST`

**As the user, I want to see what drove the cost of a session, so that I can
work more cheaply next time.**

Acceptance criteria:
- A session detail view breaks cost down by token category: input, output,
  thinking, cache write (1h and 5m separately), cache read — each with token
  count, cost share, and cost in USD.
- The cost per category is computed from the price table (UC-4); when no
  per-category prices are configured, the shares are shown as *token* shares and
  labelled as such, and only the measured `total_cost_usd` is shown as money.
- Web search and web fetch request counts (`usage.server_tool_use`) are shown
  when non-zero.
- Number of subagents spawned (`subagent_stats.spawned`) is shown when non-zero.
- The session's requests are listed individually: timestamp, cost, turns,
  duration, error flag.

### US-3.2 Tool usage in a session `SHOULD`

**As the user, I want to see which tools a session used and how often, so that I
can recognise expensive working patterns.**

Acceptance criteria:
- Tool calls are counted per tool name from `tool_use` blocks in `assistant`
  lines, deduplicated by `request_id`.
- Shown as a ranked list: tool name, number of calls.
- The view states explicitly that these are call counts, **not** a cost
  attribution, because billing is per API request and a tool result only enters
  the bill indirectly by enlarging the context of subsequent requests.
- `MAY`: an explicitly labelled *estimate* of each tool's share, derived from the
  size of its results relative to total context growth. Only if it can be made
  defensible; a bad estimate is worse than none.

### US-3.3 Charts `SHOULD`

**As the user, I want the breakdowns as charts, so that I grasp the
distribution without reading a table.**

Acceptance criteria:
- Cost per project as a bar chart, cost over time as a line or column chart,
  token-category composition per session as a stacked bar.
- A lightweight charting library may be used, provided it is stable, actively
  maintained, SVG- or Canvas-based, works with Preact, has no network
  dependency at runtime, and carries a licence compatible with EUPL-1.2. The
  choice is recorded in `CLAUDE.md` with the reason. Hand-rolled inline SVG
  remains acceptable where a chart is simple enough not to justify a dependency.
- The library must not pull in a heavyweight transitive tree (React, a date
  library, a CSS-in-JS runtime); bundle-size impact is checked before adopting
  it.
- Every chart has an accessible tabular equivalent visible on the same screen —
  the chart illustrates the table, it never replaces it.
- Charts follow the app's CSS custom properties and stay legible when the window
  is resized.

---

## UC-4 — Valuing cost at the organisation's own rates

*`costBasis` is `list` in all observed records: the logged cost is Anthropic's
public list price, not necessarily what the organisation pays its 3P provider.*

### US-4.1 Both figures side by side `MUST`

**As the user, I want to see both the logged list price and a recomputation at
my own rates, so that I can judge the real cost without losing the reference.**

Acceptance criteria:
- When a price table is configured, the app shows "Kosten (Listenpreis)" and
  "Kosten (eigene Preise)" side by side in the overview, per project and per
  session.
- With no price table configured, only the list price is shown; nothing in the
  UI is blank or zero.
- The recomputed figure is always visually marked as a computed value.
- The app shows the `costBasis` and `provider` values found in the data, so the
  user can see what the logged price actually is.

### US-4.2 Maintaining the price table `MUST`

**As the user, I want to enter my own prices per model, so that the figures
match what my organisation is billed.**

Acceptance criteria:
- An editable table with one row per model and columns for input, output,
  cache write 5m, cache write 1h, and cache read, in USD per million tokens.
- The table ships pre-filled with Anthropic's **public list prices**, so the
  recomputation works out of the box and the user only has to change the models
  whose negotiated rate differs.
- The shipped defaults carry an "as of" date, shown next to the table with a
  note that published prices change and the values are not fetched or verified
  at runtime (NFR-5). A row still holding its shipped default is marked as such
  and distinguishable from one the user has edited.
- A "Standardwerte wiederherstellen" action resets a row, or the whole table, to
  the shipped defaults.
- Models found in the data are pre-listed, including the exact variant string
  (`claude-opus-5[1m]` separate from `claude-opus-5`). A model in the data with
  no shipped default appears as an empty row that the user must fill in.
- Empty fields mean "unknown": affected sessions are excluded from the
  recomputed total and the exclusion is reported, rather than counted as zero.
- The table persists across restarts and can be exported and imported as JSON.
- Prices are only ever shipped defaults or user input; the app never fetches or
  updates a price list over the network (NFR-5).

### US-4.3 Recomputation is transparent `SHOULD`

**As the user, I want to see how a recomputed figure came about, so that I can
check it.**

Acceptance criteria:
- The session detail view shows the calculation per model and token category:
  token count × price = amount.
- Deviation from the logged list price is shown in absolute and percentage
  terms.

---

## UC-5 — Restricting the period

### US-5.1 Date range `MUST`

**As the user, I want to restrict the report to a period, so that I can
determine the cost of a month or a quarter.**

Acceptance criteria:
- Quick choices: "Dieser Monat", "Letzter Monat", "Dieses Quartal", "Alles",
  plus a free from/to selection.
- The filter applies to individual requests by `result` timestamp, not to whole
  sessions — a session spanning a month boundary contributes only its requests
  within the range, and is marked as partially included.
- Every figure in the app (projects, sessions, models, charts, export) honours
  the active filter.
- The active period is visible at all times and is carried into exports.

### US-5.2 Trend over time `SHOULD`

**As the user, I want to see how cost develops over time, so that I notice
unusual increases.**

Acceptance criteria:
- Cost per day and per calendar month, as a table and a chart.
- Selectable scope: all projects or one project.
- Days without activity appear as zero, not as gaps, so the axis stays linear.

---

## UC-6 — Watching the budget

### US-6.1 Budget thresholds `SHOULD`

**As the user, I want to define a budget and be warned when I approach or exceed
it, so that costs do not surprise me.**

Acceptance criteria:
- A monthly budget in USD can be set globally and per project.
- The overview shows consumption against budget as a bar with a percentage.
- Warning state ("Warnung") at a configurable threshold, default 80%; exceeded
  state ("Budget überschritten") above 100%; both use the app's warning and
  error colours and are additionally marked by text, never by colour alone.
- Budgets persist across restarts.
- A budget without a configured value never produces a warning.

### US-6.2 Projection `MAY`

**As the user, I want an estimate of where the current month will land, so that
I can react in time.**

Acceptance criteria:
- Linear projection from the elapsed portion of the month, clearly labelled as
  an estimate.
- Not shown before at least three days of the month have elapsed.

---

## UC-7 — Getting the numbers out

### US-7.1 Export `MUST`

**As the user, I want to export the current view, so that I can pass the figures
on or work with them in a spreadsheet.**

Acceptance criteria:
- Export as CSV and as JSON.
- CSV in the German locale is semicolon-separated with a UTF-8 BOM and a decimal
  comma, so Excel on a German Windows opens it correctly; in the English locale
  it is comma-separated with a decimal point. The BOM is written in both cases.
- The export reflects the active date range and grouping, and states them in a
  header.
- Exports contain aggregates and session metadata (ID, title, project, cost,
  tokens, duration, timestamps) **only**.
- Exports never contain `systemPrompt`, `initialMessage`, `instructions`, prompt
  or response text, or absolute file paths (NFR-6).
- The user chooses the target location through a save dialog.

### US-7.2 Copy a figure `MAY`

**As the user, I want to copy a single value to the clipboard, so that I can
drop it into an email quickly.**

---

## UC-8 — Following along live

### US-8.1 Live update `SHOULD`

**As the user, I want the display to update while I work in Claude Desktop, so
that I can see the cost of a running session.**

Acceptance criteria:
- The app watches the discovered roots for changes and updates within about 5
  seconds of a new `result` line being appended.
- Only changed files are re-parsed; a change does not trigger a full rescan.
- The update preserves the UI state — expanded projects, sort order, scroll
  position, active filter.
- Live update can be switched off; when off, a manual "Aktualisieren" button
  refreshes.
- A rapid burst of file changes is coalesced (debounced) into one update.
- A partially written last line is tolerated and picked up on the next update
  rather than counted as a malformed line.

### US-8.2 Manual refresh `MUST`

**As the user, I want to trigger a rescan myself, so that I can be sure I am
looking at current data.**

Acceptance criteria:
- A "Aktualisieren" action rescans all roots.
- Time of the last successful scan is displayed.
- The UI stays responsive during the scan and shows progress for long scans.

---

## UC-9 — Running and installing the app

*Non-functional requirements. Numbered NFR, all `MUST` unless stated.*

- **NFR-1 — Installation without admin rights.** Windows NSIS installer in
  `installMode: currentUser`, plus a portable `.exe` that runs from a copied
  folder. Both are produced by the release workflow and attached to the GitHub
  release. Target: Windows 10 1803+ / Windows 11 with WebView2 (present by
  default).
- **NFR-2 — Performance.** Initial scan of a dataset the size of the reference
  data (150 sessions, ~37,000 JSONL lines, 3,941 files) completes in under 3
  seconds on a typical work laptop; the UI renders the first aggregate within 2
  seconds and never blocks. Parsing runs off the UI thread.
- **NFR-3 — Robustness.** An unreadable file, a locked file, a malformed line,
  or an unknown schema variant never aborts the scan. Problems are collected and
  shown as a summary the user can open.
- **NFR-4 — Memory.** Audit logs are streamed line by line; a whole session
  tree is never held in memory at once.
- **NFR-5 — Offline.** The app performs no network communication whatsoever. No
  telemetry, no update check, no price-list download. Enforced by Tauri
  capabilities: the HTTP plugin is not included.
- **NFR-6 — Confidentiality.** System prompts, project instructions, initial
  messages, prompt/response text and absolute paths are read where needed for
  aggregation but never written to an export, a log file, or an error report.
- **NFR-7 — Localization.** The app ships in **German and English**. All
  user-facing text goes through a translation layer; no string is hardcoded in a
  component. Both language files are complete at release — a missing key is a
  build failure, not a silent fallback. The language follows the operating
  system locale on first start (German for `de-*`, English otherwise) and can be
  switched in the settings without restarting the app. Locale governs number,
  currency and date formatting as well as text, via `Intl` — `1.413,58 USD` in
  German, `1,413.58 USD` in English. Code, comments, documentation and commit
  messages are English regardless.
- **NFR-8 — Stack parity with CalView.** Preact + Preact Signals, TypeScript
  strict/ES2022, Vite, plain CSS with custom properties, Vitest + jsdom, Tauri
  v2, npm, GitHub Actions. Deviations require justification in `CLAUDE.md`.
  Deliberate deviations so far: `@tauri-apps/plugin-fs` for filesystem access
  and watching, `@tauri-apps/plugin-dialog` for the US-1.2 folder picker (S7)
  and, from S15, reused for US-4.2's price-table JSON export/import (a native
  save/open dialog plus two new Rust commands, never `@tauri-apps/plugin-fs`
  itself, so the read-only capability list is untouched),
  `@testing-library/preact` as a dev-only component-testing tool (S7), a
  charting library (US-3.3), a translation layer (NFR-7), and
  Playwright for end-to-end tests (NFR-9). CalView's HTTP plugin, keyring and
  Outlook COM code are not carried over.
- **NFR-9 — Testability.** Two layers, both running in CI.
  - *Unit tests (Vitest).* All parsing, aggregation, pricing and budget logic
    lives in pure functions under `src/model/` and is testable without Tauri and
    without the UI. The regression case of US-1.3 runs against a small committed
    fixture set (synthetic and anonymised — the real reference material is never
    committed).
  - *End-to-end tests (Playwright).* The main paths are covered: app start with
    discovered data through to the project overview; expanding a project and
    then a session; changing the date range; entering a price and seeing both
    cost figures; setting a budget and triggering the warning state; exporting
    CSV and JSON; switching the language. Playwright drives the frontend against
    the Vite build with the Tauri filesystem layer replaced by a fixture-backed
    fake, so the tests run headless on a Linux CI runner without a packaged app.
    Tests assert on accessible roles and `data-testid`, never on translated
    text, so they survive both locales — and one test runs the overview path in
    each locale.
- **NFR-10 — Release process.** As in CalView: version synchronised across
  `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; a
  `v*.*.*` tag triggers the build and a draft GitHub release. Windows builds run
  on a `windows-latest` runner; `CROSS_COMPILE.md` documents the Linux fallback.
- **NFR-11 — Accessibility.** `SHOULD`. Keyboard operation of all tables and
  dialogs; state never conveyed by colour alone; sufficient contrast.
- **NFR-12 — Licensing.** EUPL-1.2, author Sebastian Rettig, matching CalView.
  Third-party licences are collected at build time and shown in an About dialog.
- **NFR-13 — Development against real data.** `npm run dev` runs the full app
  in the browser against the local `reference-material/` tree, without Tauri and
  without a packaged build, so UI work can be done in a normal browser with hot
  reload.
  - A Vite dev-server middleware exposes the configured reference directory
    read-only over HTTP (directory listing + file streaming), mirroring the way
    CalView uses a Vite dev proxy for CalDAV.
  - The filesystem service has two implementations behind one interface: the
    Tauri fs plugin in the packaged app, the dev middleware under `npm run dev`.
    The model layer cannot tell them apart, and nothing above the service layer
    branches on which one is active.
  - The directory is configurable (env var, defaulting to `../reference-material`
    relative to the project root) so it works without the data being inside the
    project.
  - The middleware exists only in the dev server. It is never part of a
    production build, and a missing reference directory degrades to the normal
    empty state (US-1.1) rather than an error.
  - This is a development convenience, not a test harness: Playwright uses its
    own committed fixtures (NFR-9), because `reference-material/` is not in Git.

---

## Open points

1. **`claude-code-sessions`.** Our sample contains manifests but no
   `audit.jsonl` under that root, so that code path cannot be validated against
   real data before release.
2. **Tool-level cost attribution (US-3.2).** Whether a defensible estimate is
   possible at all is an open research question; counts are the committed scope.
