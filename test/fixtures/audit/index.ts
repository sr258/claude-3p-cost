/**
 * Absolute paths to the synthetic audit-log fixtures (S3 §6). Tests import
 * these constants and never spell a fixture path themselves.
 */
import { join } from "node:path";

const DIR = `${join(process.cwd(), "test", "fixtures", "audit")}/`;

export const BASIC_JSONL = `${DIR}basic.jsonl`;
export const ASSISTANT_NOISE_JSONL = `${DIR}assistant-noise.jsonl`;
export const ABORTED_JSONL = `${DIR}aborted.jsonl`;
export const MALFORMED_JSONL = `${DIR}malformed.jsonl`;
export const CRLF_NO_TRAILING_NEWLINE_JSONL = `${DIR}crlf-no-trailing-newline.jsonl`;
export const PARTIAL_FIELDS_JSONL = `${DIR}partial-fields.jsonl`;
export const EMPTY_JSONL = `${DIR}empty.jsonl`;
/** S11 plan §5: token categories, thinking, cacheWriteOther, server tools, error, no timestamp, aborted. */
export const COST_DRIVERS_JSONL = `${DIR}cost-drivers.jsonl`;
/** S12 plan §5: tool_use dedup, parallel calls, cross-request sums, tie-break, malformed blocks. */
export const TOOL_USAGE_JSONL = `${DIR}tool-usage.jsonl`;
/**
 * S13 plan §5: one session crossing a month end, engineered so per-request,
 * whole-session-kept and whole-session-dropped filtering give three
 * different totals. Also carries one undated result (Q9) and one open
 * request with no matching completed lifecycle line (Q10).
 */
export const MONTH_STRADDLE_JSONL = `${DIR}month-straddle.jsonl`;
/** S13 plan §5: two requests either side of the European DST jump. */
export const DST_STRADDLE_JSONL = `${DIR}dst-straddle.jsonl`;

export const ALL_FIXTURES = [
  BASIC_JSONL,
  ASSISTANT_NOISE_JSONL,
  ABORTED_JSONL,
  MALFORMED_JSONL,
  CRLF_NO_TRAILING_NEWLINE_JSONL,
  PARTIAL_FIELDS_JSONL,
  EMPTY_JSONL,
  COST_DRIVERS_JSONL,
  TOOL_USAGE_JSONL,
  MONTH_STRADDLE_JSONL,
  DST_STRADDLE_JSONL,
];
