/**
 * The aliased stand-in for `@tauri-apps/plugin-dialog`, `--mode e2e` only.
 *
 * `folder-picker.ts` imports `open` from the real plugin at module load time
 * regardless of whether a test injects its own `DialogBridge`, so the
 * specifier must resolve to something even though no e2e spec drives the
 * native folder picker. Always resolving to "cancelled" is enough: any e2e
 * coverage of `pickRootFolders` goes through the `bridge` option instead.
 */
export async function open(_options: unknown): Promise<string | string[] | null> {
  return null;
}
