# S16a — Navigation shell and scope

**Status.** Approved in planning, not yet implemented.
**Roadmap position.** Inserted after S16, before S17. S17–S22 keep their numbers.
**Depends on.** S16 (dual cost display), and through it every session back to S8.

---

## §0 — What this session is, and what it deliberately is not

The user's assessment, verbatim, is the origin of this session:

> the user interface isn't really beautiful at the moment. I don't like the fact
> that the collapsible sections aren't styled properly and some buttons aren't
> styled nicely. Don't show the session id, it's not useful. Also the total cost
> per model dialog isn't well placed after all and the same is true for the
> history. I think we should put these into their own pages. Think of more UI/UX
> issues and suggest improvements.

Planning found fifteen distinct issues. They fall into two different kinds of
work — things that **move a selector or a signal**, and things that **change how
something looks** — and the full set is roughly double a single session's
budget. The user accepted a split:

- **S16a (this session)** — structure. Navigation, pages, the scope model, the
  session-ID column, focus handling, the end-to-end migration.
- **S16b (a later session, planned separately)** — the visual system. One button
  and disclosure idiom, focus rings, sticky headers, tabular numerals,
  hierarchy, glyph text alternatives, and the headline total figure.

The order is deliberate and is not reversible: doing the visual pass first means
restyling three components that this session deletes or guts
(`view-switch.tsx`, `ModelPanel`'s close button, `TrendSection`'s disclosure),
and churning the end-to-end suite twice.

**S16a is strictly structural.** No new data, no new analysis, no new aggregate.
Specifically **not** in this session, by explicit user decision:

- The headline total figure. It is a second rendering of `report.totals` and
  nothing more, but it is a *presentation* change and it belongs to S16b.
- Any restyling beyond what new markup unavoidably needs, plus one minimal
  `:focus-visible` base rule (§6.6) so this session does not ship a navigation
  control that cannot be seen from the keyboard.
- Dark mode. The token set is light-only with hardcoded `rgba(0, 0, 0, …)`
  neutrals; re-deriving it with a contrast check is its own session. Recorded
  as deferred beyond v1.0.
- A settings screen. S21 owns it. The language switcher stays in the app bar.

### §0.1 The six decisions taken with the user

1. The split above is accepted; this plan covers S16a only.
2. Navigation is a **tab bar on its own row** under the app bar, four pages:
   Overview, Models, Trend, Prices.
3. Scope lives in a **persistent context bar** — grouping, date range and a
   named scope select — on every report page, writing the same
   `selectedGroups` signal the overview row already writes.
4. Session identity: the **title**, with the ID surviving in two places — as the
   title of an untitled session, and as a monospace line in the session detail
   header. US-2.2's column list is amended.
5. The headline total moves to S16b.
6. US-2.3 gains one new acceptance criterion (§2.2), verbatim as proposed.

### §0.2 LEARNINGS entries that shaped this plan

Each is cited again at the point where it bites; collected here so the
implementer and the reviewer can check them off.

- `String(n)` inside a `t()` placeholder passes every gate and breaks NFR-7 in
  German only → §6.5, §8.
- `querySelectorAll("th")` on an outer table also matches nested tables' headers
  → §7.1's column-count test.
- `hasAttribute("onclick")` is vacuous in Preact → §7.1's non-clickable-row
  test, which is behavioural and carries a positive control.
- A quoted English string in an e2e assertion is the translated-text trap in its
  easiest disguise → §7.2, every label assertion derives from the catalogue.
- `localZoneOffset` in an end-to-end test means the CI machine's zone → §7.2,
  no new date assertions.
- Optional props are how a plan's test silently goes unwritten → §5, no optional
  prop is introduced anywhere in this session.
- Amending a test because a change altered its inputs can silently delete the
  coverage the test existed for → §7.1's re-homing rule for the deleted
  `ModelPanel` / `TrendSection` tests.
- Preact keeps `false` for `data-*` and `aria-*` and drops it elsewhere →
  §6.1's `aria-current` / `data-page` attributes.
- `CostTotals` carries no session count, so any total sessions figure is
  necessarily derived → relevant only to S16b's headline total; recorded so
  that session does not rediscover it.

---

## §1 — The issues this session fixes, and the ones it hands on

Fifteen issues were found. This table is the complete list, so S16b's planner
does not have to re-derive it and the reviewer can tell deferral from omission.

