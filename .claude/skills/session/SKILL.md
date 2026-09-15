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
Phase 4  Hand off      you          verify green, update the roadmap, report, commit
```

## Who runs what

| Role | Model | Why |
|------|-------|-----|
| Orchestrator (you) | **Opus** | Judges plan quality, triages the implementer's objections, decides when to split a session, and verifies green first-hand |
| Planner (Phase 1) | Opus | Design, requirements reasoning, and the decisions the requirements do not make |
| Implementer (Phase 2) | Sonnet | Executes an approved plan against explicit acceptance criteria |
| Reviewer (Phase 3) | Opus | Finds the plausible-looking-but-wrong, which is the expensive class of bug here |

The orchestrator is the main session, so its model is whatever `/model` is set to
— set it to Opus before starting a session. It cannot be changed partway through,
because the orchestrator is one continuous conversation across all four phases.

The temptation is to run the orchestrator cheap, since relaying looks mechanical.
It is not: the orchestrator is the only party that sees the whole arc *and* talks
to the user, and a weak one degrades into forwarding subagent claims unchecked —
which is precisely what Phase 4's "run the commands yourself" exists to prevent.
Token cost is modest anyway, since the bulky tool output stays inside the
subagents; the orchestrator only holds the conversation and their reports.

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
2. Read `ROADMAP.md` (the session entry and its dependencies), `CLAUDE.md`, and
   the acceptance criteria in `REQUIREMENTS.md` for every story the session
   covers. Skim `VISION.md` if the session involves a product judgement call.
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
`CLAUDE.md` (architecture rules, stack, naming, language conventions); and this
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

Its brief: the path to the approved plan file, the paths to `CLAUDE.md` and
`REQUIREMENTS.md`, and these standing instructions —

- Follow the plan. Write the tests alongside the code, not after.
- **Do not expand scope.** Nothing outside the plan's file list gets touched
  without coming back to the orchestrator first.
- If the plan turns out to be wrong — a trap in the data, a library that does not
  fit, an acceptance criterion that cannot be met as designed — **stop and report
  it.** Do not improvise a different design.
- Run the plan's exit commands. Report their actual output, pass or fail.
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
criteria in scope, and `CLAUDE.md`. What to check, in this order:

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
to session data or leaks sensitive content. After fixing, it re-runs the exit
commands.

**Everything else it reports, and does not touch**: style preferences,
refactoring opportunities, ideas for later sessions, anything that would expand
scope. Those come to you, and you relay them to the user as a short list.

If the reviewer finds so much wrong that fixing it means redesigning, it stops
and says so. That is a Phase 1 problem, not a Phase 3 one.

---

## Phase 4 — Hand off

1. **Verify green yourself.** Run `npm test`, `npm run build`, and from S8 onward
   `npm run test:e2e`. Do not take the subagents' word for it — run the commands
   and read the output. If anything is red, the session is not finished.
2. **Mark the session done** in `ROADMAP.md`, with the date.
3. **Report to the user**, briefly and honestly: what was built; which acceptance
   criteria are met and which were deliberately deferred; what the reviewer fixed;
   what the reviewer flagged for them to decide; anything that turned out
   differently from the plan and why. If tests fail, say so and show the output —
   never report a session complete that is not.
4. **Commit** only if the user asks, or has said to commit sessions as they land.
   Branch first if on the default branch. Include the session number and the
   stories in the message.
5. **Note what the next session inherits** — a decision made here that constrains
   it, a deferred criterion it must pick up.

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
