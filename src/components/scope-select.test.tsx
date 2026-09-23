import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { translate } from "../i18n/translate.js";
import { ScopeSelect, type ScopeOption } from "./scope-select.js";

const OPTIONS: readonly ScopeOption[] = [
  { key: "p1", label: "Nebula Launch" },
  { key: "p2", label: "Aurora" },
];

describe("ScopeSelect", () => {
  it("lists an all-scope option followed by one option per group, in the order given", () => {
    render(
      <ScopeSelect options={OPTIONS} selectedKey={null} onChange={() => {}} grouping="project" />,
    );
    const select = screen.getByTestId("context-scope-select").querySelector("select")!;
    const optionLabels = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(optionLabels).toEqual([translate("en", "scope.allProjects"), "Nebula Launch", "Aurora"]);
  });

  it("selects the option matching the current scope key", () => {
    render(
      <ScopeSelect options={OPTIONS} selectedKey="p2" onChange={() => {}} grouping="project" />,
    );
    const select = screen
      .getByTestId("context-scope-select")
      .querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("p2");
  });

  it("calls onChange with null when the all-scope option is chosen", () => {
    const onChange = vi.fn();
    render(
      <ScopeSelect options={OPTIONS} selectedKey="p1" onChange={onChange} grouping="project" />,
    );
    const select = screen
      .getByTestId("context-scope-select")
      .querySelector("select") as HTMLSelectElement;
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with the group key when a group is chosen", () => {
    const onChange = vi.fn();
    render(
      <ScopeSelect options={OPTIONS} selectedKey={null} onChange={onChange} grouping="project" />,
    );
    const select = screen
      .getByTestId("context-scope-select")
      .querySelector("select") as HTMLSelectElement;
    select.value = "p2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("p2");
  });

  it("falls back to the all-scope option when the selected key is not among the options", () => {
    render(
      <ScopeSelect
        options={OPTIONS}
        selectedKey="vanished"
        onChange={() => {}}
        grouping="project"
      />,
    );
    const select = screen
      .getByTestId("context-scope-select")
      .querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("labels the all-scope option by grouping", () => {
    const { unmount } = render(
      <ScopeSelect options={OPTIONS} selectedKey={null} onChange={() => {}} grouping="project" />,
    );
    const projectLabel = screen
      .getByTestId("context-scope-select")
      .querySelector("select")!
      .querySelector("option")!.textContent;
    unmount();

    render(
      <ScopeSelect options={OPTIONS} selectedKey={null} onChange={() => {}} grouping="folder" />,
    );
    const folderLabel = screen
      .getByTestId("context-scope-select")
      .querySelector("select")!
      .querySelector("option")!.textContent;

    expect(projectLabel).toBe(translate("en", "scope.allProjects"));
    expect(folderLabel).toBe(translate("en", "scope.allFolders"));
    expect(projectLabel).not.toBe(folderLabel);
  });
});