| # | Issue | Kind | Session |
|---|-------|------|---------|
| D1 | Not one `:focus-visible` rule exists in the stylesheet; several controls have `background:none; border:none` and no visible focus at all | NFR-11 defect | S16b (minimal base in S16a, §6.6) |
| D2 | The scope control is a bare `○`/`✓` glyph labelled only by `aria-label`, and it drives both the model panel and the trend | usability defect | **S16a** |
| D3 | The whole `<tr>` carries an `onClick`, with no keyboard equivalent, no `cursor:pointer`, and a `closest("button")` guard against its own two nested buttons | usability defect | **S16a** |
| D4 | `⚠`, `ⓘ`, `≈` carry meaning only in a `title` attribute, which is not keyboard-reachable | NFR-11 defect | S16b |
| D5 | No sticky table headers; a 40-session project scrolls its header away | usability defect | S16b |
| D6 | The model panel squeezes the table and collapses below 1100px; the trend sits below a table thousands of pixels tall and is never seen | usability defect | **S16a** |
| D7 | Three different disclosure idioms, none with hover, active or focus styling | the user's complaint | S16b (one of the three is deleted in S16a) |
| D8 | Eight near-identical ad-hoc button rules, no hover, no `:active`, no `:disabled` | the user's complaint | S16b |
| D9 | The session-ID column costs a column in the app's widest table and tells nobody anything | the user's complaint | **S16a** |
| D10 | No `font-variant-numeric: tabular-nums`; digit columns ripple | cosmetic | S16b |
| D11 | `.app-shell` is `align-items:center` and the table is capped at 60rem while the toolbar is 100% — nothing lines up | cosmetic | S16b (a `.page` wrapper lands in S16a, §6.6) |
| D12 | No type hierarchy; `app-shell__subtitle` restates the title on every screen | cosmetic | S16b |
| D13 | The total is in a `<tfoot>` below N rows; the vision's five-second criterion is not met | usability defect | S16b (headline total) |
| D14 | The price page has no heading and keeps the gap strip and status bar describing a report it does not show | cosmetic | **S16a** (falls out of the page structure) |
| D15 | No dark mode; light-only tokens | deferred | beyond v1.0 |

---

## §2 — Document amendments (apply these exactly; do not improvise)

The implementer applies all three edits below. The reviewer checks them
character for character against this section — this is the text the user
approved, and it is the only text that may be written.

### §2.1 `REQUIREMENTS.md` — US-2.2, first acceptance criterion

**Find** (US-2.2 "Drill down to sessions", the first bullet):

```
- Clicking a project row expands an inline session table: session ID, title,
  requests, cost, output tokens, cache-read, duration, last activity.
```

**Replace with:**

```
- Clicking a project row expands an inline session table: title, requests, cost,
  output tokens, cache-read, duration, last activity. The session's directory ID
  is not a column of its own — it is shown in the session detail view and stands
  in as the title of an untitled session, so a row can still be correlated with
  its directory on disk.
```

### §2.2 `REQUIREMENTS.md` — US-2.3, one new acceptance criterion

**Append** as the last bullet of US-2.3's acceptance criteria, after
"Available both globally and scoped to a selected project or session.":

```
- The selected scope is visible and changeable wherever a scoped figure is
  shown, not only where it was selected.
```

Nothing else in US-2.3 changes. In particular, nothing in `REQUIREMENTS.md`
ever specified the model breakdown's *placement* — "beside the table" is a
statement in `CLAUDE.md` and in the S10 plan, not an acceptance criterion. The
S10 plan is a historical record and stays exactly as written.

### §2.3 `CLAUDE.md` — Architecture Rules

**Append** as rule 9, after rule 8 ("Failures are collected, not thrown"):

```
9. **Navigation is a signal, pages are components.** The active page lives in
   `state/app-state.ts` as `page` (`Page = "overview" | "models" | "trend" |
   "prices"`, S16a) and is not persisted — persistence of preferences belongs
   to the settings screen (S21), like `grouping`, the date range and
   `trendGranularity` before it. `runScan()` never touches it. A page change
   resets nothing: expansion, session expansion, sort, scope, grouping and
   range are all signals that survive both a navigation and a rescan. The
   model breakdown and the trend are pages, not panels docked to the overview
   (S16a supersedes S10's "beside the table" placement), and the scope they
   follow is set from a context bar visible on every report page.
```

### §2.4 `ROADMAP.md` — two table rows

**Insert** between the `S16` row and the `S17` row:

```
| S16a | UI/UX: navigation shell and scope | US-2.2 (amended), US-2.3, US-2.4, US-5.1, US-5.2, NFR-11 | S16 |
| S16b | UI/UX: visual system | NFR-11, NFR-7 | S16a |
```

### §2.5 `ROADMAP.md` — two body sections

**Insert** between the `### S16 — Dual cost display + transparency` section and
the `### S17 — Budgets` section:

