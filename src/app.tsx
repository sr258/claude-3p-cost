/**
 * Root application component.
 *
 * S8: three branches decide what a report page shows (plan §2 Q5).
 *
 * 1. No report yet -> `EmptyState`, plus the scanning indicator while a scan
 *    is in flight.
 * 2. A report with at least one group -> the page body, still showing the
 *    scanning indicator if the scan is mid-flight — this is the partial-
 *    render case NFR-2 accepts (plan §2 Q2).
 * 3. `scanState` "done" with zero groups -> `EmptyState` (US-1.1).
 *
 * `StatusBar` is the permanent home for "what do these numbers cover"; it
 * replaces the empty state's former provisional summary strip.
 *
 * S16a (CLAUDE.md rule 9, plan §3, §6.1): navigation is a `page` signal, and
 * the model breakdown and trend are PAGES, not panels docked beside the
 * overview table (supersedes S10's "beside the table" placement). The three
 * scanning/empty-state branches above now govern the report pages only —
 * Overview, Models, Trend — the Prices page renders regardless of scan
 * state (S15 already made the price editor usable with no data at all),
 * and it carries no context bar and no gap strip: there is no report scope
 * to show on it. A persistent `ContextBar` (grouping, date range, scope
 * select) sits above every report page's body, and the gap strip stays
 * Overview-only — it explains the report, and repeating it on three pages
 * would make it furniture (S10's reasoning for zero-valued chips).
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { t } from "./i18n/index.js";
import { AppNav } from "./components/app-nav.js";
import { ContextBar } from "./components/context-bar.js";
import { LanguageSwitcher } from "./components/language-switcher.js";
import { EmptyState } from "./components/empty-state.js";
import { GapIndicators } from "./components/gap-indicators.js";
import { groupLabelText } from "./components/group-label.js";
import { ModelPanel, type ModelScope } from "./components/model-panel.js";
import { OverviewTable } from "./components/overview-table.js";
import { PriceTableEditor } from "./components/price-table-editor.js";
import type { ScopeOption } from "./components/scope-select.js";
import { StatusBar } from "./components/status-bar.js";
import { TrendSection, type TrendScope } from "./components/trend-section.js";
import { dayStringsOf, isAllTime } from "./model/date-range.js";
import { DEFAULT_PRICES, DEFAULT_PRICES_AS_OF } from "./model/default-prices.js";
import { buildPriceRows } from "./model/price-table.js";
import { findGroup } from "./model/report.js";
import { buildTrend } from "./model/trend.js";
import { localZoneOffset } from "./services/zone.js";
import type { Page } from "./state/app-state.js";
import {
  activeRange,
  costBasis,
  customFromDay,
  customToDay,
  exportPrices,
  expandedKeysFor,
  expandedSessionKeysFor,
  grouping,
  importPrices,
  importPricesFromFile,
  ownPricesConfigured,
  page,
  priceOverrides,
  rangeInvalid,
  rangePreset,
  recomputation,
  report,
  resetAllPrices,
  resetPriceRow,
  runScan,
  scanState,
  selectedGroupKey,
  sessionSortDirection,
  sessionSortField,
  setCustomDays,
  setGrouping,
  setGroupScope,
  setPage,
  setPrice,
  setRangePreset,
  setSessionSort,
  setTrendGranularity,
  toggleGroup,
  toggleGroupScope,
  toggleSession,
  trendGranularity,
} from "./state/app-state.js";
import { RecomputeNote } from "./components/recompute-note.js";

export function App() {
  useEffect(() => {
    void runScan();
  }, []);

  const currentReport = report.value;
  const currentGrouping = grouping.value;
  const groups =
    currentGrouping === "folder"
      ? (currentReport?.folderGroups ?? [])
      : (currentReport?.projectGroups ?? []);
  const hasGroups = groups.length > 0;

  const selectedKey = selectedGroupKey(currentGrouping);
  const selectedGroup = currentReport ? findGroup(groups, selectedKey) : null;

  const panelBreakdown = selectedGroup ? selectedGroup.models : (currentReport?.models ?? null);
  const panelTotals = selectedGroup ? selectedGroup.totals : (currentReport?.totals ?? null);
  const scope: ModelScope & TrendScope = selectedGroup
    ? { kind: "group", label: groupLabelText(selectedGroup.label).text }
    : { kind: "all" };

  // S16a §5.3/§5.4: the context bar's scope options, in the report's own
  // order (S8 §2 Q6 — never re-sorted here).
  const scopeOptions: readonly ScopeOption[] = groups.map((group) => ({
    key: group.key,
    label: groupLabelText(group.label).text,
  }));

  // US-5.1 (S13): rangeActive is a property of the report actually shown, not
  // of the control state — a preset resolving to ALL_TIME (e.g. still "all")
  // is not "active" even though a preset is technically selected.
  const rangeActive = currentReport !== null && !isAllTime(currentReport.range);
  const currentPreset = rangePreset.value;
  const { from: displayFromDay, to: displayToDay } =
    currentPreset === "custom"
      ? { from: customFromDay.value, to: customToDay.value }
      : dayStringsOf(activeRange.value, localZoneOffset);

  // US-5.2 (S14): the trend reuses the SAME scope as ModelPanel (S14 plan §2
  // Q2) — the group-row selection, never a second scope concept — and needs
  // no rescan: it is derived from rows the report already holds (NFR-2).
  const trendRows = currentReport
    ? selectedGroup
      ? selectedGroup.sessions
      : currentReport.sessions
    : [];
  const trendSeries = currentReport
    ? buildTrend(trendRows, trendGranularity.value, localZoneOffset, currentReport.range)
    : null;

  const currentPage = page.value;

  // NFR-11: focus moves to the new page's heading on navigation, but NOT on
  // first mount — the guard below is what the "does not move focus on first
  // mount" test pins (plan §6.1).
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const previousPageRef = useRef<Page | null>(null);
  useEffect(() => {
    if (previousPageRef.current !== null && previousPageRef.current !== currentPage) {
      headingRef.current?.focus();
    }
    previousPageRef.current = currentPage;
  }, [currentPage]);

  const contextBar = (
    <ContextBar
      grouping={currentGrouping}
      onGrouping={setGrouping}
      range={{
        preset: currentPreset,
        fromDay: displayFromDay,
        toDay: displayToDay,
        invalid: rangeInvalid.value,
        onPreset: setRangePreset,
        onCustomDays: setCustomDays,
      }}
      scopeOptions={scopeOptions}
      selectedScopeKey={selectedKey}
      onScope={(key) => setGroupScope(currentGrouping, key)}
    />
  );

  const reportReady = currentReport !== null && hasGroups;

  function readyPage(body: ComponentChildren): ComponentChildren {
    return (
      <>
        {scanState.value === "scanning" && <p data-testid="scan-running">{t("scan.running")}</p>}
        {contextBar}
        {body}
      </>
    );
  }

  function notReadyPage(): ComponentChildren {
    return (
      <>
        {scanState.value === "scanning" && <p data-testid="scan-running">{t("scan.running")}</p>}
        <EmptyState />
      </>
    );
  }

  return (
    <main class="app-shell" data-testid="app-shell">
      <header class="app-bar">
        <h1 class="app-bar__title">{t("app.title")}</h1>
        <LanguageSwitcher />
        <span class="app-bar__version">{t("app.version", { version: __APP_VERSION__ })}</span>
      </header>

      <AppNav page={currentPage} onNavigate={setPage} />

      <div class="page">
        {currentPage !== "prices" && <p class="app-shell__subtitle">{t("app.subtitle")}</p>}

        {currentPage === "overview" &&
          (reportReady
            ? readyPage(
                <>
                  <GapIndicators
                    gaps={currentReport!.gaps}
                    rangeActive={rangeActive}
                    undatedExcluded={currentReport!.excluded.undatedRequests}
                  />
                  <h1 ref={headingRef} tabIndex={-1} data-testid="page-heading">
                    {t("overview.heading")}
                  </h1>
                  <OverviewTable
                    groups={groups}
                    totals={currentReport!.totals}
                    expandedKeys={expandedKeysFor(currentGrouping)}
                    sortField={sessionSortField.value}
                    sortDirection={sessionSortDirection.value}
                    onToggle={(groupKey) => toggleGroup(currentGrouping, groupKey)}
                    onSort={setSessionSort}
                    grouping={currentGrouping}
                    selectedKey={selectedKey}
                    onSelect={(groupKey) => toggleGroupScope(currentGrouping, groupKey)}
                    expandedSessionKeys={expandedSessionKeysFor(currentGrouping)}
                    onToggleSession={(sessionId) => toggleSession(currentGrouping, sessionId)}
                    rangeActive={rangeActive}
                    ownPricesConfigured={ownPricesConfigured.value}
                    groupRecomputations={recomputation.value?.byGroupKey ?? null}
                    totalRecomputation={recomputation.value?.total ?? null}
                    sessionRecomputations={recomputation.value?.bySessionId ?? null}
                  />
                  <RecomputeNote
                    recomputation={recomputation.value?.total ?? null}
                    totalSessions={currentReport!.sessions.length}
                    costBasis={costBasis.value}
                  />
                </>,
              )
            : notReadyPage())}

        {currentPage === "models" &&
          (reportReady && panelBreakdown && panelTotals
            ? readyPage(
                <>
                  <h1 ref={headingRef} tabIndex={-1} data-testid="page-heading">
                    {t("models.heading")}
                  </h1>
                  <ModelPanel breakdown={panelBreakdown} totals={panelTotals} scope={scope} />
                </>,
              )
            : notReadyPage())}

        {currentPage === "trend" &&
          (reportReady && trendSeries
            ? readyPage(
                <>
                  <h1 ref={headingRef} tabIndex={-1} data-testid="page-heading">
                    {t("trend.heading")}
                  </h1>
                  <TrendSection
                    series={trendSeries}
                    granularity={trendGranularity.value}
                    scope={scope}
                    onGranularity={setTrendGranularity}
                  />
                </>,
              )
            : notReadyPage())}

        {currentPage === "prices" && (
          <>
            <h1 ref={headingRef} tabIndex={-1} data-testid="page-heading">
              {t("prices.heading")}
            </h1>
            <PriceTableEditor
              rows={buildPriceRows(
                currentReport?.models.models ?? [],
                DEFAULT_PRICES,
                priceOverrides.value,
              )}
              asOfDate={DEFAULT_PRICES_AS_OF}
              onSetPrice={setPrice}
              onResetRow={resetPriceRow}
              onResetAll={resetAllPrices}
              onExport={exportPrices}
              onImportFile={importPricesFromFile}
              onApplyImport={importPrices}
            />
          </>
        )}
      </div>

      <StatusBar />
    </main>
  );
}
