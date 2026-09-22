import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { formatCurrency, formatPercent } from "../i18n/format.js";
import { locale } from "../state/app-state.js";
import { RecomputeNote } from "./recompute-note.js";
import type { CostBasisSummary } from "../model/cost-basis.js";
import type { Recomputation } from "../model/recompute.js";

function recomputation(overrides: Partial<Recomputation> = {}): Recomputation {
  return {
    models: [],
    costMicroUsd: 900_000,
    listCostMicroUsd: 1_000_000,
    scopeListCostMicroUsd: 1_000_000,
    deviationMicroUsd: -100_000,
    deviationRatio: -0.1,
    excluded: { sessions: 0, models: [], listCostMicroUsd: 0 },
    bracket: null,
    bracketUnavailableModels: [],
    webSearchRequests: 0,
    isEmpty: false,
    ...overrides,
  };
}

function costBasis(overrides: Partial<CostBasisSummary> = {}): CostBasisSummary {
  return {
    providers: ["foundry"],
    costBases: ["list"],
    unstatedCostBasisEntries: 0,
    entries: 1,
    truncated: false,
    ...overrides,
  };
}

describe("RecomputeNote", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("names every distinct provider and costBasis found, never just the first", () => {
    render(
      <RecomputeNote
        recomputation={null}
        totalSessions={0}
        costBasis={costBasis({ providers: ["alpha", "beta"], costBases: ["list", "negotiated"] })}
      />,
    );
    const text = screen.getByTestId("recompute-cost-basis").textContent!;
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
    expect(text).toContain("list");
    expect(text).toContain("negotiated");
  });

  it("states the unstated-costBasis count", () => {
    render(
      <RecomputeNote
        recomputation={null}
        totalSessions={0}
        costBasis={costBasis({ unstatedCostBasisEntries: 5 })}
      />,
    );
    expect(screen.getByTestId("recompute-cost-basis-unstated").textContent).toContain("5");
  });

  it("names the models that cost the scope its bracket", () => {
    render(
      <RecomputeNote
        recomputation={recomputation({ bracketUnavailableModels: ["claude-fable-5[1m]"] })}
        totalSessions={1}
        costBasis={null}
      />,
    );
    expect(screen.getByTestId("recompute-bracket-unavailable").textContent).toContain(
      "claude-fable-5[1m]",
    );
  });

  it("reports the exclusion count and the affected models", () => {
    render(
      <RecomputeNote
        recomputation={recomputation({
          excluded: { sessions: 2, models: ["model-x"], listCostMicroUsd: 500_000 },
        })}
        totalSessions={27}
        costBasis={null}
      />,
    );
    const exclusion = screen.getByTestId("recompute-exclusion").textContent!;
    expect(exclusion).toContain("2");
    expect(exclusion).toContain("27");
    expect(screen.getByTestId("recompute-excluded-models").textContent).toContain("model-x");
  });

  it("renders the deviation with a signed percentage and amount derived from the formatters", () => {
    locale.value = "de";
    render(<RecomputeNote recomputation={recomputation()} totalSessions={1} costBasis={null} />);
    const expectedRatio = formatPercent("de", -0.1, { signDisplay: "exceptZero" });
    const expectedAmount = formatCurrency("de", -0.1, "USD", { signDisplay: "exceptZero" });
    const text = screen.getByTestId("recompute-deviation").textContent!;
    expect(text).toContain(expectedRatio);
    expect(text).toContain(expectedAmount);
  });

  it("renders no exclusion, deviation or bracket note when nothing is configured", () => {
    render(<RecomputeNote recomputation={null} totalSessions={0} costBasis={null} />);
    expect(screen.queryByTestId("recompute-exclusion")).toBeNull();
    expect(screen.queryByTestId("recompute-deviation")).toBeNull();
    expect(screen.queryByTestId("recompute-bracket")).toBeNull();
    expect(screen.queryByTestId("recompute-cost-basis")).toBeNull();
  });
});
