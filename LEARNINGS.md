# Learnings

Persistent memory across sessions: things that are true of this project or this
development setup, are not obvious from the code, and cost somebody time. Every
agent reads this file before starting work. Only the session orchestrator writes
it, at the end of a session and with the user's approval.

Newest entry first.

---

## Reference tree constants (S5)

- 1,413,585,188 integer micro-USD, 150 sessions, 508 requests, 7 projects,
  26 folder groups. All asserted in `src/model/reference-distribution.test.ts`.
- Pin these rather than re-deriving them; the tree is gitignored and CI never
  sees it.

## Vitest hides `console.log` from passing tests (S5)

- The default reporter swallows it, so anything logged "for a human to read" is
  invisible under `npm test` and `npm run regression`.
- Use `npx vitest run <spec> --reporter=verbose`, or assert the value instead.

## `display` in manifest folder entries is a path, not a label (S5)

- Both `resolvedFolderKinds[].display` and object-form
  `userSelectedFolders[].display` hold a full path. Only `name` is a bare label.
- Treating `display` as non-path-like collapses distinct folders onto a shared
  basename key and mis-attributes cost across projects.

## Hand-built literals are not a substitute for a fixture (S5)

- Not when the parser is the step that populates the field under test —
  pre-filling that field assumes away the only thing that can go wrong.
- If a plan names a fixture, ask what step it exercises before replacing it.

## Build a test so the wrong implementation gives a different answer (S5)

- A zone test using instants at 00:30 UTC passes under any constant offset; use
  instants near local midnight straddling the jump, and assert the wrong answers
  a captured-once offset would give.
- A comparator test that only checks tie-break stability at equal values misses
  a null verdict multiplied by the direction sign, which inverts "nulls last"
  into "nulls first" on the descending pass. Test both directions, asymmetric.

## `localeCompare` is the model layer's back door to i18n (S5)

- `src/model/` bans `src/i18n/` imports, but a bare `localeCompare` reaches
  host-locale collation anyway and makes ordering machine-dependent.
- Compare by code unit; where real collation is needed, inject a collator.
