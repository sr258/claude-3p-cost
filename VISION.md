# Vision — Claude3PCost

> The app displays the cost of Claude Desktop third-party (3P)
> inference on the machine it runs on.

## The problem

Claude Desktop in the third-party configuration routes inference through a
provider such as Microsoft Foundry. Every completed request is billed, and the
client writes exactly what it cost into a local audit log. But nothing surfaces
that: there is no cost display in Claude Desktop, and the 3P provider's billing
portal — where one exists and where the user has access at all — reports at
tenant granularity, weeks late, with no idea which project or which session the
money went to.

The practical consequence is that people using Claude Desktop for real work have
no idea what their work costs until someone else tells them, and no way to
answer the questions that actually matter:

- Which project consumed the budget this month?
- Was that one long session worth 40 USD or 4 USD?
- Is the 1-million-token context variant paying for itself?
- Why did costs triple last week?

The information exists. It sits in `audit.jsonl`, line by line, exact, on the
user's own disk. It is simply unreadable.

## What we build

A small desktop application that reads those local logs and turns them into an
answer. It starts up, finds the Claude Desktop session directories by itself,
and shows what the last month cost — broken down by project, by session, by
model, by day. Expand a project to see its sessions; expand a session to see
where the money actually went.

It is offline by design. It reads files, it sends nothing. There is no account,
no server, no telemetry, no configuration required to see the first number.

## Principles

**Measured, not estimated.** The audit log contains the real per-request cost
the client computed. We report that number. Where we compute something ourselves
— a recomputation with the user's own prices, an approximate attribution of cost
to tool calls — we label it as such and never blend it silently into a measured
figure.

**Honest about gaps.** Aborted requests leave no cost record. Sessions can lack
a project assignment. We show those as what they are, visibly, rather than
producing a tidy total that quietly omits them. A cost report that hides its own
blind spots is worse than no report.

**Fast and local.** Opening the app and seeing the current month's total should
take a second or two, on a locked-down work laptop, over data that spans
hundreds of sessions.

**It installs.** The target machines are production Windows workstations without
administrator rights. An NSIS per-user installer and a portable executable that
runs from a copied folder — this is a hard requirement, not a nice-to-have, and
CalView has already proven the path.

**Nothing leaves the machine.** Session manifests contain system prompts,
project instructions, file paths and initial messages. The app reads them to do
its job and never writes them into an export, a log, or a crash report.

## Scope

**In scope.** Automatic discovery of local 3P session data; aggregation by
project, session, model and time; a date-range filter; per-session cost-driver
breakdown with charts; a price table, pre-filled with public list prices and
editable, for recomputing costs at the organisation's real rates; budget
thresholds with visual warnings; export to CSV and JSON; live update while
Claude Desktop is running; a German and an English interface.

**Out of scope.** Multi-user or team roll-ups — this is a single-user tool for
one machine. Any network communication, including price-list downloads or
provider-API queries. Modifying, deleting, or managing Claude Desktop sessions;
the app is strictly read-only against that data. Reconciliation against the
provider's invoice.

## Success

Someone finishes a week of work in Claude Desktop, opens Claude3PCost, and within
five seconds knows what the week cost and which project it went to — without
having asked anyone, installed anything as administrator, or sent a byte off
their laptop.

## Relationship to CalView

CalView is a proven Tauri v2 + Preact application by the same author, already
building and shipping for Windows through GitHub Actions from machines without
a Windows host. Claude3PCost deliberately follows its stack, project layout, build
configuration, release process and language conventions as closely as possible.
Deviations must be justified; the aim is to reuse a toolchain that is known to
work rather than to re-validate one.
