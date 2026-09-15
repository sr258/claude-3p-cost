# Map of What We Have

Status of the working directory before implementation starts. Three of the four
top-level directories are **inputs**, not part of the product; only the
documentation at the root (and later `src/`, `src-tauri/`) belongs to Claude3PCost.

| Directory | Role | In Git? |
|-----------|------|---------|
| `poc/` | Working proof of concept (Python) for the whole analysis | No (`.gitignore`) |
| `reference-material/` | Copied Claude Desktop 3P session data from a Windows machine | No (`.gitignore`) |
| `calview/` | Separate, proven Tauri app — the template for stack and build | No (own repository) |
| root `*.md` | This document set | Yes |

---

## 1. `poc/` — the proven analysis

`cowork_costs.py` (674 lines, Python 3, no dependencies) is a complete,
working implementation of the analysis. It was run against `reference-material/`
during this inventory and produced a plausible, complete result:

```
Projekt                Sess  Anfr  Kosten USD   Cache-Read      Dauer
Finanztool               73   277      778.64  348.302.574   19:28:03
(ohne Projekt)           49   144      282.93  161.634.165    5:28:12
Jira-Nachfolge           15    30      179.75   58.466.421    5:27:54
Feedback-Tool             6    11       78.73   35.988.305    1:27:27
H5P-Ersatz                2    10       63.46    9.238.594    0:51:52
ByCS-Planung              3    21       16.51    7.058.563    1:03:27
e-Akte                    2    15       13.56    8.706.966    0:17:24
Summe                                 1413.58
```

That printed total is the POC's, verbatim, and it is four hundredths of a cent
low: `summarize()` rounds each session to four decimals before summing
(1413.5848), while the exact sum of `total_cost_usd` is 1413.5852, i.e.
**1,413.59**. Verified during S3. The app accumulates in integer micro-USD and
reports the exact figure, so it is expected to disagree with this transcript by
one cent. The POC is the specification for parsing, not for rounding.

**The POC is the specification for the parsing logic.** Every hard-won detail in
it (see §4) must survive the port to TypeScript.

| File | Content |
|------|---------|
| `cowork_costs.py` | The analysis: discovery, parsing, aggregation, text/JSON/HTML output |
| `cowork_costs.html` | Generated HTML report — a visual reference for the app UI (HTML export itself is out of scope) |
| `inspect_manifest.py` | Schema-survey tool that produced `manifest-bericht.txt` |
| `manifest-bericht.txt` | Field inventory over 124 manifests — which fields exist, how often, with what values |
| `audit_0.jsonl`, `audit_1.jsonl` | Two extracted audit logs for quick testing |
| `projekte.json` | Example manual session→project mapping |

---

## 2. `reference-material/` — real 3P data

