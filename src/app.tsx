/**
 * Root application component.
 *
 * S2 scaffold: an app bar with the language switcher over a placeholder
 * stat card that exercises all three formatters (text, number/plural,
 * currency, date). Real data collection arrives from S6/S7 onward.
 */
import { t, tCurrency, tDateTime, tPlural } from "./i18n/index.js";
import { LanguageSwitcher } from "./components/language-switcher.js";

// Invented demo figures — not from reference-material/. 1413.58 is NFR-7's
// own currency formatting example.
const DEMO_TOTAL_COST = 1413.58;
const DEMO_SESSION_COUNT = 42;

export function App() {
  return (
    <main class="app-shell" data-testid="app-shell">
      <header class="app-bar">
        <h1 class="app-bar__title">{t("app.title")}</h1>
        <LanguageSwitcher />
        <span class="app-bar__version">{t("app.version", { version: __APP_VERSION__ })}</span>
      </header>

      <p class="app-shell__subtitle">{t("app.subtitle")}</p>

      <dl class="stat-card">
        <div class="stat-card__row">
          <dt>{t("card.totalCost")}</dt>
          <dd data-testid="demo-cost">{tCurrency(DEMO_TOTAL_COST)}</dd>
        </div>
        <div class="stat-card__row">
          <dt>{t("card.sessions")}</dt>
          <dd data-testid="demo-sessions">{tPlural("card.sessionCount", DEMO_SESSION_COUNT)}</dd>
        </div>
        <div class="stat-card__row">
          <dt>{t("card.lastScan")}</dt>
          <dd data-testid="demo-date">{tDateTime(new Date())}</dd>
        </div>
      </dl>

      <p class="app-shell__placeholder">{t("placeholder.noData")}</p>
    </main>
  );
}
