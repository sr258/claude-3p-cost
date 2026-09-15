# S3 — Audit log parser

**Status.** Approved plan. Written in the planning phase of session S3.
**Implementer.** Sonnet agent. Follow this document literally; do not expand scope.
**Depends on.** S1 (`docs/plans/S1-project-scaffold.md`) and S2
(`docs/plans/S2-localization-layer.md`), both done and green.

---

## 0. Read this first — environment facts

You are working in the repository root. Use absolute paths everywhere: the Bash
tool resets its working directory between calls.

**This session is pure frontend logic.** Nothing here touches `src-tauri/`, so
Rust, `cargo` and the `export PATH="$HOME/.cargo/bin:$PATH"` dance from S1 are
not needed. `npm run build` and `npm test` are the whole toolchain.

**Zero new dependencies.** Everything below is built on TypeScript and the
platform's own `TextDecoder` and `JSON`. Do not add a JSONL library, a streaming
library, an encoding-detection library, or a decimal library. The roadmap's
sizing rule — never both a new layer and a new dependency in the same session —
applies, and this session introduces a whole new layer (`src/model/`).

**`tsc` sees every file under `src/`.** `tsconfig.json` has
`include: ["src"]`, `strict: true`, `noEmit: true`, and `npm run build` is
`tsc && vite build`. A file under `src/` is type-checked whether or not anything
imports it.

**Tests live next to the code; fixtures live in `test/`.** `vite.config.ts` sets
`test.include: ["src/**/*.{test,spec}.{ts,tsx}"]`, deliberately narrowed so the
gitignored `calview/` tree is not picked up. Every spec of this session goes
beside its module inside `src/model/`. The fixture `.jsonl` files go in
`test/fixtures/audit/`, which is exactly what that directory was reserved for in
S2. **Do not change `test.include`** — fixtures are not tests, and widening the
glob would start collecting them.

Tests may import `node:fs` to read a fixture. Production code under `src/model/`
may not — see the §9 grep.

**The repository is public, and `reference-material/` is the one thing that must
never reach it.** No fragment of the real data may appear in a fixture, a
comment, a test name, or a document — not a session id, not a project name, not
a path, not a prompt, not a line of a real audit log. Every byte of every
fixture in this session is invented. This plan itself deliberately quotes
nothing from it: where a figure below comes from the reference data, it comes
via `MAP.md` §4, which already sanitised it.

---

## 1. Goal and scope

**Goal.** Turn one `audit.jsonl` into a typed session record: a pure,
streaming, failure-tolerant parser in a new `src/model/` layer, with the traps
of `MAP.md` §4 encoded once and tested.

**In scope.** `src/model/` — the problem/diagnostic type, byte-level encoding
detection and line decoding, the session-id rule, the audit line types, the
parser itself, and the unit tests for all of it. Synthetic fixtures in
`test/fixtures/audit/`. One note appended to `CLAUDE.md`.

**Out of scope.** Anything that reads a file (S6/S7). Manifests, `spaces.json`,
project assignment, `(ohne Projekt)` bucketing, unknown-`spaceId` fallback (S4).
Any aggregation, any rollup, any `Report` type (S5). Any UI, any component, any
CSS, any translation key (S8+). Moving parsing into a Worker (later; see §7).

**The trap the roadmap flags.** *All of `MAP.md` §4. Read
`poc/cowork_costs.py` `parse_audit()` before writing anything; it is the
specification.* Do that. It is 60 lines. The parser you write is a faithful port
of it plus the decisions in §2.

---

## 2. Decisions made in planning

Six questions were put to the user. All six are settled; this section is the
record of why the session looks the way it does. Do not re-litigate them in
code.

### Q1 — The input contract is an accumulator core plus three thin adapters.

`createAuditAccumulator(sourceId)` returns an object with `pushLine(line)` and
`finish()`. `parseAuditText`, `parseAuditBytes` and `parseAuditLines` are each a
handful of lines built on top of it.

NFR-4 demands line-by-line streaming, but S6 owns the FileSystem interface, so
S3 must not do I/O. The accumulator is the only shape that satisfies both: S6
pushes lines as they arrive off the disk, tests feed an array, and the line list
is never held anywhere. A string-only parser would put the whole file in memory
before parsing and leave S6 to re-solve streaming with no tested code to lean
on; an async-iterable-only parser would make every test `async` for no benefit.

