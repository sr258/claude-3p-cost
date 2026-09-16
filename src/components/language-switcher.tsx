/**
 * DE/EN switcher. Self-contained, no props — the only source of truth is
 * the `locale` signal, so it needs no `useState`. Buttons rather than a
 * `<select>` so the control is one keyboard tab-stop pair and needs no
 * label element. This markup does not change when S15 moves the control
 * into a settings row.
 */
import { setLocale, locale } from "../state/app-state.js";
import { t } from "../i18n/index.js";

export function LanguageSwitcher() {
  return (
    <div
      class="lang-switch"
      role="group"
      aria-label={t("language.label")}
      data-testid="language-switcher"
    >
      <button type="button" aria-pressed={locale.value === "de"} onClick={() => setLocale("de")}>
        {t("language.de")}
      </button>
      <button type="button" aria-pressed={locale.value === "en"} onClick={() => setLocale("en")}>
        {t("language.en")}
      </button>
    </div>
  );
}
