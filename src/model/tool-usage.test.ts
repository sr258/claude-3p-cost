/**
 * Unit tests for the leaf module S12 adds (plan §6). Hand-built
 * already-JSON-parsed `assistant`-line objects are the right input here —
 * this suite tests `tool-usage.ts` itself, not the parser's wiring into it
 * (that is `audit-parser.test.ts`'s `tool-usage.jsonl`-fixture-based job;
 * LEARNINGS: hand-built literals are not a substitute for a fixture when the
 * parser is the step that populates the field under test — the parser is not
 * the step under test in this file).
 */
import { describe, expect, it } from "vitest";
import { createToolUseCounter, rankToolUses, toolUsesFromAssistantLine } from "./tool-usage.js";

function assistantLine(requestId: string | null, content: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = { type: "assistant", message: { content } };
  if (requestId !== null) {
    obj.request_id = requestId;
  }
  return obj;
}

function toolUse(id: string | null, name: unknown, extra: Record<string, unknown> = {}) {
  const block: Record<string, unknown> = { type: "tool_use", name, ...extra };
  if (id !== null) {
    block.id = id;
  }
  return block;
}

describe("tool-usage", () => {
  it("counts one call per distinct tool_use id within a request", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(
      assistantLine("req_1", [toolUse("t1", "Bash"), toolUse("t2", "Read")]),
    );
    expect(counter.value).toEqual([
      { name: "Bash", calls: 1 },
      { name: "Read", calls: 1 },
    ]);
  });

  it("counts a repeated tool_use id under the same request only once", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(assistantLine("req_1", [toolUse("t1", "Bash")]));
    counter.addAssistantLine(assistantLine("req_1", [toolUse("t1", "Bash")]));
    expect(counter.value).toEqual([{ name: "Bash", calls: 1 }]);
  });

  it("counts two calls to the same tool name in one request separately", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(
      assistantLine("req_1", [toolUse("t1", "Grep"), toolUse("t2", "Grep")]),
    );
    expect(counter.value).toEqual([{ name: "Grep", calls: 2 }]);
  });

  it("sums a tool name across several requests", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(assistantLine("req_1", [toolUse("t1", "Bash")]));
    counter.addAssistantLine(assistantLine("req_2", [toolUse("t2", "Bash")]));
    expect(counter.value).toEqual([{ name: "Bash", calls: 2 }]);
  });

  it("ranks by call count descending", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(
      assistantLine("req_1", [
        toolUse("t1", "Bash"),
        toolUse("t2", "Bash"),
        toolUse("t3", "Bash"),
        toolUse("t4", "Read"),
      ]),
    );
    expect(counter.value).toEqual([
      { name: "Bash", calls: 3 },
      { name: "Read", calls: 1 },
    ]);
  });

  it("breaks a tie on call count by tool name, by code unit and not by collation", () => {
    // A collator sorts "Ä" next to "A"; code-unit order puts it after "Z"
    // (U+00C4 = 196). This fixture only tells the two apart because they
    // disagree (LEARNINGS: a default that agrees on every fixture is
    // untested by construction).
    const counts = new Map([
      ["Zebra", 2],
      ["Ärger", 2],
    ]);
    expect(rankToolUses(counts)).toEqual([
      { name: "Zebra", calls: 2 },
      { name: "Ärger", calls: 2 },
    ]);
  });

  it("ignores an assistant line whose content is not an array", () => {
    const refs = toolUsesFromAssistantLine({
      type: "assistant",
      request_id: "req_1",
      message: { content: "not an array" },
    });
    expect(refs).toEqual([]);
  });

  it("ignores a tool_use block with no name, and records no problem", () => {
    // tool-usage.ts has no ProblemCollector at all -- there is structurally
    // nothing for it to record (S12 plan §2 Q6). The block is just dropped.
    const refs = toolUsesFromAssistantLine(
      assistantLine("req_1", [{ type: "tool_use", id: "t1" }, toolUse("t2", "Bash")]),
    );
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe("Bash");
  });

  it("counts a tool_use on a line with no request_id rather than dropping it", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(assistantLine(null, [toolUse("t1", "WebSearch")]));
    expect(counter.value).toEqual([{ name: "WebSearch", calls: 1 }]);
  });

  it("keeps an MCP tool name verbatim", () => {
    const counter = createToolUseCounter();
    counter.addAssistantLine(
      assistantLine("req_1", [toolUse("t1", "mcp__example-server__list_items")]),
    );
    expect(counter.value).toEqual([{ name: "mcp__example-server__list_items", calls: 1 }]);
  });

  it("never reads a tool_use input field", () => {
    let inputRead = false;
    const trapped = {
      type: "tool_use",
      id: "t1",
      name: "Bash",
      get input(): unknown {
        inputRead = true;
        return { command: "rm -rf /" };
      },
      get caller(): unknown {
        inputRead = true;
        return { type: "direct" };
      },
    };
    const refs = toolUsesFromAssistantLine(assistantLine("req_1", [trapped]));
    expect(refs).toHaveLength(1);
    expect(inputRead).toBe(false);

    const counter = createToolUseCounter();
    counter.addAssistantLine(assistantLine("req_1", [trapped]));
    expect(inputRead).toBe(false);
  });

  it("returns a frozen, empty list for a session with no assistant lines", () => {
    const counter = createToolUseCounter();
    expect(counter.value).toEqual([]);
    expect(Object.isFrozen(counter.value)).toBe(true);
  });
});
