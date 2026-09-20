# S12 — Tool usage per session

**Stories.** US-3.2 (`SHOULD`). Carried alongside: NFR-11 (keyboard operation,
no state by colour alone), NFR-7 (every new string through both catalogues,
every number through `Intl`), NFR-6 (nothing sensitive reaches the new
`SessionRow` field), NFR-3 (a malformed block is ignored, never a throw), NFR-4
(counting happens in the streaming accumulator), NFR-9 (this session's own
Playwright spec).
**Depends on.** S11 (`SessionDetail` and its vertical `<section>` stack, the
session disclosure), S5 (`Report`, `SessionRow`), S3 (`createAuditAccumulator`,
`AuditSession`, the `output_tokens` trap guard), S2 (`src/i18n/`).
**Status.** Planned 2026-09-20. Approved by the user; all nine design questions
are decided below and none is left open.

**Goal.** Which tools a session used, and how often.

---

## 0. Read this first

### 0.1 Facts measured against the real reference tree

Measured over all 150 `audit.jsonl` files in the uncommitted reference tree.
These decide §2 Q1 with numbers rather than reasoning. **Do not re-derive; the
tree is gitignored and CI never sees it.**

| Measurement | Value |
|---|---|
| `assistant` lines | 11,421 |
| …with no `request_id` | **0** |
| …with `message.content` not an array | **0** |
| Content block types seen | `thinking` 2,621 · `tool_use` 7,504 · `text` 1,296 — nothing else |
| Raw `tool_use` blocks | 7,504 |
| …with no `id` / no `name` | **0 / 0** |
| **Distinct `tool_use.id` values** | **7,504** |
| Same `tool_use.id` seen on two lines | **0** |
| Max `assistant` lines sharing one `request_id` | **20** |
| Sessions containing ≥1 duplicate-`request_id` assistant line | 145 of 150 |
| `caller` field | `{"type":"direct"}` on all 7,504, no variation |
| Tool-name shapes | `mcp__<server>__<tool>` 4,270 · bare identifier (`Bash`-like) 3,234 · nothing else |
| Max distinct tool names in one session | 20 |
| Max tool calls in one session | 863 |
| Sessions with ≥1 tool call | 135 of 150 |

**The decisive finding.** `assistant` lines sharing one `request_id` are
**incremental, not cumulative**: each line carries only new content blocks,
which is why 7,504 raw blocks yield 7,504 distinct ids with zero repeats. The
three candidate readings of "deduplicated by `request_id`" therefore give
measurably different totals:

| Reading | Total calls on the reference tree |
|---|---|
| **A** — count each distinct `(request_id, tool_use.id)` once | **7,504** |
| **B** — count each distinct `(request_id, name)` once | 5,771 (**−23 %**) |
| **C** — one per `request_id` | 5,403 (−28 %) |

720 request_ids issue two or more calls to the *same* tool name (parallel tool
calls). Reading B silently discards them.

### 0.2 An `assistant` line, structurally

```json
{
  "type": "assistant",
  "message": {
    "model": "…",
    "content": [
      { "type": "thinking", "thinking": "…", "signature": "…" },
      { "type": "tool_use", "id": "toolu_…", "name": "mcp__server__tool",
        "input": { … }, "caller": { "type": "direct" } }
    ],
    "usage": { "output_tokens": 2 }
  },
  "request_id": "req_…",
  "timestamp": "…"
}
```

`request_id` sits on the line, **not** under `message` — the same place the
`result` correlation already uses (MAP.md §4). `message.usage.output_tokens` on
this line is the `message_start` snapshot and is worthless; §2 Q2 is entirely
about making sure S12 cannot start trusting it. `input` carries Bash command
lines, file paths and prompt fragments and is **never read** (§2 Q5).

### 0.3 Traps from LEARNINGS that apply directly

- **"Hand-built literals are not a substitute for a fixture when the parser is
  the step that populates the field under test."** Every tool count in the
  model tests comes out of `parseAuditText` over a committed `.jsonl` fixture.
  Nothing hand-fills a `toolUses` array.
