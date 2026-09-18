# S10 — Model breakdown, folder grouping, data gaps

**Stories.** US-2.3 (`MUST`), US-2.4 (`SHOULD`), US-1.5 (`MUST`, the UI half — the
counting half shipped in S4). Carried alongside: NFR-11 (keyboard operation, no
state by colour alone), NFR-7 (every new string through both catalogues, every
number through `Intl`), NFR-6 (paths in hover text only), NFR-9 (this session's own
Playwright spec).
**Depends on.** S9 (`OverviewTable` with disclosure and sorting, `SessionTable`, the
Playwright harness), S8 (`StatusBar`, `groupLabelText`, the fixture trees), S5
(`Report` with `projectGroups`, `folderGroups`, `ModelBreakdown`, `ScanGaps`),
S4 (`summarizeGaps`, `ConnectedFolder`), S2 (`src/i18n/`).
**Status.** Planned 2026-09-18. Approved by the user; all twelve design questions
are decided below and none is left open.

**Goal.** Finish the overview.

---

## 0. Read this first

### 0.1 Everything here is presentational

The model layer is already finished for all three stories. Before adding anything
to `src/model/`, check what is already there:

- `Report.models` (global) and `GroupRow.models` / `SessionRow.models` in
  `src/model/report-types.ts` already carry a `ModelBreakdown` whose `ModelTotal.model`
  is the **exact** `modelUsage` key — the `[1m]` suffix was never normalised away.
  `costShare(part, total)` already exists in `src/model/report.ts`.
- `Report.folderGroups` is already built eagerly by `buildReport`, with
  `folderKey` / `folderRefOf` in `src/model/folder-grouping.ts`, and
  `ConnectedFolder` already carries `display` (a basename), `path` (the normalised
  full path — sensitive) and `kind`. `groupLabelText` in
  `src/components/group-label.ts` already renders the folder arm as basenames with
  the full paths as a `title`.
- `Report.gaps` is `ScanGaps` — `openRequests`, `sessionsWithoutManifest`,
  `costMicroUsdWithoutManifest`, `archivedSessions` — passed through `buildReport`
  unchanged.

S10 therefore adds **three small pure helpers** and does the rest in components,
state and CSS. If you find yourself writing aggregation logic, stop: it exists.

### 0.2 Three facts about the data that shape this plan

1. **`ConnectedFolder.kind` is only populated from `resolvedFolderKinds`.** The
   `userSelectedFolders` fallback in `src/model/manifest.ts` sets `kind: null`. A
   network drive that is only known through that fallback is therefore **not
   markable**. That is the data's limit, not a bug to fix here.
2. **`projectKey({ kind: "none" })` and `NO_FOLDER_KEY` are the same string,
   `"\u0000none"`.** A single flat expansion set — or a single flat scope value —
   shared across both groupings would couple "no project" and "no folder". Both
   expansion and scope are tracked **per grouping** (Q8, Q12).
3. **In the reference tree `sessionsWithoutManifest` is 0** and `openRequests` is 14
   (`src/model/reference-distribution.test.ts`). A gap strip that renders every
   counter unconditionally would show a permanent "0 sessions without manifest"
   against real data. Zero-valued chips are hidden (Q4).

### 0.3 `LEARNINGS.md` entries that changed a decision here

Do not re-derive these.

1. **`hasAttribute("onclick")` is a vacuous assertion in Preact.** The new
   `scope-select` button must not toggle expansion. That test is written as a spy on
   the toggle callback **with a positive control** — a row click that *does* expand —
   never as an assertion that some attribute is absent.
2. **An injectable dependency whose default agrees with the injection on every
   fixture is untested by construction.** Two consequences, both binding on the
   e2e fixture (§8): the project grouping and the folder grouping must produce
   **different group counts and a different row order**, or a toggle that ignores its
   argument passes; and at least two groups must have **different model mixes**, not
   merely different totals, or a panel that ignores its scope and always renders the
   global breakdown passes every scope spec.
3. **A quoted English string in an e2e assertion is the translated-text trap in its
   easiest disguise.** `e2e/grouping.spec.ts` asserts on `data-testid`,
   `data-group-key`, `data-model`, `data-share`, `data-scope`, `aria-pressed`,
   `aria-checked`, a `title` derived from an exported fixture constant, or a string
   derived from the catalogue. `"Network drive"` and `"Netzlaufwerk"` must never
   appear quoted in a spec.
4. **`CostTotals` carries no session count, so any total is necessarily derived.**
   The gap strip and the model panel never re-sum visible rows: they read
   `report.gaps`, `report.models` / `group.models` and the matching `*.totals`.
   `OverviewTable`'s `<tfoot>` is untouched again this session.
5. **Amending a test because a fallback changed its inputs can silently delete the
   coverage the test existed for.** `toggleGroup` gains a `grouping` argument, so
   several `src/state/app-state.test.ts` cases change. Each amended case is named in
   §9.1 so the reviewer can see it was planned, and each keeps the property it was
   written to guard.
6. **`localeCompare` is the model layer's back door to i18n.** No new comparator
   enters `src/model/`; model rows keep the order `buildReport` produced. The one new
   locale-sensitive thing is percent formatting, and it goes through `Intl` in
   `src/i18n/format.ts`.
7. **`display` in manifest folder entries is a path, not a label.** Hover text uses
   `ConnectedFolder.path`; visible text uses the basename. Never the reverse.
