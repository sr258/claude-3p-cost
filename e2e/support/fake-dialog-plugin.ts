/**
 * The aliased stand-in for `@tauri-apps/plugin-dialog`, `--mode e2e` only.
 *
 * `folder-picker.ts` imports `open` from the real plugin at module load time
 * regardless of whether a test injects its own `DialogBridge`, so the
 * specifier must resolve to something even though no e2e spec drives the
 * native folder picker through it — that coverage goes through the `bridge`
 * option instead, and `open()` resolving to "cancelled" by default (when
 * `__C3P_E2E_OPEN_PATH__` is unset) preserves that.
 *
 * S15 (US-4.2, plan §5.4) extends this module with `save()`, so the price
 * editor's export/import round trip is driveable from Playwright:
 * `save()` returns `globalThis.__C3P_E2E_SAVE_PATH__`, `open()` (when a test
 * DOES set it) returns `globalThis.__C3P_E2E_OPEN_PATH__`; either returns
 * `null`/`undefined` to simulate the user cancelling the dialog. Needs its
 * OWN module rather than living inside `fake-tauri-plugin.ts`, because
 * `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-dialog` both export a
 * function named `open`, which would collide inside a single fake.
 */

/**
 * The grep marker `scripts/check-no-fake.js` looks for, alongside
 * `fake-tauri-plugin.ts`'s own marker (LEARNINGS: "a bundle-grep guard must
 * key on a string a live code path evaluates" — a bare unused export is
 * tree-shaken away). Interpolated into `save()`'s body, which is on the
 * live call path `src/services/price-export.ts` exercises in the Tauri
 * branch — not left as a stand-alone unused export.
 */
export const C3P_E2E_FAKE_DIALOG_PLUGIN_MARKER = "__C3P_E2E_FAKE_DIALOG_PLUGIN__";

function readGlobal(key: string): unknown {
  return (globalThis as Record<string, unknown>)[key];
}

export async function open(_options: unknown): Promise<string | string[] | null> {
  const value = readGlobal("__C3P_E2E_OPEN_PATH__");
  return value === undefined ? null : (value as string | string[] | null);
}

export async function save(_options: unknown): Promise<string | null> {
  // Evaluated on every call (S15 plan §5.4 marker requirement), not only on
  // an error path: `check-no-fake.js`'s negative control greps the BUILT
  // `dist/` output, and this keeps the marker on a path esbuild cannot
  // prove unreachable and therefore cannot drop.
  console.debug(`fake-dialog-plugin ready [${C3P_E2E_FAKE_DIALOG_PLUGIN_MARKER}]`);
  const value = readGlobal("__C3P_E2E_SAVE_PATH__");
  return value === undefined ? null : (value as string | null);
}