- **"Amending a test because a fallback changed its inputs can silently delete
  the coverage the test existed for."** This is the load-bearing one this
  session: S12 must add the very `assistant` branch that S3's named exit
  criterion forbids by source grep. §2 Q2 replaces the guard rather than
  deleting it, and §6 control 2 proves the replacement is not weaker.
- **"Build a test so the wrong implementation gives a different answer."** The
  fixture in §5 is designed so readings A, B and C each produce a different
  number on it — not merely so reading A passes.
- **"`localeCompare` is the model layer's back door to i18n."** The tool-name
  tie-break compares by UTF-16 code unit. No collator, no `localeCompare`.
- **"An injectable dependency whose default agrees on every fixture is untested
  by construction."** Every ASCII string orders identically under code units and
  under a collator, so the fixture carries one non-ASCII tool name to make the
  two orders actually disagree.
- **"A raw `U+0000` survives tsc, ESLint and Prettier."** The dedup composite
  key is `` `${requestId}|${toolId}` ``. Request ids and `toolu_` ids are
  `[A-Za-z0-9_]` only, so `"|"` cannot collide; no control-character sentinel is
  introduced anywhere in this session.
- **"A quoted English string in an e2e assertion is the translated-text trap in
  its easiest disguise."** Tool *names* are data, not UI text, so asserting
  `Bash` literally is legitimate — but it must carry a comment saying so, or a
  later reader will "fix" it into a catalogue lookup that cannot exist.
- **Reference-tree constants are pinned, not re-derived.** §7 extends the
  existing pin with the tool numbers above.

---

## 1. Shape of the change

One new pure module counts tool calls while the existing accumulator streams;
`AuditSession` and `SessionRow` each gain one field; `SessionDetail` gains one
`<section>`. S11 laid its sections out as a vertical stack precisely so this is
an append, not a relayout.

```
┌─ Kostentreiber · 4f1a2b3c ─────────────────  422,16 USD gemessen ┐
│ Anteile sind Token-Anteile, keine Kostenanteile: …               │
│ Kategorie          Tokens   Token-Anteil                         │
│ …                                                                │
│ ──────────────────────────────────────────────────────────────── │
│ Websuche 3   ·   Web-Abruf 1   ·   Subagenten 4                  │
│ ──────────────────────────────────────────────────────────────── │
│ Werkzeugnutzung                              ← new in S12        │
│ Aufrufzahlen, keine Kostenzuordnung: abgerechnet wird pro        │
│ API-Anfrage; ein Werkzeugergebnis wirkt sich nur indirekt aus,   │
│ indem es den Kontext folgender Anfragen vergrößert.              │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐                        │
│  │ Bash  42 │ │ Read  19 │ │ Edit     7 │                        │
│  └──────────┘ └──────────┘ └────────────┘                        │
│  ┌──────────────────────────────────────┐ ┌───────────────┐      │
│  │ mcp__example-server__list_items    7 │ │ WebSearch   3 │      │
│  └──────────────────────────────────────┘ └───────────────┘      │
│ ──────────────────────────────────────────────────────────────── │
│ Modell                 Kosten        Anteil                      │
│ …                                                                │
│ ──────────────────────────────────────────────────────────────── │
│ Anfragen …                                                       │
└──────────────────────────────────────────────────────────────────┘
```

Nothing else in the detail box moves. `ModelPanel`, `SessionTable`,
`OverviewTable`, `app.tsx` and `state/app-state.ts` are **not** touched.

---

## 2. Design questions, all decided

### Q1 — How does "deduplicated by `request_id`" compose with counting? → reading A

**Decided (user-confirmed): count each distinct `(request_id, tool_use.id)`
once.** Dedup key `` `${requestId}|${toolId}` ``.

The criterion's purpose is to stop the streaming duplication of assistant lines
from inflating counts. On this data that duplication is at the *line* level and
never repeats a `tool_use.id`, so reading A counts every real invocation exactly
once while staying immune to a future cumulative-snapshot format. Readings B and
C are not defensible: 720 request_ids legitimately call one tool several times,
and B would report 5,771 where the user made 7,504 calls — a 23 % undercount in
the exact figure the story exists to show. A is a no-op on today's data, which
means it can never *lose* a call; it can only protect against a format change.

