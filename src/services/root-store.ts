/**
 * `localStorage` persistence of the user's manually chosen root folders
 * (US-1.2, S7 plan §5.4). Mirrors `locale-store.ts`'s defensive shape: a
 * throwing `localStorage`, an absent key, a non-array value or a non-string
 * element all degrade to `[]`, never to an exception.
 *
 * A revisit candidate for S21 (plan §1 deviation 4): the acceptance
 * criterion asks for "the app config directory"; the WebView's
 * `localStorage` is app-specific per-user storage, but not literally that
 * directory.
 */
import { normalizePath } from "../model/paths.js";

const STORAGE_KEY = "claude3pcost.roots";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Returns `[]` for an absent key, a malformed value, or a throwing `localStorage`. */
export function loadManualRoots(): readonly string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isStringArray(parsed)) {
      return [];
    }
    return Object.freeze([...new Set(parsed.map((path) => normalizePath(path)))]);
  } catch {
    return [];
  }
}

/** Normalises and de-duplicates before storing. Swallows write failures. */
export function storeManualRoots(roots: readonly string[]): void {
  try {
    const deduped = [...new Set(roots.map((path) => normalizePath(path)))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // Ignore: private mode, quota exceeded, or storage disabled.
  }
}
