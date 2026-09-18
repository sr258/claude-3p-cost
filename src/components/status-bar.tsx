/**
 * US-2.1's status bar (S8 plan §6.5, §2 Q4). A fixed footer answering "what
 * do these numbers cover": roots · accounts · profiles · sessions ·
 * last-scan time, plus a problems count shown only when there is at least
 * one. Not clickable in S8 — making the collected-problems list reachable
 * needs the per-scope cap work `ROADMAP.md` flags against S21.
 *
 * Reads its signals directly, like `EmptyState` and `LanguageSwitcher` do —
 * it has no second caller and no S10 successor (plan §2 Q7).
 */
import { t, tDateTime, tPlural } from "../i18n/index.js";
import { discovery, lastScanAt, report } from "../state/app-state.js";

export function StatusBar() {
  const currentDiscovery = discovery.value;
  const currentReport = report.value;

  const rootCount = currentDiscovery?.roots.length ?? 0;
  const accountCount = currentDiscovery?.accountCount ?? 0;
  const profileCount = currentDiscovery?.profileCount ?? 0;
  const sessionCount = currentReport?.sessions.length ?? currentDiscovery?.sessions.length ?? 0;
  const problemCount = currentReport?.problems.length ?? 0;
  const scanTime = lastScanAt.value;

  return (
    <footer class="status-bar" data-testid="status-bar">
      <span data-testid="status-roots">{tPlural("scan.rootCount", rootCount)}</span>
      <span data-testid="status-accounts">{tPlural("scan.accountCount", accountCount)}</span>
      <span data-testid="status-profiles">{tPlural("scan.profileCount", profileCount)}</span>
      <span data-testid="status-sessions">{tPlural("scan.sessionCount", sessionCount)}</span>
      <span data-testid="status-last-scan">
        {scanTime === null
          ? t("status.neverScanned")
          : t("status.lastScanAt", { time: tDateTime(scanTime) })}
      </span>
      {problemCount > 0 && (
        <span data-testid="status-problems">{tPlural("status.problemCount", problemCount)}</span>
      )}
    </footer>
  );
}