Fallbacks, both fixture-only paths (zero occurrences in real data):

- `tool_use.id` missing → key `` `${requestId}|#${index}:${name}` ``, where
  `index` is the block's position in the content array. A cumulative re-send
  repeats positions, so this still dedups.
- `request_id` missing → no dedup is possible; count the block. Silently
  dropping it would be a worse failure than a possible double count.

### Q2 — S3's `output-tokens-trap.test.ts` structurally forbids what S12 must do

`src/model/output-tokens-trap.test.ts` carries the roadmap's named S3 exit
criterion:

```ts
it("the parser source contains no assistant branch", () => {
  const source = readFileSync(join(process.cwd(), "src", "model", "audit-parser.ts"), "utf-8");
  expect(source).not.toMatch(/["']assistant["']/);
});
```

S12 **must** add an `assistant` branch, so this goes red. Per LEARNINGS,
amending a test without asking what property it guards is how coverage silently
dies. The property is: *no token and no cost figure ever originates from an
`assistant` line.*

**Decided: keep the property, move the guard, and prove the move with a negative
control.**

1. All assistant-line reading is extracted into `src/model/tool-usage.ts`, so
   the parser's assistant branch is a one-line delegation.
2. The deleted grep is replaced by a **narrower structural guard**:
   `tool-usage.ts`'s source must not match `/usage|_tokens|cost/i`. The only
   module that touches assistant lines provably reads no token and no cost
   field — fewer characters of freedom than the old grep, not more.
3. A **behavioural** guard is added that the old test could not express: a
   fixture whose assistant lines carry *both* the 1–3-token `output_tokens`
   snapshot *and* `tool_use` blocks, asserting that `usage.outputTokens` is
   still the result-line value **while** `toolUses` is non-empty — i.e. the
   assistant branch was genuinely taken and still contributed no tokens. The old
   test passed vacuously because no assistant branch existed; this one cannot.
4. The test is renamed to `the assistant-line reader touches no token or cost
   field`, with a comment naming both S3 and S12 so the lineage survives.

Rejected: leaving the grep intact and dispatching on a computed string
(`obj.type === ASSISTANT_TYPE`). That keeps the test green while defeating it —
exactly the "certifies the idiom the codebase uses" failure LEARNINGS records
for `read-only-guarantee.test.ts`.

### Q3 — Does the ranked list get a share column or a bar? → no

**Decided (user-confirmed).** Tool name and call count only.

The section sits a few centimetres below a token-share table with percentage
bars. A "42 %" next to `Bash` would be read as 42 % of the cost within seconds,
and US-3.2's third acceptance criterion exists specifically to prevent that
reading. The criterion asks for "tool name, number of calls" and nothing more.
A share-of-calls figure is also close to meaningless: one `Bash` call and one
200-file `Read` are not comparable units.

### Q4 — Where does the section sit, and in what layout? → inline chips, after the server-tool summary

**Decided (user-confirmed): the chip list, placed directly after the
server-tool/subagent summary.**

Both the server-tool summary and tool usage are *call counts*, so grouping them
above the money-shaped model and request sections gives the box a clean "what it
did / what it cost" split, and it puts the not-a-cost-attribution note as far
from the cost figures as the stacking allows. The chip form reads as activity
rather than as another financial table, which is the point.

The planner recommended a table instead. The user chose chips with the table's
advantages understood; two documented trade-offs stand, and one of the
planner's stated weaknesses is closed outright:

- **Rank is conveyed by reading order**, not by a numbered column. Accepted.
  Chips are emitted in ranked order (§2 Q9) inside a real `<ul>`, so assistive
  technology announces list position, and the DOM order *is* the rank.
- **Chips wrap to further lines** as the container fills. Accepted.
- **Long MCP names must never be truncated** — this was a real conflict with
  Q5, which the user also approved. **Resolved: a chip grows to fit its full
  content and wraps to the next line as needed.** No `max-width`, no
  `text-overflow: ellipsis`, no `title`-only or hover-only reveal. A name that
  needs most of the row's width takes most of the row's width.
