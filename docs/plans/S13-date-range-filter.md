# S13 — Date range filter

**Stories.** US-5.1 (`MUST`). Carried alongside: NFR-7 (every new string through
both catalogues, every number and date through `Intl`), NFR-11 (keyboard
operation, no state by colour alone), NFR-9 (this session's own Playwright
spec), NFR-3 (nothing here throws), NFR-6 (the new fields carry no path and no
free text), NFR-2 (a filter change must not re-read a single file).
**Depends on.** S10 (`GroupingToggle`'s segmented-control pattern, the toolbar
row, `ModelPanel`), S11 (`SessionRow.requests`, `SessionDetail`), S9
(`SessionTable`), S8 (`OverviewTable`, `StatusBar`, the Playwright harness), S5
(`buildReport`, `Report`, `ZoneOffsetResolver`), S6 (`scanDiscovery`), S2
(`src/i18n/`).
**Status.** Planned 2026-09-21. Approved by the user; all sixteen design
questions are decided below and none is left open.

**Goal.** Restrict every figure in the app to a period, filtering **individual
requests** by their `result` timestamp.

---

## 0. Read this first

### 0.1 The trap this whole session exists to avoid

`ROADMAP.md`: *"Filter by session" is the easy wrong implementation and gives
subtly wrong monthly totals.*

A session that starts on 30 March and ends on 2 April must contribute **only its
March requests** to a March range — not all of its requests (because it "touches"
March), and not none of them (because it is not wholly inside March). All three
readings are easy to write and only one is right. §5's fixture is built so the
three give three **different** totals, and §6's negative controls prove it.

### 0.2 What is already in place, and why it makes this cheap

- `buildReport`'s per-session loop is **already request-granular**. `report.ts`
  even says so: *"S13 will add an optional per-request predicate here; the loop
  is already request-granular so that it can."* Do not restructure it.
- `scanDiscovery` **already** accumulates a complete `ResolvedSession[]` in
  memory before calling `buildReport`. Retaining that array costs nothing new.
  NFR-4 ("streaming, never slurping") is about the *lines of an audit log*, not
  about the parsed aggregates; `SessionRow.requests` has held every parsed
  `result` record since S11.
- `ZoneOffsetResolver` is already injected everywhere buckets are computed. S13
  finally supplies a non-UTC one.
- `GroupingToggle` is already a keyboard-operable segmented control. The range
  chips copy its pattern and its CSS.

### 0.3 Traps from LEARNINGS that apply directly

1. **`CostTotals` carries no session count**, so any "total sessions" figure is
   derived by summing group session counts — correct only while every grouping
   is a partition of `report.sessions`. A filter is exactly what breaks that
   silently. §2 Q8 decides it deliberately and §6 tests the invariant by name.
2. **A zone test using instants at 00:30 UTC passes under any constant offset.**
   Every preset and boundary test here uses instants near **local** midnight,
   and one straddles a DST jump.
3. **An injectable dependency whose default agrees with the injection on every
   fixture is untested by construction.** `resolvePreset` gets a test with a
   fixed **+13:45** offset — a value no default can produce.
4. **Build the test so the wrong implementation gives a different answer.** §5's
   fixture is the load-bearing artefact of this session.
5. **A quoted English string in an e2e assertion is the translated-text trap.**
   Every string assertion in `e2e/date-range.spec.ts` comes from
   `translate(locale, key)`.
6. **Preact keeps `false` for `data-*` attributes** and drops it elsewhere.
   `data-partial` is asserted in **both** branches, `"true"` and `"false"`.
7. **`localeCompare` and any clock read are banned in `src/model/`.**
   `new Date(epochMs)` and `Date.parse(iso)` are deterministic functions of
   their argument and remain allowed (as `time-buckets.ts` documents);
   `Date.now()` and `new Date()` with no argument stay forbidden. "Now" is
   **injected** into `resolvePreset` as `nowMs`.
8. **Making a shared type's field non-optional fans out into hand-built test
   literals in files a plan does not name.** See §4.9 — expected fallout, not
   scope creep.
9. **A raw `U+0000` must never enter a source file**; §8's ripgrep scan is part
   of the exit set.

---

## 1. Shape of the change

```
  scan (unchanged, still streaming)
        │
        ▼
  ResolvedSession[]  ──────── retained in app-state (module scope, not a signal)
        │
        │   activeRange (signal, computed from preset + custom days)
        │   localZoneOffset (services/zone.ts)
        ▼
  buildReport(sessions, problems, { zone, range })   ← the ONLY filtering point
        │
        ▼
  Report  ── carries range, excluded, isPartial, partialSessions
        │
        ├─ OverviewTable   (group totals, roll-up "7 (2 teilw.)")
        ├─ SessionTable    (session rows, [Teilweise] badge)
        ├─ SessionDetail   (cost drivers; tool section labelled unfiltered)
        ├─ ModelPanel      (breakdowns, filtered by construction)
        ├─ GapIndicators   (undated-excluded line, openRequests qualifier)
        └─ StatusBar       (active period, "7 von 150 Sitzungen")
```

