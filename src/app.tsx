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
 *
 * S10 (US-1.5, US-2.3, US-2.4, plan §1): a gap strip sits above the toolbar;
 * a grouping toggle picks `projectGroups` vs `folderGroups`; a scope-
 * following `ModelPanel` sits beside the table in a two-column grid, closable
 * via `modelPanelOpen`. Expansion, sort, scope and panel visibility are all
 * signals `runScan()` never touches, so all four survive a rescan.
 */
import { useEffect } from "preact/hooks";
import { t } from "./i18n/index.js";
import { LanguageSwitcher } from "./components/language-switcher.js";
import { DateRangeFilter } from "./components/date-range-filter.js";
import { EmptyState } from "./components/empty-state.js";
import { GapIndicators } from "./components/gap-indicators.js";
import { groupLabelText } from "./components/group-label.js";
import { GroupingToggle } from "./components/grouping-toggle.js";
import { ModelPanel, type ModelScope } from "./components/model-panel.js";
import { OverviewTable } from "./components/overview-table.js";
import { StatusBar } from "./components/status-bar.js";
import { dayStringsOf, isAllTime } from "./model/date-range.js";
import { findGroup } from "./model/report.js";
import { localZoneOffset } from "./services/zone.js";
import {
  activeRange,
  clearGroupScope,
  customFromDay,
  customToDay,
  expandedKeysFor,
  expandedSessionKeysFor,
  grouping,
  modelPanelOpen,
  rangeInvalid,
  rangePreset,
  report,
  runScan,
  scanState,
  selectedGroupKey,
  sessionSortDirection,
  sessionSortField,
  setCustomDays,
  setGrouping,
  setModelPanelOpen,
  setRangePreset,
  setSessionSort,
  toggleGroup,
  toggleGroupScope,
  toggleSession,
} from "./state/app-state.js";

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
  const scope: ModelScope = selectedGroup
    ? { kind: "group", label: groupLabelText(selectedGroup.label).text }
    : { kind: "all" };

  // US-5.1 (S13): rangeActive is a property of the report actually shown, not
  // of the control state — a preset resolving to ALL_TIME (e.g. still "all")
  // is not "active" even though a preset is technically selected.
  const rangeActive = currentReport !== null && !isAllTime(currentReport.range);
  const currentPreset = rangePreset.value;
  const { from: displayFromDay, to: displayToDay } =
    currentPreset === "custom"
      ? { from: customFromDay.value, to: customToDay.value }
      : dayStringsOf(activeRange.value, localZoneOffset);

  return (
    <main class="app-shell" data-testid="app-shell">
      <header class="app-bar">
        <h1 class="app-bar__title">{t("app.title")}</h1>
        <LanguageSwitcher />
        <span class="app-bar__version">{t("app.version", { version: __APP_VERSION__ })}</span>
      </header>

      <p class="app-shell__subtitle">{t("app.subtitle")}</p>

      {currentReport && (
        <GapIndicators
          gaps={currentReport.gaps}
          rangeActive={rangeActive}
          undatedExcluded={currentReport.excluded.undatedRequests}
        />
      )}

      {hasGroups && currentReport ? (
        <>
          {scanState.value === "scanning" && <p data-testid="scan-running">{t("scan.running")}</p>}
          <div class="toolbar-row">
            <GroupingToggle value={currentGrouping} onChange={setGrouping} />
            <DateRangeFilter
              preset={currentPreset}
              fromDay={displayFromDay}
              toDay={displayToDay}
              invalid={rangeInvalid.value}
              onPreset={setRangePreset}
              onCustomDays={setCustomDays}
            />
            {!modelPanelOpen.value && (
              <button
                type="button"
                class="model-panel-open"
                data-testid="model-panel-open"
                onClick={() => setModelPanelOpen(true)}
              >
                {t("models.openPanel")}
              </button>
            )}
          </div>
          <div
            class={
              modelPanelOpen.value ? "content-grid" : "content-grid content-grid--panel-closed"
            }
          >
            <OverviewTable
              groups={groups}
              totals={currentReport.totals}
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
            />
            {modelPanelOpen.value && panelBreakdown && panelTotals && (
              <ModelPanel
                breakdown={panelBreakdown}
                totals={panelTotals}
                scope={scope}
                onResetScope={selectedGroup ? () => clearGroupScope(currentGrouping) : null}
                onClose={() => setModelPanelOpen(false)}
              />
            )}
          </div>
        </>
      ) : (
        <EmptyState />
      )}

      <StatusBar />
    </main>
  );
}
