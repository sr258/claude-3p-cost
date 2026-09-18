/**
 * US-2.1's project overview table (S8 plan §6.4). Props only — no signal
 * reads inside — so S10's project/folder grouping toggle changes which
 * array is passed in, not this component (plan §2 Q7). Rendered in the
 * order given: the model already decided the sort
 * (`compareByCostDescThenKeyAsc` in `src/model/report.ts`), and this
 * component never re-sorts or re-sums (plan §2 Q6).
 *
 * S9 (US-2.2, plan §6.4): each group row gets a disclosure button; an
 * expanded group renders a `SessionTable` in a full-width row directly
 * beneath it (plan §1, Option A). The `<tfoot>` total row is untouched
 * (LEARNINGS: `CostTotals` carries no session count, so any total is
 * necessarily derived — it must stay `totals`, never a re-sum of visible
 * rows).
 */
import { Fragment } from "preact";
import { t, tCompareText, tCurrency, tDuration, tNumber } from "../i18n/index.js";
import { groupLabelText } from "./group-label.js";
import { SessionTable } from "./session-table.js";
import { compareSessionRows, type SessionSortField, type SortDirection } from "../model/report.js";
import type { CostTotals, GroupRow } from "../model/report-types.js";

export interface OverviewTableProps {
  /** Rendered in the order given. The component never sorts (plan §2 Q6). */
  readonly groups: readonly GroupRow[];
  /** report.totals. Never a re-sum of `groups` (plan §2 Q6). */
  readonly totals: CostTotals;
  readonly expandedKeys: ReadonlySet<string>;
  readonly sortField: SessionSortField;
  readonly sortDirection: SortDirection;
  readonly onToggle: (groupKey: string) => void;
  readonly onSort: (field: SessionSortField) => void;
}

export function OverviewTable(props: OverviewTableProps) {
  const { groups, totals, expandedKeys, sortField, sortDirection, onToggle, onSort } = props;

  return (
    <table class="overview-table" data-testid="overview-table">
      <thead>
        <tr>
          <th scope="col">{t("overview.columnProject")}</th>
          <th scope="col">{t("overview.columnSessions")}</th>
          <th scope="col">{t("overview.columnRequests")}</th>
          <th scope="col">{t("overview.columnCost")}</th>
          <th scope="col">{t("overview.columnDuration")}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const label = groupLabelText(group.label);
          const isExpanded = expandedKeys.has(group.key);
          const panelId = `session-panel-${group.key}`;
          const toggleLabel = isExpanded
            ? t("overview.collapseGroup", { name: label.text })
            : t("overview.expandGroup", { name: label.text });
          return (
            <Fragment key={group.key}>
              <tr
                data-testid="group-row"
                data-group-key={group.key}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button") !== null) {
                    return;
                  }
                  onToggle(group.key);
                }}
              >
                <th scope="row" data-testid="cell-project" title={label.title}>
                  <button
                    type="button"
                    data-testid="group-disclosure"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    aria-label={toggleLabel}
                    onClick={() => onToggle(group.key)}
                  >
                    {isExpanded ? "▼" : "▶"} {label.text}
                  </button>
                </th>
                <td data-testid="cell-sessions">{tNumber(group.sessionCount)}</td>
                <td data-testid="cell-requests">{tNumber(group.totals.requests)}</td>
                <td data-testid="cell-cost">{tCurrency(group.totals.costMicroUsd / 1e6)}</td>
                <td data-testid="cell-duration">{tDuration(group.totals.durationMs)}</td>
              </tr>
              {isExpanded && (
                <tr data-testid="session-panel-row" id={panelId}>
                  <td colSpan={5}>
                    <SessionTable
                      groupKey={group.key}
                      groupLabel={label.text}
                      sessions={[...group.sessions].sort(
                        compareSessionRows(sortField, sortDirection, { compareText: tCompareText }),
                      )}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={onSort}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
      <tfoot>
        <tr data-testid="total-row">
          <td data-testid="cell-project">{t("overview.totalRow")}</td>
          <td data-testid="cell-sessions">
            {tNumber(groups.reduce((sum, group) => sum + group.sessionCount, 0))}
          </td>
          <td data-testid="cell-requests">{tNumber(totals.requests)}</td>
          <td data-testid="cell-cost">{tCurrency(totals.costMicroUsd / 1e6)}</td>
          <td data-testid="cell-duration">{tDuration(totals.durationMs)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
