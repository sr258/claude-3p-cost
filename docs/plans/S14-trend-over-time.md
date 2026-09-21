# S14 — Trend over time

**Stories.** US-5.2 (`SHOULD`). Carried alongside: NFR-7 (every new string
through both catalogues, every number and date through `Intl`), NFR-11 (keyboard
operation, no state by colour alone), NFR-9 (this session's own Playwright
spec), NFR-3 (nothing here throws), NFR-6 (no new field carries a path, an id or
free text), NFR-2 (a granularity or scope change re-reads no file — it does not
even re-run `buildReport`).
**Depends on.** S13 (the filtered `Report`, `Report.range`, `dayStringsOf`, the
toolbar row), S10 (`selectedGroups`, `ModelPanel`'s scope idiom,
`GroupingToggle`'s segmented control), S9/S8 (`OverviewTable`, the Playwright
harness), S5 (`TimeBucket`, `UndatedTotals`, `ZoneOffsetResolver`), S2
(`src/i18n/`).
**Feeds.** S18 (charts) — the *data shape* is the real deliverable of this
session. `TrendSeries.points` is exactly the array a chart will consume.
**Status.** Planned 2026-09-21. Approved by the user; all nine design questions
are decided below and none is left open.

**Goal.** Cost per day and per calendar month, as tables, scoped either to all
projects or to one selected project (or folder), with days that have no activity
rendered as explicit zeros so the axis stays linear.

---

## 0. Read this first

### 0.1 What this session is really for

The roadmap says it plainly: *"Tables only. Charts are S18 — the data shape must
be right before anything is drawn on it."* Every decision below is therefore
biased towards a series a chart can draw without reinterpretation: ascending by
key, one cost per point, no gaps, no clock dependency, and a documented,
bounded behaviour when the span is absurd.

### 0.2 What is already in place

- `Report.byDay` / `Report.byMonth` already exist (S5) and are already filtered
  by the active range (S13). **S14 is their first consumer.** Since S13 they are
  **local-zone** buckets in the running app (UTC only in unit tests that inject
  no zone) — see the S13 plan §2 Q2.
- `SessionRow.requests` (S11) holds every surviving `result` record of a
  session, with `timestamp`, `costMicroUsd` and `durationMs`. A scoped series
  can therefore be derived from rows alone, with no rescan and no second pass
  over the filesystem.
- `selectedGroups` (S10) already gives "global, or one group", and `ModelPanel`
  already follows it. The trend section reuses that scope rather than inventing
  a second one.
- `ZoneOffsetResolver` is injected everywhere buckets are computed;
  `localZoneOffset` (S13, `src/services/zone.ts`) is what the app passes.

### 0.3 Traps from LEARNINGS that apply directly

1. **"A 'sums to N' invariant over two views derived from one array is a
   tautology."** This is the central trap of this session. The trend series and
   the report totals are both derived from the same `SessionRow.requests`
   arrays, so `sum(points.cost) + undated === totals.costMicroUsd` holds by
   construction whether the bucketing rule is right or wrong. **Every trend test
   pins concrete per-bucket values** from a fixture built so that a wrong rule
   (UTC instead of the injected zone, an off-by-one fill window) yields a
   *different key set*, not merely a different distribution.
2. **"A zone test using instants at 00:30 UTC passes under any constant
   offset."** The bucketing fixtures use instants near **local** midnight under
   an injected non-default offset.
3. **"An injectable dependency whose default agrees with the injection on every
   fixture is untested by construction."** `buildTrend`'s `zone` is exercised
   with **+13:45**, a value no default can produce (the same trick S13 used).
4. **"A quoted English string in an e2e assertion is the translated-text trap in
   its easiest disguise."** Every string assertion in `e2e/trend.spec.ts` comes
   from `translate()` / `formatCurrency` / `formatDate` / `formatPercent`. Grep
   the finished spec for quoted English words before calling the session done.
