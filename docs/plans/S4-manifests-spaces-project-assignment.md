# S4 — Manifests, spaces, project assignment

**Status.** Approved plan. Written in the planning phase of session S4.
**Implementer.** Sonnet agent. Follow this document literally; do not expand scope.
**Depends on.** S3 (`docs/plans/S3-audit-log-parser.md`), done and green. S5
(aggregation) depends on what this session emits.

---

## 0. Read this first — environment facts

You are working in the repository root. Use absolute paths everywhere: the Bash
tool resets its working directory between calls.

**`poc/` and `reference-material/` are present in this worktree.** Both are
gitignored; `git status` is clean and must stay clean. This matters twice over:

- `poc/cowork_costs.py` is **the authority** for every rule in this session.
  Read `session_keys()`, `index_sessions()`, `load_spaces()`, `folders_of()` and
  `session_id_from_cwd()` before writing anything. This plan quotes those rules
  so they survive the POC one day going away, but where plan and POC disagree,
  the POC wins and you stop and say so.
- `reference-material/` makes the reference distribution locally verifiable. It
  is still not in Git and CI still cannot see it, so the spec that reads it must
  skip cleanly when the directory is absent (§6).

**This session is pure frontend logic.** Nothing touches `src-tauri/`; no Rust,
no `cargo`. `npm test`, `npm run build`, `npm run lint`, `npm run format:check`
are the whole toolchain.

**Zero new dependencies.** Everything below is TypeScript plus what S3 already
built (`decodeText`, `splitLines`, `toInt`, `toBool`, `toStringOrNull`,
`sessionIdFromCwd`, `createProblemCollector`). Do not add a JSON-schema
validator, a path library, or a lodash.

**`tsc` sees every file under `src/`.** `include: ["src"]`, `strict: true`,
`noEmit: true`, and `npm run build` is `tsc && vite build`. A file under `src/`
is type-checked whether or not anything imports it.

**Tests live next to the code; fixtures live in `test/`.** `vite.config.ts` sets
`test.include: ["src/**/*.{test,spec}.{ts,tsx}"]`. Every spec of this session
goes beside its module inside `src/model/`. Fixtures go in
`test/fixtures/sessions/`, alongside S3's `test/fixtures/audit/`. **Do not change
`test.include`.**

Tests may import `node:fs`. Production code under `src/model/` may not — see the
§9 greps.

**The repository is public.** No fragment of `reference-material/` may reach it:
not a project name, not a space id, not a session id, not a path, not a title,
not a prompt, not a line of a real audit log or manifest. Every byte of every
fixture in this session is invented. The reference spec of §6 reads the real
tree at runtime and asserts **counts only**; the names it discovers are
`console.log`ged for a human to read and never written to disk. This plan itself
quotes no value from the real data — every figure in it is a count.

---

## 1. Goal and scope

**Goal.** Map each parsed audit session to the project the user actually sees in
Claude Desktop, and count what the report cannot account for.

**In scope.** `src/model/` only: the tolerant `spaces.json` reader; manifest
parsing restricted to the fields we use; the `session_keys()` port with the
`local_` prefix and 8-hex truncation rules; the manifest index and the lookup;
the no-project bucket and the unknown-`spaceId` fallback; connected-folder
extraction; the archived and starred flags; the US-1.5 gap counts. Synthetic
fixtures in `test/fixtures/sessions/`. Four new `ProblemKind`s. One note
appended to `CLAUDE.md`.

**Out of scope.** Anything that reads a file or walks a directory (S6/S7) —
this session receives already-read text or bytes. Any rollup, any totals, any
`Report` type, any per-day bucketing, any sorting (S5). The `" + "` join of
folder names and the `(ohne verbundenen Ordner)` bucket (S5 grouping / S10 UI).
Any component, any CSS, any translation key, any signal (S8+).

**The trap the roadmap flags.** `session_keys()`. It is not guessable, it is
measured in §5.3, and reproducing it is the reason this session exists.

---

## 2. Decisions made in planning

Nine questions were put to the user. All nine are settled. Do not re-litigate
them in code.

### Q1 — `ProjectRef` is a three-kind discriminated union. No German literal in the model.

```ts
export type ProjectRef =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly spaceId: string; readonly name: string }
  | { readonly kind: "unknown"; readonly spaceId: string };
```

