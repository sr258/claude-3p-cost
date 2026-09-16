import { describe, expect, it } from "vitest";
import {
  isUnsafeRelativePath,
  joinPath,
  normalizePath,
  pathBasename,
  pathSegments,
} from "./paths.js";

describe("normalizePath", () => {
  it("converts Windows separators and strips one trailing separator", () => {
    expect(normalizePath("a\\b\\c\\")).toBe("a/b/c");
  });

  it("keeps the leading double slash of a UNC path while collapsing other repeats", () => {
    // an impl that collapses every run yields "/server/share"
    expect(normalizePath("\\\\server\\\\share\\\\dir")).toBe("//server/share/dir");
  });

  it("leaves a decomposed umlaut byte-identical", () => {
    // "Muenchen" spelled with a decomposed u + combining diaeresis (NFD) —
    // fails any impl calling .normalize("NFC").
    const nfd = "Mu\u0308nchen";
    expect(normalizePath(nfd)).toBe(nfd);
    expect(normalizePath(nfd).length).toBe(nfd.length);
  });

  it("never resolves . or .. segments", () => {
    expect(normalizePath("a/./b/../c")).toBe("a/./b/../c");
  });
});

describe("joinPath", () => {
  it("joins onto an empty base without a leading separator", () => {
    // an impl that always emits base + "/" + segment produces
    // "/local-agent-mode-sessions", which the middleware rejects as absolute
    expect(joinPath("", "local-agent-mode-sessions")).toBe("local-agent-mode-sessions");
  });

  it("joins a non-empty base with segments", () => {
    expect(joinPath("root", "account", "profile")).toBe("root/account/profile");
  });
});

describe("pathBasename / pathSegments", () => {
  it("returns the last segment", () => {
    expect(pathBasename("a/b/c")).toBe("c");
  });

  it("returns empty string for '' and for '/'", () => {
    expect(pathBasename("")).toBe("");
    expect(pathBasename("/")).toBe("");
  });

  it("splits into non-empty segments", () => {
    expect(pathSegments("//server/share/dir")).toEqual(["server", "share", "dir"]);
  });
});

describe("isUnsafeRelativePath", () => {
  it("treats '..foo' and 'a.b' as legal names but rejects '..' and '.' segments", () => {
    // fails an includes("..") check
    expect(isUnsafeRelativePath("..foo")).toBe(false);
    expect(isUnsafeRelativePath("a.b")).toBe(false);
    expect(isUnsafeRelativePath("a/../b")).toBe(true);
    expect(isUnsafeRelativePath("./a")).toBe(true);
    expect(isUnsafeRelativePath("..")).toBe(true);
    expect(isUnsafeRelativePath(".")).toBe(true);
  });

  it("rejects absolute paths, drive letters and NUL bytes", () => {
    expect(isUnsafeRelativePath("/etc/passwd")).toBe(true);
    expect(isUnsafeRelativePath("C:/Windows")).toBe(true);
    expect(isUnsafeRelativePath("c:\\Windows")).toBe(true);
    expect(isUnsafeRelativePath(`a\u0000b`)).toBe(true);
  });

  it("accepts an ordinary relative path", () => {
    expect(isUnsafeRelativePath("account/profile/session/audit.jsonl")).toBe(false);
  });
});