```
### S16a — UI/UX: navigation shell and scope

**Goal.** A real page structure, and a scope the user can see and change.

**Scope.** The two-chip `ViewSwitch` becomes a four-page navigation — Overview,
Models, Trend, Prices — held in a `page` signal in `app-state.ts` (not
persisted; persistence belongs to S21's settings, like `grouping`, the range and
`trendGranularity` before it). The model breakdown and the trend move out of the
overview onto their own pages, and the scope they follow moves with them: a
persistent context bar carries grouping, date range and a named scope selector
on every report page, writing the same `selectedGroups` signal the overview row
already writes. The session-ID column is dropped — the ID survives in the
session detail and as the title of an untitled session. Navigation sets
`aria-current` and moves focus to the new page's heading.

**Exit.** `npm test`, `npm run build`, `npm run lint`, `npm run format:check`,
`npm run check:no-fake`, `npm run test:e2e`. A new `e2e/navigation.spec.ts`
asserts that expansion, sort, scope, grouping and range survive a round trip
through every page.

**Amends US-2.2.** The session-ID column is removed from the acceptance
criterion; the amendment was agreed in planning and is recorded in
`REQUIREMENTS.md`, not worked around in code. US-2.3 gains a criterion rather
than losing one: the selected scope must be visible and changeable wherever a
scoped figure is shown.

**Trap.** Seven of the eleven e2e specs move selectors. `grouping.spec.ts` is
the heavy one: its model-panel open/close test is deleted outright because the
control ceases to exist, and its four scope tests change what they drive. Before
deleting any test, check what property it was guarding and where that property
now lives — the scope-reset behaviour, for instance, re-homes to
`scope-select.test.tsx`.

### S16b — UI/UX: visual system

**Goal.** One coherent set of controls instead of eight ad-hoc ones.

**Scope.** A single `.c3p-btn` with variants replacing the eight near-identical
button rules; one disclosure idiom with hover, active and `:focus-visible`
states (before S16a there was not one `:focus-visible` rule in the stylesheet);
sticky table headers; `font-variant-numeric: tabular-nums` on every numeric
column; the `.page` wrapper finished so the toolbar and the table share an edge;
a `visually-hidden` text alternative for every `⚠` / `ⓘ` / `≈` glyph that
carries meaning only in a `title`; type scale and density; and **the headline
total figure** the vision's five-second criterion asks for — the active scope's
and period's total cost above the table, a second rendering of `report.totals`
and not a new aggregation. Note that `CostTotals` carries no session count, so
any session figure beside it comes from `report.sessions.length`, never a re-sum
of the group counts.

**Out of scope.** Dark mode: the token set is light-only with hardcoded
neutrals, and re-deriving it with a contrast check is its own session. The full
accessibility audit and the contrast measurement remain S21's.
```

---

## §3 — The page structure

```
┌──────────────────────────────────────────────────────────────┐
│ Claude3PCost                               [DE|EN]  v0.1.0   │  app bar
├──────────────────────────────────────────────────────────────┤
│ ▎Overview │  Models  │  Trend  │  Prices                     │  AppNav
├──────────────────────────────────────────────────────────────┤
│ Grouping [ Project │ Folder ]   Period [ This month ▾ ]      │  ContextBar
│ Scope    [ All projects                              ▾ ]     │  (not on Prices)
├──────────────────────────────────────────────────────────────┤
│ ⚠ 14 open requests · 3 archived sessions                     │  GapIndicators
│                                                              │  (Overview only)
│ <h1> Cost overview                                           │  page heading
│ Project           Sessions  Requests        Cost   Duration  │
│ ⌄ Nebula                41       132   612,40 USD   9 h 12 m │
├──────────────────────────────────────────────────────────────┤
│ 3 roots · 2 accounts · 150 sessions · last scan 14:02        │  StatusBar
└──────────────────────────────────────────────────────────────┘
```

Rejected alternative, recorded so it is not re-litigated: a **left rail**. It
scales past seven destinations, which this roadmap never reaches, and it costs
11–14rem of horizontal space — the one axis the session table (`min-width:
56rem`, already horizontally scrolling) cannot spare.

**Per page:**

| Page | Nav | ContextBar | GapIndicators | Body | StatusBar |
|------|-----|------------|---------------|------|-----------|
| Overview | ✔ | ✔ | ✔ | `OverviewTable` + `RecomputeNote` | ✔ |
| Models | ✔ | ✔ | — | `ModelPanel` | ✔ |
| Trend | ✔ | ✔ | — | `TrendSection` | ✔ |
| Prices | ✔ | — | — | `PriceTableEditor` | ✔ |

