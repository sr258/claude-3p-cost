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
