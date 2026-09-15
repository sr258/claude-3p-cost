import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAuditAccumulator,
  parseAuditBytes,
  parseAuditLines,
  parseAuditText,
} from "./audit-parser.js";
import { MAX_PROBLEMS_PER_SCOPE } from "./problems.js";
import {
  ABORTED_JSONL,
  ALL_FIXTURES,
  BASIC_JSONL,
  EMPTY_JSONL,
  MALFORMED_JSONL,
  PARTIAL_FIELDS_JSONL,
} from "../../test/fixtures/audit/index.js";

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

async function* toAsyncLines(text: string): AsyncIterable<string> {
  for (const line of text.split(/\r?\n/)) {
    yield line;
  }
}

describe("parseAuditText over basic.jsonl", () => {
  const session = parseAuditText("a1b2c3d4", readText(BASIC_JSONL));

  it("extracts cost, duration, turns and error flag from result lines", () => {
    expect(session.requests).toHaveLength(3);
    const [first, second] = session.requests;
    expect(first.costMicroUsd).toBe(100000);
    expect(first.durationMs).toBe(1000);
    expect(first.durationApiMs).toBe(900);
    expect(first.numTurns).toBe(2);
    expect(first.isError).toBe(false);
    expect(second.isError).toBe(true);
  });

  it("sums cost as integer micro-USD", () => {
    const total = session.requests.reduce((sum, r) => sum + r.costMicroUsd, 0);
    expect(total).toBe(500000);
    expect(Number.isInteger(total)).toBe(true);
  });

  it("reads every token category from the result usage block", () => {
    const usage = session.requests[0].usage;
    expect(usage.inputTokens).toBe(1000);
    expect(usage.outputTokens).toBe(2000);
    expect(usage.cacheCreationInputTokens).toBe(400);
    expect(usage.cacheReadInputTokens).toBe(500);
    expect(usage.webSearchRequests).toBe(2);
    expect(usage.webFetchRequests).toBe(1);
  });

  it("reads thinking tokens from output_tokens_details", () => {
    expect(session.requests[0].usage.thinkingTokens).toBe(300);
  });

  it("reads the 1h and 5m cache-creation split", () => {
    expect(session.requests[0].usage.cacheCreation1hInputTokens).toBe(100);
    expect(session.requests[0].usage.cacheCreation5mInputTokens).toBe(50);
  });

  it("reads server tool use counts", () => {
    expect(session.requests[0].usage.webSearchRequests).toBe(2);
    expect(session.requests[0].usage.webFetchRequests).toBe(1);
  });

  it("keeps the [1m] model variant distinct from its base model", () => {
    const models = session.requests[0].models;
    const base = models.find((m) => m.model === "claude-opus-5");
    const variant = models.find((m) => m.model === "claude-opus-5[1m]");
    expect(base).toBeDefined();
    expect(variant).toBeDefined();
    expect(base?.contextWindow).toBe(200000);
    expect(variant?.contextWindow).toBe(1000000);
    expect(base?.costMicroUsd).toBe(50000);
    expect(variant?.costMicroUsd).toBe(50000);
  });

  it("reads subagent stats and tolerates their absence", () => {
    expect(session.requests[0].subagents).toEqual({
      requested: 2,
      spawned: 1,
      spawnedBySubagents: 0,
      startedInBackground: 0,
      completed: 1,
      failed: 0,
      killed: 0,
      refused: 0,
      maxDepth: 1,
    });
    expect(session.requests[1].subagents).toBeNull();
  });

  it("counts command_lifecycle states and reports open requests", () => {
    expect(session.lifecycle).toEqual({ queued: 3, started: 3, completed: 3 });
    expect(session.openRequests).toBe(0);
  });

  it("takes cwd and model from the first system/init line", () => {
    expect(session.cwd).toBe(
      "C:\\Users\\testuser\\AppData\\Local\\Claude-3p\\local-agent-mode-sessions\\a1b2c3d4\\outputs",
    );
    expect(session.initModel).toBe("claude-opus-5");
  });

  it("derives the session id from cwd and falls back to sourceId", () => {
    expect(session.sessionId).toBe("a1b2c3d4");
    const noInit = parseAuditText("fallback-source", '{"type":"result","total_cost_usd":0.1}');
    expect(noInit.sessionId).toBe("fallback-source");
  });

  it("does not use result.session_id as the session id", () => {
    expect(session.sessionId).not.toBe("11111111-2222-3333-4444-555555555555");
    expect(session.cliSessionId).toBe("11111111-2222-3333-4444-555555555555");
  });
});

