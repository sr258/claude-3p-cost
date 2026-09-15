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

function getNumberFormatter(locale: Locale, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = numberFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE_TAG[locale], options);
    numberFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

function getDateFormatter(locale: Locale, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${JSON.stringify(options ?? {})}`;
  let formatter = dateFormatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALE_TAG[locale], options);
    dateFormatterCache.set(cacheKey, formatter);
  }
  return formatter;
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
