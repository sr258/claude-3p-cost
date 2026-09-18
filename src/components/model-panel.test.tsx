import { render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "../i18n/format.js";
import { locale } from "../state/app-state.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import type { CostTotals, ModelBreakdown, ModelTotal } from "../model/report-types.js";
import { ModelPanel } from "./model-panel.js";

function model(overrides: Partial<ModelTotal> & Pick<ModelTotal, "model">): ModelTotal {
  return {
    costMicroUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    requests: 0,
    ...overrides,
  };
}

function breakdown(models: readonly ModelTotal[]): ModelBreakdown {
  return {
    models,
    costMicroUsd: models.reduce((sum, m) => sum + m.costMicroUsd, 0),
  };
}

function totalsOf(costMicroUsd: number): CostTotals {
  return { ...EMPTY_TOTALS, costMicroUsd };
}

describe("ModelPanel", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders one row per model in the order given and never re-sorts", () => {
    const bd = breakdown([
      model({ model: "claude-opus-5", costMicroUsd: 600_000_000 }),
      model({ model: "claude-sonnet-5", costMicroUsd: 100_000_000 }),
    ]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(bd.costMicroUsd)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("model-row");
    expect(rows.map((r) => r.getAttribute("data-model"))).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
  });

  it("keeps model variants distinct: the [1m] suffix is a separate row", () => {
    const bd = breakdown([
      model({ model: "claude-opus-5", costMicroUsd: 600_000_000 }),
      model({ model: "claude-opus-5[1m]", costMicroUsd: 300_000_000 }),
    ]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(bd.costMicroUsd)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("model-row");
    expect(rows.map((r) => r.getAttribute("data-model"))).toEqual([
      "claude-opus-5",
      "claude-opus-5[1m]",
    ]);
  });

  it("shares are computed against the model-usage sum and add up to 100 percent", () => {
    const bd = breakdown([
      model({ model: "a", costMicroUsd: 300 }),
      model({ model: "b", costMicroUsd: 700 }),
    ]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(bd.costMicroUsd)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    const shares = screen
      .getAllByTestId("model-share-bar")
      .map((el) => Number(el.getAttribute("data-share")));
    expect(shares.reduce((sum, s) => sum + s, 0)).toBeCloseTo(1, 10);
  });

  it("renders a share bar whose data-share matches the rendered share", () => {
    const bd = breakdown([
      model({ model: "a", costMicroUsd: 784 }),
      model({ model: "b", costMicroUsd: 216 }),
    ]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(bd.costMicroUsd)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    const bar = screen.getAllByTestId("model-share-bar")[0]!;
    expect(bar.getAttribute("data-share")).toBe("0.7840");
  });

  it("hides the share bar from assistive technology while the share stays as text", () => {
    const bd = breakdown([model({ model: "a", costMicroUsd: 1 })]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(bd.costMicroUsd)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    const bar = screen.getByTestId("model-share-bar");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    const cell = screen.getByTestId("cell-model-share");
    expect(cell.textContent).not.toBe("");
  });

  it("renders an unattributed row with no share", () => {
    const bd = breakdown([model({ model: "a", costMicroUsd: 100 })]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(140)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    const row = screen.getByTestId("model-unattributed-row");
    expect(within(row).getByTestId("cell-model-cost")).toBeTruthy();
    expect(within(row).queryByTestId("model-share-bar")).toBeNull();
  });

  it("renders no unattributed row when the two totals agree", () => {
    const bd = breakdown([model({ model: "a", costMicroUsd: 100 })]);
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(100)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("model-unattributed-row")).toBeNull();
  });

  it("renders the empty state when the breakdown has no models", () => {
    render(
      <ModelPanel
        breakdown={EMPTY_MODEL_BREAKDOWN}
        totals={EMPTY_TOTALS}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("model-empty")).toBeTruthy();
  });

  it("renders the scope label and a reset control for a group scope", () => {
    const onResetScope = vi.fn();
    render(
      <ModelPanel
        breakdown={EMPTY_MODEL_BREAKDOWN}
        totals={EMPTY_TOTALS}
        scope={{ kind: "group", label: "Nebula Launch" }}
        onResetScope={onResetScope}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("model-scope-label").textContent).toContain("Nebula Launch");
    screen.getByTestId("scope-reset").click();
    expect(onResetScope).toHaveBeenCalled();
  });

  it("renders no reset control for the global scope", () => {
    render(
      <ModelPanel
        breakdown={EMPTY_MODEL_BREAKDOWN}
        totals={EMPTY_TOTALS}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("scope-reset")).toBeNull();
  });

  it("divides micro-USD by 1e6 exactly once, at the cell", () => {
    const bd = breakdown([model({ model: "a", costMicroUsd: 1_413_580_000 })]);
    locale.value = "en";
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(bd.costMicroUsd)}
        scope={{ kind: "all" }}
        onResetScope={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("cell-model-cost").textContent).toBe(formatCurrency("en", 1413.58));
  });

  it("renders identical data-testids in German and in English", () => {
    const bd = breakdown([model({ model: "a", costMicroUsd: 100 })]);
    locale.value = "de";
    const { unmount } = render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(140)}
        scope={{ kind: "group", label: "X" }}
        onResetScope={() => {}}
        onClose={() => {}}
      />,
    );
    const deIds = screen.getByTestId("model-panel").querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(
      <ModelPanel
        breakdown={bd}
        totals={totalsOf(140)}
        scope={{ kind: "group", label: "X" }}
        onResetScope={() => {}}
        onClose={() => {}}
      />,
    );
    const enIds = screen.getByTestId("model-panel").querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });
});
