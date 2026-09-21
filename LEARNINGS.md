# Learnings

Persistent memory across sessions: things that are true of this project or this
development setup, are not obvious from the code, and cost somebody time. Every
agent reads this file before starting work. Only the session orchestrator writes
it, at the end of a session and with the user's approval.

Newest entry first.

---

- **A negative control that fails to fail is not automatically a plan error —
  ask what the missing test was *for* before concluding the reference was
  merely mis-numbered.** A control predicting two failures produced one, and
  the untouched test genuinely never called the patched function. But the
  property that mattered was the *composite* of the two — that a boundary
  instant lands in exactly one of two adjacent periods — and no test asserted
  it, so the bug would have survived a green suite. Under-failure is a prompt
  to look for the uncovered composite, not a bookkeeping correction.
- **A "sums to N" invariant over two views derived from one array is a
  tautology, and no negative control will reveal it — only reasoning about the
  data flow will.** Where both groupings are built from the same row array, any
  session-level filter applied consistently preserves the sum by construction,
  right or wrong. Pair such an assertion with a concrete expected count from a
  fixture engineered so the wrong rule yields a different number.
- **Passing a default's own value explicitly is a self-agreeing comparison, not
  a test of the default.** Comparing a call with `{ range: ALL_TIME }` against
  one with no options exercises the same `options?.range ?? ALL_TIME`
  expression on both sides, so a bug in what the default *means* moves both
  identically and the equality still holds. Testing a default path needs a case
  where the defaulted behaviour is observable alone — a session with zero
  `result` lines but non-zero `openRequests`, which survives unfiltered and is
  dropped under any bounded range.
- **A trailing `as <TypeName>` on a test helper silently opts a whole file out
  of the compiler fan-out that catches incomplete literals.** Widening a shared
  type only fails the build where the literal is actually checked; one
  assertion on a factory turns that into a no-op for every test in the file,
  and the next field added goes missing there silently. When a session widens a
  shared type, grep the fallout files for `as <TypeName>` as well as for the
  literals.
- **The NUL-byte scan has a permanent, legitimate hit.**
  `test/fixtures/utf16le-lines.bin` is UTF-16LE, so every ASCII character in it
  is a NUL byte, and `--encoding none` correctly refuses to transcode that
  away. The expectation is "prints exactly `test/fixtures/utf16le-lines.bin`",
  never "prints nothing" — the latter trains its reader to wave through the one
  line the check always emits, which is how a real NUL gets past it.
- **A regression pin computed from real data cannot prove a guard-rail that
  happens to be a no-op on that data.** A dedup key that removes a duplicate
  scores identically to no dedup at all when the real dataset never contains
  the duplicate in the first place — the pinned total is the same either way.
  Where a plan defends logic that is inert on the available real data, only a
  synthetic fixture built to contain the duplicate actually tests it; say so
  explicitly rather than citing the real-data pin as coverage for it.
- **Making a shared type's field non-optional fans out into every hand-built
  test object literal that constructs it, including files a session's plan
  does not name.** `tsc` will not pass otherwise. This is expected fallout,
  not scope creep — a plan adding a required field to a widely-used type
  should say so, and an implementer should not hesitate to touch an unlisted
  test file for exactly this reason.
- **A source-level grep guard keyed on plain words also blocks the guarded
  module's own comments from using those words**, and is trivially evadable by
  a differently-spelled field access it wasn't written to catch. It is a cheap
  tripwire, not a proof — write the module's documentation around the words it
  must avoid, and pair the grep with a behavioural test that actually exercises
  the property the grep is a stand-in for. The behavioural test is the one that
  holds; treat the grep as the weaker half.

