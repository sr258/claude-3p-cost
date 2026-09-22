/**
 * US-4.2's exclusion reporting (Q2) and US-4.1's `costBasis`/`provider`
 * transparency (Q5), plus the deviation and 5-minute bracket prose (Q3, Q6).
 * Presentational: takes a `Recomputation` (or `null` before any own price is
 * configured / before a report exists) and a `CostBasisSummary`. Used both
 * above the overview table (report-wide scope) and inside the session detail
 * (session scope) — the same component, different props, per S16 plan §2.1.
 */
import { t, tCurrency, tNumber, tPercent } from "../i18n/index.js";
import type { CostBasisSummary } from "../model/cost-basis.js";
import type { Recomputation } from "../model/recompute.js";

export interface RecomputeNoteProps {
  /** Null before any own price is configured, or before a report exists. */
  readonly recomputation: Recomputation | null;
  /** Total sessions in this scope (included + excluded), for the "N of total" wording. */
  readonly totalSessions: number;
  readonly costBasis: CostBasisSummary | null;
}

const SIGNED: Intl.NumberFormatOptions = { signDisplay: "exceptZero" };

function joinModels(models: readonly string[]): string {
  return models.join(", ");
}

function joinValues(values: readonly string[], truncated: boolean): string {
  if (values.length === 0) {
    return "";
  }
  const joined = values.join(", ");
  return truncated ? `${joined} (${t("recompute.truncated")})` : joined;
}

export function RecomputeNote(props: RecomputeNoteProps) {
  const { recomputation, totalSessions, costBasis } = props;

  return (
    <div class="recompute-note" data-testid="recompute-note">
      {recomputation !== null && recomputation.excluded.sessions > 0 && (
        <p class="recompute-note__exclusion" data-testid="recompute-exclusion">
          {t(
            recomputation.excluded.sessions === 1
              ? "recompute.excluded.one"
              : "recompute.excluded.other",
            { count: tNumber(recomputation.excluded.sessions), total: tNumber(totalSessions) },
          )}
          {recomputation.excluded.models.length > 0 && (
            <>
              {" "}
              <span data-testid="recompute-excluded-models">
                {t("recompute.excludedModels", {
                  models: joinModels(recomputation.excluded.models),
                })}
              </span>
            </>
          )}
        </p>
      )}

      {recomputation !== null && !recomputation.isEmpty && (
        <p class="recompute-note__deviation" data-testid="recompute-deviation">
          {recomputation.deviationRatio === null ? (
            t("recompute.deviationZeroBase")
          ) : (
            <>
              {t("recompute.deviation", {
                ratio: tPercent(recomputation.deviationRatio, SIGNED),
                amount: tCurrency(recomputation.deviationMicroUsd / 1e6, "USD", SIGNED),
              })}
            </>
          )}
        </p>
      )}

      {recomputation !== null && !recomputation.isEmpty && recomputation.bracket !== null && (
        <p class="recompute-note__bracket" data-testid="recompute-bracket">
          {recomputation.bracket.deviationRatio === null
            ? t("recompute.bracket", { ratio: "—" })
            : t("recompute.bracket", {
                ratio: tPercent(recomputation.bracket.deviationRatio, SIGNED),
              })}
        </p>
      )}

      {recomputation !== null &&
        !recomputation.isEmpty &&
        recomputation.bracket === null &&
        recomputation.bracketUnavailableModels.length > 0 && (
          <p
            class="recompute-note__bracket-unavailable"
            data-testid="recompute-bracket-unavailable"
          >
            {t("recompute.bracketUnavailable", {
              models: joinModels(recomputation.bracketUnavailableModels),
            })}
          </p>
        )}

      {costBasis !== null && (
        <p class="recompute-note__cost-basis" data-testid="recompute-cost-basis">
          {costBasis.costBases.length === 0
            ? t("recompute.costBasisNoBases", {
                providers: joinValues(costBasis.providers, costBasis.truncated),
              })
            : t("recompute.costBasis", {
                bases: joinValues(costBasis.costBases, costBasis.truncated),
                providers: joinValues(costBasis.providers, costBasis.truncated),
              })}
          {costBasis.unstatedCostBasisEntries > 0 && (
            <>
              {" "}
              <span data-testid="recompute-cost-basis-unstated">
                (
                {t(
                  costBasis.unstatedCostBasisEntries === 1
                    ? "recompute.costBasisUnstated.one"
                    : "recompute.costBasisUnstated.other",
                  { count: tNumber(costBasis.unstatedCostBasisEntries) },
                )}
                )
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
