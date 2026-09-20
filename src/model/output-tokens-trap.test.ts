import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAuditText } from "./audit-parser.js";
import { ASSISTANT_NOISE_JSONL, TOOL_USAGE_JSONL } from "../../test/fixtures/audit/index.js";

/**
 * The roadmap's named exit criterion for S3 (MAP.md §4.1), kept in its own
 * file so it cannot be lost in a refactor of the main spec (S3 plan §10).
 * S12 adds the codebase's first `assistant` branch (`tool-usage.ts`,
 * delegated to from `audit-parser.ts`'s new `assistant` case) — the second
 * and third tests below replace the old source grep with a guard that
 * survives that addition without weakening the property it guards. See S12
 * plan §2 Q2 for the full reasoning and the negative control that proves the
 * replacement is not weaker.
 */
describe("output tokens trap", () => {
  it("output tokens come from the result line, not from assistant lines", () => {
    const text = readFileSync(ASSISTANT_NOISE_JSONL, "utf-8");
    const session = parseAuditText("b2c3d4e5", text);

    // The wrong number is whatever the fixture's non-result lines carry, read
    // from the fixture rather than hard-coded, so this assertion keeps biting
    // if the fixture is reshaped. MAP.md §4.1 measured 1,661 against 152,004
    // on a real session; the fixture reproduces the 1–3 per-line snapshot, and
    // the contrast, not that session's total.
    const snapshotSum = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { message?: { usage?: { output_tokens?: number } } })
      .reduce((sum, obj) => sum + (obj.message?.usage?.output_tokens ?? 0), 0);

    expect(snapshotSum).toBeGreaterThan(0);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].usage.outputTokens).toBe(152004);
    expect(session.requests[0].usage.outputTokens).not.toBe(snapshotSum);
  });

  it("the assistant-line reader touches no token or cost field", () => {
    // Replaces "the parser source contains no assistant branch" (S3's named
    // exit criterion): S12 adds the branch that old grep forbade. The
    // property it protected -- no token and no cost figure ever originates
    // from an `assistant` line -- now lives entirely in `tool-usage.ts`, the
    // only module that reads one. This guard is narrower than the one it
    // replaces, not wider: it names the exact three words that field would
    // have to contain.
    const source = readFileSync(join(process.cwd(), "src", "model", "tool-usage.ts"), "utf-8");
    expect(source).not.toMatch(/usage|_tokens|cost/i);
  });

  it("an assistant line contributes tool counts and no tokens", () => {
    // The behavioural guard the old grep could not express: a fixture whose
    // assistant lines carry BOTH the 1-3-token snapshot AND tool_use blocks,
    // asserting the result-line total wins while toolUses is genuinely
    // non-empty -- proof the assistant branch was taken and still
    // contributed nothing to outputTokens. The old test passed vacuously
    // because no assistant branch existed; this one cannot.
    const text = readFileSync(TOOL_USAGE_JSONL, "utf-8");
    const session = parseAuditText("f00d1234", text);

    const snapshotSum = text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { message?: { usage?: { output_tokens?: number } } })
      .reduce((sum, obj) => sum + (obj.message?.usage?.output_tokens ?? 0), 0);

    expect(snapshotSum).toBeGreaterThan(0);
    expect(session.toolUses.length).toBeGreaterThan(0);
    expect(session.requests).toHaveLength(1);
    expect(session.requests[0].usage.outputTokens).toBe(90210);
    expect(session.requests[0].usage.outputTokens).not.toBe(snapshotSum);
  });
});