- **The explanatory sentence is its own `<p>` above the chips**, never squeezed
  onto the heading line as a parenthetical. This was the planner's sharpest
  objection to the chip layout and it is closed by construction: acceptance
  criterion 3 gets a full sentence either way.

Rejected: a two-column layout unifying the server-tool summary and tool usage
under one "Aufrufe" heading. Conceptually the tidiest, but it reworks a shipped,
tested S11 component with its own e2e assertions to gain layout polish — scope
creep in a session whose whole point is an append.

### Q5 — How are MCP tool names displayed? → verbatim

**Decided (user-confirmed).** `mcp__example-server__list_items` renders exactly
as it appears in the data, wrapping where it must, never split into parts and
never shortened.

Same discipline as the `claude-opus-5[1m]` model-variant rule: the string *is*
the identity, and a display transform is where a wrong grouping starts.
Rejected: splitting into a server part and a tool part (invents a schema out of
a naming convention that nothing guarantees) and eliding the middle (hides which
of two similarly-prefixed tools is which — the exact case MCP names create).

**NFR-6.** Only the block's `name` is ever read. Not `input` (Bash command
lines, file paths, prompt fragments), not `caller`. The `id` is used as a dedup
key *inside* the parse and is discarded at `finish()`: it never reaches
`AuditSession`, `SessionRow`, the DOM or an export. §6 names the privacy tests
that assert this rather than assuming it.

### Q6 — What happens to a malformed `tool_use` block? → ignored, no problem recorded

**Decided (user-confirmed).** A block with no `name`, or a `message.content`
that is a string rather than an array, is a schema variant and not a corrupt
line. It is skipped; no `Problem` is recorded and nothing throws (NFR-3).

A new problem kind would be write-only noise: LEARNINGS records that per-audit
problems never reach the UI at all until `MAX_PROBLEMS_PER_SCOPE`'s flat global
cap is replaced by a per-scope cap, which is its own piece of work. The fixture
pins the silent-ignore behaviour so it stays a decision rather than becoming an
accident.

### Q7 — Is the section rendered for a session with no tool calls? → yes, with an explicit empty state

**Decided (user-confirmed).** 15 of 150 real sessions have no tool calls. An
absent section is ambiguous between "this session used no tools" and "this app
does not track tools"; an explicit line (`detail.tools.empty`) is one string and
removes the ambiguity. The not-a-cost-attribution note is rendered with the
chips only — with no chips there is nothing to mislabel.

### Q8 — Do tool counts roll up to project or global level? → no

**Decided (user-confirmed).** Session scope only, as the roadmap scopes S12.

A roll-up needs a merge helper plus its own ranking tests on `GroupRow` and
`Report`, which is a second vertical concern, and with no UI to show it the
surface would ship untested. It is a cheap addition later; S18's charts and
S19's export are the natural consumers.

### Q9 — Ranking and tie-break → calls descending, then name ascending by code unit

**Decided (user-confirmed).** Recorded explicitly because the obvious
alternative — `localeCompare` — is the exact back door LEARNINGS names, and
because an all-ASCII fixture cannot tell a code-unit sort from a collator sort.
The fixture therefore carries one non-ASCII tool name at a tied count, so the
two orders disagree and the test is real.

---

## 3. Acceptance criteria: satisfied and deferred

| US-3.2 criterion | S12 |
|---|---|
| Tool calls counted per tool name from `tool_use` blocks in `assistant` lines, deduplicated by `request_id` | **Satisfied** — reading A (§2 Q1) |
| Shown as a ranked list: tool name, number of calls | **Satisfied** — ranked chips, calls desc then name asc by code unit (§2 Q4, Q9) |
| The view states explicitly that these are call counts, not a cost attribution | **Satisfied** — `detail.tools.note`, a full sentence in its own paragraph (§2 Q4) |
| `MAY`: an explicitly labelled estimate of each tool's cost share | **Deferred beyond v1.0** — `REQUIREMENTS.md` open point 2; it needs its own session with its own validation |

**Explicitly out of scope**, and not to be added opportunistically:

