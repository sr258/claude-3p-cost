/**
 * US-2.2's session drill-down table (S9 plan §6.3). Props only — no signal
 * reads, no sorting inside: `sessions` arrives already sorted by the caller,
 * exactly like `OverviewTable` (S8 plan §2 Q6). Rendered inline, in a
 * `<td colSpan>` under the owning project row (S9 plan §1, Option A).
 *
 * Session rows are NOT clickable and carry no navigation (S9 plan §3) — that
 * is S11's job.
 *
 * S16a §6.2: the session-ID column is gone — a session directory id told
 * nobody anything as a column. It survives as the title of an untitled
 * session (below) and as a monospace line in `SessionDetail`'s header. The
 * detail row's `colSpan` is derived from `COLUMNS.length` rather than
 * hardcoded, so the next column change cannot silently desynchronise it.
 */
import { Fragment } from "preact";
import { t, tCurrency, tDateTime, tDuration, tNumber, tPercent } from "../i18n/index.js";
import { SessionDetail } from "./session-detail.js";
import type { SessionRow } from "../model/report-types.js";
import { sessionLastActivity, type SessionSortField, type SortDirection } from "../model/report.js";
import type { SessionRecomputation } from "../model/recompute.js";

const SIGNED: Intl.NumberFormatOptions = { signDisplay: "exceptZero" };

/** The eight column headers, none of which take a placeholder. */
type ColumnLabelKey =
  | "session.columnDisclosure"
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
  /** US-3.1's session detail disclosure (S11 plan §4.6). */
  readonly expandedSessionKeys: ReadonlySet<string>;
  readonly onToggleSession: (sessionId: string) => void;
  /** Threaded to `SessionDetail`'s tool-usage-unfiltered note (S13 plan §4.8, Q11). */
  readonly rangeActive: boolean;
  /** Keyed by `SessionRow.sessionId`. Null when no own price is configured (S16 §2.2). */
  readonly sessionRecomputations?: ReadonlyMap<string, SessionRecomputation> | null;
}

interface ColumnDef {
  readonly field: SessionSortField | null;
  readonly testId: string;
  readonly labelKey: ColumnLabelKey;
  /** The disclosure column's header text is visually hidden, not empty. */
  readonly hiddenLabel?: boolean;
}

const COLUMNS: readonly ColumnDef[] = [
  {
    field: null,
    testId: "cell-disclosure",
    labelKey: "session.columnDisclosure",
    hiddenLabel: true,
  },
  { field: "title", testId: "cell-title", labelKey: "session.columnTitle" },
  { field: "requests", testId: "cell-requests", labelKey: "session.columnRequests" },
  { field: "cost", testId: "cell-cost", labelKey: "session.columnCost" },
  { field: null, testId: "cell-output-tokens", labelKey: "session.columnOutputTokens" },
  { field: null, testId: "cell-cache-read", labelKey: "session.columnCacheRead" },
  { field: "duration", testId: "cell-duration", labelKey: "session.columnDuration" },
  { field: "lastActivity", testId: "cell-last-activity", labelKey: "session.columnLastActivity" },
];

export function SessionTable(props: SessionTableProps) {
  const {
    groupLabel,
    sessions,
    sortField,
    sortDirection,
    onSort,
    expandedSessionKeys,
    onToggleSession,
    rangeActive,
    sessionRecomputations,
  } = props;

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
                  {column.hiddenLabel ? (
                    <span class="visually-hidden">{t(column.labelKey)}</span>
                  ) : (
                    t(column.labelKey)
                  )}
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
          const isExpanded = expandedSessionKeys.has(session.sessionId);
          const detailId = `session-detail-${session.sessionId}`;
          const toggleLabel = isExpanded
            ? t("detail.collapseSession", { id: session.sessionId })
            : t("detail.expandSession", { id: session.sessionId });
          return (
            <Fragment key={session.sessionId}>
              <tr
                data-testid="session-row"
                data-session-id={session.sessionId}
                data-archived={session.isArchived ? "true" : undefined}
                data-partial={session.isPartial}
              >
                <td data-testid="cell-disclosure">
                  <button
                    type="button"
                    data-testid="session-disclosure"
                    aria-expanded={isExpanded}
                    aria-controls={detailId}
                    aria-label={toggleLabel}
                    onClick={() => onToggleSession(session.sessionId)}
                  >
                    {isExpanded ? "▼" : "▶"}
                  </button>
                </td>
                <td data-testid="cell-title">
                  {session.title === "" ? (
                    <span class="session-table__id">{session.sessionId}</span>
                  ) : (
                    session.title
                  )}
                  {session.isArchived && (
                    <span data-testid="archived-badge">{t("session.archived")}</span>
                  )}
                  {session.isPartial && (
                    <span
                      class="session-table__partial"
                      data-testid="partial-badge"
                      title={t("session.partialTitle", {
                        included: tNumber(session.totals.requests),
                        total: tNumber(session.totals.requests + session.excludedRequests),
                      })}
                    >
                      {t("session.partial")}
                    </span>
                  )}
                </td>
                <td data-testid="cell-requests">{tNumber(session.totals.requests)}</td>
                <td data-testid="cell-cost">
                  {tCurrency(session.totals.costMicroUsd / 1e6)}
                  {(() => {
                    const own = sessionRecomputations?.get(session.sessionId) ?? null;
                    if (own === null) {
                      return null;
                    }
                    let text: string;
                    if (own.sessionExcluded) {
                      text = t("session.costOwnNotComputable");
                    } else if (own.deviationRatio === null) {
                      text = t("session.costOwnNoBase", {
                        cost: tCurrency(own.costMicroUsd / 1e6),
                      });
                    } else {
                      text = t("session.costOwn", {
                        cost: tCurrency(own.costMicroUsd / 1e6),
                        ratio: tPercent(own.deviationRatio, SIGNED),
                      });
                    }
                    return (
                      <span
                        class="session-table__cost-own"
                        data-testid="cell-cost-own"
                        data-computed="true"
                      >
                        {text}
                      </span>
                    );
                  })()}
                </td>
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
              {isExpanded && (
                <tr data-testid="session-detail-row">
                  <td colSpan={COLUMNS.length} id={detailId}>
                    <SessionDetail
                      session={session}
                      rangeActive={rangeActive}
                      recomputation={sessionRecomputations?.get(session.sessionId) ?? null}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
