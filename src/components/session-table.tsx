/**
 * US-2.2's session drill-down table (S9 plan §6.3). Props only — no signal
 * reads, no sorting inside: `sessions` arrives already sorted by the caller,
 * exactly like `OverviewTable` (S8 plan §2 Q6). Rendered inline, in a
 * `<td colSpan>` under the owning project row (S9 plan §1, Option A).
 *
 * Session rows are NOT clickable and carry no navigation (S9 plan §3) — that
 * is S11's job.
 */
import { t, tCurrency, tDateTime, tDuration, tNumber } from "../i18n/index.js";
import type { SessionRow } from "../model/report-types.js";
import { sessionLastActivity, type SessionSortField, type SortDirection } from "../model/report.js";

/** The eight column headers, none of which take a placeholder. */
type ColumnLabelKey =
  | "session.columnId"
  | "session.columnTitle"
  | "session.columnRequests"
  | "session.columnCost"
  | "session.columnOutputTokens"
  | "session.columnCacheRead"
  | "session.columnDuration"
  | "session.columnLastActivity";

export interface SessionTableProps {
  /** The owning group's key. Used for ids and the caption; never for sorting. */
  readonly groupKey: string;
  /** The owning group's display label, for the (visually hidden) caption. */
  readonly groupLabel: string;
  /** Already sorted by the caller. This component never sorts (cf. S8 §2 Q6). */
  readonly sessions: readonly SessionRow[];
  readonly sortField: SessionSortField;
  readonly sortDirection: SortDirection;
  readonly onSort: (field: SessionSortField) => void;
}

interface ColumnDef {
  readonly field: SessionSortField | null;
  readonly testId: string;
  readonly labelKey: ColumnLabelKey;
}

const COLUMNS: readonly ColumnDef[] = [
  { field: null, testId: "cell-session-id", labelKey: "session.columnId" },
  { field: "title", testId: "cell-title", labelKey: "session.columnTitle" },
  { field: "requests", testId: "cell-requests", labelKey: "session.columnRequests" },
  { field: "cost", testId: "cell-cost", labelKey: "session.columnCost" },
  { field: null, testId: "cell-output-tokens", labelKey: "session.columnOutputTokens" },
  { field: null, testId: "cell-cache-read", labelKey: "session.columnCacheRead" },
  { field: "duration", testId: "cell-duration", labelKey: "session.columnDuration" },
  { field: "lastActivity", testId: "cell-last-activity", labelKey: "session.columnLastActivity" },
];

export function SessionTable(props: SessionTableProps) {
  const { groupLabel, sessions, sortField, sortDirection, onSort } = props;

  return (
    <table class="session-table" data-testid="session-table" data-group-key={props.groupKey}>
      <caption class="visually-hidden">
        {t("session.tableCaption", { project: groupLabel })}
      </caption>
      <thead>
        <tr>
          {COLUMNS.map((column) => {
            if (column.field === null) {
              return (
                <th scope="col" key={column.testId}>
                  {t(column.labelKey)}
                </th>
              );
            }
            const isActive = sortField === column.field;
            const ariaSort: "ascending" | "descending" | "none" = isActive
              ? sortDirection === "asc"
                ? "ascending"
                : "descending"
              : "none";
            return (
              <th scope="col" key={column.testId} aria-sort={ariaSort}>
                <button
                  type="button"
                  data-testid={`sort-${column.field}`}
                  aria-label={t("session.sortBy", { column: t(column.labelKey) })}
                  onClick={() => onSort(column.field as SessionSortField)}
                >
                  {t(column.labelKey)}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => {
          const lastActivity = sessionLastActivity(session);
          return (
            <tr
              key={session.sessionId}
              data-testid="session-row"
              data-session-id={session.sessionId}
              data-archived={session.isArchived ? "true" : undefined}
            >
              <td data-testid="cell-session-id" class="session-table__id">
                {session.sessionId}
              </td>
              <td data-testid="cell-title">
                {session.title === "" ? t("session.untitled") : session.title}
                {session.isArchived && (
                  <span data-testid="archived-badge">{t("session.archived")}</span>
                )}
              </td>
              <td data-testid="cell-requests">{tNumber(session.totals.requests)}</td>
              <td data-testid="cell-cost">{tCurrency(session.totals.costMicroUsd / 1e6)}</td>
              <td data-testid="cell-output-tokens">
                {tNumber(session.totals.tokens.outputTokens)}
              </td>
              <td data-testid="cell-cache-read">
                {tNumber(session.totals.tokens.cacheReadInputTokens)}
              </td>
              <td data-testid="cell-duration">{tDuration(session.totals.durationMs)}</td>
              <td data-testid="cell-last-activity">
                {lastActivity === null ? t("session.noActivity") : tDateTime(lastActivity)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
