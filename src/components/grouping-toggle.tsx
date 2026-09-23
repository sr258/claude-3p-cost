/**
 * US-2.4's project/folder toggle (S10 plan §2 Q4, §6.5). A `role="radiogroup"`
 * of two keyboard-operable `role="radio"` buttons, so NFR-11's "no state by
 * colour alone" is satisfied by `aria-checked` rather than a background tint.
 * Presentational only -- the `grouping` signal and its persistence rule (not
 * persisted, plan §2 Q6) live in `src/state/app-state.ts`.
 */
import { t } from "../i18n/index.js";
import type { Grouping } from "../state/app-state.js";

export interface GroupingToggleProps {
  readonly value: Grouping;
  readonly onChange: (next: Grouping) => void;
}

export function GroupingToggle(props: GroupingToggleProps) {
  const { value, onChange } = props;

  return (
    <div
      class="grouping-toggle"
      data-testid="grouping-toggle"
      role="radiogroup"
      aria-label={t("overview.groupingLabel")}
    >
      <button
        type="button"
        class="c3p-btn"
        role="radio"
        data-testid="grouping-project"
        aria-checked={value === "project"}
        onClick={() => onChange("project")}
      >
        {t("overview.groupByProject")}
      </button>
      <button
        type="button"
        class="c3p-btn"
        role="radio"
        data-testid="grouping-folder"
        aria-checked={value === "folder"}
        onClick={() => onChange("folder")}
      >
        {t("overview.groupByFolder")}
      </button>
    </div>
  );
}