Architecture rule 7 and the "model layer never imports `src/i18n/`" rule together
forbid `"(ohne Projekt)"` from appearing anywhere in `src/model/`. The POC's
`NO_PROJECT` constant is a *display* decision and does not port.

Three kinds rather than two with a nullable name, because the UI genuinely has
three cases: a translated label, a real project name, and a raw id shown because
`spaces.json` did not know it. A `name: string | null` would invite
`name ?? "(ohne Projekt)"` at the first call site, which is exactly the bug the
union prevents.

`projectKey(ref)` returns `"\u0000none"` for `kind: "none"` and `ref.spaceId`
otherwise, so S5 can group in a plain `Map` without the marker colliding with a
space whose id happens to be the string `none`. A NUL-prefixed key cannot come
out of the real data.

### Q2 — S4 emits a wrapper, `ResolvedSession`. S3's `AuditSession` is not touched.

```ts
export interface ResolvedSession {
  readonly audit: AuditSession;
  readonly meta: SessionMeta | null;
  readonly project: ProjectRef;
  readonly folders: readonly ConnectedFolder[];
}
```

S5 reads `r.audit.requests` and `r.project` and never re-does the join. Rejected:
copying manifest fields into `AuditSession` (would force S3's type to know about
S4, and S3 is done); returning a parallel `Map<sessionId, SessionMeta>` for S5 to
apply (S5 would repeat the lookup, and the lookup is the trap).

`meta: null` is the *only* representation of "audit log with no manifest"
(US-1.5). It is not an error and not a `Problem`; it is a counted gap.

### Q3 — The reference distribution is an auto-skipping vitest spec, not a script.

`src/model/reference-distribution.test.ts`, wrapped in
`describe.skipIf(!existsSync(dir))` where
`dir = process.env.CLAUDE3P_REFERENCE_DIR ?? <repoRoot>/reference-material`.
It runs locally, skips in CI, needs no new dependency, and needs no `tsx` or
`vite-node` to import the TypeScript model. A `scripts/*.mjs` alternative was
rejected precisely because it would need one of those, and the roadmap's sizing
rule says no new dependency in a session that also introduces new logic.

It asserts counts only (§6). S5 extends the same file with the 1,413.59 USD
regression.

### Q4 — The lookup tries `sourceId` too. Documented deviation from the POC.

The POC looks up `sid` and `sid.split("-")[0]`, where `sid` is
`session_id_from_cwd(cwd)` falling back to the directory name. S3's
`AuditSession` carries `sessionId` and `sourceId` as separate fields and they can
differ — `sessionId` is derived from the log's own `system/init` `cwd`, while
`sourceId` is the directory name the caller passed in.

`lookupManifest` therefore tries, in order: `sessionId`,
`sessionId.split("-")[0]`, `sourceId`, `sourceId.split("-")[0]`. This is a strict
superset: the two extra attempts only run after the POC would already have
returned nothing.

**On the reference data it never fires — all 150 audit logs match on `sessionId`
alone.** It is purely defensive, against a log whose `cwd` points somewhere
unexpected. Say so in the function's doc comment, so nobody later "simplifies" it
believing it is load-bearing, and nobody believes it is exercised.

### Q5 — First-wins on key collision, as the POC does, plus a `Problem`. The collisions are real.

`index_sessions()` does `idx.setdefault(key, rec)` over a sorted path list, so
the first manifest silently wins any collision. We keep first-wins — changing it
would change which project some session lands in, with no evidence that the other
answer is better — but we record a `duplicate-session-key` problem whenever a key
would map to a *different* session id.

**This is load-bearing, not theoretical: the reference data produces exactly two
collisions.** Both have the same cause, and it is worse than a duplicate. Two
manifests carry a `cwd` that does not point into a session directory at all but
into a shared user project folder. `sessionIdFromCwd` dutifully returns that
folder's name, and both manifests then contribute it — and its first
hyphen-separated segment — as session keys. The keys are not merely duplicated,
they are **wrong**: a folder name masquerading as a session id. Nothing in the
reference data currently looks them up, but a session whose `cwd` were that
folder would be attached to whichever manifest happened to sort first.

So the problem record is the point. It makes a wrong key visible instead of
letting it decide a project assignment in silence.

