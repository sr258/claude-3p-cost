/**
 * Navigation helper shared by every spec (S8 plan §6.9). Installs the fake
 * Tauri surface's tree, a dummy `__TAURI_INTERNALS__` so
 * `createFileSystem()` takes its Tauri branch (`src/services/filesystem.ts`),
 * and an optional locale override — all via `addInitScript`, before the page
 * ever runs application code.
 */
import type { Page } from "@playwright/test";
import type { FakeTree } from "./fake-tauri-plugin.js";
import type { Locale } from "../../src/i18n/types.js";

export interface GotoAppOptions {
  readonly tree: FakeTree;
  readonly locale?: Locale;
}

/** The key `src/services/locale-store.ts` owns. Duplicated here deliberately:
 * that module imports from `src/state/app-state.ts`, which this harness must
 * never import (it would pull the whole app into the Playwright/node
 * context instead of the browser page). */
const LOCALE_STORAGE_KEY = "claude3pcost.locale";

export async function gotoApp(page: Page, options: GotoAppOptions): Promise<void> {
  await page.addInitScript(
    ({ tree, locale, localeKey }) => {
      if (locale) {
        window.localStorage.setItem(localeKey, locale);
      }
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      (window as unknown as Record<string, unknown>).__C3P_E2E_TREE__ = tree;
    },
    { tree: options.tree, locale: options.locale, localeKey: LOCALE_STORAGE_KEY },
  );

  await page.goto("/");
  await page.getByTestId("app-shell").waitFor();
}
