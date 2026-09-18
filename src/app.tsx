/**
 * Root application component.
 *
 * S8: three branches decide what the content area shows (plan §2 Q5).
 *
 * 1. No report yet -> `EmptyState`, plus the scanning indicator while a scan
 *    is in flight.
 * 2. A report with at least one group -> `OverviewTable`, still showing the
 *    scanning indicator if the scan is mid-flight — this is the partial-
 *    render case NFR-2 accepts (plan §2 Q2).
 * 3. `scanState` "done" with zero groups -> `EmptyState` (US-1.1).
 *
 * `scanState` "failed" falls into branch 1, indistinguishable from idle —
 * an explicit deferral to S21 (plan §9), not an oversight.
 *
 * `StatusBar` is the permanent home for "what do these numbers cover"; it
 * replaces the empty state's former provisional summary strip.
 */
import { useEffect } from "preact/hooks";
import { t } from "./i18n/index.js";
import { LanguageSwitcher } from "./components/language-switcher.js";
import { EmptyState } from "./components/empty-state.js";
import { OverviewTable } from "./components/overview-table.js";
import { StatusBar } from "./components/status-bar.js";
import { report, runScan, scanState } from "./state/app-state.js";

export function App() {
  useEffect(() => {
    void runScan();
  }, []);

  const currentReport = report.value;
  const hasGroups = (currentReport?.projectGroups.length ?? 0) > 0;

  return (
    <main class="app-shell" data-testid="app-shell">
      <header class="app-bar">
        <h1 class="app-bar__title">{t("app.title")}</h1>
        <LanguageSwitcher />
        <span class="app-bar__version">{t("app.version", { version: __APP_VERSION__ })}</span>
      </header>

      <p class="app-shell__subtitle">{t("app.subtitle")}</p>

      {hasGroups && currentReport ? (
        <>
          {scanState.value === "scanning" && <p data-testid="scan-running">{t("scan.running")}</p>}
          <OverviewTable groups={currentReport.projectGroups} totals={currentReport.totals} />
        </>
      ) : (
        <EmptyState />
      )}

      <StatusBar />
    </main>
  );
}
