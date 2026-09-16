# S5 — Aggregation

**Status.** Approved plan. Written in the planning phase of session S5.
**Implementer.** Sonnet agent. Follow this document literally; do not expand scope.
**Depends on.** S3 (`docs/plans/S3-audit-log-parser.md`) and S4
(`docs/plans/S4-manifests-spaces-project-assignment.md`), both done and green.
S8–S18 consume the `Report` type this session defines.

---

## 0. Read this first — environment facts

You are working in the repository root. Use absolute paths everywhere: the Bash
tool resets its working directory between calls.

**`poc/` and `reference-material/` are present in this worktree.** Both are
gitignored; `git status` is clean and must stay clean.

- `poc/cowork_costs.py` is **the authority** for the grouping logic. Read
  `summarize()`, `group_projects()` and the `by_day` block inside
  `print_report()` before writing anything. Where this plan and the POC
  disagree, the POC wins and you stop and say so — **with one loud exception,
  §2 Q9: the POC's rounding is a defect and is deliberately not ported.**
- `reference-material/` makes the US-1.3 regression locally verifiable. It is
  still not in Git and CI still cannot see it, so the spec that reads it must
  keep skipping cleanly when the directory is absent (§7).

**This session is pure frontend logic.** Nothing touches `src-tauri/`; no Rust,
no `cargo`. `npm test`, `npm run build`, `npm run lint`, `npm run format:check`
are the whole toolchain.

**Zero new dependencies.** Everything below is TypeScript plus what S3 and S4
already built. Do not add a date library, a lodash, an immutability helper, or a
decimal library. Integers and `Map` are sufficient.

**`tsc` sees every file under `src/`.** `include: ["src"]`, `strict: true`,
`noEmit: true`, and `npm run build` is `tsc && vite build`.

**Tests live next to the code; fixtures live in `test/`.** `vite.config.ts` sets
`test.include: ["src/**/*.{test,spec}.{ts,tsx}"]`. Every spec of this session
goes beside its module inside `src/model/`. New fixtures go in
`test/fixtures/sessions/`, alongside S3's `test/fixtures/audit/`. **Do not
change `test.include`.**

Tests may import `node:fs`. Production code under `src/model/` may not.

**One purity grep changes this session, deliberately.** S3 and S4 grepped
`src/model/` for `new Date\(`. S5 needs to turn an epoch millisecond into a
calendar day, which means `new Date(epochMs)` and `Date.parse(iso)`. Neither is
a clock: both are deterministic functions of their argument. The rule was never
"no `Date`", it was "no clock". The §8 grep is therefore narrowed to
`new Date\(\)` (the no-argument, now-reading form) and `Date\.now`, both of
which stay forbidden. **Do not widen it back, and do not call `new Date()` with
no argument or `Date.now()` anywhere under `src/model/`.**

**The repository is public.** No fragment of `reference-material/` may reach it:
not a project name, not a space id, not a session id, not a path, not a title,
not a prompt, not a line of a real audit log or manifest. Every byte of every
fixture in this session is invented. The regression spec of §7 reads the real
tree at runtime and asserts **counts and one total only**; anything it discovers
by name is `console.log`ged for a human and never written to disk. This plan
quotes no value from the real data.

---

## 1. Goal and scope

**Goal.** Roll the per-request records of S3, joined to the projects of S4, up
into one immutable `Report` object that every screen from S8 onward reads from.

**In scope.** `src/model/` only: totals per session, per project group and per
folder group; a per-model breakdown with variant strings kept distinct, global
and scoped; per-day and per-month buckets; sorting; the `Report` type itself;
the US-1.3 regression assertions added to the existing reference spec.

**Out of scope.**

- Anything that reads a file or walks a directory (S6/S7). This session receives
  already-resolved `ResolvedSession[]`.
- Any component, any CSS, any signal, any translation key (S8+).
- Any formatting whatsoever. No `/ 1e6`, no `toFixed`, no `Intl`, no
  `H:MM:SS` duration string, no percent sign. See §2 Q9.
- The date-range filter (S13). §5 step 1 iterates *individual requests*, which
  is the hook S13 needs; do not add the predicate now.
- The price table and the second cost figure (S15/S16).
- Title sorting (S9 — it needs an `Intl.Collator`, which is an i18n concern).

**The trap the roadmap flags.** Rounding, and it is not the trap it looks like.
See §2 Q9 and §6.

---

## 2. Decisions made in planning

Nine questions were put to the user. All nine are settled. Do not re-litigate
them in code, and do not re-open them in S8–S18 — the reasoning is recorded here
so a later session does not have to guess.

### Q1 — Day and month buckets use the user's local zone, injected as a pure function.

`result` timestamps are ISO-8601 UTC with a `Z` suffix. The POC buckets with a
plain string slice, `timestamp[:10]`, which is a **UTC** day. `src/model/` has
no clock and cannot ask the host what zone it is in.

