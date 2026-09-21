/**
 * US-4.2's price table editor (S15 plan §5.5). Presentational: receives rows
 * plus callbacks, holds only the transient text of the cell currently being
 * edited, an in-app confirmation state (Q4: no OS modal, keyboard-operable),
 * and the last export/import status message.
 *
 * Editing is immediate, per field, on commit — blur or Enter (Q3) — no
 * draft state, no save button, no undo stack. `▊`/`data-edited` marks an
 * edited cell, always paired with the `prices.edited` text and the
 * `prices.defaultHint` line — never colour alone (NFR-11).
 */
import { useState } from "preact/hooks";
import { t, tDate, tNumber, tPlural } from "../i18n/index.js";
import { PRICE_FIELDS, type PriceField, type PriceMicroUsdPerMtok } from "../model/prices.js";
import { formatPriceInput, parsePriceInput } from "../model/prices.js";
import type { PriceDecode, PriceRow } from "../model/price-table.js";
import type { ExportOutcome, ImportOutcome } from "../services/price-export.js";

export interface PriceTableEditorProps {
  /** `buildPriceRows` output: in-data rows first, then default-only rows. */
  readonly rows: readonly PriceRow[];
  /** `DEFAULT_PRICES_AS_OF`, an ISO day string. */
  readonly asOfDate: string;
  readonly onSetPrice: (
    model: string,
    field: PriceField,
    value: PriceMicroUsdPerMtok | null,
  ) => void;
  readonly onResetRow: (model: string) => void;
  readonly onResetAll: () => void;
  readonly onExport: () => Promise<ExportOutcome>;
  readonly onImportFile: () => Promise<ImportOutcome>;
  readonly onApplyImport: (text: string) => PriceDecode;
}

/**
 * `DEFAULT_PRICES_AS_OF` is a calendar DAY with no time zone.
 * `new Date("2026-09-21")` parses that as UTC midnight, and formatting it
 * in the host's own zone renders the PREVIOUS day everywhere west of UTC
 * (checked: `de-DE`, `America/New_York` -> "20.09.2026"). Parse it as UTC
 * and format it as UTC, so the rendered day is the constant's own day on
 * every machine. Same class of trap as LEARNINGS' "`localZoneOffset` in an
 * end-to-end test means the CI machine's zone, not a fixed one".
 */
const AS_OF_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeZone: "UTC",
};

