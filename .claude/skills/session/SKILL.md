---
name: session
description: Run one roadmap session of Claude3PCost end to end — plan it with an Opus subagent and the user, implement it with a Sonnet subagent, review it with an Opus subagent, then hand off. Use when the user says "start session S7", "next session", "implement S12", or otherwise asks to build the next piece of the roadmap.
---

# Running a roadmap session

One session from `ROADMAP.md`, taken from nothing to reviewed, working, committed
code. You are the **orchestrator**: you spawn the subagents, you talk to the user,
you decide when a phase is finished. You do not write the implementation
yourself.

```
Phase 0  Orient        you          pick the session, load the context
Phase 1  Plan          Opus + user  refine, sketch, decide, confirm, write the plan
Phase 2  Implement     Sonnet       build exactly the plan
Phase 3  Review        Opus         fix what is critical, report the rest
Phase 4  Hand off      you          check the evidence, update the roadmap, propose learnings, report, commit
```

## Who runs what

| Role | Model | Why |
|------|-------|-----|
| Orchestrator (you) | **Opus** | Judges plan quality, triages the implementer's objections, decides when to split a session, and judges whether the reviewer's evidence really shows the session is done |
| Planner (Phase 1) | Opus | Design, requirements reasoning, and the decisions the requirements do not make |
| Implementer (Phase 2) | Sonnet | Executes an approved plan against explicit acceptance criteria |
| Reviewer (Phase 3) | Opus | Finds the plausible-looking-but-wrong, which is the expensive class of bug here |

The orchestrator is the main session, so its model is whatever `/model` is set to
— set it to Opus before starting a session. It cannot be changed partway through,
because the orchestrator is one continuous conversation across all four phases.

The temptation is to run the orchestrator cheap, since relaying looks mechanical.
It is not: the orchestrator is the only party that sees the whole arc *and* talks
to the user, and a weak one degrades into forwarding subagent claims unchecked.
Reading the reviewer's evidence critically — does the pasted output actually
cover the exit commands, does it actually pass — is judgement work, not
secretarial work. Token cost is modest anyway, since the bulky tool output stays
inside the subagents; the orchestrator only holds the conversation and their
reports.

## The one rule that shapes everything

**Subagents cannot talk to the user. You can.** A subagent's report is not shown
to the user; it comes back to you. So every question a subagent needs answered,
every sketch it wants judged, every decision it cannot make alone comes back to
*you* as a structured request, and *you* put it to the user with
`AskUserQuestion`, and *you* send the answers back down with `SendMessage`.

Never claim a subagent asked the user something. Never invent an answer on the
user's behalf. Never report a subagent's result before it has actually returned —
if the user asks while one is running, say it is still running.

---

## Phase 0 — Orient

1. Determine which session. If the user named one (`S7`, "the parser session"),
   use it. If they said "next", read `ROADMAP.md`, find the lowest-numbered
   session not yet marked done, and **confirm it with the user before starting** —
   along with its dependencies, so they can see whether the prerequisites really
   are in place.
2. Read `ROADMAP.md` (the session entry and its dependencies), `CLAUDE.md`,
   `LEARNINGS.md`, and the acceptance criteria in `REQUIREMENTS.md` for every
   story the session covers. Skim `VISION.md` if the session involves a product
   judgement call. If an entry in `LEARNINGS.md` bears on this session, say so
   when you confirm the session with the user.
3. Check the tree is green before touching it: `npm test`, `npm run build`, and
   from S8 onward `npm run test:e2e`. **A session does not start on a red tree.**
   If it is red, stop and tell the user what is broken.
4. Confirm the session's dependencies are genuinely done, not just marked done.

---

## Phase 1 — Plan (Opus subagent, in dialogue with the user)

Spawn a planning agent:

```
Agent(subagent_type: "general-purpose", model: "opus",
      description: "Plan session S<N>")
```

Its brief must include: the session number and its full `ROADMAP.md` entry; the
verbatim acceptance criteria of every story in scope; the relevant parts of
`CLAUDE.md` (architecture rules, stack, naming, language conventions); the
instruction to read `LEARNINGS.md` first and to say in its report which entries
shaped the plan; and this
instruction — **produce a draft plan plus the questions you need answered; do not
write any file yet; do not write production code.**

The planner returns, in one report:

- **Open questions** — anything it cannot decide alone. Library choices, default
  values, behaviour the requirements leave ambiguous, a trap in the data that
  changes the design. Each with the planner's own recommendation and reasoning,
  because a question without a recommendation just pushes the work to the user.