The accumulator holds state between calls, which is a deliberate, narrow
exception to "everything in `src/model/` is a pure function". It is still
deterministic, has no I/O, no DOM and no clock, and is trivially testable — the
substance of architecture rule 2 is intact. Keeping `pushLine` **synchronous**
is also what makes moving parsing into a Worker for NFR-2 a wrapper change
rather than a rewrite.

### Q2 — Cost is integer micro-USD everywhere. No float cost survives the parser.

`RequestRecord.costMicroUsd` and `ModelUsageRecord.costMicroUsd` are integers
produced by `Math.round(value * 1e6)`. There is no `costUsd` field anywhere in
the S3 types. S5 sums integers and divides by `1e6` exactly once, at the display
boundary.

The roadmap flags float drift as an S5 trap. The POC half-solves it: it
accumulates *per-model* costs as `int(round(cost_usd * 1e6))` but sums the
*session* total as a plain float. Doing it consistently at parse time makes the
trap structurally impossible instead of merely documented. Worst-case rounding
is 0.5 µUSD per request; across the reference data's 508 requests that is
0.00025 USD — three orders of magnitude below the cent that the US-1.3
regression asserts in S5.

Carrying both a float and an integer was rejected: two sources of truth is how
they drift.

### Q3 — `Problem` is a shared type from S3, keyed by enum, carrying no paths and no content.

`src/model/problems.ts` defines `{ kind, scope, line?, hint? }`. `scope` is the
session directory name — eight hex characters, not a path. `hint` is a bounded,
content-free token such as an error class name or a field name. S4 and S6 extend
`ProblemKind` with their own members and reuse the same three fields; S21 renders
the collected list.

NFR-6 is far easier to hold if the sensitive value is never in the type at all.
An absolute path in a `Problem` would be a field that S21 puts on screen and S12
puts in an export, and one missed strip is a breach. CLAUDE.md permits a full
path in hover text — that is the UI's business, resolved from data the UI
already has, not the model's.

The UI maps `kind` → translation key, so **`src/model/` never imports
`src/i18n/`**. This is the model-layer counterpart of S2's rule "app-state stores
translation keys, never translated strings": the model stores problem kinds,
never messages.

### Q4 — S3 owns both whole-buffer decoding and the streaming line decoder.

`decodeText(bytes)` for a buffer you already hold; `createLineDecoder()` for a
stream of `Uint8Array` chunks, holding a `TextDecoder` in streaming mode and a
partial-line tail.

Encoding detection is pure, so it belongs in the model layer by rule. The
streaming half is the debatable part, and it goes here because the bug it
prevents — a chunk boundary that splits a multi-byte character, or splits a
`\r\n` — only ever surfaces against a multi-megabyte real log on the Windows
machine we cannot debug on. The roadmap's own S6 trap is already about boundary
handling; giving S6 a tested decoder to call is the cheapest way to defuse half
of it.

### Q5 — S3 commits audit-log fixtures only.

The roadmap's S3 deliverable line names "a truncated session ID" and "an unknown
`spaceId`". The truncation trap has an audit-side half — the `system/init` `cwd`
ends in `…\<8-hex>\outputs` — and `basic.jsonl` encodes exactly that. The
`spaceId` half lives in manifests and `spaces.json`, which are S4's subject
matter, and S3 has nothing that would assert on them. Authoring manifest
fixtures here would mean writing them against a schema no test in this session
exercises.

**S4's plan opens by building the manifest and `spaces.json` fixtures.** That is
not a gap; it is where they belong.

### Q6 — Encoding fixtures are derived inside the test, not committed as binaries.

One readable UTF-8 `basic.jsonl` on disk. The encoding spec builds the UTF-8-BOM,
UTF-16LE and UTF-16BE byte arrays from its text at test time and feeds those to
`detectEncoding` / `decodeText`.

What is under test is a function over a `Uint8Array`; where the array came from
is irrelevant to the test and very relevant to the reviewer. Four opaque blobs in
a public repository that nobody can diff buys nothing.

---

## 3. File inventory

### 3.1 Created — `src/model/`

