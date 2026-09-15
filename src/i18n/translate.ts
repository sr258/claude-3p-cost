import { de } from "./de.js";
import { en } from "./en.js";
import { formatNumber } from "./format.js";
import type { Locale, PluralBase, TArgs, TranslationKey } from "./types.js";

const catalogues: Record<Locale, Record<string, string>> = { de, en };

/**
 * Substitutes every `{name}` occurrence in `template` from `params`. A
 * brace sequence with no matching param is left untouched (not replaced
 * with "undefined"). Factored out of `translate` so the substitution
 * mechanism — repeated placeholders, unmatched braces — is testable without
 * depending on a catalogue key that happens to have that shape (the S2
 * catalogue has none; see plan §2 Q6, "no key seeding").
 */
export function substitute(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) {
    return template;
  }
  return template.replace(/\{([^{}]+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name]);
    }
    return match;
  });
}

/**
 * Looks up `key` in the catalogue for `locale` and substitutes every
 * `{name}` occurrence from `args[0]`. Never throws; falls back to the key
 * itself if the entry is missing at runtime (only reachable via a cast —
 * the compiler forbids this for literal keys). Never falls back to the
 * other locale.
 */
export function translate<K extends TranslationKey>(
  locale: Locale,
  key: K,
  ...args: TArgs<K>
): string {
  const catalogue = catalogues[locale];
  const template = catalogue[key];
  if (template === undefined) {
    return key;
  }
  return substitute(template, args[0] as Record<string, string | number> | undefined);
}

/**
 * Picks `${base}.one` for count === 1, `${base}.other` otherwise, and
 * substitutes `{count}` with the locale-formatted number.
 */
export function translatePlural<B extends PluralBase>(
  locale: Locale,
  base: B,
  count: number,
): string {
  const key = (count === 1 ? `${base}.one` : `${base}.other`) as TranslationKey;
  return translate(locale, key, { count: formatNumber(locale, count) } as never);
}