The gap strip stays on the Overview only: it explains the *report*, and
repeating it on three pages makes it furniture (the same reasoning S10 used for
zero-valued chips). The status bar stays everywhere — it answers "what do these
numbers cover", which is as true on the Models page as on the Overview, and
this also settles D14: the Prices page stops carrying a gap strip about a
report it does not show.

**The scanning / empty-state branches are unchanged in substance.** `app.tsx`
keeps S8's three branches, but they now govern the *report pages* only: Prices
renders regardless of scan state (it does today, and the price editor is usable
with no data at all). When there is no report, the report pages render
`EmptyState` as today, and the context bar is not rendered — there is nothing
to scope.

---

## §4 — The scope model (the hard part)

Today scope is the overview's selected group row, per grouping, in
`selectedGroups`. `ModelPanel` and `TrendSection` both follow it, and both are
rendered next to the control that sets it. Moving them onto their own pages
removes the control from view — at which point the feature silently degrades to
"whatever was selected last, with no way to tell or change it". That is the
failure mode this section exists to prevent.

**The rule: one scope concept, one signal, two affordances, always visible.**

- The signal stays `selectedGroups` (`Record<Grouping, string | null>`, `null`
  = global). No second scope concept is introduced. `ModelScope` / `TrendScope`
  stay exactly as they are.
- The **context bar's scope select** lists an all-scope option followed by one
  option per group, **in the report's own order** (the model already sorted
  them; no component re-sorts — the S8 §2 Q6 contract).
- The **overview row's scope control** stays, but gains a visible text label
  instead of being a bare glyph (D2). Both affordances write the same signal,
  so a scope set on the Overview shows on the Models page and vice versa.
- The scope select's all-option label depends on the grouping
  (`scope.allProjects` / `scope.allFolders`), because "All projects" is wrong
  under folder grouping.
- When the stored key names a group that does not exist under the current
  grouping (or vanished after a rescan), the select falls back to the
  all-option and **does not** write the signal. `findGroup` already degrades
  this way for the panel; the select must agree with it rather than invent a
  second rule. Pinned by a unit test (§7.1).
- Scope is **not** pruned on a rescan, exactly as today. `runScan()` touches
  none of these signals.

**A consequence to state plainly:** the grouping toggle now appears on the
Models and Trend pages, where it changes which set of groups the scope select
offers rather than a visible table. That is honest — scope has always been
per-grouping — and it is why the fallback rule above needs a test rather than a
comment.

Rejected alternatives:

- *Scope control only on Models/Trend, with the overview row button becoming a
  "show models for this project" navigation action.* Attractive, but it couples
  selection to navigation: you could not change scope without leaving the page
  you are on.
- *Drop scope-following; global breakdown only.* Silently degrades US-2.3's
  "available both globally and scoped to a selected project", which the
  session's boundary forbids and which §2.2 now strengthens rather than
  weakens.

---

## §5 — Layer boundaries and signatures

No new model code. `src/model/` is untouched by this session. No service
changes. Everything below is `src/state/`, `src/components/`, `src/i18n/` and
`src/styles/`.

**No optional props are introduced anywhere in this session.** Every prop added
below is required, and every prop removed is removed rather than defaulted.
That is deliberate: an optional prop lets the call-site fan-out — and with it
the tests a plan asked for — silently not happen (LEARNINGS).

### §5.1 `src/state/app-state.ts`

```ts
/** S16a: the four pages. Replaces S15's two-value `View`. */
export type Page = "overview" | "models" | "trend" | "prices";

/** Default "overview". Not persisted (see CLAUDE.md rule 9). Never touched by runScan(). */
export const page: Signal<Page>;

export function setPage(next: Page): void;

/** Absolute scope assignment, for the context bar's select.
 *  `toggleGroupScope` (same-key -> null) stays, for the overview row control. */
export function setGroupScope(g: Grouping, key: string | null): void;
```

**Removed:** `View`, `view`, `setView`, `modelPanelOpen`, `setModelPanelOpen`,
`trendOpen`, `setTrendOpen`.

`view` is *renamed*, not merely widened, because the two-chip `ViewSwitch` it
was named for is deleted; leaving the name would misdescribe what the signal is.

`modelPanelOpen` and `trendOpen` go because a page cannot be closed. Removing
them is not a loss of function: the affordance they provided — "get this out of
the way so I can read the table" — is exactly what a separate page provides.

### §5.2 `src/components/app-nav.tsx` (new)

```tsx
export interface AppNavProps {
  readonly page: Page;
  readonly onNavigate: (next: Page) => void;
}
```