Filtering happens in exactly one function. Nothing downstream of `buildReport`
knows a filter exists, except to render the markers the model computed.

---

## 2. Design questions, all decided

### Q1 — What does a filter change recompute from? → the retained parsed records

Not a rescan (it would re-read 3,941 files for a UI toggle and re-add every
`Problem` to the collector), and not a post-filter of the finished `Report` (it
would have to re-derive group rows, buckets and accumulators from
`SessionRow.requests`, duplicating `totals.ts`). `scanDiscovery` keeps its
`ResolvedSession[]`; `app-state` holds it; a filter change re-runs `buildReport`.
`scanDiscovery`'s return type becomes `ScanResult`.

### Q2 — Which timezone are the boundaries interpreted in? → the host local zone

"Dieser Monat" in a desktop app means the user's month. Today nothing injects a
zone, so the app is silently UTC-bucketed. S13 adds `src/services/zone.ts` with
`localZoneOffset` and injects it from `runScan()`.

**Recorded consequence, accepted deliberately:** `Report.byDay` and
`Report.byMonth` change from UTC buckets to **local** buckets in the running
app. This makes them agree with `tDate`/`tDateTime`, which already format in the
host zone, and it is the shape S14's day/month tables need.

**Verified, not asserted:** `npm run regression` is unaffected.
`src/model/reference-distribution.test.ts` calls `buildReport(resolved,
problems.problems)` with **no options** (line 98) and contains no reference to
`byDay`, `byMonth`, `zone` or `utcOffset`. Its pins are
`report.totals.costMicroUsd === 1_413_585_188`, 150 sessions, 508 requests, 7
project groups, 26 folder groups, 7,504 tool calls, 135 sessions with tools, max
20 tool names — totals and counts, never a bucket key. It also does not call
`scanDiscovery`, so Q1's return-type change does not reach it. All of these must
still pass untouched, and that is the proof that the unfiltered path is
unchanged (`ALL_TIME` is the no-options path).

### Q3 — Half-open interval? → yes, `[fromMs, toMs)`; the UI's "bis" day is inclusive

Half-open is the only representation in which "Letzter Monat" and "Dieser Monat"
neither overlap nor leave a gap — precisely the month-end trap. An inclusive
`toMs` would need a "last representable millisecond" and would mis-file a
request at 23:59:59.500. The **UI** stays humane: the "bis" date the user types
is the last included day, and `rangeFromDayStrings` converts it to the start of
the following local day.

### Q4 — Date input control? → native `<input type="date">`

No dependency (a picker component would be an NFR-8 deviation for a control the
platform ships), keyboard- and screen-reader-operable for free (NFR-11), and its
value is already `"YYYY-MM-DD"` — exactly what `rangeFromDayStrings` consumes.

**Accepted caveat:** WebView2 renders the picker chrome in the **OS** locale, not
the app locale, so an English-language app on a German Windows shows a German
picker. The app's own labels and the status-bar period string still go through
`src/i18n/` and follow the app locale. Do not try to fix this.

### Q5 — Quick-choice control? → segmented chips, `role="radiogroup"` (user decision)

Four presets plus "Benutzerdefiniert" on one row, all visible. Reuse
`GroupingToggle`'s CSS and accessibility pattern (arrow keys move, Space
selects) rather than inventing a second idiom. The from/to inputs sit inline on
the next line and are **disabled** unless the custom preset is active.

### Q6 — Where is the active period shown? → filter row *and* status bar

The filter row shows the *control* state. The status bar gets a new
always-visible `status-range` segment with the resolved period — US-5.1 says
"visible at all times", and the toolbar scrolls out of view with the table while
the status bar is a fixed footer. The status bar also carries "7 von 150
Sitzungen" (Q8).

### Q7 — Partial marker? → badge in the title cell, plus a group-row roll-up (user decision)

A `[Teilweise]` badge beside the existing `[Archiviert]` badge in the session
row's title cell, with `title="8 von 20 Anfragen im Zeitraum"` and
`data-partial="true" | "false"`. Group rows show `7 (2 teilw.)` in the sessions
cell. Text, never colour alone (NFR-11).

**The group roll-up is in scope.** The user chose the variant that includes it.
If the session overruns, raise it with the orchestrator — do not drop it
silently.

### Q8 — What does a session count mean under a filter? → zero-in-range sessions are dropped

A session with no in-range requests is removed from the filtered `Report`
entirely (from `sessions` and from both groupings). Then
`report.sessions.length` still equals the sum of `projectGroups[].sessionCount`
**and** of `folderGroups[].sessionCount` — every grouping stays a **partition**
of `report.sessions`, which is the invariant the status bar and the `<tfoot>`
total row silently depend on (LEARNINGS, §0.3 item 1). Keeping zero-cost rows
would make "7 Sitzungen" mean two different things in two places.

Dropping is applied **only when a bounded range is active**. Under `ALL_TIME` the
existing behaviour is untouched: a session with zero `result` lines but a
non-zero `openRequests` still appears, exactly as today.

