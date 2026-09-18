/**
 * US-1.1's empty-state card: the searched locations, the chosen-folder list
 * (US-1.2), and the provisional summary strip (S7 plan §6). Self-contained,
 * no props — like `language-switcher.tsx`, it reads the signals it needs
 * directly from `state/app-state.ts` and re-renders when they change.
 *
 * S8 owns the real status bar and may replace the summary strip freely; the
 * card itself, this component, and the i18n keys below are permanent (S7
 * plan §6.2).
 *
 * Component-test convention this session establishes (S7 plan §7.3): query
 * by accessible role where one exists, `data-testid` otherwise, never by
 * translated text — `empty-state.test.tsx`'s "renders in both locales" case
 * enforces it.
 */
import { pathBasename } from "../model/paths.js";
import { t, tPlural } from "../i18n/index.js";
import {
  chooseFolder,
  discovery,
  manualRoots,
  pickMessage,
  removeManualRoot,
  report,
  scanState,
} from "../state/app-state.js";

export function EmptyState() {
  const currentDiscovery = discovery.value;
  const roots = manualRoots.value;
  const pick = pickMessage.value;
  const searched = currentDiscovery?.searched ?? [];
  const showNoDataHeadline = pick === "no-session-data";

  const rootCount = currentDiscovery?.roots.length ?? 0;
  const accountCount = currentDiscovery?.accountCount ?? 0;
  const profileCount = currentDiscovery?.profileCount ?? 0;
  const sessionCount = report.value?.sessions.length ?? currentDiscovery?.sessions.length ?? 0;
  const showSummary = rootCount > 0;

  return (
    <section class="empty-state" data-testid="empty-state">
      <h2
        class="empty-state__title"
        data-testid="empty-state-title"
        data-headline={showNoDataHeadline ? "no-data-in-folder" : "no-session-data"}
      >
        {showNoDataHeadline ? t("empty.noDataInFolder") : t("empty.title")}
      </h2>

      <p class="empty-state__intro">{t("empty.searchedIntro")}</p>
      {searched.length > 0 ? (
        <ul class="empty-state__locations" role="list" data-testid="searched-locations">
          {searched.map((candidate) => (
            <li key={candidate.path} title={candidate.path}>
              {candidate.label}
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="no-known-locations">{t("empty.noKnownLocations")}</p>
      )}

      {roots.length > 0 && (
        <div class="empty-state__manual-roots" data-testid="manual-roots">
          <h3>{t("empty.manualRootsTitle")}</h3>
          <ul role="list">
            {roots.map((path) => {
              const name = pathBasename(path);
              return (
                <li key={path} title={path}>
                  <span>{name}</span>
                  <button
                    type="button"
                    aria-label={t("empty.removeRootLabel", { name })}
                    data-testid={`remove-root-${path}`}
                    onClick={() => removeManualRoot(path)}
                  >
                    {t("empty.removeRoot")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        class="empty-state__choose-folder"
        data-testid="choose-folder-button"
        onClick={() => void chooseFolder()}
      >
        {t("empty.chooseFolder")}
      </button>

      {pick === "failed" && (
        <p class="empty-state__error" role="alert" data-testid="pick-failed">
          {t("empty.pickFailed")}
        </p>
      )}

      {scanState.value === "scanning" && <p data-testid="scan-running">{t("scan.running")}</p>}

      {showSummary && (
        <p class="empty-state__summary" data-testid="scan-summary">
          {tPlural("scan.rootCount", rootCount)} · {tPlural("scan.accountCount", accountCount)} ·{" "}
          {tPlural("scan.profileCount", profileCount)} ·{" "}
          {tPlural("scan.sessionCount", sessionCount)}
        </p>
      )}
    </section>
  );
}