A `<nav>` containing four `<button type="button">`s, each with
`data-testid={`nav-${key}`}` and `aria-current={active ? "page" : undefined}`.

Deliberately **not** `role="tablist"` / `role="tab"`: the pages are not tab
panels of one document, and the roving-tabindex semantics a tablist promises
would be a lie about how the control behaves. Four buttons in a labelled `<nav>`
are keyboard-operable by default and need no JavaScript key handling.

`aria-current` carries the active state, not colour alone (NFR-11). Note the
Preact attribute rule from LEARNINGS: `false` survives on `aria-*`/`data-*` and
is dropped elsewhere — `aria-current` is therefore set to `undefined` when
inactive (so the attribute is absent, which is what `aria-current` means), and
the parallel `data-page` attribute is used where a test wants a value in both
states.

### §5.3 `src/components/scope-select.tsx` (new)

```tsx
export interface ScopeOption {
  readonly key: string;
  readonly label: string;
}

export interface ScopeSelectProps {
  /** Report order. Never re-sorted here (S8 §2 Q6). */
  readonly options: readonly ScopeOption[];
  /** null = the global scope. */
  readonly selectedKey: string | null;
  readonly onChange: (key: string | null) => void;
  /** Drives the all-option's label: "All projects" vs "All folders". */
  readonly grouping: Grouping;
}
```

Its own file, and its own test file, rather than being folded into
`ContextBar` — LEARNINGS: a change folded into an existing component is how a
planned test goes unwritten.

The all-option's value is the empty string; `onChange` maps `""` to `null`. A
group key can be `"\\u0000none"` (the no-project / no-folder sentinel), which is
a legal `<option value>` and round-trips through the DOM unchanged — but note
that it cannot be selected by a CSS attribute selector (LEARNINGS: CSS
tokenisation replaces NUL with U+FFFD). Tests address it by index or through
`toHaveAttribute`, never by a CSS value selector. **No new `U+0000` is written
into any source file**; the sentinel is referenced through the existing
`NO_FOLDER_KEY` / `projectKey` exports.

### §5.4 `src/components/context-bar.tsx` (new)

```tsx
export interface ContextBarProps {
  readonly grouping: Grouping;
  readonly onGrouping: (next: Grouping) => void;
  /** The existing S13 prop bundle, threaded through unchanged. */
  readonly range: DateRangeFilterProps;
  readonly scopeOptions: readonly ScopeOption[];
  readonly selectedScopeKey: string | null;
  readonly onScope: (key: string | null) => void;
}
```

Props only, no signal reads — the `GroupingToggle` / `ModelPanel` contract.
Composes `GroupingToggle`, `DateRangeFilter` and `ScopeSelect`. Renders the
scope select only when `scopeOptions` is non-empty.

### §5.5 Changed component signatures

```tsx
// model-panel.tsx — `onClose` and `onResetScope` REMOVED.
export interface ModelPanelProps {
  readonly breakdown: ModelBreakdown;
  readonly totals: CostTotals;
  readonly scope: ModelScope;
}

// trend-section.tsx — `open`, `onToggleOpen` and `onResetScope` REMOVED.
export interface TrendSectionProps {
  readonly series: TrendSeries;
  readonly granularity: Granularity;
  readonly scope: TrendScope;
  readonly onGranularity: (g: Granularity) => void;
}
```

Both keep their `scope` prop and both keep rendering their scope *label*
(`models.scopeLabel` / `trend.scopeLabel`) as a line under the page heading —
the page states what it is showing. What they lose is the scope *reset control*,
which the context bar now owns. `ModelPanel`'s `data-scope` and `data-scope-key`
attributes stay (several e2e assertions depend on them, and they remain the
honest way to assert scope without reading translated text).

`ModelPanel` becomes a `<section>` rather than an `<aside>`: on its own page it
is the main content, and `aside` would be wrong.

`SessionTableProps` and `OverviewTableProps` are unchanged in shape. Note
`SessionTableProps.sessionRecomputations` is currently optional (`?:`) — S16
left it that way. This session does **not** tidy that: changing it is unrelated
fan-out, and the no-optional-props rule above governs props this session adds.

---

## §6 — Implementation, file by file

### §6.1 `src/app.tsx`

Dispatch on `page.value`. Each page renders an `<h1 tabIndex={-1}
data-testid="page-heading">`.

Focus handling on navigation (NFR-11), and the precise rule:

```tsx
const headingRef = useRef<HTMLHeadingElement | null>(null);
const previousPage = useRef<Page | null>(null);

useEffect(() => {
  if (previousPage.current !== null && previousPage.current !== page.value) {
    headingRef.current?.focus();
  }
  previousPage.current = page.value;
}, [page.value]);
```

