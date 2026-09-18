/**
 * The three fixture trees the Playwright specs drive (S8 plan §6.10). Every
 * value is invented — nothing copied, quoted or paraphrased from the
 * reference tree, which is not in Git and never will be (plan §0.4).
 */
import type { FakeTree } from "../support/fake-tauri-plugin.js";

const HOST_ENVIRONMENT = Object.freeze({
  platform: "windows" as const,
  localAppData: "C:/Users/e2e/AppData/Local",
  appData: "C:/Users/e2e/AppData/Roaming",
  home: null,
});

/** Candidate roots that do not exist: zero directories, zero files. */
export const emptyTree: FakeTree = Object.freeze({
  directories: Object.freeze([]),
  files: Object.freeze({}),
  hostEnvironment: HOST_ENVIRONMENT,
});

const SMOKE_ROOT = "C:/Users/e2e/AppData/Local/Claude-3p/local-agent-mode-sessions";
const SMOKE_SESSION = `${SMOKE_ROOT}/acct-1/profile-1/sess-smoke`;

/**
 * One session with a multi-line `audit.jsonl`, read through the fake
 * `FileHandle` in chunks smaller than the file — the read loop only
 * terminates correctly if the fake returns `null` at EOF, never `0`
 * (LEARNINGS; plan §0.3 item 1, §7.2's named harness test).
 */
/** The single result line in `smokeTree`'s audit log. */
export const SMOKE_TOTAL_USD = 4.2;

export const smokeTree: FakeTree = Object.freeze({
  directories: Object.freeze([]),
  files: Object.freeze({
    [`${SMOKE_SESSION}/audit.jsonl`]: [
      '{"type":"system","subtype":"init","model":"claude-sonnet-5"}',
      '{"type":"command_lifecycle","state":"queued"}',
      '{"type":"command_lifecycle","state":"started"}',
      '{"type":"result","timestamp":"2026-02-01T08:00:00.000Z","total_cost_usd":4.20,"duration_ms":5000,"duration_api_ms":4500,"num_turns":1,"is_error":false,"session_id":"sess-smoke-full-uuid"}',
      '{"type":"command_lifecycle","state":"completed"}',
      "",
    ].join("\n"),
  }),
  hostEnvironment: HOST_ENVIRONMENT,
});

const OVERVIEW_ROOT = "C:/Users/e2e/AppData/Local/Claude-3p/local-agent-mode-sessions";
const OVERVIEW_PROFILE = `${OVERVIEW_ROOT}/acct-1/profile-1`;

function resultLine(fields: {
  readonly timestamp: string;
  readonly totalCostUsd: number;
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly numTurns: number;
  readonly sessionId: string;
  readonly modelUsage?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    type: "result",
    timestamp: fields.timestamp,
    total_cost_usd: fields.totalCostUsd,
    duration_ms: fields.durationMs,
    duration_api_ms: fields.durationApiMs,
    num_turns: fields.numTurns,
    is_error: false,
    session_id: fields.sessionId,
    ...(fields.modelUsage ? { modelUsage: fields.modelUsage } : {}),
  });
}

// Highest-cost group: above 1000 USD with non-zero cents, so a wrong locale
// format or a wrong sort order gives a visibly different answer (plan §0.3
// item 5). Carries a model-variant suffix alongside its base model (the
// "[1m]" suffix is never normalised away, MAP.md) and one aborted request —
// a `command_lifecycle` "started" with no matching "completed"/result.
const NEBULA_AUDIT = [
  '{"type":"system","subtype":"init","model":"claude-opus-5"}',
  '{"type":"command_lifecycle","state":"queued"}',
  '{"type":"command_lifecycle","state":"started"}', // aborted: no matching completed
  '{"type":"command_lifecycle","state":"queued"}',
  '{"type":"command_lifecycle","state":"started"}',
  resultLine({
    timestamp: "2026-01-01T09:00:00.000Z",
    totalCostUsd: 1234.56,
    durationMs: 120_000,
    durationApiMs: 110_000,
    numTurns: 5,
    sessionId: "nebula01-full-uuid",
    modelUsage: {
      "claude-opus-5": { costUSD: 600.0, inputTokens: 5000, outputTokens: 9000 },
      "claude-opus-5[1m]": { costUSD: 634.56, inputTokens: 5000, outputTokens: 11000 },
    },
  }),
  '{"type":"command_lifecycle","state":"completed"}',
  "",
].join("\n");

