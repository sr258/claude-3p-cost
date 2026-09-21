import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { formatCurrency } from "../i18n/format.js";
import { locale } from "../state/app-state.js";
import type { ScanGaps } from "../model/project-types.js";
import { GapIndicators } from "./gap-indicators.js";

function gaps(partial: Partial<ScanGaps> = {}): ScanGaps {
  return {
    openRequests: 0,
    sessionsWithoutManifest: 0,
    costMicroUsdWithoutManifest: 0,
    archivedSessions: 0,
    ...partial,
  };
}

describe("GapIndicators", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders the open-request count together with its explanation", () => {
    render(
      <GapIndicators gaps={gaps({ openRequests: 14 })} rangeActive={false} undatedExcluded={0} />,
    );
    const chip = screen.getByTestId("gap-open-requests");
    expect(chip.textContent).toContain("14");
    expect(chip.textContent?.length).toBeGreaterThan(2);
  });

  it("renders the sessions-without-manifest count together with their cost", () => {
    render(
      <GapIndicators
        gaps={gaps({ sessionsWithoutManifest: 2, costMicroUsdWithoutManifest: 18_400_000 })}
        rangeActive={false}
        undatedExcluded={0}
      />,
    );
    const chip = screen.getByTestId("gap-sessions-without-manifest");
    expect(chip.textContent).toContain("2");
    expect(chip.textContent).toContain(formatCurrency("en", 18.4));
  });

  it("renders the archived-session count", () => {
    render(
      <GapIndicators
        gaps={gaps({ archivedSessions: 3 })}
        rangeActive={false}
        undatedExcluded={0}
      />,
    );
    expect(screen.getByTestId("gap-archived-sessions").textContent).toContain("3");
  });

  it("omits an indicator whose count is zero", () => {
    render(
      <GapIndicators gaps={gaps({ openRequests: 5 })} rangeActive={false} undatedExcluded={0} />,
    );
    expect(screen.queryByTestId("gap-sessions-without-manifest")).toBeNull();
    expect(screen.queryByTestId("gap-archived-sessions")).toBeNull();
    expect(screen.queryByTestId("gap-none")).toBeNull();
  });

  it("renders the no-gaps state when every count is zero", () => {
    render(<GapIndicators gaps={gaps()} rangeActive={false} undatedExcluded={0} />);
    expect(screen.getByTestId("gap-none")).toBeTruthy();
    expect(screen.queryByTestId("gap-open-requests")).toBeNull();
  });

  it("formats the missing-manifest cost through the currency formatter", () => {
    locale.value = "de";
    render(
      <GapIndicators
        gaps={gaps({ sessionsWithoutManifest: 1, costMicroUsdWithoutManifest: 1_413_580_000 })}
        rangeActive={false}
        undatedExcluded={0}
      />,
    );
    expect(screen.getByTestId("gap-sessions-without-manifest").textContent).toContain(
      formatCurrency("de", 1413.58),
    );
  });

  it("renders the undated-excluded line only while a range is active (Q9)", () => {
    const { unmount } = render(
      <GapIndicators gaps={gaps()} rangeActive={true} undatedExcluded={4} />,
    );
    expect(screen.getByTestId("gap-undated-excluded").textContent).toContain("4");
    unmount();

    render(<GapIndicators gaps={gaps()} rangeActive={false} undatedExcluded={4} />);
    expect(screen.queryByTestId("gap-undated-excluded")).toBeNull();
  });

  it("labels an open-request count as unfiltered only while a range is active (Q10)", () => {
    const { unmount } = render(
      <GapIndicators gaps={gaps({ openRequests: 2 })} rangeActive={true} undatedExcluded={0} />,
    );
    expect(screen.getByTestId("gap-open-requests-unfiltered")).toBeTruthy();
    unmount();

    render(
      <GapIndicators gaps={gaps({ openRequests: 2 })} rangeActive={false} undatedExcluded={0} />,
    );
    expect(screen.queryByTestId("gap-open-requests-unfiltered")).toBeNull();
  });
});
