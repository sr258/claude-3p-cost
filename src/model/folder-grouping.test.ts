import { describe, expect, it } from "vitest";
import { folderKey, folderRefOf, NO_FOLDER_KEY } from "./folder-grouping.js";
import type { ConnectedFolder } from "./project-types.js";

function folder(overrides: Partial<ConnectedFolder> = {}): ConnectedFolder {
  return { display: "src", path: "/home/fixture/project-a/src", kind: "local", ...overrides };
}

describe("folderRefOf", () => {
  it("no folders yields kind none", () => {
    expect(folderRefOf([])).toEqual({ kind: "none" });
  });

  it("two folders with the same basename but different paths get different keys", () => {
    const a = folderRefOf([folder({ display: "src", path: "/home/fixture/project-a/src" })]);
    const b = folderRefOf([folder({ display: "src", path: "/home/fixture/project-b/src" })]);
    expect(folderKey(a)).not.toBe(folderKey(b));
  });

  it("the folder key cannot collide with the no-folder bucket", () => {
    const ref = folderRefOf([folder({ path: "none" })]);
    expect(folderKey(ref)).not.toBe(NO_FOLDER_KEY);
    expect(folderKey({ kind: "none" })).toBe(NO_FOLDER_KEY);
  });

  it("multiple folders on one session form a single combined bucket", () => {
    const ref = folderRefOf([
      folder({ display: "a", path: "/p/a" }),
      folder({ display: "b", path: "/p/b" }),
    ]);
    expect(ref.kind).toBe("folders");
    if (ref.kind === "folders") {
      expect(ref.folders).toHaveLength(2);
    }
  });

  it("a folder with a null path falls back to its display in the key", () => {
    const withNullPath = folderRefOf([folder({ display: "fallback-name-only", path: null })]);
    const withMatchingPath = folderRefOf([
      folder({ display: "something-else", path: "fallback-name-only" }),
    ]);
    expect(folderKey(withNullPath)).toBe(folderKey(withMatchingPath));
  });

  it("manifest order is preserved, so two orderings are two buckets", () => {
    const ab = folderRefOf([
      folder({ display: "a", path: "/p/a" }),
      folder({ display: "b", path: "/p/b" }),
    ]);
    const ba = folderRefOf([
      folder({ display: "b", path: "/p/b" }),
      folder({ display: "a", path: "/p/a" }),
    ]);
    expect(folderKey(ab)).not.toBe(folderKey(ba));
  });

  it("network-drive kind survives into the FolderRef", () => {
    const ref = folderRefOf([folder({ kind: "network-drive" })]);
    expect(ref.kind).toBe("folders");
    if (ref.kind === "folders") {
      expect(ref.folders[0].kind).toBe("network-drive");
    }
  });
});
