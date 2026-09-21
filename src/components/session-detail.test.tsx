import { render, screen, within } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { t, tCurrency, tNumber, tPercent } from "../i18n/index.js";
import type { RequestRecord } from "../model/audit-types.js";
import type { ModelBreakdown, SessionRow } from "../model/report-types.js";
import { EMPTY_MODEL_BREAKDOWN, EMPTY_TOTALS } from "../model/totals.js";
import { SessionDetail } from "./session-detail.js";

const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreation1hInputTokens: 0,
  cacheCreation5mInputTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
};

function makeRequest(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    costMicroUsd: 0,
    durationMs: 0,
    durationApiMs: 0,
    numTurns: 0,
    isError: false,
    usage: { ...EMPTY_USAGE },
    models: [],
    subagents: null,
    ...overrides,
  };
}

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    sessionId: "sess1",
    sourceId: "sess1",
    title: "",
    hasManifest: true,
    isArchived: false,
    isStarred: false,
    project: { kind: "none" },
    folder: { kind: "none" },
    model: null,
    openRequests: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    lastActivityAt: null,
    totals: EMPTY_TOTALS,
    models: EMPTY_MODEL_BREAKDOWN,
    requests: [],
    toolUses: [],
    excludedRequests: 0,
    isPartial: false,
    ...overrides,
  };
}

