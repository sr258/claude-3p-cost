/**
 * US-5.1's quick-choice / custom range control (S13 plan §4.6, §2 Q5). A
 * `role="radiogroup"` of five keyboard-operable `role="radio"` chips, reusing
 * `GroupingToggle`'s pattern and CSS so this session invents no second
 * idiom. Props only, no signal reads — the `GroupingToggle` contract.
 */
import { t } from "../i18n/index.js";
import type { RangePresetId } from "../model/date-range.js";

export interface DateRangeFilterProps {
  readonly preset: RangePresetId;
  /** "YYYY-MM-DD" or null. Reflects the inputs, not the resolved range. */
  readonly fromDay: string | null;
  readonly toDay: string | null;
  /** Q15: true renders the message and the caller kept the previous range. */
  readonly invalid: boolean;
  readonly onPreset: (id: RangePresetId) => void;
  readonly onCustomDays: (from: string | null, to: string | null) => void;
}

interface PresetDef {
  readonly id: Exclude<RangePresetId, "custom">;
  readonly labelKey: "range.all" | "range.thisMonth" | "range.lastMonth" | "range.thisQuarter";
}

const PRESETS: readonly PresetDef[] = [
  { id: "all", labelKey: "range.all" },
  { id: "thisMonth", labelKey: "range.thisMonth" },
  { id: "lastMonth", labelKey: "range.lastMonth" },
  { id: "thisQuarter", labelKey: "range.thisQuarter" },
];

function toValueOrEmpty(day: string | null): string {
  return day ?? "";
}

function toDayOrNull(value: string): string | null {
  return value === "" ? null : value;
}

export function DateRangeFilter(props: DateRangeFilterProps) {
  const { preset, fromDay, toDay, invalid, onPreset, onCustomDays } = props;
  const customActive = preset === "custom";

  return (
    <div class="range-filter" data-testid="range-filter">
      <div class="range-filter__chips" role="radiogroup" aria-label={t("range.label")}>
        {PRESETS.map((def) => (
          <button
            type="button"
            role="radio"
            key={def.id}
            data-testid="range-preset"
            data-preset={def.id}
            aria-checked={preset === def.id}
            onClick={() => onPreset(def.id)}
          >
            {t(def.labelKey)}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          data-testid="range-preset"
          data-preset="custom"
          aria-checked={customActive}
          onClick={() => onPreset("custom")}
        >
          {t("range.custom")}
        </button>
      </div>
      <div class="range-filter__dates">
        <label>
          <span>{t("range.from")}</span>
          <input
            type="date"
            data-testid="range-from"
            disabled={!customActive}
            value={toValueOrEmpty(fromDay)}
            onChange={(event) =>
              onCustomDays(toDayOrNull((event.target as HTMLInputElement).value), toDay)
            }
          />
        </label>
        <label>
          <span>{t("range.to")}</span>
          <input
            type="date"
            data-testid="range-to"
            disabled={!customActive}
            value={toValueOrEmpty(toDay)}
            onChange={(event) =>
              onCustomDays(fromDay, toDayOrNull((event.target as HTMLInputElement).value))
            }
          />
        </label>
      </div>
      {invalid && (
        <p data-testid="range-invalid" role="alert">
          {t("range.invalid")}
        </p>
      )}
    </div>
  );
}
