/**
 * US-3.1's cost-driver detail (S11 plan §4.4). Props only, no signal reads,
 * consistent with `SessionTable` and `ModelPanel`. Rendered full-width
 * beneath an expanded session row (plan §1, §2 Q1).
 *
 * Sections, in order: header (measured cost), token categories (a token
 * SHARE, never a cost share — plan §2 Q5), server-tool/subagent summary,
 * tool usage (S12 plan §4.6 — call counts only, never a cost attribution),
 * the session-scoped model breakdown (discharges S10's "session scope
 * deferred to S11" comment), the request list, and an open-request note.
 * Vertical `<section>`s throughout so S12's addition was an append, not a
 * relayout.
 */
import { Fragment } from "preact";
import { t, tCurrency, tDateTime, tDuration, tNumber, tPercent, tPlural } from "../i18n/index.js";
import { costShare, unattributedCostMicroUsd } from "../model/report.js";
import type { RequestRecord } from "../model/audit-types.js";
import type { SessionRow } from "../model/report-types.js";
import { tokenCategories, type TokenCategoryKind } from "../model/token-categories.js";
import { parseTimestamp } from "../model/time-buckets.js";

export interface SessionDetailProps {
  /** Requests are already ordered by the model; this component never sorts. */
  readonly session: SessionRow;
}

const CATEGORY_LABEL_KEY: Record<
  TokenCategoryKind,
  | "detail.category.input"
  | "detail.category.output"
  | "detail.category.cacheWrite1h"
  | "detail.category.cacheWrite5m"
  | "detail.category.cacheWriteOther"
  | "detail.category.cacheRead"
> = {
  input: "detail.category.input",
  output: "detail.category.output",
  cacheWrite1h: "detail.category.cacheWrite1h",
  cacheWrite5m: "detail.category.cacheWrite5m",
  cacheWriteOther: "detail.category.cacheWriteOther",
  cacheRead: "detail.category.cacheRead",
};

function requestKey(request: RequestRecord, index: number): string {
  return request.timestamp ?? `no-timestamp-${index}`;
}