The `previousPage.current !== null` guard is load-bearing: focusing a heading on
first mount would move a screen reader off the document start for no reason.
The guard is what the "does not move focus on first mount" test pins.

The report-page branches keep S8's structure (no report → `EmptyState`;
scanning → the `scan-running` indicator alongside whatever is renderable;
`scanState === "done"` with zero groups → `EmptyState`). `scanState === "failed"`
still falls into the idle branch — an explicit S21 deferral, carried forward
unchanged, not re-opened here.

### §6.2 `src/components/session-table.tsx`

- Remove the `cell-session-id` column from `COLUMNS` (9 → 8) and the
  corresponding `<td>`. Remove `"session.columnId"` from `ColumnLabelKey`.
- The detail row's `colSpan` goes 9 → 8. Derive it from `COLUMNS.length` rather
  than hardcoding, so the next column change cannot silently desynchronise it.
- Untitled fallback: `session.title === ""` renders the session ID in a
  `<span class="session-table__id">` (the class survives the column's removal
  and finds its new home here) instead of `t("session.untitled")`.
  `session.untitled` is **kept** in both catalogues only if another call site
  uses it; the implementer greps, and removes the key if this was the only one.
- `data-session-id` on the row is untouched.

### §6.3 `src/components/session-detail.tsx`

Add, inside `.session-detail__header`, a monospace line
`<span data-testid="detail-session-id" class="session-table__id">` rendering
`t("detail.sessionId", { id: session.sessionId })`.