```ts
/** Minutes east of UTC at a given instant. Injected so src/model stays pure. */
export type ZoneOffsetResolver = (epochMs: number) => number;
export const utcOffset: ZoneOffsetResolver = () => 0;
```

The state/services layer will supply `(ms) => -new Date(ms).getTimezoneOffset()`
in S8. Because the resolver is consulted **per instant**, that form is correct
across a DST transition; a single offset captured once would not be. Tests pass
fixed or deliberately DST-shifting resolvers and stay deterministic. The default
parameter is `utcOffset`, so a caller that does not care gets the POC's
behaviour.

*Why local and not UTC:* "what did I spend on Tuesday" means the user's Tuesday.
Under UTC, a German user's 00:30 session lands on the previous day, and S14's
per-month table moves end-of-month cost into the wrong month.

### Q2 — One eagerly-built frozen `Report`, carrying **both** groupings.

Not a set of selector functions, and not one grouping chosen by an option.
`Report` has `projectGroups` **and** `folderGroups`, both always populated.

*Why eager:* the dataset is 508 requests across 150 sessions. A full rebuild is
sub-millisecond, so NFR-2's two seconds is spent in file I/O, not here. One
object means `state/app-state.ts` holds one `computed` signal and every
component reads from it — no selector layer to keep consistent, no memoisation
bugs.

*Why both groupings:* S10's project/folder toggle then needs no rebuild at all,
and the entire class of "this report was built for the other grouping" bugs
disappears. The cost is one extra grouping pass over 150 rows.

*Why no selectors for US-2.3's scoped breakdown:* every `GroupRow` and every
`SessionRow` carries its own `ModelBreakdown`, so "globally and scoped to a
selected project or session" falls out of the shape.

### Q3 — `ConnectedFolder` regains `path`, because the grouping key needs it.

S4 Q8 dropped the full path, arguing that retaining a sensitive string with no
consumer is the worst of both worlds, and deferred it to S10's hover text. **S5
is the consumer S4 was waiting for**, and not for hover text — for the grouping
key.

A basename is a *wrong* key. Two unrelated projects each with a `src/` or a
`docs/` folder would merge into one bucket and silently mis-attribute cost. That
is the one class of bug this product cannot afford. The key is therefore derived
from the normalised full path.

```ts
export interface ConnectedFolder {
  /** Basename only — what the UI shows (US-2.4). */
  readonly display: string;
  /**
   * Normalised full path (backslashes → "/", trailing separators stripped), or
   * null when the manifest gave no path-like value. SENSITIVE (NFR-6):
   * the grouping key is derived from it, S10 may put it in hover text, and
   * S19 MUST strip it from every export. It never reaches a `Problem`.
   */
  readonly path: string | null;
  /** "local" | "network-drive" | anything else observed. */
  readonly kind: string | null;
}
```

Its containment is part of the deal: `src/model/report-privacy.test.ts` (§9)
asserts that no `Problem` produced while building a report contains a path
separator, and that a `SessionRow` has no `cwd`, `systemPrompt`,
`initialMessage` or `instructions` field.

### Q4 — One combined bucket per folder **set**. Manifest order is preserved.

The POC joins a session's folder display names with `" + "` into a single group.
Splitting one session's cost across several folders would need an arbitrary
allocation rule and would break the total row.

```ts
export type FolderRef =
  | { readonly kind: "none" }
  | {
      readonly kind: "folders";
      readonly key: string;
      readonly folders: readonly ConnectedFolder[];
    };
```

`key` is each folder's `path` — falling back to its `display` where `path` is
null — joined with `"\u0000"`, **in manifest order, not sorted**. NUL is not
legal in a JSON-sourced path, which is the same collision-proofing S4 used for
`projectKey`. The no-folder bucket is the literal `"\u0000none"`.

Order is preserved rather than sorted so the label reads the way the manifest
wrote it. The consequence is accepted: a session with folders `[A, B]` and a
session with `[B, A]` are two buckets.

The invariant this buys, and which §9 tests enforce: **every session lands in
exactly one bucket in each grouping**, so the group totals sum exactly to the
report total. That is what makes US-2.1's total row trustworthy.

Network drives are not precomputed into a boolean — the group keeps its
`folders` array, and S10 marks any member whose `kind` is `"network-drive"`.

### Q5 — Model costs and the authoritative total are kept separate and never mixed.

US-2.3 says the model breakdown is derived from `modelUsage`. US-1.3 says the
total comes from `total_cost_usd`. They need not agree to the micro-USD.

- Session, group and report **totals** sum `request.costMicroUsd` — the
  authoritative figure.
- `ModelBreakdown` sums `models[].costMicroUsd` and exposes **its own**
  `costMicroUsd`, clearly labelled as not authoritative.

The UI computes each model's share against `breakdown.costMicroUsd`, so shares
sum to 100% and no row is distorted by a discrepancy. If a discrepancy exists in
the real data it stays visible, and S16 (transparency) can surface it.
Normalising it away against the authoritative total would be the wrong kind of
tidy.

