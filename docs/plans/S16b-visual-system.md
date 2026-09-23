# S16b — UI/UX: visual system

**Status.** Approved 2026-09-23. Implements the `ROADMAP.md` S16b entry.
Finishes what `docs/plans/S16a-navigation-shell.md` started: S16a was
strictly structural, S16b is strictly visual.

**Acceptance criteria in scope.** NFR-7 (localization), NFR-11 (accessibility,
`SHOULD`) — the parts named in §2.2; the rest stays S21's.

---

## §0 — What this session is

S16a's planning found fifteen issues (its §1 table) and split them: things that
**move a selector or a signal** (S16a) and things that **change how something
looks** (S16b). This session takes the second half:

| # | The issue, from S16a's table | Where it is settled here |
|---|---|---|
| D1 | Not one `:focus-visible` rule existed; several controls have `background:none; border:none` and no visible focus at all | §4.1, global focus rule |
| D4 | `⚠`, `ⓘ`, `≈` carry meaning only in a `title`, which is not keyboard-reachable | §4.4, with the documented exception in §4.5 |
| D5 | No sticky table headers; a 40-session project scrolls its header away | §4.2, with an honest limitation |
| D7 | Three disclosure idioms, none with hover, active or focus styling | §4.1, Idiom 2 |
| D8 | Eight (actually twelve) near-identical ad-hoc button rules, no hover, no `:active`, no `:disabled` | §4.1, `.c3p-btn` |
| D10 | No `font-variant-numeric: tabular-nums`; digit columns ripple | §4.3 |
| D11 | `.app-shell` is `align-items:center` and the table is capped at 60rem while the toolbar is 100% — nothing lines up | §4.6 |
| D12 | No type hierarchy; `app-shell__subtitle` restates the title on every screen | §4.7, §5.6 |
| D13 | The total is in a `<tfoot>` below N rows; the vision's five-second criterion is not met | §5, the headline total |

D15 (dark mode) stays deferred beyond v1.0, as the roadmap says. The full
accessibility audit and the contrast measurement stay S21's (§2.2).

**No new data, no new analysis, no new aggregate.** `src/model/` is not touched
by this session at all. The headline total is a second rendering of
`report.totals`; nothing is summed that was not already summed.

### §0.1 The ten decisions taken with the user

All ten went the planner's recommended way.

1. **Headline placement and content — Option A**, the banner band: cost as a
   display-size number, one secondary line reading *scope · period · session
   count*. Option B (four equal stat tiles) gives four numbers the same weight
   when one answers the vision's question; Option C hides the number in the
   control furniture.
2. **Headline on all three report pages** — Overview, Models, Trend — and never
   on Prices, which scopes nothing (S16a already stripped its context bar and
   gap strip).
3. **The headline carries the own-price figure too**, as a second smaller line,
   only when own prices are configured and a recomputation exists, carrying the
   same exclusion marker the table cells use. A headline showing only the list
   figure beside a table showing both is the first place the two would disagree.
4. **The `.c3p-btn` refactor touches `class=` attributes** in components, not
   just CSS — with the containment rule in §6.2.
5. **One disclosure idiom — Idiom 2**: the whole label is the button, chevron
   inline. CSS only; Idiom 1 would re-split the hit target S16a deliberately
   merged to close D3.
6. **The three path-bearing `title`s are excluded from the D4 pass**, pinned by
   a named unit test. This is a deliberate, documented partial-completion of a
   roadmap instruction — §4.5 states the reasoning in full.
7. **The `<tfoot>` session-count re-sum is fixed now**, with `totalSessions` as
   a **required** prop on `OverviewTable`.
8. **Type scale and density: four changes, no more** — §4.7.
9. **`app.subtitle` is deleted** — the paragraph and the key, from both
   catalogues.
10. **`model-scope-label` / `trend-scope-label` are kept.** Each panel is
    self-contained, both are asserted in unit tests, and removing them buys
    nothing.

### §0.2 LEARNINGS entries that shaped this plan

Each is cited again at the point where it bites.

- **`CostTotals` carries no session count, so any "total sessions" figure is
  necessarily derived.** Names the headline's hazard, and exposes an existing
  one: `overview-table.tsx`'s `<tfoot>` already re-sums it. → §5.2, §5.4.
- **`String(n)` inside a `t()` placeholder passes lint, type-check and the whole
  suite, and silently breaks NFR-7 in German only.** The headline's session
  count is exactly the count-style key the entry warns about. → §5.3, §7.
