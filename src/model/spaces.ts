/**
 * Tolerant `spaces.json` reader. Port of `load_spaces()` in
 * `poc/cowork_costs.py`, rule for rule (S4 plan §4.2). NFR-3: never throws;
 * a malformed file records a `Problem` and yields an empty index.
 */
import { decodeText } from "./encoding.js";
import type { ProblemCollector } from "./problems.js";
import type { SpaceIndex } from "./project-types.js";

const ID_KEYS = ["id", "uuid", "spaceId", "space_id", "key"] as const;
const NAME_KEYS = ["name", "title", "label", "displayName"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** POC truthiness: an empty string, 0, false, null and undefined do not count. */
function firstTruthy(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function parseSpacesText(text: string, problems: ProblemCollector): SpaceIndex {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    problems.add({
      kind: "malformed-spaces",
      scope: "spaces",
      hint: error instanceof Error ? error.constructor.name : "Error",
    });
    return new Map();
  }

  const items: unknown = isPlainObject(data) ? (data.spaces ?? data) : data;
  const index = new Map<string, string>();

  if (isPlainObject(items)) {
    for (const [key, value] of Object.entries(items)) {
      if (isPlainObject(value)) {
        const name = firstTruthy(value, NAME_KEYS);
        index.set(String(key), String(name || key));
      } else if (typeof value === "string") {
        index.set(String(key), value);
      }
      // Anything else (number, array, null, boolean) is skipped, as the POC does.
    }
  } else if (Array.isArray(items)) {
    for (const entry of items) {
      if (!isPlainObject(entry)) {
        continue;
      }
      const id = firstTruthy(entry, ID_KEYS);
      if (!id) {
        continue;
      }
      const name = firstTruthy(entry, NAME_KEYS);
      index.set(String(id), String(name || id));
    }
  }
  // Anything else (items is a string, number, etc.) yields an empty index.

  return index;
}

export function parseSpacesBytes(bytes: Uint8Array, problems: ProblemCollector): SpaceIndex {
  const { text } = decodeText(bytes);
  return parseSpacesText(text, problems);
}

/** Multiple accounts/profiles each have a spaces.json. Later entries win on conflict. */
export function mergeSpaceIndexes(indexes: readonly SpaceIndex[]): SpaceIndex {
  const merged = new Map<string, string>();
  for (const index of indexes) {
    for (const [key, value] of index) {
      merged.set(key, value);
    }
  }
  return merged;
}