Shares themselves: the model layer stays integer and exports exactly one helper,
`costShare(partMicroUsd, totalMicroUsd): number`, returning `0` when the total
is `0`. A ratio is not display rounding, and one helper beats six divide-by-zero
guards scattered through S10.

### Q6 — "Total duration" is the sum of request `durationMs`.

The POC's definition. `durationApiMs` is summed alongside it, because S11 wants
the API-versus-wall split and it costs one integer.

Explicitly **not** the wall-clock span from first to last timestamp: sessions
have idle gaps, and the POC's reference transcript reports a sum of request
durations. Formatting to `H:MM:SS` is S8's job via i18n, never the model's.

### Q7 — The US-1.3 regression extends the existing reference spec. No standalone script.

`src/model/reference-distribution.test.ts` already walks the real tree,
self-skips via `describe.skipIf` when `reference-material/` is absent (as in
CI), and performs the discovery, manifest, spaces and resolve steps the
regression needs. Duplicating that walker in a `.mjs` script would need `tsx` or
a build step to import TypeScript, and would drift from source.

The named command the roadmap asks for is a `package.json` script:

```json
"regression": "vitest run src/model/reference-distribution.test.ts"
```

It is still not in CI, because the spec skips itself where the data is absent.

### Q8 — Requests with no usable timestamp are counted, not dropped, and raise no `Problem`.

A `result` line whose `timestamp` is null or unparseable cannot be bucketed by
day or month, but its cost is real and must stay in the totals.

`Report.undated = { requests, costMicroUsd }`. Day and month buckets therefore
sum to `totals.costMicroUsd - undated.costMicroUsd`, and §9 asserts exactly that
identity.

No `Problem`: a `Problem` is for a parse failure, and a missing optional field
on an otherwise valid record is a data gap. This product's habit for gaps is to
count them and show them (US-1.5). S14 can render "n requests without a
timestamp" beside the trend table.

### Q9 — **There is no rounding in this session. The POC's `round(cost, 4)` is not ported.**

This is the trap the roadmap flags, and it is the single most important rule in
this document.

- Every cost field produced by this session is an **integer micro-USD**.
- `/ 1e6` appears **nowhere** under `src/model/`. Neither does `toFixed`,
  `Math.round` on a cost, `Number.parseFloat`, or any other float step.
- The division by `1e6` happens exactly once, in the UI, in S8.
- The POC's `summarize()` does `round(cost, 4)` per session before summing, and
  `group_projects()` rounds again per project. **Do not reproduce either.** That
  intermediate rounding is precisely why the POC prints `1413.58` where the
  exact sum is `1413.59`. Verified against the reference data during S3.
- The regression of §7 compares against the **exact** sum, not against the
  POC's printed total.

`Math.round` is permitted in exactly one place in this session: inside
`time-buckets.ts`, on an offset in minutes. Nowhere near a cost.

---

## 3. File inventory

### 3.1 Created — `src/model/`

| File | Content |
|------|---------|
| `report-types.ts` | Every type in §4.2. Types only, no logic, no runtime export. |
| `time-buckets.ts` | `ZoneOffsetResolver`, `utcOffset`, `parseTimestamp`, `dayKey`, `monthKey`. |
| `folder-grouping.ts` | `folderRefOf`, `folderKey`. |
| `totals.ts` | The `CostTotals` and `ModelBreakdown` accumulators. |
| `report.ts` | `buildReport`, `costShare`, the comparators. |

Five production files. Inside the sizing rule.

### 3.2 Created — tests

| File | Covers |
|------|--------|
| `src/model/time-buckets.test.ts` | §9.1 |
| `src/model/totals.test.ts` | §9.2 |
| `src/model/folder-grouping.test.ts` | §9.3 |
| `src/model/report.test.ts` | §9.4 |
| `src/model/report-privacy.test.ts` | §9.5 |

### 3.3 Created — fixtures, `test/fixtures/sessions/`

Only what S3 and S4 do not already provide. Reuse their fixtures for everything
else; do not duplicate them.

1. A manifest with **two** connected folders, to exercise the combined bucket.
2. Two manifests whose folders share a **basename** but have different full
   paths, to prove Q3's key choice.
3. A manifest whose only folder entry has no path-like value, so `path` is null
   and the key falls back to `display`.
4. An audit log with a `result` line whose `timestamp` is absent, for Q8.

Every value invented. Obviously fake folder names. No German project names, no
umlaut-bearing real folder names, nothing recognisable.

### 3.4 Changed in place

| File | Change |
|------|--------|
| `src/model/project-types.ts` | `ConnectedFolder` gains `readonly path: string \| null`; new `FolderRef` union, placed directly beside `ProjectRef`. |
| `src/model/manifest.ts` | `foldersOf()` retains the normalised full path alongside the basename. `display` semantics are unchanged. |
| `src/model/manifest.test.ts` | Existing folder cases extended to assert `path`. |
| `src/model/reference-distribution.test.ts` | The US-1.3 assertions of §7. |
| `package.json` | The `"regression"` script of §2 Q7. |
| `CLAUDE.md` | One short block appended under "Data Model Essentials" — see §11. |

