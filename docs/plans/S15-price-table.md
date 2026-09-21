# S15 — Price table: storage and editor

**Stories.** US-4.2 (`MUST`). Carried alongside: US-1.6 (`MUST`, and this
session is the first that could break it — see §0.2), NFR-5 (nothing is ever
fetched; the defaults are baked in), NFR-7 (every new string through both
catalogues; every displayed number and date through `Intl`), NFR-11 (keyboard
operation, no state by colour alone), NFR-6 (nothing exported carries a path, an
id or free text), NFR-3 (nothing here throws), NFR-8 (deviation bookkeeping in
two files), NFR-9 (this session's own Playwright spec).
**Depends on.** S7 (`@tauri-apps/plugin-dialog`, `grant_read_access`,
`src-tauri/capabilities/default.json`, `read-only-guarantee.test.ts`), S8 (the
Playwright harness and the `--mode e2e` alias mechanism), S5 (`ModelTotal`,
`ModelBreakdown`), S10 (`GroupingToggle`'s segmented-control idiom), S2
(`src/i18n/`).
**Feeds.** S16 (`priceTable` is the signal it recomputes from; §1 hands it a
quantified discrepancy it must not mistake for a bug), S17 (the `view` switch is
the seed of the settings screen), S19 (the file-write mechanism decided here is
the one CSV export should reuse), S21 (the settings screen `view` grows into).
**Status.** Planned 2026-09-21. Approved by the user; all nine design questions
are decided below and none is left open. **Sized as over budget by the planner
and run deliberately anyway — see §0.1.**

**Goal.** The user can see and change the prices used for recomputation: a
per-model table shipped pre-filled with Anthropic's public list prices, editable,
resettable, persisted, and exchangeable as JSON through the native file dialog.

---

## 0. Read this first

### 0.1 Accepted risk: this session is deliberately over budget

**This is recorded here so a future reader finds it without reconstructing it
from a transcript.**

The planning agent sized S15 as **over budget** and proposed splitting it. The
objection, in full: the session combines **a new layer** (the first Tauri
commands beyond S7's two, the first Rust unit tests, `cargo test` joining the
exit set) **with a new I/O capability** (a filesystem write, in an app whose
read-only property is a `MUST`) **on top of an already-full vertical** (a
five-column editable table, a defaults table, a persistence store and a new app
view). The standing constraint is "never a new layer and a new dependency at
once"; this breaks it in two places simultaneously.

Three split options were put to the user — (1) S15 + a short S15b for the JSON
transport, (2) folding the transport into S19, (3) S15 with export only — along
with "keep everything in S15 as scoped". **The user chose to keep everything in
S15, after seeing the objection stated plainly.** That decision stands and is not
re-argued here.

The two mitigations, both binding on the implementer:

1. **Phased ordering (§5), safety-critical work first.** The read-only guard is
   restructured *before* any code exists that would need its new allowlist
   entries, so the guard is watching when the write lands rather than being
   widened after the fact to accommodate it. The Rust path-exclusion predicate
   and its tests land second, before any frontend code can call it. The
   negative controls for both are run **inside their own phase**, not batched to
   the end of the session where they are the first thing to be skipped.
2. **A named cut line (§5.6).** If the session overruns, Q9's collapsed
   "not in your data" section is dropped, and dropping it **needs no further
   approval**. Nothing else in this plan has that permission.

### 0.2 Why US-1.6 is the real risk in this session

Until now nothing in this app could write a file. US-4.2's "exported and
imported as JSON", answered with a native file dialog, changes that — in an app
whose acceptance criterion US-1.6 says no code path may write, rename, move or
delete anything near a session root, and whose only mechanical guarantee of that
is a name-level static analyser.

`LEARNINGS.md` is explicit about how such a guard fails:

- *"A name-level static guard must know the project's own import aliases, and is
  only as good as its last negative control."* This guard already failed once,
  on `import { invoke as tauriInvoke }`, and the miss was found by running a
  control rather than by reasoning about it.
- *"`fs:allow-open` is a write-capable permission"* — `commands::open` honours a
  caller-supplied `OpenOptions`, so the read-only property lives in the call
  sites, not in the capability file.
- *"A source-level grep guard … is a cheap tripwire, not a proof — pair the grep
  with a behavioural test that actually exercises the property."*

Two structural facts make this worse than it looks. First, **the guard's entry
set does not cover the app.** It starts from `scan.ts`, `discovery.ts`,
`filesystem.ts` and `filesystem-tauri.ts` only; `src/services/folder-picker.ts`
is already outside it and says so in its own header. A new export service,
reachable only from `app-state.ts`, would sit in the same blind spot — the guard
would pass cleanly over an app that had just grown a filesystem write. Second,
**the obvious fix is worse than the hole**: adding the new command to the flat
`ALLOWED_INVOKE_COMMANDS` buys a local exemption with a global loosening, after
which `scan.ts` may call the file writer too.

§2 and §5.1 resolve both. The short version: two graphs with two allowlists, and
the actual write guarantee moved into Rust where it can be checked against a
real filesystem rather than against a string in the WebView.

### 0.3 Traps from LEARNINGS that apply directly

1. **"A name-level static guard is only as good as its last negative control."**
   Eight controls (§5.1.4, §5.2.5), run in the phases they belong to. Controls 2
   and 6 are the two that would actually catch a wrong implementation.
2. **"`localeCompare` is the model layer's back door to i18n."**
   `buildPriceRows` orders default-only rows **by code unit**. No collator, no
   `localeCompare`, anywhere in `src/model/`.
3. **"An injectable dependency whose default agrees with the injection on every
   fixture is untested by construction."** `buildPriceRows` and
   `resolvePriceTable` take the default table as a **parameter**, and their
   tests inject a deliberately reversed synthetic table that no shipped constant
   could produce. An implementation that ignores the argument and reads
   `DEFAULT_PRICES` fails.
4. **"A regression pin computed from real data cannot prove a guard-rail that is
   a no-op on that data."** With `[1m]` defaults shipped (Q1), **every** model in
   the reference tree has a complete default, so US-4.2's "a model with no
   shipped default appears as an empty row" is inert against real data. It is
   covered by a **synthetic** fixture, and the regression run is never cited as
   coverage for it.
5. **"Preact keeps `false` for `data-*` and drops it for every other attribute
   name."** Edited marking is `data-edited` — a `data-` name on purpose — and
   **both** branches (`"true"` and `"false"`) are asserted.
6. **"`String(n)` inside a `t()` placeholder … silently breaks NFR-7 in German
   only."** Every count goes through `tNumber`, the as-of date through
   `formatDate`. A `grep -rn 'String(' src/components/` is in the exit set.
7. **"`Intl` emits U+00A0, and `no-irregular-whitespace` will not catch it
   inside a string literal."** This is why Q6 rejects locale-formatted text
   inside the edit field, and why every expected string in a test is derived
   from the formatter rather than typed.
8. **"NFR-8 deviation bookkeeping lives in two files."** `CLAUDE.md`'s stack
   table and `REQUIREMENTS.md`'s NFR-8 list are edited together (§5.5).
9. **"A bundle-grep guard must key on a string a live code path evaluates."**
   The second fake module (§5.4) gets its own marker, interpolated into an
   always-reachable failure path, and `check-no-fake.js` greps for both.
10. **"A raw `U+0000` survives `tsc`, ESLint and Prettier."** No sentinel keys
    here — price-table keys are plain model strings. The byte scan stays in the
    exit set.

---

## 1. What the reference data proves about prices

**Provenance and privacy.** The model strings below were **enumerated from the
gitignored `reference-material/` tree** by aggregating `modelUsage` keys across
`audit.jsonl` files. They are recorded here so no future session has to
re-derive them. A model ID is a product identifier published by Anthropic — not
user content: it names no person, project, path, prompt or response, and
`claude-opus-5[1m]` already appears verbatim in `CLAUDE.md`, `ROADMAP.md` and
`REQUIREMENTS.md`. **Per-model USD totals are deliberately omitted**: they are
finer-grained than anything currently committed (`LEARNINGS.md` holds one
aggregate) and they describe this user's usage pattern per model. Multipliers,
ratios and one percentage are sufficient to make every point below.

### 1.1 The eight cost-bearing model strings

These are the distinct `modelUsage` keys — i.e. exactly the keys
`ModelBreakdown` produces, and exactly the rows the editor pre-lists:

```
claude-fable-5[1m]     claude-opus-5          claude-sonnet-4-6
claude-haiku-4-5       claude-opus-5[1m]      claude-sonnet-5
claude-opus-4-7                               claude-sonnet-5[1m]
```

**Three of the eight are `[1m]` variants, and they carry roughly 57 % of the
logged cost.** `claude-haiku-4-5-20251001` and `claude-fable-5` occur as
`message.model` on assistant lines but **never** in `modelUsage`; they never
reach `ModelBreakdown` and are not price-table rows.

### 1.2 The pricing formula, confirmed against real billing

Method: least squares over ~500 individual `modelUsage` records (four unknowns
per model), then a fixed-hypothesis residual check over the whole tree.

**Three models reproduce their logged cost exactly, to zero residual**, under:

```
output        = 5.00 × input       (true for all eight; write it out, do not derive it)
cacheWrite5m  = 1.25 × input
cacheWrite1h  = 2.00 × input
cacheRead     = 0.10 × input
web search    = $0.01 per request
```

The three exact fits — `claude-haiku-4-5`, `claude-opus-4-7`,
`claude-sonnet-4-6` — are **precisely** the models whose assistant lines show
`ephemeral_5m_input_tokens = 0`. The remaining five overshoot by 1–10 % under a
flat `2.00 ×` cache-write assumption, and the overshoot is fully explained by
their 5 m writes being billed at `1.25 ×`. **This confirms the three cache
multipliers against real billing data rather than against documentation.**

### 1.3 `[1m]` variants are billed at base rates

`claude-sonnet-5[1m]` and `claude-sonnet-5` fit the *same* coefficients (implied
cache write ≈ 6.3 vs 6.0 per Mtok, cache read ≈ 0.29 vs 0.30). A long-context
premium of 2 × input / 1.5 × output would have made the `[1m]` prediction
undershoot by roughly half; it does not — it overshoots by the same ~10 % the
base model does, for the same 5 m-cache reason. `modelUsage` entries also carry
`contextWindow: 1000000`, `canonicalModel` and `provider: "foundry"`: `[1m]` is
the 1 M-token context window, and Foundry bills at standard Anthropic rates.

**This settles Q1 empirically.** It does not license stripping the suffix —
see Q1.

### 1.4 The web-search discrepancy, handed to S16

Web search is billed **per request** ($0.01, confirmed exactly), not per token,
so it has no place in a "USD per Mtok" table and S15 ships no sixth column
(Q8). But it is real money: across the reference tree it is **≈ 0.29 %** of the
logged total.

**S16 must treat this as a known, quantified discrepancy, not a bug.** With a
price table holding exactly the list prices, a recomputed total will sit ~0.3 %
*below* the logged one for that reason alone. S16's transparency view should say
so rather than letting a user hunt for a rounding error that is not there.

---

## 2. Design questions, all decided

### Q1 — Shipped default for a `[1m]` variant? → the same rates as the base model, as separate explicit rows

Rejected: **(a)** no default, leaving `[1m]` rows empty — §1.1 shows that would
leave ~57 % of the cost unpriced out of the box, and the AC's promise is that
"the recomputation works out of the box". **(b)** a runtime fallback that strips
`[1m]` and reuses the base price — this *is* the roadmap's stated trap wearing a
different hat: it normalises the suffix away at the exact moment it matters, and
it silently hides the day Anthropic starts charging a long-context premium.

**Decided:** one explicit `[1m]` row per base model — **16 default rows total**,
not only the three seen in this tree (a shipped row costs nothing, and the tree
is one machine's data). **No suffix-stripping fallback anywhere in the
codebase.** The two rows are independently editable, which is the whole point.

### Q2 — The "as of" date? → `DEFAULT_PRICES_AS_OF = "2026-09-21"`, a module constant

Not a build-time injected date: the defaults do not change when the app is
rebuilt, and a date that moves on every CI run is a lie. Not a `Date`:
`src/model/` has no clock, and a plain ISO day string stays diffable and
greppable next to the literals it describes.

The constant carries a comment stating the rule that nothing can mechanically
enforce: **whoever edits a price literal edits this constant in the same
commit.** A test pins the constant's *format* (§6).

### Q3 — Where does the editor live? → an app-bar view switch, not a settings screen

`CLAUDE.md` flags the settings screen as "S15+ / S21". Building it properly
means routing, relocating the language switcher, a settings layout, and deciding
whether to persist the grouping/trend/range preferences that S10, S13 and S14 all
deliberately left unpersisted. That is a session of its own and it will not fit
beside an editable table, a Rust layer and a guard restructure.

**Decided:** a two-chip segmented control in the app bar, `Übersicht | Preise`,
backed by one `view` signal — ~15 lines in `app.tsx`, reusing `GroupingToggle`'s
existing idiom and CSS. It is exactly the seed S21 grows into full settings, at
which point `<PriceTableEditor>` moves inside a settings panel unchanged. The
language switcher stays in the app bar for now.

**Editing is immediate, per field, on commit** (blur or Enter) — consistent with
S13's Q16 and with `setGrouping` / `setTrendGranularity`. No draft state, no
save button, no undo stack. (The rejected alternative was a modal dialog, which
implies transactional editing with Abbrechen/Speichern, needs focus trapping and
Escape handling for NFR-11, and is cramped for a five-column table at the app's
minimum width.)

### Q4 — Does JSON import replace or merge? → replace, behind an explicit in-app confirmation

A merge produces a table that is neither the file nor what you had, and after
which nothing in the UI can explain a figure. Worse, under a merge a partial
file leaves stale overrides for models it does not mention, so two users
importing the same file see different totals.

**Decided:** import replaces the **whole override set**. An imported value equal
to the shipped default is stored as **not** an override, so edited-vs-default
marking stays meaningful after an import instead of turning the entire table
orange. The confirmation is an in-app control (keyboard-operable, NFR-11), not
an OS modal — no `dialog:allow-ask` is added.

### Q5 — How is "unknown" represented? → three states, and the distinction is load-bearing

| State | Override map | Exported JSON | Meaning |
|---|---|---|---|
| default | key **absent** | value equals the default | never touched |
| edited | key present, a number | a number | the user's own rate |
| unknown | key present, **`null`** | `null` | the user deliberately cleared it |

These cannot be collapsed. Without the distinction, clearing a field silently
snaps back to the list price — the same class of dishonesty as counting it zero,
in a different disguise. A model with no shipped default *and* no override is
unknown by both routes, which is correct.

Because `tsconfig.json` does not set `exactOptionalPropertyTypes`,
`Partial<Record<F, number | null>>` cannot distinguish absent from `undefined`
at the type level. The override store is therefore a **nested `Map`**, where
presence is unambiguous in the type and at runtime.

### Q6 — Decimal separator in the edit field? → raw dot-decimal in, locale formatting only out

The NFR-7-maximal option — render `6,25` in a German build and parse it back —
round-trips `Intl` output through a parser, and that is a documented trap in
this repository: `formatNumber` emits U+00A0 (U+202F in some engines) as a group
separator, `no-irregular-whitespace` does not flag it inside string literals, and
a user who copies a formatted value back in gets an invisible failure.

NFR-7 governs **figures the app reports**. A field for entering a rate is input,
not a reported figure.

**Decided:** `<input type="text" inputmode="decimal">`; the parser accepts both
`.` and `,` as the decimal mark (a German user typing `6,25` must work) and
**rejects group separators outright**; the value is rendered into the field as
raw dot-decimal. Everywhere a price is *displayed* rather than edited — the
row's `Standard: …` hint — it goes through `formatNumber`.

### Q7 — Export/import transport? → the native file dialog, via two Rust commands

**User decision**, taken after seeing that it pulls part of S19 forward. The
planner had recommended a copy/paste textarea; that recommendation is on the
record and was not adopted.

The design decision that makes it tractable: **the save does not go through
`@tauri-apps/plugin-fs` at all.** `dialog.save()` returns a path string; the
obvious next step, `writeTextFile`, would need `fs:allow-write-text-file` plus a
scope entry and would permanently contradict the capability assertion in
`read-only-guarantee.test.ts`.

Instead, two Tauri commands (§5.2). Consequences:

- **The `fs:` permission list is literally unchanged.** The existing assertion
  keeps passing verbatim — no carve-out, no loosened regex. This is the single
  most valuable property of the design.
- The write is one Rust function, auditable in full, where the session-root
  exclusion is enforced against the real filesystem (realpath first, then
  confine) rather than against a string in the WebView.
- `BANNED_FS_NAMES`, the namespace-import ban, the `.write(`/`.writeText(`/
  `.truncate(` call check and the raw `plugin:fs|write` string check all stay in
  force, unchanged, over both graphs.

The capability delta is exactly one line: **`dialog:allow-save`**. It is the
narrowest thing that works — it returns a path and grants no fs access of its
own. `dialog:allow-open` is already present from S7 and is reused for import.

### Q8 — A sixth, web-search price column? → no

Web search is priced per request, not per token, so it does not belong in a
"USD per Mtok" table, and the AC names exactly five columns. `ModelPrice` gains
no sixth field. The quantified consequence is handed to S16 in §1.4.

### Q9 — Which models does the editor list? → in-data first, then the rest, collapsed

In-data rows first in `Report.models` order (cost descending — the same order
`ModelPanel` already shows), then the remaining shipped-default models in a
visually separated, **collapsed-by-default** "Weitere Modelle ohne Daten"
section. The AC requires models in the data to be pre-listed; it does not forbid
the rest, and hiding them means a user who has not yet run a Haiku session cannot
pre-enter its negotiated rate. Collapsing keeps the first screen to the rows that
matter.

**This section is the session's designated cut line — see §5.6.**

---

## 3. Acceptance criteria: satisfied and deferred

### Satisfied by S15 (US-4.2)

| AC | How |
|---|---|
| Editable table, one row per model, five columns in USD per Mtok | §5.5, `PRICE_FIELDS` fixes the column order |
| Ships pre-filled with Anthropic's public list prices | §5.3, `DEFAULT_PRICES`, 16 rows |
| Shipped defaults carry an "as of" date shown next to the table, with the NFR-5 note | `prices.asOf` + `prices.asOfNote`, rendered through `formatDate` |
| A row holding its shipped default is marked and distinguishable from an edited one | `data-edited` on the cell **plus** a text hint — never colour alone (NFR-11) |
| Reset action for a row and for the whole table | `resetPriceRow` / `resetAllPrices` |
| Models in the data pre-listed with the exact variant string | `buildPriceRows(report.models.models, …)`; `[1m]` never normalised |
| A model in the data with no shipped default appears as an **empty** row | `hasDefault: false`, all five cells `null`, a warning hint. **Synthetic fixture** — inert on real data, per §0.3 trap 4 |
| Persists across restarts | `price-store.ts`, `localStorage` key `claude3pcost.prices` |
| Exported and imported as JSON | §5.4, native file dialog |
| Never fetches or updates a price list over the network | No network call exists in any code added here (NFR-5) |

### Explicitly deferred to S16 — recorded so it is not mistaken for an oversight

> *"Empty fields mean 'unknown': affected sessions are excluded from the
> recomputed total and the exclusion is reported, rather than counted as zero."*

S15 ships the **representation** (`null`, never `0` — Q5) and the **signal**
(`PriceRow.isComplete`, plus an "N Modelle ohne vollständigen Preis" line in the
editor). It ships **no recomputed total**, so there is nothing to exclude from
and nothing to report against. **S16 owns the exclusion rule and its
reporting**, and the roadmap is explicit that getting it right is that session's
whole justification.

US-4.1 (dual display) and US-4.3 (per-model calculation view) are S16 in their
entirety; they appear here only as context for the type design.

---

## 4. Shape of the change

```
  DEFAULT_PRICES (baked in, 16 rows)  ──┐
                                        ├─ resolvePriceTable ──► PriceTable ──► (S16)
  priceOverrides  ◄── price-store ──────┘        (pure)              ▲
        ▲  (localStorage)                                            │
        │                                                   computed signal
        │
   setPrice / resetPriceRow / resetAllPrices / importPrices
        ▲
        │            buildPriceRows(report.models.models, DEFAULT_PRICES, overrides)
        │                              │  (pure)
        │                              ▼
        └────────────────────── <PriceTableEditor>  ◄── view === "prices"
                                       │
                                       ├─ encodePriceJson ─► price-export.saveJson ─┐
                                       └─ decodePriceJson ◄─ price-export.loadJson ─┤
                                                                                     │
                       Tauri: invoke("write_export_file" | "read_import_file") ──────┤
                       dev:   Blob + <a download>  /  <input type="file">            │
                       e2e:   fake invoke → __C3P_E2E_SAVED__ sink                   │
                                                                                     ▼
                                            src-tauri: export_path_is_permitted(...)
                                            (realpath, .json, not under a session root)
```

`Report` and `SessionRow` gain **no field**. The price table is a sibling
signal, not report data: `buildReport` must stay a pure function of scan input,
and coupling it to prices would force a full report rebuild on every keystroke
(NFR-2). S16 recomputes *from* `SessionRow.requests` + `priceTable`, exactly the
shape S14 established for the trend. `runScan()` never touches
`priceOverrides`, so prices survive a rescan like every other preference signal.

---

## 5. Phases — do them in this order

The ordering is a mitigation for §0.1, not a stylistic preference. **Each
phase's negative controls are run inside that phase**, not batched to the end.

### 5.1 Phase 1 — restructure the read-only guard, before anything can need it

Only file touched: `src/services/read-only-guarantee.test.ts`.

The allowlist entries for `write_export_file` and `read_import_file` are added
here, **before the commands exist**. An allowlist entry for a non-existent
command is inert; the point is that the guard is already watching when phase 2
lands the write, rather than being widened afterwards to accommodate it.

#### 5.1.1 Two graphs, two allowlists

```ts
interface GuardedGraph {
  readonly name: string;
  readonly entries: readonly string[];
  readonly allowedInvokeCommands: ReadonlySet<string>;
}

const GRAPHS: readonly GuardedGraph[] = [
  {
    name: "scanner",                    // UNCHANGED from S7, deliberately
    entries: ["services/scan.ts", "services/discovery.ts",
              "services/filesystem.ts", "services/filesystem-tauri.ts"],
    allowedInvokeCommands: new Set(["host_environment", "grant_read_access"]),
  },
  {
    name: "app",                        // NEW: the whole reachable frontend
    entries: ["app.tsx", "state/app-state.ts"],
    allowedInvokeCommands: new Set(["host_environment", "grant_read_access",
                                    "write_export_file", "read_import_file"]),
  },
];
```

`analyse()` takes the graph's allowlist as a parameter instead of closing over
the module-level constant. Everything else about it is unchanged.

- `BANNED_FS_NAMES`, `namespace-import`, `write-call` and `raw-write-invoke`
  run **universally**, over both graphs. The export module still may not import
  a `plugin-fs` write, call `.write(` on a handle, or contain a
  `plugin:fs|write` string.
- **The scanner graph's allowlist stays exactly two commands.** This is the
  property the split exists to preserve, and control 2 is what proves it.
- Widening to the app graph closes the pre-existing `folder-picker.ts` blind
  spot as a free side effect — a genuine improvement this session pays for.
- Keep the traversal floor (`graph.size > 6`), per graph.

#### 5.1.2 Two new capability assertions

Alongside the existing "no write permission and no blanket fs set", which stays
**verbatim**:

- *the capability file's `fs:` permissions are exactly the S7 read set* — pins
  the list to `allow-exists`, `allow-stat`, `allow-read-dir`, `allow-open`,
  `allow-read`, `allow-read-file`. Today's regex only forbids *write-shaped*
  strings; an exact pin means a future session cannot add a write permission
  under a name the regex did not anticipate.
- *the only dialog permissions are `open` and `save`*.

#### 5.1.3 Expected fallout in the widened graph

Widening to `app.tsx` / `app-state.ts` pulls every component, every model module
and `folder-picker.ts` into the analysis for the first time. Expect to check for
false positives from `WRITE_CALL_RE` (`/\.(write|writeText|truncate)\s*\(/`) —
no current call site is known to match, but the check has never run over this
code. If a false positive appears in a module that demonstrably touches no
filesystem, **narrow the regex's context, do not add an exception**.

#### 5.1.4 Negative controls — run now, in this phase

Restore each patched file byte-for-byte and record the observed failure counts
in the implementation report.

| # | Injected breakage | Must fail |
|---|---|---|
| 1 | `import { writeTextFile } from "@tauri-apps/plugin-fs"` into `filesystem-tauri.ts` | `write-import`, both graphs |
| **2** | **`tauriInvoke("write_export_file", …)` into `scan.ts`** | **`invoke-not-allowlisted` on the *scanner* graph.** The control that proves the split allowlist did not globally widen. **If this passes, the redesign is wrong — stop and re-plan.** |
| 3 | a `.write(` call in any app-graph module | `write-call` on the app graph |
| 4 | remove `state/app-state.ts` from the app graph's entries | control 3 stops firing — proves the entry set is load-bearing |
| 8 | add `fs:allow-write-text-file` to `default.json` | both capability assertions fail |

### 5.2 Phase 2 — the Rust side, before any frontend can call it

Files: `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`,
`package.json` (exit command).

#### 5.2.1 New state

`grant_read_access` currently pushes into `app.fs_scope()` and keeps no list of
its own, so the exclusion predicate has nothing to consult. Add:

```rust
/// Paths the export writer must never touch: the five automatic roots granted
/// in `setup()` plus every directory `grant_read_access` has granted. US-1.6.
static PROTECTED_ROOTS: Mutex<Vec<PathBuf>>;
```

Maintained in **both** `setup()` and `grant_read_access`, canonicalised on
insert. Forgetting either half silently empties the guarantee — say so in a
comment on the static.

#### 5.2.2 The predicate

```rust
fn export_path_is_permitted(path: &Path) -> Result<PathBuf, RejectReason>;
```

Rejects unless **all** of:

1. The file name ends in `.json`, case-insensitive.
2. The **parent directory canonicalises** (`std::fs::canonicalize`) — CLAUDE.md's
   symlink rule: resolve first, then confine. Never a string prefix test.
3. The canonicalised parent is neither equal to nor a descendant of any entry in
   `PROTECTED_ROOTS` (themselves canonicalised).

#### 5.2.3 The commands

```rust
#[tauri::command] fn write_export_file(path: String, contents: String) -> Result<(), String>;
#[tauri::command] fn read_import_file(path: String) -> Result<String, String>;
```

- `write_export_file` opens with `write + create + truncate`. **Never `append`,
  never `create_dir_all`.** `contents` is a `String` from the app, never a path.
- `read_import_file` applies rules 1 and 2 but **not** rule 3 — reading inside a
  session root is already permitted; only writing is forbidden. Caps the read at
  1 MiB.
- Both return a **bounded error class name**, never a path and never an OS
  message (NFR-6). Both are registered in `generate_handler!`.

#### 5.2.4 Capability and exit-set changes

`src-tauri/capabilities/default.json` gains exactly `"dialog:allow-save"`.
Nothing else. `cargo test --manifest-path src-tauri/Cargo.toml` joins §8.

#### 5.2.5 Negative controls — run now, in this phase

| # | Injected breakage | Must fail |
|---|---|---|
| 5 | export path **inside** a granted root | `export_path_is_permitted` rejects |
| **6** | **export path whose parent is a symlink into a granted root** | **rejects — proves realpath-before-confine rather than string prefix matching.** The second control that would actually catch a wrong implementation. |
| 7 | drop the `.json` check | the extension test fails |

These live as a `#[cfg(test)]` block in `lib.rs` — **the first Rust tests in this
repository**, which is part of why §0.1 calls this session a new layer.

### 5.3 Phase 3 — the pure model layer

No I/O, no clock, no `src/i18n/` import, no `localeCompare`.

**`src/model/prices.ts` (new)**

```ts
export type PriceMicroUsdPerMtok = number;           // integer, USD/Mtok × 1e6

export interface ModelPrice {
  readonly input:        PriceMicroUsdPerMtok | null;   // null === unknown, never 0
  readonly output:       PriceMicroUsdPerMtok | null;
  readonly cacheWrite5m: PriceMicroUsdPerMtok | null;
  readonly cacheWrite1h: PriceMicroUsdPerMtok | null;
  readonly cacheRead:    PriceMicroUsdPerMtok | null;
}
export type PriceField = keyof ModelPrice;
export const PRICE_FIELDS: readonly PriceField[];      // fixes the column order

/** Model variant string -> field -> value. The "[1m]" suffix is NEVER stripped.
 *  An ABSENT field means "use the shipped default"; a `null` VALUE means the
 *  user cleared it to unknown (Q5). Nested Map so presence is unambiguous. */
export type PriceOverrides =
  ReadonlyMap<string, ReadonlyMap<PriceField, PriceMicroUsdPerMtok | null>>;

/** The merged, effective table. S16 consumes this; it never sees overrides. */
export type PriceTable = ReadonlyMap<string, ModelPrice>;

export type PriceParse =
  | { readonly kind: "ok"; readonly value: PriceMicroUsdPerMtok | null }   // "" -> null
  | { readonly kind: "invalid" };
export function parsePriceInput(text: string): PriceParse;
export function formatPriceInput(value: PriceMicroUsdPerMtok | null): string;
```

**The numeric representation — a decision, not a detail.** A price is an
**integer number of micro-USD per million tokens**: `$5.00/Mtok` → `5_000_000`.
Three reasons:

1. **Every default and every plausible negotiated rate is exact in it.** All
   three multipliers land on integers for all eight base prices:
   `1.25 × 1.00 = 1.25` → `1_250_000`; `0.10 × 3.00 = 0.30` → `300_000`. No float
   artefact like `0.30000000000000004` ever enters the table.
2. **It composes with the existing money rule without a unit conversion.** Cost
   in µUSD for `n` tokens is `Math.round(n * priceMicroUsdPerMtok / 1e6)`. The
   identity that makes this clean: **USD-per-Mtok is numerically identical to
   µUSD-per-token**, so the stored integer is that figure scaled by `1e6` for
   sub-µUSD precision.
3. **Range is safe, with one rule S16 must follow.** The largest real aggregate
   is ≈ 5.8 × 10⁸ cache-read tokens × 5 × 10⁵ ≈ 2.9 × 10¹⁴, comfortably inside
   `Number.MAX_SAFE_INTEGER` (9.0 × 10¹⁵). **S16 must multiply per *model
   total*, not per whole report** — recorded here so it is not discovered as a
   rounding bug.

Resolution is 10⁻⁶ USD per Mtok. `parsePriceInput` rounds to that and rejects
negatives, non-finite values and group separators (Q6).

**`src/model/default-prices.ts` (new)**

```ts
export const DEFAULT_PRICES_AS_OF: string;   // "2026-09-21", ISO day (Q2)
export const DEFAULT_PRICES: PriceTable;     // 16 rows: 8 base + 8 "[1m]" (Q1)
```

Built from an explicit base **input and output** table — both written out, since
"output = 5 × input" is a coincidence that holds for all eight current models
and is not a law — with the three **cache** columns derived by the confirmed
multipliers (§1.2), so the relationship is visible in the source and cannot
drift silently.

```
claude-fable-5  10.00 / 50.00      claude-opus-4-6   5.00 / 25.00
claude-opus-5    5.00 / 25.00      claude-sonnet-5   3.00 / 15.00
claude-opus-4-8  5.00 / 25.00      claude-sonnet-4-6 3.00 / 15.00
claude-opus-4-7  5.00 / 25.00      claude-haiku-4-5  1.00 /  5.00
```

plus the `[1m]` row of each, at identical rates.

**`src/model/price-table.ts` (new)**

```ts
export function resolvePriceTable(defaults: PriceTable, overrides: PriceOverrides): PriceTable;
export function priceOf(table: PriceTable, model: string): ModelPrice | null;

export interface PriceCell {
  readonly value:        PriceMicroUsdPerMtok | null;
  readonly defaultValue: PriceMicroUsdPerMtok | null;
  readonly isEdited:     boolean;   // an override exists for this field
}
export interface PriceRow {
  readonly model: string;                                 // exact variant string
  readonly cells: Readonly<Record<PriceField, PriceCell>>;
  readonly hasDefault:   boolean;
  readonly isEdited:     boolean;   // any cell edited
  readonly isComplete:   boolean;   // every field non-null -> S16 can price it
  readonly inData:       boolean;
  readonly costMicroUsd: number;    // 0 when not in data; the primary sort key
}

/** `models` is `Report.models.models`, already cost-descending. Order: in-data
 *  rows in that order, then default-only models ascending BY CODE UNIT. */
export function buildPriceRows(
  models:    readonly ModelTotal[],
  defaults:  PriceTable,
  overrides: PriceOverrides,
): readonly PriceRow[];

export function setOverride(o: PriceOverrides, model: string, field: PriceField,
                            value: PriceMicroUsdPerMtok | null): PriceOverrides;
export function resetRow(o: PriceOverrides, model: string): PriceOverrides;
export function resetAll(): PriceOverrides;

export function encodePriceJson(rows: readonly PriceRow[]): string;   // pretty, effective table
export type PriceDecode =
  | { readonly kind: "ok"; readonly overrides: PriceOverrides; readonly models: number }
  | { readonly kind: "invalid"; readonly reason: "json" | "shape" | "value" };
export function decodePriceJson(text: string, defaults: PriceTable): PriceDecode;
```

**The JSON exchange format:**

```json
{
  "format": "claude3pcost.prices",
  "version": 1,
  "currency": "USD",
  "unit": "USD per 1M tokens",
  "defaultsAsOf": "2026-09-21",
  "prices": {
    "claude-opus-5":     { "input": 5, "output": 25, "cacheWrite5m": 6.25,
                           "cacheWrite1h": 10, "cacheRead": 0.5 },
    "claude-opus-5[1m]": { "input": 4.2, "output": 25, "cacheWrite5m": 6.25,
                           "cacheWrite1h": 10, "cacheRead": 0.5 },
    "hausmodell-x":      { "input": null, "output": null, "cacheWrite5m": null,
                           "cacheWrite1h": null, "cacheRead": null }
  }
}
```

Numbers in the file are human-readable **USD per Mtok**, not the internal
integer — a file a colleague can read and edit is the point. Import multiplies by
`1e6` and rounds. `null` means unknown.

**`decodePriceJson` must reject or drop `__proto__`, `constructor` and
`prototype` keys.** This is the one place a user-controlled string becomes an
object key, and the reason `PriceOverrides` is a `Map` rather than a record.
NFR-6: the file carries model IDs and numbers only — no path, no id, no free
text.

### 5.4 Phase 4 — persistence, transport, and the fake's sink

**`src/services/price-store.ts` (new).** `localStorage` key
`claude3pcost.prices`, in `locale-store.ts`'s defensive shape: a throwing
`localStorage`, an absent key, malformed JSON, a non-object or a bad value all
degrade to an empty override set, never to an exception (NFR-3).

```ts
export function loadPriceOverrides(): PriceOverrides;      // never throws
export function storePriceOverrides(o: PriceOverrides): void;
```

The serialised form must **preserve `null` as unknown** and distinguish it from
an absent key (Q5) — the round-trip test is what pins this.

**`src/services/price-export.ts` (new).** The three-way branch lives here and
nowhere else, on the same `"__TAURI_INTERNALS__" in globalThis` predicate
`createFileSystem()` already uses — not a second, divergent detection rule.

```ts
export type ExportOutcome = { kind: "saved" } | { kind: "cancelled" } | { kind: "failed" };
export type ImportOutcome =
  | { kind: "loaded"; text: string } | { kind: "cancelled" } | { kind: "failed" };

export function saveJson(suggestedName: string, contents: string): Promise<ExportOutcome>;
export function loadJson(): Promise<ImportOutcome>;
```

| Context | Export | Import |
|---|---|---|
| **Packaged Tauri** | `dialog.save({ filters:[json], defaultPath:"claude3pcost-prices.json" })` → `invoke("write_export_file", { path, contents })` | `dialog.open({ multiple:false, filters:[json] })` → `invoke("read_import_file", { path })` |
| **`npm run dev` (browser)** | `Blob` + `URL.createObjectURL` + a synthetic `<a download>`. No filesystem, no Tauri. | a hidden `<input type="file">` + `File.text()` |
| **Playwright, `--mode e2e`** | takes the **Tauri** branch (`gotoApp()` installs `__TAURI_INTERNALS__`), running against the aliased fakes | same, via `read_import_file` |

**The fake plugin: a documented invariant is amended, deliberately and loudly.**

`CLAUDE.md` currently states of `e2e/support/fake-tauri-plugin.ts`: *"no
write-capable export exists in that module at all."* Making the save driveable
from Playwright requires `invoke` to grow two branches, so that sentence becomes
false as written. It is **rewritten**, not quietly widened:

> …no export of that module writes to the fake tree: the read surface is
> `exists`, `stat`, `readDir`, `readFile`, `open({read:true})`, and `invoke`'s
> export-file branches write only to a separate `__C3P_E2E_SAVED__` sink that no
> tree reader consults. Asserted in
> `e2e/support/fake-tauri-plugin.test.ts`.

Concretely: the fake's **export surface does not change** — `invoke` already
exists as a dispatcher that throws on an unrecognised command. Two branches are
added *inside* it. `write_export_file` writes to
`globalThis.__C3P_E2E_SAVED__: Record<string, string>`, **not** into
`__C3P_E2E_TREE__`; `read_import_file` reads from that same sink; the tree
readers never consult it.

**`e2e/support/fake-tauri-dialog.ts` (new).** `@tauri-apps/plugin-dialog` is not
currently aliased in `--mode e2e`, and it must be, or `dialog.save()` reaches a
real plugin inside a headless browser. It needs its **own module** because
`plugin-fs` and `plugin-dialog` both export a function named `open`, which would
collide inside the existing fake. It carries **its own marker**, interpolated
into an always-reachable failure path (LEARNINGS: a bundle-grep marker that
nothing evaluates is tree-shaken away). `save()` returns
`globalThis.__C3P_E2E_SAVE_PATH__`, `open()` returns
`globalThis.__C3P_E2E_OPEN_PATH__`, and either returns `null` to simulate
cancellation.

`vite.config.ts`'s `--mode e2e` alias list gains
`@tauri-apps/plugin-dialog → e2e/support/fake-tauri-dialog.ts`.
**`scripts/check-no-fake.js` greps for BOTH markers** — a single-marker script
would pass over a bundle containing the dialog fake.

**`npm run check:no-fake` is otherwise unchanged and stays meaningful**, but
`CLAUDE.md` already mandates re-running its negative control **whenever the fake
changes shape**, and the fake is changing shape. So that control is **mandatory
in this session's exit set**: build `--mode e2e` into `dist/` deliberately,
confirm the script reports hits and exits non-zero, rebuild normally, confirm it
passes.

**`src/state/app-state.ts` (change).**

```ts
export type View = "overview" | "prices";
export const view = signal<View>("overview");
export function setView(next: View): void;

export const priceOverrides = signal<PriceOverrides>(loadPriceOverrides());
export const priceTable = computed<PriceTable>(() =>
  resolvePriceTable(DEFAULT_PRICES, priceOverrides.value));      // S16 reads this

export function setPrice(model: string, field: PriceField,
                         value: PriceMicroUsdPerMtok | null): void;
export function resetPriceRow(model: string): void;
export function resetAllPrices(): void;
export function importPrices(text: string): PriceDecode;          // pure-ish; replace, Q4
export function exportPrices(): Promise<ExportOutcome>;
export function importPricesFromFile(): Promise<ImportOutcome>;
```

`importPrices(text)` stays the entry point the file loader feeds, so the
replace-semantics logic is tested without any I/O. `runScan()` touches none of
these signals.

### 5.5 Phase 5 — the component, the view switch, the catalogues, CSS

**`src/components/price-table-editor.tsx` (new).** Presentational: receives rows
plus callbacks, holds no state beyond the transient text of the field currently
being edited.

```
┌──────────────────────────────────────────────────────────┐
│ Claude3PCost   [Übersicht][ Preise ]      DE EN   v0.4.0 │
├──────────────────────────────────────────────────────────┤
│ Preise                                                   │
│ Listenpreise, Stand 21.09.2026. Veröffentlichte Preise   │
│ ändern sich; es wird nichts abgerufen oder geprüft.      │
│           [Alles zurücksetzen] [Export…] [Import…]       │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Modell            Input  Output  CW5m  CW1h  CRead   │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ claude-opus-5[1m]  5.00  25.00  6.25 10.00   0.50  ↺ │ │
│ │ claude-opus-5     ▊4.20  25.00  6.25 10.00   0.50  ↺ │ │
│ │                   geändert · Standard 5,00           │ │
│ │ claude-sonnet-5    3.00  15.00  3.75  6.00   0.30    │ │
│ │ hausmodell-x         —      —     —     —      —     │ │
│ │                   ⚠ kein Standard — bitte ausfüllen  │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ ▸ Weitere Modelle ohne Daten (8)      ← §5.6 cut line│ │
│ └──────────────────────────────────────────────────────┘ │
│ ⚠ 1 Modell ohne vollständigen Preis                      │
└──────────────────────────────────────────────────────────┘
```

`▊` is a left accent bar on an edited cell (`data-edited="true"`), always
accompanied by the text hint below the row — never colour alone (NFR-11). `↺`
resets one row and is absent on an unedited row. Every input is reachable by
keyboard in column order.

**`src/app.tsx` (change).** A `view` branch around the existing content, and a
two-chip segmented control in the app bar reusing `GroupingToggle`'s CSS custom
properties. The overview branch is otherwise untouched.

**`src/i18n/de.ts` / `src/i18n/en.ts` (change).** Both complete, keys sorted:

```
prices.heading                prices.resetRow ({model})      prices.json.copy
prices.asOf ({date})          prices.resetAll                prices.json.import
prices.asOfNote               prices.resetAllConfirm         prices.json.export
prices.columnModel            prices.noDefault               prices.json.importReplaceWarning
prices.columnInput            prices.incomplete.one/.other   prices.json.invalid.json
prices.columnOutput           prices.otherModels ({count})   prices.json.invalid.shape
prices.columnCacheWrite5m     prices.unit                    prices.json.invalid.value
prices.columnCacheWrite1h     prices.edited                  prices.json.imported ({count})
prices.columnCacheRead        prices.defaultHint ({value})   prices.json.saveFailed
prices.invalidValue           view.label                     view.overview / view.prices
```

`{count}` and `{value}` go through `tNumber`; `{date}` through `formatDate`.
Never `String(n)`.

**`src/styles/` (change).** Editor CSS; segmented-control variables reused.

**NFR-8 bookkeeping — two files, edited together** (LEARNINGS):

- `CLAUDE.md` — the stack table's dialog row extended to cover the save/open
  surface and the two Rust commands; the fake-plugin invariant rewritten as
  quoted in §5.4; the charting-library section untouched (no dependency is added
  by this session).
- `REQUIREMENTS.md` — the NFR-8 deviation list gains the same entry.

### 5.6 Phase 6 — Q9's collapsed "not in your data" section

**This section is the designated cut line for this session. If the session
overruns, drop it. Dropping it needs no further approval, and nothing else in
this plan has that permission.**

Without it, the editor lists only the models present in the data — which is
exactly what US-4.2's AC requires. It is a convenience for entering a negotiated
rate for a model you have not used yet, nothing more, and no other acceptance
criterion depends on it. If it is dropped, `prices.otherModels` is dropped from
both catalogues with it and the fact is recorded in the implementation report.

---

## 6. Tests, by name

**`src/model/prices.test.ts`**
- `parsePriceInput accepts a dot decimal and yields integer micro-USD per Mtok`
- `parsePriceInput accepts a comma decimal (German input)`
- `parsePriceInput maps an empty and a whitespace-only string to null, never to zero`
- `parsePriceInput rejects a negative value, a non-numeric string, and a group separator`
- `parsePriceInput rounds to micro-USD per Mtok resolution`
- `formatPriceInput round-trips every shipped default exactly`
- `formatPriceInput renders null as the empty string, and zero as "0"`

**`src/model/default-prices.test.ts`**
- `every default has all five fields non-null`
- `cache columns are exactly 1.25x, 2.0x and 0.1x the input price`
- `claude-opus-5 and claude-opus-5[1m] are separate entries with equal rates`
- `every model observed in the reference tree has a shipped default` — against the
  **hardcoded eight strings of §1.1**, so it runs in CI without the data
- `DEFAULT_PRICES_AS_OF is an ISO day string`

**`src/model/price-table.test.ts`**
- `resolvePriceTable leaves an unedited model at its default`
- `resolvePriceTable applies a single-field override and leaves the other four at default`
- `resolvePriceTable applies a null override as unknown, not as the default`
- `resolvePriceTable keeps a model with no default and no override entirely unknown`
- `buildPriceRows marks only the overridden field as edited`
- `buildPriceRows orders in-data rows by cost descending and default-only rows by code unit` — with a **reversed synthetic default table**, per §0.3 trap 3
- `buildPriceRows emits an empty row for a model in the data with no shipped default` — **synthetic fixture**, per §0.3 trap 4
- `buildPriceRows never normalises the [1m] suffix` — base and `[1m]` carrying *different* overrides
- `isComplete is false when any one field is null`
- `resetRow removes every override for that model and no other model's`
- `resetAll returns an empty override set`
- `encodePriceJson emits USD per Mtok, not the internal integer`
- `decodePriceJson round-trips encodePriceJson`
- `decodePriceJson replaces rather than merges`
- `decodePriceJson stores an imported value equal to the default as not-edited`
- `decodePriceJson rejects malformed JSON, a wrong shape and a negative value with distinct reasons`
- `decodePriceJson ignores a __proto__ key and does not pollute the prototype`

**`src/services/price-store.test.ts`**
- `loadPriceOverrides returns an empty set for an absent key`
- `loadPriceOverrides returns an empty set for malformed JSON, a non-object, and a throwing localStorage`
- `loadPriceOverrides preserves a null value as unknown`
- `storePriceOverrides round-trips through loadPriceOverrides`
- `storePriceOverrides swallows a quota error`

**`src/services/price-export.test.ts`**
- `saveJson takes the Tauri branch when __TAURI_INTERNALS__ is present`
- `saveJson takes the browser branch otherwise`
- `saveJson reports cancelled when the dialog returns null`
- `saveJson reports failed when the command rejects, and never throws`
- `loadJson reports cancelled, loaded and failed correctly`

**`e2e/support/fake-tauri-plugin.test.ts` (new)**
- `write_export_file cannot mutate the fake tree` — pass a path that **is** an
  existing node, then assert the tree is structurally identical and `readFile`
  returns the original bytes. This is the behavioural test that stands behind the
  name-level guard (LEARNINGS: the grep is the weaker half).
- `read_import_file reads only from the saved sink`
- `an unrecognised invoke still throws with the marker`

**`src-tauri/src/lib.rs` `#[cfg(test)]`**
- `export_path_is_permitted_rejects_a_path_inside_a_protected_root`
- `export_path_is_permitted_rejects_a_symlinked_parent_into_a_protected_root`
- `export_path_is_permitted_rejects_a_non_json_extension`
- `export_path_is_permitted_accepts_an_unrelated_directory`
- `export_path_is_permitted_rejects_a_parent_that_does_not_exist`

**`src/components/price-table-editor.test.tsx`**
- `renders one row per model with the exact variant string`
- `renders data-edited "true" on an edited cell and "false" on a default one` — **both** branches
- `an empty cell renders an empty input, not a zero`
- `committing a value calls onSetPrice with integer micro-USD per Mtok`
- `clearing a cell calls onSetPrice with null`
- `an invalid entry shows the error hint and does not call onSetPrice`
- `the row reset button is absent on an unedited row and present on an edited one`
- `the as-of date is rendered through formatDate for the active locale` — expected string derived from the formatter
- `the incomplete-model count is rendered through tNumber`

**`src/state/app-state.test.ts` — added**
- `setPrice persists through price-store and updates priceTable`
- `resetAllPrices restores every default`
- `runScan leaves priceOverrides untouched`
- `setView switches between overview and prices`

**`src/model/reference-distribution.test.ts` — added**
- `every model in the reference report has a complete shipped default` — skips
  with the file when the tree is absent

**`e2e/prices.spec.ts` (new) — the session's exit spec**
- `edits a price, reloads, and the value persists` — the roadmap's exit criterion; "restart" is `page.reload()`, same origin, same `localStorage`
- `resets a row and the shipped default returns, with the edited marker gone`
- `resets the whole table`
- `the base model and the [1m] variant are independently editable`
- `exports JSON to the save sink and the file content round-trips`
- `imports JSON from the sink and the table updates`
- `importing a file that omits a previously edited model drops that override`
- `runs the price editor in German`

Every string assertion derives from `translate()` / `formatNumber` /
`formatDate`. **Grep the finished spec for quoted English words** before calling
the session done (LEARNINGS: the translated-text trap in its easiest disguise).

---

## 7. Sizing note for the implementer

This session is over budget by design (§0.1). Two behaviours follow:

- **Do not batch the negative controls.** Controls 1–4 and 8 belong to phase 1;
  5–7 belong to phase 2. A control run at the end of an overrunning session is a
  control that does not get run.
- **The only sanctioned trim is §5.6.** If something else looks like it has to
  give, stop and report upward rather than deciding it.

---

## 8. Exit commands

```bash
npm run lint
npm run format:check
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
npm run check:no-fake
npm run test:e2e
npm run regression            # against the local, uncommitted tree

rg -l --text --no-ignore --hidden --encoding none -e '\x00' src plugins scripts e2e test
  # expect exactly: test/fixtures/utf16le-lines.bin

grep -rn 'String(' src/components/          # expect no hit in the new component
```

**By hand, and not optional:**

1. **`check-no-fake` negative control** (mandatory — the fake changed shape):
   build `--mode e2e` into `dist/`, confirm the script reports **both** markers
   and exits non-zero, rebuild normally, confirm it passes.
2. **Guard negative controls 1–4 and 8** (phase 1) and **Rust controls 5–7**
   (phase 2), each restoring the patched file byte-for-byte. Record the observed
   failure counts in the implementation report; control 2 and control 6 are the
   two that matter.
3. `npm run dev`: the price view lists the eight real models in cost order with
   defaults filled; edit one, reload, confirm it persists; export and re-import
   through the browser transport.
4. `npx tauri dev`: export through the real save dialog to a normal folder;
   confirm a save **into a session root is refused**; confirm the refusal
   surfaces a translated message and no path.

---

## 9. Deliberate deferrals, recorded so they are not mistaken for oversights

1. **The unknown-price exclusion and its reporting is S16's**, not S15's (§3).
   S15 ships the representation and the signal; there is no recomputed total here
   to exclude from.
2. **No sixth web-search column** (Q8). The quantified consequence is in §1.4.
3. **No settings screen** (Q3). The `view` switch is its seed; the language
   switcher stays in the app bar until S21.
4. **Grouping, trend and range preferences remain unpersisted.** S10, S13 and
   S14 each deferred persistence to the settings screen, and S15 adds only one
   new `localStorage` key rather than opportunistically persisting theirs.
5. **`Report` gains no price field** (§4). Coupling the report to prices would
   rebuild it on every keystroke.
6. **CSV export is untouched.** S19 owns it — and should reuse the
   `write_export_file` mechanism decided here rather than inventing a second one.
