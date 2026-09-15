/**
 * Shared problem type for the model layer (S3 §2 Q3). Extended by S4
 * (`"malformed-manifest"`, `"unknown-space"`) and S6 (`"unreadable-file"`,
 * `"unreadable-directory"`). Rendered by S21.
 *
 * NFR-6: a `Problem` structurally cannot carry file content or a filesystem
 * path. `scope` is a non-sensitive identifier (a session directory name, not
 * a path); `hint` is a bounded, content-free token such as an error class
 * name or a field name.
 */
export type ProblemKind =
  | "malformed-line" // JSON.parse threw on a non-empty line
  | "non-object-line" // valid JSON, but not an object
  | "missing-cost" // a result line without a usable total_cost_usd
  | "decode-replacement"; // the byte stream contained undecodable sequences

export interface Problem {
  readonly kind: ProblemKind;
  /** Session directory name, or another non-sensitive identifier. NEVER a path (NFR-6). */
  readonly scope: string;
  /** 1-based line number, where the problem is line-scoped. */
  readonly line?: number;
  /** Bounded, content-free hint: an error class name or a field name. NEVER file content (NFR-6). */
  readonly hint?: string;
}

export const MAX_PROBLEMS_PER_SCOPE = 20;

export interface ProblemCollector {
  add(problem: Problem): void;
  /** At most the cap. */
  readonly problems: readonly Problem[];
  /** Unbounded — keeps counting past the cap. */
  readonly count: number;
}

export function createProblemCollector(cap: number = MAX_PROBLEMS_PER_SCOPE): ProblemCollector {
  const problems: Problem[] = [];
  let count = 0;

  return {
    add(problem: Problem): void {
      count += 1;
      if (problems.length < cap) {
        problems.push(problem);
      }
    },
    get problems(): readonly Problem[] {
      return problems;
    },
    get count(): number {
      return count;
    },
  };
}