3,941 files copied from `C:\Users\<user>\AppData\Local\Claude-3p\`. This is the
**only** test data we have, because the Claude Desktop on the development
machine runs against first-party Anthropic APIs and therefore produces no
comparable `provider: "foundry"` records.

```
reference-material/
├── files.txt                          # UTF-16 listing of the original Windows tree
├── local-agent-mode-sessions/         # Cowork sessions — 150 audit.jsonl, the payload
│   └── 51706615/                      # account id
│       └── 00000000/                  # profile id
│           ├── spaces.json            # project (Space) definitions
│           ├── cowork_account_settings.json
│           ├── local_<uuid>.json      # 152 session manifests
│           └── <8-hex>/               # one directory per session
│               ├── audit.jsonl        # ← the billing record
│               └── .claude/, outputs/, uploads/ …
└── claude-code-sessions/              # manifests only, no audit.jsonl in this sample
```

Scale of the sample: 150 audit logs, ~37,000 JSONL lines, 508 `result` records,
150 sessions across 7 Spaces, 1,413.59 USD (the POC prints 1,413.58 — see below).

---

## 3. `calview/` — the tech-stack template

A CalDAV calendar viewer by the same author, already shipping on Windows. We
copy its setup as closely as possible to avoid re-testing the toolchain.

**Stack:** Preact + Preact Signals, TypeScript (strict, ES2022), Vite, plain CSS
with custom properties, Vitest + jsdom, Tauri v2, npm, GitHub Actions.

**What we reuse directly:**

| Artifact | Why it matters |
|----------|----------------|
| `.github/workflows/ci.yml` | Test on Ubuntu, then build Windows (NSIS + portable) and Linux |
| `.github/workflows/release.yml` | Tag `v*.*.*` → version check → build → draft GitHub release |
| `CROSS_COMPILE.md` | Complete recipe for building a Windows `.exe` from Linux via `cargo-xwin` |
| `src-tauri/tauri.conf.json` | NSIS `installMode: currentUser` — **installs without admin rights** |
| `src-tauri/capabilities/default.json` | Tauri v2 capability pattern |
| `plugins/vite-plugin-licenses.ts` | Generates the third-party license list for the About dialog |
| `AGENTS.md` | Structure and tone for our `CLAUDE.md` |
| Architecture patterns | Signals for state, pure testable functions in `model/`, thin components |

**What we do *not* need:** CalDAV/iCal/XML parsing, HTTP plugin, the Vite dev
proxy, keyring credential storage, Outlook COM automation. Claude3PCost is
offline and reads local files only.

**What is new for us:** filesystem access from the Tauri backend
(`tauri-plugin-fs`) and directory watching; a charting library; a German/English
translation layer (CalView is German-only); Playwright end-to-end tests; and a
Vite dev middleware that serves `reference-material/` so `npm run dev` works
against real data in a plain browser.

---

## 4. Data model — what the logs actually contain

Findings from the POC, re-verified against `reference-material/` during this
inventory.

### Discovery roots

| Platform | Path |
|----------|------|
| Windows, 3P build | `%LOCALAPPDATA%\Claude-3p\local-agent-mode-sessions` |
| Windows, 3P build | `%LOCALAPPDATA%\Claude-3p\claude-code-sessions` |
| Windows, 1P build | `%APPDATA%\Claude\local-agent-mode-sessions` |
| macOS | `~/Library/Application Support/Claude/local-agent-mode-sessions` |

### `audit.jsonl` — one line per event, append-only

Line types observed in the sample (`type` / `subtype`):

| Count | Type | Relevance |
|------:|------|-----------|
| 11,421 | `assistant` | Per-API-request input/cache tokens; **output tokens are unusable** |
| 8,858 | `user` | Prompts and tool results |
| 4,707 | `system/status` | — |
| 2,646 | `system/thinking_tokens` | — |
| 1,639 | `command_lifecycle` | `queued` 553 / `started` 550 / `completed` 536 |
| 520 | `system/init` | `cwd`, `model` at session start |
| **508** | **`result/success`** | **The billing record — authoritative cost** |
| 381 | `tool_progress` | — |

A `result` line carries `total_cost_usd`, `duration_ms`, `num_turns`,
`is_error`, a full `usage` block (input, output, `output_tokens_details.
thinking_tokens`, `cache_creation_input_tokens` split into `ephemeral_1h`/
`ephemeral_5m`, `cache_read_input_tokens`, `server_tool_use.web_search_requests`
/ `web_fetch_requests`), a per-model `modelUsage` map (`costUSD`, token counts,
`provider`, `costBasis`, `contextWindow`), and `subagent_stats`.

Every line additionally carries `_audit_timestamp` and `_audit_hmac`.

### Traps, verified

1. **`output_tokens` on `assistant` lines is worthless.** It is the snapshot
   from `message_start` (1–3 tokens). Measured: 1,661 instead of 152,004. Input
   and cache tokens on those lines *are* exact after deduplication by
   `request_id`. Use `result` lines for anything billable.
2. **Session-ID truncation.** The manifest's `sessionId` is
   `local_023dbcc7-5727-…`, but the session directory is named just `023dbcc7`.
   Matching requires stripping the `local_` prefix *and* taking the first
   hyphen-separated segment.
3. **Aborted requests have no `result` line.** 550 started vs. 536 completed in
   the sample — 14 requests whose cost is simply absent. Must be reported, not
   silently dropped.
4. **Sessions without `spaceId`.** 92 of 124 manifests have one; the rest are
   unassigned and belong in an explicit "(ohne Projekt)" bucket, matching what
   Cowork itself shows.
5. **Encoding.** JSON files appear as UTF-8, UTF-8-BOM and UTF-16 — all three
   must be handled. Paths contain umlauts and backslashes.
6. **`spaces.json` schema is not stable.** The POC reads it tolerantly (list or
   map; id under `id`/`uuid`/`spaceId`, name under `name`/`title`/`label`).

### Cost basis — the open commercial point

In all 509 `modelUsage` entries in the sample:

```
"provider": "foundry"     509x
"costBasis": "list"       304x
```

So `total_cost_usd` is **Anthropic's public list price**, computed locally by
the client — not necessarily what the organisation is billed by Microsoft
Foundry. This is why the app needs an optional, user-editable price table
(see requirements UC-4).

Models seen: `claude-opus-5[1m]`, `claude-opus-5`, `claude-sonnet-5`,
`claude-fable-5[1m]`, `claude-opus-4-7`, `claude-sonnet-4-6`,
`claude-sonnet-5[1m]`, `claude-haiku-4-5`. The `[1m]` suffix marks the
1-million-token context variant, which is priced differently — the price table
must key on the exact string.

### `local_<uuid>.json` — session manifest

37 distinct fields; the ones we use: `sessionId`, `cliSessionId`, `cwd`,
`title`, `spaceId`, `spaceIdSetBy`, `model`, `createdAt`/`lastActivityAt`
(epoch ms), `isArchived`, `isStarred`, `userSelectedFolders`,
`resolvedFolderKinds` (`display` + `kind`: `local` / `network-drive`),
`emailAddress`. Full inventory in `poc/manifest-bericht.txt`.

Manifests also contain `systemPrompt` and `initialMessage` — potentially
sensitive content the app must never export.

### `spaces.json` — the project names

`{"spaces": [{"id", "name", "folders": [{"path"}], "projects", "links",
"instructions", "origin", "createdAt", "updatedAt"}]}`. The `instructions`
field holds free-text project instructions — again, never export.

---

## 5. What is not yet decided

- Where the price table's initial values come from (shipped default vs. empty).
- Whether `claude-code-sessions` ever contains `audit.jsonl` on a real machine;
  our sample has none, so that path is untested.
