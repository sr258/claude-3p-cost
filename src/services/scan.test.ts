import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitLines } from "../model/encoding.js";
import { BASIC_JSONL } from "../../test/fixtures/audit/index.js";
import { createFakeFileSystem } from "../../test/fixtures/fs/index.js";
import type { Discovery, DiscoveredProfile, DiscoveredSession } from "./discovery.js";
import { scanDiscovery } from "./scan.js";

function basicLines(): readonly string[] {
  return splitLines(readFileSync(BASIC_JSONL, "utf-8"));
}

function discoveryOf(
  sessions: readonly DiscoveredSession[],
  profiles: readonly DiscoveredProfile[] = [],
): Discovery {
  return {
    roots: [],
    searched: [],
    profiles,
    sessions,
    accountCount: sessions.length > 0 ? 1 : 0,
    profileCount: profiles.length,
    problems: [],
  };
}

const OK_SESSION: DiscoveredSession = {
  sessionId: "sess-ok",
  auditPath: "root/acct/profile/sess-ok/audit.jsonl",
  rootPath: "root",
  accountId: "acct",
  profileId: "profile",
};

describe("scanDiscovery", () => {
  it("builds a Report whose totals match the fixture audit logs", async () => {
    const fs = createFakeFileSystem({
      auditLogs: { [OK_SESSION.auditPath]: { lines: basicLines() } },
    });

    const { report } = await scanDiscovery(fs, discoveryOf([OK_SESSION]));

    expect(report.sessions).toHaveLength(1);
    expect(report.totals.requests).toBe(3);
    expect(report.totals.costMicroUsd).toBe(500000);
  });

  it("carries the decode-replacement problem from the stream into the report", async () => {
    const session: DiscoveredSession = {
      sessionId: "sess-replace",
      auditPath: "root/acct/profile/sess-replace/audit.jsonl",
      rootPath: "root",
      accountId: "acct",
      profileId: "profile",
    };
    const fs = createFakeFileSystem({
      auditLogs: {
        [session.auditPath]: {
          lines: ['{"type":"result","total_cost_usd":0.01}'],
          hadReplacement: true,
        },
      },
    });

    const { report } = await scanDiscovery(fs, discoveryOf([session]));

    const problem = report.problems.find((p) => p.kind === "decode-replacement");
    expect(problem).toBeDefined();
    expect(problem!.scope).toBe("sess-replace");
  });

  it("records unreadable-file for one session and still reports the others", async () => {
    const badSession: DiscoveredSession = {
      sessionId: "sess-bad",
      auditPath: "root/acct/profile/sess-bad/audit.jsonl",
      rootPath: "root",
      accountId: "acct",
      profileId: "profile",
    };
    const fs = createFakeFileSystem({
      auditLogs: { [OK_SESSION.auditPath]: { lines: basicLines() } },
      unreadableFiles: [badSession.auditPath],
    });

    const { report } = await scanDiscovery(fs, discoveryOf([OK_SESSION, badSession]));

    expect(report.sessions).toHaveLength(1);
    expect(report.totals.costMicroUsd).toBe(500000);
    const problem = report.problems.find((p) => p.kind === "unreadable-file");
    expect(problem).toBeDefined();
    expect(problem!.scope).toBe("sess-bad");
  });

  it("reports progress once per session", async () => {
    const secondSession: DiscoveredSession = {
      sessionId: "sess-second",
      auditPath: "root/acct/profile/sess-second/audit.jsonl",
      rootPath: "root",
      accountId: "acct",
      profileId: "profile",
    };
    const fs = createFakeFileSystem({
      auditLogs: {
        [OK_SESSION.auditPath]: { lines: basicLines() },
        [secondSession.auditPath]: { lines: [] },
      },
    });

    const calls: Array<[number, number]> = [];
    await scanDiscovery(fs, discoveryOf([OK_SESSION, secondSession]), {
      onProgress: (done, total) => calls.push([done, total]),
    });

    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  function threeSessions(): {
    fs: ReturnType<typeof createFakeFileSystem>;
    sessions: readonly DiscoveredSession[];
  } {
    const sessions: DiscoveredSession[] = [
      OK_SESSION,
      {
        sessionId: "sess-second",
        auditPath: "root/acct/profile/sess-second/audit.jsonl",
        rootPath: "root",
        accountId: "acct",
        profileId: "profile",
      },
      {
        sessionId: "sess-third",
        auditPath: "root/acct/profile/sess-third/audit.jsonl",
        rootPath: "root",
        accountId: "acct",
        profileId: "profile",
      },
    ];
    const fs = createFakeFileSystem({
      auditLogs: {
        [sessions[0]!.auditPath]: { lines: basicLines() },
        [sessions[1]!.auditPath]: { lines: basicLines() },
        [sessions[2]!.auditPath]: { lines: basicLines() },
      },
    });
    return { fs, sessions };
  }

  it("emits at least one partial report before resolving", async () => {
    const { fs, sessions } = threeSessions();
    const partials: number[] = [];

    const { report: finalReport } = await scanDiscovery(fs, discoveryOf(sessions), {
      partialIntervalMs: 0,
      onPartial: (partial) => partials.push(partial.sessions.length),
    });

    expect(partials.length).toBeGreaterThan(0);
    expect(finalReport.sessions).toHaveLength(3);
  });

  it("a partial report contains only the sessions parsed so far", async () => {
    const { fs, sessions } = threeSessions();
    const partials: number[] = [];

    await scanDiscovery(fs, discoveryOf(sessions), {
      partialIntervalMs: 0,
      onPartial: (partial) => partials.push(partial.sessions.length),
    });

    expect(partials[0]).toBe(1);
    expect(partials[partials.length - 1]).toBeLessThanOrEqual(3);
    for (let i = 1; i < partials.length; i += 1) {
      expect(partials[i]).toBeGreaterThanOrEqual(partials[i - 1]!);
    }
  });

  it("the final report is identical whether or not onPartial was supplied", async () => {
    const first = threeSessions();
    const withoutPartial = await scanDiscovery(first.fs, discoveryOf(first.sessions));

    const second = threeSessions();
    const withPartial = await scanDiscovery(second.fs, discoveryOf(second.sessions), {
      partialIntervalMs: 0,
      onPartial: () => {},
    });

    expect(withPartial).toEqual(withoutPartial);
  });
});
