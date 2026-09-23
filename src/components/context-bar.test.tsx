import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ContextBar } from "./context-bar.js";
import type { DateRangeFilterProps } from "./date-range-filter.js";

const RANGE: DateRangeFilterProps = {
  preset: "all",
  fromDay: null,
  toDay: null,
  invalid: false,
  onPreset: () => {},
  onCustomDays: () => {},
};

describe("ContextBar", () => {
  it("renders the grouping toggle, the range filter and the scope select", () => {
    render(
      <ContextBar
        grouping="project"
        onGrouping={() => {}}
        range={RANGE}
        scopeOptions={[{ key: "p1", label: "Nebula" }]}
        selectedScopeKey={null}
        onScope={() => {}}
      />,
    );
    expect(screen.getByTestId("context-bar")).toBeTruthy();
    expect(screen.getByTestId("grouping-toggle")).toBeTruthy();
    expect(screen.getByTestId("range-filter")).toBeTruthy();
    expect(screen.getByTestId("context-scope-select")).toBeTruthy();
  });

  it("omits the scope select when there are no groups", () => {
    render(
      <ContextBar
        grouping="project"
        onGrouping={() => {}}
        range={RANGE}
        scopeOptions={[]}
        selectedScopeKey={null}
        onScope={() => {}}
      />,
    );
    expect(screen.queryByTestId("context-scope-select")).toBeNull();
  });
});
