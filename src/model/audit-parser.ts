import { decodeText, splitLines } from "./encoding.js";
import { toBool, toInt, toMicroUsd, toStringOrNull } from "./numbers.js";
import { createProblemCollector, MAX_PROBLEMS_PER_SCOPE, type Problem } from "./problems.js";
import { sessionIdFromCwd } from "./session-id.js";
import type {
  AuditSession,
  ModelUsageRecord,
  RequestRecord,
  SubagentStats,
  TokenUsage,
} from "./audit-types.js";

/**
 * A faithful port of `parse_audit()` in `poc/cowork_costs.py`, split into an
 * accumulator core and three thin adapters (S3 §2 Q1). `pushLine` is
 * synchronous and never throws (NFR-3); the accumulator never holds the full
 * line list (NFR-4).
 */
export interface AuditAccumulator {
  /** Synchronous by design — see S3 plan §2 Q1. Never throws. */
  pushLine(line: string): void;
  finish(): AuditSession;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function createAuditAccumulator(sourceId: string): AuditAccumulator {
  const problemCollector = createProblemCollector();
  const requests: RequestRecord[] = [];
  const lifecycle = { queued: 0, started: 0, completed: 0 };
  let cwd: string | null = null;
  let initModel: string | null = null;
  let cliSessionId: string | null = null;
  let lineCount = 0;
  let malformedLineCount = 0;

  function buildRequestRecord(obj: Record<string, unknown>, lineNumber: number): RequestRecord {
    const timestamp = toStringOrNull(obj.timestamp);

    const rawCost = obj.total_cost_usd;
    const isUsableCost = typeof rawCost === "number" && Number.isFinite(rawCost);
    const costMicroUsd = isUsableCost ? toMicroUsd(rawCost) : 0;
    if (!isUsableCost) {
      problemCollector.add({
        kind: "missing-cost",
        scope: sourceId,
        line: lineNumber,
        hint: "total_cost_usd",
      });
    }

    const durationMs = toInt(obj.duration_ms);
    const durationApiMs = toInt(obj.duration_api_ms);
    const numTurns = toInt(obj.num_turns);
    const isError = toBool(obj.is_error);

    const usageRaw = asRecord(obj.usage);
    const outputDetails = asRecord(usageRaw.output_tokens_details);
    const cacheCreation = asRecord(usageRaw.cache_creation);
    const serverToolUse = asRecord(usageRaw.server_tool_use);

    const usage: TokenUsage = {
      inputTokens: toInt(usageRaw.input_tokens),
      outputTokens: toInt(usageRaw.output_tokens),
      thinkingTokens: toInt(outputDetails.thinking_tokens),
      cacheCreationInputTokens: toInt(usageRaw.cache_creation_input_tokens),
      cacheReadInputTokens: toInt(usageRaw.cache_read_input_tokens),
      cacheCreation1hInputTokens: toInt(cacheCreation.ephemeral_1h_input_tokens),
      cacheCreation5mInputTokens: toInt(cacheCreation.ephemeral_5m_input_tokens),
      webSearchRequests: toInt(serverToolUse.web_search_requests),
      webFetchRequests: toInt(serverToolUse.web_fetch_requests),
    };

    const modelUsageRaw = asRecord(obj.modelUsage);
    const models: ModelUsageRecord[] = Object.entries(modelUsageRaw).map(([model, value]) => {
      const v = asRecord(value);
      return {
        model,
        costMicroUsd: toMicroUsd(v.costUSD),
        inputTokens: toInt(v.inputTokens),
        outputTokens: toInt(v.outputTokens),
        cacheReadInputTokens: toInt(v.cacheReadInputTokens),
        cacheCreationInputTokens: toInt(v.cacheCreationInputTokens),
        webSearchRequests: toInt(v.webSearchRequests),
        provider: toStringOrNull(v.provider),
        costBasis: toStringOrNull(v.costBasis),
        contextWindow: "contextWindow" in v ? toInt(v.contextWindow) : null,
      };
    });

    const subagentsRaw = obj.subagent_stats;
    let subagents: SubagentStats | null = null;
    if (subagentsRaw !== null && typeof subagentsRaw === "object" && !Array.isArray(subagentsRaw)) {
      const s = subagentsRaw as Record<string, unknown>;
      subagents = {
        requested: toInt(s.requested),
        spawned: toInt(s.spawned),
        spawnedBySubagents: toInt(s.spawned_by_subagents),
        startedInBackground: toInt(s.started_in_background),
        completed: toInt(s.completed),
        failed: toInt(s.failed),
        killed: toInt(s.killed),
        refused: toInt(s.refused),
        maxDepth: toInt(s.max_depth),
      };
    }

    return {
      timestamp,
      costMicroUsd,
      durationMs,
      durationApiMs,
      numTurns,
      isError,
      usage,
      models,
      subagents,
    };
  }

  return {
    pushLine(line: string): void {
      const trimmed = line.trim();
      if (trimmed === "") {
        return;
      }
      lineCount += 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        malformedLineCount += 1;
        problemCollector.add({
          kind: "malformed-line",
          scope: sourceId,
          line: lineCount,
          hint: error instanceof Error ? error.constructor.name : "Error",
        });
        return;
      }

      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        malformedLineCount += 1;
        problemCollector.add({ kind: "non-object-line", scope: sourceId, line: lineCount });
        return;
      }

      const obj = parsed as Record<string, unknown>;
      const type = obj.type;

      if (type === "system" && obj.subtype === "init") {
        if (cwd === null) {
          cwd = toStringOrNull(obj.cwd);
        }
        if (initModel === null) {
          initModel = toStringOrNull(obj.model);
        }
        return;
      }

      if (type === "command_lifecycle") {
        const state = obj.state;
        if (state === "queued") lifecycle.queued += 1;
        else if (state === "started") lifecycle.started += 1;
        else if (state === "completed") lifecycle.completed += 1;
        return;
      }

      if (type === "result") {
        requests.push(buildRequestRecord(obj, lineCount));
        if (cliSessionId === null) {
          cliSessionId = toStringOrNull(obj.session_id);
        }
        return;
      }

      // Any other type — including the message-stream lines whose
      // output_tokens field is a snapshot, not a total (see audit-types.ts,
      // TokenUsage.outputTokens) — is ignored. Already counted in lineCount;
      // not malformed, not a problem.
    },
    finish(): AuditSession {
      // Frozen and copied (S3 §5.2): a returned session must not change when
      // the accumulator is pushed further, and `problemCollector.problems`
      // exposes the collector's own array.
      return Object.freeze({
        sourceId,
        sessionId: sessionIdFromCwd(cwd) ?? sourceId,
        cwd,
        initModel,
        cliSessionId,
        requests: [...requests],
        lifecycle: { ...lifecycle },
        openRequests: Math.max(0, lifecycle.started - lifecycle.completed),
        lineCount,
        malformedLineCount,
        encoding: null,
        problems: [...problemCollector.problems],
      });
    },
  };
}

export function parseAuditText(sourceId: string, text: string): AuditSession {
  const accumulator = createAuditAccumulator(sourceId);
  for (const line of splitLines(text)) {
    accumulator.pushLine(line);
  }
  return accumulator.finish();
}

export function parseAuditBytes(sourceId: string, bytes: Uint8Array): AuditSession {
  const decoded = decodeText(bytes);
  const accumulator = createAuditAccumulator(sourceId);
  for (const line of splitLines(decoded.text)) {
    accumulator.pushLine(line);
  }
  const session = accumulator.finish();

  let problems = session.problems;
  if (decoded.hadReplacement) {
    const decodeProblem: Problem = { kind: "decode-replacement", scope: sourceId };
    if (problems.length < MAX_PROBLEMS_PER_SCOPE) {
      problems = [...problems, decodeProblem];
    }
  }

  return Object.freeze({ ...session, encoding: decoded.encoding, problems });
}

export async function parseAuditLines(
  sourceId: string,
  lines: AsyncIterable<string>,
): Promise<AuditSession> {
  const accumulator = createAuditAccumulator(sourceId);
  for await (const line of lines) {
    accumulator.pushLine(line);
  }
  return accumulator.finish();
}