- **UI sketches** — for any session that touches the interface, ASCII mockups of
  the screen or component, at least two genuinely different options where the
  layout is a real choice. These go straight into `AskUserQuestion` previews, so
  they must be readable in a monospace box.
- **The draft plan** — files to create or change; types and function signatures
  at the layer boundaries; which acceptance criteria this session satisfies and
  which it explicitly defers; the tests to write, by name; the exact commands
  that prove the session is done.

### The dialogue loop

1. Put the planner's questions to the user with `AskUserQuestion`. Use the
   `preview` field for UI sketches so the user can compare layouts side by side.
   Lead with the planner's recommended option and mark it `(Recommended)`.
2. Send the answers back with `SendMessage` to the same planner, so it keeps its
   context. Do not spawn a fresh planner — it would start cold and re-derive
   everything.
3. Repeat if the answers open new questions. Two rounds is normal; more than
   three means the session is underspecified and you should say so.

Do not batch a decision the user has not seen into the plan. If the planner
picked a charting library or a set of default prices, that is a decision the user
sees and confirms, not a detail buried in a file.

### Confirming and writing the plan

Present the final plan to the user yourself, as a **short** summary: what gets
built, which acceptance criteria it satisfies, which it defers, what the decided
questions were decided as, and how it will be verified. Not the whole file — the
summary they need to say yes or no to.

On approval, have the planner write the plan to
`docs/plans/S<N>-<short-slug>.md`. It is a committed artifact: Phase 2 works from
it, Phase 3 reviews against it, and it records why the session looks the way it
does.

If the user rejects or substantially changes the plan, `SendMessage` the
feedback to the planner and go round again. Do not start Phase 2 on a plan the
user has not approved.

---

## Phase 2 — Implement (Sonnet subagent)

```
Agent(subagent_type: "general-purpose", model: "sonnet",
      description: "Implement session S<N>")
```

Its brief: the path to the approved plan file, the paths to `CLAUDE.md`,
`REQUIREMENTS.md` and `LEARNINGS.md`, and these standing instructions —

- **Read `LEARNINGS.md` before writing anything.** It exists so you do not spend
  the session rediscovering a trap somebody already hit.
- Follow the plan. Write the tests alongside the code, not after.
- **Do not expand scope.** Nothing outside the plan's file list gets touched
  without coming back to the orchestrator first.
- If the plan turns out to be wrong — a trap in the data, a library that does not
  fit, an acceptance criterion that cannot be met as designed — **stop and report
  it.** Do not improvise a different design.
- Run the plan's exit commands. Report their actual output, pass or fail.
- If you learn something that would have saved you time had you known it at the
  start — a tool that misbehaves here, a trap the plan did not anticipate —
  report it under a **Learnings** heading. Do not edit `LEARNINGS.md` yourself.
- Obey `CLAUDE.md` without exception: pure functions in `src/model/`, I/O only in
  `src/services/`, no hardcoded user-facing strings, read-only against session
  data, failures collected rather than thrown.

If the implementer reports the plan was wrong, do not paper over it. Take the
problem back to the planner (`SendMessage`) or to the user, depending on whether
it is a design question or a requirements question. A plan that met reality and
lost is useful information, not a failure.

---

## Phase 3 — Review (Opus subagent)

```
Agent(subagent_type: "general-purpose", model: "opus",
      description: "Review session S<N>")
```

Its brief: the plan file, the diff or list of changed files, the acceptance
criteria in scope, `CLAUDE.md`, and `LEARNINGS.md`. What to check, in this
order:

1. **Acceptance criteria.** Each one in scope: met, not met, or partially met —
   with the evidence. This is the primary job.
2. **Correctness.** Especially the traps named in `ROADMAP.md` and `MAP.md` §4.
   Session-ID truncation, `assistant` `output_tokens`, micro-USD rounding,
   request-level date filtering, partial final lines. These are where plausible
   code is wrong.
3. **Architecture.** Layer violations, state outside `app-state.ts`, I/O in
   `src/model/`, hardcoded strings, anything that writes to a session directory.
4. **Tests.** Do they actually test the behaviour, or do they assert that the
   code does what it does? Would the privacy test fail if privacy broke?
5. **Scope.** Anything built that the plan did not call for.

**The reviewer fixes critical issues itself** — a failing acceptance criterion, a
correctness bug, a layer violation, a test that cannot fail, anything that writes
to session data or leaks sensitive content.