The dropped count is not hidden: `Report.excluded.sessions` carries it, and the
status bar renders "{included} von {total} Sitzungen".

### Q9 — Requests whose timestamp will not parse? → excluded by any bounded range

An undated request cannot truthfully be placed in a period; including it would
inflate every month. `containsInstant(null, ALL_TIME)` is `true`, so the
unfiltered report is bit-identical to today's. Under a bounded range they are
excluded, counted into `Report.excluded`, and surfaced by a new gaps line.
`Report.undated` keeps its existing meaning and is computed from the requests
that survive the filter.

### Q10 — Aborted requests (`openRequests`)? → kept unfiltered on a retained session, and labelled

They have no `result` line, therefore no timestamp and no cost. They can neither
be filtered nor attributed. Zeroing them would hide US-1.5's data gap exactly
when the user narrows the view. `SessionRow.openRequests` and `Report.gaps` are
computed from the **full** session set (a gap is a property of the data on disk,
not of the view), and the gaps strip gains a qualifier rendered only while a
range is active.

### Q11 — Tool counts under a filter? → labelled unfiltered, not split out (user decision)

`ToolUseCount` is per **session**, derived from `assistant` lines;
`RequestRecord` carries no `request_id`, so there is no join from a tool call to
a `result` timestamp. Making tool counts filterable means adding `requestId` to
`RequestRecord` and restructuring `toolUses` into per-request buckets — a parser
change, a second vertical concern, and it would collide with S3's
`output-tokens-trap.test.ts` guard. The session detail's tool section therefore
renders `detail.tools.unfiltered` **only while a range is active**. Deferred, not
forgotten.

### Q12 — Does the range persist across restarts? → no

Exactly the reasoning S10 recorded for `grouping` (S10 plan §2 Q6): a second
ad-hoc `localStorage` key now is a migration later, and the settings screen
(S15+/S21) owns persistence. A saved narrow range would also make the app open
showing a fraction of the data with no visible cause.

### Q13 — Default range on start? → "Alles"

US-1.3's total is the headline figure and must be what the app shows unprompted.

### Q14 — "Dieser Monat" / "Dieses Quartal": whole calendar period, not to-date

A future upper bound simply matches no data, while a to-date bound would make
the displayed period silently change at midnight with the app open. It is also
what makes "Dieser Monat" and "Letzter Monat" exactly adjacent (Q3).

### Q15 — An invalid custom pair (`von` after `bis`)? → never silently swapped

`isValidRange` returns `false`; the component renders an inline message and emits
nothing; the previously active range stays applied. Swapping hides a typo and
produces a confidently wrong total.

### Q16 — Apply immediately, or behind a button? → immediately, on `change`

`change`, not `input` — a half-typed year would otherwise flash a nonsense
range. Preset chips apply on selection. The recompute is a few hundred records.

---

## 3. Acceptance criteria: satisfied and deferred

**Satisfied in S13.**

| US-5.1 criterion | How |
|---|---|
| Quick choices "Dieser Monat", "Letzter Monat", "Dieses Quartal", "Alles" | `RangePresetId` + `resolvePreset`, rendered as chips (§4.6) |
| Free from/to selection | `range.custom` preset + two `<input type="date">` (§4.6) |
| Filter applies to individual requests by `result` timestamp, not whole sessions | `containsInstant` inside `buildSessionRow`'s per-request loop (§4.3) |
| A session spanning a boundary contributes only its in-range requests | Same, plus the §5 fixture and §6's straddle tests |
| …and is marked as partially included | `SessionRow.isPartial` + `excludedRequests` → `[Teilweise]` badge, `GroupRow.partialSessions` → group roll-up |
| Projects, sessions, models honour the filter | All derived inside `buildReport`; nothing downstream re-sums |
| The active period is visible at all times | `StatusBar`'s new `status-range` segment (Q6) |

**Explicitly deferred, with the hook named.**

- **Charts (US-3.3, S18)** and **trend tables (US-5.2, S14)** — `Report.byDay`
  and `Report.byMonth` are already filtered, so both draw a filtered series with
  no further work here. S13 renders no chart and no trend table.
- **Export (US-7.1, S19)** — `Report.range` is carried on the report object
  itself, so S19 reads the active period from the same object it exports rather
  than from a signal, and `Report.excluded` gives it the "n sessions outside the
  period" header line. S13 writes no export.
- **Tool counts filtered by period (Q11)** — labelled unfiltered.
- **Persisting the range (Q12)** — settings screen.
- **Budgets against a range (US-6.1, S17)** — S17 depends on S13 and will read
  `Report.range`; nothing budget-shaped is built here.

---

## 4. Files and signatures

### 4.1 `src/model/date-range.ts` — new, pure

No clock, no DOM, no i18n import. "Now" is a parameter.