| File | Contents |
|---|---|
| `problems.ts` | `ProblemKind`, `Problem`, `MAX_PROBLEMS_PER_SCOPE`, `ProblemCollector`, `createProblemCollector` |
| `numbers.ts` | `toInt`, `toMicroUsd`, `toBool`, `toStringOrNull` — tolerant coercion helpers |
| `encoding.ts` | `DetectedEncoding`, `detectEncoding`, `decodeText`, `splitLines`, `LineDecoder`, `createLineDecoder` |
| `session-id.ts` | `sessionIdFromCwd` — the POC's `session_id_from_cwd` rule |
| `audit-types.ts` | `TokenUsage`, `ModelUsageRecord`, `SubagentStats`, `RequestRecord`, `LifecycleCounts`, `AuditSession`. **Types only, no runtime code.** |
| `audit-parser.ts` | `AuditAccumulator`, `createAuditAccumulator`, `parseAuditText`, `parseAuditBytes`, `parseAuditLines` |

### 3.2 Created — tests

`src/model/problems.test.ts`, `src/model/encoding.test.ts`,
`src/model/session-id.test.ts`, `src/model/audit-parser.test.ts`,
`src/model/output-tokens-trap.test.ts`. Named cases in §8.

### 3.3 Created — fixtures

`test/fixtures/audit/` — seven `.jsonl` files (§6) plus `index.ts`, which
exports one named constant per fixture resolving to its absolute path. Tests
import from `index.ts` and never spell a fixture path themselves.

### 3.4 Changed in place

| File | Change |
|---|---|
| `CLAUDE.md` | Append four bullets to **Data Model Essentials**: cost is integer micro-USD from parse time onward; the shape and privacy rule of `Problem`; `result.session_id` is *not* the session directory; the model layer never imports `src/i18n/`. |

### 3.5 Explicitly NOT touched

`package.json` and `package-lock.json` (no dependency, no new script),
`vite.config.ts` (in particular **not** `test.include`), `tsconfig.json`,
`index.html`, anything under `src-tauri/`, `src/i18n/`, `src/state/`,
`src/services/`, `src/components/`, `src/app.tsx`, `src/styles/`,
`.github/workflows/`, `ROADMAP.md`, `REQUIREMENTS.md`, `MAP.md`.

### 3.6 No UI

S3 has no user interface. It creates no component, touches no CSS, adds no
translation key and does not modify `src/app.tsx`. The first thing a user sees
from this work arrives in S8. If you find yourself writing JSX, you have left
the session.

---

## 4. Boundary types and signatures

Write these verbatim. Other modules — S4, S5, S6 — are planned against these
exact names.

### 4.1 `src/model/problems.ts`

```ts
export type ProblemKind =
  | "malformed-line"      // JSON.parse threw on a non-empty line
  | "non-object-line"     // valid JSON, but not an object
  | "missing-cost"        // a result line without a usable total_cost_usd
  | "decode-replacement"; // the byte stream contained undecodable sequences
  // S4 adds "malformed-manifest" | "unknown-space".
  // S6 adds "unreadable-file" | "unreadable-directory".

export interface Problem {
  readonly kind: ProblemKind;
  /** Session directory name, or another non-sensitive identifier. NEVER a path (NFR-6). */
  readonly scope: string;
  /** 1-based line number, where the problem is line-scoped. */
  readonly line?: number;
  /** Bounded, content-free hint: an error class name or a field name. NEVER file content (NFR-6). */
  readonly hint?: string;
}

export const MAX_PROBLEMS_PER_SCOPE = 20;

export interface ProblemCollector {
  add(problem: Problem): void;
  /** At most the cap. */
  readonly problems: readonly Problem[];
  /** Unbounded — keeps counting past the cap. */
  readonly count: number;
}

export function createProblemCollector(cap?: number): ProblemCollector;
```

### 4.2 `src/model/numbers.ts`

```ts
/** Finite number → truncated integer. Anything else (undefined, null, NaN, a string) → 0. */
export function toInt(value: unknown): number;

/** Finite USD amount → integer micro-USD via Math.round(value * 1e6). Anything else → 0. */
export function toMicroUsd(value: unknown): number;

/** JavaScript truthiness, narrowed to a boolean. */
export function toBool(value: unknown): boolean;

/** A non-empty string → itself. Anything else → null. */
export function toStringOrNull(value: unknown): string | null;
```

These exist so the parser contains no defensive `?? 0` noise and so the
coercion rules are tested once.

### 4.3 `src/model/encoding.ts`