- **Optional props are how a plan's test silently goes unwritten**, and **making
  a shared type's field non-optional fans out into every hand-built test
  literal.** `totalSessions` is required on purpose, and the fan-out into
  `overview-table.test.tsx` is expected, not scope creep. → §5.4.
- **A testid is one app-wide namespace, not a per-component one.** Every testid
  introduced in §5.2 was greped across the whole of `src/` and `e2e/` first.
- **A quoted English string in an end-to-end assertion is the translated-text
  trap in its easiest disguise**, and **`Intl` emits U+00A0, so derive expected
  strings from the formatter rather than typing them.** The two new e2e
  assertions compare the headline against *another element's* text and never
  against a literal. → §7.
- **`querySelectorAll("th")` on an outer table also matches nested tables'
  headers.** Any new header-cell assertion uses `:scope > thead > tr > th`.
- **A new architecture rule in `CLAUDE.md` is a claim that needs a test.** The
  three claims added in §5.7 each have a named test in §7.

---

## §1 — Out of scope

- **Dark mode.** The token set is light-only with hardcoded `rgba(0, 0, 0, …)`
  neutrals; re-deriving it with a contrast check is its own session. Deferred
  beyond v1.0 (D15).
- **The full accessibility audit and the contrast measurement.** S21's. §2.2
  says exactly which parts of NFR-11 this session does and does not satisfy.
- **A settings screen.** S21 owns it; the language switcher stays in the app bar.
- **Any change under `src/model/`, `src/services/`, `src/state/`, `src-tauri/`,
  or `e2e/support/`.** No fake changes shape, so `npm run check:no-fake`'s
  negative control is not re-run this session.
- **Charts.** S18.

---

## §2 — Acceptance criteria

### §2.1 Satisfied by this session

**NFR-7 — Localization.** Every new user-facing string goes through
`src/i18n/`; every number through `tCurrency` / `tNumber` / `tPlural`. Mostly
reuse — `scope.allProjects` / `scope.allFolders`, `range.span` /
`range.spanFrom` / `range.spanTo` / `status.rangeAll`, `scan.sessionCount`
(plural base), `overview.columnCostOwnHint`, `session.partialTitle`,
`recompute.excluded.one` / `recompute.excluded.other`. Genuinely new keys:
`headline.costLabel`, `headline.ownCostLabel`. One key deleted: `app.subtitle`.
`de.ts` is edited first as the source of truth; `tsc` alone enforces parity.

**NFR-11 — the parts this session owns.**

- D1 completed: `:focus-visible` on **every** interactive control, replacing
  S16a's deliberately minimal four-selector base.
- D4 completed except the three path-bearing `title`s (§4.5): every `⚠` / `ⓘ` /
  `≈` that carries meaning only in a `title` gains a `visually-hidden` text
  alternative, and every decorative glyph gains `aria-hidden="true"`.
- State is never conveyed by colour alone anywhere the session touches: the
  selected/active states all sit on `aria-pressed` / `aria-checked` /
  `aria-current`, which the unified `.c3p-btn` selector reads.
- Keyboard operability is unchanged: every control remains a `<button>` or a
  `<select>`; no roving tabindex, no key handlers, nothing new to operate.

### §2.2 Explicitly deferred to S21

- **Measured contrast.** No ratio is computed this session. Two cases are
  suspected marginal and are named here so S21 starts with them rather than
  rediscovering them:
  1. `--c3p-warning-text: #8c6900` on `.gap-chip`'s `rgba(240, 160, 48, 0.1)`
     background.
  2. Every `--c3p-font-xxs` (11px) badge — `network-drive-badge`,
     `archived-badge`, `partial-badge`, `request-error-badge` — where AA's
     large-text allowance does not apply and the text is `--c3p-text-secondary`.
- **A full screen-reader pass** over all four pages.
- **`aria-live` on the scan status** (`scan-running`, the status bar).
- **A keyboard audit of the price editor's input grid.**
- **Dark mode** (beyond v1.0).
- **The `—` placeholders in the exclusion row** keep no text alternative: they
  sit in a row whose first cell already says the row is the excluded one, and
  two exact-equality assertions read them (§6.3).

---

## §3 — Files

**New**

- `src/components/headline-total.tsx`
- `src/components/headline-total.test.tsx`
- `src/components/range-label.ts`
- `src/components/range-label.test.ts`

**Changed**

