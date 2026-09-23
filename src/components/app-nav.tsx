/**
 * S16a §5.2: the four-page navigation, replacing S15's two-chip `ViewSwitch`
 * (deleted this session). A `<nav>` of four `<button type="button">`s.
 *
 * Deliberately NOT `role="tablist"` / `role="tab"`: the pages are not tab
 * panels of one document, and the roving-tabindex semantics a tablist
 * promises would be a lie about how the control behaves. Four buttons in a
 * labelled `<nav>` are keyboard-operable by default and need no JavaScript
 * key handling.
 *
 * `aria-current` carries the active state, not colour alone (NFR-11).
 * LEARNINGS: Preact keeps `false` for `data-*`/`aria-*` and drops it for
 * every other attribute name — `aria-current` is therefore `undefined` when
 * inactive (so the attribute is absent, which is what `aria-current` means),
 * and the parallel `data-page` attribute carries a value in both states for
 * tests that want one.
 */
import { t } from "../i18n/index.js";
import type { Page } from "../state/app-state.js";

export interface AppNavProps {
  readonly page: Page;
  readonly onNavigate: (next: Page) => void;
}

interface NavItem {
  readonly key: Page;
  readonly labelKey: "nav.overview" | "nav.models" | "nav.trend" | "nav.prices";
}

const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", labelKey: "nav.overview" },
  { key: "models", labelKey: "nav.models" },
  { key: "trend", labelKey: "nav.trend" },
  { key: "prices", labelKey: "nav.prices" },
];

export function AppNav(props: AppNavProps) {
  const { page, onNavigate } = props;

  return (
    <nav class="app-nav" data-testid="app-nav" aria-label={t("nav.label")}>
      {NAV_ITEMS.map((item) => {
        const isActive = page === item.key;
        return (
          <button
            type="button"
            class="c3p-btn c3p-btn--quiet"
            key={item.key}
            data-testid={`nav-${item.key}`}
            data-page={item.key}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(item.key)}
          >
            {t(item.labelKey)}
          </button>
        );
      })}
    </nav>
  );
}
