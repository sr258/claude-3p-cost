import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { locale } from "../state/app-state.js";
import { formatCurrency, formatNumber } from "../i18n/format.js";
import { translate } from "../i18n/translate.js";
import { HeadlineTotal, type HeadlineTotalProps } from "./headline-total.js";

function defaultProps(overrides: Partial<HeadlineTotalProps> = {}): HeadlineTotalProps {
  return {
    costMicroUsd: 1_413_590_000,
    sessionCount: 150,
    grouping: "project",
    scopeLabel: null,
    periodLabel: null,
    ownCostMicroUsd: null,
    ownExcludedSessions: 0,
    ...overrides,
  };
}

describe("HeadlineTotal", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders the scoped cost through tCurrency", () => {
    render(<HeadlineTotal {...defaultProps({ costMicroUsd: 1_413_590_000 })} />);
    expect(screen.getByTestId("headline-cost").textContent).toContain(
      formatCurrency("en", 1413.59),
    );
  });

  it("renders the session count through tNumber, not String", () => {
    locale.value = "de";
    render(<HeadlineTotal {...defaultProps({ sessionCount: 1234 })} />);
    const text = screen.getByTestId("headline-sessions").textContent!;
    expect(text).toContain(formatNumber("de", 1234));
    expect(text).not.toContain(String(1234));
  });

  it("labels the global scope by grouping", () => {
    const { unmount } = render(
      <HeadlineTotal {...defaultProps({ grouping: "project", scopeLabel: null })} />,
    );
    expect(screen.getByTestId("headline-meta").textContent).toContain(
      translate("en", "scope.allProjects"),
    );
    unmount();

    render(<HeadlineTotal {...defaultProps({ grouping: "folder", scopeLabel: null })} />);
    expect(screen.getByTestId("headline-meta").textContent).toContain(
      translate("en", "scope.allFolders"),
    );
  });

  it("names the selected scope when one is given", () => {
    render(<HeadlineTotal {...defaultProps({ scopeLabel: "Nebula Launch" })} />);
    const text = screen.getByTestId("headline-meta").textContent!;
    expect(text).toContain("Nebula Launch");
    expect(text).not.toContain(translate("en", "scope.allProjects"));
  });

  it("omits the period slot and its separator when periodLabel is null", () => {
    render(<HeadlineTotal {...defaultProps({ periodLabel: null })} />);
    const meta = screen.getByTestId("headline-meta");
    // Only the scope and session-count spans render — no empty period slot
    // left behind for the CSS separator (`.headline-total__meta
    // span:not(:last-child)::after`, built the way `.status-bar` builds it)
    // to dangle off.
    expect(meta.querySelectorAll("span").length).toBe(2);
  });

  it("includes the period text and slot when periodLabel is given", () => {
    render(<HeadlineTotal {...defaultProps({ periodLabel: "24.08.–23.09.2026" })} />);
    const meta = screen.getByTestId("headline-meta");
    expect(meta.textContent).toContain("24.08.–23.09.2026");
    expect(meta.querySelectorAll("span").length).toBe(3);
  });

  it("shows no own-cost line when ownCostMicroUsd is null", () => {
    render(<HeadlineTotal {...defaultProps({ ownCostMicroUsd: null })} />);
    expect(screen.queryByTestId("headline-own-cost")).toBeNull();
  });

  it("marks the own-cost line when sessions were excluded", () => {
    render(
      <HeadlineTotal
        {...defaultProps({
          ownCostMicroUsd: 1_290_440_000,
          ownExcludedSessions: 3,
          sessionCount: 150,
        })}
      />,
    );
    expect(screen.getByTestId("headline-own-cost").textContent).toContain(
      formatCurrency("en", 1290.44),
    );
    const mark = screen.getByTestId("headline-own-excluded");
    expect(mark.textContent).toContain(
      translate("en", "recompute.excluded.other", {
        count: formatNumber("en", 3),
        total: formatNumber("en", 150),
      }),
    );
  });

  it("shows no exclusion marker when nothing was excluded", () => {
    render(<HeadlineTotal {...defaultProps({ ownCostMicroUsd: 1_290_440_000 })} />);
    expect(screen.getByTestId("headline-own-cost")).toBeTruthy();
    expect(screen.queryByTestId("headline-own-excluded")).toBeNull();
  });

  it("renders the same set of data-testids in both locales", () => {
    const props = defaultProps({ ownCostMicroUsd: 1_290_440_000, ownExcludedSessions: 3 });
    locale.value = "de";
    const { unmount } = render(<HeadlineTotal {...props} />);
    const deIds = screen.getByTestId("headline-total").querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(<HeadlineTotal {...props} />);
    const enIds = screen.getByTestId("headline-total").querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });
});