Because first-wins depends on order, `buildManifestIndex` **requires its input in
a deterministic order** (sorted by manifest file name) and says so in its doc
comment. S6 supplies that order.

### Q6 — S4 adds four `ProblemKind`s.

`"malformed-manifest"`, `"malformed-spaces"`, `"unknown-space"`,
`"duplicate-session-key"`. S3's doc comment predicted the first and the third;
extend that comment rather than leaving it stale.

NFR-6 bounds what they may carry. `scope` is the derived session id for manifest
problems (a session directory name, never a path) and the literal `"spaces"` for
`spaces.json`. `hint` is a field name or an error class name — for
`unknown-space` it is the string `"spaceId"`, **never the id's value**. The value
itself travels in `ProjectRef.spaceId`, where the UI legitimately needs it to
render US-1.4's fallback.

### Q7 — Only the fields we use are retained. `cwd` is read and dropped.

Retained in `SessionMeta`: `sessionId` (normalised), `title`, `spaceId`, `model`,
`createdAt`, `lastActivityAt`, `isArchived`, `isStarred`, `folders`.

`title` is retained because US-2.2 displays it and REQUIREMENTS §exports lists it
as export content. `createdAt` / `lastActivityAt` are kept as raw epoch-ms
numbers — no clock, no parsing in the model — because a session with zero
requests has no other timestamp for S5 to bucket by.

**Never read into any type of ours:** `systemPrompt`, `initialMessage`,
`emailAddress`, and `instructions` (in both the manifest and `spaces.json`).
`cwd` is read to derive session keys and then **dropped**; it must not reach
`SessionMeta`, and there is a test for that.

### Q8 — Folders are `{display: basename, kind}`. The full path is not retained.

```ts
export interface ConnectedFolder {
  readonly display: string;       // basename only
  readonly kind: string | null;   // "local" | "network-drive" | anything else observed
}
```

The POC's `folders_of()` already reduces to basenames; CLAUDE.md's rule is
"display basenames, keep full paths to hover text". S10 builds that hover text
and marks network drives (US-2.4), and S10 can carry the NFR-6 argument for
retaining the path when it has a consumer. Retaining a sensitive string in S4
with nothing reading it is the worst of both worlds. `kind` is non-sensitive and
free, so keep it now.

### Q9 — No translation keys in S4.

`project.none` and `folder.none` are added by S8, the first code that renders
them. The catalogue is typed and key parity is enforced by `tsc`; a key with no
consumer is dead weight and nothing is gained by adding it three sessions early.

---

## 3. File inventory

### 3.1 Created — `src/model/`

| File | Content |
|------|---------|
| `project-types.ts` | `SessionMeta`, `ConnectedFolder`, `ProjectRef`, `SpaceIndex`, `ParsedManifest`, `ManifestIndex`, `ResolvedSession`, `ScanGaps` |
| `spaces.ts` | Tolerant `spaces.json` reader — port of `load_spaces()` |
| `manifest.ts` | Manifest parsing, `sessionKeys()`, index build, lookup — port of `index_sessions()` and `session_keys()` |
| `project-assignment.ts` | `resolveProject`, `projectKey`, `resolveSession`, `resolveSessions`, `summarizeGaps` |

Four modules, not six: the index and the key derivation are one subject and
splitting them would put the trap's two halves in different files.

### 3.2 Created — tests

`src/model/spaces.test.ts`, `src/model/manifest.test.ts`,
`src/model/project-assignment.test.ts`,
`src/model/reference-distribution.test.ts`.

### 3.3 Created — fixtures, `test/fixtures/sessions/`

Synthetic, invented, anonymised. Listed in §7, with an `index.ts` exporting
absolute paths exactly as `test/fixtures/audit/index.ts` does. Tests never spell
a fixture path themselves.

### 3.4 Changed in place

- `src/model/problems.ts` — four new kinds in `ProblemKind`, and the leading
  doc comment updated (it currently says S4 will add two).
- `CLAUDE.md` — one short entry in *Data Model Essentials*, in the style of the
  S3 entries: the `ProjectRef` union, `cwd` dropped after key derivation, and the
  fact that two real key collisions exist.

### 3.5 Explicitly NOT touched

