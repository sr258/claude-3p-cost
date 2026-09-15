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
import { loadStoredLocale, storeLocale } from "../services/locale-store.js";

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
