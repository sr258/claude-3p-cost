/**
 * US-5.2's trend section (S14 plan §1, §2 Q1-Q3, §4.3). A collapsible,
 * full-width section below the overview table, tables only — the chart is
 * S18's job (roadmap: "the data shape must be right before anything is drawn
 * on it"). Props only, no signal reads — the `GroupingToggle` / `ModelPanel`
 * contract.
 *
 * Rows render newest first (Q6) by reversing `series.points` for display;
 * `series` itself is never mutated, and `TrendSeries.points` stays ascending
 * so S18 can draw it unchanged.
 *
 * Delta direction is carried by the sign in the text AND by
 * `data-delta="up" | "down" | "flat" | "none"`, never by colour alone
 * (NFR-11). The zero-fill marker `data-zero` is deliberately a `data-` name
 * (LEARNINGS: Preact keeps `false` for `data-*` and drops it elsewhere) so
 * both branches render as an actual attribute value, never an absent one.
 */
import { t, tCurrency, tDate, tNumber, tPercent } from "../i18n/index.js";
import {
  MAX_TREND_POINTS,
  type Granularity,
  type TrendPoint,
  type TrendSeries,
} from "../model/trend.js";

export type TrendScope =
  { readonly kind: "all" } | { readonly kind: "group"; readonly label: string };

export interface TrendSectionProps {
  readonly series: TrendSeries;
  readonly granularity: Granularity;
  readonly scope: TrendScope;
  readonly open: boolean;
  readonly onGranularity: (g: Granularity) => void;
  readonly onToggleOpen: () => void;
  /** Null when the scope is already "all" — the reset control is then absent. */
  readonly onResetScope: (() => void) | null;
}

type DeltaDirection = "up" | "down" | "flat" | "none";

function deltaDirectionOf(ratio: number | null): DeltaDirection {
  if (ratio === null) return "none";
  if (ratio > 0) return "up";
  if (ratio < 0) return "down";
  return "flat";
}

/**
 * A bucket key is a calendar label already expressed in the resolved zone.
 * Rendering it goes through `timeZone: "UTC"` deliberately (S14 plan §4.6):
 * reconstructing a UTC instant from the key's parts and formatting THAT
 * instant in UTC. Without the explicit zone, `Intl` re-applies the host
 * offset on top and a negative-offset host displays every row one day early.
 */
function formatPeriod(key: string, granularity: Granularity): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  if (granularity === "day") {
    const d = Number(key.slice(8, 10));
    return tDate(Date.UTC(y, m - 1, d), { dateStyle: "medium", timeZone: "UTC" });
  }
  return tDate(Date.UTC(y, m - 1, 1), { year: "numeric", month: "short", timeZone: "UTC" });
}

function TrendRow(props: { readonly point: TrendPoint; readonly granularity: Granularity }) {
  const { point, granularity } = props;
  const direction = deltaDirectionOf(point.deltaRatio);
  return (
    <tr
      data-testid="trend-row"
      data-key={point.key}
      data-zero={point.isZero}
      data-delta={direction}
    >
      <td data-testid="trend-cell-period">{formatPeriod(point.key, granularity)}</td>
      <td data-testid="trend-cell-cost">{tCurrency(point.costMicroUsd / 1e6)}</td>
      <td data-testid="trend-cell-requests">{tNumber(point.requests)}</td>
      <td data-testid="trend-cell-share">{tPercent(point.share)}</td>
      <td data-testid="trend-cell-delta">
        {point.deltaRatio === null
          ? t("trend.deltaNone")
          : tPercent(point.deltaRatio, { signDisplay: "exceptZero" })}
      </td>
    </tr>
  );
}

export function TrendSection(props: TrendSectionProps) {
  const { series, granularity, scope, open, onGranularity, onToggleOpen, onResetScope } = props;
  const scopeText = scope.kind === "all" ? t("trend.scopeAll") : scope.label;
  const deltaColumnKey = granularity === "day" ? "trend.columnDeltaDay" : "trend.columnDeltaMonth";
  const displayPoints = [...series.points].reverse();

  return (
    <section class="trend-section" data-testid="trend-section" data-open={open}>
      <div class="trend-section__header">
        <h2 class="trend-section__heading">{t("trend.heading")}</h2>
        <button
          type="button"
          class="trend-section__disclosure"
          data-testid="trend-disclosure"
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          {open ? t("trend.collapse") : t("trend.expand")}
        </button>
      </div>

      {open && (
        <>
          <div class="trend-section__controls">
            <div
              class="trend-granularity"
              data-testid="trend-granularity"
              role="radiogroup"
              aria-label={t("trend.granularity")}
            >
              <button
                type="button"
                role="radio"
                data-granularity="day"
                aria-checked={granularity === "day"}
                onClick={() => onGranularity("day")}
              >
                {t("trend.day")}
              </button>
              <button
                type="button"
                role="radio"
                data-granularity="month"
                aria-checked={granularity === "month"}
                onClick={() => onGranularity("month")}
              >
                {t("trend.month")}
              </button>
            </div>

            <div class="trend-section__scope">
              <span data-testid="trend-scope-label">
                {t("trend.scopeLabel", { scope: scopeText })}
              </span>
              {onResetScope !== null && (
                <button type="button" data-testid="trend-scope-reset" onClick={onResetScope}>
                  {t("trend.clearScope")}
                </button>
              )}
            </div>
          </div>

          {series.points.length === 0 ? (
            <p data-testid="trend-empty">{t("trend.empty")}</p>
          ) : (
            <table class="trend-table" data-testid="trend-table">
              <thead>
                <tr>
                  <th scope="col">{t("trend.columnPeriod")}</th>
                  <th scope="col">{t("trend.columnCost")}</th>
                  <th scope="col">{t("trend.columnRequests")}</th>
                  <th scope="col">{t("trend.columnShare")}</th>
                  <th scope="col">{t(deltaColumnKey)}</th>
                </tr>
              </thead>
              <tbody>
                {displayPoints.map((point) => (
                  <TrendRow key={point.key} point={point} granularity={granularity} />
                ))}
              </tbody>
            </table>
          )}

          {series.undated.requests > 0 && (
            <p data-testid="trend-undated">
              {t("trend.undated", {
                cost: tCurrency(series.undated.costMicroUsd / 1e6),
                count: tNumber(series.undated.requests),
              })}
            </p>
          )}

          {!series.filled && (
            <p data-testid="trend-unfilled">
              {t("trend.unfilled", { max: tNumber(MAX_TREND_POINTS) })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