```ts
import type { ZoneOffsetResolver } from "./time-buckets.js";

/** Half-open [fromMs, toMs). `null` on a side means unbounded there. */
export interface DateRange {
  readonly fromMs: number | null;
  readonly toMs: number | null;
}

export const ALL_TIME: DateRange; // frozen { fromMs: null, toMs: null }

export type RangePresetId =
  | "all" | "thisMonth" | "lastMonth" | "thisQuarter" | "custom";

/** Both bounds null. The unfiltered path. */
export function isAllTime(range: DateRange): boolean;

/** False only when both bounds are present and fromMs > toMs (Q15). */
export function isValidRange(range: DateRange): boolean;

/**
 * Half-open membership. A null timestamp (unparseable) is a member ONLY of
 * ALL_TIME (Q9). fromMs is inclusive, toMs is exclusive.
 */
export function containsInstant(epochMs: number | null, range: DateRange): boolean;

/**
 * Epoch ms of the local midnight that begins y-m-d in the resolver's zone.
 * This is the INVERSE of ZoneOffsetResolver (instant -> offset), so it is
 * solved with a two-pass fixpoint: guess with the offset at the UTC-naive
 * instant, then re-read the offset at the candidate and correct once. A
 * second pass is enough for every real zone rule; document that and pin the
 * DST case by test.
 */
export function startOfLocalDay(
  y: number, m: number, d: number, zone: ZoneOffsetResolver,
): number;

/** Whole calendar periods (Q14), resolved against an INJECTED nowMs. */
export function resolvePreset(
  id: Exclude<RangePresetId, "custom">,
  nowMs: number,
  zone: ZoneOffsetResolver,
): DateRange;

/**
 * "YYYY-MM-DD" day strings as the UI holds them. `to` is the last INCLUDED
 * day and becomes the start of the following local day (Q3). A malformed or
 * empty string is treated as an unbounded side, never as an exception (NFR-3).
 */
export function rangeFromDayStrings(
  from: string | null, to: string | null, zone: ZoneOffsetResolver,
): DateRange;

/** Inverse of the above: seeds the inputs and renders the indicator. */
export function dayStringsOf(
  range: DateRange, zone: ZoneOffsetResolver,
): { readonly from: string | null; readonly to: string | null };
```

`resolvePreset("all", …)` returns `ALL_TIME`. `"thisQuarter"` is the calendar
quarter containing `nowMs` in the resolved zone: months 1-3, 4-6, 7-9, 10-12.

### 4.2 `src/model/report-types.ts` — change

```ts
// SessionRow, added:
  /** Requests this session has that the active range excluded. 0 under ALL_TIME. */
  readonly excludedRequests: number;
  /** excludedRequests > 0 && totals.requests > 0 — "partially included" (US-5.1). */
  readonly isPartial: boolean;

// GroupRow, added:
  /** Sessions in this group with isPartial true. */
  readonly partialSessions: number;

// Report, added:
  /** The range this report was built with. S19 exports it from here, not from a signal. */
  readonly range: DateRange;
  /** What the range removed. Zeroes under ALL_TIME. */
  readonly excluded: {
    readonly sessions: number;
    readonly requests: number;
    readonly costMicroUsd: number;
  };
```

All four are **non-optional**. NFR-6: none carries a path, an id or free text —
`report-privacy.test.ts` is extended to say so.

### 4.3 `src/model/report.ts` — change

```ts
export interface ReportOptions {
  readonly zone?: ZoneOffsetResolver; // defaults to utcOffset
  readonly range?: DateRange;         // defaults to ALL_TIME
}
```

In `buildSessionRow`, the existing per-request loop gains a single guard at the
top of the body:

```ts
for (const request of session.audit.requests) {
  if (!containsInstant(parseTimestamp(request.timestamp), range)) {
    excludedRequests += 1;
    excludedCostMicroUsd += request.costMicroUsd;
    continue;                         // <- the ONE filtering point
  }
  …everything that is there today, unchanged…
}
```

