/**
 * Behavioural cover for the S15 rewrite of `fake-tauri-plugin.ts`'s standing
 * invariant (plan §5.4, LEARNINGS: "a source-level grep guard ... write the
 * module's documentation around the words it must avoid, and pair the grep
 * with a behavioural test that actually exercises the property the grep is
 * a stand-in for. The behavioural test is the one that holds; treat the
 * grep as the weaker half.") — `check-no-fake.js` only proves the fake is
 * absent from `dist/`; it says nothing about what the fake itself would do
 * if it WERE reachable. This file is that behavioural half.
 *
 * A plain node-side Playwright test, not a browser spec: `testDir: "e2e"`
 * in `playwright.config.ts` picks up any `*.test.ts` under it by
 * `@playwright/test`'s default `testMatch`, and `vite.config.ts`'s Vitest
 * `include` deliberately does not cover `e2e/` (S8), so this file's home is
 * the Playwright runner, exercising the fake module directly — no page, no
 * browser fixture needed.
 */
import { expect, test } from "@playwright/test";
import { exists, invoke, readFile, type FakeTree } from "./fake-tauri-plugin.js";

const TREE: FakeTree = Object.freeze({
  directories: Object.freeze(["root"]),
  files: Object.freeze({ "root/audit.jsonl": "original content\n" }),
  hostEnvironment: Object.freeze({
    platform: "linux",
    localAppData: null,
    appData: null,
    home: null,
  }),
});

function withTree<T>(tree: FakeTree, body: () => Promise<T>): Promise<T> {
  const globalRef = globalThis as Record<string, unknown>;
  const previousTree = globalRef.__C3P_E2E_TREE__;
  const previousSink = globalRef.__C3P_E2E_SAVED__;
  globalRef.__C3P_E2E_TREE__ = tree;
  globalRef.__C3P_E2E_SAVED__ = undefined;
  return body().finally(() => {
    globalRef.__C3P_E2E_TREE__ = previousTree;
    globalRef.__C3P_E2E_SAVED__ = previousSink;
  });
}

test("write_export_file cannot mutate the fake tree", async () => {
  await withTree(TREE, async () => {
    // The path passed IS an existing node in the tree — the strongest case:
    // if the write reached the tree, this exact file would be overwritten.
    await invoke("write_export_file", {
      path: "root/audit.jsonl",
      contents: "MALICIOUS OVERWRITE",
    });

    expect(await exists("root/audit.jsonl")).toBe(true);
    const bytes = await readFile("root/audit.jsonl");
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe("original content\n"); // unchanged: the tree was never touched
  });
});

test("read_import_file reads only from the saved sink", async () => {
  await withTree(TREE, async () => {
    // Not written to the sink, but IS in the tree: read_import_file must
    // still fail — it never falls back to the tree.
    await expect(invoke("read_import_file", { path: "root/audit.jsonl" })).rejects.toThrow();

    await invoke("write_export_file", { path: "export.json", contents: "{}" });
    const read = await invoke<string>("read_import_file", { path: "export.json" });
    expect(read).toBe("{}");
  });
});

test("an unrecognised invoke still throws with the marker", async () => {
  await withTree(TREE, async () => {
    await expect(invoke("fs_delete_everything")).rejects.toThrow(/__C3P_E2E_FAKE_TAURI_PLUGIN__/);
  });
});
