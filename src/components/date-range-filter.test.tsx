import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/index.js";
import { locale } from "../state/app-state.js";
import { DateRangeFilter, type DateRangeFilterProps } from "./date-range-filter.js";

function defaultProps(overrides: Partial<DateRangeFilterProps> = {}): DateRangeFilterProps {
  return {
    preset: "all",
    fromDay: null,
    toDay: null,
    invalid: false,
    onPreset: () => {},
    onCustomDays: () => {},
    ...overrides,
  };
}

describe("DateRangeFilter", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders one radio per preset and marks the active one with aria-checked", () => {
    render(<DateRangeFilter {...defaultProps({ preset: "lastMonth" })} />);
    const radios = screen.getAllByTestId("range-preset");
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.getAttribute("data-preset"))).toEqual([
      "all",
      "thisMonth",
      "lastMonth",
      "thisQuarter",
      "custom",
    ]);
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]!.getAttribute("data-preset")).toBe("lastMonth");
  });

  it("choosing a preset emits its id", () => {
    const onPreset = vi.fn();
    render(<DateRangeFilter {...defaultProps({ onPreset })} />);
    const radios = screen.getAllByTestId("range-preset");
    const thisMonth = radios.find((r) => r.getAttribute("data-preset") === "thisMonth")!;
    thisMonth.click();
    expect(onPreset).toHaveBeenCalledWith("thisMonth");
  });

  it("the from and to inputs are disabled unless the custom preset is active", () => {
    const { unmount } = render(<DateRangeFilter {...defaultProps({ preset: "all" })} />);
    expect(screen.getByTestId("range-from").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("range-to").hasAttribute("disabled")).toBe(true);
    unmount();

    render(<DateRangeFilter {...defaultProps({ preset: "custom" })} />);
    expect(screen.getByTestId("range-from").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("range-to").hasAttribute("disabled")).toBe(false);
  });

  it("an invalid from/to pair renders the validation message and emits nothing", () => {
    const onCustomDays = vi.fn();
    render(
      <DateRangeFilter {...defaultProps({ preset: "custom", invalid: true, onCustomDays })} />,
    );
    expect(screen.getByTestId("range-invalid").textContent).toBe(t("range.invalid"));
    expect(onCustomDays).not.toHaveBeenCalled();
  });

  it("a date change emits on change, not on input", () => {
    const onCustomDays = vi.fn();
    render(
      <DateRangeFilter
        {...defaultProps({ preset: "custom", fromDay: null, toDay: "2026-03-31", onCustomDays })}
      />,
    );
    const fromInput = screen.getByTestId("range-from");

    fireEvent.input(fromInput, { target: { value: "2026-03-01" } });
    expect(onCustomDays).not.toHaveBeenCalled();

    fireEvent.change(fromInput, { target: { value: "2026-03-01" } });
    expect(onCustomDays).toHaveBeenCalledWith("2026-03-01", "2026-03-31");
  });
});