### 3.5 Explicitly NOT touched

`src/model/audit-parser.ts`, `audit-types.ts`, `encoding.ts`, `numbers.ts`,
`session-id.ts`, `problems.ts`, `spaces.ts`, `project-assignment.ts`. S5 adds no
`ProblemKind`. S5 changes no parser behaviour. If you find yourself editing the
parser, you have misread the plan.

`src/i18n/`, `src/components/`, `src/state/`, `src-tauri/`, `vite.config.ts`,
`tsconfig.json`, `eslint.config.js`.

### 3.6 No UI

Not one line. No `.tsx`, no CSS, no translation key. The labels
`(ohne Projekt)` and `(ohne verbundenen Ordner)` are **not** added to the
catalogues in this session — S8 and S10 add them when they render them, exactly
as S4 Q9 decided. The model emits `{ kind: "none" }` and the UI translates it.

---

## 4. Boundary types and signatures

Write these verbatim. S8–S18 are planned against them.

### 4.1 `src/model/project-types.ts` — the two changes

```ts
export interface ConnectedFolder {
  /** Basename only — what the UI shows (US-2.4). */
  readonly display: string;
  /**
   * Normalised full path (backslashes → "/", trailing separators stripped), or
   * null when the manifest gave no path-like value. SENSITIVE (NFR-6): S19
   * MUST strip it from every export, and it never reaches a `Problem`. It
   * exists because the folder grouping key of S5 cannot be a basename — two
   * unrelated `src/` folders would merge. See S5 plan §2 Q3.
   */
  readonly path: string | null;
  /** "local" | "network-drive" | anything else observed. */
  readonly kind: string | null;
}

/**
 * US-2.4's folder bucketing. The sibling of `ProjectRef`: a discriminated kind,
 * never a nullable name, because the UI translates "no connected folder" and
 * the model layer never imports `src/i18n/`. One session belongs to exactly one
 * bucket, keyed on its whole folder SET — see S5 plan §2 Q4.
 */
export type FolderRef =
  | { readonly kind: "none" }
  | {
      readonly kind: "folders";
      readonly key: string;
      readonly folders: readonly ConnectedFolder[];
    };
```

### 4.2 `src/model/report-types.ts`

```ts
import type { Problem } from "./problems.js";
import type { FolderRef, ProjectRef, ScanGaps } from "./project-types.js";

export interface TokenTotals {
  readonly inputTokens: number;
  /** From RESULT lines only — never from an assistant line (MAP.md §4.1). */
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheCreation1hInputTokens: number;
  readonly cacheCreation5mInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly webSearchRequests: number;
  readonly webFetchRequests: number;
}

export interface CostTotals {
  /** Integer micro-USD. Divided by 1e6 exactly once, in the UI. Never here. */
  readonly costMicroUsd: number;
  readonly requests: number;
  /** Requests with is_error true. They still contribute cost. */
  readonly errorRequests: number;
  readonly numTurns: number;
  /** Sum of request durationMs — US-2.1's "total duration". See plan §2 Q6. */
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly subagentsSpawned: number;
  readonly tokens: TokenTotals;
}

export interface ModelTotal {
  /** The exact modelUsage key. The "[1m]" suffix is NEVER normalised away. */
  readonly model: string;
  readonly costMicroUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly webSearchRequests: number;
  /** result lines that mentioned this model. */
  readonly requests: number;
}

export interface ModelBreakdown {
  /** Cost descending, then model name ascending. */
  readonly models: readonly ModelTotal[];
  /**
   * Sum over `models`, from `modelUsage`. NOT the authoritative total — that is
   * `CostTotals.costMicroUsd`, from `total_cost_usd`. Shares are computed
   * against THIS figure so they sum to 100%. See plan §2 Q5.
   */
  readonly costMicroUsd: number;
}

export interface SessionRow {
  readonly sessionId: string;
  readonly sourceId: string;
  /** "" when there is no manifest. */
  readonly title: string;
  readonly hasManifest: boolean;
  readonly isArchived: boolean;
  readonly isStarred: boolean;
  readonly project: ProjectRef;
  readonly folder: FolderRef;
  /** Manifest model, falling back to the system/init model. */
  readonly model: string | null;
  readonly openRequests: number;
  /** Raw ISO strings, min/max lexicographically — all are the UTC "Z" form. */
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
  /** Manifest epoch ms, or null. */
  readonly lastActivityAt: number | null;
  readonly totals: CostTotals;
  readonly models: ModelBreakdown;
}

/** The UI maps a "none" kind to a translated label. The model never does. */
export type GroupLabel =
  | { readonly kind: "project"; readonly project: ProjectRef }
  | { readonly kind: "folder"; readonly folder: FolderRef };

export interface GroupRow {
  /** `projectKey(...)` or `folderKey(...)`. Stable across rebuilds. */
  readonly key: string;
  readonly label: GroupLabel;
  /** Cost descending, sessionId ascending as tie-break. */
  readonly sessions: readonly SessionRow[];
  readonly sessionCount: number;
  readonly totals: CostTotals;
  readonly models: ModelBreakdown;
}

export interface TimeBucket {
  /** "YYYY-MM-DD" for days, "YYYY-MM" for months, in the resolved zone. */
  readonly key: string;
  readonly costMicroUsd: number;
  readonly requests: number;
  readonly durationMs: number;
}

export interface UndatedTotals {
  readonly requests: number;
  readonly costMicroUsd: number;
}

export interface Report {
  /** Every session, cost descending. */
  readonly sessions: readonly SessionRow[];
  /** US-2.1. Cost descending. */
  readonly projectGroups: readonly GroupRow[];
  /** US-2.4. Cost descending. */
  readonly folderGroups: readonly GroupRow[];
  /** US-2.1's total row. */
  readonly totals: CostTotals;
  /** US-2.3, global. */
  readonly models: ModelBreakdown;
  /** Key ascending. */
  readonly byDay: readonly TimeBucket[];
  /** Key ascending. */
  readonly byMonth: readonly TimeBucket[];
  /** Requests whose timestamp could not be read. See plan §2 Q8. */
  readonly undated: UndatedTotals;
  /** S4's summarizeGaps, passed through unchanged. */
  readonly gaps: ScanGaps;
  readonly problems: readonly Problem[];
}
```

