/**
 * US-1.5's gap strip (S10 plan §2 Q3/Q4, §6.6). A dedicated strip directly
 * under the app header, above the toolbar and table, so the "cost not
 * recorded" explanation is on screen rather than hidden behind a tooltip.
 *
 * Only counters greater than zero render (plan §2 Q4): in the reference tree
 * `sessionsWithoutManifest` is 0, so an unconditional chip would be permanent
 * furniture. When every count is zero the strip still renders, as a single
 * `gaps.none` line, so the container itself is always present.
 *
 * Reads no signals -- `gaps` is `report.gaps`, the S4 `summarizeGaps` figure,
 * passed straight through `Report` (LEARNINGS: `CostTotals` carries no
 * session count, so any total is necessarily derived; this component never
 * re-sums anything, it only reads the ScanGaps it is given).
 */
import { t, tCurrency, tPlural } from "../i18n/index.js";
import type { ScanGaps } from "../model/project-types.js";

export interface GapIndicatorsProps {
  readonly gaps: ScanGaps;
}

export function GapIndicators(props: GapIndicatorsProps) {
  const { gaps } = props;
  const hasAnyGap =
    gaps.openRequests > 0 || gaps.sessionsWithoutManifest > 0 || gaps.archivedSessions > 0;

  return (
    <section class="gap-indicators" data-testid="gap-indicators" aria-label={t("gaps.heading")}>
      {!hasAnyGap && <span data-testid="gap-none">{t("gaps.none")}</span>}
      {gaps.openRequests > 0 && (
        <span class="gap-chip" data-testid="gap-open-requests">
          <span>{tPlural("gaps.openRequests", gaps.openRequests)}</span>
          <span class="gap-chip__explanation">{t("gaps.openRequestsExplanation")}</span>
        </span>
      )}
      {gaps.sessionsWithoutManifest > 0 && (
        <span class="gap-chip" data-testid="gap-sessions-without-manifest">
          <span>{tPlural("gaps.sessionsWithoutManifest", gaps.sessionsWithoutManifest)}</span>
          <span class="gap-chip__explanation">
            {t("gaps.sessionsWithoutManifestCost", {
              cost: tCurrency(gaps.costMicroUsdWithoutManifest / 1e6),
            })}
          </span>
        </span>
      )}
      {gaps.archivedSessions > 0 && (
        <span class="gap-chip" data-testid="gap-archived-sessions">
          {tPlural("gaps.archivedSessions", gaps.archivedSessions)}
        </span>
      )}
    </section>
  );
}
