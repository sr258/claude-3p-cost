# S16 — Dual cost display + transparency

**Stories.** US-4.1 (`MUST`), US-4.3 (`SHOULD`), and US-4.2's one criterion
deferred from S15 ("empty fields mean unknown: affected sessions are excluded
from the recomputed total and the exclusion is reported"). Carried alongside:
NFR-7 (every new string through both catalogues; every figure through `Intl`),
NFR-11 (no state by colour alone, keyboard operation), NFR-6 (nothing new
reaches an export or the UI that carries a path, an id or free text), NFR-3
(nothing here throws), NFR-2 (no report rebuild on a keystroke), NFR-9 (this
session's own Playwright spec).
**Depends on.** S5 (`ModelBreakdown`, `ModelTotal`, `Report`), S11 (the session
detail's `<section>` stack and `unattributedCostMicroUsd`), S13 (the date range
is already applied per request, so `SessionRow.models` is range-filtered), S15
(`prices.ts`, `price-table.ts`, `default-prices.ts`, `price-table-editor.tsx`,
the price signals and the JSON exchange), S2 (`src/i18n/`), S8 (the Playwright
harness).
**Feeds.** S17 (budgets compare against one of the two figures), S19 (export
carries both figures and the exclusion), S21 (the settings screen the price
editor moves into).
**Status.** Planned 2026-09-22. All decisions below were put to the user and
answered; none is left open. **Sized as over budget by the planner and run
deliberately anyway — see §0.4.**

**Goal.** The logged list price and the user's own price, side by side,
everywhere cost is shown; every session whose price is unknown excluded from the
own-price figure and that exclusion reported; the calculation itself opened up
per model and token category in the session detail.

---

## 0. Read this first

Four things. Two are measurements that changed the design, one is a recorded
risk decision, one is a correction to an earlier plan.

### 0.1 `RequestRecord.usage` is NOT the request's token total — `modelUsage` is

Measured over the whole local reference tree (150 audit files, 508 `result`
lines), read-only, during planning:

| | Σ `usage.*` on result lines | Σ `modelUsage.*` |
|---|---|---|
| input tokens | 705,183 | **9,448,806** |
| output tokens | 5,974,238 | **13,790,261** |
| cache-creation tokens | 24,660,319 | **56,962,740** |
| cache-read tokens | 629,395,588 | **1,172,698,166** |

`usage` equals `modelUsage` in only **214 of 507** single-model result lines.
Where they differ, `usage` behaves like the **last assistant message's** usage
while `modelUsage` aggregates every turn of the request — e.g. a request with
`num_turns: 10` showing `usage.input_tokens: 397` against
`modelUsage.inputTokens: 4308`.

The decisive check: **Σ `modelUsage.costUSD` equals Σ `total_cost_usd` to the
micro-USD.** The token counts that actually produced the logged cost are
`modelUsage`'s.

**Consequences, all binding:**

1. **S16 recomputes from `ModelBreakdown` (i.e. `RequestRecord.models`), never
   from `TokenTotals` / `RequestRecord.usage`.** An implementation that reaches
   for `session.totals.tokens` because it has six neat categories is wrong by a
   factor of several, and it will still look plausible.
2. **S11's token-category table and S16's calculation table show different
   numbers for the same session, and both are right.** They are different
   quantities. They must never share a table, and the detail panel says so in
   words (§6.6, method note 3).
3. `ModelTotal` already carries exactly the four fields the recomputation needs
   — `inputTokens`, `outputTokens`, `cacheCreationInputTokens`,
   `cacheReadInputTokens` — plus `webSearchRequests` and `costMicroUsd` (the
   per-model logged list cost). **No parser change and no new `Report`,
   `SessionRow` or `ModelTotal` field is required**, which is the single thing
   keeping this session buildable.
4. There are therefore **four** recomputation categories (input, output, cache
   write, cache read), not S11's six. `modelUsage` carries no 5 m/1 h split and
   no thinking split. Thinking tokens bill as output and need no line of their
   own.

This belongs in `LEARNINGS.md` at session end.

### 0.2 The cache-write TTL cannot be recovered per request, and it is worth 2.2 %

`modelUsage` carries one aggregate `cacheCreationInputTokens` per model. The
5 m/1 h split exists only on **`assistant`** lines. On `result` lines,
`usage.cache_creation.ephemeral_5m_input_tokens` is **0 across the entire
reference tree** and `ephemeral_1h_input_tokens` always equals
`cache_creation_input_tokens` — so the result line cannot supply the split
either, and what it does say is contradicted by the arithmetic below.

Solving the shipped `DEFAULT_PRICES` back against each model's logged
`costUSD` gives the implied fraction of cache-creation tokens that must have
been billed at the 5 m rate:

| model | implied 5 m fraction |
|---|---|
| `claude-haiku-4-5` | 0.000 |
| `claude-opus-4-7` | 0.000 |
| `claude-sonnet-4-6` | 0.000 |
| `claude-opus-5` | 0.067 |
| `claude-opus-5[1m]` | 0.098 |
| `claude-fable-5[1m]` | 0.298 |
| `claude-sonnet-5[1m]` | 0.599 |
| `claude-sonnet-5` | 0.629 |

The three exact-zero models are **exactly** S15 §1.2's three exact fits. S15's
evidence is confirmed and the residual is now quantified. The logs contradict
themselves: the result line's own TTL fields claim everything is 1 h, while the
arithmetic says 0.63 of `claude-sonnet-5`'s cache writes were 5 m.

**Decided (Q3):** the headline own-price figure prices the aggregate at
**`cacheWrite1h`**, and the **other bound is stated alongside it** — the same
figure with every cache-creation token at `cacheWrite5m`. Both bounds are shown;
neither is presented as the truth. Measured on the reference tree, with the
shipped defaults and the web-search column of Q4 included:

```
  logged list total                      1,413,585,188 µUSD
  own price, 1-hour cache rate           1,448,439,674 µUSD   +2.466 %
  bracket,   5-minute cache rate         1,249,165,035 µUSD  −11.631 %
  (own price at 1 h, web search excluded 1,444,359,674 µUSD   +2.177 %)
```

**Rejected: apportioning the split from `assistant` lines.** It halves the
error (+0.859 % measured) but needs a parser change, needs `message.model`
normalised (`claude-haiku-4-5-20251001`, and no `[1m]` suffix ever appears
there) onto price-table keys — i.e. exactly the suffix-stripping `CLAUDE.md`
forbids — and does not reconcile anyway: assistant cache-creation tokens sum to
33.2 M after dedup by `request_id` against `modelUsage`'s 56.9 M. The user was
shown this option and did not take it. **Do not implement it.**

### 0.3 Correction to `docs/plans/S15-price-table.md` §1.4

S15 §1.4 hands S16 the web-search discrepancy and predicts that "a recomputed
total will sit ~0.3 % *below* the logged one for that reason alone". That is
wrong about the sign of the total: the unrecoverable cache TTL (§0.2) dominates
the web-search gap by a factor of about 7.5 and pushes the other way. The real
figure is **+2.18 %** without the web-search column and **+2.47 %** with it.

§5.9 of this plan adds a one-line correction note to that document, in place, so
no later reader inherits the wrong expectation. S15's §1.4 is otherwise right:
web search is $0.01 per request and ≈ 0.29 % of the tree.

### 0.4 Accepted risk: this session is deliberately over budget

**Recorded here so a future reader finds it without reconstructing it from a
transcript — the same treatment S15 §0.1 was given.**

The roadmap's sizing rule is "roughly 3–6 new or changed production files, plus
their tests" and "one vertical concern per session". This session has
**fourteen** production files across **three** vertical concerns:

1. the recomputation model and the dual display (US-4.1 + US-4.2's criterion),
2. the transparency panel (US-4.3), and
3. **a sixth price-table column** — which reopens S15's Q8 and drags the price
   type, the shipped defaults, the editor, reset-per-row and reset-all,
   `isComplete`, and the JSON export *and import* format back into scope.

The planner sized this as over budget and recommended a split into S16a
(US-4.1 + the exclusion) and S16b (US-4.3), plus option (b) for web search
— exclude it from the own figure and report it as a named gap, with no new
column. **The user was told, explicitly, that the sixth column reopens a
settled S15 decision, that it is in a different unit from the other five, and
that it pulls the whole price-table surface back in. The user chose all of it
in one session anyway, and chose the bracket in §0.2 as well.** That decision
stands and is not re-argued here.

The mitigations, both binding on the implementer:

1. **Phase order (§5), load-bearing work first.** The roadmap says of this
   session: *"Get the exclusion reporting right; a silently partial 'own price'
   total is exactly the dishonesty the vision rules out."* So the exclusion rule
   and its tests are **phase 2**, immediately after the price-type change they
   depend on, and **before** any component work. The transparency panel is last.
   A session that runs out of time leaves a finished, tested, honest US-4.1 and
   an unfinished US-4.3 — the right way round.
2. **The negative controls in §7 are run inside their own phase**, not batched
   to the end where they are the first thing to be skipped.

There is no cut line. All of it ships.

---

## 1. Decisions

### Q1 — What does "a price table is configured" mean, now that S15 ships defaults? → at least one override exists

US-4.1 has two branches: both figures when a price table is configured, only the
list price when none is. S15 ships 16 complete default rows, so read literally a
table is always configured and the second branch is dead code.

Rejected: **(a)** always on — the default screen would then show a second cost
column differing from the first by +2.5 % for a *method* reason, out of the box,
to a user who has entered nothing. **(c)** an explicit user toggle — a
preference to design, persist and explain, for a state the override map already
expresses.

**Decided:** the dual display is on when **`priceOverrides.value.size > 0`** —
the user has actually entered at least one own rate. This makes US-4.1's second
branch real and testable, keeps the first-run screen at five columns, and
matches what the column means: "eigene Preise" is meaningless until there is an
own price. Inspecting the shipped defaults is what the price editor is for.

The gate is one computed signal, `ownPricesConfigured`. Resetting the last
override returns the app to the single-column state, which is correct and is
asserted.

### Q2 — Exclusion granularity → whole session, and only the prices it actually needs

US-4.2's criterion says "affected **sessions** are excluded", and the roadmap
repeats it. Model-level exclusion would produce a partially-priced session
figure that is not comparable with that session's own list figure — precisely
the dishonesty the roadmap warns about.

**Decided.** A session is excluded from the own-price total **iff any model it
used within the active range lacks a non-null price for a category that has
non-zero usage**. Precisely:

| category | needs | excludes when |
|---|---|---|
| input | `input` | `inputTokens > 0` and the price is null |
| output | `output` | `outputTokens > 0` and the price is null |
| cache write | `cacheWrite1h` | `cacheCreationInputTokens > 0` and the price is null |
| cache read | `cacheRead` | `cacheReadInputTokens > 0` and the price is null |
| web search | `webSearch` | `webSearchRequests > 0` and the price is null |

- A null price on a **zero-token / zero-request** category does not exclude: it
  would contribute nothing either way, and excluding for it would be its own
  small dishonesty.
- **A model absent from the price table entirely is unknown and excludes.**
- **`cacheWrite5m` is never in this table.** It is read only by the bracket
  (Q3b) and can never cause an exclusion.

**S15's editor wording needs no change.** The row warning is already
`prices.incomplete.*` — "N Modelle ohne vollständigen Preis" / "N models without
a complete price". It says *incomplete*, not *excluded*, so it cannot contradict
this rule in words. **Do not re-word it to say "excluded"**, and do not narrow
`PriceRow.isComplete` to the fields this table lists: the editor's warning is a
forward-looking caution about the whole row, the exclusion rule is about what a
given session's usage actually needs, and the two are deliberately different
predicates. `isComplete` gains the sixth field like every other (§4.1).

### Q3 — The cache-write TTL → the 1-hour rate as the headline, the 5-minute rate as a stated bracket

Per §0.2. `cacheWrite1h` is the right headline: it is the only TTL the result
line's own `usage` block ever reports, and it is exact for the three models that
fit exactly. The bracket is shown because the TTL genuinely cannot be recovered
and the logs contradict themselves, so presenting a single number as *the*
recomputation would overstate what is known.

**Decided:** the headline figure uses `cacheWrite1h`. Alongside it, wherever a
deviation is shown, a second line states the other bound: *"with the 5-minute
rate throughout: −11.6 %"*. Both are labelled as bounds of one unknown, not as
two competing estimates.

### Q3b — A missing `cacheWrite5m` hides the bracket; it never excludes

**Decided, and the two are separate predicates in the code:**

- `cacheWrite5m` is **not** in Q2's needs table. Clearing it can never exclude a
  session and never changes the headline figure by one micro-USD.
- The bracket for a **model** is available iff that model has a non-null
  `cacheWrite5m`. A model with zero cache-creation tokens has a bracket equal to
  its headline, which is correct, not a special case.
- The bracket for a **scope** (session, group, report) is available iff **every
  included model with `cacheCreationInputTokens > 0` has a non-null
  `cacheWrite5m`**. If even one does not, the scope bracket is **suppressed**
  and a note names the affected models.

  The reason is not fastidiousness: substituting the 1 h figure for a model
  whose 5 m price is unknown yields a number that is *not* a lower bound, since
  the true value for that model can lie below it. Presenting it as one would be
  a false claim, and it is exactly the kind of "plausible-looking but wrong"
  arithmetic a reviewer would have to catch by hand.

Test 11 separates the two predicates on one fixture: a session that keeps its
headline figure and loses its bracket.

### Q4 — Web search → a sixth price-table column, in USD per request

This **reopens S15's Q8**, which decided no sixth column on the grounds that web
search is priced per request rather than per Mtok and that the AC names five
columns. The user was told that, was told the column carries a different unit
from the other five, and was told it pulls the S15 price type, defaults, editor,
resets, `isComplete` and the JSON format into this session. The user chose it.

Rejected: **(b)** exclude web search from the own figure and report it as a
named gap — the planner's recommendation, on the grounds that "the own figure is
a function of your table and nothing else" is worth more than 0.29 %.
**(a)** include it at a hardcoded rate — then the own figure silently contains a
list-price component the user cannot edit, which is the worst of both.

**Decided.** `ModelPrice` gains a sixth field, `webSearch`, in **micro-USD per
request**, shipped pre-filled at `10_000` (= $0.01) under the same
`DEFAULT_PRICES_AS_OF` treatment as every other default. Web-search cost is then
part of the recomputed own-price figure, per model, and appears as its own line
in the transparency table.

Consequences, all planned for below:

- **Unit.** The stored integer is `USD × 1e6` for all six fields — which for the
  five token columns reads as µUSD per Mtok and for `webSearch` reads as µUSD
  per request. `parsePriceInput` and `formatPriceInput` therefore work unchanged
  on the sixth column; only the *amount* arithmetic differs (§4.2).
- **Editor.** The table-wide `prices.unit` line ("USD je 1 Mio. Tokens") becomes
  false the moment the sixth column exists. It is replaced by per-column unit
  labelling (§5.4), in both locales.
- **Exclusion.** Per Q2, an empty `webSearch` price excludes a session **only if
  that session actually made web-search requests**. In the reference tree 408
  requests used web search, so this path is live on real data — unlike most of
  the exclusion rule, which is inert there (§7, trap 4).
- **JSON.** Q4b.

### Q4b — JSON: a v1 file written by S15 has no `webSearch` field

**Decided:** `PRICE_JSON_VERSION` goes to **2**; exports emit all six fields.
On **import**, for every version:

- a field **absent** from a model's object means **"use the shipped default"** —
  no override is recorded for it. This is what makes a v1 file import cleanly:
  it simply says nothing about web search, and the shipped $0.01 applies.
- a field present with `null` still means **explicit unknown** (S15 Q5's third
  state), and is recorded as an override.
- a field present with a number is treated exactly as S15 does: recorded as an
  override unless it equals the shipped default.
- unknown extra keys are ignored.
- the `version` number is still not range-checked. One rule covers v1, v2 and
  anything later, and it degrades gracefully instead of refusing a file the user
  can plainly read.

**This is a behaviour change, not only an addition**, and it is the subtlest
thing in the session: S15's `decodePriceJson` loops `for (const field of
PRICE_FIELDS)` and calls `isValidFieldValue(rawPrice[field])`, which returns
`false` for `undefined`. Adding the sixth field **without** this rule makes
every v1 file fail with `reason: "value"`. Distinguishing absent from present
requires **`Object.hasOwn(rawPrice, field)`**, not `=== undefined`.

`e2e/prices.spec.ts` already writes v1 price documents by hand at three places;
after this change they become live v1-import cases and must keep passing
unmodified except where the spec asserts the exported shape.

### Q5 — Where `provider` and `costBasis` are surfaced → an overview strip and the session detail, never the status bar

Measured: `provider` is `"foundry"` in **509 of 509** `modelUsage` entries;
`costBasis` is `"list"` in **304** and **absent in 205**. "Not stated" is a
common, real value.

**Decided:** a pure `summarizeCostBasis()` over the sessions in scope,
rendered as one strip line above the overview table (global, honouring the
active range) and again, scoped, in the session detail. **Not the status bar**
— it already carries six items, and this is data about the numbers, not about
the scan.

- Every distinct value is listed, comma-separated, code-unit ordered. Never
  reduced to one, never "the first one wins".
- The 205 unstated entries are **counted explicitly and never defaulted to
  `"list"`.**
- Rendering is capped at **8 distinct values** and **32 characters** each, with
  a `+N weitere` remainder, so a pathological log cannot push arbitrary strings
  into the UI. These are vendor-written product identifiers, not user content
  (NFR-6 safe), but the cap costs nothing.

### Q6 — Sign, denominators and empty states

All as recommended, in full:

- **Sign.** `deviation = own − list`. Negative means your rates are cheaper than
  what was logged. Rendered with `signDisplay: "exceptZero"` passed **through**
  the existing formatters — `formatCurrency` gains an options passthrough, in
  the shape `formatNumber` and `formatPercent` already have (LEARNINGS: *extend
  the existing formatter in `src/i18n/format.ts` rather than adding a sibling*).
  **No hand-built sign prefix anywhere**, which is also how the U+00A0 trap
  stays shut.
- **Percentage base — the load-bearing one.** The percentage compares
  own(included sessions) against **the list cost of those same included
  sessions**, never the scope's full list total. Otherwise the exclusion leaks
  into the deviation and reads as a pricing difference. `Recomputation`
  therefore carries `listCostMicroUsd` (included) **and**
  `scopeListCostMicroUsd` (everything in scope) as two separate fields, and both
  are asserted (LEARNINGS: *pair any normalised-share assertion with an explicit
  pin on the denominator*).
- **Attributed base.** The own figure is built from `modelUsage`, so its
  comparison base is `models.costMicroUsd` (attributed list cost), not
  `totals.costMicroUsd` — `CLAUDE.md` is explicit that these are different
  things. They coincide on the reference tree and need not in general. The
  overview's list column keeps showing `totals.costMicroUsd` (US-2.1's figure,
  unchanged); the deviation uses the attributed base, and wherever
  `unattributedCostMicroUsd(totals, models)` (S11's existing helper) is non-zero
  the detail panel shows it as a named line.
- **Zero base.** `deviationRatio` is `null`, rendered `—` with title text.
  Never `Infinity`, never `NaN`, never `0 %`. The absolute deviation is still
  shown.
- **Excluded rows.** The own-price and deviation cells show the exclusion
  marker with title text — **never blank and never a zero-formatted currency**
  (US-4.1's second bullet is explicit about this).

### Q7 — Rounding, and where the sum is taken

**Decided, because it is otherwise decided by accident:**

- An amount is `Math.round(tokens * priceMicroUsd / 1e6)` per **(scope, model,
  category)** line, in integer micro-USD. Web search is `requests *
  priceMicroUsd` exactly — no division, because the `× 1e6` in the stored value
  and the "per request" unit already cancel.
- **A group's and the report's own-price figure is the sum of its included
  sessions' figures — never a recomputation of the aggregated
  `ModelBreakdown`.** The session is the unit of exclusion, so it must also be
  the unit of summation, or an excluded session's tokens would silently rejoin
  the total at group scope. Test 14 is built so the two differ.

---

## 2. UI

### 2.1 Overview table — two cost columns (decided)

```
 Projekt            Sitz. Anfr.  Kosten      Kosten        Dauer
                                 (Liste)     (eigene) ⓘ
 ──────────────────────────────────────────────────────────────
 ▶ Projekt Alpha     12    88    612,40 USD  ≈ 551,16 USD  4:12
 ▶ Projekt Beta       9    63    401,05 USD  ≈ 360,94 USD  3:02
 ▶ Projekt Gamma      6    41    188,22 USD  ≈ — (2)       1:47
 ──────────────────────────────────────────────────────────────
 Gesamt              27   192  1.201,67 USD  ≈ 912,10 USD  9:01
 ⚠ ausgeschlossen     2    14    188,22 USD  —             —
 ──────────────────────────────────────────────────────────────

 ⚠ 2 von 27 Sitzungen ohne vollständigen Preis — vom berechneten
   Gesamtwert ausgeschlossen. Betroffene Modelle: claude-fable-5[1m].
 ⓘ Berechneter Wert. Abweichung −5,3 % / −63,45 USD gegenüber den
   einbezogenen Sitzungen. Mit dem 5-Minuten-Cache-Satz: −14,1 %.
 Protokollierte Preisbasis: list (205 Einträge ohne Angabe)
   · Anbieter: foundry
```

Six columns. The own-price cell is marked **three ways** — the `≈` glyph, the
column header's `ⓘ` footnote, and `data-computed="true"` — so no state is
carried by colour alone (NFR-11). The exclusion appears twice on purpose
(decided): as a `<tfoot>` row so that `912,10 + 188,22 ≈ 1.201,67` is checkable
at a glance, and as prose naming the affected models. The `<tfoot>` exclusion
row renders `—` in the own-price and duration cells, never `0,00 USD`.

### 2.2 Session table — secondary line, staying at 9 columns

The session table is already nine columns wide; a tenth pushes it past the app's
minimum width. The own figure goes on a secondary line inside the existing cost
cell:

```
 … Kosten            …
   612,40 USD
   ≈ 551,16 (−10,0 %)
 …
   188,22 USD
   ≈ nicht berechenbar
```

The mixed idiom between §2.1 and §2.2 is a deliberate decision, not an accident
of implementation.

### 2.3 Session detail — the calculation table (US-4.3)

One row per **model and category**, because "token count × price = amount" is
the literal wording of the acceptance criterion:

```
 Berechnung nach eigenen Preisen                          ⓘ
 ───────────────────────────────────────────────────────────
 Modell / Kategorie      Tokens   × Preis/Mtok   = Betrag
 ───────────────────────────────────────────────────────────
 claude-opus-5[1m]
   Eingabe              123.456      5,00 USD      0,62 USD
   Ausgabe               45.678     25,00 USD      1,14 USD
   Cache-Schreiben *    890.123     10,00 USD      8,90 USD
   Cache-Lesen        4.500.000      0,50 USD      2,25 USD
   Websuche             12 Anfr.   0,010 USD/Anfr. 0,12 USD
   Summe (eigene)                                 13,03 USD
   Protokolliert (Liste)                          13,20 USD
   Abweichung                          −1,3 %     −0,17 USD
 ───────────────────────────────────────────────────────────
 Sitzung gesamt (eigene)                          13,03 USD
 Sitzung gesamt (Liste, zugeordnet)               13,20 USD
 Abweichung                            −1,3 %     −0,17 USD
 Mit 5-Minuten-Cache-Satz                         10,69 USD
 ───────────────────────────────────────────────────────────
 * Das Protokoll unterscheidet je Modell nicht zwischen
   5-Minuten- und 1-Stunden-Cache. Gerechnet wird mit dem
   1-Stunden-Satz; das überschätzt die Cache-Kosten (in den
   Referenzdaten um rund 2 %). Die zweite Zeile oben zeigt
   die andere Grenze.
 ⓘ Diese Tokenzahlen stammen aus `modelUsage` und liegen über
   der Kategorietabelle weiter oben, die die Nutzung der
   letzten Nachricht zeigt. Beide sind korrekt.
 Protokollierte Preisbasis: list · Anbieter: foundry
```

The web-search row carries its own unit in both the price and the count column,
because it is the one line not denominated per Mtok.

---

## 3. Acceptance criteria

### Satisfied by this session

| AC | How |
|---|---|
| US-4.1 — "Kosten (Listenpreis)" and "Kosten (eigene Preise)" side by side in the overview, per project and per session | §2.1, §2.2; `OverviewTable`, `SessionTable` |
| US-4.1 — with no price table configured, only the list price; nothing blank or zero | Q1's `ownPricesConfigured` gate; excluded cells render a marker, asserted in test 20 |
| US-4.1 — the recomputed figure is always visually marked as computed | `≈` + `data-computed` + the column footnote; both `data-computed` branches asserted (test 22) |
| US-4.1 — `costBasis` and `provider` from the data shown | Q5; `summarizeCostBasis`, `RecomputeNote`, session detail |
| US-4.2 (deferred criterion) — empty fields mean unknown; affected sessions excluded and the exclusion reported | Q2; `RecomputeExclusion`; the `<tfoot>` row + prose strip |
| US-4.3 — session detail shows the calculation per model and token category: tokens × price = amount | §2.3; `RecomputePanel` over `ModelRecompute.lines` |
| US-4.3 — deviation from the logged list price in absolute and percentage terms | Q6; per model and per session |

### Explicitly not attempted

- Any change to S11's `usage`-based category table (§0.1 consequence 2).
- Any parser change; any assistant-line cache-TTL apportionment (§0.2).
- Budgets, export, charts — S17, S19, S18.

---

## 4. Boundary types and signatures

### 4.1 `src/model/prices.ts` — the sixth field

```ts
/** All six values are USD × 1e6. For the five token fields that reads as
 *  micro-USD per million tokens; for `webSearch` it reads as micro-USD per
 *  request. `parsePriceInput`/`formatPriceInput` are unit-agnostic and are
 *  unchanged. `null` always means "unknown", never 0 (S15 Q5). */
export type PriceMicroUsdPerMtok = number;
export type PriceMicroUsdPerRequest = number;

export interface ModelPrice {
  readonly input: PriceMicroUsdPerMtok | null;
  readonly output: PriceMicroUsdPerMtok | null;
  readonly cacheWrite5m: PriceMicroUsdPerMtok | null;
  readonly cacheWrite1h: PriceMicroUsdPerMtok | null;
  readonly cacheRead: PriceMicroUsdPerMtok | null;
  /** S16 Q4. Per REQUEST, not per Mtok. */
  readonly webSearch: PriceMicroUsdPerRequest | null;
}

export type PriceUnit = "per-mtok" | "per-request";
/** Drives the editor's per-column unit label and the panel's price column. */
export const PRICE_FIELD_UNIT: Readonly<Record<PriceField, PriceUnit>>;

/** `webSearch` is appended LAST, so the five existing columns keep their order. */
export const PRICE_FIELDS: readonly PriceField[];
```

`PriceField`, `PriceOverrides`, `PriceTable`, `PriceParse`, `parsePriceInput`
and `formatPriceInput` are unchanged in shape.

### 4.2 `src/model/recompute.ts` (new)

```ts
export type RecomputeCategory =
  | "input" | "output" | "cacheWrite" | "cacheRead" | "webSearch";

/** The price field each category reads for the HEADLINE figure.
 *  `cacheWrite` -> `cacheWrite1h`. `cacheWrite5m` is NOT in this map — it is
 *  read only by the bracket (Q3b) and can never cause an exclusion. */
export const CATEGORY_PRICE_FIELD: Readonly<Record<RecomputeCategory, PriceField>>;

export interface RecomputeLine {
  readonly category: RecomputeCategory;
  /** Token count, or request count for `webSearch`. */
  readonly units: number;
  readonly unit: PriceUnit;
  readonly priceMicroUsd: number | null;      // null = unknown, never 0
  readonly amountMicroUsd: number | null;     // null iff the price is null
}

/** The 5-minute bound (Q3, Q3b). Null where it cannot honestly be stated. */
export interface CacheBracket {
  readonly costMicroUsd: number;
  readonly deviationMicroUsd: number;
  readonly deviationRatio: number | null;
}

export interface ModelRecompute {
  readonly model: string;                      // "[1m]" NEVER normalised
  readonly lines: readonly RecomputeLine[];    // always 5, zeros included
  readonly costMicroUsd: number;               // 0 when !priced
  readonly listCostMicroUsd: number;           // ModelTotal.costMicroUsd
  readonly priced: boolean;
  readonly missingFields: readonly PriceField[];  // untranslated identifiers
  /** Null iff this model has cache-creation tokens and no `cacheWrite5m`. */
  readonly bracket: CacheBracket | null;
  readonly webSearchRequests: number;
}

export interface RecomputeExclusion {
  readonly sessions: number;
  readonly models: readonly string[];          // distinct, code-unit order
  readonly listCostMicroUsd: number;
}

export interface Recomputation {
  readonly models: readonly ModelRecompute[];  // input order preserved
  readonly costMicroUsd: number;               // INCLUDED sessions only
  readonly listCostMicroUsd: number;           // INCLUDED only — the % base
  readonly scopeListCostMicroUsd: number;      // everything in scope
  readonly deviationMicroUsd: number;          // own − list(included)
  readonly deviationRatio: number | null;      // null when the base is 0
  readonly excluded: RecomputeExclusion;
  /** Null when any included model with cache-creation tokens lacks a 5m price. */
  readonly bracket: CacheBracket | null;
  readonly bracketUnavailableModels: readonly string[];
  readonly webSearchRequests: number;
  readonly isEmpty: boolean;                   // nothing priced at all
}

export interface SessionRecomputation extends Recomputation {
  readonly sessionExcluded: boolean;
}

export function recomputeBreakdown(
  breakdown: ModelBreakdown, table: PriceTable): Recomputation;

export function recomputeSession(
  session: SessionRow, table: PriceTable): SessionRecomputation;

/** Sums INCLUDED sessions only (Q7). Never a recompute of an aggregate. */
export function recomputeSessions(
  sessions: readonly SessionRow[], table: PriceTable): Recomputation;

export interface ReportRecomputation {
  readonly total: Recomputation;
  /** Project AND folder group keys, so S10's toggle rebuilds nothing. */
  readonly byGroupKey: ReadonlyMap<string, Recomputation>;
  readonly bySessionId: ReadonlyMap<string, SessionRecomputation>;
}
export function recomputeReport(report: Report, table: PriceTable): ReportRecomputation;
```

### 4.3 `src/model/cost-basis.ts` (new)

```ts
export const MAX_DISTINCT_VALUES = 8;
export const MAX_VALUE_LENGTH = 32;

export interface CostBasisSummary {
  readonly providers: readonly string[];       // distinct, code-unit order, capped
  readonly costBases: readonly string[];       // distinct, excluding null
  readonly unstatedCostBasisEntries: number;   // costBasis === null
  readonly entries: number;                    // modelUsage entries seen
  readonly truncated: boolean;
}
export function summarizeCostBasis(sessions: readonly SessionRow[]): CostBasisSummary;
```

### 4.4 `src/state/app-state.ts`

```ts
export const ownPricesConfigured = computed<boolean>(() => priceOverrides.value.size > 0);

export const recomputation = computed<ReportRecomputation | null>(() =>
  report.value === null || !ownPricesConfigured.value
    ? null
    : recomputeReport(report.value, priceTable.value),
);

export const costBasis = computed<CostBasisSummary | null>(() =>
  report.value === null ? null : summarizeCostBasis(report.value.sessions),
);
```

`Report`, `SessionRow`, `GroupRow` and `ModelTotal` gain **no field**. The
recomputation is a sibling signal, exactly as S15 §4 established for the price
table: `buildReport` stays a pure function of scan input, and a keystroke in the
price editor never rebuilds the report (NFR-2).

### 4.5 `src/i18n/format.ts`

```ts
export function formatCurrency(
  locale: Locale,
  value: number,
  currency = "USD",
  options?: Intl.NumberFormatOptions,     // ADDITIVE — no call site changes
): string;
```
and `tCurrency(value, currency?, options?)` to match. Defaults first,
`...options` last, as `formatNumber` and `formatPercent` already do.

### 4.6 Model-layer rules that must not be broken

Pure model layer: no `src/i18n/` import, no clock, no DOM, no `localeCompare`
(sort by code unit); integer micro-USD throughout with a single `/1e6` at the
display boundary; `Object.freeze` on every returned structure; the `[1m]` suffix
never normalised; `missingFields` and `RecomputeCategory` are untranslated
identifiers the UI maps to keys; no path, id or free text anywhere in the new
types (NFR-6 — model strings and `provider`/`costBasis` are vendor product
identifiers, the same class S15 §1 already committed).

---

## 5. Phases — do them in this order

The order is the §0.4 mitigation, not a preference.

### 5.1 Phase 1 — the sixth price column, bottom up

`src/model/prices.ts` (field, `PriceUnit`, `PRICE_FIELD_UNIT`),
`src/model/default-prices.ts` (`webSearch: 10_000` for all 16 rows; the
`DEFAULT_PRICES_AS_OF` comment rule applies — if a price literal moves, the
constant moves with it in the same commit), `src/model/price-table.ts`
(`PRICE_JSON_VERSION = 2`; the `Object.hasOwn` import rule of Q4b; the three
all-fields object literals gain the sixth key).

**Expected compiler fallout, and it is not scope creep** (LEARNINGS: *making a
shared type's field non-optional fans out into every hand-built test object
literal, including files a session's plan does not name*). Known sites:
`src/model/price-table.test.ts` (3 literals), `src/components/price-table-editor.test.tsx`
(1), `e2e/prices.spec.ts` (3 JSON documents — which then become live v1-import
cases and must keep passing). There are **no `as ModelPrice` / `as PriceTable`
assertions** in the tree, verified during planning, so `tsc` will find every
site; do not add one.

Run `npm run build` and `npm test` at the end of this phase before writing
another line.

### 5.2 Phase 2 — the recomputation and the exclusion rule

`src/model/recompute.ts` and `src/model/recompute.test.ts`, complete, including
the bracket and the exclusion. **Tests 1–16 all pass before any component is
touched**, and the two negative controls of §7.1 are run **here**, not at the
end of the session.

This is the phase the roadmap's warning is about.

### 5.3 Phase 3 — `cost-basis.ts` and its tests

Small and independent. Do it now so phase 4 has everything it needs.

### 5.4 Phase 4 — the price editor's sixth column

`src/components/price-table-editor.tsx`: the column, its per-column unit label,
reset-per-row and reset-all already generic over `PRICE_FIELDS` (verify rather
than assume), and the replacement of the table-wide `prices.unit` line with
per-column units in both locales. The sixth column's header must make the unit
unambiguous in German and English — it is the only column not per Mtok.

### 5.5 Phase 5 — the overview and session tables

`overview-table.tsx` (§2.1: the sixth column, the `<tfoot>` exclusion row),
`session-table.tsx` (§2.2: the secondary line), `recompute-note.tsx` (the prose
strip + the provider/costBasis line), `app.tsx` wiring, CSS.

### 5.6 Phase 6 — the transparency panel

`recompute-panel.tsx` (§2.3) appended as a new `<section>` to `SessionDetail`'s
existing vertical stack — S11 built that stack so this would be an append, not a
relayout — plus the three method notes and the scoped cost-basis line.

### 5.7 Phase 7 — the Playwright spec

`e2e/dual-cost.spec.ts`, and the `e2e/prices.spec.ts` amendments phase 1
predicted.

### 5.8 Phase 8 — the regression pin

Extend `src/model/reference-distribution.test.ts` (manual, local data only,
never CI) with the own-price total under the shipped defaults. **Pin what the
pipeline yields.** The planner's independent expectations, computed during
planning with JS-compatible rounding:

```
  list total                           1,413,585,188 µUSD   (already pinned)
  own price, 1h + web search column     1,448,439,674 µUSD   +2.466 %
  5-minute bracket, + web search        1,249,165,035 µUSD  −11.631 %
```

If the pipeline disagrees, **stop and report** rather than editing these
numbers in — they were derived independently and a disagreement is information.
(Note for anyone re-deriving them in Python: `round()` there is banker's
rounding and `Math.round` is not; that difference alone is worth 36 µUSD on the
list total.)

### 5.9 Phase 9 — documents

- `docs/plans/S15-price-table.md` §1.4: a one-line correction note per §0.3,
  added in place, not a rewrite.
- `CLAUDE.md` "Data Model Essentials": the §0.1 finding (`modelUsage` is the
  authoritative token source; `usage` on a result line is the last message's).
- `ROADMAP.md`: S16 marked done with a link to this plan, and a note that the
  sixth price column reopened S15's Q8 by user decision.
- `REQUIREMENTS.md` / `CLAUDE.md` NFR-8 deviation lists: **no change** — this
  session adds no dependency. (LEARNINGS: the bookkeeping lives in two files;
  it is checked here and found not to apply.)

---

## 6. Files

**New (6 production + 5 test)**

| File | |
|---|---|
| `src/model/recompute.ts` | the recomputation, pure |
| `src/model/recompute.test.ts` | |
| `src/model/cost-basis.ts` | provider/costBasis summary, pure |
| `src/model/cost-basis.test.ts` | |
| `src/components/recompute-note.tsx` | exclusion prose + cost-basis strip |
| `src/components/recompute-note.test.tsx` | |
| `src/components/recompute-panel.tsx` | US-4.3's calculation table |
| `src/components/recompute-panel.test.tsx` | |
| `e2e/dual-cost.spec.ts` | |

**Changed (production)**

`src/model/prices.ts`, `src/model/default-prices.ts`, `src/model/price-table.ts`,
`src/components/price-table-editor.tsx`, `src/state/app-state.ts`,
`src/components/overview-table.tsx`, `src/components/session-table.tsx`,
`src/components/session-detail.tsx`, `src/app.tsx`, `src/i18n/de.ts`,
`src/i18n/en.ts`, `src/i18n/format.ts`, `src/i18n/index.ts`, `src/styles/`.

**Changed (tests / docs)**

`src/model/price-table.test.ts`, `src/model/default-prices.test.ts`,
`src/components/price-table-editor.test.tsx`,
`src/components/overview-table.test.tsx`, `src/components/session-table.test.tsx`,
`src/components/session-detail.test.tsx`, `src/state/app-state.test.ts`,
`src/model/reference-distribution.test.ts`, `e2e/prices.spec.ts`,
`docs/plans/S15-price-table.md`, `CLAUDE.md`, `ROADMAP.md`.

---

## 7. Tests, by name

### 7.1 `src/model/recompute.test.ts`

The first three are engineered so a plausible **wrong** implementation produces a
different *number*, not merely a missing field (LEARNINGS: *build a test so the
wrong implementation gives a different answer*).

1. `prices from modelUsage token counts, never from the result line usage block`
   — fixture where `usage` and `modelUsage` differ by a factor the expected
   total exposes.
2. `computes the deviation against the list cost of the included sessions only`
   — two sessions, one excluded; the scope-total denominator gives a visibly
   different percentage.
3. `uses the exact variant key and never falls back to the base model` —
   `claude-opus-5` and `claude-opus-5[1m]` given deliberately different prices;
   a suffix-stripping implementation picks the wrong one.
4. `excludes a whole session when one model lacks a price for a category with non-zero tokens`
5. `keeps a session whose null price belongs to a zero-token category`
6. `reports the excluded session count, the affected model keys and their logged list cost`
7. `treats a model absent from the price table as unknown, never as zero`
8. `returns a null amount, never zero, for an unknown price`
9. `prices aggregate cache-creation tokens with cacheWrite1h` — 5 m and 1 h set
   far apart so reading the wrong field is visible in the total.
10. `prices web search per request and never divides it by a million` — the
    unit-confusion test; a per-Mtok implementation is off by 1e6.
11. `a missing cacheWrite5m hides the bracket and does not exclude the session`
    — **the Q3b separation test.** One fixture, two assertions: the headline
    figure and `sessionExcluded === false` are unchanged, and `bracket === null`
    with the model named in `bracketUnavailableModels`.
12. `suppresses the scope bracket when any included cache-using model lacks a 5m price`
13. `excludes a session with web-search requests when the webSearch price is null, and keeps one with zero web-search requests`
14. `a group figure is the sum of its included sessions, not a recompute of the group breakdown`
    — a group with one excluded session, built so the two differ.
15. `reports a null deviation ratio, not Infinity, when the included list cost is zero`
16. `stays empty and finite when every price is unknown` — `isEmpty`, no `NaN`.
17. `emits only integer micro-USD amounts` — integrality of every line and total.

### 7.2 `src/model/price-table.test.ts` (additions)

18. `imports a v1 document with no webSearch field and applies the shipped default`
    — built as a **raw JSON string**, and asserting the precondition that the
    key is genuinely absent (LEARNINGS: the `JSON.stringify` / `__proto__`
    lesson generalises — a document built from an object literal may not contain
    what the test thinks it does).
19. `distinguishes an absent webSearch field from an explicit null` — absent →
    no override, shipped default applies; `null` → override recorded, unknown.
20. `round-trips a v2 document through encode and decode`

### 7.3 `src/model/cost-basis.test.ts`

21. `collects distinct provider and costBasis values in code-unit order`
22. `counts entries with no costBasis rather than defaulting them to "list"`
23. `caps distinct values and value length and reports truncation`

### 7.4 Component tests

`overview-table.test.tsx`
24. `shows only the list column when no own price is configured`
25. `shows both cost columns with the computed marker when an own price is configured`
26. `renders an excluded row's own-price cell as a marker, never blank and never a zero currency`
    — expected strings **derived from `formatCurrency`**, never typed (LEARNINGS:
    `Intl` emits U+00A0 and `no-irregular-whitespace` will not catch it in a
    string literal).
27. `renders the tfoot exclusion row with the excluded session count and list amount`
28. `sets data-computed in both branches` (LEARNINGS: Preact keeps `false` only
    on `data-*` names; a true-only assertion cannot distinguish `"false"` from
    absent).
29. `counts only the table's own header cells` — `:scope > thead > tr > th`,
    because the expanded session panel nests tables (LEARNINGS).

`session-table.test.tsx`
30. `renders the own-price secondary line per session and a marker for an excluded one`

`recompute-note.test.tsx`
31. `names every distinct provider and costBasis found, never just the first`
32. `states the unstated-costBasis count`
33. `names the models that cost the scope its bracket`

`recompute-panel.test.tsx`
34. `renders one row per model and category with units, price and amount`
35. `labels the web-search row with its own per-request unit`
36. `renders the deviation with an explicit sign in both directions`
37. `renders no percentage and a reason when the list base is zero`
38. `renders the 5-minute bracket line, or a reason for its absence`
39. `states the modelUsage-versus-usage difference and the unattributed remainder when non-zero`

`price-table-editor.test.tsx`
40. `renders six columns with a per-column unit, the sixth per request`
41. `resets the web-search price with the row and with the whole table`

`app-state.test.ts`
42. `ownPricesConfigured is false with no overrides and true after one edit`
43. `recomputation is null while no own price is configured`

### 7.5 `e2e/dual-cost.spec.ts`

44. `enters an own price, then shows both figures and a signed deviation`
45. `clears a price, then reports the exclusion in the overview`

Both assert on roles and `data-testid`, and derive every expected string from
the catalogue — never a quoted English word (LEARNINGS: *a quoted English string
in an end-to-end assertion is the translated-text trap in its easiest
disguise*). E2E fixture timestamps stay at noon UTC.

### 7.6 `src/model/reference-distribution.test.ts`

46. `recomputes the reference tree under the shipped defaults` — §5.8's figures,
    manual, never CI.

### 7.7 Negative controls — run in the phase they belong to, restore byte-for-byte, report the observed failure counts

| # | Injected breakage | Must fail | Phase |
|---|---|---|---|
| **C1** | divide by `scopeListCostMicroUsd` instead of `listCostMicroUsd` | **test 2.** The control that proves the exclusion does not leak into the deviation. If this passes, the denominator design is wrong — **stop and re-plan.** | 5.2 |
| **C2** | read `session.totals.tokens` instead of `session.models` | **test 1.** The §0.1 control. | 5.2 |
| C3 | read `cacheWrite5m` for the headline figure | test 9 | 5.2 |
| C4 | let a missing `cacheWrite5m` exclude the session | test 11 | 5.2 |
| C5 | recompute the group from its aggregated `ModelBreakdown` | test 14 | 5.2 |
| C6 | divide the web-search amount by 1e6 | test 10 | 5.2 |
| C7 | treat an absent JSON field as `null` | test 18/19 | 5.1 |

**Inert-on-real-data warning** (LEARNINGS: *a regression pin computed from real
data cannot prove a guard-rail that is a no-op on that data*): every model in
the reference tree has a complete shipped default, so **tests 4–8 and 11–17 are
inert against it**. They are covered by synthetic fixtures and the §5.8
regression must never be cited as coverage for them. The one exception is
test 13's web-search path, which the tree's 408 web-search requests do exercise.

---

## 8. Exit commands

```bash
npm test
npm run build
npm run lint
npm run format:check
npm run check:no-fake
npm run test:e2e
npm run regression                       # manual, local reference data only
grep -rn 'String(' src/components/       # LEARNINGS: the tNumber placeholder trap
rg -l --text --no-ignore --hidden --encoding none -e '\x00' src plugins scripts e2e test
#   expect exactly: test/fixtures/utf16le-lines.bin
```

All must be clean, and the §7.7 controls must have been run and their observed
failure counts recorded in the implementation report.
