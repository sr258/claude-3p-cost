# S2 — Localization layer

**Status.** Approved plan. Written in the planning phase of session S2.
**Implementer.** Sonnet agent. Follow this document literally; do not expand scope.
**Depends on.** S1 (`docs/plans/S1-project-scaffold.md`), which is done and green.

---

## 0. Read this first — environment facts

You are working in the repository root. Use absolute paths everywhere: the Bash
tool resets its working directory between calls.

**This session is pure frontend.** Nothing here touches `src-tauri/`, so Rust,
`cargo` and the `export PATH="$HOME/.cargo/bin:$PATH"` dance from S1 are not
needed. `npm run build` and `npm test` are the whole toolchain.

**`tsc` sees every file under `src/`.** `tsconfig.json` has
`include: ["src"]`, `strict: true`, `noEmit: true`, and `npm run build` is
`tsc && vite build`. A file under `src/` is type-checked whether or not anything
imports it. This fact is the entire enforcement mechanism of NFR-7 — see §2 Q1.

**Tests live next to the code.** `vite.config.ts` sets
`test.include: ["src/**/*.{test,spec}.{ts,tsx}"]`, deliberately narrowed so the
gitignored `calview/` tree is not picked up. Put every spec of this session
beside its module inside `src/`, **not** in `test/`. (`test/fixtures/` is for
S3's audit-log fixtures and stays empty in S2.)

**Zero new dependencies.** Everything below is built on `preact`,
`@preact/signals`, TypeScript and the platform's own `Intl`. Do not add an i18n
package. NFR-8 sanctions "a translation layer" as a deviation — it does not
sanction a library, and adding one would also break the roadmap's sizing rule
"never both a new layer and a new dependency in the same session".

**The repository is public.** Do not write an absolute path from this machine, a
username, or anything read out of `reference-material/` into a committed file.
The demo figures on the placeholder screen are invented for the purpose (§4);
`1413.58` appears only in `format.test.ts`, and only because NFR-7 names that
exact number as its formatting example.

---

## 1. Goal and scope

**Goal.** The NFR-7 infrastructure, built before there is any string to
retrofit: a typed key→string lookup, German and English catalogues that the
compiler forces to stay in step, a `t()` bound to a locale signal, OS-locale
detection, a persisted override, `Intl`-based formatters, and a placeholder
screen that visibly switches language.

**In scope.** `src/i18n/`, one new service, one new state module, one new
component, the rewrite of `src/app.tsx`, the CSS for the new screen, and the
unit tests for all of it.

**Out of scope.** A settings screen (S15+ / S21 give the switcher its final
home). Any Playwright spec — the harness arrives with S8, and NFR-9 assigns the
language-switch spec to it. Any parsing, filesystem access or aggregation. Any
key for a screen that does not exist yet (§2 Q6).

**The trap the roadmap flags.** *The typed key list is the point. If `t()` takes
a bare `string`, the build check cannot work and the whole NFR degrades to a
convention.* Restated concretely in §8.

---

## 2. Decisions made in planning

Seven questions were put to the user. All seven are settled; this section is the
record of why the session looks the way it does.

**Q1 — Key parity is enforced by TypeScript alone. No node script.**
`de.ts` is the source of truth (`as const`); `TranslationKey = keyof typeof de`;
`en.ts` is `as const satisfies Record<TranslationKey, string>`. Verified against
the real compiler during planning: a missing key gives `TS1360: Property 'x' is
missing`, an unknown extra key gives `TS2353: Object literal may only specify
known properties`. Both fail `tsc`, hence `npm run build`. A script would be a
second, weaker copy of a check the compiler already performs, and it could not
give `t()` its typed key list.

**Q2 — Interpolation is `{name}` placeholders, typed by inference; `tPlural`
ships in S2.** Placeholder names are extracted from the literal value type, so
`t("app.version", { version })` type-checks, `t("app.version")` does not compile,
and `t("app.title")` refuses a second argument. Plurals use `foo.one` /
`foo.other` key pairs plus `tPlural(base, count)` — German and English share a
two-form rule, so no `Intl.PluralRules` and no ICU parser is needed. Shipping it
now costs ~15 lines; retrofitting call sites at S8 would cost more.

**Q3 — The override is a bare locale string in `localStorage` under
`claude3pcost.locale`, behind `src/services/locale-store.ts`.** Works identically
in the Vite dev browser and the Tauri WebView, needs no fs capability, and
mirrors CalView's `favorites-store.ts`. No `Settings` object shape, and no
migration is assumed: a UI preference is legitimately WebView-local.

**Q4 — Locale tags are `de-DE` and `en-GB`; currency follows NFR-7 literally.**
Measured during planning: with `style: "currency"`, `Intl` produces
`1.413,58 $` and `$1,413.58` — which contradicts the NFR's own example. With
`currencyDisplay: "code"` English produces `USD 1,413.58`, wrong order. Only
"format the number with `Intl`, then append U+00A0 and the currency code" yields
`1.413,58 USD` and `1,413.58 USD`, i.e. the requirement verbatim. `en-GB` over
`en-US` because it is day-first (`15 Sept 2026`), so a screenshot in one locale
reads correctly to a user of the other.

**Q5 — `src/state/app-state.ts` is created in this session, holding only the
locale signal.** Architecture rule 1 is unconditional. S8 extends the file
rather than creating it; S8's roadmap line still holds. **Dependency direction
is `i18n` → `state`, never back.** To keep it that way, a standing rule:
*app-state stores translation keys, never translated strings.* S21's collected
problem list wants that anyway.

**Q6 — No key seeding.** Only the keys the placeholder screen actually renders —
about a dozen. Guessing wording for screens that do not exist means dead weight
that must still be translated twice and parity-checked forever.

**Q7 — The placeholder screen is an app bar with the DE/EN switcher top-right,
over a stat card that exercises all three formatters.** The bar is where S8's
toolbar goes, so `<LanguageSwitcher />` later moves into `Toolbar` and then into
Settings without its own markup changing. The card's three rows are precisely
the three formatters, so the screen *is* the manual proof that one click
re-renders text, number, currency and date together.

---

## 3. File inventory

### 3.1 Created — `src/i18n/`

| File | Contents |
|---|---|
| `de.ts` | `export const de = { … } as const;` — the source of truth, §4.2 |
| `en.ts` | `export const en = { … } as const satisfies Record<TranslationKey, string>;` |
| `types.ts` | `Locale`, `TranslationKey`, `Placeholder`, `Params`, `TArgs`, `PluralBase` |
| `translate.ts` | pure `translate`, `translatePlural`, the catalogue registry |
| `format.ts` | pure `formatNumber`, `formatCurrency`, `formatDate`, `formatDateTime` + memoized `Intl` cache |
| `detect.ts` | pure `detectLocale(candidates)` |
| `index.ts` | signal-bound `t`, `tPlural`, `tNumber`, `tCurrency`, `tDate`; re-exports the public types |

### 3.2 Created — elsewhere

| File | Contents |
|---|---|
| `src/services/locale-store.ts` | `loadStoredLocale()`, `storeLocale()` over `localStorage` |
| `src/state/app-state.ts` | the `locale` signal, `setLocale()`, the `lang`-attribute effect |
| `src/components/language-switcher.tsx` | the DE/EN control |

### 3.3 Created — tests

`src/i18n/catalogue.test.ts`, `src/i18n/translate.test.ts`,
`src/i18n/format.test.ts`, `src/i18n/detect.test.ts`,
`src/services/locale-store.test.ts`. Named cases in §7.

### 3.4 Changed in place

| File | Change |
|---|---|
| `src/app.tsx` | rewritten to §4.1; the two hardcoded strings go through `t()`; the `TODO(S2)` comment is **deleted**, not updated |
| `src/styles/index.css` | `.app-bar`, `.lang-switch`, `.stat-card` rules; **no new custom properties** — use the existing `--c3p-*` tokens |
| `index.html` | `<html lang="en">` gains a comment noting that app-state's effect is authoritative at runtime |
| `CLAUDE.md` | the "Localization" subsection records: layer implemented, keys typed, parity enforced by `tsc`, override in `localStorage`, tags `de-DE` / `en-GB`, currency formatted per NFR-7 rather than via `style: "currency"` |

### 3.5 Explicitly NOT touched

`package.json` (no dependency, no new script — `tsc` already runs in `build`),
`vite.config.ts`, `tsconfig.json`, anything under `src-tauri/`, `test/`,
`.github/workflows/`.

---

## 4. The placeholder screen

### 4.1 Layout — the approved sketch

```
┌──────────────────────────────────────────────────────────┐
│  Claude3PCost                        [ DE ][ EN ]  v0.1.0│
├──────────────────────────────────────────────────────────┤
│                                                          │
│    Kostenübersicht für Claude Desktop (3P)               │
│                                                          │
│    ┌────────────────────────────────────────────────┐    │
│    │  Gesamtkosten          1.413,58 USD            │    │
│    │  Sitzungen                 42 Sitzungen        │    │
│    │  Letzter Scan          15.09.2026, 20:35       │    │
│    └────────────────────────────────────────────────┘    │
│                                                          │
│    Noch keine Daten geladen — die Datenerfassung         │
│    folgt in einer späteren Version.                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Rules for the implementation:

- The `data-testid="app-shell"` hook on the root element **stays** — S1 put it
  there as the first stable selector for S8's Playwright harness.
- New hooks: `data-testid="language-switcher"` on the control, and
  `data-testid="demo-cost"`, `data-testid="demo-sessions"`,
  `data-testid="demo-date"` on the three value cells. S8 asserts on roles and
  test ids, never on translated text (NFR-9).
- Demo values are invented constants declared at the top of `app.tsx`:
  `1413.58` for the cost (NFR-7's own example figure) and `42` for the session
  count. The date is `new Date()` at render time — the clock rule applies to
  `src/model/`, not to a component.
- The version still comes from `__APP_VERSION__`, now through
  `t("app.version", { version: __APP_VERSION__ })`.

### 4.2 The catalogue — the complete key set for S2

Twelve keys. German values shown; `en.ts` carries the same keys with English
values and **the same placeholder names**.

| Key | German value |
|---|---|
| `app.title` | `Claude3PCost` |
| `app.version` | `Version {version}` |
| `app.subtitle` | `Kostenübersicht für Claude Desktop (3P)` |
| `language.label` | `Sprache` |
| `language.de` | `Deutsch` |
| `language.en` | `Englisch` |
| `card.totalCost` | `Gesamtkosten` |
| `card.sessions` | `Sitzungen` |
| `card.lastScan` | `Letzter Scan` |
| `card.sessionCount.one` | `{count} Sitzung` |
| `card.sessionCount.other` | `{count} Sitzungen` |
| `placeholder.noData` | `Noch keine Daten geladen — die Datenerfassung folgt in einer späteren Version.` |

English: `Claude3PCost`, `Version {version}`, `Cost overview for Claude Desktop
(3P)`, `Language`, `German`, `English`, `Total cost`, `Sessions`, `Last scan`,
`{count} session`, `{count} sessions`, `No data loaded yet — data collection
follows in a later version.`

Keep both files sorted by key. `language.de` / `language.en` are the switcher's
labels and are translated like anything else — the German UI says
`Deutsch / Englisch`, the English UI says `German / English`.

### 4.3 The switcher

`src/components/language-switcher.tsx`, self-contained, no props. Two `<button>`
elements in a container with `role="group"` and an `aria-label` from
`t("language.label")`; the active one carries `aria-pressed="true"`. Clicking
calls `setLocale("de" | "en")`. Buttons rather than a `<select>` so the control
is one keyboard tab-stop pair and needs no label element — and so S15 can drop
it into a settings row unchanged. No `useState`; the only source of truth is the
`locale` signal.

---

## 5. Module design and boundary signatures

### 5.1 `src/i18n/types.ts`

```ts
import type { de } from "./de.js";

export type Locale = "de" | "en";

export type TranslationKey = keyof typeof de;

/** Placeholder names occurring in a catalogue value, e.g. "Version {version}" → "version". */
export type Placeholder<S extends string> =
  S extends `${string}{${infer P}}${infer R}` ? P | Placeholder<R> : never;

export type Params<K extends TranslationKey> = Placeholder<(typeof de)[K]>;

/** No placeholders → no second argument; otherwise a required, exactly-typed params object. */
export type TArgs<K extends TranslationKey> =
  [Params<K>] extends [never] ? [] : [params: Record<Params<K>, string | number>];

/** Bases of `x.one` / `x.other` pairs where BOTH halves exist. */
export type PluralBase =
  Extract<TranslationKey, `${string}.one`> extends infer O
    ? O extends `${infer B}.one`
      ? `${B}.other` extends TranslationKey ? B : never
      : never
    : never;
```

`PluralBase` was verified against the compiler during planning: a `.one` key
without a matching `.other` is excluded from the type, so `tPlural` cannot be
called with a half-defined pair. If the stricter form fights the compiler for
some reason, fall back to `Extract<TranslationKey, `${string}.one`>` stripped of
its suffix and rely on `catalogue.test.ts` to catch orphans — but try the typed
version first.

### 5.2 `src/i18n/translate.ts` — pure

```ts
export function translate<K extends TranslationKey>(
  locale: Locale, key: K, ...args: TArgs<K>
): string;

export function translatePlural<B extends PluralBase>(
  locale: Locale, base: B, count: number
): string;
```

- Looks the key up in `{ de, en }[locale]`.
- Substitutes `{name}` occurrences — **every** occurrence, not the first —
  from the params object. A brace sequence with no matching param is left in the
  string untouched rather than replaced with `undefined`.
- Defensive fallback: if the entry is missing at runtime (only reachable through
  a cast, since the compiler forbids it), return the key itself. Never throw, and
  never fall back to the other language — a silent fallback is exactly what
  NFR-7 forbids.
- `translatePlural` picks `${base}.one` for `count === 1` and `${base}.other`
  otherwise, then substitutes `{count}` via `Intl`-free direct interpolation of
  the already-formatted number (use `formatNumber(locale, count)` so `1234`
  renders as `1.234` in German).

### 5.3 `src/i18n/format.ts` — pure

```ts
export function formatNumber(locale: Locale, value: number,
                             options?: Intl.NumberFormatOptions): string;
export function formatCurrency(locale: Locale, value: number,
                               currency?: string): string;   // default "USD"
export function formatDate(locale: Locale, value: Date | number,
                           options?: Intl.DateTimeFormatOptions): string;
export function formatDateTime(locale: Locale, value: Date | number): string;
```

- A module-private `const LOCALE_TAG: Record<Locale, string> = { de: "de-DE", en: "en-GB" }`.
  The BCP-47 tag never leaves this module; the rest of the app only knows
  `"de" | "en"`.
- `formatCurrency` is **not** `style: "currency"`. It is
  `formatNumber(locale, value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
  followed by `" "` and the currency code. See §2 Q4. Put a comment saying
  so, with the reason, so nobody "fixes" it later.
- `formatDate` defaults to `{ dateStyle: "medium" }`, `formatDateTime` to
  `{ dateStyle: "medium", timeStyle: "short" }`.
- Construct `Intl` formatters through a memo keyed by locale + serialized
  options. `Intl` construction is slow and S8 formats a table cell per row
  (NFR-2). The cache is an internal implementation detail, not state: the
  functions stay referentially transparent.

### 5.4 `src/i18n/detect.ts` — pure

```ts
export function detectLocale(candidates: readonly string[]): Locale;
```

Returns `"de"` if the **first** candidate's primary subtag is `de`
(case-insensitive, so `de`, `de-DE`, `de-AT`, `DE-ch` all match), otherwise
`"en"`. An empty or malformed list yields `"en"`. Takes the list as an argument
— it must not read `navigator` itself, or it is not testable.

### 5.5 `src/services/locale-store.ts` — I/O

```ts
export function loadStoredLocale(): Locale | null;
export function storeLocale(locale: Locale): void;
```

`localStorage` key `claude3pcost.locale`, value the bare string `"de"` or
`"en"`. `loadStoredLocale` returns `null` for an absent key, an unrecognised
value, or a throwing `localStorage` (private-mode / quota). `storeLocale`
swallows write failures. Same defensive shape as CalView's
`services/favorites-store.ts`.

### 5.6 `src/state/app-state.ts`

```ts
export const locale: Signal<Locale>;
export function setLocale(next: Locale): void;
```

- Initial value: `loadStoredLocale() ?? detectLocale(navigator.languages ?? [navigator.language])`.
  This is the one place `navigator` is read.
- `setLocale` assigns the signal and calls `storeLocale`.
- An `effect` writes `locale.value` into `document.documentElement.lang`
  (`"de"` / `"en"`), guarded for a missing `document` so unit tests outside jsdom
  do not break. Screen readers need it (NFR-11) and it is free here.
- **Nothing else.**

> **Review amendment (S2 review).** As written, this bullet said "no imports
> from `src/i18n/`" while the code sample two bullets above calls
> `detectLocale()` from `src/i18n/detect.ts` — a contradiction inside the plan.
> Adjudicated in favour of the sample: the rule that matters is *no cycle*, and
> the only module that would create one is the signal-bound barrel
> `src/i18n/index.ts`, which imports this file. The leaf modules `detect.ts` and
> `types.ts` import nothing from `state/`, so importing them is safe — and it
> keeps one tested definition of the OS-locale rule instead of two copies free
> to drift. `src/services/locale-store.ts` already imports `i18n/types.ts` for
> the same reason. Grep 4b in §9 is narrowed accordingly.

### 5.7 `src/i18n/index.ts` — the signal-bound surface

```ts
export function t<K extends TranslationKey>(key: K, ...args: TArgs<K>): string;
export function tPlural<B extends PluralBase>(base: B, count: number): string;
export function tNumber(value: number, options?: Intl.NumberFormatOptions): string;
export function tCurrency(value: number, currency?: string): string;
export function tDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
```

Each is a one-line wrapper reading `locale.value` and delegating to the pure
function. They hold nothing. They exist so no component repeats `locale.value`,
and so reading them inside a component's render subscribes that component to the
locale signal — which is what makes the switch work without a reload.

Components import **only** from `src/i18n` (the barrel). They never import
`translate.ts` or `format.ts` directly, and never `de.ts` / `en.ts` at all.

---

## 6. Requirements coverage

### Satisfied by this session

- **NFR-7 — Localization**, in full except the settings *screen*:
  German and English catalogues, both complete by construction; every user-facing
  string through the layer; a missing key is a **build failure** (§2 Q1,
  proven by the command in §9); OS-locale detection on first start (`de-*` →
  German, otherwise English); a persisted override; switching without restart;
  `Intl` governing number, currency and date formatting, with the NFR's own
  examples `1.413,58 USD` and `1,413.58 USD` reproduced exactly and asserted in
  a test; code, comments and commit messages English throughout.
- **NFR-8 — Stack parity.** The translation layer is the deviation NFR-8 already
  sanctions, and it is implemented with no new dependency. `CLAUDE.md` records
  the shape it took.

### Partially satisfied

- **NFR-9 — Testability.** Unit tests begin here — one session earlier than the
  roadmap's S3 — and every testable thing in this session is a pure function in
  `src/i18n/`. The Playwright side, including the language-switch spec NFR-9
  names, arrives with the S8 harness.
- **NFR-11 — Accessibility.** `document.documentElement.lang` tracks the locale;
  the switcher is a keyboard-operable `role="group"` of buttons with
  `aria-pressed`. The full pass is S21.

### Explicitly deferred

- The switcher's final home in a settings screen → S15+ / S21. It is a
  self-contained component precisely so that move is a one-line change.
- The language-switch Playwright spec → S8.
- Any key beyond the twelve in §4.2 → the session that renders the screen.
- Everything else S1 deferred: NFR-13 → S6; US-1.1/1.2/1.6 → S7; NFR-2, NFR-3,
  NFR-4, NFR-6 → their sessions; every user story US-1 through US-8.

---

## 7. Tests

All under `src/`, run by `npm test`.

### `src/i18n/catalogue.test.ts`
- `de and en expose identical key sets`
- `every value is a non-empty string`
- `placeholders match between de and en for every key` — extract `{…}` names by
  regex from both values and compare as sets; this is the runtime counterpart to
  the compile-time key check, and it is the check that would catch
  `{count}` in German against `{anzahl}` in English
- `no value contains an unclosed brace`
- `every .one key has a matching .other key`

### `src/i18n/translate.test.ts`
- `returns the German string for locale de`
- `returns the English string for locale en`
- `substitutes a named placeholder`
- `substitutes every occurrence of a repeated placeholder`
- `leaves an unmatched brace untouched`
- `falls back to the key when the entry is missing at runtime`
- `tPlural selects the one form at count 1`
- `tPlural selects the other form at count 0 and count 2`
- `tPlural formats the count for the active locale`

### `src/i18n/format.test.ts`
- `formats 1413.58 as 1.413,58 USD in German`
- `formats 1413.58 as 1,413.58 USD in English`
  — both asserting the U+00A0 separator explicitly, written as ` ` in the
  expected string, never as a literal space
- `always shows two fraction digits for currency`
- `formats an integer with locale grouping`
- `formats a date as day-first in both locales`
- `formats a date and time together`
- `reuses a cached Intl formatter for repeated calls`

### `src/i18n/detect.test.ts`
- `de, de-DE and de-AT yield German`
- `matches the primary subtag case-insensitively`
- `en-GB yields English`
- `fr-FR yields English`
- `an empty candidate list yields English`

### `src/services/locale-store.test.ts`
- `stores and reads back a locale`
- `returns null when nothing is stored`
- `returns null for an unrecognised stored value`
- `survives a throwing localStorage`

No component test. jsdom rendering of a twelve-string placeholder screen would
assert nothing the formatter tests do not already cover, and S8's Playwright
spec is the right place for it.

---

## 8. The trap, restated

**`t()` must never accept a bare `string`, and `en.ts` must use
`as const satisfies Record<TranslationKey, string>` — not a `: Record<…>`
annotation.**

The spelling is load-bearing, and the difference is not cosmetic:

| Spelling | Missing key | Extra key | Literal types kept |
|---|---|---|---|
| `as const satisfies Record<K, string>` | **error TS1360** | **error TS2353** | **yes** |
| `: Record<K, string>` annotation | error TS2741 | error TS2353 | **no** |
| `as const` alone | silent | silent | yes |

The annotation form widens every value to `string`, which destroys
`Params<K>` — `t()` then takes any params, or none, and typed interpolation is
gone. The bare `as const` form checks nothing at all. Only the first row gives
both halves of NFR-7.

Second half of the trap: if a component ever takes a `string` key from a
variable — `t(someKey as TranslationKey)` — the guarantee is void for that call
site. There is no such call site in S2 and there must not be one later; keys are
written as literals.

---

## 9. Exit criteria

Run everything from the repository root. All three tiers must pass before the
session is reported done.

### Tier 1 — automated, local

```bash
# 1. Unit tests green
npm test

# 2. Type-check + production build clean
npm run build

# 3. No new dependency crept in — MUST print nothing
git diff --stat -- package.json package-lock.json

# 4. Architecture guards — each MUST print nothing
#    4a. the model/i18n layers stay free of Tauri
grep -rn "@tauri-apps" src/i18n/ src/services/locale-store.ts src/state/
#    4b. app-state must not import the i18n BARREL (that is the cycle;
#        the leaf modules detect.ts / types.ts are allowed — see §5.6 amendment)
grep -rn "from \"\.\./i18n/index\|from \"\.\./i18n\"" src/state/app-state.ts
#    4c. components must not reach past the i18n barrel
grep -rn "i18n/de\|i18n/en\|i18n/translate\|i18n/format" src/app.tsx src/components/
#    4d. S1's debt marker is gone
grep -rn "TODO(S2)" src/
```

### Tier 2 — the NFR-7 proof

A missing key must fail the build. Demonstrate it, then restore:

```bash
cp src/i18n/en.ts /tmp/en.bak
node -e "const s=require('fs'),f='src/i18n/en.ts';s.writeFileSync(f,s.readFileSync(f,'utf8').replace(/^.*\"app\.title\".*$\n/m,''))"

npm run build     # MUST FAIL, with TS1360 naming 'app.title'

cp /tmp/en.bak src/i18n/en.ts && rm /tmp/en.bak
npm run build     # MUST be green again
```

If step two succeeds, the session is **not** done, whatever the tests say: the
mechanism in §8 has been implemented wrongly and NFR-7 is a convention again.

Repeat the same shape once with an *added* bogus key in `en.ts` and confirm
`TS2353`. Restore afterwards. Leave the tree exactly as it was — `git status`
must be clean of these edits before the session is reported.

### Tier 3 — manual, eyes on the window

```bash
npm run dev
```

1. The app bar shows the title, the DE/EN switcher and the version.
2. Click the other language. Heading, subtitle, all three card labels, the
   plural session count, the grouped number, the currency string and the date
   all change at once. No reload, no flash of English in a German UI.
3. Currency reads `1.413,58 USD` in German and `1,413.58 USD` in English —
   the code, not a dollar sign, and in that order.
4. The date is day-first in both languages.
5. Reload the page. The chosen language survives.
6. Clear `localStorage` (`localStorage.clear()` in the devtools console) and
   reload. The language follows the browser's own locale.
7. Tab to the switcher and operate it with the keyboard only.
8. In the devtools element inspector, `<html lang>` matches the active language.

---

## 10. Commit

One commit at the end, message in English, following S1's form:

```
S2: localization layer (NFR-7)
```

Body: the mechanism in one sentence (typed catalogue, parity enforced by `tsc`
via `as const satisfies`), the locale tags, the persistence key, and the note
that the switcher's final home is a later session.
