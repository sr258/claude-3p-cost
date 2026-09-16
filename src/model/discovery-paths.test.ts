import { describe, expect, it } from "vitest";
import { rootCandidates, type HostEnvironment } from "./discovery-paths.js";

const WINDOWS_ENV: HostEnvironment = {
  platform: "windows",
  localAppData: "C:\\Users\\jane\\AppData\\Local",
  appData: "C:\\Users\\jane\\AppData\\Roaming",
  home: null,
};

describe("rootCandidates", () => {
  it("lists the four Windows candidates in the US-1.1 order", () => {
    const candidates = rootCandidates(WINDOWS_ENV);
    expect(candidates.map((c) => c.label)).toEqual([
      "%LOCALAPPDATA%\\Claude-3p\\local-agent-mode-sessions",
      "%LOCALAPPDATA%\\Claude-3p\\claude-code-sessions",
      "%APPDATA%\\Claude\\local-agent-mode-sessions",
      "%APPDATA%\\Claude\\claude-code-sessions",
    ]);
    expect(candidates.every((c) => c.origin === "auto")).toBe(true);
  });

  it("omits a candidate whose environment variable is empty", () => {
    // the POC's os.path.join("", …) produces a bogus relative path; an impl
    // that ports it faithfully fails here
    const env: HostEnvironment = { ...WINDOWS_ENV, localAppData: "" };
    const candidates = rootCandidates(env);
    expect(candidates.some((c) => c.label.startsWith("%LOCALAPPDATA%"))).toBe(false);
    expect(candidates).toHaveLength(2);
  });

  it("returns the macOS Application Support candidate for platform macos", () => {
    const env: HostEnvironment = {
      platform: "macos",
      localAppData: null,
      appData: null,
      home: "/Users/jane",
    };
    const candidates = rootCandidates(env);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.label).toBe(
      "~/Library/Application Support/Claude/local-agent-mode-sessions",
    );
    expect(candidates[0]!.path).toBe(
      "/Users/jane/Library/Application Support/Claude/local-agent-mode-sessions",
    );
  });

  it("labels candidates with the unexpanded variable form", () => {
    // an impl that puts the expanded home path in `label` fails
    const candidates = rootCandidates(WINDOWS_ENV);
    for (const candidate of candidates) {
      expect(candidate.label).not.toContain("jane");
      expect(candidate.label).not.toContain("C:");
    }
    expect(candidates[0]!.path).toBe(
      "C:/Users/jane/AppData/Local/Claude-3p/local-agent-mode-sessions",
    );
  });

  it("omits the macOS candidate on a non-macOS platform", () => {
    const candidates = rootCandidates(WINDOWS_ENV);
    expect(candidates.some((c) => c.label.startsWith("~"))).toBe(false);
  });
});