export function SessionDetail(props: SessionDetailProps) {
  const { session } = props;
  const breakdown = tokenCategories(session.totals.tokens);
  const unattributed = unattributedCostMicroUsd(session.totals, session.models);

  const webSearchRequests = session.totals.tokens.webSearchRequests;
  const webFetchRequests = session.totals.tokens.webFetchRequests;
  const subagentsSpawned = session.totals.subagentsSpawned;
  const showServerToolSummary = webSearchRequests + webFetchRequests + subagentsSpawned > 0;
  const toolsHeadingId = `tool-usage-heading-${session.sessionId}`;

  return (
    <div class="session-detail" data-testid="session-detail" data-session-id={session.sessionId}>
      <section class="session-detail__header">
        <h3>{t("detail.heading")}</h3>
        <span data-testid="detail-measured-cost">
          {t("detail.measuredCost", { cost: tCurrency(session.totals.costMicroUsd / 1e6) })}
        </span>
      </section>

      <section class="session-detail__categories">
        <p data-testid="token-share-note">{t("detail.tokenShareNote")}</p>
        <table class="category-table" data-testid="category-table">
          <caption class="visually-hidden">
            {t("detail.tableCaption", { id: session.sessionId })}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("detail.columnCategory")}</th>
              <th scope="col">{t("detail.columnTokens")}</th>
              <th scope="col">{t("detail.columnTokenShare")}</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.categories.map((category) => (
              <Fragment key={category.kind}>
                <tr data-testid="category-row" data-category={category.kind}>
                  <td>{t(CATEGORY_LABEL_KEY[category.kind])}</td>
                  <td data-testid="category-tokens">{tNumber(category.tokens)}</td>
                  <td data-testid="category-share">
                    <span>{tPercent(category.share)}</span>
                    <div class="model-bar-track">
                      <div
                        class="model-bar"
                        aria-hidden="true"
                        style={{ width: `${category.share * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
                {category.kind === "output" && (
                  <tr data-testid="thinking-row">
                    <td class="session-detail__indented">{t("detail.thinking")}</td>
                    <td data-testid="thinking-tokens">{tNumber(breakdown.thinkingTokens)}</td>
                    <td data-testid="thinking-share">
                      {t("detail.thinkingOfOutput", {
                        share: tPercent(breakdown.thinkingShareOfOutput),
                      })}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      {showServerToolSummary && (
        <section class="session-detail__server-tools" data-testid="server-tool-summary">
          {webSearchRequests > 0 && (
            <span data-testid="server-tool-web-search">
              {tPlural("detail.webSearch", webSearchRequests)}
            </span>
          )}
          {webFetchRequests > 0 && (
            <span data-testid="server-tool-web-fetch">
              {tPlural("detail.webFetch", webFetchRequests)}
            </span>
          )}
          {subagentsSpawned > 0 && (
            <span data-testid="server-tool-subagents">
              {tPlural("detail.subagents", subagentsSpawned)}
            </span>
          )}
        </section>
      )}

      <section class="session-detail__tools" data-testid="tool-usage">
        <h4 id={toolsHeadingId}>{t("detail.tools.heading")}</h4>
        {session.toolUses.length === 0 ? (
          <p data-testid="tool-usage-empty">{t("detail.tools.empty")}</p>
        ) : (
          <>
            <p data-testid="tool-usage-note">{t("detail.tools.note")}</p>
            <ul class="tool-chips" data-testid="tool-chip-list" aria-labelledby={toolsHeadingId}>
              {session.toolUses.map((tool) => (
                <li class="tool-chip" key={tool.name} data-testid="tool-chip" data-tool={tool.name}>
                  <span class="tool-chip__name">{tool.name}</span>
                  <span class="tool-chip__calls">{tNumber(tool.calls)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section class="session-detail__models" data-testid="session-model-breakdown">
        <table class="model-panel__table">
          <thead>
            <tr>
              <th scope="col">{t("models.columnModel")}</th>
              <th scope="col">{t("models.columnCost")}</th>
              <th scope="col">{t("models.columnShare")}</th>
            </tr>
          </thead>
          <tbody>
            {session.models.models.map((model) => {
              const share = costShare(model.costMicroUsd, session.models.costMicroUsd);
              return (
                <tr key={model.model} data-testid="session-model-row" data-model={model.model}>
                  <td>{model.model}</td>
                  <td>{tCurrency(model.costMicroUsd / 1e6)}</td>
                  <td>{tPercent(share)}</td>
                </tr>
              );
            })}
            {unattributed > 0 && (
              <tr data-testid="session-model-unattributed-row">
                <td>{t("models.unattributed")}</td>
                <td>{tCurrency(unattributed / 1e6)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section class="session-detail__requests">
        <h4>{t("detail.requestsHeading")}</h4>
        <table class="request-table">
          <thead>
            <tr>
              <th scope="col">{t("detail.columnTimestamp")}</th>
              <th scope="col">{t("session.columnCost")}</th>
              <th scope="col">{t("detail.columnTurns")}</th>
              <th scope="col">{t("session.columnDuration")}</th>
              <th scope="col">{t("detail.columnStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {session.requests.map((request, index) => {
              const epochMs = parseTimestamp(request.timestamp);
              return (
                <tr
                  key={requestKey(request, index)}
                  data-testid="request-row"
                  data-error={request.isError ? "true" : undefined}
                >
                  <td>{epochMs === null ? t("detail.noTimestamp") : tDateTime(epochMs)}</td>
                  <td>{tCurrency(request.costMicroUsd / 1e6)}</td>
                  <td>{tNumber(request.numTurns)}</td>
                  <td>{tDuration(request.durationMs)}</td>
                  <td>
                    {request.isError && (
                      <span data-testid="request-error-badge">{t("detail.requestError")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {session.openRequests > 0 && (
        <p data-testid="open-request-note">
          {tPlural("detail.openRequests", session.openRequests)}
        </p>
      )}
    </div>
  );
}