describe("open requests over aborted.jsonl", () => {
  it("reports one open request when started outpaces completed", () => {
    const session = parseAuditText("c3d4e5f6", readText(ABORTED_JSONL));
    expect(session.lifecycle).toEqual({ queued: 0, started: 3, completed: 2 });
    expect(session.openRequests).toBe(1);
    expect(session.requests).toHaveLength(2);
  });
});

describe("robustness over malformed.jsonl", () => {
  const session = parseAuditText("eeeeeeee", readText(MALFORMED_JSONL));

  it("counts malformed lines and keeps parsing", () => {
    expect(session.malformedLineCount).toBe(4);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].costMicroUsd).toBe(50000);
  });

  it("ignores blank and whitespace-only lines", () => {
    // 5 non-blank lines precede the valid result line: garbage, truncated,
    // "123", the array line, and the result line itself.
    expect(session.lineCount).toBe(5);
  });

  it("caps collected problems but not the malformed count", () => {
    const accumulator = createAuditAccumulator("ffffffff");
    for (let i = 0; i < MAX_PROBLEMS_PER_SCOPE + 10; i += 1) {
      accumulator.pushLine("not valid json");
    }
    const result = accumulator.finish();
    expect(result.problems).toHaveLength(MAX_PROBLEMS_PER_SCOPE);
    expect(result.malformedLineCount).toBe(MAX_PROBLEMS_PER_SCOPE + 10);
  });
});

describe("missing cost", () => {
  it("raises missing-cost for a result line without total_cost_usd", () => {
    const session = parseAuditText("11112222", readText(PARTIAL_FIELDS_JSONL));
    const missingCostProblems = session.problems.filter((p) => p.kind === "missing-cost");
    // Exactly one of the five result lines has an unusable cost —
    // `total_cost_usd: null` on line 4. The other four carry a real number and
    // must raise nothing, so the count is asserted, not just its floor.
    expect(missingCostProblems).toHaveLength(1);
    expect(missingCostProblems[0]).toMatchObject({ kind: "missing-cost", line: 4, hint: "total_cost_usd" });
    expect(session.requests[3].costMicroUsd).toBe(0);
  });
});

describe("empty file", () => {
  it("returns an empty session for an empty file", () => {
    const session = parseAuditText("00000000", readText(EMPTY_JSONL));
    expect(session.requests).toEqual([]);
    expect(session.lineCount).toBe(0);
    expect(session.malformedLineCount).toBe(0);
    expect(session.problems).toEqual([]);
    expect(session.lifecycle).toEqual({ queued: 0, started: 0, completed: 0 });
    expect(session.openRequests).toBe(0);
  });
});

describe("finish idempotency", () => {
  it("finish is idempotent", () => {
    const accumulator = createAuditAccumulator("12345678");
    accumulator.pushLine('{"type":"result","total_cost_usd":0.1,"num_turns":1}');
    const first = accumulator.finish();
    const second = accumulator.finish();
    expect(second).toEqual(first);
  });
});

describe("adapter agreement", () => {
  it("parseAuditText, parseAuditBytes and parseAuditLines agree on every fixture", async () => {
    for (const path of ALL_FIXTURES) {
      const text = readText(path);
      const bytes = new TextEncoder().encode(text);

      const fromText = parseAuditText("sourceid", text);
      const fromBytes = parseAuditBytes("sourceid", bytes);
      const fromLines = await parseAuditLines("sourceid", toAsyncLines(text));

      const { encoding: _encodingText, ...restText } = fromText;
      const { encoding: _encodingBytes, ...restBytes } = fromBytes;
      const { encoding: _encodingLines, ...restLines } = fromLines;

      expect(restBytes).toEqual(restText);
      expect(restLines).toEqual(restText);
    }
  });
});