`src/services/`, `src/i18n/`, `src/components/`, `src/state/`, `src/styles/`,
`src-tauri/`, `index.html`, `vite.config.ts` (`test.include` stays narrowed),
`package.json` / `package-lock.json` (zero new dependencies),
`test/fixtures/audit/`, and every file S3 created except `problems.ts`.

### 3.6 No UI

S4 is model-only. No component, no CSS, no translation key, no signal, no
`data-testid`. Everything visual in US-1.4 and US-1.5 is deferred — see §8.

---

## 4. Boundary types and signatures

### 4.1 `src/model/project-types.ts`

```ts
export interface ConnectedFolder {
  readonly display: string;
  readonly kind: string | null;
}

export interface SessionMeta {
  /** `local_` stripped. NEVER truncated — the truncation is a key form, not an identity. */
  readonly sessionId: string;
  readonly title: string;
  /** Empty or whitespace-only normalised to null (POC truthiness). */
  readonly spaceId: string | null;
  readonly model: string | null;
  /** Raw epoch ms exactly as it appears. Never parsed here — no clock in src/model. */
  readonly createdAt: number | null;
  readonly lastActivityAt: number | null;
  readonly isArchived: boolean;
  readonly isStarred: boolean;
  readonly folders: readonly ConnectedFolder[];
}

export type ProjectRef =
  | { readonly kind: "none" }
  | { readonly kind: "named"; readonly spaceId: string; readonly name: string }
  | { readonly kind: "unknown"; readonly spaceId: string };

/** spaceId -> display name. */
export type SpaceIndex = ReadonlyMap<string, string>;

/** Session key -> meta. One meta appears under many keys. */
export type ManifestIndex = ReadonlyMap<string, SessionMeta>;

export interface ParsedManifest {
  readonly meta: SessionMeta;
  /** All spellings this session can appear under. Derived from cwd among others. */
  readonly keys: readonly string[];
}

export interface ResolvedSession {
  readonly audit: AuditSession;
  readonly meta: SessionMeta | null;
  readonly project: ProjectRef;
  readonly folders: readonly ConnectedFolder[];
}

export interface ScanGaps {
  /** Sum of AuditSession.openRequests — US-1.5 "offene Anfragen". */
  readonly openRequests: number;
  readonly sessionsWithoutManifest: number;
  /** Integer micro-USD, per CLAUDE.md. Divided by 1e6 once, at the display boundary. */
  readonly costMicroUsdWithoutManifest: number;
  readonly archivedSessions: number;
}
```

### 4.2 `src/model/spaces.ts`

```ts
export function parseSpacesText(text: string, problems: ProblemCollector): SpaceIndex;
export function parseSpacesBytes(bytes: Uint8Array, problems: ProblemCollector): SpaceIndex;
/** Multiple accounts/profiles each have a spaces.json. Later entries win on conflict. */
export function mergeSpaceIndexes(indexes: readonly SpaceIndex[]): SpaceIndex;
```

Two adapters over one core, mirroring S3's shape. `parseSpacesBytes` is
`decodeText` plus `parseSpacesText`; that is the whole of it.

Port of `load_spaces()`, rule for rule:

```
ID_KEYS   = ("id", "uuid", "spaceId", "space_id", "key")
NAME_KEYS = ("name", "title", "label", "displayName")

items = data["spaces"] if data is a dict with "spaces" else data
if items is a dict:   for k, v:  v dict -> name = first truthy NAME_KEY, else k
                                 v str  -> name = v
                                 anything else -> skip
if items is a list:   for each dict entry: id = first truthy ID_KEY (skip if none)
                                           name = first truthy NAME_KEY, else the id
anything else:        empty index
```

"First truthy" means the POC's truthiness: an empty string does not count. A
`JSON.parse` failure records `{ kind: "malformed-spaces", scope: "spaces" }` and
returns an empty index; it never throws (NFR-3).

### 4.3 `src/model/manifest.ts`

