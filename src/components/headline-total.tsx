/**
 * D13's headline total (S16b plan §0.1 Q1/Q2/Q3, §5.2). The banner band above
 * every report page's context bar: cost as a display-size number, one
 * secondary line reading scope · period · session count, and — only when own
 * prices are configured and a recomputation exists — a second smaller line
 * carrying the own-price figure.
 *
 * Props only, no signal reads: the `ModelPanel` / `ContextBar` contract.
 * `costMicroUsd` and `sessionCount` are never re-aggregated here — they come
 * from `report.totals` / `report.sessions.length` or the selected group's own
 * fields (LEARNINGS: `CostTotals` carries no session count, so any total is
 * necessarily derived, and must never be a re-sum of visible rows).
 */
import { t, tCurrency, tNumber, tPlural } from "../i18n/index.js";
import type { Grouping } from "../state/app-state.js";

export interface HeadlineTotalProps {
  /** report.totals.costMicroUsd, or the selected group's. Never re-aggregated here. */
  readonly costMicroUsd: number;
  /** report.sessions.length, or the group's own sessionCount. Never a re-sum. */
  readonly sessionCount: number;
  readonly grouping: Grouping;
  /** null = global scope -> scope.allProjects / scope.allFolders. */
  readonly scopeLabel: string | null;
  /** null = all time. Built by rangeLabel(); this component does no date maths. */
  readonly periodLabel: string | null;
  /** null unless own prices are configured AND a recomputation exists. */
  readonly ownCostMicroUsd: number | null;
  readonly ownExcludedSessions: number;
}

export function HeadlineTotal(props: HeadlineTotalProps) {
  const {
    costMicroUsd,
    sessionCount,
    grouping,
    scopeLabel,
    periodLabel,
    ownCostMicroUsd,
    ownExcludedSessions,
  } = props;

  const scopeText =
    scopeLabel ?? (grouping === "folder" ? t("scope.allFolders") : t("scope.allProjects"));

  return (
    <div class="headline-total" data-testid="headline-total">
      <p class="headline-total__cost" data-testid="headline-cost">
        <span class="visually-hidden">{t("headline.costLabel")} </span>
        {tCurrency(costMicroUsd / 1e6)}
      </p>
      <p class="headline-total__meta" data-testid="headline-meta">
        <span>{scopeText}</span>
        {periodLabel !== null && <span>{periodLabel}</span>}
        <span data-testid="headline-sessions">{tPlural("scan.sessionCount", sessionCount)}</span>
      </p>
      {ownCostMicroUsd !== null && (
        <p class="headline-total__own" data-testid="headline-own-cost">
          <span class="visually-hidden">{t("headline.ownCostLabel")} </span>
          {`≈ ${tCurrency(ownCostMicroUsd / 1e6)}`}
          {ownExcludedSessions > 0 && (
            <span class="headline-total__own-excluded" data-testid="headline-own-excluded">
              <span aria-hidden="true"> ⚠</span>
              <span class="visually-hidden">
                {t(
                  ownExcludedSessions === 1 ? "recompute.excluded.one" : "recompute.excluded.other",
                  { count: tNumber(ownExcludedSessions), total: tNumber(sessionCount) },
                )}
              </span>
            </span>
          )}
        </p>
      )}
    </div>
  );
}
