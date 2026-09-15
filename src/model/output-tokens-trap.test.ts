import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAuditText } from "./audit-parser.js";
import { ASSISTANT_NOISE_JSONL } from "../../test/fixtures/audit/index.js";

/**
 * The roadmap's named exit criterion for S3 (MAP.md §4.1), kept in its own
 * file so it cannot be lost in a refactor of the main spec (S3 plan §10).
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

  it("the parser source contains no assistant branch", () => {
    const source = readFileSync(join(process.cwd(), "src", "model", "audit-parser.ts"), "utf-8");
    expect(source).not.toMatch(/["']assistant["']/);
  });
});
