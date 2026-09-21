import type { ZoneOffsetResolver } from "../model/time-buckets.js";

/**
 * Minutes east of UTC at a given instant, from the host. Lives in services,
 * not in src/model/, because reading the host's zone rules is an environment
 * read — the model layer stays a pure function of its arguments (CLAUDE.md
 * architecture rule 2). getTimezoneOffset() is minutes WEST of UTC, hence the
 * negation.
 */
export const localZoneOffset: ZoneOffsetResolver = (epochMs) =>
  -new Date(epochMs).getTimezoneOffset();
