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
import { computed, effect, signal } from "@preact/signals";
import { detectLocale } from "../i18n/detect.js";
import type { Locale } from "../i18n/types.js";
import {
  ALL_TIME,
  isValidRange,
  rangeFromDayStrings,
  resolvePreset,
  type DateRange,
  type RangePresetId,
} from "../model/date-range.js";
import type { Problem } from "../model/problems.js";
import type { Report } from "../model/report-types.js";
import { buildReport, type SessionSortField, type SortDirection } from "../model/report.js";
import type { ResolvedSession } from "../model/project-types.js";
import { discover, type Discovery } from "../services/discovery.js";
import { createFileSystem, type FileSystem } from "../services/filesystem.js";
import { pickRootFolders, removeRoot } from "../services/folder-picker.js";
import { loadStoredLocale, storeLocale } from "../services/locale-store.js";
import { loadManualRoots } from "../services/root-store.js";
import { scanDiscovery } from "../services/scan.js";
import { localZoneOffset } from "../services/zone.js";

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
/** Epoch ms of the last SUCCESSFUL scan. Null before the first one. */
export const lastScanAt = signal<number | null>(null);

/**
 * US-5.1's date range filter (S13 plan §4.1, §4.7). Module scope, deliberately
 * NOT a signal: never rendered, purely the input to a rebuild. A signal would
 * invite a component to read it directly, bypassing `buildReport`.
 */
let scanInput: { sessions: readonly ResolvedSession[]; problems: readonly Problem[] } | null = null;

export const rangePreset = signal<RangePresetId>("all"); // Q13: "Alles" on start
export const customFromDay = signal<string | null>(null);
export const customToDay = signal<string | null>(null);

/**
 * The last range `activeRange` resolved to something valid (Q15). Kept in a
 * plain variable, not a signal — `activeRange` mutates it as a caching side
 * effect on every recomputation, which would be surprising to observe as a
 * signal in its own right.
 */
let lastValidRange: DateRange = ALL_TIME;

function resolveCurrentRange(): DateRange {
  if (rangePreset.value === "custom") {
    return rangeFromDayStrings(customFromDay.value, customToDay.value, localZoneOffset);
  }
  return resolvePreset(rangePreset.value, Date.now(), localZoneOffset);
}

/** True while the custom from/to pair is invalid (Q15) — "from" after "to". */
export const rangeInvalid = computed<boolean>(() => !isValidRange(resolveCurrentRange()));

/** The resolved range, or the last valid one when the custom pair is invalid (Q15). */
export const activeRange = computed<DateRange>(() => {
  const candidate = resolveCurrentRange();
  if (isValidRange(candidate)) {
    lastValidRange = candidate;
    return candidate;
  }
  return lastValidRange;
});

/** Re-runs buildReport from scanInput. No I/O. No-op before the first scan. */
function rebuildReport(): void {
  if (scanInput === null) {
    return;
  }
  report.value = buildReport(scanInput.sessions, scanInput.problems, {
    zone: localZoneOffset,
    range: activeRange.value,
  });
}

export function setRangePreset(id: RangePresetId): void {
  rangePreset.value = id;
  rebuildReport();
}

export function setCustomDays(from: string | null, to: string | null): void {
  customFromDay.value = from;
  customToDay.value = to;
  rebuildReport();
}

/** Back to "all" (Q13's default), discarding any custom from/to pair. */
export function clearRange(): void {
  rangePreset.value = "all";
  customFromDay.value = null;
  customToDay.value = null;
  rebuildReport();
}

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

/**
 * Never touches `rangePreset` / `customFromDay` / `customToDay` — that is
 * what makes the active period survive a rescan, the same property
 * expansion, sort, scope and panel visibility already have (S13 plan §4.7).
 */