- `src/styles/index.css` — the bulk of the session
- `src/app.tsx`, `src/app.test.tsx`
- `src/components/overview-table.tsx`, `overview-table.test.tsx`
- `src/components/session-table.tsx`, `session-table.test.tsx`
- `src/components/status-bar.tsx`
- `src/components/price-table-editor.tsx`
- `src/components/app-nav.tsx`, `grouping-toggle.tsx`, `date-range-filter.tsx`,
  `trend-section.tsx`, `language-switcher.tsx`, `empty-state.tsx` — `class=`
  attributes only
- `src/i18n/de.ts`, `src/i18n/en.ts`
- `e2e/overview.spec.ts` — two new tests
- `CLAUDE.md` — §5.7

**Deliberately untouched**

`src/model/`, `src/services/`, `src/state/app-state.ts`, `src-tauri/`,
`e2e/support/`, `scripts/`, `test/fixtures/`.

---

## §4 — `src/styles/index.css`

### §4.0 New tokens

Added to `:root`; no existing token is removed or redefined.

```
--c3p-content-max: 60rem;
--c3p-font-xl: 1.375rem;          /* the page <h1> */
--c3p-font-display: 2rem;         /* the headline cost */
--c3p-line-tight: 1.2;
--c3p-control-bg: var(--c3p-surface);
--c3p-control-bg-hover: var(--c3p-contrast-5);
--c3p-control-bg-active: var(--c3p-contrast-10);
--c3p-row-hover: rgba(0, 0, 0, 0.03);
--c3p-focus-width: 2px;
--c3p-focus-offset: 2px;
```

`--c3p-focus` already exists (S16a) and keeps its value.

### §4.1 `.c3p-btn`, the disclosure idiom, and global focus (D1, D7, D8)

**One button.** `.c3p-btn` plus two variants replaces twelve ad-hoc rules:
`.lang-switch button`, `.empty-state__manual-roots button`,
`.empty-state__choose-folder`, `.grouping-toggle button`,
`.range-filter__chips button`, `.trend-granularity button`,
`.price-table-editor__toolbar button`,
`.price-table-editor__other-models > button`, `.price-table__reset-row`,
`.app-nav button`, `.session-table thead button`, and
`.overview-table [data-testid="group-disclosure"]`. All twelve are deleted.

- `.c3p-btn` — base: `font: inherit`, border + `--c3p-radius-s`,
  `--c3p-control-bg`, `cursor: pointer`; `:hover` → `--c3p-control-bg-hover`;
  `:active` → `--c3p-control-bg-active`; `:disabled` → `opacity: .55;
  cursor: default` with hover and active suppressed.
- `.c3p-btn--quiet` — transparent, borderless: the disclosures, the sort
  headers, `↺`, the other-models toggle.
- `.c3p-btn--primary` — the `--c3p-primary-10` treatment, for
  `empty-state__choose-folder`.
- **Selected state, one rule instead of four:**
  `.c3p-btn[aria-pressed="true"], .c3p-btn[aria-checked="true"],
  .c3p-btn[aria-current="page"]` → the primary tint. This replaces the four
  separate `[aria-checked="true"]` / `[aria-pressed="true"]` /
  `[aria-current="page"]` blocks that already say the same thing.