Note what is deliberately absent: no `cwd`, no `systemPrompt`, no
`initialMessage`, no `instructions`, no `emailAddress`, no float `costUsd`, no
formatted string, no German literal, no percentage.

### 4.3 `src/model/time-buckets.ts`

```ts
/** Minutes east of UTC at a given instant. Injected so src/model stays pure. */
export type ZoneOffsetResolver = (epochMs: number) => number;

/** The default. Reproduces the POC's UTC-day bucketing. */
export const utcOffset: ZoneOffsetResolver;

/**
 * Strict ISO-8601 → epoch ms. Returns null for null, "", and anything
 * `Date.parse` cannot read. Deterministic: not a clock.
 */
export function parseTimestamp(iso: string | null): number | null;

/** "YYYY-MM-DD" in the zone the resolver reports for that instant. */
export function dayKey(epochMs: number, zone?: ZoneOffsetResolver): string;

/** "YYYY-MM" in the zone the resolver reports for that instant. */
export function monthKey(epochMs: number, zone?: ZoneOffsetResolver): string;
```

Implementation note: shift with the offset, then read the calendar fields with
`getUTCFullYear` / `getUTCMonth` / `getUTCDate` on `new Date(shifted)`. Pad to
two digits. Do **not** use `getFullYear` and friends — those read the host zone
and would make the function impure.

```ts
const shifted = epochMs + Math.round(zone(epochMs)) * 60_000;
```

`Math.round` here is on minutes, not on money.

### 4.4 `src/model/folder-grouping.ts`

```ts
import type { ConnectedFolder, FolderRef } from "./project-types.js";

/** The no-folder bucket. NUL-prefixed so no real path can collide with it. */
export const NO_FOLDER_KEY = "\u0000none";

/**
 * A session's folder set as one bucket. Manifest order is preserved, not
 * sorted — see plan §2 Q4. Key segments are `path`, falling back to `display`.
 */
export function folderRefOf(folders: readonly ConnectedFolder[]): FolderRef;

export function folderKey(ref: FolderRef): string;
```

### 4.5 `src/model/totals.ts`

```ts
import type { RequestRecord } from "./audit-types.js";
import type { CostTotals, ModelBreakdown } from "./report-types.js";

export interface TotalsAccumulator {
  add(request: RequestRecord): void;
  /** Fold an already-computed subtotal in. Used when rolling sessions into groups. */
  merge(other: CostTotals): void;
  /** A frozen snapshot. Safe to read repeatedly. */
  readonly value: CostTotals;
}
export function createTotalsAccumulator(): TotalsAccumulator;

export interface ModelAccumulator {
  add(request: RequestRecord): void;
  merge(other: ModelBreakdown): void;
  /** Frozen; `models` sorted cost desc, then model name asc. */
  readonly value: ModelBreakdown;
}
export function createModelAccumulator(): ModelAccumulator;

/** All-zero totals. Used for the empty report and as a merge identity. */
export const EMPTY_TOTALS: CostTotals;
export const EMPTY_MODEL_BREAKDOWN: ModelBreakdown;
```

Every field of both accumulators is an integer. `add` reads
`request.costMicroUsd` for `CostTotals` and `request.models[].costMicroUsd` for
`ModelBreakdown` — never the other way round (§2 Q5).

### 4.6 `src/model/report.ts`

