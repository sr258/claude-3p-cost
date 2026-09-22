/**
 * US-4.3's transparency panel (S16 plan §2.3): the calculation per model and
 * token category, tokens × price = amount, plus the deviation from the
 * logged list price in absolute and percentage terms. Appended to
 * `SessionDetail`'s existing vertical `<section>` stack (S11 built that stack
 * so this is an append, not a relayout).
 *
 * Reads `modelUsage`-derived figures ONLY (via `SessionRecomputation`), which
 * is why `methodNote` below exists in words: this table's token counts are
 * NOT the same as `SessionDetail`'s own category table just above it (S11,
 * `session.totals.tokens` / `usage`) — plan §0.1. Both are correct; they
 * answer different questions and must never share a display.
 */
import { Fragment } from "preact";
import { t, tCurrency, tNumber, tPercent } from "../i18n/index.js";
import { PRICE_FIELD_UNIT, type PriceField } from "../model/prices.js";
import type { RecomputeCategory, RecomputeLine, SessionRecomputation } from "../model/recompute.js";
import { CATEGORY_PRICE_FIELD } from "../model/recompute.js";

export interface RecomputePanelProps {
  /** Null when no own price is configured at all. */
  readonly recomputation: SessionRecomputation | null;
  /** S11's `unattributedCostMicroUsd(session.totals, session.models)` — passed in, never recomputed here. */
  readonly unattributedCostMicroUsd: number;
}

const SIGNED: Intl.NumberFormatOptions = { signDisplay: "exceptZero" };

const CATEGORY_LABEL_KEY: Record<
  RecomputeCategory,
  | "detail.recompute.category.input"
  | "detail.recompute.category.output"
  | "detail.recompute.category.cacheWrite"
  | "detail.recompute.category.cacheRead"
  | "detail.recompute.category.webSearch"
> = {
  input: "detail.recompute.category.input",
  output: "detail.recompute.category.output",
  cacheWrite: "detail.recompute.category.cacheWrite",
  cacheRead: "detail.recompute.category.cacheRead",
  webSearch: "detail.recompute.category.webSearch",
};

function priceCell(field: PriceField, priceMicroUsd: number | null): string {
  if (priceMicroUsd === null) {
    return "—";
  }
  const usd = priceMicroUsd / 1_000_000;
  return PRICE_FIELD_UNIT[field] === "per-request"
    ? t("detail.recompute.perRequestPrice", { price: tCurrency(usd) })
    : tCurrency(usd);
}

function unitsCell(line: RecomputeLine): string {
  return line.unit === "per-request"
    ? t(
        line.units === 1
          ? "detail.recompute.requestsUnit.one"
          : "detail.recompute.requestsUnit.other",
        {
          count: tNumber(line.units),
        },
      )
    : tNumber(line.units);
}

function amountCell(amountMicroUsd: number | null): string {
  return amountMicroUsd === null ? "—" : tCurrency(amountMicroUsd / 1e6);
}

function deviationCell(
  ownMicroUsd: number,
  listMicroUsd: number,
): { ratio: string; amount: string } {
  const deviationMicroUsd = ownMicroUsd - listMicroUsd;
  if (listMicroUsd === 0) {
    return {
      ratio: t("detail.recompute.deviationNoBase"),
      amount: tCurrency(deviationMicroUsd / 1e6, "USD", SIGNED),
    };
  }
  return {
    ratio: tPercent(deviationMicroUsd / listMicroUsd, SIGNED),
    amount: tCurrency(deviationMicroUsd / 1e6, "USD", SIGNED),
  };
}