```ts
export type DetectedEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";

export function detectEncoding(bytes: Uint8Array): DetectedEncoding;

export function decodeText(bytes: Uint8Array): {
  text: string;
  encoding: DetectedEncoding;
  /** True when the decoder emitted U+FFFD — the caller raises a "decode-replacement" problem. */
  hadReplacement: boolean;
};

/** Splits on \n, tolerates \r\n and a missing final newline; drops the trailing empty element. */
export function splitLines(text: string): string[];

export interface LineDecoder {
  /** Complete lines available after this chunk; an incomplete tail is held for the next call. */
  push(chunk: Uint8Array): string[];
  /** Flushes the held tail as a final line, if non-empty. */
  finish(): string[];
  /** null until the first chunk has been pushed. */
  readonly encoding: DetectedEncoding | null;
  readonly hadReplacement: boolean;
}

export function createLineDecoder(): LineDecoder;
```

**Detection order matches US-1.3 — UTF-8, UTF-8-with-BOM, UTF-16.** Implement it
as: BOM sniff first (`EF BB BF` → `utf-8-bom`; `FF FE` → `utf-16le`;
`FE FF` → `utf-16be`); then a BOM-less UTF-16 heuristic — NUL bytes at
consistently even or consistently odd offsets within the first 64 bytes;
otherwise `utf-8`.

**Decoding is non-fatal.** Construct `TextDecoder` without `{ fatal: true }`. A
bad byte becomes U+FFFD and sets `hadReplacement`; it never throws (NFR-3). The
BOM is stripped from the decoded text — `TextDecoder` does this for `utf-8` and
`utf-16le`/`utf-16be` label variants, but assert it in the test rather than
assuming it.

`createLineDecoder` sniffs the encoding from the **first** chunk only, then holds
one `TextDecoder` used with `{ stream: true }` for every `push`, and the tail
after the last newline as a string. This is what makes a character split across
a chunk boundary, and a `\r\n` split across a chunk boundary, come out right.

### 4.4 `src/model/session-id.ts`

```ts
/**
 * "…\\<8hex>\\outputs" → "<8hex>". Normalises backslashes to forward slashes,
 * strips trailing separators, drops a final "outputs" or "uploads" segment.
 * Returns null for null, undefined or an empty string.
 *
 * Port of session_id_from_cwd() in poc/cowork_costs.py.
 */
export function sessionIdFromCwd(cwd: string | null | undefined): string | null;
```

### 4.5 `src/model/audit-types.ts`

```ts
import type { DetectedEncoding } from "./encoding.js";
import type { Problem } from "./problems.js";

export interface TokenUsage {
  readonly inputTokens: number;
  /** From the RESULT line's usage block only — never from an assistant line. See §5. */
  readonly outputTokens: number;
  /** usage.output_tokens_details.thinking_tokens */
  readonly thinkingTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  /** usage.cache_creation.ephemeral_1h_input_tokens */
  readonly cacheCreation1hInputTokens: number;
  /** usage.cache_creation.ephemeral_5m_input_tokens */
  readonly cacheCreation5mInputTokens: number;
  /** usage.server_tool_use.web_search_requests */
  readonly webSearchRequests: number;
  /** usage.server_tool_use.web_fetch_requests */
  readonly webFetchRequests: number;
}

export interface ModelUsageRecord {
  /** The exact modelUsage key. The "[1m]" suffix is NEVER normalised away. */
  readonly model: string;
  readonly costMicroUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly webSearchRequests: number;
  readonly provider: string | null;
  readonly costBasis: string | null;
  readonly contextWindow: number | null;
}

export interface SubagentStats {
  readonly requested: number;
  readonly spawned: number;
  readonly spawnedBySubagents: number;
  readonly startedInBackground: number;
  readonly completed: number;
  readonly failed: number;
  readonly killed: number;
  readonly refused: number;
  readonly maxDepth: number;
}

export interface RequestRecord {
  /** Raw ISO-8601 string exactly as it appears. NEVER parsed here — no clock in src/model. */
  readonly timestamp: string | null;
  readonly costMicroUsd: number;
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly numTurns: number;
  readonly isError: boolean;
  readonly usage: TokenUsage;
  readonly models: readonly ModelUsageRecord[];
  /** Absent on a large share of real result lines — null, not an empty object. */
  readonly subagents: SubagentStats | null;
}

export interface LifecycleCounts {
  readonly queued: number;
  readonly started: number;
  readonly completed: number;
}

export interface AuditSession {
  /** Caller-supplied: the session directory name. The parser does no I/O and cannot know it. */
  readonly sourceId: string;
  /** Derived from the system/init cwd; falls back to sourceId. */
  readonly sessionId: string;
  /** Sensitive-ish: displayed as a basename at most, never exported (NFR-6). */
  readonly cwd: string | null;
  readonly initModel: string | null;
  /** result.session_id — the CLI session UUID. NOT the session directory. See §10. */
  readonly cliSessionId: string | null;
  readonly requests: readonly RequestRecord[];
  readonly lifecycle: LifecycleCounts;
  /** max(0, started - completed) — the "offene Anfragen" figure of US-1.5. */
  readonly openRequests: number;
  /** Non-empty lines seen, malformed ones included. */
  readonly lineCount: number;
  /** Uncapped, unlike `problems`. */
  readonly malformedLineCount: number;
  readonly encoding: DetectedEncoding | null;
  /** Capped at MAX_PROBLEMS_PER_SCOPE. */
  readonly problems: readonly Problem[];
}
```

