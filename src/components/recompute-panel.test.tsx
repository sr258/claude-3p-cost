import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { locale } from "../state/app-state.js";
import { RecomputePanel } from "./recompute-panel.js";
import { recomputeSession } from "../model/recompute.js";
import type { PriceTable, ModelPrice } from "../model/prices.js";
import type { ModelTotal, SessionRow } from "../model/report-types.js";
import type { RequestRecord } from "../model/audit-types.js";

function price(fields: Partial<ModelPrice> = {}): ModelPrice {
  return {
    input: 5_000_000,
    output: 25_000_000,
    cacheWrite5m: 6_250_000,
    cacheWrite1h: 10_000_000,
    cacheRead: 500_000,
    webSearch: 10_000,
    ...fields,
  };
}

function modelTotal(overrides: Partial<ModelTotal> = {}): ModelTotal {
  return {
    model: "claude-opus-5",
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    requests: 1,
    ...overrides,
  };
}

function sessionRow(models: readonly ModelTotal[]): SessionRow {
  const breakdown = { models, costMicroUsd: models.reduce((s, m) => s + m.costMicroUsd, 0) };
  return {
    sessionId: "s1",
    sourceId: "s1",
    title: "",
    hasManifest: false,
    isArchived: false,
    isStarred: false,
    project: { kind: "none" },
    folder: { kind: "none" },
    model: null,
    openRequests: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    lastActivityAt: null,
    totals: {
      costMicroUsd: breakdown.costMicroUsd,
      requests: 1,
      errorRequests: 0,
      numTurns: 1,
      durationMs: 0,
      durationApiMs: 0,
      subagentsSpawned: 0,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheCreationInputTokens: 0,
        cacheCreation1hInputTokens: 0,
        cacheCreation5mInputTokens: 0,
        cacheReadInputTokens: 0,
        webSearchRequests: 0,
        webFetchRequests: 0,
      },
    },
    models: breakdown,
    requests: [] as readonly RequestRecord[],
    toolUses: [],
    excludedRequests: 0,
    isPartial: false,
  };
}

const TABLE: PriceTable = new Map([["claude-opus-5", price()]]);

describe("RecomputePanel", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders one row per model and category with units, price and amount", () => {
    const session = sessionRow([
      modelTotal({ inputTokens: 1_000_000, outputTokens: 100_000, costMicroUsd: 7_500_000 }),
    ]);
    const recomputation = recomputeSession(session, TABLE);
    render(<RecomputePanel recomputation={recomputation} unattributedCostMicroUsd={0} />);

    const rows = screen.getAllByTestId("recompute-line");
    expect(rows.map((r) => r.getAttribute("data-category"))).toEqual([
      "input",
      "output",
      "cacheWrite",
      "cacheRead",
      "webSearch",
    ]);
  });

  it("labels the web-search row with its own per-request unit", () => {
    const session = sessionRow([modelTotal({ webSearchRequests: 12, costMicroUsd: 120_000 })]);
    const recomputation = recomputeSession(session, TABLE);
    render(<RecomputePanel recomputation={recomputation} unattributedCostMicroUsd={0} />);

    const webSearchRow = screen
      .getAllByTestId("recompute-line")
      .find((r) => r.getAttribute("data-category") === "webSearch")!;
    expect(
      webSearchRow.querySelector('[data-testid="recompute-line-units"]')!.textContent,
    ).toContain("12");
    expect(
      webSearchRow.querySelector('[data-testid="recompute-line-price"]')!.textContent,
    ).toContain("/req");
  });

  it("renders the deviation with an explicit sign in both directions", () => {
    const cheaper = sessionRow([modelTotal({ inputTokens: 1_000_000, costMicroUsd: 6_000_000 })]);
    const pricier = sessionRow([modelTotal({ inputTokens: 1_000_000, costMicroUsd: 4_000_000 })]);

    const { unmount } = render(
      <RecomputePanel
        recomputation={recomputeSession(cheaper, TABLE)}
        unattributedCostMicroUsd={0}
      />,
    );
    // own (5_000_000) < list (6_000_000) -> negative deviation.
    expect(screen.getByTestId("recompute-session-deviation").textContent).toContain("-");
    unmount();

    render(
      <RecomputePanel
        recomputation={recomputeSession(pricier, TABLE)}
        unattributedCostMicroUsd={0}
      />,
    );
    // own (5_000_000) > list (4_000_000) -> positive deviation.
    expect(screen.getByTestId("recompute-session-deviation").textContent).toContain("+");
  });

  it("renders no percentage and a reason when the list base is zero", () => {
    const session = sessionRow([modelTotal({ inputTokens: 1_000_000, costMicroUsd: 0 })]);
    const recomputation = recomputeSession(session, TABLE);
    render(<RecomputePanel recomputation={recomputation} unattributedCostMicroUsd={0} />);
    expect(screen.getByTestId("recompute-session-deviation").textContent).not.toMatch(/%/);
  });

  it("renders the 5-minute bracket line, or a reason for its absence", () => {
    const session = sessionRow([
      modelTotal({ cacheCreationInputTokens: 1_000, costMicroUsd: 10_000 }),
    ]);
    const { unmount } = render(
      <RecomputePanel
        recomputation={recomputeSession(session, TABLE)}
        unattributedCostMicroUsd={0}
      />,
    );
    expect(screen.getByTestId("recompute-session-bracket")).toBeTruthy();
    unmount();

    const noBracketTable: PriceTable = new Map([["claude-opus-5", price({ cacheWrite5m: null })]]);
    render(
      <RecomputePanel
        recomputation={recomputeSession(session, noBracketTable)}
        unattributedCostMicroUsd={0}
      />,
    );
    expect(screen.getByTestId("recompute-session-bracket-unavailable").textContent).toContain(
      "claude-opus-5",
    );
  });

  it("states the modelUsage-versus-usage difference and the unattributed remainder when non-zero", () => {
    const session = sessionRow([modelTotal({ inputTokens: 100, costMicroUsd: 1 })]);
    render(
      <RecomputePanel
        recomputation={recomputeSession(session, TABLE)}
        unattributedCostMicroUsd={42}
      />,
    );
    expect(screen.getByTestId("recompute-method-note")).toBeTruthy();
    expect(screen.getByTestId("recompute-unattributed")).toBeTruthy();
  });

  it("renders a not-configured message when recomputation is null", () => {
    render(<RecomputePanel recomputation={null} unattributedCostMicroUsd={0} />);
    expect(screen.getByTestId("recompute-not-configured")).toBeTruthy();
  });

  it("renders a not-computable message for an excluded session", () => {
    const session = sessionRow([
      modelTotal({ model: "unknown-model", inputTokens: 10, costMicroUsd: 1 }),
    ]);
    const recomputation = recomputeSession(session, new Map());
    render(<RecomputePanel recomputation={recomputation} unattributedCostMicroUsd={0} />);
    expect(screen.getByTestId("recompute-not-computable").textContent).toContain("unknown-model");
  });
});