8. **Per-audit problems never reach the UI**, and **`Problem` carries no path and no
   content.** The gap strip shows counts and one cost figure — no scope, no path, no
   file name.
9. **The NUL-byte scan needs the right command, and it is not the obvious one.** Use
   `command grep -rlaP '\x00' src plugins scripts e2e test` (§10). The
   `grep -rIl $'\0'` form named in the S9 plan is broken and must not be copied
   forward.

### 0.4 Privacy

Every value in the new fixture is invented. Nothing is copied, quoted or paraphrased
from the reference tree, which is not in Git and never will be. On screen: folder
**basenames**, with the full path reachable only as hover `title` (NFR-6) — S19 must
strip `ConnectedFolder.path` from every export. No `systemPrompt`, no
`initialMessage`, no project instructions, no prompt or response text. The gap strip
names no session and no path.

---

## 1. The layout — the scope-following side panel

The user chose the side panel over a global-plus-duplicated-scoped-table layout.
There is exactly **one** model breakdown in the DOM at any time; it sits to the right
of the overview table and follows a selected scope.

```
+----------------------------------------------------------------------------+
| Claude3PCost                                        [DE] EN        v0.1.0  |
+----------------------------------------------------------------------------+
| Datenlucken:  [ 14 offene Anfragen - Kosten nicht erfasst ]                |
|               [ 2 Sitzungen ohne Manifest - 18,40 USD ]                    |
|               [ 3 archivierte Sitzungen enthalten ]                        |
+---------------------------------------------+---------------------------+
| Gruppierung: [nach Projekt] (nach Ordner)   | Kosten nach Modell    [x] |
|---------------------------------------------|---------------------------|
| Projekt             Sitz. Anfr.     Kosten  | Bereich: Nebula Launch    |
| v Nebula Launch [*]   34   112  612,40 USD  |          [ alle zeigen ]  |
|   023dbcc7 Kickoff    12  212,40 USD   ...  |---------------------------|
|   7a1f0c22 Import      9  198,02 USD   ...  | claude-opus-5             |
| > Quartz Program [ ]  28    96  431,08 USD  |   480,10 USD      78,4 %  |
| > Kein Projekt   [ ]  12    38   94,22 USD  |   [####################]  |
|---------------------------------------------| claude-opus-5[1m]         |
| Gesamt                77   255 1.154,73 USD |   132,30 USD      21,6 %  |
|                                             |   [#####]                 |
|                                             | Keinem Modell zugeordnet  |
|                                             |     3,06 USD          -   |
+---------------------------------------------+---------------------------+
| 1 Ordner - 1 Konto - 2 Profile - 77 Sitzungen   -  Letzter Scan 14:02    |
+----------------------------------------------------------------------------+
```

`[*]` / `[ ]` is the per-row `scope-select` button (`aria-pressed`); `[x]` closes the
panel. Under folder grouping the first column header reads "Ordner" and the rows are
folder buckets:

```
| Gruppierung:  ( nach Projekt )  [ nach Ordner ]                            |
|----------------------------------------------------------------------------|
|  Ordner                    Sitzungen  Anfragen       Kosten      Dauer     |
|  > nebula-app        [ ]          21        74   412,90 USD   6 h 02 min   |
|  > reports [Netzlaufwerk] [ ]     12        41   208,11 USD   3 h 20 min   |
|  > api, web          [ ]           8        22    96,40 USD   1 h 11 min   |
|  > Kein verbundener Ordner [ ]    36       118   437,32 USD   9 h 22 min   |
|                                                                            |
|  (hover over "nebula-app" shows C:/Users/.../projects/nebula-app)          |
```

When every gap count is zero the strip collapses to one line rather than
disappearing:

```
| Datenlucken:  Keine Datenlucken festgestellt                               |
```

**Why not the alternative.** A global panel above the table plus a scoped table
repeated inside every expanded group needs no scope model at all and was the cheaper
build, but it puts the same table on screen several times and pushes the overview
itself below the fold. The user chose the side panel; §2 Q1 and Q12 design around its
two costs (a scope rule and horizontal width) rather than re-litigating them.

---

## 2. The twelve decisions, with their reasoning

### Q1 — A single scope-following side panel

**Decision.** One `ModelPanel`, to the right of the overview table, showing the
breakdown for the current scope: all data, or one selected group.

**Why.** One breakdown on screen, never duplicated, with room for a share bar per
row. The costs are a scope-selection rule (Q12) and horizontal width (Q7), both
settled below.

### Q2 — Session-scoped model breakdown is deferred to S11

**Decision.** S10 satisfies US-2.3 at **global** and **group** scope. The
**session**-scoped breakdown lands in S11's session detail view.

**Why.** `SessionRow.models` is already populated, so S11 gets it for free next to
the token-category breakdown it already owns. A third nesting level — group, then
session, then models — inside the overview table would make the drill-down
unreadable and would duplicate S11's screen. **This is the one acceptance-criterion
bullet S10 does not close, and the user approved the deferral explicitly.**

### Q3 — Gap indicators are a chip strip under the header

**Decision.** A dedicated strip directly under the app header, above the toolbar and
table, rendering one chip per non-zero gap count.

**Why.** US-1.5 requires an *explanation* ("their cost is not recorded"), which a
one-line footer cannot carry, and `StatusBar` is already six items long. Folding the
gaps into the footer would push the explanation into a tooltip — "hidden behind a
detail" in spirit, which is what the criterion forbids.

