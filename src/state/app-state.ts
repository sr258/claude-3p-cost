/**
 * All mutable application state, as Preact Signals (architecture rule 1).
 *
 * S2 holds only the locale signal. Dependency direction is i18n → state:
 * the signal-bound barrel `src/i18n/index.ts` reads this module, so this
 * module must never import that barrel (that would be a cycle), and it must
 * store translation keys, never translated strings.
 *
 * Importing the leaf modules `i18n/detect.ts` and `i18n/types.ts` is not a
 * cycle — neither depends on this file — and it is the only way to keep a
 * single, tested definition of the OS-locale rule. Duplicating that rule here
 * would leave the shipped copy untested and free to drift from NFR-7.
 */
import { effect, signal } from "@preact/signals";
import { detectLocale } from "../i18n/detect.js";
import type { Locale } from "../i18n/types.js";
import type { Report } from "../model/report-types.js";
import { discover, type Discovery } from "../services/discovery.js";
import { createFileSystem, type FileSystem } from "../services/filesystem.js";
import { pickRootFolders, removeRoot } from "../services/folder-picker.js";
import { loadStoredLocale, storeLocale } from "../services/locale-store.js";
import { loadManualRoots } from "../services/root-store.js";
import { scanDiscovery } from "../services/scan.js";

function detectInitialLocale(): Locale {
  const stored = loadStoredLocale();
  if (stored) {
    return stored;
  }
  return detectLocale(navigator.languages ?? [navigator.language]);
}

export const locale = signal<Locale>(detectInitialLocale());

export function setLocale(next: Locale): void {
  locale.value = next;
  storeLocale(next);
}

// Keeps `<html lang>` in sync for screen readers (NFR-11). Guarded for a
// missing `document` so unit tests outside jsdom do not break.
effect(() => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale.value;
  }
});

/**
 * US-1.1/US-1.2/US-1.6 scan state (S7 plan §5.7). `runScan()` is the only
 * caller of `createFileSystem()` -> `discover()` -> `scanDiscovery()`; it
 * never throws (NFR-3) — a failure is recorded as `scanState.value =
 * "failed"`, never an uncaught rejection.
 */
export type ScanState = "idle" | "scanning" | "done" | "failed";

export const scanState = signal<ScanState>("idle");
export const discovery = signal<Discovery | null>(null);
export const report = signal<Report | null>(null);
export const manualRoots = signal<readonly string[]>(loadManualRoots());
export const pickMessage = signal<"none" | "no-session-data" | "failed">("none");

let cachedFs: Promise<FileSystem> | null = null;

function getFileSystem(): Promise<FileSystem> {
  if (cachedFs === null) {
    cachedFs = createFileSystem();
  }
  return cachedFs;
}

/**
 * A `FileSystem`'s `manualRoots` are captured once, at construction
 * (`filesystem.ts` reads `loadManualRoots()` there). Adding or removing a
 * root changes what `localStorage` holds but not the cached instance, so
 * the cache must be dropped whenever the persisted set changes — otherwise
 * the next `runScan()` silently rescans with the stale root list.
 */
function invalidateFileSystemCache(): void {
  cachedFs = null;
}

export async function runScan(): Promise<void> {
  scanState.value = "scanning";
  try {
    const fs = await getFileSystem();
    const foundDiscovery = await discover(fs);
    discovery.value = foundDiscovery;
    const foundReport = await scanDiscovery(fs, foundDiscovery);
    report.value = foundReport;
    scanState.value = "done";
  } catch {
    // NFR-3: a scan failure is recorded, never thrown.
    scanState.value = "failed";
  }
}

export async function chooseFolder(): Promise<void> {
  const fs = await getFileSystem();
  const outcome = await pickRootFolders(fs);
  if (outcome.kind === "cancelled") {
    return;
  }
  if (outcome.kind === "failed") {
    pickMessage.value = "failed";
    return;
  }
  if (outcome.kind === "no-session-data") {
    pickMessage.value = "no-session-data";
    return;
  }
  pickMessage.value = "none";
  manualRoots.value = loadManualRoots();
  invalidateFileSystemCache();
  await runScan();
}

export function removeManualRoot(path: string): void {
  manualRoots.value = removeRoot(path);
  invalidateFileSystemCache();
  void runScan();
}