const QUARTZ_AUDIT = [
  '{"type":"system","subtype":"init","model":"claude-sonnet-5"}',
  '{"type":"command_lifecycle","state":"queued"}',
  '{"type":"command_lifecycle","state":"started"}',
  resultLine({
    timestamp: "2026-01-02T09:00:00.000Z",
    totalCostUsd: 300.1,
    durationMs: 30_000,
    durationApiMs: 28_000,
    numTurns: 2,
    sessionId: "quartz02-full-uuid",
  }),
  '{"type":"command_lifecycle","state":"completed"}',
  "",
].join("\n");

const GHOST_AUDIT = [
  '{"type":"system","subtype":"init","model":"claude-sonnet-5"}',
  '{"type":"command_lifecycle","state":"queued"}',
  '{"type":"command_lifecycle","state":"started"}',
  resultLine({
    timestamp: "2026-01-03T09:00:00.000Z",
    totalCostUsd: 50.25,
    durationMs: 8_000,
    durationApiMs: 7_500,
    numTurns: 1,
    sessionId: "ghost03-full-uuid",
  }),
  '{"type":"command_lifecycle","state":"completed"}',
  "",
].join("\n");

const NOPROJ_AUDIT = [
  '{"type":"system","subtype":"init","model":"claude-sonnet-5"}',
  '{"type":"command_lifecycle","state":"queued"}',
  '{"type":"command_lifecycle","state":"started"}',
  resultLine({
    timestamp: "2026-01-04T09:00:00.000Z",
    totalCostUsd: 10.0,
    durationMs: 2_000,
    durationApiMs: 1_800,
    numTurns: 1,
    sessionId: "noproj04-full-uuid",
  }),
  '{"type":"command_lifecycle","state":"completed"}',
  "",
].join("\n");

/** The exact sum of the four sessions below: 1234.56 + 300.10 + 50.25 + 10.00. */
export const OVERVIEW_TOTAL_USD = 1594.91;

/**
 * Four project buckets (plan §6.10): two named spaces ("Nebula Launch",
 * "Quartz Program"), one session whose manifest names a `spaceId` absent
 * from `spaces.json` (unknown), and one session with no manifest at all
 * (none). Cost descending: nebula > quartz > ghost (unknown) > noproj (none).
 */
export const overviewTree: FakeTree = Object.freeze({
  directories: Object.freeze([]),
  files: Object.freeze({
    [`${OVERVIEW_PROFILE}/spaces.json`]: JSON.stringify([
      { id: "space-nebula", name: "Nebula Launch" },
      { id: "space-quartz", name: "Quartz Program" },
    ]),
    [`${OVERVIEW_PROFILE}/local_nebula01-manifest-uuid.json`]: JSON.stringify({
      title: "Nebula kickoff",
      spaceId: "space-nebula",
      model: "claude-opus-5",
    }),
    [`${OVERVIEW_PROFILE}/local_quartz02-manifest-uuid.json`]: JSON.stringify({
      title: "Quartz sync",
      spaceId: "space-quartz",
      model: "claude-sonnet-5",
    }),
    [`${OVERVIEW_PROFILE}/local_ghost03-manifest-uuid.json`]: JSON.stringify({
      title: "Ghost project",
      spaceId: "ghost-space-unknown",
      model: "claude-sonnet-5",
    }),
    // noproj04 has no manifest at all — ProjectRef "none".
    [`${OVERVIEW_PROFILE}/nebula01/audit.jsonl`]: NEBULA_AUDIT,
    [`${OVERVIEW_PROFILE}/quartz02/audit.jsonl`]: QUARTZ_AUDIT,
    [`${OVERVIEW_PROFILE}/ghost03/audit.jsonl`]: GHOST_AUDIT,
    [`${OVERVIEW_PROFILE}/noproj04/audit.jsonl`]: NOPROJ_AUDIT,
  }),
  hostEnvironment: HOST_ENVIRONMENT,
});

// ─── drilldownTree (S9, US-2.2) ────────────────────────────────────────────
// Every value invented (plan §0.2); nothing copied, quoted or paraphrased
// from the reference tree. `overviewTree` above is untouched: its four
// one-session groups are asserted on by e2e/overview.spec.ts.

const DRILLDOWN_ROOT = "C:/Users/e2e/AppData/Local/Claude-3p/local-agent-mode-sessions";
const DRILLDOWN_PROFILE = `${DRILLDOWN_ROOT}/acct-1/profile-1`;

