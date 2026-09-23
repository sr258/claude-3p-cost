/**
 * S16a §5.3: the context bar's scope selector — one `<select>` listing an
 * all-scope option followed by one option per group, in the REPORT's own
 * order (S8 §2 Q6: never re-sorted here). Its own file and its own test
 * file rather than folded into `ContextBar` (LEARNINGS: a change folded
 * into an existing component is how a planned test goes unwritten).
 *
 * `data-testid="context-scope-select"`, NOT `"scope-select"`: the overview
 * row's per-group scope BUTTON already owns that testid (`overview-table.tsx`,
 * unchanged this session), and this is a second, independent control writing
 * the same signal — reusing the id would collide, since both render on the
 * same report pages at once.
 *
 * The all-option's value is the empty string; `onChange` maps `""` to
 * `null`. A group key can be the two-character escape sequence backslash-u-
 * 0-0-0-0 followed by "none" (`NO_FOLDER_KEY`/`projectKey({kind:"none"})`) —
 * legal as an `<option value>` and round-trips through the DOM unchanged,
 * but it cannot be matched by a CSS attribute selector (LEARNINGS: CSS
 * tokenisation replaces a real NUL with U+FFFD). No new NUL byte is written
 * here; the sentinel only ever arrives through `options`, built elsewhere
 * from the existing `NO_FOLDER_KEY` / `projectKey` exports.
 */
import { t } from "../i18n/index.js";
import type { Grouping } from "../state/app-state.js";

export interface ScopeOption {
  readonly key: string;
  readonly label: string;
}

export interface ScopeSelectProps {
  /** Report order. Never re-sorted here (S8 §2 Q6). */
  readonly options: readonly ScopeOption[];
  /** null = the global scope. */
  readonly selectedKey: string | null;
  readonly onChange: (key: string | null) => void;
  /** Drives the all-option's label: "All projects" vs "All folders". */
  readonly grouping: Grouping;
}

const ALL_OPTION_VALUE = "";

export function ScopeSelect(props: ScopeSelectProps) {
  const { options, selectedKey, onChange, grouping } = props;

  // The fallback rule: a stored key naming a group that does not exist
  // under the current grouping (or vanished after a rescan) degrades to the
  // all-option WITHOUT writing the signal — `findGroup` already degrades
  // this way for the model panel, and this select must agree with it
  // rather than invent a second rule.
  const knownKey = selectedKey !== null && options.some((o) => o.key === selectedKey);
  const value = knownKey ? selectedKey! : ALL_OPTION_VALUE;

  const allLabel = grouping === "folder" ? t("scope.allFolders") : t("scope.allProjects");

  return (
    <label class="context-bar__scope" data-testid="context-scope-select">
      <span>{t("scope.label")}</span>
      <select
        value={value}
        onChange={(event) => {
          const next = (event.target as HTMLSelectElement).value;
          onChange(next === ALL_OPTION_VALUE ? null : next);
        }}
      >
        <option value={ALL_OPTION_VALUE}>{allLabel}</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