- Any per-tool cost, share or percentage figure (§2 Q3).
- Project- or report-level tool roll-ups (§2 Q8).
- Tool arguments, durations, or success/failure — not in what we read, and
  `input` is sensitive (§2 Q5).
- Surfacing per-audit `Problem`s in the detail — still blocked on the per-scope
  problem cap.

---

## 4. Files and signatures

### 4.1 `src/model/tool-usage.ts` — new, pure

No i18n import, no clock, no DOM, no filesystem. Reads `name` and — transiently,
never escaping the module — `id`. Never reads `input`, `caller`, `usage` or any
token or cost field (§2 Q2, Q5).

```ts
export interface ToolUseCount {
  /** The tool_use block's `name`, verbatim. Never split, shortened or normalised. */
  readonly name: string;
  readonly calls: number;
}

/** One tool_use block, before deduplication. `toolId` never leaves this module. */
export interface ToolUseRef {
  readonly requestId: string | null;
  readonly toolId: string | null;
  readonly name: string;
  /** Position in the content array — the no-id dedup fallback (§2 Q1). */
  readonly index: number;
}

/**
 * Extracts refs from ONE already-JSON-parsed `assistant` line. Never throws.
 * Reads `request_id` and `message.content[].{type,id,name}` and nothing else.
 */
export function toolUsesFromAssistantLine(obj: Record<string, unknown>): readonly ToolUseRef[];

export interface ToolUseCounter {
  addAssistantLine(obj: Record<string, unknown>): void;
  /** Ranked and frozen: calls descending, then name ascending by code unit. */
  readonly value: readonly ToolUseCount[];
}
export function createToolUseCounter(): ToolUseCounter;

/** Exported for tests and reuse. Calls desc, then name asc by UTF-16 code unit. */
export function rankToolUses(counts: ReadonlyMap<string, number>): readonly ToolUseCount[];
```

Memory (NFR-4): the counter holds one `Map<string, number>` over distinct tool
names (max 20 observed) and one `Set<string>` of dedup keys, bounded by the
session's tool-call count (max 863 observed). The accumulator already parses
every line, so no extra I/O and no extra `JSON.parse` is introduced.

### 4.2 `src/model/audit-types.ts` — change

`import type { ToolUseCount } from "./tool-usage.js";` — the same precedent as
`DetectedEncoding` from `encoding.js` and `Problem` from `problems.js`. Add to
`AuditSession`:

```ts
  /**
   * Tool calls by name, ranked (calls desc, then name asc by code unit),
   * deduplicated by (request_id, tool_use.id) — S12 plan §2 Q1. Never derived
   * from `output_tokens` or any usage field; the block's `input` and `id` are
   * never carried here (NFR-6, §2 Q5).
   */
  readonly toolUses: readonly ToolUseCount[];
```

### 4.3 `src/model/audit-parser.ts` — change

A `toolUseCounter` in the closure, and one new branch placed before the
"any other type" comment:

```ts
      if (type === "assistant") {
        toolUseCounter.addAssistantLine(obj);
        return;
      }
```

`finish()` gains `toolUses: toolUseCounter.value`. `parseAuditBytes`'s
`Object.freeze({ ...session, … })` carries the field through automatically. The
existing comment about `output_tokens` being a snapshot stays and gains a
sentence naming the delegation and §2 Q2.

### 4.4 `src/model/report-types.ts` — change

Add to `SessionRow`, importing `ToolUseCount` from `./tool-usage.js`:

```ts
  /**
   * Tool calls by name, already ranked and frozen by the parser (S12 plan
   * §2 Q9). The report does NOT re-sort: the ordering is decided once, in
   * `rankToolUses`. Carries no id, no path and no free text (NFR-6).
   */
  readonly toolUses: readonly ToolUseCount[];
```

### 4.5 `src/model/report.ts` — change

`buildSessionRow` adds `toolUses: session.audit.toolUses` to the returned frozen
object. Nothing else changes: no total, no bucket, no group, no model breakdown.

### 4.6 `src/components/session-detail.tsx` — change

One new `<section>`, inserted between the server-tool summary and the models
section. Props unchanged; still no signal reads.