### Q4 — Zero-valued chips are hidden; the strip is not

**Decision.** Render only counters greater than zero. The strip container is always
present; when all three counts are zero it renders a single `gaps.none` line.

**Why.** The criterion is that the indicators are always visible in the main view,
not that three zeros are. In the reference tree `sessionsWithoutManifest` is 0, so
an unconditional chip would be permanent furniture competing with a real 14.

### Q5 — The unattributed remainder is shown, not absorbed

**Decision.** Shares are computed against `ModelBreakdown.costMicroUsd` — the sum
over `modelUsage` — so they sum to 100%, exactly as S5 specified. When
`totals.costMicroUsd - models.costMicroUsd > 0`, the panel renders one extra,
**share-less** row (`models.unattributed`) carrying that amount. A negative
difference is never rendered.

**Why.** `ModelBreakdown.costMicroUsd` is deliberately *not* the authoritative total:
a `result` line with no `modelUsage` contributes to `total_cost_usd` and to nothing
else. Hiding the difference would let the panel's total silently disagree with the
table's total row — the same dishonesty US-1.5 exists to prevent. A negative delta
would mean `modelUsage` over-counts, which no observed data does; if it ever happens
it is a parser bug, and silently drawing a negative bar would hide it.

### Q6 — Grouping is not persisted this session

**Decision.** `grouping` is a signal only. Nothing is written to `localStorage`.

**Why.** Persistence belongs to the settings screen (S15+/S21); a second ad-hoc
`localStorage` key now is a migration later. The signal survives a rescan, which is
what the session actually needs.

### Q7 — Layout: a two-column grid, a closable panel, a scrollable session table

**Decision.**

- The content area is
  `grid-template-columns: minmax(0, 1fr) var(--model-panel-width)` with
  `--model-panel-width: clamp(18rem, 22vw, 24rem)`. The `minmax(0, …)` is
  load-bearing: without the zero minimum the table's intrinsic width wins and the
  panel is squeezed.
- The panel is **closable** (`modelPanelOpen`, default **open**). Closed, it leaves
  the grid entirely (`grid-template-columns: minmax(0, 1fr)`) and the table takes the
  full width. It is reopened from a button in the toolbar row next to the grouping
  toggle — not a thin rail, which is hard to hit and harder to assert.
- Below `@media (max-width: 1100px)` the grid collapses to one column and the panel
  renders **below** the overview table. It stays in the DOM, so every `data-testid`
  assertion holds at any width; only the visual order changes.
- The eight-column `SessionTable` gets a **scroll container**: the expansion row's
  `<td colSpan={5}>` wraps it in
  `<div class="session-table__scroll" data-testid="session-table-scroll">` with
  `overflow-x: auto`, and the table takes `min-width: 56rem`. Numeric cells are
  `white-space: nowrap` and right-aligned; the title cell truncates with
  `text-overflow: ellipsis` and carries its full title as hover text (a manifest
  title, already permitted on screen — **not** a path).

**Why.** The panel must not make the drill-down unusable. Scrolling the sub-table
inside its own row is strictly better than widening the page, and it is a CSS-only
change: `session-table.tsx` is untouched, so its S9 tests and
`e2e/drilldown.spec.ts` are unaffected.

### Q8 — Expansion, and scope, are tracked per grouping

**Decision.** `expandedGroups` holds keys of the form `` `${grouping}:${GroupRow.key}` ``
and `toggleGroup` takes the grouping. The selected scope is likewise stored per
grouping. Switching grouping and switching back restores what was open and what was
selected.