export function RecomputePanel(props: RecomputePanelProps) {
  const { recomputation, unattributedCostMicroUsd } = props;

  if (recomputation === null) {
    return (
      <section class="session-detail__recompute" data-testid="recompute-panel">
        <h4>{t("detail.recompute.heading")}</h4>
        <p data-testid="recompute-not-configured">{t("detail.recompute.notConfigured")}</p>
      </section>
    );
  }

  if (recomputation.sessionExcluded) {
    return (
      <section class="session-detail__recompute" data-testid="recompute-panel">
        <h4>{t("detail.recompute.heading")}</h4>
        <p data-testid="recompute-not-computable">
          {t("detail.recompute.notComputable", {
            models: recomputation.excluded.models.join(", "),
          })}
        </p>
      </section>
    );
  }

  const sessionDeviation = deviationCell(
    recomputation.costMicroUsd,
    recomputation.listCostMicroUsd,
  );
  const hasCacheWrite = recomputation.models.some(
    (m) => m.lines.find((l) => l.category === "cacheWrite")!.units > 0,
  );

  return (
    <section class="session-detail__recompute" data-testid="recompute-panel">
      <h4>{t("detail.recompute.heading")}</h4>
      <table class="recompute-table" data-testid="recompute-table">
        <thead>
          <tr>
            <th scope="col">{t("detail.recompute.columnCategory")}</th>
            <th scope="col">{t("detail.recompute.columnTokens")}</th>
            <th scope="col">{t("detail.recompute.columnPrice")}</th>
            <th scope="col">{t("detail.recompute.columnAmount")}</th>
          </tr>
        </thead>
        <tbody>
          {recomputation.models.map((model) => {
            const modelDeviation = deviationCell(model.costMicroUsd, model.listCostMicroUsd);
            return (
              <Fragment key={model.model}>
                <tr data-testid="recompute-model-row" data-model={model.model}>
                  <th scope="rowgroup" colSpan={4}>
                    {model.model}
                  </th>
                </tr>
                {model.lines.map((line) => {
                  const field = CATEGORY_PRICE_FIELD[line.category];
                  return (
                    <tr
                      key={line.category}
                      data-testid="recompute-line"
                      data-model={model.model}
                      data-category={line.category}
                    >
                      <td class="session-detail__indented">
                        {t(CATEGORY_LABEL_KEY[line.category])}
                      </td>
                      <td data-testid="recompute-line-units">{unitsCell(line)}</td>
                      <td data-testid="recompute-line-price">
                        {priceCell(field, line.priceMicroUsd)}
                      </td>
                      <td data-testid="recompute-line-amount">{amountCell(line.amountMicroUsd)}</td>
                    </tr>
                  );
                })}
                <tr data-testid="recompute-model-sum-own">
                  <td class="session-detail__indented">{t("detail.recompute.sumOwn")}</td>
                  <td />
                  <td />
                  <td>{tCurrency(model.costMicroUsd / 1e6)}</td>
                </tr>
                <tr data-testid="recompute-model-sum-list">
                  <td class="session-detail__indented">{t("detail.recompute.sumList")}</td>
                  <td />
                  <td />
                  <td>{tCurrency(model.listCostMicroUsd / 1e6)}</td>
                </tr>
                <tr data-testid="recompute-model-deviation">
                  <td class="session-detail__indented">{t("detail.recompute.deviation")}</td>
                  <td />
                  <td>{modelDeviation.ratio}</td>
                  <td>{modelDeviation.amount}</td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {hasCacheWrite && (
        <p class="recompute-panel__cache-note" data-testid="recompute-cache-write-note">
          {t("detail.recompute.cacheWriteNote")}
        </p>
      )}

      <table class="recompute-table recompute-table--totals" data-testid="recompute-totals">
        <tbody>
          <tr data-testid="recompute-session-total-own">
            <td>{t("detail.recompute.sessionTotalOwn")}</td>
            <td>{tCurrency(recomputation.costMicroUsd / 1e6)}</td>
          </tr>
          <tr data-testid="recompute-session-total-list">
            <td>{t("detail.recompute.sessionTotalList")}</td>
            <td>{tCurrency(recomputation.listCostMicroUsd / 1e6)}</td>
          </tr>
          <tr data-testid="recompute-session-deviation">
            <td>{t("detail.recompute.deviation")}</td>
            <td>
              {sessionDeviation.ratio} / {sessionDeviation.amount}
            </td>
          </tr>
          {recomputation.bracket !== null ? (
            <tr data-testid="recompute-session-bracket">
              <td>{t("detail.recompute.bracketLine")}</td>
              <td>{tCurrency(recomputation.bracket.costMicroUsd / 1e6)}</td>
            </tr>
          ) : (
            recomputation.bracketUnavailableModels.length > 0 && (
              <tr data-testid="recompute-session-bracket-unavailable">
                <td colSpan={2}>
                  {t("detail.recompute.bracketUnavailable", {
                    models: recomputation.bracketUnavailableModels.join(", "),
                  })}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <p data-testid="recompute-method-note">{t("detail.recompute.methodNote")}</p>
      {unattributedCostMicroUsd > 0 && (
        <p data-testid="recompute-unattributed">
          {t("detail.recompute.unattributed", { cost: tCurrency(unattributedCostMicroUsd / 1e6) })}
        </p>
      )}
    </section>
  );
}
