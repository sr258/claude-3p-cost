import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifestIndex, lookupManifest, parseManifestText, sessionKeys } from "./manifest.js";
import { createProblemCollector } from "./problems.js";
import {
  MANIFEST_ARCHIVED_STARRED_JSON,
  MANIFEST_COLLISION_A_JSON,
  MANIFEST_COLLISION_B_JSON,
  MANIFEST_EMPTY_SPACE_JSON,
  MANIFEST_MALFORMED_JSON,
  MANIFEST_NO_SESSION_ID_JSON,
  MANIFEST_ORDINARY_JSON,
  MANIFEST_SENSITIVE_FIELDS_JSON,
  MANIFEST_USER_SELECTED_FOLDERS_JSON,
} from "../../test/fixtures/sessions/index.js";

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function fileNameOf(path: string): string {
  return basename(path);
}

describe("sessionKeys", () => {
  it("yields the 8-hex session directory name for a local_<uuid> manifest (the headline trap)", () => {
    const keys = sessionKeys(
      { sessionId: "local_11112222-aaaa-bbbb-cccc-111122223333", cliSessionId: null, cwd: null },
      "local_11112222-aaaa-bbbb-cccc-111122223333.json",
    );
    expect(keys).toContain("11112222");
  });

  it("includes the raw and local_-stripped forms of all four candidates", () => {
    const keys = sessionKeys(
      {
        sessionId: "local_sess-full",
        cliSessionId: "local_cli-full",
        cwd: "C:\\Users\\fakeuser\\sessions\\cwd-full\\outputs",
      },
      "local_file-full.json",
    );
    // file name candidate (already local_-stripped by construction)
    expect(keys).toContain("file");
    expect(keys).toContain("file-full");
    // sessionId candidate, raw and stripped
    expect(keys).toContain("local_sess-full");
    expect(keys).toContain("sess-full");
    expect(keys).toContain("sess");
    // cliSessionId candidate, raw and stripped
    expect(keys).toContain("local_cli-full");
    expect(keys).toContain("cli-full");
    expect(keys).toContain("cli");
    // cwd-derived candidate
    expect(keys).toContain("cwd-full");
    expect(keys).toContain("cwd");
  });

  it("falls back to the file name when sessionId is missing", () => {
    const keys = sessionKeys(
      { sessionId: null, cliSessionId: null, cwd: null },
      "local_onlyfile.json",
    );
    expect(keys).toContain("onlyfile");
  });

  it("contributes keys from cliSessionId", () => {
    const keys = sessionKeys(
      { sessionId: null, cliSessionId: "cli-only-1234", cwd: null },
      "local_x.json",
    );
    expect(keys).toContain("cli-only-1234");
    expect(keys).toContain("cli");
  });

  it("contributes a key from cwd via sessionIdFromCwd", () => {
    const keys = sessionKeys(
      {
        sessionId: null,
        cliSessionId: null,
        cwd: "C:\\Users\\fakeuser\\sessions\\deadbeef\\outputs",
      },
      "local_x.json",
    );
    expect(keys).toContain("deadbeef");
  });

  it("output is sorted and free of empty strings", () => {
    const keys = sessionKeys({ sessionId: "a-b", cliSessionId: null, cwd: null }, "local_x.json");
    expect(keys).not.toContain("");
    expect([...keys]).toEqual([...keys].sort());
  });
});