**Why `models` is an array and not a `Record<string, …>`:** it is JSON
serializable with a stable order, it cannot collide with a prototype key if a
model string ever gets strange, and S5 does the grouping anyway. The model name
is a field inside the record, not a key above it.

### 4.6 `src/model/audit-parser.ts`

```ts
export interface AuditAccumulator {
  /** Synchronous by design — see §2 Q1. Never throws. */
  pushLine(line: string): void;
  finish(): AuditSession;
}

export function createAuditAccumulator(sourceId: string): AuditAccumulator;

export function parseAuditText(sourceId: string, text: string): AuditSession;

export function parseAuditBytes(sourceId: string, bytes: Uint8Array): AuditSession;

export function parseAuditLines(
  sourceId: string,
  lines: AsyncIterable<string>,
): Promise<AuditSession>;
```

The three adapters are each a few lines over the accumulator. `parseAuditBytes`
additionally runs `decodeText`, records the detected encoding on the result, and
raises one `decode-replacement` problem if `hadReplacement` is set.
`parseAuditText` and `parseAuditLines` leave `encoding` as `null`.

---

## 5. Parser behaviour, line by line

`pushLine` does, in order:

1. Trim the line. **If it is empty or whitespace-only, return immediately** —
   no `lineCount`, no problem. The POC does the same, and blank lines are
   normal at the end of a file.
2. Increment `lineCount`.
3. `JSON.parse`. On a throw: increment `malformedLineCount`, add a
   `malformed-line` problem with the 1-based line number and the error's class
   name as `hint`, return. **Never rethrow** (NFR-3).
4. If the parsed value is not a non-null object, or is an array: increment
   `malformedLineCount`, add a `non-object-line` problem, return.
5. Switch on `type`:

| `type` | Behaviour |
|---|---|
| `"system"` with `subtype === "init"` | Take `cwd` and `model` **only if not already set** — the first `init` line wins, matching the POC's `info["cwd"] or d.get("cwd")`. |
| `"command_lifecycle"` | Increment `queued`, `started` or `completed` by `state`. An unrecognised `state` is ignored silently. |
| `"result"` | Build one `RequestRecord` (§5.1) and append it. Also take `session_id` into `cliSessionId` if not already set. |
| anything else | Ignore. Already counted in `lineCount`; not a problem, not malformed. |

**`"assistant"` is deliberately not a case in this switch, and the literal
string `"assistant"` must not appear anywhere in `audit-parser.ts` — not in a
case, not in a type union, not in a comment.** This is the trap of `MAP.md` §4.1
and the roadmap's named exit criterion for S3. `output_tokens` on those lines is
the `message_start` snapshot of one to three tokens; MAP.md records a measured
1,661 against a true 152,004. The static guard test in §8 greps the source for
that string and fails if it is there, so a comment saying "we ignore assistant
lines" will break the build. If you want to record the reason, put it in
`audit-types.ts` next to `TokenUsage.outputTokens`, where the guard does not
look.

### 5.1 Building a `RequestRecord`

- `timestamp` ← `toStringOrNull(line.timestamp)`. Not `_audit_timestamp`, and
  not parsed.
- `costMicroUsd` ← `toMicroUsd(line.total_cost_usd)`. If `total_cost_usd` is
  absent, `null`, or non-finite, the value is `0` **and** a `missing-cost`
  problem is raised with `hint: "total_cost_usd"`. A genuine `0` cost raises
  nothing.