5. **`Intl` emits U+00A0, and `no-irregular-whitespace` will not catch it inside
   a string literal.** Derive every expected currency/percent/date string from
   the formatter; never type one out.
6. **`querySelectorAll("th")` on an outer table also matches nested tables'
   headers.** Any column-count assertion uses `:scope > thead > tr > th`.
7. **Preact keeps `false` for `data-*` and drops it elsewhere.** The zero-day
   marker is deliberately a `data-` name (`data-zero`), and **both** branches
   (`"true"` and `"false"`) are asserted.
8. **`localeCompare` and any clock read are banned in `src/model/`.**
   `buildTrend` takes `zone` and an explicit `DateRange`; it never reads
   `Date.now()`. `new Date(epochMs)` / `Date.UTC(...)` remain allowed —
   deterministic functions of their arguments, as `time-buckets.ts` documents.
9. **A raw `U+0000` must never enter a source file.** §8's ripgrep scan is part
   of the exit set, and its one legitimate hit is
   `test/fixtures/utf16le-lines.bin`.

---

## 1. Shape of the change

```
  Report (already filtered by the active range — S13)
        │
        ├─ report.sessions            ──┐
        └─ group.sessions (selected)  ──┤  rows: readonly SessionRow[]
                                        │
                                        ▼
        buildTrend(rows, granularity, zone, report.range)   ← pure, src/model/
                                        │
                                        ▼
                                  TrendSeries
                                        │
                                        ▼
                     <TrendSection>  (collapsible, full width,
                                      below the overview grid)

  buildReport ── byDay / byMonth / undated now come from bucketRows(rows, …)
                 (one implementation of the bucketing rule, Q9)
```

Nothing re-reads a file. A granularity change, a scope change or a collapse is a
re-render over data already in the report (NFR-2).

---

## 2. Design questions, all decided

### Q1 — Where does the trend live? → a collapsible full-width section below the overview table

Rejected: a view switcher (`Übersicht | Trend`) that swaps the content area, and
a second panel in the right-hand column.

A view switcher introduces a navigation concept the app does not have, and a
data-shape session is the wrong place to invent one; it also pushes the date
filter, the grouping toggle and the group-row selection off-screen, which is
precisely what Q2's scope decision depends on. S18 then has to satisfy US-3.3's
*"every chart keeps its tabular equivalent visible on the same screen"* — easier
in one scrolling screen than across two views. The right-hand column is narrow
and the day table is the widest, longest thing on the page.

### Q2 — How is the scope selected? → reuse the existing group-row selection

`selectedGroups` (S10) already means "global, or one group", is already
per-grouping, and `ModelPanel` already follows it. A separate dropdown would be
a second scope concept on one screen, with a guaranteed divergence the first
time the user selects a project row while the dropdown says something else.

The trend header therefore carries the same affordance `ModelPanel` uses: a
scope label and an "Auswahl aufheben" button (absent when the scope is already
"all"), so the scope is never invisible.

**Bonus, accepted deliberately:** under the folder grouping the scope is a
*folder*, not a project. US-5.2 asks for "all projects or one project"; a folder
scope is a superset and costs nothing.

### Q3 — Day and month at once, or a toggle? → a segmented `[Tag | Monat]` control, default month

One table at a time. The day table is potentially hundreds of rows and would
bury everything below a permanently-visible month table. Month is the default:
fewer rows, and "is this month worse than last" is the reading US-5.2 is written
for. The control copies `GroupingToggle`'s pattern and CSS (`role="radiogroup"`,
arrow keys move, Space selects) rather than inventing a second idiom, and it is
the control S18's chart will hang its series selection off.

### Q4 — What does the zero-fill window span? → bounded range pins that end; unbounded falls back to observed

Per side: if `range.fromMs !== null`, the window starts at the range's first
day/month; otherwise at the first observed bucket. If `range.toMs !== null`, the
window ends at the range's **last included** day/month (see §4.1's
implementation note); otherwise at the last observed bucket.

