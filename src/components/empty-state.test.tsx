/**
 * `EmptyState` reads `src/state/app-state.ts` signals directly (S7's
 * component-test convention, plan §7.3): tests set those signals, render,
 * and query by accessible role or `data-testid` — never by translated
 * text, so the "renders in both locales" case is what actually enforces
 * the rule.
 */
import { render, screen, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as appState from "../state/app-state.js";
import { EmptyState } from "./empty-state.js";

function resetSignals(): void {
  appState.discovery.value = null;
  appState.report.value = null;
  appState.manualRoots.value = [];
  appState.pickMessage.value = "none";
  appState.scanState.value = "idle";
}

describe("EmptyState", () => {
  beforeEach(() => {
    resetSignals();
  });

  afterEach(() => {
    resetSignals();
    vi.restoreAllMocks();
  });

  it("names every searched location using the unexpanded label", () => {
    appState.discovery.value = {
      roots: [],
      searched: [
        { path: "/invented/local/Claude-3p/local-agent-mode-sessions", label: "a", origin: "auto" },
        { path: "/invented/app/Claude/claude-code-sessions", label: "b", origin: "auto" },
      ],
      profiles: [],
      sessions: [],
      accountCount: 0,
      profileCount: 0,
      problems: [],
    };

    render(<EmptyState />);

    expect(screen.getByRole("list")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["a", "b"]);
  });

  it("puts the expanded path only in the title attribute", () => {
    appState.discovery.value = {
      roots: [],
      searched: [
        { path: "/invented/local/Claude-3p/local-agent-mode-sessions", label: "a", origin: "auto" },
      ],
      profiles: [],
      sessions: [],
      accountCount: 0,
      profileCount: 0,
      problems: [],
    };

    render(<EmptyState />);

    const item = screen.getAllByRole("listitem")[0]!;
    expect(item.getAttribute("title")).toBe("/invented/local/Claude-3p/local-agent-mode-sessions");
    expect(item.textContent).not.toContain("/invented");
  });

  it("renders the chosen-folder list with basenames and a remove control", () => {
    appState.manualRoots.value = ["/invented/backup/sessions-archive"];
    const removeSpy = vi.spyOn(appState, "removeManualRoot").mockImplementation(() => {});

    render(<EmptyState />);

    const button = screen.getByRole("button", { name: /sessions-archive/ });
    const item = button.closest("li")!;
    expect(within(item).getByText("sessions-archive")).toBeTruthy();
    expect(item.textContent).not.toContain("/invented");

    button.click();
    expect(removeSpy).toHaveBeenCalledWith("/invented/backup/sessions-archive");
  });

  it("swaps the headline when a chosen folder contains no session data", () => {
    const { unmount } = render(<EmptyState />);
    const normalHeadline = screen.getByTestId("empty-state-title").textContent;
    unmount();

    appState.pickMessage.value = "no-session-data";
    render(<EmptyState />);
    const swappedHeadline = screen.getByTestId("empty-state-title").textContent;

    expect(swappedHeadline).not.toBe(normalHeadline);
  });

  it("renders in both locales without a hardcoded string", () => {
    const originalLocale = appState.locale.value;
    appState.manualRoots.value = ["/invented/x"];
    try {
      appState.locale.value = "de";
      const { unmount } = render(<EmptyState />);
      expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
      expect(screen.getByRole("button", { name: /x/ })).toBeTruthy();
      unmount();

      appState.locale.value = "en";
      render(<EmptyState />);
      expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
      expect(screen.getByRole("button", { name: /x/ })).toBeTruthy();
    } finally {
      appState.locale.value = originalLocale;
    }
  });
});
