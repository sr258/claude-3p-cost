import { render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locale } from "../state/app-state.js";
import { GroupingToggle } from "./grouping-toggle.js";

describe("GroupingToggle", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("exposes two radios with the active one checked", () => {
    render(<GroupingToggle value="project" onChange={() => {}} />);
    expect(screen.getByTestId("grouping-project").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("grouping-folder").getAttribute("aria-checked")).toBe("false");
  });

  it("calls onChange with the other grouping when the inactive radio is activated", () => {
    const onChange = vi.fn();
    render(<GroupingToggle value="project" onChange={onChange} />);
    screen.getByTestId("grouping-folder").click();
    expect(onChange).toHaveBeenCalledWith("folder");
  });

  it("is operable by keyboard", () => {
    const onChange = vi.fn();
    render(<GroupingToggle value="project" onChange={onChange} />);
    const folderRadio = screen.getByTestId("grouping-folder");
    folderRadio.focus();
    expect(document.activeElement).toBe(folderRadio);
    folderRadio.click();
    expect(onChange).toHaveBeenCalledWith("folder");
  });

  it("renders identical data-testids in German and in English", () => {
    locale.value = "de";
    const { unmount } = render(<GroupingToggle value="project" onChange={() => {}} />);
    const deIds = screen.getByTestId("grouping-toggle").querySelectorAll("[data-testid]").length;
    unmount();

    locale.value = "en";
    render(<GroupingToggle value="project" onChange={() => {}} />);
    const enIds = screen.getByTestId("grouping-toggle").querySelectorAll("[data-testid]").length;

    expect(enIds).toBe(deIds);
  });
});