export async function runScan(): Promise<void> {
  scanState.value = "scanning";
  try {
    const fs = await getFileSystem();
    const foundDiscovery = await discover(fs);
    discovery.value = foundDiscovery;
    const result = await scanDiscovery(fs, foundDiscovery, {
      zone: localZoneOffset,
      range: activeRange.value,
      onPartial: (partial) => {
        report.value = partial;
      },
    });
    scanInput = { sessions: result.sessions, problems: result.problems };
    report.value = result.report;
    scanState.value = "done";
    lastScanAt.value = Date.now();
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

/**
 * US-2.4's project/folder toggle (S10 plan §2 Q6, §6.8). A signal only —
 * nothing is written to `localStorage`. Persistence belongs to the settings
 * screen (S15+/S21); a second ad-hoc `localStorage` key now would be a
 * migration later. The signal itself survives a rescan (see below).
 */
export type Grouping = "project" | "folder";

export const grouping = signal<Grouping>("project");

export function setGrouping(next: Grouping): void {
  grouping.value = next;
}

/**
 * US-2.2 drill-down state (S9 plan §2 Q9, §6.5), extended in S10 (plan §2 Q8)
 * to track expansion PER GROUPING. Kept outside `report`, and `runScan()`
 * below never touches any of the signals here — that is what makes
 * expansion, scope and sort survive a rescan, and it is the property S20
 * will lean on for "UI state preserved across an update". `GroupRow.key` is
 * stable across rebuilds (`projectKey`/`folderKey`), so stale keys for groups
 * that no longer exist are harmless and are deliberately NOT pruned: pruning
 * would collapse a group that reappears on a later scan.
 *
 * `projectKey({ kind: "none" })` and `NO_FOLDER_KEY` are both `"\u0000none"`
 * (plan §0.2 item 2), so a single flat set would couple "no project" with
 * "no folder" expansion/selection. Keys are therefore prefixed
 * `` `${grouping}:${GroupRow.key}` `` — plain ASCII with a colon; no new
 * `U+0000` is introduced anywhere in this session (LEARNINGS).
 */
export const expandedGroups = signal<ReadonlySet<string>>(new Set());

function prefixedKey(g: Grouping, groupKey: string): string {
  return `${g}:${groupKey}`;
}

export function toggleGroup(g: Grouping, groupKey: string): void {
  const key = prefixedKey(g, groupKey);
  const next = new Set(expandedGroups.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedGroups.value = next;
}

/** The raw (unprefixed) keys expanded under this grouping. */
export function expandedKeysFor(g: Grouping): ReadonlySet<string> {
  const prefix = `${g}:`;
  const result = new Set<string>();
  for (const key of expandedGroups.value) {
    if (key.startsWith(prefix)) {
      result.add(key.slice(prefix.length));
    }
  }
  return result;
}

/**
 * US-2.3's per-row scope selection (plan §2 Q12), tracked per grouping for
 * the same reason expansion is: both groupings' empty buckets share one key
 * string. `null` is the global scope. Never pruned on a rescan — the panel
 * derives its scope through `findGroup`, which falls back silently to the
 * global scope when the stored key names a group that vanished.
 */
export const selectedGroups = signal<Readonly<Record<Grouping, string | null>>>({
  project: null,
  folder: null,
});

export function selectedGroupKey(g: Grouping): string | null {
  return selectedGroups.value[g];
}

/** The same key again -> null (deselect back to the global scope). */
export function toggleGroupScope(g: Grouping, groupKey: string): void {
  const current = selectedGroups.value[g];
  selectedGroups.value = {
    ...selectedGroups.value,
    [g]: current === groupKey ? null : groupKey,
  };
}

export function clearGroupScope(g: Grouping): void {
  selectedGroups.value = { ...selectedGroups.value, [g]: null };
}

/**
 * US-3.1's session detail disclosure (S11 plan §4.5). Mirrors
 * `expandedGroups` exactly, including the per-grouping prefix and the
 * "never pruned on rescan" property: `runScan()` never touches this signal,
 * so expansion survives a rescan. Session ids are hex directory names, so
 * unlike `projectKey({kind:"none"})` / `NO_FOLDER_KEY` there is no shared
 * sentinel here — but the prefix is kept anyway so that expanding a session
 * under the project grouping does not silently expand it under the folder
 * grouping too.
 */
export const expandedSessions = signal<ReadonlySet<string>>(new Set());

export function toggleSession(g: Grouping, sessionId: string): void {
  const key = prefixedKey(g, sessionId);
  const next = new Set(expandedSessions.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedSessions.value = next;
}

/** The raw (unprefixed) session ids expanded under this grouping. */
export function expandedSessionKeysFor(g: Grouping): ReadonlySet<string> {
  const prefix = `${g}:`;
  const result = new Set<string>();
  for (const key of expandedSessions.value) {
    if (key.startsWith(prefix)) {
      result.add(key.slice(prefix.length));
    }
  }
  return result;
}

/** US-2.3's side panel visibility (plan §2 Q7). Default open. */
export const modelPanelOpen = signal<boolean>(true);

export function setModelPanelOpen(open: boolean): void {
  modelPanelOpen.value = open;
}

/** Each field's own default direction when it becomes newly active (plan §2 Q3). */
const DEFAULT_SORT_DIRECTION: Record<SessionSortField, SortDirection> = {
  cost: "desc",
  requests: "desc",
  duration: "desc",
  lastActivity: "desc",
  title: "asc",
};

export const sessionSortField = signal<SessionSortField>("cost");
export const sessionSortDirection = signal<SortDirection>("desc");

/** Same field -> flip direction. New field -> that field's default direction (plan §2 Q3). */
export function setSessionSort(field: SessionSortField): void {
  if (sessionSortField.value === field) {
    sessionSortDirection.value = sessionSortDirection.value === "asc" ? "desc" : "asc";
  } else {
    sessionSortField.value = field;
    sessionSortDirection.value = DEFAULT_SORT_DIRECTION[field];
  }
}
