import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatNumber } from "../i18n/format.js";
import { buildPriceRows } from "../model/price-table.js";
import type { ModelPrice } from "../model/prices.js";
import type { PriceTable } from "../model/prices.js";
import type { ModelTotal } from "../model/report-types.js";
import { locale } from "../state/app-state.js";
import { PriceTableEditor, type PriceTableEditorProps } from "./price-table-editor.js";

function price(input: number): ModelPrice {
  return {
    input,
    output: input * 5,
    cacheWrite5m: (input * 5) / 4,
    cacheWrite1h: input * 2,
    cacheRead: input / 10,
  };
}

function modelTotal(model: string, costMicroUsd: number): ModelTotal {
  return {
    model,
    costMicroUsd,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    requests: 1,
  };
}

const DEFAULTS: PriceTable = new Map([
  ["model-a", price(5_000_000)],
  ["model-b", price(3_000_000)],
]);

function baseProps(overrides: Partial<PriceTableEditorProps> = {}): PriceTableEditorProps {
  return {
    rows: buildPriceRows([modelTotal("model-a", 100)], DEFAULTS, new Map()),
    asOfDate: "2026-09-21",
    onSetPrice: vi.fn(),
    onResetRow: vi.fn(),
    onResetAll: vi.fn(),
    onExport: vi.fn().mockResolvedValue({ kind: "saved" }),
    onImportFile: vi.fn().mockResolvedValue({ kind: "cancelled" }),
    onApplyImport: vi.fn(),
    ...overrides,
  };
}

describe("PriceTableEditor", () => {
  afterEach(() => {
    locale.value = "en";
  });

  it("renders one row per model with the exact variant string", () => {
    const rows = buildPriceRows(
      [modelTotal("model-a", 100), modelTotal("model-a[1m]", 50)],
      new Map([...DEFAULTS, ["model-a[1m]", price(5_000_000)]]),
      new Map(),
    );
    render(<PriceTableEditor {...baseProps({ rows })} />);

    const priceRows = screen.getAllByTestId("price-row");
    expect(priceRows.map((r) => r.getAttribute("data-model"))).toEqual(["model-a", "model-a[1m]"]);
  });

  it('renders data-edited "true" on an edited cell and "false" on a default one', () => {
    const overrides = new Map([
      ["model-a", new Map<"input", number | null>([["input", 9_000_000]])],
    ]);
    const rows = buildPriceRows([modelTotal("model-a", 100)], DEFAULTS, overrides);
    render(<PriceTableEditor {...baseProps({ rows })} />);

    const inputCell = screen.getByTestId("price-input-model-a-input");
    const outputCell = screen.getByTestId("price-input-model-a-output");
    expect(inputCell.getAttribute("data-edited")).toBe("true");
    expect(outputCell.getAttribute("data-edited")).toBe("false");
  });

  it("an empty cell renders an empty input, not a zero", () => {
    const rows = buildPriceRows([modelTotal("hausmodell-x", 42)], DEFAULTS, new Map());
    render(<PriceTableEditor {...baseProps({ rows })} />);

    const input = screen.getByTestId("price-input-hausmodell-x-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("committing a value calls onSetPrice with integer micro-USD per Mtok", () => {
    const onSetPrice = vi.fn();
    render(<PriceTableEditor {...baseProps({ onSetPrice })} />);

    const input = screen.getByTestId("price-input-model-a-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "6.25" } });
    fireEvent.blur(input);

    expect(onSetPrice).toHaveBeenCalledWith("model-a", "input", 6_250_000);
  });

  it("clearing a cell calls onSetPrice with null", () => {
    const onSetPrice = vi.fn();
    render(<PriceTableEditor {...baseProps({ onSetPrice })} />);

    const input = screen.getByTestId("price-input-model-a-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onSetPrice).toHaveBeenCalledWith("model-a", "input", null);
  });

  it("an invalid entry shows the error hint and does not call onSetPrice", () => {
    const onSetPrice = vi.fn();
    render(<PriceTableEditor {...baseProps({ onSetPrice })} />);

    const input = screen.getByTestId("price-input-model-a-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "not a number" } });
    fireEvent.blur(input);

    expect(onSetPrice).not.toHaveBeenCalled();
    expect(screen.getByTestId("price-invalid-model-a-input")).toBeTruthy();
  });

  it("the row reset button is absent on an unedited row and present on an edited one", () => {
    const overrides = new Map([
      ["model-a", new Map<"input", number | null>([["input", 9_000_000]])],
    ]);
    const rowsEdited = buildPriceRows([modelTotal("model-a", 100)], DEFAULTS, overrides);
    const rowsClean = buildPriceRows([modelTotal("model-a", 100)], DEFAULTS, new Map());

    const { unmount } = render(<PriceTableEditor {...baseProps({ rows: rowsClean })} />);
    expect(screen.queryByTestId("price-reset-model-a")).toBeNull();
    unmount();

    render(<PriceTableEditor {...baseProps({ rows: rowsEdited })} />);
    expect(screen.queryByTestId("price-reset-model-a")).not.toBeNull();
  });

  it("the as-of date is rendered through formatDate for the active locale, in UTC", () => {
    locale.value = "de";
    render(<PriceTableEditor {...baseProps({ asOfDate: "2026-09-21" })} />);
    // Derived from the formatter, never typed out (LEARNINGS: Intl emits
    // U+00A0 and `no-irregular-whitespace` does not catch it in a string
    // literal) — and pinned to UTC, because the constant is a calendar day
    // with no zone: formatting its UTC midnight in the host zone renders
    // the PREVIOUS day everywhere west of UTC. On a machine whose zone has
    // a negative offset this assertion fails against a component that
    // formats in local time.
    const expected = formatDate("de", new Date("2026-09-21T00:00:00Z"), {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    expect(screen.getByTestId("price-as-of").textContent).toContain(expected);
  });

  it("the incomplete-model count is rendered through tNumber", () => {
    const rows = buildPriceRows(
      [modelTotal("model-a", 100), modelTotal("hausmodell-x", 50)],
      DEFAULTS,
      new Map(),
    );
    locale.value = "de";
    render(<PriceTableEditor {...baseProps({ rows })} />);
    const expectedCount = formatNumber("de", 1);
    expect(screen.getByTestId("price-incomplete").textContent).toContain(expectedCount);
  });
});
