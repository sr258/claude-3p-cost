/**
 * S16a §5.4: the persistent context bar — grouping, date range and the
 * named scope select — rendered on every report page (Overview, Models,
 * Trend; not Prices, which scopes nothing). Props only, no signal reads —
 * the `GroupingToggle` / `ModelPanel` contract.
 *
 * Composes `GroupingToggle`, `DateRangeFilter` and `ScopeSelect`. The scope
 * select is rendered only when there is at least one group to scope to.
 */
import { DateRangeFilter, type DateRangeFilterProps } from "./date-range-filter.js";
import { GroupingToggle } from "./grouping-toggle.js";
import { ScopeSelect, type ScopeOption } from "./scope-select.js";
import type { Grouping } from "../state/app-state.js";

export interface ContextBarProps {
  readonly grouping: Grouping;
  readonly onGrouping: (next: Grouping) => void;
  /** The existing S13 prop bundle, threaded through unchanged. */
  readonly range: DateRangeFilterProps;
  readonly scopeOptions: readonly ScopeOption[];
  readonly selectedScopeKey: string | null;
  readonly onScope: (key: string | null) => void;
}

export function ContextBar(props: ContextBarProps) {
  const { grouping, onGrouping, range, scopeOptions, selectedScopeKey, onScope } = props;

  return (
    <div class="context-bar" data-testid="context-bar">
      <GroupingToggle value={grouping} onChange={onGrouping} />
      <DateRangeFilter {...range} />
      {scopeOptions.length > 0 && (
        <ScopeSelect
          options={scopeOptions}
          selectedKey={selectedScopeKey}
          onChange={onScope}
          grouping={grouping}
        />
      )}
    </div>
  );
}
