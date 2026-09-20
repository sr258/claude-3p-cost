# S11 — Session detail: cost drivers

**Stories.** US-3.1 (`MUST`). Carried alongside: NFR-11 (keyboard operation, no
state by colour alone), NFR-7 (every new string through both catalogues, every
number through `Intl`), NFR-6 (nothing sensitive reaches the new `SessionRow`
field), NFR-3 (a missing or malformed field is a gap, never a throw), NFR-9
(this session's own Playwright spec).
**Depends on.** S9 (`SessionTable`, the disclosure/`aria-expanded` pattern, the
per-grouping expansion set), S10 (`ModelPanel`, `GapIndicators`, the grouping
toggle), S5 (`Report`, `SessionRow`, `CostTotals`, `TokenTotals`, `costShare`),
S3 (`parseAuditLines`, `RequestRecord`, `TokenUsage`, `SubagentStats`), S2
(`src/i18n/`).
**Status.** Planned 2026-09-20. Approved by the user; all nine design questions
are decided below and none is left open.

**Goal.** Where the money went inside one session.

---

## 0. Read this first

### 0.1 The parser is already finished for this story

Do not touch `src/model/audit-parser.ts`. It already produces, per request:

```
RequestRecord { timestamp, costMicroUsd, durationMs, durationApiMs,
                numTurns, isError, usage: TokenUsage, models, subagents }
```

and `TokenUsage` already carries `inputTokens`, `outputTokens`,
`thinkingTokens`, `cacheCreationInputTokens`, `cacheCreation1hInputTokens`,
`cacheCreation5mInputTokens`, `cacheReadInputTokens`, `webSearchRequests`,
`webFetchRequests`. `SubagentStats` already carries `spawned`.

**The one thing missing is that `buildReport` throws the request list away.**
`buildSessionRow` in `src/model/report.ts` loops `session.audit.requests` into
two accumulators and keeps neither; `SessionRow` exposes `totals` and `models`
only. Restoring that list (§4.1) is the single change to the data path this
session makes. There is no new parsing, no new field to extract, and no reason
to open the POC again for field names — §0.2 below records what was measured
instead.

### 0.2 Four facts measured against the real reference tree

Measured over all 508 `result` lines in the uncommitted reference tree. These
are the facts that shape the design; re-deriving them costs a scripting round
and the tree is not in CI.

1. **`thinking_tokens` is a SUBSET of `output_tokens`.** thinking ≤ output in
   every one of the 508 rows; 475 rows carry a non-zero value; the totals are
   1,851,475 thinking against 5,974,238 output. Listing thinking as a sixth
   sibling category would make the shares sum to roughly 103% and overstate the
   token total by 1.85M. §2 Q3 decides what happens instead.
2. **`cache_creation_input_tokens` equals `ephemeral_1h + ephemeral_5m`
   exactly**, in all 508 rows (24,660,319 tokens, all of it 1h; 5m is zero
   throughout). The remainder category of §2 Q4 is therefore invisible on real
   data — which is exactly why it must exist, and why only a fixture can test
   it.
3. **`server_tool_use.web_search_requests` and `web_fetch_requests` are zero
   across the entire tree**, and **`is_error` is true on zero rows.** Two
   acceptance criteria therefore have no real-data coverage at all. The
   synthetic fixture of §5 is their only test, and the Playwright fixture tree
   must carry them too. Do not "verify against the reference data" for these
   two — there is nothing there to verify against.
4. **Cache read dominates**: 629,395,588 of roughly 661M total tokens, about
   95%. A share bar for a real session is one long bar and five slivers. That is
   the true answer and must not be rescaled to look prettier; it is also why
   the numeric share is text in every row and the bar is decorative
   (`aria-hidden`), exactly as `ModelPanel` already does it.

### 0.3 Traps from LEARNINGS that apply directly

- **Preact keeps `false` for `data-*` attributes.** `data-error={false}` renders
  `data-error="false"`; the same expression on a non-hyphenated name removes the
  attribute. Non-error request rows get `undefined`, and §7 names a test for
  each branch.
- **A raw `U+0000` survives `tsc`, ESLint and Prettier.** The new expansion key
  is `` `${grouping}:${sessionId}` `` — plain ASCII, no sentinel. No new NUL is
  introduced anywhere in this session. The byte scan in §8 uses the only
  invocation that works: `command grep -rlaP '\x00' src plugins scripts e2e test`.
- **`no-irregular-whitespace` does not catch U+00A0 inside a string literal.**
  Every currency, percent and number expectation in the new tests is derived
  from `tCurrency` / `tPercent` / `tNumber`, never typed out.
- **A quoted English string in an end-to-end assertion is the translated-text
  trap in its easiest disguise.** The new spec asserts on `data-testid`,
  `data-*` attributes, `aria-expanded` and catalogue-derived values only.
- **Hand-built literals are not a substitute for a fixture** when the parser is
  the step that populates the field under test. The category tests run through
  `parseAuditLines` over a real `.jsonl` fixture; they do not hand-fill a
  `TokenUsage` object.
- **`localeCompare` is the model layer's back door to i18n.** Request ordering
  compares ISO timestamp strings by code unit. No collator, no `localeCompare`.
- **`CostTotals` carries no session count, so any derived total is a
  liability.** The detail header shows `session.totals.costMicroUsd`; it never
  re-sums the request rows it displays.

---

## 1. Shape of the change

A third inline expansion level, mirroring S9's project → session exactly
(§2 Q1). Each `session-row` gains a leading disclosure cell; an expanded session
renders `<SessionDetail>` inside a `<tr><td colSpan={9}>` directly beneath it.

```
┌─ Overview ───────────────────────────────────────────────────┬─ Models ─┐
│ ▼ Aurora              4   12   1.234,56 USD   2 Min. 5 Sek.   │ opus-5   │
│ ┌──────────────────────────────────────────────────────────┐  │  600,00  │
│ │   Sitzung  Titel      Anf.  Kosten    Out.Tok.  …         │  │  opus[1m]│
│ │ ▶ 7a1c0e44 Refactor     5   812,40 …                      │  │  634,56  │
│ │ ▼ 4f1a2b3c Tests        7   422,16 …                      │  └──────────┘
│ │ ┌────────────────────────────────────────────────────┐    │
│ │ │ Kostentreiber · 4f1a2b3c        422,16 USD gemessen│    │
│ │ │ Anteile sind Token-Anteile, keine Kostenanteile:   │    │
│ │ │ es ist keine Preistabelle hinterlegt.              │    │
│ │ │                                                    │    │
│ │ │ Kategorie          Tokens   Token-Anteil           │    │
│ │ │ Input               5.012   ▏             0,8 %    │    │
│ │ │ Output             41.880   ▎             6,4 %    │    │
│ │ │   davon Thinking   12.004        (28,7 % v. Out.)  │    │
│ │ │ Cache-Write 1 Std 160.220   █             24,4 %   │    │
│ │ │ Cache-Write 5 Min       0                 0,0 %    │    │
│ │ │ Cache-Read        449.010   ████████████  68,4 %   │    │
│ │ │ ───────────────────────────────────────────────    │    │
│ │ │ Websuche 3   ·   Web-Abruf 1   ·   Subagenten 4    │    │
│ │ │                                                    │    │
│ │ │ Zeitpunkt        Kosten   Züge  Dauer     Status   │    │
│ │ │ 02.01.26, 09:00  120,40 …    5  1 Min.             │    │
│ │ │ 02.01.26, 09:14  201,76 …    9  2 Min.   ⚠ Fehler  │    │
│ │ │ unbekannt        100,00 …    1  12 Sek.            │    │
│ │ │ 1 Anfrage ohne Ergebniszeile — Kosten nicht erfasst│    │
│ │ └────────────────────────────────────────────────────┘    │
│ └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┴──────────┘
```

`ModelPanel` is **not** touched. S10's code comment ("session scope is deferred
to S11") is satisfied by the detail box carrying its own model section derived
from `SessionRow.models`, not by widening the panel's scope union to three arms
— which would make the group-level breakdown unreachable while a session is
open.

S12 adds a tool-usage section to this same box. Lay the sections out as a
vertical stack of `<section>` elements so that is an append, not a relayout.

---

## 2. Design questions, all decided

### Q1 — Where does the detail view live? → inline third level

**Decided (user-confirmed): Option A.** A disclosure button per session row;
the detail renders full-width beneath it.

The disclosure/`aria-expanded`/`aria-controls` pattern, its per-grouping
expansion set and its Playwright idiom are all already built and tested in S9;
reusing them is near-zero risk and leaves `app.tsx` almost untouched. The
detail gets the full session-table width, which the six-category table and the
five-column request list both need — in a side panel one of them would have to
scroll sideways. Rejected: a side-panel variant (narrow, and forces a three-arm
scope union on `ModelPanel`) and a full-screen master/detail route (loses the
overview context that makes a per-session cost figure meaningful).

### Q2 — How do aborted requests appear? → as a note, never as rows

**Decided (user-confirmed).** An aborted request has no `result` line, so it has
no timestamp, no cost, no turns and no duration. A row for it would be five
placeholders implying we know something we do not.

`SessionRow.openRequests` (already `max(0, started - completed)`, from S3) is
rendered as a single line directly below the request list:
*"{count} Anfragen ohne Ergebniszeile — Kosten nicht erfasst"*. This is the same
treatment `GapIndicators` already gives the figure globally, scoped to one
session, and it satisfies MAP.md's "report the difference, never hide it". The
note is absent when `openRequests` is 0.

### Q3 — Do thinking tokens get their own category? → no, a sub-row of output

**Decided (user-confirmed).** Thinking tokens are a subset of output tokens
(§0.2 fact 1). They are rendered as an indented sub-row directly under the
Output row, with their own token count and a share **of output**, and they are
**excluded from the six-category share denominator**.

Two reasons beyond the arithmetic: the requirement's phrase "input, output,
thinking, …" is a list of things to show, not a partition; and S16's price table
will bill thinking at the output rate, so output-includes-thinking is the shape
that stays true after S16 rather than needing a second migration.

`TokenCategoryBreakdown` therefore exposes `thinkingTokens` and
`thinkingShareOfOutput` as fields of the breakdown, **not** as a
`TokenCategory`. `TokenCategoryKind` has no `"thinking"` member — if it did,
someone would eventually render it in the `categories.map`.

### Q4 — What if cache-write total exceeds 1h + 5m? → a remainder category

`tokenCategories` computes `cacheWriteOther = max(0, cacheCreationInputTokens -
cacheCreation1hInputTokens - cacheCreation5mInputTokens)` and appends a
`"cacheWriteOther"` category **only when it is greater than zero**.

It is exactly zero on all real data today, so it costs nothing visually. It is
the same honest-remainder pattern `unattributedCostMicroUsd` established in S5,
and it means a future `ephemeral_*` bucket we do not know about surfaces as an
unexplained row rather than silently disappearing from a breakdown whose entire
job is to add up. The clamp at zero matches `unattributedCostMicroUsd`'s
reasoning: a negative value would mean a parser bug, and a negative bar hides it
where a zero does not.

### Q5 — How is "token share, not cost share" labelled? → three signals, now

The ROADMAP note for S11 is explicit that this labelling is built this session
and not stubbed. Three independent signals, all required:

1. **The column header is `detail.columnTokenShare`** — *"Token-Anteil"* /
   *"Token share"*. Never a bare *"Anteil"* / *"Share"*, which is what
   `models.columnShare` says and what a reader would assume means money.
2. **A note under the section heading**, `detail.tokenShareNote`: *"Anteile sind
   Token-Anteile, keine Kostenanteile: es ist keine Preistabelle hinterlegt."* /
   *"Shares are token shares, not cost shares: no price table is configured."*
3. **The session's measured `total_cost_usd` is the only currency figure in the
   whole category section**, rendered once in the detail header with
   `detail.measuredCost` (*"{cost} gemessen"* / *"{cost} measured"*). The
   request list shows per-request cost, which is also measured; nothing anywhere
   in this session shows a derived or estimated money figure.

These key names stay accurate after S16: S16 adds a cost column and replaces the
note, it does not rename `columnTokenShare`.

### Q6 — How is the error flag rendered? → text badge plus `data-error`, never colour

A request with `isError` true gets a visible text badge (`detail.requestError`,
*"Fehler"* / *"Error"*) and `data-error="true"` on the `<tr>`, following the
existing `archived-badge` shape in `session-table.tsx`. Colour may reinforce it
and may never carry it alone (NFR-11).

A non-error request gets `data-error={undefined}` — **not** `false`. Per
LEARNINGS, Preact renders `data-error={false}` as the literal string
`"false"`, so a test asserting only the error case cannot tell "false" from
absent. §7 names a test for each branch, and the negative one asserts
`hasAttribute("data-error") === false`.

### Q7 — Where do the requests live? → `SessionRow.requests`

`SessionRow` gains `readonly requests: readonly RequestRecord[]`.

`SessionRow` is already the per-session carrier, and the same frozen object is
shared by `report.sessions`, `projectGroups[].sessions` and
`folderGroups[].sessions` — so one field serves all three with no duplication
and no lookup indirection. S13's date filter is request-granular and will want
it in the same place. Memory cost on the reference tree is 508
already-allocated objects that the parser built anyway.

Rejected: a `Map<sessionId, readonly RequestRecord[]>` beside `Report` — it
would need the session id threaded to every consumer and could drift out of
sync with the rows.

NFR-6: `RequestRecord` contains no path, no prompt and no free text, so it is
export-safe. That is asserted, not assumed — see the privacy test in §7.

### Q8 — Is the request list sorted or sortable? → chronological ascending, no controls

The list tells the story of the session, so chronological is the only default
that reads. All timestamps are the UTC `"Z"` form (as `firstTimestamp` /
`lastTimestamp` in `report-types.ts` already document), so a lexicographic
string compare is correct **without a clock** — which the model layer does not
have. Null timestamps sort last, both because there is nowhere sensible to put
them and because that is the nulls-last rule S9 already established for
`lastActivity`; note that the null verdict is **not** multiplied by any
direction sign, because there is no direction sign here at all.

Sort controls are not in the acceptance criteria and are cheap to add later.

### Q9 — Any cap on the request list length? → no

No cap, no virtualisation. NFR-4 is about not slurping files into memory, not
about DOM node counts, and the parser has already built every object in the
list. A cap would be silent truncation in exactly the view whose purpose is
completeness.

---

## 3. Acceptance criteria: satisfied and deferred

| US-3.1 criterion | S11 |
|---|---|
| Breakdown by token category — input, output, thinking, cache write 1h and 5m separately, cache read — with token count | **Satisfied** (thinking as a sub-row of output, §2 Q3) |
| …with **cost share** | **Satisfied as a token share**, explicitly labelled (§2 Q5) |
| …with **cost in USD** per category, computed from the price table (UC-4) | **Deferred to S16.** No price table exists until S15; the ROADMAP's S11 note sanctions the substitution and requires the labelling to be real now, which §2 Q5 delivers |
| Web search and web fetch counts shown when non-zero | **Satisfied** |
| Subagents spawned shown when non-zero | **Satisfied** |
| Requests listed with timestamp, cost, turns, duration, error flag | **Satisfied** |

**Explicitly out of scope**, and not to be added opportunistically:

- Tool-use counts from `assistant` lines — S12, which appends a section to this
  same box.
- Any date filtering of the category totals or the request list — S13.
- Any price entry, estimated cost, or dual cost display — S15 / S16.
- Sortable request-list columns (§2 Q8).
- Surfacing per-audit `Problem`s (`malformed-line`, `missing-cost`) in the
  detail. LEARNINGS records that this needs `MAX_PROBLEMS_PER_SCOPE`'s flat
  global cap of 20 replaced by a per-scope cap first, or one noisy session
  crowds out every scan-level problem. That is its own piece of work, not a
  drive-by in this session.

---

## 4. Files and signatures

### 4.1 `src/model/report-types.ts` — change

Add to `SessionRow`, and import `RequestRecord` from `./audit-types.js`:

```ts
  /**
   * Every parsed `result` line of this session, timestamp ascending, nulls
   * last (S11 plan §2 Q8). Frozen. Aborted requests are NOT here — they have
   * no `result` line and are counted in `openRequests` instead (§2 Q2).
   * Carries no path and no free text; NFR-6 containment is asserted in
   * `report-privacy.test.ts`.
   */
  readonly requests: readonly RequestRecord[];
```

### 4.2 `src/model/report.ts` — change

`buildSessionRow` keeps the requests it is already iterating. Ordering compares
ISO strings by code unit, never `localeCompare`:

```ts
function compareRequestsByTimestamp(a: RequestRecord, b: RequestRecord): number {
  if (a.timestamp === null && b.timestamp === null) return 0;
  if (a.timestamp === null) return 1;   // nulls last, in the only direction there is
  if (b.timestamp === null) return -1;
  return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
}
```

and the returned object gains
`requests: Object.freeze([...session.audit.requests].sort(compareRequestsByTimestamp))`.
Nothing else in `report.ts` changes: no total, no bucket, no group is affected.

### 4.3 `src/model/token-categories.ts` — new, pure

No i18n import, no clock, no DOM. `kind` is an untranslated identifier the UI
maps to a key.

```ts
export type TokenCategoryKind =
  | "input"
  | "output"
  | "cacheWrite1h"
  | "cacheWrite5m"
  | "cacheWriteOther"
  | "cacheRead";
// NOTE: deliberately no "thinking" member — see plan §2 Q3.

/** Structural: both `TokenTotals` (a session) and `TokenUsage` (one request) satisfy it. */
export interface TokenCategorySource {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheCreation1hInputTokens: number;
  readonly cacheCreation5mInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export interface TokenCategory {
  readonly kind: TokenCategoryKind;
  readonly tokens: number;
  /** 0..1 of `TokenCategoryBreakdown.totalTokens`; 0 when that is 0. Not a display rounding. */
  readonly share: number;
}

export interface TokenCategoryBreakdown {
  /**
   * Fixed order: input, output, cacheWrite1h, cacheWrite5m, cacheWriteOther,
   * cacheRead. The five base kinds are ALWAYS present, zero included — a
   * missing category and a zero category mean different things. "cacheWriteOther"
   * appears only when positive (§2 Q4).
   */
  readonly categories: readonly TokenCategory[];
  /** Sum over `categories`. The share denominator. Excludes thinking (§2 Q3). */
  readonly totalTokens: number;
  /** A SUBSET of the "output" category. Never a category of its own. */
  readonly thinkingTokens: number;
  /** thinkingTokens / outputTokens as 0..1; 0 when output is 0. */
  readonly thinkingShareOfOutput: number;
}

export function tokenCategories(source: TokenCategorySource): TokenCategoryBreakdown;
```

Everything returned is `Object.freeze`d, matching the rest of the model layer.

### 4.4 `src/components/session-detail.tsx` — new

Props only, no signal reads, consistent with `SessionTable` and `ModelPanel`.

```ts
export interface SessionDetailProps {
  /** Requests are already ordered by the model; this component never sorts. */
  readonly session: SessionRow;
}
export function SessionDetail(props: SessionDetailProps): JSX.Element;
```

Renders, in order, as sibling `<section>`s inside one `data-testid="session-detail"`
container carrying `data-session-id`:

1. **Header** — session id, and `detail.measuredCost` with
   `tCurrency(session.totals.costMicroUsd / 1e6)`. The `/ 1e6` happens here and
   nowhere else, per the display-boundary rule.
2. **Categories** — `detail.tokenShareNote`, then a table
   (`data-testid="category-table"`) of `data-testid="category-row"` rows with
   `data-category={kind}`, columns: label, `tNumber(tokens)`,
   `tPercent(share)` plus an `aria-hidden` bar reusing `ModelPanel`'s
   `.model-bar-track` idiom. The thinking sub-row is
   `data-testid="thinking-row"`, indented, showing `tNumber(thinkingTokens)` and
   `tPercent(thinkingShareOfOutput)` labelled `detail.thinkingOfOutput`.
3. **Server tools and subagents** — one line,
   `data-testid="server-tool-summary"`, rendered **only** when
   `webSearchRequests + webFetchRequests + subagentsSpawned > 0`; within it each
   of the three figures is shown only when its own value is non-zero.
4. **Models** — the session-scoped `ModelBreakdown` from `session.models`,
   reusing `costShare` and `unattributedCostMicroUsd` (this is what discharges
   S10's "session scope deferred to S11" comment).
5. **Requests** — a table of `data-testid="request-row"` rows with
   `data-error="true"` or `undefined` (§2 Q6), columns: `tDateTime` or
   `detail.noTimestamp`, `tCurrency`, `tNumber(numTurns)`, `tDuration`, and the
   error badge.
6. **Open-request note** — `data-testid="open-request-note"`, only when
   `session.openRequests > 0` (§2 Q2).

### 4.5 `src/state/app-state.ts` — change

Mirrors `expandedGroups` exactly, including the per-grouping prefix and the
"never pruned on rescan" property:

```ts
export const expandedSessions = signal<ReadonlySet<string>>(new Set());
export function toggleSession(g: Grouping, sessionId: string): void;
/** The raw (unprefixed) session ids expanded under this grouping. */
export function expandedSessionKeysFor(g: Grouping): ReadonlySet<string>;
```

Key is `` `${grouping}:${sessionId}` ``. Session ids are hex directory names, so
unlike `projectKey({kind:"none"})` / `NO_FOLDER_KEY` there is no shared sentinel
here — but the prefix is kept anyway so that expanding a session under the
project grouping does not silently expand it under the folder grouping too.
`runScan()` must not touch this signal, so expansion survives a rescan.

### 4.6 `src/components/session-table.tsx` — change

- A leading `<th scope="col">` for the disclosure column (`COLUMNS` grows from 8
  to 9 entries; the new one has `field: null`). Header cell is visually hidden
  text, not an empty cell.
- Each body row gains a leading `<td>` with a
  `data-testid="session-disclosure"` button carrying `aria-expanded` and
  `aria-controls={detailId}`, label from `detail.expandSession` /
  `detail.collapseSession` with the session id as a placeholder.
- An expanded session emits a second `<tr data-testid="session-detail-row">`
  with `<td colSpan={9} id={detailId}>` containing `<SessionDetail>`. Use
  `Fragment` with a key, as `OverviewTable` already does for its group/session
  pair.
- New props: `readonly expandedSessionKeys: ReadonlySet<string>` and
  `readonly onToggleSession: (sessionId: string) => void`.

### 4.7 `src/components/overview-table.tsx`, `src/app.tsx` — change

Thread `expandedSessionKeys` and `onToggleSession` through `OverviewTable` to
`SessionTable`. `app.tsx` supplies
`expandedSessionKeysFor(currentGrouping)` and
`(sessionId) => toggleSession(currentGrouping, sessionId)`. No other change to
either file; `ModelPanel` and its scope logic are untouched.

### 4.8 `src/i18n/de.ts` + `src/i18n/en.ts` — change

New keys, both catalogues in the same commit (`tsc` enforces parity: a missing
key is TS1360, an extra one TS2353). Keep the files' alphabetical ordering.

```
detail.heading                 Kostentreiber                       / Cost drivers
detail.measuredCost            {cost} gemessen                     / {cost} measured
detail.tokenShareNote          Anteile sind Token-Anteile, keine Kostenanteile: es ist keine
                               Preistabelle hinterlegt.
                               / Shares are token shares, not cost shares: no price table is
                                 configured.
detail.columnCategory          Kategorie                           / Category
detail.columnTokens            Tokens                              / Tokens
detail.columnTokenShare        Token-Anteil                        / Token share
detail.category.input          Input                               / Input
detail.category.output         Output                              / Output
detail.category.cacheWrite1h   Cache-Write 1 Std                   / Cache write 1 h
detail.category.cacheWrite5m   Cache-Write 5 Min                   / Cache write 5 min
detail.category.cacheWriteOther Cache-Write (sonstige)             / Cache write (other)
detail.category.cacheRead      Cache-Read                          / Cache read
detail.thinking                davon Thinking                      / of which thinking
detail.thinkingOfOutput        {share} vom Output                  / {share} of output
detail.webSearch.one/.other    {count} Websuche / Websuchen        / {count} web search(es)
detail.webFetch.one/.other     {count} Web-Abruf / Web-Abrufe      / {count} web fetch(es)
detail.subagents.one/.other    {count} Subagent / Subagenten       / {count} subagent(s)
detail.requestsHeading         Anfragen                            / Requests
detail.columnTimestamp         Zeitpunkt                           / Time
detail.columnTurns             Züge                                / Turns
detail.columnStatus            Status                              / Status
detail.requestError            Fehler                              / Error
detail.noTimestamp             unbekannt                           / unknown
detail.openRequests.one/.other {count} Anfrage ohne Ergebniszeile — Kosten nicht erfasst
                               / {count} request(s) with no result line — cost not recorded
detail.expandSession           Details zu Sitzung {id} anzeigen    / Show details for session {id}
detail.collapseSession         Details zu Sitzung {id} ausblenden  / Hide details for session {id}
detail.tableCaption            Kostentreiber der Sitzung {id}      / Cost drivers for session {id}
```

Wording is the planner's proposal; the implementer may polish the German as long
as both catalogues stay in step and no key is renamed.

### 4.9 `src/styles/index.css` — change

Detail box, the indented thinking sub-row, the category share bar (reuse
`.model-bar-track` / `.model-bar` rather than cloning them), the error badge.
No colour-only state.

---

## 5. `test/fixtures/audit/cost-drivers.jsonl` — new

Synthetic and invented. Nothing copied, quoted or paraphrased from the reference
tree. Every property below exists so that a **wrong** implementation gives a
different answer, not merely so a right one passes:

1. A request with input, output, thinking, 1h, 5m and cache-read all non-zero
   and **mutually distinct** — a swapped or aliased field is then visible in the
   numbers.
2. A request where `cache_creation_input_tokens` **exceeds** 1h + 5m (exercises
   `cacheWriteOther`), and a second where it **equals** them (exercises its
   omission). §0.2 fact 2 means real data only ever produces the second.
3. `thinking_tokens` strictly between 0 and `output_tokens` — this catches both
   "thinking is a sixth sibling category" (shares exceed 100%) and "thinking is
   subtracted out of output" (output row too small).
4. Non-zero `server_tool_use.web_search_requests` **and** `web_fetch_requests`
   in one session, both zero in another. **No real data covers this** (§0.2 fact 3).
5. `subagent_stats.spawned` non-zero in one request; `subagent_stats` **absent**
   in another — `RequestRecord.subagents` is `null`, not `{}`.
6. `is_error: true` on exactly one request. **No real data covers this.**
7. One `result` line with **no** `timestamp` field, to pin the nulls-last
   ordering and the `detail.noTimestamp` placeholder.
8. A `command_lifecycle` `started` with no matching `completed` and no `result`
   → `openRequests: 1`, and the request list has one fewer row than the number
   of `started` lines.

Export the path from `test/fixtures/audit/index.ts` alongside the existing
fixtures.

**Negative control, run once by hand** (LEARNINGS: verify a fixture's
"makes the wrong implementation fail" property by breaking the implementation).
Patch `tokenCategories` to emit thinking as a sixth sibling category, confirm
the share-sum test fails, then restore the file byte-for-byte. Record the
observed failure count in the implementation report.

---

## 6. `e2e/fixtures/trees.ts` — change

`resultLine()` currently emits **no** `usage` block at all, so no existing
Playwright fixture can exercise a single category. Extend it with optional
`usage`, `serverToolUse`, `subagentStats` and `isError` fields, then add a
`costDriversTree` (or extend `drilldownTree`, whichever keeps the existing
overview and drilldown assertions intact) with at least: one session carrying
all six categories plus thinking, non-zero web search and fetch and a non-zero
subagent count, one error request, and one aborted lifecycle. Export the ids the
spec needs as named constants, as the existing trees already do.

Every value invented. `dist-e2e` only; nothing under `src/` imports anything
under `e2e/`.

---

## 7. Tests, by name

**`src/model/token-categories.test.ts`** (new)
- `returns the five base categories in a fixed order`
- `shares sum to 1 and exclude thinking tokens from the denominator`
- `reports thinking tokens as a subset of output, with a share of output`
- `adds a cacheWriteOther category only when 1h + 5m falls short of the total`
- `omits cacheWriteOther when the ephemeral split is exact`
- `clamps a negative cache-write remainder to zero`
- `returns a zero total and zero shares for a session with no tokens`
- `accepts a per-request TokenUsage and a session TokenTotals alike`
- `exposes no "thinking" TokenCategoryKind`

**`src/model/report.test.ts`** (added)
- `SessionRow.requests keeps every parsed request`
- `SessionRow.requests is ordered by timestamp ascending`
- `SessionRow.requests puts a request with no timestamp last`
- `SessionRow.requests is frozen`
- `an aborted request yields no request row and is counted in openRequests`
- `keeping the request list changes no total, bucket or group`

**`src/model/report-privacy.test.ts`** (added)
- `SessionRow.requests carries no path-like and no free-text field`

**`src/state/app-state.test.ts`** (added)
- `toggleSession expands and collapses one session`
- `session expansion is tracked separately per grouping`
- `session expansion survives a rescan`

**`src/components/session-detail.test.tsx`** (new)
- `renders one row per token category with counts and token shares`
- `labels the share column as a token share and shows the no-price-table note`
- `shows the measured session cost as the only currency figure in the category section`
- `renders thinking tokens as a sub-row of output, not a sixth category`
- `omits the cache-write remainder row when the ephemeral split is exact`
- `hides the server-tool summary when web search, web fetch and subagents are all zero`
- `shows the web search count when non-zero and omits the web fetch count when zero`
- `shows the subagent count when non-zero`
- `lists each request with timestamp, cost, turns and duration`
- `flags an error request with a badge and data-error="true"`
- `leaves a non-error request with no data-error attribute at all`
- `renders a placeholder for a request with no timestamp`
- `reports requests started without a result instead of inventing rows`
- `omits the open-request note when every request completed`
- `renders the session-scoped model breakdown`

**`src/components/session-table.test.tsx`** (added)
- `each session row carries a disclosure button with aria-expanded`
- `an expanded session renders a detail row spanning every column`
- `a collapsed session renders no detail row`
- `the disclosure button is labelled from the catalogue with the session id`

**`e2e/session-detail.spec.ts`** (new)
- `drilling project to session to detail shows the cost-driver categories`
- `the token-share header comes from the catalogue in both locales`
- `an error request is flagged by text and attribute, not by colour`
- `a session with no server-tool use shows no server-tool summary`
- `collapsing the session removes the detail`

Every component and e2e assertion is on an accessible role, a `data-testid`, a
`data-*` attribute, or a value derived from the catalogue. No quoted English
string, and no hand-typed currency or percent literal.

---

## 8. Exit commands

```bash
npm run lint
npm run format:check
npm test
npm run build
npm run check:no-fake
npm run test:e2e
command grep -rlaP '\x00' src plugins scripts e2e test   # expect NO output
npm run regression                                        # manual; needs reference-material/
```

`npm run regression` must still pin 1,413,585,188 micro-USD, 150 sessions, 508
requests, 7 projects and 26 folder groups. Adding `SessionRow.requests` changes
no aggregate, and that unchanged run is the cheapest proof of it.

The `check:no-fake` negative control is **not** required this session: the fake
filesystem module's shape does not change (only `trees.ts` does), and LEARNINGS
scopes the control to "each time the fake changes shape".

---

## 9. Deliberate deferrals recorded here so they are not mistaken for oversights

- Per-category **cost in USD** — S16, gated on S15's price table (§3).
- Tool-use counts — S12, appended as a section to this same detail box (§1).
- Per-audit `Problem`s in the detail — blocked on replacing the global
  `MAX_PROBLEMS_PER_SCOPE` cap with a per-scope cap (§3).
- Sortable request-list columns (§2 Q8) and any cap on its length (§2 Q9).
- Persisting session expansion across restarts — the same reasoning S10 gave for
  the grouping toggle: a second ad-hoc `localStorage` key now is a migration in
  S15+/S21.