```tsx
<section class="session-detail__tools" data-testid="tool-usage">
  <h4 id={toolsHeadingId}>{t("detail.tools.heading")}</h4>
  {session.toolUses.length === 0 ? (
    <p data-testid="tool-usage-empty">{t("detail.tools.empty")}</p>
  ) : (
    <>
      <p data-testid="tool-usage-note">{t("detail.tools.note")}</p>
      <ul class="tool-chips" data-testid="tool-chip-list" aria-labelledby={toolsHeadingId}>
        {session.toolUses.map((tool) => (
          <li class="tool-chip" key={tool.name} data-testid="tool-chip" data-tool={tool.name}>
            <span class="tool-chip__name">{tool.name}</span>
            <span class="tool-chip__calls">{tNumber(tool.calls)}</span>
          </li>
        ))}
      </ul>
    </>
  )}
</section>
```

Notes that are requirements, not style:

- **A real `<ul>`/`<li>`**, not `<div>`s. Rank is carried by reading order
  (§2 Q4), so the list semantics and the list position a screen reader announces
  are the only thing conveying it. `aria-labelledby` ties the list to the
  heading; `toolsHeadingId` is derived from `session.sessionId`, which is a hex
  directory name and safe in an id.
- **Chips are emitted in `session.toolUses` order and never re-sorted in the
  component.** The model decided the order once.
- `data-tool` holds the raw name. MCP names are `[A-Za-z0-9_-]` and bare
  identifiers are alphanumeric, so both are safe in a CSS attribute selector —
  unlike the NUL-key case LEARNINGS records for group keys.
- The count goes through `tNumber`, never a bare `${tool.calls}`.
- No percentage, no bar, no share anywhere in this section (§2 Q3).

### 4.7 `src/styles/index.css` — change

```css
.tool-chips {
  display: flex;
  flex-wrap: wrap;          /* chips wrap to further lines; §2 Q4 */
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.tool-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-2);
  /* NO max-width and NO text-overflow: a chip grows to fit its full name.
     Truncating an MCP tool name would destroy its identity — S12 §2 Q4/Q5. */
  max-width: 100%;
  padding: … ;
  border: 1px solid var(--…);
  border-radius: … ;
  background: var(--…);
}

.tool-chip__name {
  font-family: var(--font-mono);
  overflow-wrap: anywhere;  /* a name longer than the row wraps inside its chip */
}

.tool-chip__calls {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
```

`max-width: 100%` exists only so a chip cannot force the detail box to scroll
horizontally; combined with `overflow-wrap: anywhere` it wraps the name inside
the chip rather than clipping it. No colour-only state; nothing new in the
palette. Reuse existing spacing, radius and border custom properties rather than
introducing literals.

### 4.8 `src/i18n/de.ts` + `src/i18n/en.ts` — change

Both catalogues in the same commit; `tsc` enforces parity (a missing key is
TS1360, an extra one TS2353). Keep the files' alphabetical ordering. The keys
sit in the `detail.*` namespace because they belong to the detail box, matching
`detail.category.*`.

```
detail.tools.heading   Werkzeugnutzung
                     / Tool usage
detail.tools.note      Aufrufzahlen, keine Kostenzuordnung: abgerechnet wird pro
                       API-Anfrage; ein Werkzeugergebnis wirkt sich nur indirekt
                       aus, indem es den Kontext folgender Anfragen vergrößert.
                     / Call counts, not a cost attribution: billing is per API
                       request, and a tool result only enters the bill indirectly
                       by enlarging the context of subsequent requests.
detail.tools.empty     Keine Werkzeugaufrufe erfasst
                     / No tool calls recorded
```

Wording is the planner's proposal; the implementer may polish the German as long
as both catalogues stay in step, no key is renamed, and `detail.tools.note`
keeps the causal explanation (per-request billing, indirect effect via context
growth) that the acceptance criterion requires.

No column-header keys are needed — the chip layout has no table header. If the
layout is ever moved back to a table, `detail.tools.columnTool` and
`detail.tools.columnCalls` are the names to use.

---

## 5. `test/fixtures/audit/tool-usage.jsonl` — new

