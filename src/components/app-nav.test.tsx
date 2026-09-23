import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { translate } from "../i18n/translate.js";
import { AppNav } from "./app-nav.js";

describe("AppNav", () => {
  it("renders one nav item per page, in the declared order", () => {
    render(<AppNav page="overview" onNavigate={() => {}} />);
    const nav = screen.getByTestId("app-nav");
    const buttons = nav.querySelectorAll("button");
    expect([...buttons].map((b) => b.getAttribute("data-testid"))).toEqual([
      "nav-overview",
      "nav-models",
      "nav-trend",
      "nav-prices",
    ]);
  });

  it("marks only the active page with aria-current", () => {
    render(<AppNav page="trend" onNavigate={() => {}} />);
    expect(screen.getByTestId("nav-trend").getAttribute("aria-current")).toBe("page");
    // Preact drops a non-data-*/aria-* attribute entirely when falsy — the
    // attribute must be ABSENT, never the string "false" (LEARNINGS).
    expect(screen.getByTestId("nav-overview").hasAttribute("aria-current")).toBe(false);
    expect(screen.getByTestId("nav-models").hasAttribute("aria-current")).toBe(false);
    expect(screen.getByTestId("nav-prices").hasAttribute("aria-current")).toBe(false);
  });

  it("calls onNavigate with the clicked page key", () => {
    const onNavigate = vi.fn();
    render(<AppNav page="overview" onNavigate={onNavigate} />);
    screen.getByTestId("nav-models").click();
    expect(onNavigate).toHaveBeenCalledWith("models");
  });

  it("labels each item from the catalogue", () => {
    render(<AppNav page="overview" onNavigate={() => {}} />);
    expect(screen.getByTestId("nav-overview").textContent).toBe(translate("en", "nav.overview"));
    expect(screen.getByTestId("nav-models").textContent).toBe(translate("en", "nav.models"));
    expect(screen.getByTestId("nav-trend").textContent).toBe(translate("en", "nav.trend"));
    expect(screen.getByTestId("nav-prices").textContent).toBe(translate("en", "nav.prices"));
  });
});