function drilldownResultLine(fields: {
  readonly timestamp: string;
  readonly totalCostUsd: number;
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly numTurns: number;
  readonly sessionId: string;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
}): string {
  return JSON.stringify({
    type: "result",
    timestamp: fields.timestamp,
    total_cost_usd: fields.totalCostUsd,
    duration_ms: fields.durationMs,
    duration_api_ms: fields.durationApiMs,
    num_turns: fields.numTurns,
    is_error: false,
    session_id: fields.sessionId,
    usage: {
      output_tokens: fields.outputTokens,
      cache_read_input_tokens: fields.cacheReadInputTokens,
    },
  });
}

function drilldownAudit(fields: {
  readonly timestamp: string;
  readonly totalCostUsd: number;
  readonly durationMs: number;
  readonly durationApiMs: number;
  readonly numTurns: number;
  readonly sessionId: string;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
}): string {
  return [
    '{"type":"system","subtype":"init","model":"claude-sonnet-5"}',
    '{"type":"command_lifecycle","state":"queued"}',
    '{"type":"command_lifecycle","state":"started"}',
    drilldownResultLine(fields),
    '{"type":"command_lifecycle","state":"completed"}',
    "",
  ].join("\n");
}

/**
 * The four-session "Aurora Team" project (plan §6.6). The requirement is not
 * a remark: cost order, title order and session-id order are all mutually
 * different, so a comparator that sorts the wrong field — or one that falls
 * through to the sessionId tie-break — cannot produce the expected row order
 * by accident (LEARNINGS: build a test so the wrong implementation gives a
 * different answer).
 *
 *   cost desc:      cccc3333(140.00) > bbbb2222(75.00) > dddd4444(45.00) > aaaa1111(20.50)
 *   title asc:       "Data import"(dddd) < "Kickoff plan"(cccc) < "Zulu retro"(aaaa) < ""(bbbb, last)
 *   sessionId asc:   aaaa1111 < bbbb2222 < cccc3333 < dddd4444
 *
 * All three sequences are distinct permutations of the same four ids.
 */
export const AURORA_SPACE_ID = "space-aurora";
export const SOLSTICE_SPACE_ID = "space-solstice";

/**
 * aaaa1111: archived. bbbb2222: manifest present but title-less, with no
 * `lastActivityAt` — a session with genuinely NO manifest at all is always
 * `ProjectRef` "none" (`resolveProject` in `src/model/project-assignment.ts`
 * returns `{ kind: "none" }` whenever `meta === null`), which is a DIFFERENT
 * group key from a named space's — so it cannot be one of a named project's
 * four sessions. This manifest reproduces the same observable properties the
 * plan's "no manifest at all" was after (the untitled placeholder,
 * `sessionLastActivity`'s fallback to the audit timestamp) without that
 * contradiction. See the implementer's report for the full reasoning.
 */
export const AURORA_ARCHIVED_SESSION_ID = "aaaa1111";
export const AURORA_UNTITLED_SESSION_ID = "bbbb2222";
/** cccc3333: manifest lastActivityAt (2026-03-05) differs from its audit timestamp (2026-03-01). */
export const AURORA_MANIFEST_ACTIVITY_SESSION_ID = "cccc3333";

export const AURORA_COST_DESC_ORDER = ["cccc3333", "bbbb2222", "dddd4444", "aaaa1111"] as const;
export const AURORA_TITLE_ASC_ORDER = ["dddd4444", "cccc3333", "aaaa1111", "bbbb2222"] as const;
export const AURORA_SESSION_ID_ASC_ORDER = [
  "aaaa1111",
  "bbbb2222",
  "cccc3333",
  "dddd4444",
] as const;

export const SOLSTICE_SESSION_ID = "eeee5555";

const AAAA_AUDIT = drilldownAudit({
  timestamp: "2026-02-20T09:00:00.000Z",
  totalCostUsd: 20.5,
  durationMs: 15_000,
  durationApiMs: 14_000,
  numTurns: 2,
  sessionId: "aaaa1111-full-uuid",
  outputTokens: 500,
  cacheReadInputTokens: 1_000,
});

const BBBB_AUDIT = drilldownAudit({
  timestamp: "2026-02-25T09:00:00.000Z",
  totalCostUsd: 75.0,
  durationMs: 40_000,
  durationApiMs: 38_000,
  numTurns: 3,
  sessionId: "bbbb2222-full-uuid",
  outputTokens: 2_000,
  cacheReadInputTokens: 5_000,
});