- `durationMs` ← `toInt(line.duration_ms)`; `durationApiMs` ←
  `toInt(line.duration_api_ms)`; `numTurns` ← `toInt(line.num_turns)`;
  `isError` ← `toBool(line.is_error)`.
- `usage` ← every field of `TokenUsage` read from `line.usage`, its
  `output_tokens_details`, its `cache_creation` and its `server_tool_use`
  sub-objects, each through `toInt`, each defaulting to `0` when the block or
  the field is absent. A `result` line with no `usage` block at all yields an
  all-zero `TokenUsage`, not a problem.
- `models` ← `Object.entries(line.modelUsage ?? {})` in insertion order, one
  `ModelUsageRecord` each: `costUSD` → `toMicroUsd`, the four token counts and
  `webSearchRequests` → `toInt`, `provider` / `costBasis` →
  `toStringOrNull`, `contextWindow` → `toInt` or `null` when absent. The key
  becomes `model`, **unchanged** — `claude-opus-5[1m]` and `claude-opus-5` are
  two different models and are priced differently (`MAP.md` §4).
- `subagents` ← a full `SubagentStats` when `subagent_stats` is a non-null
  object, reading `requested`, `spawned`, `spawned_by_subagents`,
  `started_in_background`, `completed`, `failed`, `killed`, `refused` and
  `max_depth` through `toInt`; otherwise `null`. Do not read `by_type`.

### 5.2 `finish()`

Computes `openRequests` as `Math.max(0, started - completed)` and returns the
frozen `AuditSession`. Calling `finish()` twice must return equivalent values and
must not throw.

---

## 6. Fixtures — `test/fixtures/audit/`

**Every byte is invented.** Fake eight-hex session ids, `C:\Users\testuser\…`
paths, round token numbers, made-up timestamps. Nothing is copied, adapted or
paraphrased from `reference-material/`. If you catch yourself opening a real
audit log to "see what a line looks like", the field list in §4.5 and §5.1 is
already the complete answer — use it and write the JSON by hand.

| Fixture | Trap it encodes |
|---|---|
| `basic.jsonl` | The happy path, and the audit-side half of the session-ID truncation trap: a `system/init` line whose `cwd` ends `…\a1b2c3d4\outputs`; matched `queued`/`started`/`completed` triples; three `result` lines carrying every `usage` sub-field, a `server_tool_use` block, a `subagent_stats` block, and a `modelUsage` map containing **both** `claude-opus-5` and `claude-opus-5[1m]` — the model-variant trap. |
| `assistant-noise.jsonl` | Twelve `assistant` lines whose `output_tokens` are 1–3, against one `result` line whose `usage.output_tokens` is 152004. Sums to 1661 across the assistant lines, so a parser that reads them produces exactly the wrong number MAP.md §4.1 records. |
| `aborted.jsonl` | `started: 3`, `completed: 2`, and only two `result` lines → `openRequests === 1`. The aborted-request trap; US-1.5's figure. |
| `malformed.jsonl` | A garbage first line, a truncated JSON object, a bare `123`, a JSON array line, a blank line, a whitespace-only line — and a valid `result` line **after** all of them, proving the scan continues. NFR-3. |
| `crlf-no-trailing-newline.jsonl` | CRLF line endings throughout and no final newline. |
| `partial-fields.jsonl` | `result` lines with, respectively: no `usage`; no `modelUsage`; no `subagent_stats`; `total_cost_usd: null`; and `is_error: true`. |
| `empty.jsonl` | Zero bytes. |

`crlf-no-trailing-newline.jsonl` must actually contain CRLF bytes in Git. Add
`*.jsonl -text` to a `test/fixtures/.gitattributes` so no autocrlf setting
rewrites it.

UTF-8-BOM, UTF-16LE and UTF-16BE variants are **not files**. `encoding.test.ts`
builds those byte arrays from `basic.jsonl`'s text at test time (§2 Q6).

`test/fixtures/audit/index.ts` exports one constant per fixture resolving to its
absolute path, so no test spells a path.

---

## 7. Requirements coverage

### Satisfied by this session

- **US-1.3**, acceptance criteria 1 through 4:
  - cost comes exclusively from `type == "result"` lines — `total_cost_usd`,
    `usage`, `modelUsage`, `num_turns`, `duration_ms`;
  - `output_tokens` from `assistant` lines is never used, proven twice (§10);
  - malformed JSONL lines are counted and skipped and never abort the scan;
  - files are read as UTF-8, UTF-8-with-BOM or UTF-16, in that order.
