/**
 * The signal-bound public surface of the translation layer. Components
 * import only from this barrel — never `translate.ts` / `format.ts`
 * directly, and never `de.ts` / `en.ts` at all.
 *
 * Reading `locale.value` inside a component's render (via these wrappers)
 * subscribes that component to the locale signal, which is what makes a
 * language switch re-render text, number, currency and date together
 * without a reload.
 */
import { locale } from "../state/app-state.js";
import {
  compareText,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from "./format.js";
import { translate, translatePlural } from "./translate.js";
import type { PluralBase, TArgs, TranslationKey } from "./types.js";

export function t<K extends TranslationKey>(key: K, ...args: TArgs<K>): string {
  return translate(locale.value, key, ...args);
}

export function tPlural<B extends PluralBase>(base: B, count: number): string {
  return translatePlural(locale.value, base, count);
}

export function tNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale.value, value, options);
}

export function tCurrency(value: number, currency?: string): string {
  return formatCurrency(locale.value, value, currency);
}

export function tDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
  return formatDate(locale.value, value, options);
}

export function tDateTime(value: Date | number): string {
  return formatDateTime(locale.value, value);
}

export function tDuration(ms: number): string {
  return formatDuration(locale.value, ms);
}

export function tPercent(ratio: number, options?: Intl.NumberFormatOptions): string {
  return formatPercent(locale.value, ratio, options);
}

/** The active-locale `Intl.Collator` comparison, for injecting into `compareSessionRows`. */
export function tCompareText(a: string, b: string): number {
  return compareText(locale.value, a, b);
}

export type { Locale, Params, PluralBase, TranslationKey } from "./types.js";