Privacy check (NFR-6): a session ID is a directory name, which `MAP.md` and
`Problem` already classify as non-sensitive (`scope` is "a session directory
name, never a path"). A path would not be permissible here; an ID is.

### §6.4 `src/components/overview-table.tsx`

- Remove the `<tr onClick>` handler and the `closest("button")` guard (D3).
- The disclosure `<button>` wraps the group label text, so the whole label cell
  is one hit target. The scope control stays a sibling button — it must not be
  nested inside the disclosure button.
- The scope control gains visible text (`scope.rowButton`) beside its `✓`/`○`
  glyph. It keeps `aria-pressed` and its existing `models.selectScope` /
  `models.clearScope` aria-labels.

### §6.5 `src/i18n/de.ts` and `src/i18n/en.ts`

`de.ts` is the source of truth; `en.ts` is
`as const satisfies Record<TranslationKey, string>`. Key parity is enforced by
`tsc` alone — a missing key is TS1360, an extra key TS2353.

**Add:**

| Key | de | en |
|-----|----|----|
| `nav.label` | `Navigation` | `Navigation` |
| `nav.overview` | `Übersicht` | `Overview` |
| `nav.models` | `Modelle` | `Models` |
| `nav.trend` | `Verlauf` | `Trend` |
| `nav.prices` | `Preise` | `Prices` |
| `scope.label` | `Bereich` | `Scope` |
| `scope.allProjects` | `Alle Projekte` | `All projects` |
| `scope.allFolders` | `Alle Ordner` | `All folders` |
| `scope.rowButton` | `Bereich` | `Scope` |
| `detail.sessionId` | `Sitzungs-ID: {id}` | `Session ID: {id}` |
| `overview.heading` | `Kostenübersicht` | `Cost overview` |

`models.heading` ("Kosten nach Modell" / "Cost by model") and `trend.heading`
("Verlauf" / "Trend") already exist and become the Models and Trend page
headings. For the Prices page heading the implementer **greps
`price-table-editor.tsx` for an existing heading key first** and reuses it;
only if there is none does a `prices.heading` ("Preistabelle" / "Price table")
get added. Two keys for one heading is exactly the drift NFR-7 exists to
prevent.

**Remove:** `view.label`, `view.overview`, `view.prices`, `models.openPanel`,
`models.closePanel`, `trend.collapse`, `trend.expand`, `session.columnId`, and
`session.untitled` **if and only if** §6.2's grep finds no other call site.

**Keep:** `models.scopeLabel`, `models.scopeAll`, `models.selectScope`,
`models.clearScope`, `trend.scopeLabel`, `trend.scopeAll`, `trend.clearScope`
(the last is the overview row control's "reset" aria-label and still applies).

**NFR-7 trap (LEARNINGS).** `detail.sessionId` is the only new key with a
placeholder, and its `{id}` is a hex directory name — a string, correctly not a
number. No new count-style key is introduced. The implementer nevertheless runs
`grep -rn "String(" src/components src/app.tsx` before declaring done: a
`String(n)` inside a `t()` placeholder passes lint, `tsc` and the whole suite
and breaks NFR-7 in German only.

### §6.6 `src/styles/index.css`

Minimum needed to make this session's markup work and legible. The system is
S16b's.

- `.app-nav` / `.app-nav button` / `.app-nav button[aria-current="page"]`.
- `.context-bar` and `.context-bar__scope`.
- `.page` — one wrapper with a `max-width` and `align-items: stretch`, replacing
  `.app-shell`'s `align-items: center` for the content column, so the context
  bar and the table share an edge (D11, partially; S16b finishes it).
- **One minimal `:focus-visible` base** — a `--c3p-focus` token and a
  `:focus-visible { outline: 2px solid var(--c3p-focus); outline-offset: 2px; }`
  rule applying at least to the nav, the context bar and the disclosures. This
  session must not ship a navigation control that cannot be seen from the
  keyboard (D1); S16b widens it to every control and adds hover/active states.
- Delete `.view-switch` and `.model-panel-open`; adapt `.content-grid` (the
  two-column grid has no remaining user — remove it and its media query rather
  than leaving dead rules).

### §6.7 Deletions

- `src/components/view-switch.tsx` — deleted. It has no test file of its own
  (verified); its behaviour was covered only through e2e, which §7.2 re-homes.

---

## §7 — Tests

### §7.1 Unit tests (Vitest)

Query by accessible role where one exists, `data-testid` otherwise, **never by
translated text**. Where a test must assert a label, it derives the expected
string from the catalogue (`translate("en", "nav.prices")`), never a quoted
English literal.

**`src/components/app-nav.test.tsx`** (new)
- `"renders one nav item per page, in the declared order"`
- `"marks only the active page with aria-current"`
- `"calls onNavigate with the clicked page key"`
- `"labels each item from the catalogue"` — catalogue-derived, not a quoted
  English string (LEARNINGS)

**`src/components/scope-select.test.tsx`** (new)
- `"lists an all-scope option followed by one option per group, in the order given"`
- `"selects the option matching the current scope key"`
- `"calls onChange with null when the all-scope option is chosen"`
- `"calls onChange with the group key when a group is chosen"`
- `"falls back to the all-scope option when the selected key is not among the options"`
- `"labels the all-scope option by grouping"` — one case per grouping, asserting
  the two labels differ and each matches its catalogue key

**`src/components/context-bar.test.tsx`** (new)
- `"renders the grouping toggle, the range filter and the scope select"`
- `"omits the scope select when there are no groups"`

**`src/app.test.tsx`** (new — `app.tsx` has no unit test today)
- `"renders only the active page's content"`
- `"moves focus to the page heading after a navigation"`
- `"does not move focus on first mount"`

**`src/state/app-state.test.ts`** (extend)
- `"page defaults to overview"`
- `"setPage changes the page"`
- `"navigating does not reset expansion, session expansion, sort, scope, grouping or range"`
  — the load-bearing test of this session. It sets all six to **non-default**
  values, navigates through every page and back, and asserts all six unchanged.
  Non-default is essential: a test that navigates from a pristine state agrees
  with a bug that resets everything to the default.
- `"setGroupScope sets and clears the scope of one grouping without touching the other"`

**`src/components/session-table.test.tsx`** (amend)
- `"renders eight columns"` — counted with
  `querySelectorAll(":scope > thead > tr > th")`. LEARNINGS: a bare
  `querySelectorAll("th")` on this table also matches the nested detail tables'
  headers and inflates the count, which is how a `colSpan` assertion passes
  against the wrong number.
- `"renders no session-id cell"`
- `"uses the session id as the title of an untitled session"`
- `"the detail row spans every column"` — `colSpan` compared against the same
  derived column count, not a literal

**`src/components/overview-table.test.tsx`** (amend)
- `"expands when the disclosure is activated"` — the positive control
- `"does not expand when a non-disclosure cell is clicked"` — **behavioural**:
  click the cost cell, assert the expansion callback was not called and no
  session table appeared. LEARNINGS: `expect(el.hasAttribute("onclick")).toBe(false)`
  is vacuous in Preact — JSX handlers are attached with `addEventListener` and
  never produce a content attribute — so an attribute assertion here would
  certify exactly the boundary it was written to guard. The positive control
  above is what makes the negative one meaningful.
- `"labels the scope control with visible text as well as an aria-label"`

**`src/components/model-panel.test.tsx`** and
**`src/components/trend-section.test.tsx`** (amend)

Delete the close-button, disclosure and scope-reset tests — but **before
deleting each one, identify the property it was guarding and say where that
property now lives** (LEARNINGS: amending a test because a change altered its
inputs can silently delete the coverage it existed for). The expected re-homing:

| Deleted test guards | Now lives in |
|---|---|
| the scope reset returns to the global scope | `scope-select.test.tsx` → `"calls onChange with null when the all-scope option is chosen"` |
| the panel can be hidden and shown again | nothing — the property ceases to exist with the control; recorded here as a deliberate removal, not an oversight |
| the trend's collapsed state hides the table | as above |

Both files keep their scope-label tests: the label is still rendered.

### §7.2 End-to-end (Playwright), spec by spec

Seven of eleven specs change. Assert on `data-testid` and attributes;
catalogue-derived strings only; **no new date assertions** — LEARNINGS:
`localZoneOffset` in an e2e test means the CI machine's zone, so a
zone-sensitive assertion belongs in a unit test with an injected resolver.

| Spec | Change |
|---|---|
| `e2e/navigation.spec.ts` | **New.** `"expansion and sort survive a round trip through every page"`; `"the active page carries aria-current"`; `"the nav is reachable and operable from the keyboard"`; `"a scope chosen on the overview is shown on the models page"`; `"a scope chosen on the models page selects the overview row"` |
| `e2e/grouping.spec.ts` (15 tests) | The heaviest. `"the model panel can be closed and reopened"` is **deleted** — the control ceases to exist. The four scope tests navigate to the Models page or drive the context bar's select; `scope-reset` → the select's all-option. The grouping and gap-strip tests are otherwise unchanged. |
| `e2e/trend.spec.ts` (4 tests) | Each gains a navigation to the Trend page. Granularity and row locators unchanged. No new date assertions. |
| `e2e/dual-cost.spec.ts` (2 tests) | `view-prices` / `view-overview` → `nav-prices` / `nav-overview` (4 call sites) |
| `e2e/prices.spec.ts` (8 tests) | Same testid rename; the catalogue-derived label assertion at `:209` retargets `view.prices` → `nav.prices` |
| `e2e/drilldown.spec.ts` (8 tests) | Reviewed for column-index and column-count assumptions. No spec references `cell-session-id` (verified during planning), so the column removal itself costs nothing here. |
| `e2e/session-detail.spec.ts` (5 tests) | As above; gains an assertion that `detail-session-id` is present |
| `e2e/overview.spec.ts` (7 tests) | Reviewed for column assumptions |
| `e2e/date-range.spec.ts`, `e2e/tool-usage.spec.ts`, `e2e/harness.spec.ts` | Expected **untouched**. If any of them needs a change, that is a signal the context bar moved something it should not have — stop and report rather than adapting the spec. |

---

## §8 — Definition of done

```
npm test
npm run build
npm run lint
npm run format:check
npm run check:no-fake
npm run test:e2e
```

All six green. Plus, by hand:

1. `grep -rn "String(" src/components src/app.tsx` — no new hit inside a `t()`
   placeholder (LEARNINGS, NFR-7).
2. The NUL-byte scan over `src plugins scripts e2e test`, in the form LEARNINGS
   records as the working one — no new `U+0000` is written by this session, and
   the scan's one permanent legitimate hit is
   `test/fixtures/utf16le-lines.bin`.
3. `grep -rn "view-overview\|view-prices\|view-switch\|modelPanelOpen\|trendOpen\|session.columnId" src e2e`
   — no hits. A leftover is a rename that only half happened.
4. The three document edits of §2 applied verbatim.

`npm run check:no-fake` is in the list although no fake changes shape this
session; it is cheap and CI runs it between `build` and `test:e2e` anyway. Its
**negative control is deliberately not re-run** — LEARNINGS requires that when a
fake changes shape, and none does here. If the implementer finds themselves
touching `e2e/support/fake-*.ts`, that assumption has broken and the control
must be run.

`npm run regression` is unaffected: `src/model/` is untouched, and the
reference-tree constants (1,413,585,188 micro-USD, 150 sessions, 508 requests,
7 projects, 26 folder groups) cannot move in a session that changes no model
code. If they move, something is wrong that this plan did not anticipate.

## §9 — Explicitly deferred by this session

- Everything in §1 marked S16b, including the headline total.
- S21's full accessibility audit, contrast measurement, and the collected-problems
  list (which still needs `MAX_PROBLEMS_PER_SCOPE`'s flat global cap replaced
  first — unchanged by this session).
- `scanState === "failed"` remaining indistinguishable from idle (S21).
- Dark mode, beyond v1.0.
- Persistence of any preference signal, including `page` — S21's settings screen.