describe("SessionDetail", () => {
  it("renders one row per token category with counts and token shares", () => {
    const session = makeSessionRow({
      totals: {
        ...EMPTY_TOTALS,
        costMicroUsd: 500_000,
        tokens: {
          ...EMPTY_TOTALS.tokens,
          inputTokens: 100,
          outputTokens: 200,
          thinkingTokens: 40,
          cacheCreation1hInputTokens: 300,
          cacheCreation5mInputTokens: 0,
          cacheCreationInputTokens: 300,
          cacheReadInputTokens: 400,
        },
      },
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    const rows = screen.getAllByTestId("category-row");
    expect(rows.map((r) => r.getAttribute("data-category"))).toEqual([
      "input",
      "output",
      "cacheWrite1h",
      "cacheWrite5m",
      "cacheRead",
    ]);
    const inputRow = rows.find((r) => r.getAttribute("data-category") === "input")!;
    expect(within(inputRow).getByTestId("category-tokens").textContent).toBe(tNumber(100));
    const total = 100 + 200 + 300 + 0 + 400;
    expect(within(inputRow).getByTestId("category-share").textContent).toContain(
      tPercent(100 / total),
    );
  });

  it("labels the share column as a token share and shows the no-price-table note", () => {
    const session = makeSessionRow();
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.getByText(t("detail.columnTokenShare"))).toBeTruthy();
    expect(screen.getByTestId("token-share-note").textContent).toBe(t("detail.tokenShareNote"));
  });

  it("shows the measured session cost as the only currency figure in the category section", () => {
    const session = makeSessionRow({ totals: { ...EMPTY_TOTALS, costMicroUsd: 1_500_000 } });
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.getByTestId("detail-measured-cost").textContent).toBe(
      t("detail.measuredCost", { cost: tCurrency(1.5) }),
    );
  });

  it("renders thinking tokens as a sub-row of output, not a sixth category", () => {
    const session = makeSessionRow({
      totals: {
        ...EMPTY_TOTALS,
        tokens: { ...EMPTY_TOTALS.tokens, outputTokens: 1000, thinkingTokens: 250 },
      },
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    const categoryKinds = screen
      .getAllByTestId("category-row")
      .map((r) => r.getAttribute("data-category"));
    expect(categoryKinds).not.toContain("thinking");
    const thinkingRow = screen.getByTestId("thinking-row");
    expect(within(thinkingRow).getByTestId("thinking-tokens").textContent).toBe(tNumber(250));
    expect(within(thinkingRow).getByTestId("thinking-share").textContent).toBe(
      t("detail.thinkingOfOutput", { share: tPercent(0.25) }),
    );
  });

  it("omits the cache-write remainder row when the ephemeral split is exact", () => {
    const session = makeSessionRow({
      totals: {
        ...EMPTY_TOTALS,
        tokens: {
          ...EMPTY_TOTALS.tokens,
          cacheCreationInputTokens: 800,
          cacheCreation1hInputTokens: 600,
          cacheCreation5mInputTokens: 200,
        },
      },
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    const categoryKinds = screen
      .getAllByTestId("category-row")
      .map((r) => r.getAttribute("data-category"));
    expect(categoryKinds).not.toContain("cacheWriteOther");
  });

  it("shows the cache-write remainder row when 1h + 5m falls short of the total", () => {
    const session = makeSessionRow({
      totals: {
        ...EMPTY_TOTALS,
        tokens: {
          ...EMPTY_TOTALS.tokens,
          cacheCreationInputTokens: 1000,
          cacheCreation1hInputTokens: 600,
          cacheCreation5mInputTokens: 200,
        },
      },
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    const categoryKinds = screen
      .getAllByTestId("category-row")
      .map((r) => r.getAttribute("data-category"));
    expect(categoryKinds).toContain("cacheWriteOther");
  });

  it("hides the server-tool summary when web search, web fetch and subagents are all zero", () => {
    const session = makeSessionRow();
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.queryByTestId("server-tool-summary")).toBeNull();
  });

  it("shows the web search count when non-zero and omits the web fetch count when zero", () => {
    const session = makeSessionRow({
      totals: {
        ...EMPTY_TOTALS,
        tokens: { ...EMPTY_TOTALS.tokens, webSearchRequests: 3, webFetchRequests: 0 },
      },
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.getByTestId("server-tool-summary")).toBeTruthy();
    expect(screen.getByTestId("server-tool-web-search").textContent).toBe(
      t("detail.webSearch.other", { count: tNumber(3) }),
    );
    expect(screen.queryByTestId("server-tool-web-fetch")).toBeNull();
  });

  it("shows the subagent count when non-zero", () => {
    const session = makeSessionRow({
      totals: { ...EMPTY_TOTALS, subagentsSpawned: 4 },
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.getByTestId("server-tool-subagents").textContent).toBe(
      t("detail.subagents.other", { count: tNumber(4) }),
    );
  });

  it("lists each request with timestamp, cost, turns and duration", () => {
    const session = makeSessionRow({
      requests: [
        makeRequest({
          timestamp: "2026-01-05T10:00:00.000Z",
          costMicroUsd: 250_000,
          numTurns: 3,
          durationMs: 5000,
        }),
      ],
    });
    render(<SessionDetail session={session} rangeActive={false} />);
    const row = screen.getAllByTestId("request-row")[0]!;
    expect(row.textContent).toContain(tCurrency(0.25));
    expect(row.textContent).toContain(tNumber(3));
  });

  it('flags an error request with a badge and data-error="true"', () => {
    const session = makeSessionRow({ requests: [makeRequest({ isError: true })] });
    render(<SessionDetail session={session} rangeActive={false} />);
    const row = screen.getAllByTestId("request-row")[0]!;
    expect(row.getAttribute("data-error")).toBe("true");
    expect(within(row).getByTestId("request-error-badge").textContent).toBe(
      t("detail.requestError"),
    );
  });

  it("leaves a non-error request with no data-error attribute at all", () => {
    const session = makeSessionRow({ requests: [makeRequest({ isError: false })] });
    render(<SessionDetail session={session} rangeActive={false} />);
    const row = screen.getAllByTestId("request-row")[0]!;
    expect(row.hasAttribute("data-error")).toBe(false);
  });

  it("renders a placeholder for a request with no timestamp", () => {
    const session = makeSessionRow({ requests: [makeRequest({ timestamp: null })] });
    render(<SessionDetail session={session} rangeActive={false} />);
    const row = screen.getAllByTestId("request-row")[0]!;
    expect(row.textContent).toContain(t("detail.noTimestamp"));
  });

  it("reports requests started without a result instead of inventing rows", () => {
    const session = makeSessionRow({ openRequests: 2, requests: [makeRequest()] });
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.getByTestId("open-request-note").textContent).toBe(
      t("detail.openRequests.other", { count: tNumber(2) }),
    );
    expect(screen.getAllByTestId("request-row")).toHaveLength(1);
  });

  it("omits the open-request note when every request completed", () => {
    const session = makeSessionRow({ openRequests: 0, requests: [makeRequest()] });
    render(<SessionDetail session={session} rangeActive={false} />);
    expect(screen.queryByTestId("open-request-note")).toBeNull();
  });

  it("renders the session-scoped model breakdown", () => {
    const models: ModelBreakdown = {
      models: [
        {
          model: "claude-opus-5",
          costMicroUsd: 100_000,
          inputTokens: 10,
          outputTokens: 20,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          requests: 1,
        },
      ],
      costMicroUsd: 100_000,
    };
    const session = makeSessionRow({ models });
    render(<SessionDetail session={session} rangeActive={false} />);
    const breakdown = screen.getByTestId("session-model-breakdown");
    expect(within(breakdown).getByTestId("session-model-row").textContent).toContain(
      "claude-opus-5",
    );
  });

  describe("tool usage (S12, US-3.2)", () => {
    it("renders one chip per tool, in ranked order", () => {
      const session = makeSessionRow({
        toolUses: [
          { name: "Bash", calls: 5 },
          { name: "Read", calls: 2 },
          { name: "Edit", calls: 1 },
        ],
      });
      render(<SessionDetail session={session} rangeActive={false} />);
      const chips = screen.getAllByTestId("tool-chip");
      // DOM order IS the rank (S12 plan §2 Q4) -- never re-sorted here.
      expect(chips.map((c) => c.getAttribute("data-tool"))).toEqual(["Bash", "Read", "Edit"]);
    });

    it("renders the chips as list items inside a labelled list", () => {
      const session = makeSessionRow({ toolUses: [{ name: "Bash", calls: 1 }] });
      render(<SessionDetail session={session} rangeActive={false} />);
      const list = screen.getByTestId("tool-chip-list");
      expect(list.tagName).toBe("UL");
      expect(list.hasAttribute("aria-labelledby")).toBe(true);
      const chip = screen.getByTestId("tool-chip");
      expect(chip.tagName).toBe("LI");
    });

    it("states that these are call counts and not a cost attribution", () => {
      const session = makeSessionRow({ toolUses: [{ name: "Bash", calls: 1 }] });
      render(<SessionDetail session={session} rangeActive={false} />);
      expect(screen.getByTestId("tool-usage-note").textContent).toBe(t("detail.tools.note"));
    });

    it("shows no share or percentage anywhere in the tool section", () => {
      const session = makeSessionRow({
        toolUses: [
          { name: "Bash", calls: 5 },
          { name: "Read", calls: 5 },
        ],
      });
      render(<SessionDetail session={session} rangeActive={false} />);
      const section = screen.getByTestId("tool-usage");
      expect(section.textContent).not.toContain("%");
    });

    it("renders an MCP tool name verbatim, with no truncation or ellipsis", () => {
      // Tool names are data, not UI text: asserting the literal string here is
      // correct, not the translated-text trap (LEARNINGS).
      const mcpName = "mcp__example-server__list_items";
      const session = makeSessionRow({ toolUses: [{ name: mcpName, calls: 3 }] });
      render(<SessionDetail session={session} rangeActive={false} />);
      const chip = screen.getByTestId("tool-chip");
      expect(chip.querySelector(".tool-chip__name")!.textContent).toBe(mcpName);
      expect(chip.hasAttribute("title")).toBe(false);
    });

    it("shows an explicit empty state for a session with no tool calls, and no note", () => {
      const session = makeSessionRow({ toolUses: [] });
      render(<SessionDetail session={session} rangeActive={false} />);
      expect(screen.getByTestId("tool-usage-empty").textContent).toBe(t("detail.tools.empty"));
      expect(screen.queryByTestId("tool-usage-note")).toBeNull();
      expect(screen.queryByTestId("tool-chip-list")).toBeNull();
    });

    it("labels the tool counts as unfiltered while a range is active (Q11)", () => {
      const session = makeSessionRow({ toolUses: [{ name: "Bash", calls: 1 }] });
      render(<SessionDetail session={session} rangeActive={true} />);
      expect(screen.getByTestId("tool-usage-unfiltered").textContent).toBe(
        t("detail.tools.unfiltered"),
      );
    });

    it("renders no unfiltered note when no range is active", () => {
      const session = makeSessionRow({ toolUses: [{ name: "Bash", calls: 1 }] });
      render(<SessionDetail session={session} rangeActive={false} />);
      expect(screen.queryByTestId("tool-usage-unfiltered")).toBeNull();
    });
  });
});