Note `parseTimestamp` is already called in that loop; hoist it so it is parsed
once, not twice. `SessionRow.requests` (S11's per-request table) is built from
the **surviving** requests only — the session detail must not list rows the
totals above it exclude. `firstTimestamp`/`lastTimestamp` likewise describe the
in-range slice.

In `buildReport`:

- `const range = options?.range ?? ALL_TIME;`
- after `sessionRows` is built, when `!isAllTime(range)`, drop every row with
  `totals.requests === 0` (Q8) before sorting and grouping, accumulating the
  dropped rows into `excluded.sessions`. Under `ALL_TIME` nothing is dropped.
- `excluded.requests` / `excluded.costMicroUsd` sum the per-session excluded
  figures across **all** sessions, dropped ones included.
- `gaps: summarizeGaps(sessions)` keeps taking the **full, unfiltered**
  `ResolvedSession[]` (Q10).
- `groupSessions` gains `partialSessions` as a count while it accumulates.
- `range` and a frozen `excluded` go into the returned frozen object.

Nothing else in this file changes. Do not touch the comparators, `costShare`,
`unattributedCostMicroUsd` or `findGroup`.

### 4.4 `src/services/zone.ts` — new

```ts
import type { ZoneOffsetResolver } from "../model/time-buckets.js";

/**
 * Minutes east of UTC at a given instant, from the host. Lives in services,
 * not in src/model/, because reading the host's zone rules is an environment
 * read — the model layer stays a pure function of its arguments (CLAUDE.md
 * architecture rule 2). getTimezoneOffset() is minutes WEST of UTC, hence the
 * negation.
 */
export const localZoneOffset: ZoneOffsetResolver = (epochMs) =>
  -new Date(epochMs).getTimezoneOffset();
```

### 4.5 `src/services/scan.ts` — change

```ts
export interface ScanOptions {
  readonly zone?: ZoneOffsetResolver;
  readonly range?: DateRange;              // new; threaded into BOTH buildReport calls
  readonly onProgress?: (done: number, total: number) => void;
  readonly onPartial?: (report: Report) => void;
  readonly partialIntervalMs?: number;
}

export interface ScanResult {
  readonly report: Report;
  /** Retained so a filter change rebuilds without re-reading a file (Q1). */
  readonly sessions: readonly ResolvedSession[];
  readonly problems: readonly Problem[];
}

export async function scanDiscovery(
  fs: FileSystem, discovery: Discovery, options?: ScanOptions,
): Promise<ScanResult>;
```

The function body is otherwise unchanged; only the final `return` is wrapped.
The partial emissions keep passing the same `range` so an interim report stays a
prefix view of the final one, never a different computation.

### 4.6 `src/components/date-range-filter.tsx` — new

Props only, no signal reads — the `GroupingToggle` contract.

```tsx
export interface DateRangeFilterProps {
  readonly preset: RangePresetId;
  /** "YYYY-MM-DD" or null. Reflects the inputs, not the resolved range. */
  readonly fromDay: string | null;
  readonly toDay: string | null;
  /** Q15: true renders the message and the caller kept the previous range. */
  readonly invalid: boolean;
  readonly onPreset: (id: RangePresetId) => void;
  readonly onCustomDays: (from: string | null, to: string | null) => void;
}
```

Markup: a `<div role="radiogroup" aria-label={t("range.label")}>` of five
buttons with `role="radio"` and `aria-checked`, `data-testid="range-preset"`,
`data-preset={id}`; then a row with two `<label>`-wrapped `<input type="date">`
(`data-testid="range-from"` / `"range-to"`), `disabled` unless
`preset === "custom"`, wired to `onChange` (Q16); then, when `invalid`, a
`<p data-testid="range-invalid">{t("range.invalid")}</p>`.

### 4.7 `src/state/app-state.ts` — change

```ts
// Module scope, deliberately NOT a signal: never rendered, purely the input
// to a rebuild. A signal would invite a component to read it.
let scanInput: { sessions: readonly ResolvedSession[]; problems: readonly Problem[] } | null = null;

export const rangePreset = signal<RangePresetId>("all");          // Q13
export const customFromDay = signal<string | null>(null);
export const customToDay = signal<string | null>(null);

/** The resolved range, or the last valid one when the custom pair is invalid (Q15). */
export const activeRange: ReadonlySignal<DateRange>;
export const rangeInvalid: ReadonlySignal<boolean>;

export function setRangePreset(id: RangePresetId): void;   // rebuilds
export function setCustomDays(from: string | null, to: string | null): void; // rebuilds
export function clearRange(): void;                        // back to "all"

/** Re-runs buildReport from scanInput. No I/O. No-op before the first scan. */
function rebuildReport(): void;
```

`activeRange` is a `computed` over `rangePreset`, `customFromDay`,
`customToDay`, resolving presets with `Date.now()` **read in this layer** (the
clock ban is on `src/model/`, and `app-state` is where the app's "now" already
lives via `lastScanAt`) and `localZoneOffset`. When the custom pair is invalid it
yields the last valid range; keep that last-valid value in a module-scoped
variable, not a signal.

`runScan()` changes to:
- pass `{ zone: localZoneOffset, range: activeRange.value }` to `scanDiscovery`,
- store `scanInput = { sessions: result.sessions, problems: result.problems }`,
- set `report.value = result.report`.

`runScan()` must **not** touch any of the three range signals — that is what
makes the active period survive a rescan, the same property expansion, sort,
scope and panel visibility already have, and what S20 will lean on for US-8.1's
"UI state preserved, active filter included".

### 4.8 Component edits

- **`src/components/session-table.tsx`** — after the `[Archiviert]` badge, when
  `session.isPartial`, a `<span data-testid="partial-badge">{t("session.partial")}</span>`
  with `title={t("session.partialTitle", { included: tNumber(session.totals.requests), total: tNumber(session.totals.requests + session.excludedRequests) })}`.
  The `<tr>` always carries `data-partial={session.isPartial}` — Preact renders
  `"false"` for a `data-*` attribute, and both branches are asserted (§0.3 item 6).
- **`src/components/overview-table.tsx`** — the sessions cell renders
  `group.partialSessions > 0 ? t("overview.sessionCountWithPartial", { count, partial }) : tNumber(group.sessionCount)`,
  with `data-testid="cell-group-sessions"`. The `<tfoot>` total row stays
  `totals`, never a re-sum of visible rows.
- **`src/components/status-bar.tsx`** — a new
  `<span data-testid="status-range">` before the last-scan segment, showing
  `t("status.rangeAll")` when `isAllTime`, otherwise
  `t("status.range", { period })` where `period` is built from `dayStringsOf`
  via `range.span` / `range.spanFrom` / `range.spanTo` and `tDate`. The existing
  sessions segment becomes `t("status.sessionsInRange", …)` when a range is
  active and keeps `tPlural("scan.sessionCount", …)` otherwise.
- **`src/components/session-detail.tsx`** — when `rangeActive`, render
  `<p data-testid="tool-usage-unfiltered">{t("detail.tools.unfiltered")}</p>` in
  the tool section (Q11). Pass `rangeActive` as a prop; do not read a signal
  inside the component.
- **`src/components/gap-indicators.tsx`** — when a range is active, a
  `tPlural("gaps.undatedExcluded", …)` line and the
  `t("gaps.openRequestsUnfiltered")` qualifier beside the open-requests figure.
- **`src/app.tsx`** — render `<DateRangeFilter …>` in the existing
  `.toolbar-row` beside `GroupingToggle`; thread `rangeActive` down to
  `SessionDetail` through `OverviewTable` → `SessionTable`.
- **`src/styles/index.css`** — `.range-filter`, `.range-filter__chips` (reusing
  the grouping-toggle rules), `.range-filter__dates`, `.session-table__partial`
  badge, `.status-bar__range`. No colour-only state.

### 4.9 Expected fallout in files this list does not name

Adding **non-optional** fields to `SessionRow`, `GroupRow` and `Report`, and
changing `scanDiscovery`'s return type, will break every hand-built object
literal that constructs one of them, and `tsc` will not pass until they are
updated. Per LEARNINGS this is **expected fallout, not scope creep** — the
implementer should not hesitate to touch these files, and should not ask whether
they are in scope:

- `src/model/report.test.ts`, `src/model/report-privacy.test.ts`
- `src/components/overview-table.test.tsx`, `src/components/session-table.test.tsx`,
  `src/components/session-detail.test.tsx`, `src/components/status-bar.test.tsx`
- `src/state/app-state.test.ts` (its `makeReport` helper and every
  `vi.mocked(scanDiscovery).mockResolvedValue(...)` — now a `ScanResult`)
- `src/services/scan.test.ts`, `src/services/reference-fs.test.ts`,
  `src/services/tauri-empty-state.test.ts` (each destructures `.report` now)

Prefer adding a shared factory in the test file over hand-patching each literal
where one already exists. Do **not** make the new fields optional to dodge this.

### 4.10 i18n keys — exact names, do not invent others

`de.ts` is the source of truth (`as const`); `en.ts` is
`as const satisfies Record<TranslationKey, string>`. Both stay sorted by key.
Plural bases need `.one` and `.other` and are read with `tPlural`.

| Key | DE | EN |
|---|---|---|
| `detail.tools.unfiltered` | `Aufrufzahlen für die gesamte Sitzung — nicht nach Zeitraum gefiltert` | `Call counts for the whole session — not filtered by period` |
| `gaps.openRequestsUnfiltered` | `nicht nach Zeitraum gefiltert` | `not filtered by period` |
| `gaps.undatedExcluded.one` | `{count} Anfrage ohne Zeitstempel außerhalb des Zeitraums` | `{count} request without a timestamp outside the period` |
| `gaps.undatedExcluded.other` | `{count} Anfragen ohne Zeitstempel außerhalb des Zeitraums` | `{count} requests without a timestamp outside the period` |
| `overview.sessionCountWithPartial` | `{count} ({partial} teilw.)` | `{count} ({partial} partial)` |
| `range.all` | `Alles` | `All` |
| `range.clear` | `Zeitraum zurücksetzen` | `Reset period` |
| `range.custom` | `Benutzerdefiniert` | `Custom` |
| `range.from` | `von` | `from` |
| `range.invalid` | `„von“ liegt nach „bis“ — der Zeitraum wurde nicht übernommen.` | `“from” is after “to” — the period was not applied.` |
| `range.label` | `Zeitraum` | `Period` |
| `range.lastMonth` | `Letzter Monat` | `Last month` |
| `range.span` | `{from}–{to}` | `{from}–{to}` |
| `range.spanFrom` | `ab {from}` | `from {from}` |
| `range.spanTo` | `bis {to}` | `until {to}` |
| `range.thisMonth` | `Dieser Monat` | `This month` |
| `range.thisQuarter` | `Dieses Quartal` | `This quarter` |
| `range.to` | `bis` | `to` |
| `session.partial` | `Teilweise` | `Partial` |
| `session.partialTitle` | `{included} von {total} Anfragen im Zeitraum` | `{included} of {total} requests within the period` |
| `status.range` | `Zeitraum {period}` | `Period {period}` |
| `status.rangeAll` | `Zeitraum: Alles` | `Period: all` |
| `status.sessionsInRange` | `{included} von {total} Sitzungen` | `{included} of {total} sessions` |

The dash in `range.span` is U+2013 EN DASH. Every other separator is a plain
ASCII space — do **not** type a U+00A0 anywhere; `no-irregular-whitespace` will
not catch it inside a string literal (LEARNINGS), and `Intl` supplies its own
non-breaking spaces where they belong.

---

## 5. `test/fixtures/audit/month-straddle.jsonl` — new, and load-bearing

**One session that crosses a month end, engineered so the three candidate
implementations give three different totals.** Every value is invented; nothing
is copied or paraphrased from `reference-material/`.

Content, in order:

1. `system`/`init` line with a model, as the other audit fixtures have.
2. `result` at **2026-03-30T22:40:00Z**, cost `1.000000` USD.
3. `result` at **2026-03-31T23:30:00Z**, cost `2.000000` USD — *30 minutes
   before UTC midnight on the last day of the month*, so a UTC-vs-local bug moves
   it (LEARNINGS §0.3 item 2).
4. `result` at **2026-04-01T00:20:00Z**, cost `4.000000` USD — *20 minutes after
   UTC midnight on the first day of the next month*, the mirror case.
5. `result` at **2026-04-02T09:00:00Z**, cost `8.000000` USD.
6. `result` with **no `timestamp` field at all**, cost `16.000000` USD (Q9).
7. `command_lifecycle` `queued`/`started` with no matching `completed`, giving
   the session exactly **one** `openRequests` (Q10).

Powers of two make every subset sum unique, so no two readings can collide by
accident. Under a **UTC** March range (`2026-03-01` … `2026-03-31` inclusive):

| Reading | Total |
|---|---|
| **Per-request (correct)** — lines 2+3 | **3.000000 USD**, 2 requests, `isPartial` true, `excludedRequests` 3 |
| Whole session kept because it touches March | 31.000000 USD, 5 requests |
| Whole session dropped because it is not wholly inside March | 0, session absent |

A second fixture, `test/fixtures/audit/dst-straddle.jsonl`, carries two `result`
lines at **2026-03-29T00:30:00Z** and **2026-03-29T01:30:00Z** — either side of
the European DST jump — so that a constant-offset resolver and a correct one
disagree about which local day they fall on.

Register both in `test/fixtures/audit/index.ts` following the existing pattern.

---

## 6. Tests, by name

### `src/model/date-range.test.ts` — new

1. `thisMonth begins at local midnight on the first, not at UTC midnight`
2. `lastMonth ends exactly where thisMonth begins — no gap and no overlap`
3. `thisQuarter spans three calendar months and ends at the next quarter's start`
4. `a preset resolved from an instant 30 minutes after local midnight on a DST-jump day lands in the correct month`
5. `the injected resolver is honoured: a fixed +13:45 offset moves the month boundary`
6. `rangeFromDayStrings treats the to day as inclusive by taking the next day's start`
7. `containsInstant is half-open: an instant equal to toMs is excluded, one equal to fromMs is included`
8. `an undated request is excluded by every bounded range and included under ALL_TIME`
9. `a from after a to is invalid and is never silently swapped`
10. `a malformed day string yields an unbounded side rather than throwing`
11. `dayStringsOf round-trips rangeFromDayStrings under a non-UTC resolver`
12. `resolvePreset("all") returns ALL_TIME and isAllTime agrees`

### `src/model/report.test.ts` — added cases

13. `a session straddling a month end contributes only its in-range requests` — pins the exact micro-USD total from §5, so per-session filtering fails it
14. `a straddling session is marked isPartial and reports its excluded request count`
15. `a session wholly outside the range is dropped from sessions and from both groupings`
16. `group session counts still sum to report.sessions.length under a filter` — the partition invariant (§0.3 item 1), asserted for `projectGroups` and `folderGroups` separately
17. `byDay and byMonth contain only in-range requests under a filter`
18. `a partial session's model breakdown covers only its in-range requests`
19. `SessionRow.requests lists only the in-range requests of a partial session`
20. `undated requests are excluded under a bounded range and counted in report.excluded`
21. `openRequests and gaps are unchanged by a filter on a retained session`
22. `ALL_TIME produces a report deeply equal to one built with no range option`
23. `GroupRow.partialSessions counts only partially included sessions`
24. `report.excluded is all zeroes under ALL_TIME`
25. `the DST fixture's two requests fall on different local days under localZoneOffset's rule and the same UTC day` — uses a fixed +60/+120 resolver, never the host zone

### `src/model/report-privacy.test.ts` — extended

26. `the new filter fields carry no path and no free text`

### `src/components/date-range-filter.test.tsx` — new

27. `renders one radio per preset and marks the active one with aria-checked`
28. `choosing a preset emits its id`
29. `the from and to inputs are disabled unless the custom preset is active`
30. `an invalid from/to pair renders the validation message and emits nothing`
31. `a date change emits on change, not on input`

### `src/components/session-table.test.tsx` — added

32. `a partial session row renders the badge and sets data-partial to true`
33. `a fully included row sets data-partial to false and renders no badge` — both branches, per §0.3 item 6

### `src/components/overview-table.test.tsx` — added

34. `a group with partial sessions shows the roll-up count`
35. `a group with no partial sessions shows only the session count`

### `src/components/status-bar.test.tsx` — added

36. `shows the active period and the in-range session count`
37. `shows the all-time label when no range is active`

### `src/state/app-state.test.ts` — added

38. `changing the preset rebuilds the report without calling scanDiscovery again`
39. `an invalid custom pair leaves the previously active range applied`
40. `runScan does not reset the active range`

### `e2e/date-range.spec.ts` — new

41. `a custom range lowers the total and marks the straddling session as partial`
42. `a session outside the range disappears from the overview and the status bar count drops`
43. `clearing back to Alles restores the unfiltered total`
44. `the active period label comes from the catalogue in both locales` — via `translate(locale, key)`, never a quoted English string
45. `the Dieser Monat preset resolves against a fixed clock` — `page.clock.install({ time })` before `gotoApp`, so the assertion is deterministic (Playwright 1.63 is installed)

`e2e/fixtures/trees.ts` gains `dateRangeTree` plus exported constants
`DATE_RANGE_TOTAL_ALL_USD`, `DATE_RANGE_TOTAL_MARCH_USD`,
`DATE_RANGE_PARTIAL_SESSION_ID`, `DATE_RANGE_DROPPED_SESSION_ID`,
`DATE_RANGE_SPACE_ID`. Invented values only.

### Negative controls — run by hand, restore the patched file byte-for-byte, record the observed failure counts in the implementation report

| # | One-line patch | Must fail |
|---|---|---|
| NC1 | In `buildSessionRow`, keep every request when *any* request of the session is in range (the roadmap's "filter by session") | tests 13, 14, 19, and the e2e total assertion in 41 |
| NC2 | In `buildSessionRow`, drop the whole session unless *every* request is in range | tests 13, 14, 16, 23 |
| NC3 | In `containsInstant`, make the upper bound inclusive (`<=` instead of `<`) | tests 7 and 2 |
| NC4 | In `resolvePreset`, ignore the injected resolver and compute in UTC | tests 5 and 1 |
| NC5 | In `buildReport`, drop zero-in-range sessions under `ALL_TIME` too | test 22 |

Record for each: the command run, the number of failing tests, and their names.
A control that fails to fail means the test is not testing what it claims and
must be fixed before the session is considered done.

---

## 7. Sizing, and the one thing to be careful with

Three new production files (`date-range.ts`, `zone.ts`,
`date-range-filter.tsx`), six changed (`report-types.ts`, `report.ts`,
`scan.ts`, `app-state.ts`, plus the component and catalogue edits of §4.8/§4.10)
— the upper end of the sizing rule, but one vertical concern and **no new
dependency**. The group roll-up of Q7 is in scope by the user's decision; if the
session genuinely overruns, raise it with the orchestrator rather than dropping
anything silently.

**The one thing to be careful with:** `startOfLocalDay`. It inverts a function
that is only defined in the forward direction, and a naive single pass is wrong
for exactly one hour twice a year — which is also exactly the case tests 4 and 25
exist to catch. Write the two-pass fixpoint, comment why, and do not simplify it
after the tests pass.

---

## 8. Exit commands

```bash
npm run build
npm test
npm run lint
npm run format:check
npm run check:no-fake
npm run test:e2e
npm run regression
rg -l --text --no-ignore --hidden --encoding none -e '\x00' src plugins scripts e2e test
```

The ripgrep scan must print nothing (`--encoding none` is required: without it
ripgrep transcodes a UTF-16 BOM and reports a NUL-containing file clean —
LEARNINGS).

`npm run regression` must still report **1,413,585,188** micro-USD, 150
sessions, 508 requests, 7 project groups, 26 folder groups, 7,504 tool calls. It
exercises the `ALL_TIME` path (it calls `buildReport` with no options), so it is
simultaneously the proof that the unfiltered behaviour is bit-identical to
before this session. It runs against the local, uncommitted reference tree and is
never wired into CI.

---

## 9. Deliberate deferrals recorded here so they are not mistaken for oversights

- Tool counts are not filtered by period (Q11) — labelled instead.
- The range does not persist across restarts (Q12) — settings screen, S15+/S21.
- No chart, no trend table, no export is built here (§3) — S14, S18, S19 read
  `Report.byDay`, `Report.byMonth`, `Report.range` and `Report.excluded`.
- The native date picker's chrome follows the OS locale, not the app locale
  (Q4) — accepted, not a bug to be fixed later.
- `Report.gaps` and `SessionRow.openRequests` remain unfiltered by design (Q10).
- Budgets against a range are S17.