- **A NUL-byte scan needs a form that works from a non-interactive shell, not
  just an interactive one.** `command grep -rlaP` assumes GNU-compatible grep;
  from this environment's Bash tool the same command resolves to BSD grep,
  which has no `-P` at all, and `ugrep` is not on that shell's `PATH`. `rg -l
  --text --no-ignore --hidden --encoding none -e '\x00' <paths>` is the
  reliable substitute — but only with `--encoding none`: ripgrep otherwise
  detects a UTF-16 BOM, transcodes to UTF-8 before matching, and reports a
  NUL-containing file clean, a silent false negative worse than a command that
  errors loudly. Verify any NUL scan against a synthetic NUL file and a known
  BOM'd fixture, not by trusting the exit code.
- **`querySelectorAll("th")` on an outer table also matches every nested
  table's headers once a detail row nests tables inside it**, inflating a
  column count and making a `colSpan` assertion pass against the wrong number.
  Scope with `:scope > thead > tr > th` to count only the table's own columns.
- **A "shares sum to 1" assertion cannot by itself catch a spurious extra
  category** if the wrong implementation also folds that category into the
  denominator — the shares still sum to 1. Pair any normalised-share assertion
  with an explicit pin on the total/denominator value.
- **`no-irregular-whitespace` does not catch a raw U+00A0 inside a string
  literal.** The rule's `skipStrings` option defaults to `true`, so an
  `eslint.config.js` entry of `{ skipTemplates: true }` widens an already-open
  door, and a comment there claiming string or JSX text is not exempt is wrong.
  Every invisible non-breaking space in a test expectation passes lint silently.
  Derive expected strings from `formatCurrency` / `formatPercent` rather than
  typing them out, because `Intl` emits U+00A0 and not U+0020.
- **A literal U+0000 in a CSS attribute selector can never match.** CSS
  tokenisation replaces a NUL with U+FFFD before the selector engine sees it, so
  `[data-group-key="…U+0000…"]` silently matches nothing. Playwright's
  `toHaveAttribute` compares attribute values in JS and is unaffected: locate a
  NUL-keyed row by index or another non-CSS route, then pin it with a
  `toHaveAttribute` on the key so the assertion stays real.
- **Preact keeps `false` for `data-*` and `aria-*` attributes and drops it for
  every other attribute name.** `data-selected={false}` renders
  `data-selected="false"`; the same expression on a non-hyphenated name removes
  the attribute entirely. Assert both branches, or a test that checks only the
  `true` case cannot distinguish `"false"` from absent.
- **Verify a fixture's "makes the wrong implementation fail" property by
  breaking the implementation.** One-line patches — always use the first
  grouping, always use the global breakdown — take minutes and turn a claim into
  a failure count. Do it once for whichever fixture property a plan calls
  load-bearing, and restore the patched file byte-for-byte afterwards.
- **The NUL-byte scan covers `src plugins scripts e2e test` and not `docs/`,
  where raw NULs are already sitting.** Committed plan documents contain them,
  written while describing a NUL-prefixed sentinel key. Prose about a sentinel
  value is exactly where the byte gets in, so either widen the scan or write the
  escape in documents too.
- **`hasAttribute("onclick")` is a vacuous assertion in Preact.** JSX event
  props are attached with `addEventListener` and never produce an `onclick`
  content attribute, so `expect(el.hasAttribute("onclick")).toBe(false)` passes
  whether or not a handler exists. A test asserting an element is *not*
  clickable must spy on `addEventListener` and carry a positive control on an
  element that is wired — otherwise it certifies exactly the boundary it was
  written to guard.
- **An injectable dependency whose default agrees with the injection on every
  fixture is untested by construction.** Ignoring the injected option entirely
  can pass the entire suite: every ASCII string orders identically under code
  units and under an `Intl.Collator`. Test an injection point with a value no
  default can produce — for a comparator, a deliberately reversed one.
- **A session with no manifest cannot sit inside a named project's group.**
  `resolveProject` maps `meta === null` to `{ kind: "none" }` and `projectKey`
  to the `" none"` bucket, a different group key from any named space. A fixture
  wanting untitled or missing-activity behaviour *inside* a named space needs a
  manifest that carries `spaceId` and simply omits the fields under test: that
  yields `title: ""` and `lastActivityAt: null` without moving the group.
- **Amending a test because a fallback changed its inputs can silently delete
  the coverage the test existed for.** When a plan sanctions amending an
  assertion, check what property the original was guarding and where that
  property now lives.
- **A bundle-grep guard must key on a string that a live code path evaluates,
  and the only proof that it does is grepping a built artefact.** A bare
  `export const MARKER = "…"` that nothing imports is tree-shaken out of the
  output, after which the grep passes cleanly over a bundle that does contain
  the thing being guarded against. Interpolate the marker into an
  always-reachable failure path, and verify against the built file rather than
  the source.
- **A quoted English string in an end-to-end assertion is the translated-text
  trap in its easiest disguise.** `toHaveText("1 session")` reads as a
  numeric-shape assertion and passes, yet breaks under a catalogue edit or the
  other locale — including in a file whose own header promises never to assert
  on translated text. Derive the expected string from the catalogue, and grep
  new specs for quoted English words, not only for obviously translated labels.
- **ESLint's `ignores` does not read `.gitignore`.** Every build output
  directory has to be named in both files, or `eslint .` lints a minified
  bundle and buries the real findings under hundreds of errors from generated
  code. Adding a build output is a two-file edit.
- **`CostTotals` carries no session count, so any "total sessions" figure in
  the UI is necessarily derived.** Summing the group session counts is correct
  only while every grouping is a partition; a filter, or a grouping that puts
  one session in two buckets, breaks it silently and nothing in the types says
  so.
- **A name-level static guard must know the project's own import aliases, and
  is only as good as its last negative control.** `read-only-guarantee.test.ts`
  matched `invoke(` literally while the code it guards imports
  `{ invoke as tauriInvoke }` — a write command called through the alias passed
  the guard clean. Five of six injected breakages were caught; the sixth was
  found only because the control was run rather than reasoned about. Any
  analyser keyed on an identifier has to resolve the binding, or it certifies
  exactly the idiom the codebase uses. Re-run the controls whenever the guarded
  code changes style.
- **`fs:allow-open` is a write-capable permission**: `commands::open` honours a
  caller-supplied `OpenOptions`, so the read-only property of US-1.6 lives in
  the call sites, not in the capability file. Never "simplify" the permission
  list to `fs:read-all` or `fs:default`.
- **The fs plugin's `FileHandle.read` returns `null` at EOF, not `0`** — a read
  loop that breaks on `0` hangs the app, one that breaks on `null` is correct.
  And `FileHandle.close()` goes through `plugin:resources|close`, not a
  `plugin:fs|*` command, so a capability listing only `fs:allow-*` is
  sufficient; there is no missing permission to "fix".
- **Check a plan's boundary values against the pure function that consumes
  them.** S7's plan had Rust populate `local_app_data`/`app_data` on macOS;
  followed literally, `rootCandidates()` would have emitted four macOS paths
  labelled `%LOCALAPPDATA%\…`. Returning `None` was right and the plan was
  wrong.
- **NFR-8 deviation bookkeeping lives in two files.** `CLAUDE.md`'s stack table
  and `REQUIREMENTS.md`'s NFR-8 list both enumerate deviations; updating only
  the first leaves them disagreeing. Edit both together.
- **Grep for leaked reference data case-insensitively.** A case-sensitive search
  for the reference tree's project names reports a clean repository while
  several committed documents contain them capitalised. Any privacy check over
  the tree needs `-i`, or it certifies the wrong answer.
- **Per-audit problems never reach the UI.** `buildReport` takes only the
  scan-wide collector and `SessionRow` carries no problems field, so everything
  `parseAuditLines` records — `malformed-line`, `missing-cost` — is dropped
  before the report. Plumbing it through needs `MAX_PROBLEMS_PER_SCOPE`'s flat
  global cap of 20 replaced by a per-scope cap first, or noisy sessions crowd
  out every scan-level problem.
- **A raw `U+0000` in a TypeScript source survives `tsc`, ESLint and Prettier
  unremarked.** Two shipped in one session — a NUL guard and a map-key
  separator — both semantically correct and both invisible in every editor and
  diff, one whitespace-normalising tool away from silently changing meaning.
  Write `\u0000`, and keep a scan for byte `0x00` over `src/`, `plugins/`,
  `scripts/`, `e2e/` and `test/`. One way such a byte gets in is the editing
  tools themselves: an escape sequence typed into a file-writing parameter can
  be decoded before it reaches disk, yielding a raw `0x00` rather than the six
  literal characters. Double-escape it, and let the byte scan settle which of
  the two actually landed.
- **The NUL-byte scan needs the right command, and it is not the obvious one.**
  `grep -rIl $'\0' …` is truncated by bash to `grep -rIl "" …`: it matches every
  text file and, because of `-I`, skips the one file that actually contains a
  NUL. `grep -rlP '\x00' …` fails too — without `-a`, grep classifies a
  NUL-containing file as binary and `-l` reports nothing. The working form is
  `grep -rlaP '\x00' src plugins scripts e2e test`, expecting no output; verify
  it against a synthetic NUL-containing file rather than trusting it. Compounding
  this, `grep` in this development shell is a bash function wrapping `ugrep` with
  `-I`, `--hidden` and `--exclude-dir` forced on, so any command relying on stock
  `grep` behaviour — especially binary-file handling — does something else.
  `command grep` bypasses the wrapper.
- **A spec that boots a Vite dev server needs `// @vitest-environment node`.**
  Under jsdom, esbuild aborts with `Invariant violation: "new
  TextEncoder().encode("") instanceof Uint8Array" is incorrectly false` —
  jsdom's `Uint8Array` belongs to a different realm than Node's.
- **Vite's `server.port: 0` means port 5173, not an ephemeral port**, because
  `0` is falsy and falls through to the default; and a dev server with no
  explicit `host` binds `::1` only, so Node's `fetch` to `127.0.0.1` gets
  `ECONNREFUSED`. Pass `host: "127.0.0.1"` and read the bound port from
  `server.httpServer.address()`.
- **Reference tree constants**: 1,413,585,188 integer micro-USD, 150 sessions,
  508 requests, 7 projects, 26 folder groups. Asserted in
  `src/model/reference-distribution.test.ts`. Pin them rather than re-deriving;
  the tree is gitignored and CI never sees it.
- **Vitest hides `console.log` from passing tests**: the default reporter
  swallows it, so anything logged "for a human to read" is invisible under
  `npm test` and `npm run regression`. Use `--reporter=verbose`, or assert it.
- **`display` in manifest folder entries is a path, not a label**: both
  `resolvedFolderKinds[].display` and object-form `userSelectedFolders[].display`
  hold a full path; only `name` is a bare label. Treating `display` as
  non-path-like collapses distinct folders onto a shared basename key and
  mis-attributes cost across projects.
- **Hand-built literals are not a substitute for a fixture** when the parser is
  the step that populates the field under test — pre-filling that field assumes
  away the only thing that can go wrong. If a plan names a fixture, ask what
  step it exercises before replacing it.
- **Build a test so the wrong implementation gives a different answer**: a zone
  test using instants at 00:30 UTC passes under any constant offset (use
  instants near local midnight straddling the jump); a comparator test that only
  checks tie-break stability at equal values misses a null verdict multiplied by
  the direction sign, which inverts "nulls last" on the descending pass.
- **`localeCompare` is the model layer's back door to i18n**: `src/model/` bans
  `src/i18n/` imports, but a bare `localeCompare` reaches host-locale collation
  anyway and makes ordering machine-dependent. Compare by code unit; inject a
  collator where real collation is needed.