```ts
import type { Problem } from "./problems.js";
import type { ResolvedSession } from "./project-types.js";
import type { GroupRow, Report, SessionRow } from "./report-types.js";
import type { ZoneOffsetResolver } from "./time-buckets.js";

export interface ReportOptions {
  /** Defaults to `utcOffset`. See plan §2 Q1. */
  readonly zone?: ZoneOffsetResolver;
}

/**
 * The one entry point. Pure, O(requests), and frozen all the way down.
 * S13 will add an optional per-request predicate here; the loop is already
 * request-granular so that it can.
 */
export function buildReport(
  sessions: readonly ResolvedSession[],
  problems: readonly Problem[],
  options?: ReportOptions,
): Report;

/** part / total as a 0..1 ratio; 0 when total is 0. Not a display rounding. */
export function costShare(partMicroUsd: number, totalMicroUsd: number): number;

export type SortDirection = "asc" | "desc";
export type RowSortField = "cost" | "requests" | "duration" | "lastActivity";

export function compareSessionRows(
  field: RowSortField,
  direction: SortDirection,
): (a: SessionRow, b: SessionRow) => number;

export function compareGroupRows(
  field: RowSortField,
  direction: SortDirection,
): (a: GroupRow, b: GroupRow) => number;
```

Every comparator tie-breaks on `sessionId` / `key` **ascending**, so the order
is total and stable across runs regardless of input order. A `null`
`lastActivity` sorts last in both directions.

`compareGroupRows` has no `"lastActivity"` data of its own — derive it from the
maximum `lastActivityAt` of the group's sessions, or `null` when the group has
none.

**No title sorting here.** US-2.2 wants it, but it needs an `Intl.Collator` for
the active locale, which the model layer may not reach for. S9 adds it with the
collator injected.

---

## 5. The algorithm

One pass over requests, then two cheap grouping passes over sessions.

1. **Per session.** Walk `audit.requests` once. For each request, feed:
   - the session's `TotalsAccumulator`,
   - the session's `ModelAccumulator`,
   - the global day map and the global month map, keyed by
     `dayKey(parseTimestamp(request.timestamp), zone)` — or the `undated`
     counters when `parseTimestamp` returns null (§2 Q8),
   - the running min/max of the non-null raw `timestamp` strings
     (lexicographic comparison is correct for the UTC `Z` form).

   Emit a `SessionRow`. `title` is `meta?.title ?? ""`, `hasManifest` is
   `meta !== null`, `model` is `meta?.model ?? audit.initModel`, `folder` is
   `folderRefOf(session.folders)`, `project` is `session.project` unchanged.

