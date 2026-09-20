/**
 * Counts tool calls from `assistant` lines (S12 plan §4.1). This is the ONLY
 * module that reads an `assistant` line's `message.content` array; the
 * parser's `assistant` branch is a one-line delegation into it (S12 plan §2
 * Q2). No i18n import, no clock, no DOM, no filesystem.
 *
 * This module never reads any billing-related field of an `assistant` line —
 * enforced structurally by `output-tokens-trap.test.ts`'s replacement guard,
 * which greps this file's own source for the three words that name what it
 * must never touch. Do not introduce a field or comment naming what that
 * guard forbids; write around it instead.
 */

export interface ToolUseCount {
  /** The tool_use block's `name`, verbatim. Never split, shortened or normalised. */
  readonly name: string;
  readonly calls: number;
}

/** One tool_use block, before deduplication. `toolId` never leaves this module. */
export interface ToolUseRef {
  readonly requestId: string | null;
  readonly toolId: string | null;
  readonly name: string;
  /** Position in the content array — the no-id dedup fallback (§2 Q1). */
  readonly index: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Extracts refs from ONE already-JSON-parsed `assistant` line. Never throws.
 * Reads `request_id` and `message.content[].{type,id,name}` and nothing else
 * — never `input`, never `caller` (S12 plan §2 Q5, NFR-6).
 */
export function toolUsesFromAssistantLine(obj: Record<string, unknown>): readonly ToolUseRef[] {
  const requestId = nonEmptyString(obj.request_id);
  const content = asRecord(obj.message).content;
  if (!Array.isArray(content)) {
    return Object.freeze([]);
  }

  const refs: ToolUseRef[] = [];
  content.forEach((block, index) => {
    const record = asRecord(block);
    if (record.type !== "tool_use") {
      return;
    }
    const name = nonEmptyString(record.name);
    if (name === null) {
      return;
    }
    refs.push(
      Object.freeze({
        requestId,
        toolId: nonEmptyString(record.id),
        name,
        index,
      }),
    );
  });
  return Object.freeze(refs);
}

/**
 * Calls desc, then name asc by UTF-16 code unit — never `localeCompare`
 * (LEARNINGS: the model layer's back door to i18n).
 */
export function rankToolUses(counts: ReadonlyMap<string, number>): readonly ToolUseCount[] {
  const entries = [...counts.entries()].map(([name, calls]) => Object.freeze({ name, calls }));
  entries.sort((a, b) => {
    if (a.calls !== b.calls) {
      return b.calls - a.calls;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return Object.freeze(entries);
}

export interface ToolUseCounter {
  addAssistantLine(obj: Record<string, unknown>): void;
  /** Ranked and frozen: calls descending, then name ascending by code unit. */
  readonly value: readonly ToolUseCount[];
}

/**
 * Holds one `Map` over distinct tool names (max 20 observed in the reference
 * tree) and one `Set` of dedup keys bounded by the session's tool-call count
 * (max 863 observed) — no extra I/O, no extra `JSON.parse` (NFR-4).
 */
export function createToolUseCounter(): ToolUseCounter {
  const counts = new Map<string, number>();
  const seenKeys = new Set<string>();
  let noRequestIdSequence = 0;

  return {
    addAssistantLine(obj: Record<string, unknown>): void {
      for (const ref of toolUsesFromAssistantLine(obj)) {
        let dedupKey: string;
        if (ref.requestId !== null && ref.toolId !== null) {
          // Reading A (S12 plan §2 Q1): each distinct (request_id, tool_use.id) once.
          dedupKey = `${ref.requestId}|${ref.toolId}`;
        } else if (ref.requestId !== null) {
          // No id: position-based fallback. A cumulative re-send repeats
          // positions, so this still dedups.
          dedupKey = `${ref.requestId}|#${ref.index}:${ref.name}`;
        } else {
          // No request_id at all: dedup is impossible, so the block is
          // always counted rather than silently dropped.
          noRequestIdSequence += 1;
          dedupKey = `no-request-id|${noRequestIdSequence}`;
        }

        if (seenKeys.has(dedupKey)) {
          continue;
        }
        seenKeys.add(dedupKey);
        counts.set(ref.name, (counts.get(ref.name) ?? 0) + 1);
      }
    },
    get value(): readonly ToolUseCount[] {
      return rankToolUses(counts);
    },
  };
}
