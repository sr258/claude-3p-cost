// @vitest-environment node
/**
 * The reference check (S6 plan §7). Boots a real Vite dev server carrying
 * `referenceFsPlugin`, then drives the real `createDevFileSystem()` through
 * the real `discover()` and `scanDiscovery()` against the real
 * `reference-material/` tree. Skips cleanly when that directory is absent —
 * as it will be in CI, since the directory is gitignored. Every number below
 * is asserted, never logged: Vitest's default reporter swallows
 * `console.log` from passing tests (`LEARNINGS.md`).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";
import { createDevFileSystem, DEV_FS_PREFIX } from "./filesystem-dev.js";
import { discover } from "./discovery.js";
import { scanDiscovery } from "./scan.js";
import type { FileSystem } from "./filesystem.js";

const dir = process.env.CLAUDE3P_REFERENCE_DIR ?? join(process.cwd(), "reference-material");

describe.skipIf(!existsSync(dir))("reference filesystem", () => {
  let server: ViteDevServer;
  let fs: FileSystem;

  beforeAll(async () => {
    const { createServer } = await import("vite");
    const referenceFsPlugin = (await import("../../plugins/vite-plugin-reference-fs.js")).default;

    server = await createServer({
      configFile: false,
      root: process.cwd(),
      logLevel: "silent",
      plugins: [referenceFsPlugin({ dir })],
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer?.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}${DEV_FS_PREFIX}`;
    fs = createDevFileSystem({ baseUrl });
  }, 30_000);

  afterAll(async () => {
    await server?.close();
  });

  it("discovers 150 sessions, 2 accounts and 2 profiles through the dev middleware", async () => {
    const discovery = await discover(fs);
    expect(discovery.sessions).toHaveLength(150);
    expect(discovery.accountCount).toBe(2);
    expect(discovery.profileCount).toBe(2);
  }, 60_000);

  it("finds 152 manifests across both roots", async () => {
    const discovery = await discover(fs);
    const manifestCount = discovery.profiles.reduce(
      (sum, profile) => sum + profile.manifestPaths.length,
      0,
    );
    expect(manifestCount).toBe(152);
  }, 60_000);

  it("reproduces the reference totals through the dev filesystem", async () => {
    const discovery = await discover(fs);
    const { report } = await scanDiscovery(fs, discovery);

    expect(report.totals.requests).toBe(508);
    expect(report.projectGroups).toHaveLength(7);
    expect(report.folderGroups).toHaveLength(26);
    expect(report.totals.costMicroUsd).toBe(1_413_585_188);
  }, 120_000);

  it("degrades to zero roots and no error when the configured directory is absent", async () => {
    const { createServer } = await import("vite");
    const referenceFsPlugin = (await import("../../plugins/vite-plugin-reference-fs.js")).default;

    const missingServer = await createServer({
      configFile: false,
      root: process.cwd(),
      logLevel: "silent",
      plugins: [referenceFsPlugin({ dir: join(dir, "does-not-exist") })],
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    try {
      await missingServer.listen();
      const address = missingServer.httpServer?.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}${DEV_FS_PREFIX}`;
      const missingFs = createDevFileSystem({ baseUrl });

      const discovery = await discover(missingFs);
      expect(discovery.roots).toHaveLength(0);
      expect(discovery.searched).toHaveLength(2);
    } finally {
      await missingServer.close();
    }
  }, 30_000);
});