- **NFR-3 — Robustness.** No code path in `src/model/` throws on bad input.
  Malformed lines, non-object lines, missing cost and undecodable bytes are all
  collected as `Problem`s.
- **NFR-4 — Memory.** The accumulator never holds the line list; the line
  decoder holds at most one partial line and one `TextDecoder`.
- **NFR-6 — Confidentiality.** The `Problem` type structurally cannot carry line
  content or a filesystem path, and a test asserts it (§8).
- **NFR-9 — Testability**, for this layer: every function is pure or
  deterministic, tested without Tauri, without the DOM and without a clock.

### Explicitly deferred

| Deferred | To |
|---|---|
| **US-1.3 criterion 5** — the whole-tree regression (150 sessions / 508 requests / 7 projects). It needs aggregation *and* project assignment; S3 cannot assert it. Note: the figure is **1,413.59 USD**, not the 1,413.58 the POC prints — corrected after S3 verified the exact sum against the reference data. | **S5** |
| Manifests, `spaces.json`, project assignment, `(ohne Projekt)`, unknown-`spaceId` fallback, connected folders, archived/starred flags, and the fixtures for all of it — **US-1.4**, **US-1.5** | **S4** |
| Rendering the `openRequests` figure S3 computes as "offene Anfragen" | **S4 / S8** |
| All aggregation, sorting, per-day and per-month buckets, the `Report` type — **US-2.x** | **S5** |
| Reading files, path normalisation, discovery, the `FileSystem` interface — **NFR-13**, **US-1.1** | **S6** |
| Tauri fs, read-only capabilities, the folder picker — **US-1.1**, **US-1.2**, **US-1.6** | **S7** |
| **NFR-2** — "parsing runs off the UI thread". The synchronous accumulator of §2 Q1 is what keeps that a wrapper change. | the session that introduces the Worker |
| Rendering the collected `Problem` list — **NFR-3**'s user-facing half | **S21** |
| Pricing and the price table — **UC-4** | its own session |

---

## 8. Tests

All under `src/model/`, run by `npm test`.

### `src/model/problems.test.ts`
- `collects up to the cap`
- `keeps counting past the cap`
- `respects an explicit cap argument`
- `a problem carries no file content and no path` — parse `malformed.jsonl`,
  then assert that no emitted `scope` or `hint` contains any substring of the
  fixture's own line text and that neither looks like a path. This is the test
  that fails if someone later starts embedding the offending line "to help
  debugging" (NFR-6).

### `src/model/encoding.test.ts`
- `detects plain UTF-8`
- `detects and strips a UTF-8 BOM`
- `detects UTF-16LE from its BOM`
- `detects UTF-16BE from its BOM`
- `detects BOM-less UTF-16LE from interleaved NUL bytes`
- `decodes umlauts identically in all four encodings`
- `never throws on an invalid byte sequence and reports hadReplacement`
- `splits on LF, CRLF and a missing final newline`
- `line decoder reassembles a line split across two chunks`
- `line decoder reassembles a multi-byte character split across two chunks`
- `line decoder reassembles a CRLF split across two chunks`
- `line decoder flushes a final line without a trailing newline`

### `src/model/session-id.test.ts`
- `derives the directory id from a Windows cwd ending in outputs`
- `derives it from a cwd ending in uploads`
- `returns the last segment when there is no outputs suffix`
- `handles forward slashes and trailing separators`
- `returns null for null and for an empty string`

### `src/model/audit-parser.test.ts`
- `extracts cost, duration, turns and error flag from result lines`
- `sums cost as integer micro-USD`
- `reads every token category from the result usage block`
- `reads thinking tokens from output_tokens_details`
- `reads the 1h and 5m cache-creation split`
- `reads server tool use counts`
- `keeps the [1m] model variant distinct from its base model`
- `reads subagent stats and tolerates their absence`
- `counts command_lifecycle states and reports open requests`
- `takes cwd and model from the first system/init line`
- `derives the session id from cwd and falls back to sourceId`
- `does not use result.session_id as the session id`
- `counts malformed lines and keeps parsing`
- `caps collected problems but not the malformed count`
- `raises missing-cost for a result line without total_cost_usd`
- `ignores blank and whitespace-only lines`
- `returns an empty session for an empty file`
- `finish is idempotent`
- `parseAuditText, parseAuditBytes and parseAuditLines agree on every fixture`

