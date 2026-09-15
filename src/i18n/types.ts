import type { de } from "./de.js";

export type Locale = "de" | "en";

export type TranslationKey = keyof typeof de;

/** Placeholder names occurring in a catalogue value, e.g. "Version {version}" → "version". */
export type Placeholder<S extends string> = S extends `${string}{${infer P}}${infer R}`
  ? P | Placeholder<R>
  : never;

export type Params<K extends TranslationKey> = Placeholder<(typeof de)[K]>;

/** No placeholders → no second argument; otherwise a required, exactly-typed params object. */
export type TArgs<K extends TranslationKey> = [Params<K>] extends [never]
  ? []
  : [params: Record<Params<K>, string | number>];

/** Bases of `x.one` / `x.other` pairs where BOTH halves exist. */
export type PluralBase = Extract<TranslationKey, `${string}.one`> extends infer O
  ? O extends `${infer B}.one`
    ? `${B}.other` extends TranslationKey
      ? B
      : never
    : never
  : never;