**Why.** Forced by §0.2 item 2: both groupings use `"\u0000none"` for their empty
bucket, so one flat set would couple "no project" with "no folder". It is also the
better behaviour — the alternative, clearing expansion on every toggle, throws away
state the user built. The prefix is plain ASCII with a colon; **no new `U+0000` is
introduced anywhere in this session** (§0.3 item 9 and the S9 plan's own NUL rule).

### Q9 — Network-drive marking is per folder, as translated text

**Decision.** `groupLabelText` returns a `parts` array — one part per
`ConnectedFolder`, each with its basename, its full path as `title`, and an
`isNetworkDrive` flag. The overview renders a translated badge
(`overview.networkDrive`) on the marked parts only.

**Why.** A group's key is a folder **set**, and a set can mix a local and a network
folder; one badge on the whole group would lie. Text rather than an icon satisfies
NFR-11 and is assertable by `data-testid` without quoting English.

### Q10 — The first column header follows the grouping

**Decision.** `overview.columnProject` ↔ a new `overview.columnFolder`.

**Why.** A table headed "Projekt" whose rows are folders is a bug report waiting to
happen.

### Q11 — Share bars are hand-rolled CSS, and decorative

**Decision.** A bar is `<div class="model-bar" style="width: …%">` inside a track
div. **No SVG, no charting dependency.** The bar is `aria-hidden="true"`, because the
same share is already rendered as text next to it and the cost in the cell before.
It carries `data-testid="model-share-bar"` and `data-share` — the ratio rounded to
four decimals as a plain number string, e.g. `"0.7840"`.

**Why.** CLAUDE.md's charting clause is satisfied by not invoking it: a percentage
rectangle is not a chart, and hand-rolling it is far less work than a dependency.
`aria-hidden` avoids a screen reader announcing the same number twice, and nothing is
conveyed by colour or length alone (NFR-11). Specs assert `data-share`, never the
inline `width` style (a CSS rounding difference would make that flaky) and never the
rendered percent text (it is localised).

### Q12 — Scope is chosen by an explicit per-row button, independent of expansion

**Decision.**

- Each group row's label cell gains a second small button after the disclosure:
  `<button data-testid="scope-select" aria-pressed={isSelected}>`, named by
  `models.selectScope` / `models.clearScope`. Pressing it scopes the panel to that
  group; pressing the **selected** one again returns the panel to *alle* — so the
  control's `aria-pressed` semantics and its behaviour agree.
- The panel header shows the scope as text and, when a group is selected, offers
  `scope-reset`. Two routes back to *alle* is deliberate: the panel may be scrolled
  away from the selected row.
- **Selection is separate from expansion in both directions.** Expanding does not
  select; selecting does not expand, scroll or filter. S9's behaviour is untouched,
  and `e2e/drilldown.spec.ts` keeps passing unmodified.
- `OverviewTable`'s existing row-click guard already covers the new button: the S9
  handler ignores any click whose target is inside a `<button>`
  (`(event.target as HTMLElement).closest("button") !== null`). **No new guard is
  needed — and the test that proves it spies on the callback with a positive
  control** (§0.3 item 1).
- The selected row carries `data-selected="true"` **and** `aria-pressed="true"` on
  its button: state is never conveyed by row background alone (NFR-11).
- **Rescan / vanished group:** the stored key is **not pruned** — same reasoning as
  S9's expansion keys, since pruning would drop a selection for a group that
  reappears on the next scan. The panel's scope is *derived* through
  `findGroup(groups, selectedKey)`, and a miss falls back silently to the global
  scope. No error, no message; the selection returns if the group does.

**Why not the alternative.** Letting the scope follow the most recently expanded
group needs no control at all, but with three groups open nothing on the rows says
which one the panel is showing, and getting back to the global view means collapsing
a group you wanted open.

---

## 3. Scope boundaries — what this session does **not** build

Stated explicitly, because Phase 3 reviews against this plan.

| Deferred | To | Note |
|---|---|---|
| Session-scoped model breakdown | **S11** | Q2, approved by the user. `SessionRow.models` is already populated; S10 renders none of it. |
| Per-model request counts in the panel | **S11** | No width in the panel; `ModelTotal.requests` already carries the data. |
| Trend charts over time | **S18** | The share **bars** ship here (Q11); charts over time do not. |
| Grouping/scope persisted across restarts | **S15+/S21** | Q6. |
| Clickable gap chips, drilling into the affected sessions | **S13/S21** | Needs a filter concept. |
| Problem list UI | **S21** | Needs the per-scope cap work first (LEARNINGS). |
| Stripping folder paths from exports | **S19** | Already recorded on `ConnectedFolder.path`. |
| Marking a network drive known only through `userSelectedFolders` | not scheduled | `kind` is `null` there (§0.2 item 1); the data does not support it. |
| Any change to `SessionTable`'s markup | — | Q7's scroll container wraps it from outside; the component is untouched. |
| Sorting the model rows | — | `ModelBreakdown.models` arrives sorted by `buildReport`; the panel never re-sorts. |

---

## 4. Acceptance criteria — what S10 satisfies

| Criterion | How |
|---|---|
| US-2.3 · breakdown with cost and share, from `modelUsage` | `ModelPanel` over `ModelBreakdown`; shares via `costShare` and `tPercent` |
| US-2.3 · variants kept distinct | rows keyed on the raw `modelUsage` key; a named test asserts `claude-opus-5` and `claude-opus-5[1m]` are two rows |
| US-2.3 · global **and** scoped | global by default, group scope via `scope-select`; **session scope deferred to S11 (Q2)** |
| US-2.4 · toggle project ↔ folder | `grouping` signal + `GroupingToggle`; `Report.folderGroups` already built |
| US-2.4 · basenames shown, full path on hover | `GroupLabelPart.text` / `.title` |
| US-2.4 · no-folder bucket | `FolderRef { kind: "none" }` → the existing `overview.noFolder` |
| US-2.4 · network drives marked | per-folder translated badge (Q9) |
| US-1.5 · open requests counted and explained | `gaps.openRequests` chip plus its explanation line |
| US-1.5 · manifest-less sessions counted, with their cost | `gaps.sessionsWithoutManifest` + `costMicroUsdWithoutManifest` |
| US-1.5 · archived included and visually marked | count chip here; the per-row badge shipped in S9 |
| US-1.5 · always visible in the main view | the strip is unconditional; only individual chips are conditional (Q4) |

---

## 5. File inventory

### 5.1 Created — production source (3)

- `src/components/model-panel.tsx`
- `src/components/grouping-toggle.tsx`
- `src/components/gap-indicators.tsx`

### 5.2 Changed — production source

| File | Change |
|---|---|
| `src/model/folder-grouping.ts` | `NETWORK_DRIVE_KIND`, `isNetworkDrive` |
| `src/model/report.ts` | `unattributedCostMicroUsd`, `findGroup` |
| `src/components/group-label.ts` | returns `parts` alongside today's `text` / `title` |
| `src/components/overview-table.tsx` | grouping-dependent first column header; folder parts with network badges; `scope-select` button and `data-selected`; the session-table scroll wrapper |
| `src/state/app-state.ts` | `grouping`, `setGrouping`; per-grouping expansion; per-grouping scope; `modelPanelOpen` |
| `src/app.tsx` | gap strip, toolbar, two-column grid, `ModelPanel`, picks `projectGroups` vs `folderGroups` |
| `src/i18n/format.ts`, `src/i18n/index.ts` | `formatPercent` / `tPercent` |
| `src/i18n/de.ts`, `src/i18n/en.ts` | the new keys (§7) |
| `src/styles/index.css` | strip, chips, toggle, panel grid, share bars, badge, session-table scroll |

### 5.3 Created — tests (4)

- `src/components/model-panel.test.tsx`
- `src/components/grouping-toggle.test.tsx`
- `src/components/gap-indicators.test.tsx`
- `e2e/grouping.spec.ts`

### 5.4 Extended — tests and fixtures (6)

- `src/model/folder-grouping.test.ts`, `src/model/report.test.ts`,
  `src/components/group-label.test.ts`, `src/components/overview-table.test.tsx`,
  `src/state/app-state.test.ts`, `src/i18n/format.test.ts`
- `e2e/fixtures/trees.ts` — a **new** `groupingTree` export. `overviewTree` and
  `drilldownTree` are **not** modified; existing specs assert on them.

### 5.5 Documentation

None required. Nothing here is an NFR-8 deviation — the share bars are hand-rolled
CSS with no new dependency (Q11) — so neither `CLAUDE.md`'s stack table nor
`REQUIREMENTS.md`'s NFR-8 list changes, and the two-file bookkeeping trap does not
bite.

---

## 6. Boundary types and signatures

### 6.1 `src/model/folder-grouping.ts` — added

```ts
export const NETWORK_DRIVE_KIND = "network-drive";
/** Exact match only. A null or unrecognised kind is not a network drive. */
export function isNetworkDrive(folder: ConnectedFolder): boolean;
```

### 6.2 `src/model/report.ts` — added

```ts
/**
 * totals.costMicroUsd - models.costMicroUsd, clamped at 0. Cost carried by a
 * result line that named no modelUsage key. Never given a share (plan §2 Q5).
 */
export function unattributedCostMicroUsd(totals: CostTotals, models: ModelBreakdown): number;

/**
 * The group with this key, or null. The panel's scope is derived through this,
 * so a key for a group that vanished on a rescan falls back silently to the
 * global scope. Keys are never pruned (plan §2 Q12).
 */
export function findGroup(groups: readonly GroupRow[], key: string | null): GroupRow | null;
```

### 6.3 `src/components/group-label.ts` — changed

```ts
export interface GroupLabelPart {
  /** Basename, or the translated project label. Never a path. */
  readonly text: string;
  /** Full path — HOVER ONLY (NFR-6). S19 MUST strip it from exports. */
  readonly title?: string;
  readonly isNetworkDrive: boolean;
}

export interface GroupLabelText {
  /** Unchanged: the parts' text joined with ", ". */
  readonly text: string;
  /** Unchanged: the parts' titles joined with ", ". */
  readonly title?: string;
  readonly parts: readonly GroupLabelPart[];
}

export function groupLabelText(label: GroupLabel): GroupLabelText;
```

`text` and `title` keep their S8 meaning and their S8 tests; `parts` is additive.
The project arm returns exactly one part, never a network drive, with no `title`.

### 6.4 `src/components/model-panel.tsx` — new

```ts
export type ModelScope =
  | { readonly kind: "all" }
  | { readonly kind: "group"; readonly label: string };

export interface ModelPanelProps {
  /** Rendered in the order given; never re-sorted (cf. S8 §2 Q6). */
  readonly breakdown: ModelBreakdown;
  /** The authoritative totals for the SAME scope. Used only for the unattributed row. */
  readonly totals: CostTotals;
  readonly scope: ModelScope;
  /** Null when the scope is already "all" — the reset control is then absent. */
  readonly onResetScope: (() => void) | null;
  readonly onClose: () => void;
}

export function ModelPanel(props: ModelPanelProps): JSX.Element;
```

Markup contract:

- Root `<aside data-testid="model-panel" data-scope="all" | "group">`, with
  `data-scope-key` present only for a group scope, and a heading from
  `models.heading`.
- `data-testid="model-scope-label"` renders `models.scopeLabel` with either the group
  label or `models.scopeAll`.
- One `<tr data-testid="model-row" data-model={exact modelUsage key}>` per model, with
  `cell-model`, `cell-model-cost`, `cell-model-share`, and a
  `<div data-testid="model-share-bar" data-share="0.7840" aria-hidden="true">`.
- `model-unattributed-row` when `unattributedCostMicroUsd(...) > 0`, with **no**
  share cell content and **no** bar.
- `model-empty` when `breakdown.models` is empty.
- `scope-reset` only when `onResetScope` is non-null; `model-panel-close` always.
- Cost is `tCurrency(micro / 1e6)` — the single division at the display boundary,
  never per-row-and-again-at-the-total. Shares go through `tPercent`.

### 6.5 `src/components/grouping-toggle.tsx` — new

```ts
export interface GroupingToggleProps {
  readonly value: Grouping;
  readonly onChange: (next: Grouping) => void;
}
export function GroupingToggle(props: GroupingToggleProps): JSX.Element;
```

A `role="radiogroup"` labelled by `overview.groupingLabel`, containing two
`role="radio"` buttons — `data-testid="grouping-project"` and
`"grouping-folder"` — each with `aria-checked`, both keyboard-operable.

### 6.6 `src/components/gap-indicators.tsx` — new

```ts
export interface GapIndicatorsProps {
  readonly gaps: ScanGaps;
}
export function GapIndicators(props: GapIndicatorsProps): JSX.Element;
```

Root `<section data-testid="gap-indicators">`, always rendered, labelled by
`gaps.heading`. Chips `gap-open-requests` (count plus
`gaps.openRequestsExplanation`), `gap-sessions-without-manifest` (count plus
`gaps.sessionsWithoutManifestCost`, formatted with
`tCurrency(costMicroUsdWithoutManifest / 1e6)`), `gap-archived-sessions` — each
rendered only when its count is greater than zero. When all three are zero, one
`gap-none` line (Q4).

### 6.7 `src/components/overview-table.tsx` — changed

Props added to the S9 set:

```ts
readonly grouping: Grouping;                     // drives the first column header
readonly selectedKey: string | null;
readonly onSelect: (groupKey: string) => void;   // same key again -> the caller resets to "all"
```

- The first header is `overview.columnProject` or `overview.columnFolder`.
- The label cell renders `groupLabelText(...).parts`: each part's text as a
  `data-testid="folder-part"` span carrying `title` when the part has one, plus a
  `data-testid="network-drive-badge"` span when `isNetworkDrive`. The project arm
  renders its single part unchanged from S8.
- After the disclosure button, a `<button data-testid="scope-select"
  aria-pressed={selectedKey === group.key}>`; the row gains `data-selected="true"`
  when selected. **The existing row-click guard is unchanged** and already ignores
  clicks inside any button (Q12).
- The expansion row wraps `SessionTable` in
  `<div class="session-table__scroll" data-testid="session-table-scroll">` (Q7).
- The `<tfoot>` is untouched (§0.3 item 4).

### 6.8 `src/state/app-state.ts` — changed

```ts
export type Grouping = "project" | "folder";

export const grouping: Signal<Grouping>;          // default "project"; not persisted (Q6)
export function setGrouping(next: Grouping): void;

/** Keys are `${grouping}:${GroupRow.key}` — both groupings use "\u0000none"
 *  for their empty bucket, so one flat set would couple them (plan §2 Q8). */
export const expandedGroups: Signal<ReadonlySet<string>>;
export function toggleGroup(g: Grouping, groupKey: string): void;
/** The raw (unprefixed) keys expanded under this grouping. */
export function expandedKeysFor(g: Grouping): ReadonlySet<string>;

/** Per grouping, for the same reason. Null = the global scope. */
export const selectedGroups: Signal<Readonly<Record<Grouping, string | null>>>;
export function selectedGroupKey(g: Grouping): string | null;
/** The same key again -> null. Never pruned on a rescan (plan §2 Q12). */
export function toggleGroupScope(g: Grouping, groupKey: string): void;
export function clearGroupScope(g: Grouping): void;

export const modelPanelOpen: Signal<boolean>;     // default true
export function setModelPanelOpen(open: boolean): void;
```

`runScan()` touches **none** of these signals. Grouping, expansion, sort, scope and
panel state therefore all survive a rescan by construction — the property S20 will
lean on.

### 6.9 `src/i18n/` — added

```ts
// format.ts — mirrors getNumberFormatter, over the existing private LOCALE_TAG map
export function formatPercent(locale: Locale, ratio: number): string;

// index.ts
export function tPercent(ratio: number): string;
```

`Intl.NumberFormat` with `style: "percent"` and `maximumFractionDigits: 1`.

---

## 7. Catalogue keys

Added to **both** `src/i18n/de.ts` and `src/i18n/en.ts`, in the files' sorted order.
Parity is enforced by `tsc` alone, as `CLAUDE.md` describes. Final wording is the
implementer's to polish; the key set is not.

| Key | German | English |
|---|---|---|
| `gaps.archivedSessions.one` | `{count} archivierte Sitzung enthalten` | `{count} archived session included` |
| `gaps.archivedSessions.other` | `{count} archivierte Sitzungen enthalten` | `{count} archived sessions included` |
| `gaps.heading` | `Datenlücken` | `Data gaps` |
| `gaps.none` | `Keine Datenlücken festgestellt` | `No data gaps found` |
| `gaps.openRequests.one` | `{count} offene Anfrage` | `{count} open request` |
| `gaps.openRequests.other` | `{count} offene Anfragen` | `{count} open requests` |
| `gaps.openRequestsExplanation` | `Kosten nicht erfasst` | `Cost not recorded` |
| `gaps.sessionsWithoutManifest.one` | `{count} Sitzung ohne Manifest` | `{count} session without a manifest` |
| `gaps.sessionsWithoutManifest.other` | `{count} Sitzungen ohne Manifest` | `{count} sessions without a manifest` |
| `gaps.sessionsWithoutManifestCost` | `davon {cost}` | `totalling {cost}` |
| `models.clearScope` | `Bereich auf alle zurücksetzen` | `Show models for everything` |
| `models.closePanel` | `Modellübersicht schließen` | `Close the model panel` |
| `models.columnCost` | `Kosten` | `Cost` |
| `models.columnModel` | `Modell` | `Model` |
| `models.columnShare` | `Anteil` | `Share` |
| `models.empty` | `Keine Modelldaten` | `No model data` |
| `models.heading` | `Kosten nach Modell` | `Cost by model` |
| `models.openPanel` | `Modellübersicht öffnen` | `Open the model panel` |
| `models.scopeAll` | `alle` | `All` |
| `models.scopeLabel` | `Bereich: {scope}` | `Scope: {scope}` |
| `models.selectScope` | `{name} als Bereich wählen` | `Show models for {name}` |
| `models.unattributed` | `Keinem Modell zugeordnet` | `Not attributed to a model` |
| `overview.columnFolder` | `Ordner` | `Folder` |
| `overview.groupByFolder` | `nach Ordner` | `By folder` |
| `overview.groupByProject` | `nach Projekt` | `By project` |
| `overview.groupingLabel` | `Gruppierung` | `Grouping` |
| `overview.networkDrive` | `Netzlaufwerk` | `Network drive` |

`overview.noFolder` already exists from S8 and is reused unchanged. There is no
`models.columnRequests`: the narrow panel carries model, cost and share only
(§3, deferred to S11).

---

## 8. The e2e fixture — `groupingTree`

A **new** export in `e2e/fixtures/trees.ts`. `overviewTree` and `drilldownTree` are
not modified. Every value is invented (§0.4).

Required content:

- two named spaces, so project grouping has more than one named bucket;
- one session with **no** connected folder (the no-folder bucket);
- two sessions sharing **one** local folder;
- one session with a **two-folder set** (one bucket keyed on the set, displayed as
  two basenames);
- one folder with `kind: "network-drive"` supplied through `resolvedFolderKinds`
  (the `userSelectedFolders` fallback cannot carry a kind — §0.2 item 1);
- one `audit.jsonl` with **no** manifest and non-zero cost (the
  sessions-without-manifest chip and its cost);
- one manifest with `isArchived: true` (the archived chip);
- unmatched `command_lifecycle` `started` / `completed` lines giving a known
  `openRequests` count (the open-requests chip);
- `modelUsage` containing both `claude-opus-5` and `claude-opus-5[1m]` with
  **different** costs;
- one `result` line with **no** `modelUsage`, so the unattributed row is non-empty.

Two properties are requirements on the fixture, not remarks (§0.3 item 2):

1. **The project grouping and the folder grouping must yield a different group count
   and a different row order.** With identical shapes, a toggle that ignores its
   argument produces the expected DOM and the spec certifies the wrong answer.
2. **At least two groups must have genuinely different model *mixes*** — different
   model names, not merely different totals. With the same mix everywhere, a panel
   that ignores its scope and always renders the global breakdown passes every scope
   spec.

Exported constants give the expected group keys, group counts, gap counts, the
missing-manifest cost and the folder hover paths, so the spec asserts on constants
and never on rendered translated text.

---

## 9. Tests, by name

### 9.1 Vitest

`src/model/folder-grouping.test.ts` — added
- `isNetworkDrive is true only for the exact network-drive kind`
- `a folder with a null kind is not a network drive`

`src/model/report.test.ts` — added
- `unattributedCostMicroUsd is the authoritative total minus the model-usage sum`
- `unattributedCostMicroUsd is zero when modelUsage covers the whole total`
- `unattributedCostMicroUsd clamps a negative difference to zero`
- `costShare over a breakdown sums to one`
- `findGroup returns the group with the given key`
- `findGroup returns null for a null key`
- `findGroup returns null for a key no group carries`

`src/components/group-label.test.ts` — added
- `a folder group exposes one part per folder, basename as text and full path as title`
- `a network-drive folder part is marked and a local one is not`
- `a folder set mixing kinds marks only the network-drive part`
- `a project label exposes a single unmarked part with no title`
- `the joined text and title are unchanged from S8`

`src/components/model-panel.test.tsx` — new
- `renders one row per model in the order given and never re-sorts`
- `keeps model variants distinct: the [1m] suffix is a separate row`
- `shares are computed against the model-usage sum and add up to 100 percent`
- `renders a share bar whose data-share matches the rendered share`
- `hides the share bar from assistive technology while the share stays as text`
- `renders an unattributed row with no share`
- `renders no unattributed row when the two totals agree`
- `renders the empty state when the breakdown has no models`
- `renders the scope label and a reset control for a group scope`
- `renders no reset control for the global scope`
- `divides micro-USD by 1e6 exactly once, at the cell`
- `renders identical data-testids in German and in English`

`src/components/grouping-toggle.test.tsx` — new
- `exposes two radios with the active one checked`
- `calls onChange with the other grouping when the inactive radio is activated`
- `is operable by keyboard`
- `renders identical data-testids in German and in English`

`src/components/gap-indicators.test.tsx` — new
- `renders the open-request count together with its explanation`
- `renders the sessions-without-manifest count together with their cost`
- `renders the archived-session count`
- `omits an indicator whose count is zero`
- `renders the no-gaps state when every count is zero`
- `formats the missing-manifest cost through the currency formatter`

`src/components/overview-table.test.tsx` — added
- `the first column header follows the grouping prop`
- `a folder group row renders a network-drive badge only on the network folder`
- `a folder group row carries the full path as hover text and never as visible text`
- `the scope control reflects selection in aria-pressed, not by row colour alone`
- `activating the scope control calls onSelect with the group key`
- `clicking the scope control does not toggle expansion` — **spies on the toggle
  callback and carries a positive control on a row click that does expand**
  (§0.3 item 1); never an assertion that an attribute is absent
- `the expanded panel wraps the session table in a scroll container`
- `the total row is still the totals prop, not a re-sum of visible rows`

`src/state/app-state.test.ts` — added
- `setGrouping switches the grouping signal`
- `expansion is tracked per grouping: the same key open under projects is closed under folders`
- `toggleGroupScope selects a group and selecting it again returns to all`
- `scope is tracked per grouping: switching grouping restores that grouping's scope`
- `clearGroupScope returns the panel to all`
- `a scope key for a group that vanished is kept, not pruned`
- `setModelPanelOpen closes and reopens the panel`
- `grouping, expansion, sort and scope all survive a rescan`

`src/state/app-state.test.ts` — **amended, deliberately (§0.3 item 5)**
- every existing `toggleGroup` case, because the function gains a leading `grouping`
  argument. Each amended case must keep the property it was written to guard —
  "toggling twice removes the key" and "toggling keeps other expanded keys" stay,
  now scoped to one grouping. The reviewer should expect this diff.

`src/i18n/format.test.ts` — added
- `formatPercent renders a locale-appropriate percent with one fraction digit`
- `formatPercent of a zero ratio renders zero percent`

### 9.2 Playwright — `e2e/grouping.spec.ts` (new)

- `switching to folder grouping replaces the project buckets with folder buckets`
- `the folder grouping produces a different row count and order than the project grouping`
- `sessions with no connected folder appear in the no-folder bucket`
- `a network-drive folder group carries the network badge and a local one does not`
- `the full folder path is available as hover text and never as visible row text`
- `the first column header changes with the grouping`
- `expansion is independent per grouping`
- `the panel opens on the global scope and lists both model variants separately`
- `selecting a group scopes the panel to that group`
- `selecting the same group again returns the panel to the global scope`
- `the panel reset control returns to the global scope`
- `the panel scope is independent of which groups are expanded`
- `closing the panel removes it from the DOM and the toolbar control reopens it`
- `the gap indicators are visible on the main view with the fixture counts`
- `the grouping path in German`

Every assertion is on `data-testid`, `data-group-key`, `data-model`, `data-share`,
`data-scope`, `data-selected`, `aria-pressed`, `aria-checked`, a `title` derived from
an exported fixture constant, or a string derived from the catalogue. **Never on a
quoted English string** (§0.3 item 3) — grep the finished spec for quoted English
words before calling it done, not only for obviously translated labels.

The gap counts asserted here are the **fixture's** constants. The real reference
numbers (14 open requests, 0 sessions without a manifest) stay in
`npm run regression` and the manual pass in §10; Playwright never sees
`reference-material/`, which is not in Git.

---

## 10. Build order — with a green checkpoint

The order is binding. Each step leaves the tree green on the unit-level commands.

1. **`src/model/`** — `isNetworkDrive`, `unattributedCostMicroUsd`, `findGroup`, and
   `group-label.ts`'s `parts`, with their tests. Pure, no DOM.
2. **`src/i18n/`** — `formatPercent` / `tPercent`, and every key in §7 added to both
   catalogues, with the format tests.
3. **`GapIndicators`** and its wiring into `app.tsx`. **US-1.5 is satisfied.**
4. **`GroupingToggle`**, the `grouping` signal, per-grouping expansion, and
   `overview-table.tsx`'s header, folder parts, badges and hover. **US-2.4 is
   satisfied.**

   > ### ✅ CHECKPOINT — report here
   >
   > At the end of step 4 the tree is green on `npm test`, `npm run build`,
   > `npm run lint` and `npm run format:check`, and **US-1.5 and US-2.4 are both
   > satisfied**. This is the pause, hand-over and resume boundary. If the session
   > has to be cut short, this is where it stops and only US-2.3 carries over.

5. **`ModelPanel`**, the scope signals, the `scope-select` control, the two-column
   grid and the session-table scroll container. **US-2.3 is satisfied at global and
   group scope** (session scope is S11, Q2).
6. **`groupingTree`** and `e2e/grouping.spec.ts`.

Step 5 is the largest single step: a scope model, a second per-row control and a
responsive two-column layout. Do not start it before step 4 is green.

---

## 11. Exit commands

One set, run in this order:

```bash
npm test
npm run build
npm run lint
npm run format:check
npm run test:e2e
```

Plus, once during the session:

```bash
npm run regression                                        # local reference data only, never CI
command grep -rlaP '\x00' src plugins scripts e2e test    # the U+0000 scan; expect no output
command grep -rn "Network drive|Netzlaufwerk|Archived|Untitled" e2e/   # translated-text trap
```

The NUL scan form matters: `grep -rIl $'\0' …` and `grep -rlP '\x00' …` both report
a clean tree over a file that contains a NUL, and `grep` in this development shell
is a function wrapping `ugrep` — `command grep` bypasses it (LEARNINGS).

And one manual check, **reported rather than asserted**, against the local,
uncommitted reference tree with `npm run dev`:

- toggle to folder grouping and confirm 26 folder groups, and that switching back
  restores the project expansion and the project scope;
- confirm the gap strip shows 14 open requests and **no** manifest-less chip (that
  count is 0 in the reference data), and that the archived chip matches what the
  session tables show;
- hover a folder label and confirm the full path appears only in the tooltip, never
  as visible row text;
- select a group and confirm the panel's shares sum to 100% and that any
  unattributed remainder is shown rather than absorbed;
- at roughly 1280px and again at roughly 1000px, confirm the panel and the table
  coexist, that the session sub-table scrolls inside its own row rather than widening
  the page, and that closing the panel gives the table the full width.