describe("parseManifestText", () => {
  it("SessionMeta has no cwd key", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      fileNameOf(MANIFEST_ORDINARY_JSON),
      problems,
    );
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!.meta)).not.toContain("cwd");
  });

  it("does not retain systemPrompt, initialMessage, emailAddress or instructions", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_SENSITIVE_FIELDS_JSON),
      fileNameOf(MANIFEST_SENSITIVE_FIELDS_JSON),
      problems,
    );
    expect(parsed).not.toBeNull();
    const keys = Object.keys(parsed!.meta);
    expect(keys).not.toContain("systemPrompt");
    expect(keys).not.toContain("initialMessage");
    expect(keys).not.toContain("emailAddress");
    expect(keys).not.toContain("instructions");
  });

  it("normalises spaceId: '' to null", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_EMPTY_SPACE_JSON),
      fileNameOf(MANIFEST_EMPTY_SPACE_JSON),
      problems,
    );
    expect(parsed!.meta.spaceId).toBeNull();
  });

  it("prefers resolvedFolderKinds over userSelectedFolders", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      fileNameOf(MANIFEST_ORDINARY_JSON),
      problems,
    );
    expect(parsed!.meta.folders).toEqual([
      {
        display: "widget-app",
        path: "C:/Users/fakeuser/Projects/widget-app",
        kind: "local",
      },
      {
        display: "widget-data",
        path: "//fakeserver/share/widget-data",
        kind: "network-drive",
      },
    ]);
  });

  it("falls back to userSelectedFolders in string and object form", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      fileNameOf(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      problems,
    );
    const displays = parsed!.meta.folders.map((f) => f.display);
    expect(displays).toEqual([
      "gizmo-tool",
      "reports",
      "old-notes",
      "fallback-name-only",
      "shared",
      "shared",
    ]);
  });

  it("a userSelectedFolders entry whose only path-like field is display keeps the full path", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      fileNameOf(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      problems,
    );
    // Both entries basename to "shared". If `display` were not treated as
    // path-like, both would get path null and the S5 folder grouping key would
    // fall back to the shared basename, merging two unrelated folders.
    expect(parsed!.meta.folders[4].path).toBe("E:/clients/alpha-corp/shared");
    expect(parsed!.meta.folders[5].path).toBe("E:/clients/beta-corp/shared");
  });

  it("folder display is the basename for a backslash path with a trailing separator", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      fileNameOf(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      problems,
    );
    expect(parsed!.meta.folders[0]).toEqual({
      display: "gizmo-tool",
      path: "C:/Users/fakeuser/Projects/gizmo-tool",
      kind: null,
    });
  });

  it("a userSelectedFolders entry with only a name field has a null path", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      fileNameOf(MANIFEST_USER_SELECTED_FOLDERS_JSON),
      problems,
    );
    expect(parsed!.meta.folders[3]).toEqual({
      display: "fallback-name-only",
      path: null,
      kind: null,
    });
  });

  it("carries kind through for resolvedFolderKinds entries", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      fileNameOf(MANIFEST_ORDINARY_JSON),
      problems,
    );
    expect(parsed!.meta.folders.map((f) => f.kind)).toEqual(["local", "network-drive"]);
  });

  it("isArchived and isStarred default to false", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      fileNameOf(MANIFEST_ORDINARY_JSON),
      problems,
    );
    expect(parsed!.meta.isArchived).toBe(false);
    expect(parsed!.meta.isStarred).toBe(false);
  });

  it("reads isArchived and isStarred when true", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ARCHIVED_STARRED_JSON),
      fileNameOf(MANIFEST_ARCHIVED_STARRED_JSON),
      problems,
    );
    expect(parsed!.meta.isArchived).toBe(true);
    expect(parsed!.meta.isStarred).toBe(true);
  });

  it("derives keys from the file name when sessionId is absent", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_NO_SESSION_ID_JSON),
      fileNameOf(MANIFEST_NO_SESSION_ID_JSON),
      problems,
    );
    expect(parsed!.keys).toContain("77778888");
    expect(parsed!.meta.sessionId).toBe("77778888-aaaa-bbbb-cccc-777788889999");
  });

  it("records malformed-manifest and returns null on invalid JSON", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_MALFORMED_JSON),
      fileNameOf(MANIFEST_MALFORMED_JSON),
      problems,
    );
    expect(parsed).toBeNull();
    expect(problems.problems).toHaveLength(1);
    expect(problems.problems[0].kind).toBe("malformed-manifest");
  });

  it("returns null for non-object JSON", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText("[1, 2, 3]", "local_x.json", problems);
    expect(parsed).toBeNull();
    expect(problems.count).toBe(0);
  });
});

describe("lookupManifest", () => {
  it("finds a session by full uuid, by 8-hex directory name, by sourceId and by truncated sourceId", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      fileNameOf(MANIFEST_ORDINARY_JSON),
      problems,
    );
    const index = buildManifestIndex([parsed!], problems);

    expect(
      lookupManifest(index, {
        sessionId: "11112222-aaaa-bbbb-cccc-111122223333",
        sourceId: "does-not-matter",
      }),
    ).not.toBeNull();
    expect(
      lookupManifest(index, { sessionId: "11112222", sourceId: "does-not-matter" }),
    ).not.toBeNull();
    expect(
      lookupManifest(index, {
        sessionId: "no-match-at-all",
        sourceId: "11112222-aaaa-bbbb-cccc-111122223333",
      }),
    ).not.toBeNull();
    expect(
      lookupManifest(index, { sessionId: "no-match-at-all", sourceId: "11112222" }),
    ).not.toBeNull();
    expect(
      lookupManifest(index, { sessionId: "no-match-at-all", sourceId: "still-no-match" }),
    ).toBeNull();
  });
});

describe("buildManifestIndex", () => {
  it("two manifests sharing a key keep the first and record duplicate-session-key", () => {
    const problems = createProblemCollector();
    const parsedA = parseManifestText(
      readText(MANIFEST_COLLISION_A_JSON),
      fileNameOf(MANIFEST_COLLISION_A_JSON),
      problems,
    )!;
    const parsedB = parseManifestText(
      readText(MANIFEST_COLLISION_B_JSON),
      fileNameOf(MANIFEST_COLLISION_B_JSON),
      problems,
    )!;
    // Deterministic order, sorted by file name — see buildManifestIndex's doc comment.
    const sorted = [parsedA, parsedB].sort((a, b) =>
      a.meta.sessionId.localeCompare(b.meta.sessionId),
    );
    const index = buildManifestIndex(sorted, problems);

    expect(index.get("sharedproject")?.sessionId).toBe(sorted[0].meta.sessionId);
    const dupes = problems.problems.filter((p) => p.kind === "duplicate-session-key");
    expect(dupes.length).toBeGreaterThan(0);
    for (const dupe of dupes) {
      expect(dupe.scope).not.toBe("sharedproject");
      expect(dupe.hint).toBe("sessionKey");
    }
  });

  it("a key shared by one manifest with itself records nothing", () => {
    const problems = createProblemCollector();
    const parsed = parseManifestText(
      readText(MANIFEST_ORDINARY_JSON),
      fileNameOf(MANIFEST_ORDINARY_JSON),
      problems,
    )!;
    buildManifestIndex([parsed, parsed], problems);
    expect(problems.problems.filter((p) => p.kind === "duplicate-session-key")).toHaveLength(0);
  });
});
