# Learnings

Persistent memory across sessions: things that are true of this project or this
development setup, are not obvious from the code, and cost somebody time. Every
agent reads this file before starting work. Only the session orchestrator writes
it, at the end of a session and with the user's approval.

Newest entry first.

---

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