```ts
/** Transient input to sessionKeys. Never stored — cwd must not outlive this call. */
export interface ManifestRawIds {
  readonly sessionId: string | null;
  readonly cliSessionId: string | null;
  readonly cwd: string | null;
}

/** Port of session_keys() in poc/cowork_costs.py. See §5.2 — do not shorten it. */
export function sessionKeys(raw: ManifestRawIds, fileName: string): readonly string[];

/** fileName is the bare "local_<uuid>.json" — never a path (NFR-6). */
export function parseManifestText(
  text: string, fileName: string, problems: ProblemCollector,
): ParsedManifest | null;
export function parseManifestBytes(
  bytes: Uint8Array, fileName: string, problems: ProblemCollector,
): ParsedManifest | null;

/** Input MUST be in a deterministic order (sorted by file name): first wins. See §2 Q5. */
export function buildManifestIndex(
  manifests: readonly ParsedManifest[], problems: ProblemCollector,
): ManifestIndex;

export function lookupManifest(
  index: ManifestIndex, id: { readonly sessionId: string; readonly sourceId: string },
): SessionMeta | null;
```

`cwd` exists only as a local inside `parseManifest*`, is handed to `sessionKeys`,
and is then gone. `ParsedManifest` has no field that could carry it.

### 4.4 `src/model/project-assignment.ts`

```ts
export function resolveProject(
  meta: SessionMeta | null, spaces: SpaceIndex, problems: ProblemCollector,
): ProjectRef;

export function projectKey(ref: ProjectRef): string;

export function resolveSession(
  audit: AuditSession, index: ManifestIndex, spaces: SpaceIndex, problems: ProblemCollector,
): ResolvedSession;

export function resolveSessions(
  audits: readonly AuditSession[], index: ManifestIndex, spaces: SpaceIndex,
  problems: ProblemCollector,
): readonly ResolvedSession[];

export function summarizeGaps(sessions: readonly ResolvedSession[]): ScanGaps;
```

`resolveProject` is the whole of US-1.4's bucketing:

- `meta` is null, or `meta.spaceId` is null → `{ kind: "none" }`.
- `spaces` has the id → `{ kind: "named", spaceId, name }`.
- `spaces` does not → `{ kind: "unknown", spaceId }` **and** a
  `{ kind: "unknown-space", scope: meta.sessionId, hint: "spaceId" }` problem.
  The session is never dropped.

`summarizeGaps` sums `audit.openRequests`, counts `meta === null` sessions and
their cost in integer micro-USD, and counts `meta?.isArchived`.

---

## 5. The trap, in full

### 5.1 The authority

`poc/cowork_costs.py`, functions `session_keys()`, `index_sessions()` and
`session_id_from_cwd()`. It is in this worktree. Read it. The rules below were
re-read against it during planning and are character-exact; if you find a
discrepancy, the POC wins and you report it rather than silently choosing.

`session_id_from_cwd()` is already ported — `src/model/session-id.ts`, from S3.
Reuse it; do not write a second one.

### 5.2 `session_keys()`, verbatim as a rule

Candidates, in this order:

1. `fileName` with the leading `local_` and the trailing `.json` sliced off
   (a positional slice, exactly as the POC does — the caller only ever passes
   `local_*.json` names).
2. `manifest.sessionId`
3. `manifest.cliSessionId`
4. `sessionIdFromCwd(manifest.cwd)`, only when `cwd` is truthy.

Then, for each candidate that is non-empty, coerced to a string:

- take two forms — the string itself, and the string with a leading `local_`
  removed if it has one;
- add **both** forms to the key set;
- add **`form.split("-")[0]`** for **each** of the two forms as well.

Finally drop every empty string. The result is a set; return it in a stable
order (sorted) so `buildManifestIndex` is deterministic.

The step people get wrong is the last one: the truncation applies to the
`local_`-stripped form too. That is what turns manifest
`local_<8hex>-<rest>.json` into the directory name `<8hex>`, and it is the entire
reason the assignment works.

### 5.3 Why all of it gets ported, measured

Against the reference tree, the full port resolves **150 of 150** audit logs to a
manifest. Dropping parts of the rule:

| `cwd`-derived key | 8-hex truncation | Audit logs matched |
|---|---|---|
| yes | yes — the POC, and what we build | **150 / 150** |
| yes | no | 150 / 150 |
| no | yes | 150 / 150 |
| no | **no** | **8 / 150** |

The two rules are individually sufficient and jointly redundant *on this one
dataset*; dropping both leaves 95% of sessions unassigned. Both stay in, because
each covers a case the other cannot: a manifest with no `cwd` needs the
truncation, and a session directory that is not an 8-hex prefix of its uuid needs
the `cwd` key. The reference data is one machine's data, not the specification.

