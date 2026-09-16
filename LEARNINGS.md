# Learnings

Persistent memory across sessions: things that are true of this project or this
development setup, are not obvious from the code, and cost somebody time. Every
agent reads this file before starting work. Only the session orchestrator writes
it, at the end of a session and with the user's approval.

Newest entry first.

---

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