Rejected: padding to "today". It would require a clock read injected into a pure
function to produce rows that say nothing (the data simply ends), and it makes
the table silently grow at midnight with the app open — the same objection S13
recorded against a to-date preset (S13 plan §2 Q14).

Not padding to the range bounds was also rejected: a March filter on data that
ends on 20 March would otherwise rescale the axis and hide eleven zero days,
which is exactly the criterion's *"days without activity appear as zero, not as
gaps"*.

### Q5 — Is the generated series capped? → yes, `MAX_TREND_POINTS = 1100`

The parser accepts any timestamp `Date.parse` reads. A single malformed-but-
parseable record in 1970 or 2999 would make a day fill generate hundreds of
thousands of rows and hang the UI. When the fill window would exceed
`MAX_TREND_POINTS` (~3 years of days), `buildTrend` returns the **observed
buckets unchanged** with `filled: false`, and the UI renders a note.

Rejected: no cap (hangs), and truncating to the most recent N buckets (silently
hides data that exists). Degrade and say so; never drop a bucket that has data
(NFR-3's spirit). Month fill is capped by the same constant and cannot
realistically reach it.

### Q6 — Row order? → newest first in the table; `points` stays ascending in the model

A table is read from the top and the user's question is "what happened
recently". The linear-axis criterion is about the *series*, which stays
ascending so S18 can draw it unchanged. The reversal is a UI-level concern only:
`TrendSeries.points` is ascending, always, and the component reverses for
display. `deltaRatio` is computed against the **previous point in the ascending
array**, i.e. the row *below* it on screen.

### Q7 — A change-vs-previous-bucket column? → yes

US-5.2's motivation is "so that I notice unusual increases", which a raw cost
column only implies. `deltaRatio` is `null` for the first point and whenever the
previous bucket's cost is `0` — **never `Infinity`, never `NaN`** — and renders
as an em dash in that case. Direction is carried by the sign in the text *and*
by `data-delta="up" | "down" | "flat" | "none"`, never by colour alone
(NFR-11).

It is also the first thing to drop if the session overruns — see §9.

### Q8 — Undated requests? → a footnote row, only when non-zero

A request whose timestamp will not parse cannot truthfully be placed in any
bucket, and omitting it silently would make the trend's total disagree with the
overview total. `buildTrend` returns a **scoped** `UndatedTotals` (the global
`Report.undated` is the wrong figure once a group is selected), and the section
renders a footnote row with its cost and count whenever it is non-zero.

Note the interaction with S13: under a bounded range, undated requests are
excluded from the report entirely (S13 Q9), so the footnote can only appear
under `ALL_TIME` — but the component must not assume that, and the test is
written against `buildTrend`'s output, not against a range.

### Q9 — De-duplicate `Report.byDay` / `byMonth` against `bucketRows`? → yes, one implementation

`buildSessionRow` currently accumulates `dayMap` / `monthMap` / `undated` inline
while it filters. `bucketRows(rows, …)` computes the same thing from
`SessionRow.requests`. Two implementations of one rule are free to drift, and
S18 and S19 will both lean on the rule.

`buildReport` therefore computes `byDay` / `byMonth` / `undated` from
`bucketRows` over the built rows, and the inline accumulation is deleted.

**Guard rails, all mandatory:**

- The buckets are computed from the rows array **before** the S13 zero-request
  drop. (Today's behaviour is equivalent either way — a dropped row has no
  surviving requests, and undated requests are already excluded under any
  bounded range — but the ordering is pinned by test 14 so a future change to
  the drop rule cannot silently move the buckets.)
- `reference-distribution.test.ts` and the whole existing `report.test.ts` must
  pass **untouched**. They pin totals and counts, never a bucket key, so they
  are a real regression net for the refactor.
- The new `byDay` test (test 13) pins **hand-computed bucket values**, not an
  equality against `bucketRows` — an equality between the new implementation and
  itself is the §0.3 item 1 tautology in its purest form.

This refactor is the second thing to drop if the session overruns — see §9.

---

## 3. Acceptance criteria: satisfied and deferred

**Satisfied in S14.**

| US-5.2 criterion | How |
|---|---|
| Cost per day and per calendar month, **as a table** | `TrendSection` + the `[Tag \| Monat]` granularity control (§4.3) |
| Selectable scope: all projects or one project | The existing group-row selection (Q2); folder scope comes along free |
| Days without activity appear as zero, not as gaps, so the axis stays linear | `buildTrend`'s fill (Q4), `TrendPoint.isZero`, `data-zero`, capped by `MAX_TREND_POINTS` (Q5) |

**Explicitly deferred, with the hook named.**

- **"…and a chart" (the second half of criterion 1) → S18.** The roadmap's own
  instruction: *"Tables only. Charts are S18 — the data shape must be right
  before anything is drawn on it."* `TrendSeries.points` is precisely the array
  a chart consumes: ascending by key, zero-filled, one cost per point, with no
  gaps to interpolate and no clock dependency. **S14 renders no chart and adds
  no charting dependency**, and the charting-library decision stays S18's first
  deliverable.
- **Persisting granularity, scope and the collapsed state → the settings screen
  (S15+/S21).** Same reasoning S10 recorded for `grouping` (S10 plan §2 Q6) and
  S13 for the range (S13 plan §2 Q12): a third ad-hoc `localStorage` key now is
  a migration later.
- **Exporting the series → S19.** It reads `Report.range` from the report object
  and can call `buildTrend` itself; S14 writes no export.
- **Budget overlays on the trend → S17.** Nothing budget-shaped is built here.

---

## 4. Files and signatures

### 4.1 `src/model/trend.ts` — new, pure

No i18n import, no DOM, no clock. Zone and range are parameters.

```ts
import type { DateRange } from "./date-range.js";
import type { SessionRow, TimeBucket, UndatedTotals } from "./report-types.js";
import type { ZoneOffsetResolver } from "./time-buckets.js";

export type Granularity = "day" | "month";

/** Max points a FILLED series may contain (Q5). ~3 years of days. */
export const MAX_TREND_POINTS = 1100;

export interface TrendPoint extends TimeBucket {
  /** True when this point was generated by gap-filling (no data at all). */
  readonly isZero: boolean;
  /**
   * (cost - prevCost) / prevCost against the PREVIOUS point in the ascending
   * array. null for the first point and whenever the previous cost is 0 —
   * never Infinity, never NaN (Q7).
   */
  readonly deltaRatio: number | null;
  /** cost / series costMicroUsd; 0 when the series total is 0. */
  readonly share: number;
}

export interface TrendSeries {
  readonly granularity: Granularity;
  /** Key ascending, ALWAYS — the UI reverses for display (Q6). Frozen. */
  readonly points: readonly TrendPoint[];
  /** Sum over points. NOT authoritative on its own — see `undated`. */
  readonly costMicroUsd: number;
  readonly requests: number;
  /** Scoped undated requests; they belong to no bucket (Q8). */
  readonly undated: UndatedTotals;
  /** False when the fill window would exceed MAX_TREND_POINTS (Q5). */
  readonly filled: boolean;
}

/**
 * Observed buckets only, key ascending. The single bucketing rule — also what
 * `buildReport` uses for `byDay` / `byMonth` / `undated` (Q9).
 */
export function bucketRows(
  rows: readonly SessionRow[],
  granularity: Granularity,
  zone: ZoneOffsetResolver,
): { readonly buckets: readonly TimeBucket[]; readonly undated: UndatedTotals };

/**
 * The display series: buckets, zero-filled across the window, with `share` and
 * `deltaRatio`. `range` decides the window ends (Q4): a bounded side pins that
 * end, an unbounded side falls back to the first/last observed bucket. Returns
 * `filled: false` and the observed buckets unchanged when the window would
 * exceed MAX_TREND_POINTS.
 */
export function buildTrend(
  rows: readonly SessionRow[],
  granularity: Granularity,
  zone: ZoneOffsetResolver,
  range: DateRange,
): TrendSeries;

/** "2026-09-17" -> "2026-09-18"; "2026-12" -> "2027-01". Pure calendar arithmetic. */
export function nextKey(key: string, granularity: Granularity): string;
```

**Implementation notes — each of these is a trap, not a preference.**

1. **Day-key arithmetic is never shifted by `zone` a second time.** A key is
   already expressed in the resolved zone. Stepping to the next day is
   `Date.UTC(y, m - 1, d + 1)` read back with the `getUTC*` getters (`Date.UTC`
   normalises a day one past the end of its month itself, as
   `date-range.ts`'s `naiveUtcMillis` already documents). Converting a key back
   to an instant and re-applying the offset applies it twice — the exact
   mistake `time-buckets.ts`'s `shiftedFields` comment warns about, and it goes
   wrong only for a few hours a day, which is how it survives a casual test.
2. **Month arithmetic is `y * 12 + (m - 1)`**, incremented and decomposed back.
   No DST case and no month-length case exists in that arithmetic; do not route
   month stepping through `Date` at all.
3. **A bounded window end comes from `dayStringsOf(range, zone)`, not from
   `toMs`.** `range.toMs` is the start of the day *after* the last included day
   (S13 Q3); using it directly appends exactly one spurious trailing zero row.
   `dayStringsOf` already does the "one millisecond earlier" correction. Test 6
   pins this.
4. **The bounded window start** is `dayStringsOf(range, zone).from`, i.e.
   `dayKey(range.fromMs, zone)`; the month form is its first seven characters.
5. `share` divides by the **series** `costMicroUsd` (the sum over points), so
   the shares sum to 1 even when undated cost exists. Pair every share
   assertion with a pin on that total (LEARNINGS: a shares-sum-to-1 assertion
   cannot by itself catch a spurious category).
6. Cost stays integer micro-USD throughout. No division by `1e6` in this file.
7. Everything returned is frozen, as elsewhere in `src/model/`.

### 4.2 `src/model/report.ts` — change (Q9)

- Remove the `dayMap`, `monthMap` and `undated` parameters from
  `buildSessionRow`, together with the inline bucket accumulation at the end of
  the per-request loop. The `excludedTotals` accumulation, the S13 filtering
  guard, `firstTimestamp`/`lastTimestamp` and `survivingRequests` are
  **unchanged**.
- In `buildReport`, after `sessionRows` is built and **before** the S13
  zero-request drop, call `bucketRows(sessionRows, "day", zone)` and
  `bucketRows(sessionRows, "month", zone)`; `byDay`, `byMonth` and `undated` in
  the returned frozen object come from those results.
- Nothing else changes. Do not touch the comparators, `costShare`,
  `unattributedCostMicroUsd`, `findGroup`, `summarizeGaps` or the `excluded`
  block.

`Report`, `TimeBucket` and `UndatedTotals` keep their current shapes; no type in
`report-types.ts` changes in this session.

### 4.3 `src/components/trend-section.tsx` — new

Props only, no signal reads — the `GroupingToggle` / `ModelPanel` contract.

```tsx
import type { Granularity, TrendSeries } from "../model/trend.js";

export type TrendScope =
  | { readonly kind: "all" }
  | { readonly kind: "group"; readonly label: string };

export interface TrendSectionProps {
  readonly series: TrendSeries;
  readonly granularity: Granularity;
  readonly scope: TrendScope;
  readonly open: boolean;
  readonly onGranularity: (g: Granularity) => void;
  readonly onToggleOpen: () => void;
  /** Null when the scope is already "all" — the reset control is then absent. */
  readonly onResetScope: (() => void) | null;
}

export function TrendSection(props: TrendSectionProps): JSX.Element;
```

Markup contract (the e2e and component specs assert on these, never on text):

| Element | Hook |
|---|---|
| Section root | `<section data-testid="trend-section" data-open={open}>` |
| Disclosure button | `data-testid="trend-disclosure"`, `aria-expanded` |
| Granularity control | `<div role="radiogroup" data-testid="trend-granularity">` with two `role="radio"` buttons, `data-granularity="day" \| "month"`, `aria-checked` |
| Scope label / reset | `data-testid="trend-scope-label"` / `data-testid="trend-scope-reset"` |
| Table | `data-testid="trend-table"` |
| Row | `data-testid="trend-row"`, `data-key`, `data-zero="true" \| "false"`, `data-delta="up" \| "down" \| "flat" \| "none"` |
| Cells | `data-testid="trend-cell-period" \| "-cost" \| "-requests" \| "-share" \| "-delta"` |
| Undated footnote | `data-testid="trend-undated"` (rendered only when non-zero) |
| Unfilled note | `data-testid="trend-unfilled"` (rendered only when `filled === false`) |
| Empty state | `data-testid="trend-empty"` (no points at all) |

Rows are rendered **newest first** (Q6) by reversing `series.points` for
display; the series itself is never mutated.

### 4.4 `src/state/app-state.ts` — change

```ts
import type { Granularity } from "../model/trend.js";

/**
 * US-5.2's trend controls (S14 plan §2 Q3, Q9). Signals only — nothing is
 * written to localStorage; persistence belongs to the settings screen
 * (S15+/S21), exactly as with `grouping` (S10) and the range (S13). Neither
 * signal is touched by `runScan()`, so both survive a rescan.
 */
export const trendGranularity = signal<Granularity>("month"); // Q3: month by default
export const trendOpen = signal<boolean>(true);

export function setTrendGranularity(next: Granularity): void;
export function setTrendOpen(open: boolean): void;
```

No new I/O. No change to `runScan`, `rebuildReport` or any existing signal.

### 4.5 `src/app.tsx` — change

Below the existing `content-grid`, inside the `hasGroups && currentReport`
branch:

```tsx
const trendRows = selectedGroup ? selectedGroup.sessions : currentReport.sessions;
const trendSeries = buildTrend(
  trendRows,
  trendGranularity.value,
  localZoneOffset,
  currentReport.range,
);
```

`scope` and the reset callback are the **same** values already computed for
`ModelPanel` (`scope: ModelScope` is structurally identical to `TrendScope`;
reuse the computed `scope` and `selectedGroup ? () => clearGroupScope(...) :
null`). Render `<TrendSection …>` after the grid and before `<StatusBar />`.

### 4.6 `src/i18n/de.ts` + `src/i18n/en.ts` — change

New keys (both catalogues, files kept sorted by key):

| Key | German | English |
|---|---|---|
| `trend.heading` | `Verlauf` | `Trend` |
| `trend.collapse` | `Verlauf ausblenden` | `Hide trend` |
| `trend.expand` | `Verlauf einblenden` | `Show trend` |
| `trend.granularity` | `Granularität` | `Granularity` |
| `trend.day` | `Tag` | `Day` |
| `trend.month` | `Monat` | `Month` |
| `trend.scopeLabel` | `Bereich: {scope}` | `Scope: {scope}` |
| `trend.scopeAll` | `Alle Projekte` | `All projects` |
| `trend.clearScope` | `Auswahl aufheben` | `Clear selection` |
| `trend.columnPeriod` | `Zeitraum` | `Period` |
| `trend.columnCost` | `Kosten` | `Cost` |
| `trend.columnRequests` | `Anfragen` | `Requests` |
| `trend.columnShare` | `Anteil` | `Share` |
| `trend.columnDeltaDay` | `Δ Vortag` | `Δ prev. day` |
| `trend.columnDeltaMonth` | `Δ Vormonat` | `Δ prev. month` |
| `trend.deltaNone` | `—` | `—` |
| `trend.undated` | `ohne Zeitstempel: {cost} ({count} Anfragen)` | `no timestamp: {cost} ({count} requests)` |
| `trend.unfilled` | `Lücken nicht aufgefüllt: Zeitraum zu groß (mehr als {max} Punkte).` | `Gaps not filled: period too large (more than {max} points).` |
| `trend.empty` | `Keine Daten im gewählten Zeitraum.` | `No data in the selected period.` |

**Date formatting — `timeZone: "UTC"` is load-bearing.** A bucket key is a
calendar label already expressed in the resolved zone. Render it by
reconstructing a UTC instant from its parts and formatting that instant *in
UTC*:

```ts
// day key "YYYY-MM-DD"
tDate(Date.UTC(y, m - 1, d), { dateStyle: "medium", timeZone: "UTC" });
// month key "YYYY-MM"
tDate(Date.UTC(y, m - 1, 1), { year: "numeric", month: "short", timeZone: "UTC" });
```

Without `timeZone: "UTC"`, `Intl` re-applies the host offset and a
negative-offset host displays **every row one day early** — a bug that is
invisible on a UTC or European CI runner and obvious in New York.

Delta text goes through `tPercent(deltaRatio)`, which already emits a sign for
negatives; a positive value is prefixed with `+` via the catalogue-free numeric
formatter options (`signDisplay: "exceptZero"` on the percent formatter call) so
the direction is in the text, not only in `data-delta`.

### 4.7 `src/styles/` — change

One new block for the section, the table and the footnote rows. No colour-only
state; the zero rows are distinguished by their content (`0,00 USD`) and by
`data-zero`, not by colour alone (NFR-11).

### 4.8 `e2e/fixtures/trees.ts` — change

Add a `trendTree` with:

- two projects, so the scope switch is observable;
- a deliberate **two-day gap** in the middle of one project's activity;
- at least one bucket in a second calendar month, so the granularity switch
  changes the key set and not just the row count;
- exported constants for the expected keys and USD figures
  (`TREND_SPACE_ID`, `TREND_OTHER_SPACE_ID`, `TREND_GAP_DAY_KEY`,
  `TREND_TOTAL_USD`, `TREND_SCOPED_TOTAL_USD`, `TREND_MONTH_KEYS`), in the same
  style as the S13 `dateRangeTree` constants.

Timestamps in the fixture are chosen so the expected day keys are the same under
any realistic host offset (mid-day UTC), because the e2e run uses the **host**
zone via `localZoneOffset` and CI's zone is not ours to pin. The zone-sensitive
assertions live in the unit tests, where the resolver is injected.

### 4.9 `e2e/trend.spec.ts` — new

Every string assertion derived from `translate()` / `formatCurrency` /
`formatDate` / `formatPercent`. See §6 for the cases.

---

## 5. What is deliberately *not* touched

- `src/model/report-types.ts` — no type changes this session.
- `src/services/` — no service changes; nothing here does I/O.
- `buildReport`'s filtering, dropping, grouping, sorting and `excluded`
  accumulation (S13) — untouched apart from where the buckets come from.
- `Report.gaps` / `summarizeGaps` — untouched.
- No new dependency of any kind, and no charting code (§3).

---

## 6. Tests, by name

### `src/model/trend.test.ts`

1. `bucketRows groups requests into day keys in the INJECTED zone, not UTC`
   — offset +13:45, instants straddling local midnight; a UTC implementation
   produces a different key set (§0.3 items 2 and 3).
2. `bucketRows groups into month keys and a local-midnight instant on the 1st lands in the right month`
3. `bucketRows counts undated requests separately and never into a bucket`
4. `buildTrend inserts zero points for every gap day and marks them isZero`
5. `buildTrend under an unbounded range spans first observed to last observed bucket, with no padding`
6. `buildTrend under a bounded range pads to the range bounds, and the last point is the last INCLUDED day`
   — the off-by-one pin for §4.1 note 3.
7. `buildTrend month fill crosses a year boundary` — 2025-11 through 2026-02.
8. `buildTrend returns filled false and the observed buckets when the window exceeds MAX_TREND_POINTS`
9. `deltaRatio is null for the first point and for a zero previous bucket, never Infinity`
10. `shares sum to 1 AND the series cost equals a hand-pinned figure`
    — both halves required (§0.3 item 1, and the shares-sum trap).
11. `points are key-ascending regardless of session order`
12. `an empty row set yields zero points, filled true, and no throw` (NFR-3)

### `src/model/report.test.ts` — added

13. `byDay and byMonth still match hand-pinned bucket values after the buildTrend refactor`
    — hand-computed expectations, **not** an equality against `bucketRows`.
14. `byDay is computed before the bounded-range zero-request drop`
    — fixture built so a post-drop ordering yields a different bucket set.

### `src/model/report-privacy.test.ts` — added

15. `no TrendPoint or TrendSeries field carries a path, an id or free text`
    — keys are `YYYY-MM` / `YYYY-MM-DD` only (NFR-6).

### `src/components/trend-section.test.tsx`

16. `renders one row per point, newest first, while the series stays ascending`
17. `a zero-filled row carries data-zero "true" and a data row carries "false"`
    — both branches (§0.3 item 7).
18. `the granularity control is a radiogroup and reports the clicked value`
19. `the undated footnote appears only when the scoped undated total is non-zero`
20. `the unfilled note appears only when series.filled is false`
21. `currency, share and date cells match formatCurrency/formatPercent/formatDate output`
    — expectations derived from the formatters, never typed (§0.3 item 5).
22. `delta direction is carried as sign text and data-delta, not by colour` (NFR-11)

### `e2e/trend.spec.ts`

23. `the trend table appears with month granularity and switches to days`
24. `selecting a project row scopes the trend, and clearing it restores all projects`
25. `a gap day appears as a zero row` — `data-zero="true"` on `TREND_GAP_DAY_KEY`.
26. `applying a date range shortens the trend and pads to the range ends`

---

## 7. The by-hand negative control

Run once, during implementation, and report the result:

1. Patch `buildTrend` / `bucketRows` to ignore the injected `zone` (bucket in
   UTC unconditionally).
2. Run `npm test`. **Tests 1 and 2 must fail.** If they pass, the fixture
   instants are not near local midnight and the fixture is wrong, not the
   implementation (§0.3 item 2).
3. Restore the file **byte-for-byte** and re-run `npm test` to confirm green.

---

## 8. Exit commands

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run check:no-fake
npm run test:e2e
npm run regression                      # 1_413_585_188 µUSD, 150/508/7/26 unchanged
rg -l --text --no-ignore --hidden --encoding none -e '\x00' src plugins scripts e2e test
#   expected output: exactly test/fixtures/utf16le-lines.bin
```

Plus, not a command: §7's negative control, and a grep of `e2e/trend.spec.ts`
for quoted English words (§0.3 item 4).

---

## 9. Sizing, and the drop order

Production files: `src/model/trend.ts` (new), `src/model/report.ts` (refactor),
`src/components/trend-section.tsx` (new), `src/state/app-state.ts`,
`src/app.tsx`, `src/i18n/{de,en}.ts`, one CSS block. No new dependency. Exit
criteria are all commands.

**If the session overruns, drop in this order — and say so to the orchestrator,
never silently:**

1. **The Δ column (Q7).** US-5.2 stays fully satisfied without it; tests 9 and
   22 go with it.
2. **The `report.ts` refactor (Q9).** Leaving the inline accumulation in place
   costs a duplicated rule, not a wrong answer; tests 13 and 14 go with it, and
   the deduplication moves to S18, which needs the shared rule anyway.

Nothing else in this plan is optional. In particular the zero-fill, the cap and
the ascending `points` array are the deliverable S18 depends on.