The `local_` strip is likewise not independently load-bearing here — candidate 1
arrives already stripped — but it stays, because candidate 2 (`sessionId`) always
carries the prefix and would be the only survivor on a tree without `cwd`.

Do not "optimise" this rule against the table. The table is the justification for
keeping all of it, not a menu.

### 5.4 The collisions

Two real key collisions exist in the reference data, both from the cause set out
in §2 Q5: a `cwd` pointing at a shared user project folder rather than at a
session directory. First-wins is kept; `duplicate-session-key` makes it visible.
The reference spec asserts the count is 2, so a future change to the key rule
that quietly creates more will fail loudly.

---

## 6. `reference-distribution.test.ts`

```ts
const dir = process.env.CLAUDE3P_REFERENCE_DIR ?? join(repoRoot, "reference-material");
describe.skipIf(!existsSync(dir))("reference distribution", () => { … });
```

The spec walks the tree with `node:fs` (a test may; production code may not),
reads each `spaces.json` and `local_*.json` as **bytes** through
`parseSpacesBytes` / `parseManifestBytes`, parses each `audit.jsonl` through S3's
`parseAuditBytes`, builds the index from manifests sorted by file name, resolves
every session, and asserts exactly:

| Assertion | Value |
|---|---|
| Entries in the merged space index | 6 |
| Distinct `projectKey` buckets across all sessions | 7 |
| Manifests parsed | 152 |
| Audit logs parsed | 150 |
| `ScanGaps.openRequests` | 14 |
| `ScanGaps.sessionsWithoutManifest` | 0 |
| Sessions resolving to `kind: "unknown"` | 0 |
| `duplicate-session-key` problems | 2 |

Names are `console.log`ged, never asserted and never written to a file. The
spec's own source contains no project name, no session id, no space id and no
path from the real data — only the counts above and the env-var default.

It must skip cleanly, not fail, when `reference-material/` is missing: that is
how CI sees it. Verify both branches (§9).

Note what these numbers do *not* cover. In the reference data, **unknown
`spaceId`, `isArchived`, `isStarred` and audit-logs-without-a-manifest all
measure exactly zero.** Four of this session's features therefore have no
reference coverage at all and can only ever be proven by the synthetic fixtures
of §7. Do not treat a green reference spec as evidence that they work.

---

## 7. Fixtures — `test/fixtures/sessions/`

Every value invented. Use obviously fake ids (`aaaaaaaa-1111-…`), obviously fake
project names (`Alpha`, `Beta`, `Gamma`, `Delta`, `Epsilon`, `Zeta`), and
obviously fake folder names. No German project names, no umlaut-bearing real
folder names, nothing recognisable.

**`spaces.json` variants**

| File | Shape |
|---|---|
| `spaces-list.json` | `{"spaces":[{"id","name"},…]}` — six entries, the common case |
| `spaces-map.json` | `{"spaces":{"<id>":{"name"},…}}` |
| `spaces-map-of-strings.json` | `{"spaces":{"<id>":"Name",…}}` |
| `spaces-array-root.json` | a bare top-level array, no `spaces` wrapper |
| `spaces-loose-keys.json` | id under `uuid` / `space_id` / `key`, name under `title` / `label` / `displayName`, one entry with an id and no name |
| `spaces-malformed.json` | truncated JSON |

UTF-16 and BOM coverage is produced **inside the test** by encoding
`spaces-list.json`'s text, exactly as S3 did for its encoding fixtures (S3 §2
Q6). Do not commit binary fixtures.

**Manifest variants** — `local_<fake-uuid>.json`, one per case:

1. The ordinary case: full `sessionId` with `local_` prefix, a `spaceId` present
   in `spaces-list.json`, `cwd` ending in the 8-hex session directory,
   `resolvedFolderKinds` with a `display` and a `kind`.
2. No `spaceId` at all.
3. `spaceId: ""` — empty string, must behave as absent.
4. A `spaceId` absent from every spaces fixture — the unknown fallback.
5. `isArchived: true`, `isStarred: true`.
6. No `resolvedFolderKinds`, only `userSelectedFolders`, mixed string and object
   entries, with backslash paths and a trailing separator.