function asOfInstant(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`);
}

function cellKey(model: string, field: PriceField): string {
  return `${model}${field}`;
}

function defaultHintValue(defaultValue: PriceMicroUsdPerMtok | null): string | null {
  if (defaultValue === null) {
    return null;
  }
  return tNumber(defaultValue / 1_000_000, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * Each of these literal keys carries no placeholder, but `t`'s generic
 * signature can only see that once the key is a LITERAL at the call site —
 * a `Record<PriceField, TranslationKey>` lookup widens to the whole
 * `TranslationKey` union, and `TArgs<TranslationKey>` then (correctly)
 * demands a params argument because SOME translation keys have one. An
 * explicit switch keeps every call site a literal.
 */
function columnLabel(field: PriceField): string {
  switch (field) {
    case "input":
      return t("prices.columnInput");
    case "output":
      return t("prices.columnOutput");
    case "cacheWrite5m":
      return t("prices.columnCacheWrite5m");
    case "cacheWrite1h":
      return t("prices.columnCacheWrite1h");
    case "cacheRead":
      return t("prices.columnCacheRead");
  }
}

export function PriceTableEditor(props: PriceTableEditorProps) {
  const {
    rows,
    asOfDate,
    onSetPrice,
    onResetRow,
    onResetAll,
    onExport,
    onImportFile,
    onApplyImport,
  } = props;

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [invalidCells, setInvalidCells] = useState<ReadonlySet<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<"resetAll" | "import" | null>(null);
  const [otherModelsOpen, setOtherModelsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const inDataRows = rows.filter((r) => r.inData);
  const otherRows = rows.filter((r) => !r.inData);
  const incompleteCount = rows.filter((r) => r.inData && !r.isComplete).length;

  function commitCell(row: PriceRow, field: PriceField, rawText: string): void {
    const key = cellKey(row.model, field);
    const parsed = parsePriceInput(rawText);
    if (parsed.kind === "invalid") {
      setInvalidCells((prev) => new Set(prev).add(key));
      return;
    }
    setInvalidCells((prev) => {
      if (!prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    onSetPrice(row.model, field, parsed.value);
  }

  async function handleExport(): Promise<void> {
    const outcome = await onExport();
    if (outcome.kind === "failed") {
      setStatusMessage(t("prices.json.saveFailed"));
    } else {
      setStatusMessage(null);
    }
  }

  async function handleImportConfirmed(): Promise<void> {
    setPendingAction(null);
    const outcome = await onImportFile();
    if (outcome.kind === "cancelled") {
      return;
    }
    if (outcome.kind === "failed") {
      setStatusMessage(t("prices.json.loadFailed"));
      return;
    }
    const decoded = onApplyImport(outcome.text);
    if (decoded.kind === "invalid") {
      setStatusMessage(t(`prices.json.invalid.${decoded.reason}`));
      return;
    }
    setStatusMessage(t("prices.json.imported", { count: tNumber(decoded.models) }));
  }

  function renderCell(row: PriceRow, field: PriceField) {
    const cell = row.cells[field];
    const key = cellKey(row.model, field);
    const text = draft[key] ?? formatPriceInput(cell.value);
    const invalid = invalidCells.has(key);
    const hint = cell.isEdited ? defaultHintValue(cell.defaultValue) : null;

    return (
      <td class="price-table__cell" key={field}>
        <input
          type="text"
          inputMode="decimal"
          class="price-table__input"
          data-testid={`price-input-${row.model}-${field}`}
          data-edited={cell.isEdited}
          aria-invalid={invalid}
          value={text}
          onInput={(e) => {
            const value = (e.target as HTMLInputElement).value;
            setDraft((prev) => ({ ...prev, [key]: value }));
          }}
          onBlur={(e) => commitCell(row, field, (e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {invalid && (
          <div
            class="price-table__hint price-table__hint--error"
            data-testid={`price-invalid-${row.model}-${field}`}
          >
            {t("prices.invalidValue")}
          </div>
        )}
        {!invalid && hint !== null && (
          <div class="price-table__hint">
            {t("prices.edited")} · {t("prices.defaultHint", { value: hint })}
          </div>
        )}
      </td>
    );
  }

  function renderRow(row: PriceRow) {
    return (
      <tr key={row.model} data-testid="price-row" data-model={row.model}>
        <th scope="row" class="price-table__model">
          {row.model}
        </th>
        {PRICE_FIELDS.map((field) => renderCell(row, field))}
        <td class="price-table__reset-cell">
          {row.isEdited && (
            <button
              type="button"
              class="price-table__reset-row"
              data-testid={`price-reset-${row.model}`}
              aria-label={t("prices.resetRow", { model: row.model })}
              onClick={() => onResetRow(row.model)}
            >
              ↺
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <section class="price-table-editor" data-testid="price-table-editor">
      <p class="price-table-editor__as-of" data-testid="price-as-of">
        {t("prices.asOf", { date: tDate(asOfInstant(asOfDate), AS_OF_DATE_OPTIONS) })}{" "}
        {t("prices.asOfNote")}
      </p>

      <div class="price-table-editor__toolbar">
        {pendingAction === "resetAll" ? (
          <span class="price-table-editor__confirm" data-testid="price-confirm-reset-all">
            {t("prices.resetAllConfirm")}
            <button
              type="button"
              data-testid="price-confirm-reset-all-yes"
              onClick={() => {
                onResetAll();
                setPendingAction(null);
              }}
            >
              {t("prices.resetAll")}
            </button>
            <button type="button" onClick={() => setPendingAction(null)}>
              {t("prices.cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            data-testid="price-reset-all"
            onClick={() => setPendingAction("resetAll")}
          >
            {t("prices.resetAll")}
          </button>
        )}

        <button type="button" data-testid="price-export" onClick={() => void handleExport()}>
          {t("prices.json.export")}
        </button>

        {pendingAction === "import" ? (
          <span class="price-table-editor__confirm" data-testid="price-confirm-import">
            {t("prices.json.importReplaceWarning")}
            <button
              type="button"
              data-testid="price-confirm-import-yes"
              onClick={() => void handleImportConfirmed()}
            >
              {t("prices.json.import")}
            </button>
            <button type="button" onClick={() => setPendingAction(null)}>
              {t("prices.cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            data-testid="price-import"
            onClick={() => setPendingAction("import")}
          >
            {t("prices.json.import")}
          </button>
        )}
      </div>

      {statusMessage !== null && (
        <p class="price-table-editor__status" data-testid="price-status">
          {statusMessage}
        </p>
      )}

      <table class="price-table">
        <thead>
          <tr>
            <th scope="col">{t("prices.columnModel")}</th>
            {PRICE_FIELDS.map((field) => (
              <th scope="col" key={field}>
                {columnLabel(field)}
              </th>
            ))}
            <th scope="col" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {inDataRows.map((row) => (
            <>
              {renderRow(row)}
              {!row.hasDefault && (
                <tr>
                  <td colSpan={PRICE_FIELDS.length + 2} class="price-table__no-default">
                    {t("prices.noDefault")}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {otherRows.length > 0 && (
        <div class="price-table-editor__other-models">
          <button
            type="button"
            data-testid="price-other-models-toggle"
            aria-expanded={otherModelsOpen}
            onClick={() => setOtherModelsOpen(!otherModelsOpen)}
          >
            {t("prices.otherModels", { count: tNumber(otherRows.length) })}
          </button>
          {otherModelsOpen && (
            <table class="price-table price-table--other" data-testid="price-other-models-table">
              <thead>
                <tr>
                  <th scope="col">{t("prices.columnModel")}</th>
                  {PRICE_FIELDS.map((field) => (
                    <th scope="col" key={field}>
                      {columnLabel(field)}
                    </th>
                  ))}
                  <th scope="col" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>{otherRows.map((row) => renderRow(row))}</tbody>
            </table>
          )}
        </div>
      )}

      {incompleteCount > 0 && (
        <p class="price-table-editor__incomplete" data-testid="price-incomplete">
          {tPlural("prices.incomplete", incompleteCount)}
        </p>
      )}
    </section>
  );
}
