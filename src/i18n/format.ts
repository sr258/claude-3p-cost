import { translate } from "./translate.js";
import type { Locale } from "./types.js";

/**
 * BCP-47 tags backing the app's two locales. Never leaves this module — the
 * rest of the app only knows "de" | "en" (§2 Q4 of the S2 plan). en-GB
 * (not en-US) is day-first, so a screenshot in one locale reads correctly to
 * a user of the other.
 */
const LOCALE_TAG: Record<Locale, string> = { de: "de-DE", en: "en-GB" };

const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const collatorCache = new Map<Locale, Intl.Collator>();

function getNumberFormatter(locale: Locale, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = numberFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE_TAG[locale], options);
    numberFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

function getDateFormatter(
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = dateFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE_TAG[locale], options);
    dateFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

function getCollator(locale: Locale): Intl.Collator {
  let collator = collatorCache.get(locale);
  if (!collator) {
    collator = new Intl.Collator(LOCALE_TAG[locale]);
    collatorCache.set(locale, collator);
  }
  return collator;
}

/**
 * The one place a real, locale-aware text comparison happens (S9 plan §2
 * Q10). `src/model/report.ts` bans `localeCompare` and defaults to code-unit
 * order; the UI injects this function, bound to the active locale, so a
 * German user sorting titles gets "Ärger" ordered with its base letter
 * instead of after "Z".
 */
export function compareText(locale: Locale, a: string, b: string): number {
  return getCollator(locale).compare(a, b);
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return getNumberFormatter(locale, options).format(value);
}

/**
 * Deliberately NOT `style: "currency"` (§2 Q4 of the S2 plan, verified
 * against the real compiler and Intl output during planning): with
 * `style: "currency"`, Intl produces "1.413,58 $" / "$1,413.58" — a currency
 * SYMBOL, contradicting NFR-7's own example. `currencyDisplay: "code"` fixes
 * the symbol but puts "USD" before the English number, wrong order. The only
 * way to reproduce NFR-7's literal examples ("1.413,58 USD" / "1,413.58 USD")
 * is to format the plain number, then append U+00A0 and the currency code.
 * Do not "fix" this back to `style: "currency"`.
 */
export function formatCurrency(locale: Locale, value: number, currency = "USD"): string {
  const number = formatNumber(locale, value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${number} ${currency}`;
}

export function formatDate(
  locale: Locale,
  value: Date | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return getDateFormatter(locale, options).format(value);
}

export function formatDateTime(locale: Locale, value: Date | number): string {
  return formatDate(locale, value, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Worded units, never Intl.DurationFormat: that API is absent on Node 22,
 * which is what CI runs (verified during S8 planning:
 * `typeof Intl.DurationFormat === "undefined"`). Digits go through
 * `formatNumber`; only the unit assembly is ours, exactly as with
 * `formatCurrency` above.
 *
 * Rounds toward zero on each component; a negative or non-finite input is
 * treated as zero. Below one minute it reports whole seconds, so `0` renders
 * as the zero-seconds form rather than an empty string.
 */
export function formatDuration(locale: Locale, ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.trunc(safeMs / 1000);
  const hours = Math.trunc(totalSeconds / 3600);
  const minutes = Math.trunc((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours >= 1) {
    return translate(locale, "duration.hoursMinutes", {
      hours: formatNumber(locale, hours),
      minutes: formatNumber(locale, minutes),
    });
  }
  if (minutes >= 1) {
    return translate(locale, "duration.minutes", { minutes: formatNumber(locale, minutes) });
  }
  return translate(locale, "duration.seconds", { seconds: formatNumber(locale, seconds) });
}