// The manifest's lastActivityAt (below, 2026-03-05) differs from this audit
// timestamp on purpose — sessionLastActivity's precedence is observable
// rather than assumed (plan §6.6).
const CCCC_AUDIT = drilldownAudit({
  timestamp: "2026-03-01T09:00:00.000Z",
  totalCostUsd: 140.0,
  durationMs: 90_000,
  durationApiMs: 85_000,
  numTurns: 6,
  sessionId: "cccc3333-full-uuid",
  outputTokens: 9_000,
  cacheReadInputTokens: 20_000,
});

const DDDD_AUDIT = drilldownAudit({
  timestamp: "2026-03-02T09:00:00.000Z",
  totalCostUsd: 45.0,
  durationMs: 20_000,
  durationApiMs: 19_000,
  numTurns: 2,
  sessionId: "dddd4444-full-uuid",
  outputTokens: 1_200,
  cacheReadInputTokens: 2_500,
});

const EEEE_AUDIT = drilldownAudit({
  timestamp: "2026-03-03T09:00:00.000Z",
  totalCostUsd: 30.0,
  durationMs: 12_000,
  durationApiMs: 11_000,
  numTurns: 1,
  sessionId: "eeee5555-full-uuid",
  outputTokens: 800,
  cacheReadInputTokens: 1_500,
});

export const drilldownTree: FakeTree = Object.freeze({
  directories: Object.freeze([]),
  files: Object.freeze({
    [`${DRILLDOWN_PROFILE}/spaces.json`]: JSON.stringify([
      { id: AURORA_SPACE_ID, name: "Aurora Team" },
      { id: SOLSTICE_SPACE_ID, name: "Solstice Ops" },
    ]),
    [`${DRILLDOWN_PROFILE}/local_aaaa1111-manifest-uuid.json`]: JSON.stringify({
      title: "Zulu retro",
      spaceId: AURORA_SPACE_ID,
      model: "claude-sonnet-5",
      isArchived: true,
      lastActivityAt: Date.parse("2026-02-20T09:00:00.000Z"),
    }),
    // bbbb2222: manifest present, but no title and no lastActivityAt, so
    // sessionLastActivity falls back entirely to the audit timestamp (plan
    // §6.6) — see the AURORA_UNTITLED_SESSION_ID comment above for why this
    // is not literally "no manifest at all".
    [`${DRILLDOWN_PROFILE}/local_bbbb2222-manifest-uuid.json`]: JSON.stringify({
      spaceId: AURORA_SPACE_ID,
      model: "claude-sonnet-5",
    }),
    [`${DRILLDOWN_PROFILE}/local_cccc3333-manifest-uuid.json`]: JSON.stringify({
      title: "Kickoff plan",
      spaceId: AURORA_SPACE_ID,
      model: "claude-sonnet-5",
      lastActivityAt: Date.parse("2026-03-05T12:00:00.000Z"),
    }),
    [`${DRILLDOWN_PROFILE}/local_dddd4444-manifest-uuid.json`]: JSON.stringify({
      title: "Data import",
      spaceId: AURORA_SPACE_ID,
      model: "claude-sonnet-5",
      lastActivityAt: Date.parse("2026-03-02T09:00:00.000Z"),
    }),
    [`${DRILLDOWN_PROFILE}/local_eeee5555-manifest-uuid.json`]: JSON.stringify({
      title: "Solo check",
      spaceId: SOLSTICE_SPACE_ID,
      model: "claude-sonnet-5",
      lastActivityAt: Date.parse("2026-03-03T09:00:00.000Z"),
    }),
    [`${DRILLDOWN_PROFILE}/aaaa1111/audit.jsonl`]: AAAA_AUDIT,
    [`${DRILLDOWN_PROFILE}/bbbb2222/audit.jsonl`]: BBBB_AUDIT,
    [`${DRILLDOWN_PROFILE}/cccc3333/audit.jsonl`]: CCCC_AUDIT,
    [`${DRILLDOWN_PROFILE}/dddd4444/audit.jsonl`]: DDDD_AUDIT,
    [`${DRILLDOWN_PROFILE}/eeee5555/audit.jsonl`]: EEEE_AUDIT,
  }),
  hostEnvironment: HOST_ENVIRONMENT,
});