**The reviewer owns the mechanical verification.** After its fixes it runs the
full exit set — `npm test`, `npm run build`, `npm run lint`, `npm run
format:check`, and from S8 onward `npm run test:e2e` — as the last thing it does,
on the final state of the tree, and **pastes each command's actual tail output
into its report**. A summary ("all green") is not evidence; send it back for the
real output. You do not re-run these yourself — that is the point of having an
Opus reviewer.

**Everything else it reports, and does not touch**: style preferences,
refactoring opportunities, ideas for later sessions, anything that would expand
scope. Those come to you, and you relay them to the user as a short list.

It also reports, under a **Learnings** heading, anything future sessions should
know that is not already in `LEARNINGS.md` — including anything the implementer
reported as a learning that it can confirm. It does not edit `LEARNINGS.md`
itself.

If the reviewer finds so much wrong that fixing it means redesigning, it stops
and says so. That is a Phase 1 problem, not a Phase 3 one.

---

## Phase 4 — Hand off

1. **Check the reviewer's evidence — do not re-run the suite.** The reviewer ran
   the exit commands on the final tree and pasted the output; your job is to read
   it, not to repeat it. Satisfy yourself that every exit command is actually
   covered, that the output is from *after* the last fix, and that nothing is a
   claim with no output behind it. If any of that is missing or ambiguous,
   `SendMessage` the reviewer and make it produce the real output — only if it
   cannot (it has ended, or its report contradicts itself) do you run the
   commands yourself. If anything is red, the session is not finished.
2. **Mark the session done** in `ROADMAP.md`, with the date.
3. **Propose learnings** — see "Writing `LEARNINGS.md`" below. Put the draft
   entries to the user in the same message as your report.
4. **Report to the user**, briefly and honestly: what was built; which acceptance
   criteria are met and which were deliberately deferred; what the reviewer fixed;
   what the reviewer flagged for them to decide; anything that turned out
   differently from the plan and why. If tests fail, say so and show the output —
   never report a session complete that is not.
5. **Write the approved learnings** into `LEARNINGS.md` yourself, once the user
   has approved or edited them.
6. **Commit** only if the user asks, or has said to commit sessions as they land.
   Branch first if on the default branch. Include the session number and the
   stories in the message, and include the `LEARNINGS.md` change.
7. **Note what the next session inherits** — a decision made here that constrains
   it, a deferred criterion it must pick up.

---

## Writing `LEARNINGS.md`

`LEARNINGS.md` is persistent memory across sessions, so that a trap somebody
already walked into costs one session rather than every session. Every agent
reads it; **you are the only one who writes it.** An implementer or reviewer that
learns something reports it upward under a **Learnings** heading, so every entry
passes a human before it lands.

At the end of Phase 4, collect what the implementer and reviewer reported, plus
anything you saw from the orchestrator seat — a phase that went wrong for a
reason worth remembering. Then filter hard.

**An entry earns its place** if it is true of this project or this development
setup, is not obvious from the code, and cost somebody time:

- a tool, command or flag that behaves differently here than expected
- a build, test or CI failure whose cause was not what the message said
- a data trap in the reference material that a plausible implementation misses
- a convention we decided on and would otherwise re-litigate
- a dead end: something tried, and why it did not work

**Drop it** if it is already in `LEARNINGS.md`, `CLAUDE.md`, `MAP.md`,
`REQUIREMENTS.md`, `ROADMAP.md` or a session plan — link to that instead of
copying it; if it merely describes what the code does; or if it is session
narrative ("S6 was hard") with no reusable lesson. Propose nothing if nothing
survives: a padded learnings list is worse than an empty one.

Put the survivors to the user as draft entries, written out in full, and write
the approved ones yourself. One heading per learning, newest first, phrased as
the lesson rather than the incident, followed by the evidence and what to do
about it; note the session it came from. Correct or delete an entry that turns
out to be wrong — a stale learning is worse than none.

**Nothing sensitive goes in it.** The privacy rules in `CLAUDE.md` apply in full:
no prompt text, no response text, no project instructions, no absolute paths out
of `reference-material/`.

---

## Sizing

The roadmap's rules still apply, and you enforce them: one vertical concern per
session, roughly 3–6 production files plus tests, never a new layer and a new
dependency at once, exit criteria checkable by running a command.

If planning reveals a session is too big — `ROADMAP.md` flags S8 as the likely
case — **split it and tell the user**, rather than running a session that
overruns. Two clean sessions beat one that sprawls. Update `ROADMAP.md` to record
the split.

## When a session needs a decision the requirements do not make

Make it in Phase 1, in writing, with the user, as a named deliverable — S15's
default prices, S18's charting library. Never let it get decided implicitly by
whichever line of code got written first, and never let it surface for the first
time in Phase 3.
