# Learnings

Persistent memory across sessions: things that are true of this project or this
development setup, are not obvious from the code, and cost somebody time. Every
agent reads this file before starting work. Only the session orchestrator writes
it, at the end of a session and with the user's approval.

Newest entry first.

---

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
  Write `\u0000`, and keep a scan for byte `0x00` over `src/`, `plugins/` and
  `test/`.
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