Synthetic and invented. Nothing copied, quoted or paraphrased from the reference
tree. Exported as `TOOL_USAGE_JSONL` from `test/fixtures/audit/index.ts` and
added to `ALL_FIXTURES`. Every property below exists so that a **wrong**
implementation gives a different answer, not merely so a right one passes:

1. **`req_A`, two assistant lines, four distinct `tool_use` ids** — the real
   incremental shape (§0.1). Reading C reports 1 where the answer is 4.
2. **`req_A`, the same `tool_use.id` repeated verbatim on the second line** —
   the deduplication trap itself. It does not occur in real data, so this
   fixture is its only test. A counter with no dedup reports 5.
3. **`req_B`, two calls to the same tool name under two different ids** —
   parallel calls. Reading B reports 1 where the answer is 2; 720 real
   request_ids do this.
4. **`req_C` uses a tool name already seen under `req_A`** — counts sum across
   requests rather than being kept per request.
5. **A deliberate tie** at equal call counts between two names, one of which
   sorts before the other only under code-unit order. One of the two carries a
   **non-ASCII character**, so a collator and a code-unit sort disagree
   (LEARNINGS: a default that agrees on every fixture is untested).
6. **An assistant line whose `message.content` is a string**, and **a `tool_use`
   block with no `name`** — both skipped, no `Problem` recorded, no throw
   (§2 Q6).
7. **An assistant line with no `request_id` carrying one `tool_use`** — counted,
   not dropped (§2 Q1 fallback).
8. **Assistant lines carrying a 1–3-token `output_tokens` snapshot alongside
   their `tool_use` blocks, plus a `result` line with a large true
   `output_tokens`** — the §2 Q2 behavioural guard, in the same file so the two
   can never drift apart.
9. **Tool names**: one bare identifier, two MCP-form, one non-ASCII — matching
   the two shapes measured in §0.1, inventing the strings.

---

## 6. Tests, by name

**`src/model/tool-usage.test.ts`** (new)
- `counts one call per distinct tool_use id within a request`
- `counts a repeated tool_use id under the same request only once`
- `counts two calls to the same tool name in one request separately`
- `sums a tool name across several requests`
- `ranks by call count descending`
- `breaks a tie on call count by tool name, by code unit and not by collation`
- `ignores an assistant line whose content is not an array`
- `ignores a tool_use block with no name, and records no problem`
- `counts a tool_use on a line with no request_id rather than dropping it`
- `keeps an MCP tool name verbatim`
- `never reads a tool_use input field`
- `returns a frozen, empty list for a session with no assistant lines`

**`src/model/audit-parser.test.ts`** (added)
- `parses tool_use counts from the tool-usage fixture`
- `AuditSession.toolUses is ranked and frozen`
- `a session with no assistant lines has an empty toolUses list`

**`src/model/output-tokens-trap.test.ts`** (amended — §2 Q2)
- `output tokens come from the result line, not from assistant lines` *(unchanged)*
- `the assistant-line reader touches no token or cost field` *(replaces `the parser source contains no assistant branch`)*
- `an assistant line contributes tool counts and no tokens` *(new — the behavioural guard the old grep could not express)*

**`src/model/report.test.ts`** (added)
- `SessionRow.toolUses carries the parser's ranked counts`
- `SessionRow.toolUses is frozen and not re-sorted by the report`
- `adding tool counts changes no total, bucket or group`

**`src/model/report-privacy.test.ts`** (added)
- `ToolUseCount exposes only a name and a call count`
- `no tool_use id reaches SessionRow`

**`src/components/session-detail.test.tsx`** (added)
- `renders one chip per tool, in ranked order`
- `renders the chips as list items inside a labelled list`
- `states that these are call counts and not a cost attribution`
- `shows no share or percentage anywhere in the tool section`
- `renders an MCP tool name verbatim, with no truncation or ellipsis`
- `shows an explicit empty state for a session with no tool calls, and no note`

The "ranked order" assertion reads the chips in DOM order, because DOM order
*is* the rank in this layout (§2 Q4). The "no truncation" assertion checks the
rendered text content equals the full name and that no `title` attribute is
standing in for visible text.