**One disclosure idiom — Idiom 2.** `.c3p-btn--disclosure` on the group and
session disclosures. The whole label is the button (S16a's markup, unchanged):
`:hover` underlines the label and `tbody tr:hover` tints the row via
`--c3p-row-hover`; the chevron is an `aria-hidden` inline-block of `width: 1em`
so `▶` and `▼` do not shift the label; `:focus-visible` rings the whole label.

```
   ▸ Nebula Launch                 2 Sitz.   412,08 USD
   hover:          row tint + label underline
   focus-visible:  2px ring around the whole label
   active:         tint deepens, nothing shifts
```

**Global focus (D1).**

```css
:where(button, select, input, [tabindex]):focus-visible {
  outline: var(--c3p-focus-width) solid var(--c3p-focus);
  outline-offset: var(--c3p-focus-offset);
}
```

S16a's four-selector placeholder rule and its "S16b widens this" comment are
deleted; so is the "S16b widens it to every control" note on `--c3p-focus`.

### §4.2 Sticky table headers (D5), and an honest limitation

```css
.overview-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--c3p-surface);
  box-shadow: inset 0 -1px 0 var(--c3p-border);
}
```

`box-shadow: inset` replaces the existing `border-bottom`, because with
`border-collapse: collapse` a collapsed border edge does not travel with a
sticky cell and the header's underline is left behind on scroll.

**The limitation, stated rather than papered over.** The same rule is added for
`.session-table thead th`, but it will **not visibly stick today**.
`.session-table` lives inside `.session-table__scroll { overflow-x: auto }`, and
`overflow-x: auto` computes `overflow-y` to `auto` as well, which makes that
element a scroll container: the sticky header would stick to the top of *that
box*, not the viewport. Since the box has no height cap, it never scrolls
vertically and the rule is inert. It is added anyway so the behaviour is correct
the day a height cap arrives (S17's budgets or S18's charts are the likely
occasion), and it is recorded here so that no one reads the rule as a claim that
the session-table header sticks now. The manual check in §8 tests the
**overview** table's header, which does stick.

### §4.3 Tabular numerals (D10)

Applied through the selectors that already right-align the numeric columns, so
there is zero component churn:

```
.overview-table, .session-table, .model-panel__table,
.trend-table, .category-table, .request-table
  → th:not(:first-child), td:not(:first-child) {
        font-variant-numeric: tabular-nums;
    }
```

plus `.price-table__input` and `.headline-total__cost`.

### §4.4 Glyph text alternatives (D4)

The complete inventory. "Decorative" means an adjacent visible text label or an
`aria-*` attribute already carries the meaning, so the glyph gets
`aria-hidden="true"` and nothing else. "Meaningful" means the meaning lives only
in a `title`, so the glyph gets `aria-hidden="true"` **and** a sibling
`<span class="visually-hidden">` carrying the same translated string.

| Glyph | Site | Verdict |
|---|---|---|
| `▶` / `▼` | `overview-table.tsx` group disclosure | decorative — `aria-expanded` + `aria-label` carry it |
| `✓` / `○` | `overview-table.tsx` scope button | decorative — `aria-pressed` + the visible `scope.rowButton` text |
| `ⓘ` | `overview-table.tsx` own-cost column header | **meaningful** — hidden `t("overview.columnCostOwnHint")`, testid `col-cost-own-hint` |
| `⚠` | `overview-table.tsx` `cell-cost-own-partial` | **meaningful** — hidden text is the same `recompute.excluded.one` / `.other` string the `title` holds, with the same `tNumber`-formatted counts |
| `⚠` | `overview-table.tsx` tfoot excluded row | decorative — `t("overview.excludedRow")` sits beside it |
| `≈` | own-cost cells, `overview-table.tsx` / `session-table.tsx` | **meaningful, and the glyph stays visible** — `e2e/dual-cost.spec.ts:46` asserts `toContainText("≈")`, and the glyph is the S16 "computed, not measured" marker. A hidden `t("headline.ownCostLabel")` prefix is added; the `≈` itself is not hidden and the `session.costOwn*` catalogue entries that embed it are not changed |
| `▲` / `▼` | `session-table.tsx` sort, CSS `::after` | no change — `aria-sort` carries it and generated content is not in the DOM |
| `↺` | `price-table-editor.tsx` reset row | decorative — `aria-label={t("prices.resetRow", …)}` already present; add `aria-hidden` |
| `title` | `session-table.tsx` `partial-badge` | **meaningful** — hidden text carrying `session.partialTitle`'s included/total counts |
| `title={part.title}` | `overview-table.tsx` folder parts | **excluded — see §4.5** |
| `title={candidate.path}` | `empty-state.tsx` lines 49 and 65 | **excluded — see §4.5** |

### §4.5 The documented exception: three `title`s that must stay hover-only

The roadmap entry asks for "a `visually-hidden` text alternative for **every**
`⚠` / `ⓘ` / `≈` glyph that carries meaning only in a `title`". Three `title`
attributes in the codebase are not glyph tooltips at all — they hold **absolute
filesystem paths**:

- `src/components/overview-table.tsx:132` — `title={part.title}`, the full path
  behind a folder group's displayed basename.
- `src/components/empty-state.tsx:49` — `title={candidate.path}`, a searched
  location.
- `src/components/empty-state.tsx:65` — `title={path}`, a manually added root.

`CLAUDE.md`'s privacy rules say, in as many words: *"Absolute paths count as
sensitive: display basenames, keep full paths to hover text and never export
them."* A `visually-hidden` copy puts the full path into the accessibility tree
and, more consequentially, into `textContent` — which is exactly the surface an
export, a clipboard copy (S19) or a debug dump reads. The hover-only placement
is not an oversight in those three components; it is the rule.

So this session completes D4 for every glyph and **deliberately leaves those
three alone**. This was put to the user as a partial completion of the roadmap
instruction and approved on those terms. It is pinned by a named unit test
(§7, *"keeps the folder path in the title attribute only, with no
visually-hidden copy"*) so that a later session reading "D4: done" cannot
quietly finish the job and leak a path. A later session that wants those paths
keyboard-reachable must solve it a different way — a disclosure the user opts
into, not an always-present hidden string — and must revisit NFR-6 first.

### §4.6 The `.page` wrapper finished (D11)

`.app-shell` keeps `align-items: center`. `.app-bar`, `.app-nav` and
`.status-bar` are already `width: 100%`; each gains
`max-width: var(--c3p-content-max)`. `.page`'s hardcoded `max-width: 60rem`
becomes `var(--c3p-content-max)`, and `.overview-table`'s own
`max-width: 60rem` is deleted — `.page` caps it now, and two independent width
authorities are how the toolbar and the table came to disagree in the first
place. No markup changes; everything then shares one edge.

### §4.7 Type scale and density (D12) — four changes, no more

1. `.app-bar__title` drops from `--c3p-font-l` to `--c3p-font-m` at weight 600,
   so the window chrome stops competing with the page heading.
2. `h1[data-testid="page-heading"]` gets `--c3p-font-xl`, weight 600,
   `line-height: var(--c3p-line-tight)`.
3. `.headline-total__cost` gets `--c3p-font-display`, weight 600,
   `--c3p-line-tight`, `tabular-nums`.
4. `.overview-table th, .overview-table td` padding tightens from
   `var(--c3p-space-s) var(--c3p-space-m)` to `0.375rem 0.75rem`.

Anything beyond these four is repainting, not systematising, and is out of
scope.

### §4.8 New block: `.headline-total`

`.headline-total` (column flex, `gap: var(--c3p-space-xxs)`, padding-block
`var(--c3p-space-m)`), `.headline-total__cost`, `.headline-total__meta`
(`--c3p-font-s`, `--c3p-text-secondary`, ` · ` separators built the way
`.status-bar` builds them), `.headline-total__own` (`--c3p-font-s`,
`--c3p-text-secondary`, italic to match `td[data-computed="true"]`), and
`.headline-total__own-excluded` (`--c3p-warning-text`, matching
`.recompute-note__exclusion`).

---

## §5 — Components

### §5.1 New: `src/components/range-label.ts`

`rangePeriodText()` is currently a private function inside `status-bar.tsx`, and
the headline needs the identical string. Extract rather than duplicate — the
same pattern as `group-label.ts`, which is a non-component `.ts` living in
`components/` with its own test file.

```ts
/** The active period as display text. Instants, not day strings. */
export function rangePeriodText(fromMs: number | null, toMs: number | null): string;

/** null = all time (the caller omits the period slot entirely). */
export function rangeLabel(range: DateRange | null): string | null;
```

Behaviour is identical to the current private copy, **including the
`toMs - 1` inclusive-end rule** (`toMs` is exclusive — S13 plan §2 Q3), which
finally gets a test of its own. `status-bar.tsx` imports it and loses its local
copy; its rendered output does not change.

### §5.2 New: `src/components/headline-total.tsx`

Props only, no signal reads — the `ModelPanel` / `ContextBar` contract.

```ts
export interface HeadlineTotalProps {
  /** report.totals.costMicroUsd, or the selected group's. Never re-aggregated here. */
  readonly costMicroUsd: number;
  /** report.sessions.length, or the group's own sessionCount. Never a re-sum. */
  readonly sessionCount: number;
  readonly grouping: Grouping;
  /** null = global scope -> scope.allProjects / scope.allFolders. */
  readonly scopeLabel: string | null;
  /** null = all time. Built by rangeLabel(); this component does no date maths. */
  readonly periodLabel: string | null;
  /** null unless own prices are configured AND a recomputation exists. */
  readonly ownCostMicroUsd: number | null;
  readonly ownExcludedSessions: number;
}

export function HeadlineTotal(props: HeadlineTotalProps): JSX.Element;
```

Rendered shape (Option A):

```
┌──────────────────────────────────────────────────────────┐
│ Overview │ Models │ Trend │ Prices                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   1.413,59 USD                                           │
│   Alle Projekte · 24.08.–23.09.2026 · 150 Sitzungen      │
│   ≈ 1.290,44 USD (eigene Preise)                         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [Projekt│Ordner]  [30 T│Monat│…]  Bereich: [Alle ▾]      │
├──────────────────────────────────────────────────────────┤
│ Projekt            Sitz.   Anfr.    Kosten      Dauer    │
│ ▸ Nebula Launch        2      41    412,08 USD  3 h 12 m │
```

Rules the implementation must hold:

- The cost divides by `1e6` here and nowhere else in the component; it goes
  through `tCurrency`. There is no `costUsd` float anywhere upstream.
- The session count goes through `tPlural("scan.sessionCount", n)` — reusing the
  existing plural base rather than inventing one. **Never `String(n)`**
  (LEARNINGS).
- The global scope label is `t("scope.allProjects")` or `t("scope.allFolders")`
  chosen by `grouping`; the scoped label is the caller's `scopeLabel` verbatim.
- `periodLabel === null` omits the period slot **and its separator** — no
  dangling ` · `.
- The own-cost line renders only when `ownCostMicroUsd !== null`. A null
  recomputation must not render `≈ 0,00 USD`; that is the silently-partial
  own-price total the vision rules out, in its cheapest form.
- When `ownExcludedSessions > 0`, the own line carries the same marker the table
  cells use: a visible `⚠` with `aria-hidden`, plus visually-hidden text from
  `recompute.excluded.one` / `.other`.

Testids, all verified unused across `src/` and `e2e/` before choosing them
(LEARNINGS: a testid is one app-wide namespace): `headline-total`,
`headline-cost`, `headline-meta`, `headline-sessions`, `headline-own-cost`,
`headline-own-excluded`.

### §5.3 `src/app.tsx`

- Renders `<HeadlineTotal>` inside `readyPage()`, above `{contextBar}`. Because
  `readyPage()` is shared by Overview, Models and Trend, that is one insertion
  that lands on exactly the three report pages and never on Prices — Q2 with no
  branching.
- Scoped values come from the `selectedGroup` `app.tsx` already computes:
  `selectedGroup.totals.costMicroUsd` / `selectedGroup.sessionCount` when a
  scope is set, `currentReport.totals.costMicroUsd` /
  `currentReport.sessions.length` when it is not.
- `periodLabel` comes from `rangeLabel(currentReport.range)`.
- `ownCostMicroUsd` / `ownExcludedSessions` come from
  `recomputation.value?.byGroupKey.get(selectedKey)` when scoped, else
  `recomputation.value?.total`, and are `null` / `0` unless
  `ownPricesConfigured.value`.
- Passes the new required `totalSessions={currentReport.sessions.length}` to
  `OverviewTable`.
- Deletes the `app-shell__subtitle` paragraph (Q9).

### §5.4 `src/components/overview-table.tsx`

- **New required prop** `readonly totalSessions: number;`. The `<tfoot>`'s
  `groups.reduce((sum, group) => sum + group.sessionCount, 0)` is replaced by
  `tNumber(totalSessions)`.

  Why now: the roadmap raises this rule for the headline, and the violation sits
  three lines from where the headline's number comes from; leaving the two
  disagreeing about the same figure is worse than either. Why *required*: an
  optional prop leaves every existing call site and every test literal
  untouched, and the test that pins the behaviour then never gets written
  (LEARNINGS). The fan-out into `overview-table.test.tsx`'s `defaultProps` is
  expected fallout, not scope creep.

- The §4.4 glyph pass, with §4.5's exclusion for `title={part.title}`.
- `class="c3p-btn c3p-btn--quiet c3p-btn--disclosure"` on the disclosure and
  `class="c3p-btn scope-select"` on the scope button (the `.scope-select` class
  keeps its non-button declarations: `margin-left`, the narrower padding).

### §5.5 Remaining component edits

- `app-nav.tsx`, `grouping-toggle.tsx`, `date-range-filter.tsx`,
  `trend-section.tsx`, `language-switcher.tsx`, `empty-state.tsx` — `class=`
  attributes only, nothing else.
- `session-table.tsx` — `class=` on the sort buttons, plus the visually-hidden
  alternative on `partial-badge`.
- `price-table-editor.tsx` — `class=` on four button sites, `aria-hidden="true"`
  on the `↺` glyph.
- `status-bar.tsx` — imports `rangePeriodText` from `range-label.ts`; no
  rendered change.

### §5.6 `src/i18n/de.ts` and `src/i18n/en.ts`

Two keys added — `headline.costLabel`, `headline.ownCostLabel` — and
`app.subtitle` removed from both. `de.ts` first (source of truth, `as const`);
`en.ts` is `as const satisfies Record<TranslationKey, string>` and `tsc` alone
enforces parity (a missing key is `TS1360`, an extra one `TS2353`).

### §5.7 `CLAUDE.md`

A short "Visual system" subsection under Architecture Rules, making three
claims, each of which has a named test in §7 (LEARNINGS: a new architecture rule
is a claim that needs a test):

1. `.c3p-btn` plus its variants is the only button styling; a component styles a
   button by choosing a variant, never by adding a rule.
2. `:focus-visible` is global; no control opts out.
3. A `title` whose content is an absolute path never gets a `visually-hidden`
   copy (§4.5), and `--c3p-content-max` is the single width authority.

---

## §6 — The risk this session carries, and how it is contained

The roadmap frames S16b as a broad cosmetic refactor across many components and
e2e specs whose failure mode is silently moving a selector an e2e spec depends
on. That risk was measured, not assumed.

### §6.1 The class-rename risk is empirically zero for the e2e suite

`grep -rno '\.locator("\.[a-z-]*"' e2e/` returns nothing. Every one of the
suite's locators is a `getByTestId`, an accessible role, an
`xpath=ancestor::th[1]`, an `#session-panel-…` id, or a `[data-group-key=…]`
attribute selector. No Playwright spec can see a CSS class. The `.c3p-btn`
refactor therefore cannot break e2e — **provided** it stays inside `class=`,
which §6.2 makes mechanically checkable.

### §6.2 The phase-1 diff invariant (the reviewer's check)

The button pass changes **nothing but `class=` attributes**: no `data-testid`,
no `aria-*`, no role, no element type, no text node, no prop. Stated as a
command the reviewer runs:

```
git diff -U0 src/components | grep '^[+-]' | grep -v 'class='
```

For the phase-1 commit this must print nothing but diff headers. Any other line
it prints is either a mistake or a deliberate exception that has to be argued in
review.

### §6.3 The real hazard is `textContent`, not selectors

Adding `visually-hidden` text inside a cell changes what `toHaveText` and
`textContent === …` read. Three exact-equality assertions sit in the blast
radius:

- `src/components/overview-table.test.tsx:666` —
  `within(excludedRow).getByTestId("cell-cost-own").textContent).toBe("—")`
- `src/components/overview-table.test.tsx:667` — the same for `cell-duration`
- `src/components/session-detail.test.tsx:329` —
  `chip.querySelector(".tool-chip__name")!.textContent`

**The rule:** hidden text goes **inside the glyph's own `<span>`**, never loose
in a cell that an exact-equality assertion reads. The two `—` cells get no
alternative at all (§2.2, deferred). The `.tool-chip__name` class must survive
the refactor unrenamed — it is the one CSS class a unit test selects on.

### §6.4 Two phases, each ending with the full exit set

**Phase 1 — CSS and `class=` only.** The tokens (§4.0), `.c3p-btn` and the
disclosure idiom and global focus (§4.1), sticky headers (§4.2), tabular
numerals (§4.3), the `.page` wrapper (§4.6), type and density (§4.7), and the
`class=` attributes in components. Nothing else. **Run the full exit set (§8).**

**Phase 2 — behaviour.** The glyph alternatives (§4.4/§4.5), `totalSessions`
(§5.4), `range-label.ts` (§5.1), `HeadlineTotal` (§5.2), `app.tsx` (§5.3), the
catalogue keys (§5.6), `CLAUDE.md` (§5.7), and all the tests in §7. **Run the
full exit set again.**

A red suite then names its own phase instead of hiding inside a seven-hundred
line diff.

---

## §7 — Tests, by name, and what each fails on

No test is written against CSS.

**`src/components/headline-total.test.tsx` (new)**

- *"renders the scoped cost through tCurrency"* — fails on a raw float or a
  `String()`; NFR-7. The expected string is derived from `formatCurrency`, never
  typed out, because `Intl` emits U+00A0 (LEARNINGS).
- *"renders the session count through tNumber, not String"* — 1234 under `de`
  must render `1.234`. Fails on `String(count)`: the exact LEARNINGS defect in
  the exact shape that entry predicts.
- *"labels the global scope by grouping"* — `scope.allProjects` under
  `"project"`, `scope.allFolders` under `"folder"`. Fails if the all-scope label
  is hardcoded to projects.
- *"names the selected scope when one is given"* — fails if `scopeLabel` is
  ignored and the headline keeps saying "all projects" under a scope.
- *"omits the period slot and its separator when periodLabel is null"* — fails
  on a dangling ` · `.
- *"shows no own-cost line when ownCostMicroUsd is null"* — fails if a null
  recomputation renders `≈ 0,00 USD`.
- *"marks the own-cost line when sessions were excluded"* — fails if the
  headline reports a partial own total with no marker, which is the honesty
  failure US-4.2 rules out, at headline scope.
- *"renders the same set of data-testids in both locales"* — the house pattern
  (`model-panel.test.tsx`, `grouping-toggle.test.tsx`); fails if any branch is
  locale-dependent.

**`src/components/overview-table.test.tsx` (additions)**

- *"renders the footer session count from the totalSessions prop, not a sum of
  the group rows"* — groups summing to 5, prop `7`, expect `7`. Fails against
  the current `reduce`. Engineered so the wrong rule yields a different number,
  because a sum-preserving assertion over one array is a tautology (LEARNINGS).
- *"gives the own-cost column's ⓘ a text alternative and hides the glyph from
  assistive technology"* — fails if the hint stays `title`-only.
- *"gives the partial-exclusion ⚠ a text alternative carrying both counts"* —
  fails on the same, and on counts formatted with `String()` rather than
  `tNumber`.
- *"keeps the folder path in the title attribute only, with no visually-hidden
  copy"* — **the NFR-6 pin for §4.5.** Fails if a later session "completes" D4
  over the path `title`s and leaks an absolute path into `textContent`.

**`src/components/session-table.test.tsx` (addition)**

- *"gives the partial badge a text alternative carrying the included and total
  request counts"* — fails if the counts stay `title`-only.

**`src/components/range-label.test.ts` (new)**

- *"formats a bounded span with an inclusive end day"* — pins the `toMs - 1`
  rule, which has never had a test of its own; fails on an off-by-one day at the
  exclusive boundary.
- *"returns null for an all-time range"* — fails if the headline receives an
  empty string and renders a dangling separator.

**`src/app.test.tsx` (additions)**

- *"renders the headline total on each report page and not on the prices page"*
  — fails if the headline is placed inside one page's branch rather than in
  `readyPage()`.
- *"passes the report-wide session count when no scope is selected and the
  group's own count when one is"* — fails if the scoped headline keeps the
  global numbers.

**`e2e/overview.spec.ts` (two additions)**

- *"the headline total matches the table's footer total"* — reads both elements'
  text and compares them. No literal, no quoted English word, both locales safe
  (LEARNINGS). Fails if the headline re-aggregates rather than re-rendering
  `report.totals`.
- *"the headline total follows the selected scope"* — select a group in
  `context-scope-select`, assert the headline's cost text equals that group
  row's `cell-cost` text. Fails if the headline ignores scope.

---

## §8 — Exit

```bash
npm test
npm run build
npm run lint
npm run format:check
npm run check:no-fake
npm run test:e2e
```

All six must pass, and **the full set is run at the end of each of the two
phases** (§6.4), not only at the end of the session.

`npm run check:no-fake`'s negative control is not re-run: no fake changes shape
this session.

**Manual checks, not in CI**, against the local uncommitted reference data:

- `npm run dev`, visiting all four pages in both locales.
- **The D1 claim:** tab through every control on every page — nav, context bar,
  grouping, range chips and date inputs, scope select, group disclosure, scope
  button, sort headers, session disclosure, price inputs, price toolbar, the
  reset `↺`, the other-models toggle, the language switcher — and confirm a
  visible focus ring on each. A control with no visible ring is a session
  failure, not a nitpick; that is what D1 is.
- **The D5 claim:** scroll a project with roughly 40 sessions expanded and
  confirm the **overview** table's header stays visible. The session table's
  header does not stick today and is not expected to (§4.2).
- `npm run regression` — unaffected by this session, but cheap proof that no
  arithmetic moved.

---

## §9 — Explicitly deferred by this session

- Everything in §2.2, to S21: measured contrast (starting with the two suspected
  cases named there), the full screen-reader pass, `aria-live` on scan status,
  the price-editor keyboard audit.
- Dark mode (D15), beyond v1.0.
- The `—` placeholders' text alternatives.
- Keyboard-reachable full paths (§4.5) — and whatever solves it must revisit
  NFR-6 first.
- A settings screen (S21), charts (S18), export (S19).
