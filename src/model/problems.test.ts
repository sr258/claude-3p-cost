import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createProblemCollector, MAX_PROBLEMS_PER_SCOPE } from "./problems.js";
import { parseAuditText } from "./audit-parser.js";
import { MALFORMED_JSONL } from "../../test/fixtures/audit/index.js";

describe("createProblemCollector", () => {
  it("collects up to the cap", () => {
    const collector = createProblemCollector();
    for (let i = 0; i < MAX_PROBLEMS_PER_SCOPE; i += 1) {
      collector.add({ kind: "malformed-line", scope: "aaaaaaaa", line: i });
    }
    expect(collector.problems).toHaveLength(MAX_PROBLEMS_PER_SCOPE);
  });

  it("keeps counting past the cap", () => {
    const collector = createProblemCollector();
    for (let i = 0; i < MAX_PROBLEMS_PER_SCOPE + 5; i += 1) {
      collector.add({ kind: "malformed-line", scope: "aaaaaaaa", line: i });
    }
    expect(collector.problems).toHaveLength(MAX_PROBLEMS_PER_SCOPE);
    expect(collector.count).toBe(MAX_PROBLEMS_PER_SCOPE + 5);
  });

  it("respects an explicit cap argument", () => {
    const collector = createProblemCollector(3);
    for (let i = 0; i < 10; i += 1) {
      collector.add({ kind: "malformed-line", scope: "aaaaaaaa", line: i });
    }
    expect(collector.problems).toHaveLength(3);
    expect(collector.count).toBe(10);
  });

  it("a problem carries no file content and no path", () => {
    const rawText = readFileSync(MALFORMED_JSONL, "utf-8");
    const rawLines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const session = parseAuditText("aaaaaaaa", rawText);

    expect(session.problems.length).toBeGreaterThan(0);

    for (const problem of session.problems) {
      expect(problem.scope).not.toMatch(/[/\\]/);
      if (problem.hint !== undefined) {
        // A hint is an identifier — an error class name or a field name. This
        // shape admits no punctuation, whitespace or quoting, so no fragment
        // of a log line can pass it, not even a truncated one (NFR-6).
        expect(problem.hint).toMatch(/^[A-Za-z_][A-Za-z0-9_]{0,40}$/);
        for (const rawLine of rawLines) {
          expect(problem.hint).not.toContain(rawLine);
          // Also reject a truncated fragment, which the full-line check misses.
          expect(problem.hint).not.toContain(rawLine.slice(0, 8));
        }
      }
    }
  });
});
