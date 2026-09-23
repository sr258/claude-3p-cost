/**
 * US-2.3's model breakdown (S10 plan §1, §2 Q1/Q2/Q5/Q11, §6.4). One
 * breakdown on screen at a time, following the caller's scope: global by
 * default, or one selected group. Session scope is deferred to S11 (plan §2
 * Q2) — this component only ever receives a global or group-level
 * `ModelBreakdown` / `CostTotals` pair.
 *
 * S16a §5.5: lives on its own page (`page === "models"`), not docked beside
 * the overview table — a `<section>`, not an `<aside>`, because on its own
 * page it IS the main content. `onClose` and `onResetScope` are gone: a page
 * cannot be closed, and the scope reset control moved to the context bar's
 * `ScopeSelect`. What stays is the scope *label* — the page states what it
 * is showing.
 *
 * Shares are computed against `ModelBreakdown.costMicroUsd` (the sum over
 * `modelUsage`), never against `totals.costMicroUsd` (the authoritative
 * total, from `total_cost_usd`) — that is what makes them sum to 100%. The
 * difference between the two, when positive, is the unattributed remainder
 * (plan §2 Q5): shown, never absorbed, and never given a share.
 *
 * The share bar is hand-rolled CSS, `aria-hidden` (plan §2 Q11): the same
 * number is already text in the row, so a screen reader would otherwise
 * announce it twice, and nothing here is conveyed by colour or bar length
 * alone (NFR-11).
 */
import { t, tCurrency, tPercent } from "../i18n/index.js";
import { costShare, unattributedCostMicroUsd } from "../model/report.js";
import type { CostTotals, ModelBreakdown } from "../model/report-types.js";

export type ModelScope =
  { readonly kind: "all" } | { readonly kind: "group"; readonly label: string };

export interface ModelPanelProps {
  /** Rendered in the order given; never re-sorted (cf. S8 plan §2 Q6). */
  readonly breakdown: ModelBreakdown;
  /** The authoritative totals for the SAME scope. Used only for the unattributed row. */
  readonly totals: CostTotals;
  readonly scope: ModelScope;
}

export function ModelPanel(props: ModelPanelProps) {
  const { breakdown, totals, scope } = props;
  const unattributed = unattributedCostMicroUsd(totals, breakdown);
  const scopeText = scope.kind === "all" ? t("models.scopeAll") : scope.label;

  return (
    <section
      class="model-panel"
      data-testid="model-panel"
      data-scope={scope.kind}
      data-scope-key={scope.kind === "group" ? scope.label : undefined}
      aria-label={t("models.heading")}
    >
      {/* No heading of its own: on the Models page `app.tsx` renders
          `models.heading` as the page's <h1>, and a second rendering of the
          same string one line below it was the S16a review's finding. The
          section stays labelled for assistive technology through
          `aria-label` above — the parallel change on `TrendSection`
          (which lost its own heading with the disclosure) is what this
          matches. */}
      <div class="model-panel__scope">
        <span data-testid="model-scope-label">{t("models.scopeLabel", { scope: scopeText })}</span>
      </div>

      {breakdown.models.length === 0 && unattributed === 0 ? (
        <p data-testid="model-empty">{t("models.empty")}</p>
      ) : (
        <table class="model-panel__table">
          <thead>
            <tr>
              <th scope="col">{t("models.columnModel")}</th>
              <th scope="col">{t("models.columnCost")}</th>
              <th scope="col">{t("models.columnShare")}</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.models.map((model) => {
              const share = costShare(model.costMicroUsd, breakdown.costMicroUsd);
              return (
                <tr key={model.model} data-testid="model-row" data-model={model.model}>
                  <td data-testid="cell-model">{model.model}</td>
                  <td data-testid="cell-model-cost">{tCurrency(model.costMicroUsd / 1e6)}</td>
                  <td data-testid="cell-model-share">
                    <span>{tPercent(share)}</span>
                    <div class="model-bar-track">
                      <div
                        class="model-bar"
                        data-testid="model-share-bar"
                        data-share={share.toFixed(4)}
                        aria-hidden="true"
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {unattributed > 0 && (
              <tr data-testid="model-unattributed-row">
                <td data-testid="cell-model">{t("models.unattributed")}</td>
                <td data-testid="cell-model-cost">{tCurrency(unattributed / 1e6)}</td>
                <td data-testid="cell-model-share" />
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
