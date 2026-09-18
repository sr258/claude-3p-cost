/**
 * Root application component.
 *
 * S7: the S2 demo stat card is gone. The whole content area is the US-1.1
 * empty state — the searched locations, the US-1.2 chosen-folder list and
 * the provisional summary strip (S7 plan §6). The initial scan is kicked
 * off once, on mount; a real report view arrives from S8 onward.
 */
import { useEffect } from "preact/hooks";
import { t } from "./i18n/index.js";
import { LanguageSwitcher } from "./components/language-switcher.js";
import { EmptyState } from "./components/empty-state.js";
import { runScan } from "./state/app-state.js";

export function App() {
  useEffect(() => {
    void runScan();
  }, []);

  return (
    <main class="app-shell" data-testid="app-shell">
      <header class="app-bar">
        <h1 class="app-bar__title">{t("app.title")}</h1>
        <LanguageSwitcher />
        <span class="app-bar__version">{t("app.version", { version: __APP_VERSION__ })}</span>
      </header>

      <p class="app-shell__subtitle">{t("app.subtitle")}</p>

      <EmptyState />
    </main>
  );
}