**`e2e/tool-usage.spec.ts`** (new)
- `the session detail lists tool chips in ranked order`
- `the tool-usage note comes from the catalogue in both locales`
- `a session with no tool calls shows the empty state`

Component and e2e assertions are on accessible roles, `data-testid`, `data-*`
attributes, or values derived from the catalogue. Tool **names** are data, not
UI text, so asserting `Bash` literally is correct — each such assertion carries
a comment saying so, or a later reader will "fix" it into a catalogue lookup
that cannot exist.

**`e2e/fixtures/trees.ts`** (change): an `assistantLine({ requestId, tools })`
helper mirroring `resultLine`'s optional-field style; tool_use blocks added to
the existing cost-drivers session, and one session left with none. Every value
invented; `dist-e2e` only; nothing under `src/` imports anything under `e2e/`.

### Negative controls — run by hand, restore the patched file byte-for-byte, record the observed failure counts in the implementation report

1. **Dedup control.** Patch `createToolUseCounter` to key on
   `` `${requestId}|${name}` `` (reading B). Expect `counts two calls to the
   same tool name in one request separately` and the report test to fail. This
   is what proves the fixture can tell reading A from reading B.
2. **Token-trap control.** Patch the parser's new assistant branch to also add
   `message.usage.output_tokens` into the request usage. Expect `an assistant
   line contributes tool counts and no tokens` to fail. This is what proves the
   §2 Q2 replacement guard is not weaker than the grep it replaces.

---

## 7. Reference-tree regression pin

Add to `src/model/reference-distribution.test.ts`, inside the existing
`describe.skipIf(!existsSync(dir))` block so CI is unaffected:

```ts
const toolCalls = report.sessions.reduce(
  (sum, s) => sum + s.toolUses.reduce((n, tool) => n + tool.calls, 0),
  0,
);
expect(toolCalls).toBe(7504);
expect(report.sessions.filter((s) => s.toolUses.length > 0)).toHaveLength(135);
expect(Math.max(...report.sessions.map((s) => s.toolUses.length))).toBe(20);
```

7,504 is the number reading A produces; readings B and C give 5,771 and 5,403.
This pin is the cheapest standing proof that nobody later "simplifies" the dedup
key. The existing pins — 1,413,585,188 micro-USD, 150 sessions, 508 requests,
7 projects, 26 folder groups — must remain **unchanged**: S12 touches no
aggregate, and that unchanged run is the cheapest proof of it.

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

The `check:no-fake` negative control is **not** required this session: the fake
filesystem module's shape does not change, only `trees.ts` does, and LEARNINGS
scopes that control to "each time the fake changes shape".

---

## 9. Sizing, and the one thing to be careful with

Six production files created or changed — `tool-usage.ts` (new),
`audit-types.ts`, `audit-parser.ts`, `report-types.ts`, `report.ts`,
`session-detail.tsx` — plus both catalogues, one CSS block, one fixture, the
e2e tree helper and the tests. That is the upper end of the roadmap's 3–6
guidance but within it; no new layer and no new dependency.

**Flag for the implementer.** The §2 Q2 guard replacement is small in lines and
large in care: it edits a *named S3 exit criterion*. It is not a drive-by
deletion, and negative control 2 is the only thing that distinguishes moving the
guard from removing it. If the control does not fail as predicted, stop and
report rather than adjusting the test until it is green.

---

## 10. Deliberate deferrals recorded here so they are not mistaken for oversights

- Per-tool cost share, the US-3.2 `MAY` — deferred beyond v1.0; an open research
  question (`REQUIREMENTS.md` open point 2) needing its own session and its own
  validation.
- Project-, folder- and report-level tool roll-ups (§2 Q8) — cheap to add for
  S18's charts or S19's export.
- Tool arguments, per-tool durations and success/failure — `input` is sensitive
  (NFR-6) and the rest is not in what we read.
- A `Problem` kind for a malformed `tool_use` block (§2 Q6) — blocked behind the
  per-scope problem cap, like every other per-audit problem.
- Column-header keys for a table layout — named in §4.8 should the chip layout
  ever be revisited.