7. No `sessionId` field at all — keys must come from the file name.
8. A manifest whose `cwd` points at a shared folder rather than a session
   directory, paired with a second such manifest, to reproduce the §5.4
   collision.
9. A manifest carrying `systemPrompt`, `initialMessage`, `emailAddress` and an
   `instructions` field, all with invented content, so the "not retained" test
   has something to prove absent.
10. `malformed-manifest.json` — truncated JSON. (Named without the `local_`
    prefix is fine; the tests pass the file name explicitly.)

`index.ts` exports an absolute path constant per fixture plus `ALL_FIXTURES`,
mirroring `test/fixtures/audit/index.ts`.

---

## 8. Requirements coverage

### Satisfied by this session

| Criterion | How |
|---|---|
| US-1.4 — tolerant `spaces.json` schema, list or map, several id and name keys | `parseSpacesText`, §4.2 |
| US-1.4 — matching across all ID spellings incl. the `local_` / 8-hex trap | `sessionKeys` + `lookupManifest`, §5 |
| US-1.4 — sessions with no `spaceId` in their own bucket | `ProjectRef.kind === "none"` |
| US-1.4 — unknown `spaceId` falls back to the raw id, never dropped | `ProjectRef.kind === "unknown"` |
| US-1.4 — exactly seven buckets on the reference data | §6 reference spec, counts only |
| US-1.5 — started-minus-completed counted | `ScanGaps.openRequests` |
| US-1.5 — sessions with an audit log but no manifest, with their cost | `meta: null` + `ScanGaps.sessionsWithoutManifest` / `costMicroUsdWithoutManifest` |
| US-1.5 — `isArchived` sessions included, flag available | `SessionMeta.isArchived`, `ScanGaps.archivedSessions` |
| NFR-3 — failures collected, never thrown | four new `ProblemKind`s, every parser returns on failure |
| NFR-6 — no sensitive content retained | Q7 field list, `cwd` dropped, `hint` is a field name |

### Explicitly deferred

| Criterion | To |
|---|---|
| Rendering the no-project label and the raw-id fallback; the `project.none` key | **S8** |
| Archived sessions visually distinct | **S9** |
| The gap indicators shown in the main view, always visible | **S10** |
| Full folder paths in hover text, network drives marked | **S10** |
| `(ohne verbundenen Ordner)` bucketing and folder grouping | **S5** (grouping) / **S10** (UI) |
| Any total, any rollup, any `Report` type, the 1,413.59 USD regression | **S5** |
| Walking directories, reading files, choosing roots | **S6** / **S7** |

---

## 9. Exit criteria

Run everything from the repository root. Both tiers must pass.

### Tier 1 — automated

```bash
# 1. Tests green, reference spec RUNNING (reference-material/ is present here)
npm test

# 2. The reference spec skips cleanly when the data is absent — as it will in CI
CLAUDE3P_REFERENCE_DIR=/nonexistent npm test

# 3. Type-check and production build clean
npm run build

# 4. Lint and format
npm run lint
npm run format:check

# 5. No dependency crept in — MUST print nothing
git diff --stat -- package.json package-lock.json

# 6. Nothing untracked or ignored got committed — reference-material/ and poc/
#    must not appear anywhere in the diff
git status --short

# 7a. The model layer is pure — MUST print nothing
grep -rnE "@tauri-apps|node:fs|node:path|localStorage|document\.|window\.|new Date\(|Date\.now" src/model/ --include=*.ts | grep -v ".test.ts"

# 7b. The model layer does not import i18n or state — MUST print nothing
grep -rn "from \"\.\./i18n\|from \"\.\./state" src/model/ --include=*.ts

# 7c. No German display literal in the model — MUST print nothing
grep -rniE "ohne Projekt|ohne verbundenen" src/model/

# 7d. cwd is not retained — MUST print nothing outside sessionKeys' inputs
grep -rn "cwd" src/model/project-types.ts

# 7e. No reference data leaked into fixtures or specs — MUST print nothing
# Build the alternation from the real ids and project names in the local,
# gitignored reference-material/ tree; never write them into a committed
# document (NFR-6, CLAUDE.md "Privacy Rules").
grep -rniF -f reference-names.txt test/ src/model/
```

Grep 7e is a floor, not a ceiling. It catches the identifiers `MAP.md` happens to
name; it cannot catch a real folder name, title or space id you pasted in. The
rule in §7 — every byte invented — is the actual guarantee.

