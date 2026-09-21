/**
 * US-4.2's app-bar view switch (S15 plan §2 Q3, §5.5). A two-chip
 * `role="radiogroup"`, reusing `GroupingToggle`'s exact idiom and CSS
 * classes so this session invents no second control pattern — it is the
 * seed S21 grows into full settings (Q3), at which point
 * `<PriceTableEditor>` moves inside a settings panel unchanged.
 */
import { t } from "../i18n/index.js";
import type { View } from "../state/app-state.js";

export interface ViewSwitchProps {
  readonly value: View;
  readonly onChange: (next: View) => void;
}

export function ViewSwitch(props: ViewSwitchProps) {
  const { value, onChange } = props;

  return (
    <div
      class="grouping-toggle view-switch"
      data-testid="view-switch"
      role="radiogroup"
      aria-label={t("view.label")}
    >
      <button
        type="button"
        role="radio"
        data-testid="view-overview"
        aria-checked={value === "overview"}
        onClick={() => onChange("overview")}
      >
        {t("view.overview")}
      </button>
      <button
        type="button"
        role="radio"
        data-testid="view-prices"
        aria-checked={value === "prices"}
        onClick={() => onChange("prices")}
      >
        {t("view.prices")}
      </button>
    </div>
  );
}
