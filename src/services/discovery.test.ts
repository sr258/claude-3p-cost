import { describe, expect, it } from "vitest";
import type { RootCandidate } from "../model/discovery-paths.js";
import { createFakeFileSystem } from "../../test/fixtures/fs/index.js";
import { discover } from "./discovery.js";

function candidate(path: string): RootCandidate {
  return { path, label: path, origin: "auto" };
}

describe("discover", () => {
  it("treats a directory containing audit.jsonl as a session and does not descend into it", async () => {
    // A descending impl reports two sessions: the real one and the nested
    // uploads/audit.jsonl inside it.
    const fs = createFakeFileSystem({
      candidates: [candidate("root-a")],
      auditLogs: {
        "root-a/acct1/profile1/sess1/audit.jsonl": { lines: [] },
        "root-a/acct1/profile1/sess1/uploads/audit.jsonl": { lines: [] },
      },
    });

    const discovery = await discover(fs);

    expect(discovery.sessions).toHaveLength(1);
    expect(discovery.sessions[0]!.auditPath).toBe("root-a/acct1/profile1/sess1/audit.jsonl");
  });

  it("counts only accounts and profiles that yielded data", async () => {
    // root-a carries a decoy account with no session, manifest or
    // spaces.json anywhere beneath it.
    const fs = createFakeFileSystem({
      candidates: [candidate("root-a")],
      directories: ["root-a/acctDecoy/profileDecoy"],
      auditLogs: {
        "root-a/acct1/profile1/sess1/audit.jsonl": { lines: [] },
      },
    });

    const discovery = await discover(fs);

    expect(discovery.accountCount).toBe(1);
    expect(discovery.profileCount).toBe(1);
    expect(discovery.roots[0]!.accounts).toBe(1);
    expect(discovery.roots[0]!.profiles).toBe(1);
  });

  it("reports a candidate whose stat is null as searched but not as a root", async () => {
    const fs = createFakeFileSystem({
      candidates: [candidate("root-missing")],
    });

    const discovery = await discover(fs);

    expect(discovery.searched).toHaveLength(1);
    expect(discovery.searched[0]!.path).toBe("root-missing");
    expect(discovery.roots).toHaveLength(0);
  });

  it("records unreadable-directory and continues with the other root", async () => {
    const fs = createFakeFileSystem({
      candidates: [candidate("root-bad"), candidate("root-good")],
      directories: ["root-bad"],
      unreadableDirectories: ["root-bad"],
      auditLogs: {
        "root-good/acct1/profile1/sess1/audit.jsonl": { lines: [] },
      },
    });

    const discovery = await discover(fs);

    expect(discovery.sessions).toHaveLength(1);
    expect(discovery.sessions[0]!.rootPath).toBe("root-good");
    const problem = discovery.problems.find((p) => p.kind === "unreadable-directory");
    expect(problem).toBeDefined();
    expect(problem!.scope).not.toContain("/");
  });

  it("collects a permission failure on a candidate root and continues with the next", async () => {
    // An impl that leaves fs.stat() unguarded throws out of discover()
    // entirely and loses the second root (NFR-3).
    const fs = createFakeFileSystem({
      candidates: [candidate("root-denied"), candidate("root-good")],
      directories: ["root-denied"],
      unstatablePaths: ["root-denied"],
      auditLogs: {
        "root-good/acct1/profile1/sess1/audit.jsonl": { lines: [] },
      },
    });

    const discovery = await discover(fs);

    expect(discovery.sessions).toHaveLength(1);
    expect(discovery.sessions[0]!.rootPath).toBe("root-good");
    expect(discovery.roots.map((r) => r.candidate.path)).toEqual(["root-good"]);
    const problem = discovery.problems.find((p) => p.kind === "unreadable-directory");
    expect(problem).toBeDefined();
    expect(problem!.scope).toBe("root-denied");
    expect(problem!.scope).not.toContain("/");
  });

  it("stops at the depth limit instead of walking a deep payload tree", async () => {
    const fs = createFakeFileSystem({
      candidates: [candidate("root-a")],
      auditLogs: {
        "root-a/acct1/profile1/deep1/deep2/deep3/audit.jsonl": { lines: [] },
      },
    });

    const defaultDepth = await discover(fs);
    expect(defaultDepth.sessions).toHaveLength(0);

    const deeper = await discover(fs, { maxDepth: 6 });
    expect(deeper.sessions).toHaveLength(1);
  });

  it("collects spaces.json and manifests per profile", async () => {
    const fs = createFakeFileSystem({
      candidates: [candidate("root-a")],
      files: {
        "root-a/acct1/profile1/spaces.json": "{}",
        "root-a/acct1/profile1/local_abc123.json": "{}",
      },
      auditLogs: {
        "root-a/acct1/profile1/sess1/audit.jsonl": { lines: [] },
      },
    });

    const discovery = await discover(fs);

    expect(discovery.profiles).toHaveLength(1);
    const profile = discovery.profiles[0]!;
    expect(profile.accountId).toBe("acct1");
    expect(profile.profileId).toBe("profile1");
    expect(profile.spacesPaths).toEqual(["root-a/acct1/profile1/spaces.json"]);
    expect(profile.manifestPaths).toEqual(["root-a/acct1/profile1/local_abc123.json"]);
  });

  it("orders roots by candidate order and entries by code unit", async () => {
    const fs = createFakeFileSystem({
      candidates: [candidate("root-b"), candidate("root-a")],
      auditLogs: {
        "root-a/z-acct/profile1/sess1/audit.jsonl": { lines: [] },
        "root-a/a-acct/profile1/sess1/audit.jsonl": { lines: [] },
        "root-b/acct1/profile1/sess1/audit.jsonl": { lines: [] },
      },
    });

    const discovery = await discover(fs);

    expect(discovery.roots.map((r) => r.candidate.path)).toEqual(["root-b", "root-a"]);
    const rootASessions = discovery.sessions.filter((s) => s.rootPath === "root-a");
    expect(rootASessions.map((s) => s.accountId)).toEqual(["a-acct", "z-acct"]);
  });
});
