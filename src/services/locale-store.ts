import type { Locale } from "../i18n/types.js";

/**
 * Persists the locale override in `localStorage`. Works identically in the
 * Vite dev browser and the Tauri WebView, needs no fs capability. Same
 * defensive shape as CalView's `services/favorites-store.ts`: a throwing
 * `localStorage` (private mode, quota) never propagates.
 */
const STORAGE_KEY = "claude3pcost.locale";

function isLocale(value: string): value is Locale {
  return value === "de" || value === "en";
}

/**
 * Returns the stored locale, or `null` for an absent key, an unrecognised
 * value, or a throwing `localStorage`.
 */
export function loadStoredLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value !== null && isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Stores `locale`. Swallows write failures. */
export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore: private mode, quota exceeded, or storage disabled.
  }
}