### `src/model/output-tokens-trap.test.ts`

The roadmap's named exit criterion, in its own file so it cannot be lost in a
refactor of the main spec.

- `output tokens come from the result line, not from assistant lines` — over
  `assistant-noise.jsonl`, asserts `usage.outputTokens === 152004` and
  explicitly asserts it is **not** `1661`
- `the parser source contains no assistant branch` — reads
  `src/model/audit-parser.ts` with `node:fs` and asserts that
  `/["']assistant["']/` does not match

---

## 9. Exit criteria

Run everything from the repository root. Both tiers must pass before the session
is reported done.

### Tier 1 — automated

```bash
# 1. Tests green — including the named output_tokens criterion
npm test

# 2. Type-check and production build clean
npm run build

# 3. No dependency crept in — MUST print nothing
git diff --stat -- package.json package-lock.json

# 4a. The model layer is pure — MUST print nothing
grep -rnE "@tauri-apps|node:fs|node:path|localStorage|document\.|window\.|new Date\(|Date\.now" src/model/ --include=*.ts | grep -v ".test.ts"

# 4b. The model layer does not import i18n or state — MUST print nothing
grep -rn "from \"\.\./i18n\|from \"\.\./state" src/model/ --include=*.ts

# 4c. The trap guard — MUST print nothing
grep -n "assistant" src/model/audit-parser.ts

# 4d. No reference data leaked into fixtures — MUST print nothing
# Build the alternation from the real ids and project names in the local,
# gitignored reference-material/ tree; never write them into a committed
# document (NFR-6, CLAUDE.md "Privacy Rules").
grep -rniF -f reference-names.txt test/ src/model/
```

Grep 4d is a floor, not a ceiling. It catches the identifiers `MAP.md` happens to
name; it cannot catch a real prompt or a real path you pasted in. The rule in §6
is the actual guarantee.

### Tier 2 — the one-off reference sanity check

**Manual. Read-only. Not committed. Not in CI.** `reference-material/` is
gitignored and CI has no access to it, so this can never be an automated test —
the real US-1.3 regression arrives in S5 as a script that is also kept out of CI.

Write a throwaway script **outside the repository** (use the scratchpad
directory, not `/tmp`, and not anywhere under the working tree), have it read one
real `audit.jsonl` as bytes and run `parseAuditBytes` over it, and confirm that
the request count and the summed cost match what `poc/cowork_costs.py` reports
for that same session. Then **delete the script**.

Rules for this check: open the file read-only; print only aggregate numbers,
never a line, a path, a prompt or a model-usage dump; and do not paste any of its
content into your report, into a fixture, or into a commit message.

`git status` must be clean of this check before the session is reported.

---

## 10. Three things that will bite you

**1. `result.session_id` is not the session directory.** Verified during
planning against the real data: a session directory named with eight hex
characters carries `result` lines whose `session_id` is an unrelated 36-character
UUID — the CLI session id, which turns up in the manifest as `cliSessionId`.
Using it as the session key silently destroys the manifest matching S4 depends
on. The session id comes from the `system/init` `cwd` via `sessionIdFromCwd`,
falling back to the caller-supplied `sourceId`, exactly as the POC does. S3
exposes `cliSessionId` only so S4 has it available for matching, and the field's
doc comment says what it is not.

**2. The `output_tokens` trap is tested twice, on purpose.** The behavioural
test proves today's parser reads the right field. The static source guard proves
tomorrow's parser cannot start reading the wrong one — because the moment
someone adds a `case "assistant":` to "also count tokens per request", the string
appears in the file and the guard fails. One test without the other is half a
guarantee. Do not weaken the guard to make a comment fit; move the comment
(§5).

**3. Problems are capped at 20 per file; the count is not.** A corrupt
multi-megabyte log must not produce a million `Problem` objects — that would
defeat NFR-4 by the back door. `malformedLineCount` keeps rising past the cap so
the user is told the true scale, while `problems` stays bounded so the UI stays
usable. Both halves are asserted.

---

## 11. Commit

One commit at the end, message in English, following S1's and S2's form:

```
S3: audit log parser (US-1.3, NFR-3, NFR-4)
```

Body: the input contract in one sentence (accumulator core plus three adapters,
so NFR-4 holds by construction), cost carried as integer micro-USD from parse
time, the shared `Problem` type carrying neither paths nor content, and the note
that manifests and `spaces.json` are S4's.