### Tier 2 — the reference distribution, read by a human

`npm test` runs `reference-distribution.test.ts` locally. Read its
`console.log`ged bucket list and confirm by eye that it is seven entries: the six
project names the user recognises from Claude Desktop, plus the no-project
bucket. **Do not paste those names into your report, into a commit message, into
a fixture, or into any file in the repository.** The assertion the repository
carries is the count, `7`; the names are checked by a person and then forgotten.

---

## 10. Three things that will bite you

**1. The truncation applies to the `local_`-stripped form.** `session_keys()`
takes two forms per candidate and then splits *each* of them on `-`. Port it as
written (§5.2). A version that truncates only the raw form still passes a
carelessly built fixture and then matches 8 of 150 real sessions — the bottom row
of the §5.3 table. Build the fixture from the *directory* name and the *manifest*
name independently, so the test can actually fail.

**2. `result.session_id` is not the session directory, and neither is
`cliSessionId`.** S3 already carries this warning. `cliSessionId` is one of the
four key candidates and belongs in the key set — but never as the session's
identity. `SessionMeta.sessionId` comes from `sessionId` or the file name, never
from `cliSessionId`.

**3. Zero is not a passing grade.** Unknown `spaceId`, archived, starred and
orphan audit logs all measure zero in the reference data (§6). A green reference
spec says nothing about them. Their only evidence is the fixtures of §7, so write
those tests as if the reference spec did not exist.

---

## 11. Tests, by name

**`spaces.test.ts`** — list form; map-of-objects form; map-of-strings form;
top-level array with no `spaces` wrapper; id resolved from `uuid`, `spaceId`,
`space_id` and `key`; name resolved from `title`, `label` and `displayName`;
entry with an id and no name falls back to the id; entry with no id skipped;
non-object entries skipped; malformed JSON records `malformed-spaces`, returns an
empty index and does not throw; UTF-16 and BOM bytes decode through
`parseSpacesBytes`; `mergeSpaceIndexes` merges two profiles and later wins.

**`manifest.test.ts`** — **`sessionKeys` yields the 8-hex session directory name
for a `local_<uuid>` manifest** (the headline trap); keys include the raw and
`local_`-stripped forms of all four candidates; keys survive a missing
`sessionId` by falling back to the file name; `cliSessionId` contributes keys;
`cwd` contributes a key via `sessionIdFromCwd`; `sessionKeys` output is sorted
and free of empty strings; **`SessionMeta` has no `cwd` key**; `systemPrompt`,
`initialMessage`, `emailAddress` and `instructions` are not retained (assert on
`Object.keys`); `spaceId: ""` becomes `null`; `resolvedFolderKinds` preferred
over `userSelectedFolders`; fallback to `userSelectedFolders` in string and
object form; folder `display` is the basename for a backslash path with a
trailing separator; `kind` carried through; `isArchived` and `isStarred` default
to `false`; malformed JSON records `malformed-manifest` and returns `null`;
non-object JSON returns `null`; `lookupManifest` finds a session by full uuid, by
8-hex directory name, by `sourceId` and by truncated `sourceId`; two manifests
sharing a key keep the first and record `duplicate-session-key`; a key shared by
one manifest with itself records nothing.

**`project-assignment.test.ts`** — named project resolved from the space index;
`spaceId` absent → `kind: "none"`; manifest absent → `kind: "none"` with
`meta: null`; `spaceId` present but unknown → `kind: "unknown"` carrying the raw
id, session not dropped, and an `unknown-space` problem whose `hint` is
`"spaceId"` and **not** the id's value; `projectKey` distinguishes the no-project
bucket from a space whose id is the literal string `none`; `resolveSessions` over
the fixture set yields seven distinct `projectKey`s; `summarizeGaps` sums
`openRequests`, counts orphan sessions with their cost in integer micro-USD, and
counts archived sessions.

**`reference-distribution.test.ts`** — the eight assertions of §6, skipped when
the directory is absent.

---

## 12. Commit

One commit at the end, message in English, following the form of S1–S3:

```
S4: manifests, spaces and project assignment (US-1.4, US-1.5)
```

`git status` must be clean afterwards, with `poc/` and `reference-material/`
still untracked and still ignored.
