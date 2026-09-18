/**
 * US-2.1's project overview table (S8 plan §6.4). Props only — no signal
 * reads inside — so S10's project/folder grouping toggle changes which
 * array is passed in, not this component (plan §2 Q7). Rendered in the
 * order given: the model already decided the sort
 * (`compareByCostDescThenKeyAsc` in `src/model/report.ts`), and this
 * component never re-sorts or re-sums (plan §2 Q6).
 */
import { t, tCurrency, tDuration, tNumber } from "../i18n/index.js";
import { groupLabelText } from "./group-label.js";
import type { CostTotals, GroupRow } from "../model/report-types.js";

export interface OverviewTableProps {
  /** Rendered in the order given. The component never sorts (plan §2 Q6). */
  readonly groups: readonly GroupRow[];
  /** report.totals. Never a re-sum of `groups` (plan §2 Q6). */
  readonly totals: CostTotals;
}

export function OverviewTable(props: OverviewTableProps) {
  const { groups, totals } = props;

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
          return (
            <tr key={group.key} data-testid="group-row" data-group-key={group.key}>
              <td data-testid="cell-project" title={label.title}>
                {label.text}
              </td>
              <td data-testid="cell-sessions">{tNumber(group.sessionCount)}</td>
              <td data-testid="cell-requests">{tNumber(group.totals.requests)}</td>
              <td data-testid="cell-cost">{tCurrency(group.totals.costMicroUsd / 1e6)}</td>
              <td data-testid="cell-duration">{tDuration(group.totals.durationMs)}</td>
            </tr>
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
