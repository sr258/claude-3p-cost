/**
 * Absolute paths to the synthetic manifest and spaces.json fixtures (S4 §7).
 * Tests import these constants and never spell a fixture path themselves.
 * Every value in these fixtures is invented — see the plan's fixture table.
 */
import { join } from "node:path";

const DIR = `${join(process.cwd(), "test", "fixtures", "sessions")}/`;

export const SPACES_LIST_JSON = `${DIR}spaces-list.json`;
export const SPACES_MAP_JSON = `${DIR}spaces-map.json`;
export const SPACES_MAP_OF_STRINGS_JSON = `${DIR}spaces-map-of-strings.json`;
export const SPACES_ARRAY_ROOT_JSON = `${DIR}spaces-array-root.json`;
export const SPACES_LOOSE_KEYS_JSON = `${DIR}spaces-loose-keys.json`;
export const SPACES_MALFORMED_JSON = `${DIR}spaces-malformed.json`;

/** Case 1 — ordinary: full sessionId, known spaceId, cwd ending in the 8-hex session directory. */
export const MANIFEST_ORDINARY_JSON = `${DIR}local_11112222-aaaa-bbbb-cccc-111122223333.json`;
/** Case 2 — no spaceId field at all. */
export const MANIFEST_NO_SPACE_JSON = `${DIR}local_22223333-aaaa-bbbb-cccc-222233334444.json`;
/** Case 3 — spaceId is an empty string; must behave as absent. */
export const MANIFEST_EMPTY_SPACE_JSON = `${DIR}local_33334444-aaaa-bbbb-cccc-333344445555.json`;
/** Case 4 — spaceId absent from every spaces fixture: the unknown fallback. */
export const MANIFEST_UNKNOWN_SPACE_JSON = `${DIR}local_44445555-aaaa-bbbb-cccc-444455556666.json`;
/** Case 5 — isArchived: true, isStarred: true. */
export const MANIFEST_ARCHIVED_STARRED_JSON = `${DIR}local_55556666-aaaa-bbbb-cccc-555566667777.json`;
/** Case 6 — no resolvedFolderKinds; userSelectedFolders fallback, mixed string/object entries. */
export const MANIFEST_USER_SELECTED_FOLDERS_JSON = `${DIR}local_66667777-aaaa-bbbb-cccc-666677778888.json`;
/** Case 7 — no sessionId field at all; keys must come from the file name. */
export const MANIFEST_NO_SESSION_ID_JSON = `${DIR}local_77778888-aaaa-bbbb-cccc-777788889999.json`;
/** Case 8a — cwd points at a shared folder rather than a session directory (collision, first). */
export const MANIFEST_COLLISION_A_JSON = `${DIR}local_88889999-aaaa-bbbb-cccc-888899990000.json`;
/** Case 8b — same shared-folder cwd as 8a (reproduces the §5.4 key collision) and the same spaceId (Epsilon), so the collision pair does not add its own project bucket. */
export const MANIFEST_COLLISION_B_JSON = `${DIR}local_99990000-aaaa-bbbb-cccc-999900001111.json`;
/** Case 9 — carries systemPrompt, initialMessage, emailAddress, instructions (must not be retained). */
export const MANIFEST_SENSITIVE_FIELDS_JSON = `${DIR}local_aaaa0000-aaaa-bbbb-cccc-aaaa00001111.json`;
/** Case 10 — truncated JSON, named without the local_ prefix. */
export const MANIFEST_MALFORMED_JSON = `${DIR}malformed-manifest.json`;

export const ALL_SPACES_FIXTURES = [
  SPACES_LIST_JSON,
  SPACES_MAP_JSON,
  SPACES_MAP_OF_STRINGS_JSON,
  SPACES_ARRAY_ROOT_JSON,
  SPACES_LOOSE_KEYS_JSON,
  SPACES_MALFORMED_JSON,
];

export const ALL_MANIFEST_FIXTURES = [
  MANIFEST_ORDINARY_JSON,
  MANIFEST_NO_SPACE_JSON,
  MANIFEST_EMPTY_SPACE_JSON,
  MANIFEST_UNKNOWN_SPACE_JSON,
  MANIFEST_ARCHIVED_STARRED_JSON,
  MANIFEST_USER_SELECTED_FOLDERS_JSON,
  MANIFEST_NO_SESSION_ID_JSON,
  MANIFEST_COLLISION_A_JSON,
  MANIFEST_COLLISION_B_JSON,
  MANIFEST_SENSITIVE_FIELDS_JSON,
  MANIFEST_MALFORMED_JSON,
];

export const ALL_FIXTURES = [...ALL_SPACES_FIXTURES, ...ALL_MANIFEST_FIXTURES];