2. **Group twice.** Once by `projectKey(row.project)` (S4's function, unchanged)
   and once by `folderKey(row.folder)`. Merge the **already-computed** session
   totals and model breakdowns with `merge(...)`; do **not** re-walk requests.
   The first row to create a bucket fixes its `label`.

3. **Global totals.** Merge the group totals of one grouping — either one, they
   are equal, which §9 asserts. The global `ModelBreakdown` is merged the same
   way.

4. **Sort.** Groups by cost descending (`key` ascending as tie-break); sessions
   inside each group by cost descending (`sessionId` ascending as tie-break);
   `Report.sessions` the same way. `byDay` and `byMonth` by `key` ascending —
   lexicographic ordering is chronological for `YYYY-MM-DD` and `YYYY-MM`.

5. **Freeze.** `Object.freeze` every object and every array returned, as S4 does
   for `ResolvedSession`.

Empty input is a valid input: it yields a report with empty arrays,
`EMPTY_TOTALS`, `EMPTY_MODEL_BREAKDOWN`, and zeroed `undated`. It must not
throw.

---

## 6. The rounding rule, restated

Read §2 Q9 again before writing `totals.ts`.

- No `/ 1e6` under `src/model/`.
- No `toFixed` under `src/model/`.
- No `Math.round` applied to anything denominated in money.
- No per-session or per-group rounding. The POC does both and is wrong by a
  cent because of it.
- `costShare` is the only division in the session, and it divides two integers
  into a ratio, not into a currency amount.

§8 has a grep for each of these. They must print nothing.

---

## 7. The US-1.3 regression

`src/model/reference-distribution.test.ts` keeps its existing structure: the
`walk` helper, the `describe.skipIf(!existsSync(dir))` guard, the
`CLAUDE3P_REFERENCE_DIR` override, the counts it already asserts. Add
`buildReport` to the end of the existing case and assert:

```ts
const report = buildReport(resolved, problems.problems);

expect(report.sessions).toHaveLength(150);
expect(report.totals.requests).toBe(508);
expect(report.projectGroups).toHaveLength(7);
expect(Math.round(report.totals.costMicroUsd / 10_000) / 100).toBe(1413.59);
```

That last line is the one permitted division by a power of ten in the whole
session, and it is in a **test**, at the assertion boundary, not in
`src/model/` production code.

Also `console.log` — never assert — the exact `report.totals.costMicroUsd`
integer and `report.folderGroups.length`. A human reads them once. The exact
micro-USD integer is worth reporting upward for `LEARNINGS.md`, so a future
session can pin it without re-deriving it. The folder-group count is **not**
asserted: it has never been measured, and guessing a number into a test is how a
regression suite starts lying.

The command:

```bash
npm run regression
```

It is not in CI. The spec skips itself where `reference-material/` is absent.

---

## 8. Exit criteria

Run everything from the repository root.

```bash
# 1. Tests green, reference spec RUNNING (reference-material/ is present here)
npm test

# 2. The reference spec skips cleanly when the data is absent — as it will in CI
CLAUDE3P_REFERENCE_DIR=/nonexistent npm test

# 3. The named regression command exists and passes
npm run regression

# 4. Type-check and production build clean
npm run build

# 5. Lint and format
npm run lint
npm run format:check

# 6. No dependency crept in — MUST print nothing but the "regression" script line
git diff -- package.json package-lock.json

# 7. Nothing untracked or ignored got committed
git status --short

# 8a. The model layer is pure — MUST print nothing.
#     NOTE the narrowed Date rule of §0: new Date(epochMs) and Date.parse are
#     allowed; new Date() with no argument and Date.now are not.
grep -rnE "@tauri-apps|node:fs|node:path|localStorage|document\.|window\.|new Date\(\)|Date\.now" src/model/ --include=*.ts | grep -v ".test.ts"

# 8b. The model layer does not import i18n or state — MUST print nothing
grep -rn "from \"\.\./i18n\|from \"\.\./state" src/model/ --include=*.ts

# 8c. No German display literal in the model — MUST print nothing
grep -rniE "ohne Projekt|ohne verbundenen" src/model/

# 8d. No host-zone calendar reads — MUST print nothing
grep -rnE "getFullYear|getMonth\(|getDate\(|getHours|getTimezoneOffset" src/model/ --include=*.ts | grep -v ".test.ts"

# 8e. THE ROUNDING RULE — all three MUST print nothing
grep -rn "1e6\|1_000_000" src/model/ --include=*.ts | grep -v ".test.ts"
grep -rn "toFixed" src/model/ --include=*.ts
grep -rniE "Math\.round" src/model/ --include=*.ts | grep -v "time-buckets.ts" | grep -v ".test.ts"

# 8f. No reference data leaked into fixtures or specs — MUST print nothing
# Build the alternation from the real ids and project names in the local,
# gitignored reference-material/ tree; never write them into a committed
# document (NFR-6, CLAUDE.md "Privacy Rules").
grep -rniF -f reference-names.txt test/ src/model/
```

Grep 8f is a floor, not a ceiling. It catches the identifiers `MAP.md` happens
to name; it cannot catch a real folder name, title or space id you pasted in.
The rule in §3.3 — every byte invented — is the actual guarantee.

Note on 8e: `numbers.ts` already contains `Math.round(value * 1e6)` from S3.
That file is not touched this session; if the grep surfaces it, confirm the line
is S3's and unchanged, and move on. Nothing **new** may match.

---

## 9. Tests, by name

Write these names. A reviewer reads the list to check coverage.

### 9.1 `src/model/time-buckets.test.ts`

- `parseTimestamp returns null for null, empty and non-ISO input`
- `parseTimestamp reads the Z-suffixed ISO form used by the audit logs`
- `dayKey and monthKey agree with the POC's string slice under a UTC zone`
- `a positive offset moves a late-evening UTC instant to the next local day`
- `a negative offset moves an early-morning UTC instant to the previous local day`
- `the resolver is consulted per instant, so a DST change splits two days correctly`
- `month and year rollovers produce the right key`
- `keys are zero-padded to a fixed width so lexicographic order is chronological`

### 9.2 `src/model/totals.test.ts`

- `an empty accumulator is all zeroes`
- `costs accumulate as exact integers where the float sum would drift`
- `output tokens come from the result usage block only`
- `error requests are counted separately but still contribute cost`
- `merge is equivalent to adding the same requests`
- `model variants claude-opus-5 and claude-opus-5[1m] stay separate rows`
- `models are sorted by cost descending with the model name as tie-break`
- `the model breakdown total is independent of the authoritative cost total`

### 9.3 `src/model/folder-grouping.test.ts`

- `no folders yields kind none`
- `two folders with the same basename but different paths get different keys`
- `the folder key cannot collide with the no-folder bucket`
- `multiple folders on one session form a single combined bucket`
- `a folder with a null path falls back to its display in the key`
- `manifest order is preserved, so two orderings are two buckets`
- `network-drive kind survives into the FolderRef`

### 9.4 `src/model/report.test.ts`

- `an empty session list yields a zeroed report, not a crash`
- `project group totals sum exactly to the report total`
- `folder group totals sum exactly to the report total`
- `every session appears in exactly one project group and exactly one folder group`
- `groups are sorted by cost descending with a stable tie-break`
- `sessions within a group are sorted by cost descending`
- `the global model breakdown equals the merge of the per-group breakdowns`
- `a session-scoped model breakdown is a subset of its project's`
- `day buckets plus undated cost equal the report total`
- `month buckets equal the day buckets rolled up`
- `requests with no timestamp land in undated and are not dropped`
- `no rounding happens anywhere: the total is the exact integer sum`
- `gaps and problems pass through unchanged`
- `costShare returns 0 for a zero total`
- `comparators are stable and total in both directions`

The "no rounding" case must be constructed so that it *can* fail: build requests
whose naive float sum differs from the exact integer sum, and assert the integer.

### 9.5 `src/model/report-privacy.test.ts`

- `a SessionRow carries no cwd, systemPrompt, initialMessage or instructions field`
- `no Problem emitted while building a report contains a path separator`
- `the full folder path is reachable only through ConnectedFolder.path`

Run these against fixtures that actually *contain* a `systemPrompt`, an
`initialMessage` and an absolute-looking path, so the test can fail.

---

## 10. Three things that will bite you

**1. Rounding, and it is not where you expect.** You will be tempted to round
per session "so the numbers look clean", because the POC does exactly that. That
is the bug. The exact sum and the POC's printed sum differ by a cent, and the
exact sum is the one the requirement names. Keep integers all the way to S8.
§2 Q9, §6 and grep 8e all exist because of this one temptation.

**2. The folder grouping key is not the basename.** `foldersOf()` in
`manifest.ts` currently produces basenames and throws the path away. You are
changing that. If you group on `display` instead of `path`, every test in §9.3
that matters still passes on a careless fixture, and the real data silently
merges unrelated folders. Build fixture 2 of §3.3 first, then write the key.

**3. `getFullYear` is not `getUTCFullYear`.** The local-zone shift is applied
arithmetically to the epoch value, and the calendar fields are then read in
UTC. Reading them with the host-zone getters applies the offset a second time —
the result is right on your machine in winter and wrong in CI. Grep 8d catches
it.

---

## 11. The `CLAUDE.md` note

Append to "Data Model Essentials", after the existing `ProjectRef` bullet. Keep
it to this:

- **`Report` is one frozen object, built eagerly, carrying both groupings.**
  `src/model/report.ts`, S5. `projectGroups` and `folderGroups` are both always
  populated, so S10's toggle rebuilds nothing. Every `GroupRow` and `SessionRow`
  carries its own `ModelBreakdown`, which is what makes US-2.3's scoped
  breakdown free. `ModelBreakdown.costMicroUsd` is the sum over `modelUsage`
  and is **not** the authoritative total — that is `CostTotals.costMicroUsd`,
  from `total_cost_usd`; shares are computed against the former so they sum to
  100%. Day and month buckets use a `ZoneOffsetResolver` injected by the caller
  (defaulting to UTC), because the model layer has no clock. `FolderRef` mirrors
  `ProjectRef`: one bucket per folder **set**, keyed on normalised full paths in
  manifest order, displayed as basenames. `ConnectedFolder.path` is sensitive
  and S19 must strip it from exports.

---

## 12. Commit

One commit at the end, message in English, following the form of S1–S4:

```
S5: aggregation into the Report type (US-2.1, US-2.3, US-2.4)
```

`git status` must be clean afterwards, with `poc/` and `reference-material/`
still untracked and still ignored.

---

## 13. Requirements coverage

### Satisfied by this session

| Criterion | How |
|---|---|
| US-2.1 — projects sorted by cost descending; sessions, requests, cost and total duration per project; a total row | `Report.projectGroups` (cost desc) and `Report.totals`. Data only. |
| US-2.3 — model breakdown from `modelUsage`, cost and the basis for shares, variants kept distinct, global **and** scoped to a project or session | `Report.models`, `GroupRow.models`, `SessionRow.models`, `costShare`. |
| US-2.4 — grouping by connected folder, `resolvedFolderKinds` with the `userSelectedFolders` fallback, basenames, the no-folder bucket, network-drive information | `Report.folderGroups`, `FolderRef`, `ConnectedFolder`. Data only. |
| US-1.3 criterion 5 — the whole-tree regression, 1,413.59 USD / 150 sessions / 508 requests / 7 projects | §7, `npm run regression`. |
| Per-day and per-day-rolled-to-month buckets | `Report.byDay`, `Report.byMonth`. |

### Explicitly deferred

| Thing | Session |
|---|---|
| US-2.1's table, total row, locale formatting, the 2-second budget (NFR-2) | **S8** |
| US-2.2's drill-down UI, and sorting by **title** (needs an `Intl.Collator`) | **S9** |
| US-2.3's UI; US-2.4's toggle, hover text and network-drive marker; US-1.5's gap indicators | **S10** |
| The `(ohne Projekt)` and `(ohne verbundenen Ordner)` translation keys | **S8** / **S10** |
| Per-request date-range filtering | **S13** |
| The per-day and per-month tables | **S14** |
| Charts over these buckets | **S18** |
| Stripping `ConnectedFolder.path` and titles from exports | **S19** |
