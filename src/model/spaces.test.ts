import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createProblemCollector } from "./problems.js";
import { mergeSpaceIndexes, parseSpacesBytes, parseSpacesText } from "./spaces.js";
import {
  SPACES_ARRAY_ROOT_JSON,
  SPACES_LIST_JSON,
  SPACES_LOOSE_KEYS_JSON,
  SPACES_MALFORMED_JSON,
  SPACES_MAP_JSON,
  SPACES_MAP_OF_STRINGS_JSON,
} from "../../test/fixtures/sessions/index.js";

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("parseSpacesText", () => {
  it("reads the list form", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText(readText(SPACES_LIST_JSON), problems);
    expect(index.size).toBe(6);
    expect(index.get("aaaaaaaa-1111-4a11-8a11-000000000001")).toBe("Alpha");
    expect(problems.count).toBe(0);
  });

  it("reads the map-of-objects form", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText(readText(SPACES_MAP_JSON), problems);
    expect(index.get("bbbbbbbb-2222-4b22-8b22-000000000001")).toBe("Alpha");
    expect(index.get("bbbbbbbb-2222-4b22-8b22-000000000002")).toBe("Beta");
  });

  it("reads the map-of-strings form", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText(readText(SPACES_MAP_OF_STRINGS_JSON), problems);
    expect(index.get("cccccccc-3333-4c33-8c33-000000000001")).toBe("Alpha");
    expect(index.get("cccccccc-3333-4c33-8c33-000000000002")).toBe("Beta");
  });

  it("reads a top-level array with no 'spaces' wrapper", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText(readText(SPACES_ARRAY_ROOT_JSON), problems);
    expect(index.get("dddddddd-4444-4d44-8d44-000000000001")).toBe("Alpha");
    expect(index.get("dddddddd-4444-4d44-8d44-000000000002")).toBe("Beta");
  });

  it("resolves the id from uuid, spaceId, space_id and key; the name from title, label and displayName", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText(readText(SPACES_LOOSE_KEYS_JSON), problems);
    expect(index.get("eeeeeeee-5555-4e55-8e55-000000000001")).toBe("Alpha");
    expect(index.get("eeeeeeee-5555-4e55-8e55-000000000002")).toBe("Beta");
    expect(index.get("eeeeeeee-5555-4e55-8e55-000000000003")).toBe("Gamma");
    expect(index.get("eeeeeeee-5555-4e55-8e55-000000000005")).toBe("Delta");
  });

  it("falls back to the id itself when an entry has an id and no name", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText(readText(SPACES_LOOSE_KEYS_JSON), problems);
    expect(index.get("eeeeeeee-5555-4e55-8e55-000000000004")).toBe(
      "eeeeeeee-5555-4e55-8e55-000000000004",
    );
  });

  it("skips an entry with no id", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText('{"spaces":[{"name":"Nameless"}]}', problems);
    expect(index.size).toBe(0);
  });

  it("skips non-object entries in a list", () => {
    const problems = createProblemCollector();
    const index = parseSpacesText('{"spaces":["not-an-object", 42, null]}', problems);
    expect(index.size).toBe(0);
  });

  it("records malformed-spaces on invalid JSON, returns an empty index and does not throw", () => {
    const problems = createProblemCollector();
    let index;
    expect(() => {
      index = parseSpacesText(readText(SPACES_MALFORMED_JSON), problems);
    }).not.toThrow();
    expect(index!.size).toBe(0);
    expect(problems.problems).toHaveLength(1);
    expect(problems.problems[0]).toMatchObject({ kind: "malformed-spaces", scope: "spaces" });
  });
});

describe("parseSpacesBytes", () => {
  it("decodes UTF-16 bytes", () => {
    const text = readText(SPACES_LIST_JSON);
    // Re-encode as UTF-16LE with a BOM, mirroring S3's own encoding fixtures.
    const codeUnits = Array.from(text).map((ch) => ch.codePointAt(0)!);
    const utf16 = new Uint8Array(2 + codeUnits.length * 2);
    utf16[0] = 0xff;
    utf16[1] = 0xfe;
    codeUnits.forEach((cp, i) => {
      utf16[2 + i * 2] = cp & 0xff;
      utf16[3 + i * 2] = (cp >> 8) & 0xff;
    });
    const problems = createProblemCollector();
    const index = parseSpacesBytes(utf16, problems);
    expect(index.get("aaaaaaaa-1111-4a11-8a11-000000000001")).toBe("Alpha");
  });

  it("decodes UTF-8-BOM bytes", () => {
    const text = readText(SPACES_LIST_JSON);
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    const problems = createProblemCollector();
    const index = parseSpacesBytes(withBom, problems);
    expect(index.get("aaaaaaaa-1111-4a11-8a11-000000000001")).toBe("Alpha");
  });
});

describe("mergeSpaceIndexes", () => {
  it("merges two profiles, later entries winning on conflict", () => {
    const first = new Map([
      ["s1", "First-Name"],
      ["s2", "Shared"],
    ]);
    const second = new Map([["s2", "Second-Wins"]]);
    const merged = mergeSpaceIndexes([first, second]);
    expect(merged.get("s1")).toBe("First-Name");
    expect(merged.get("s2")).toBe("Second-Wins");
  });
});
