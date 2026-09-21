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
import { t, tDate, tDateTime, tNumber, tPlural } from "../i18n/index.js";
import { isAllTime } from "../model/date-range.js";
import { discovery, lastScanAt, report } from "../state/app-state.js";

/**
 * The active period, in the host zone (S13 plan §2 Q2, Q6). `fromMs`/`toMs`
 * are already correct instants regardless of zone, so `tDate` alone renders
 * them right — no need to round-trip through `dayStringsOf` here. `toMs` is
 * EXCLUSIVE (Q3), so the last included day is one ms earlier.
 */
function rangePeriodText(fromMs: number | null, toMs: number | null): string {
  if (fromMs !== null && toMs !== null) {
    return t("range.span", { from: tDate(fromMs), to: tDate(toMs - 1) });
  }
  if (fromMs !== null) {
    return t("range.spanFrom", { from: tDate(fromMs) });
  }
  if (toMs !== null) {
    return t("range.spanTo", { to: tDate(toMs - 1) });
  }
  // Unreachable while isAllTime(range) is checked first, but total for NFR-3.
  return t("status.rangeAll");
}

export function StatusBar() {
  const currentDiscovery = discovery.value;
  const currentReport = report.value;

  const rootCount = currentDiscovery?.roots.length ?? 0;
  const accountCount = currentDiscovery?.accountCount ?? 0;
  const profileCount = currentDiscovery?.profileCount ?? 0;
  const sessionCount = currentReport?.sessions.length ?? currentDiscovery?.sessions.length ?? 0;
  const problemCount = currentReport?.problems.length ?? 0;
  const scanTime = lastScanAt.value;

  const range = currentReport?.range ?? null;
  const rangeActive = range !== null && !isAllTime(range);
  const totalSessionCount = sessionCount + (currentReport?.excluded.sessions ?? 0);

  return (
    <footer class="status-bar" data-testid="status-bar">
      <span data-testid="status-roots">{tPlural("scan.rootCount", rootCount)}</span>
      <span data-testid="status-accounts">{tPlural("scan.accountCount", accountCount)}</span>
      <span data-testid="status-profiles">{tPlural("scan.profileCount", profileCount)}</span>
      <span data-testid="status-sessions">
        {rangeActive
          ? t("status.sessionsInRange", {
              included: tNumber(sessionCount),
              total: tNumber(totalSessionCount),
            })
          : tPlural("scan.sessionCount", sessionCount)}
      </span>
      <span data-testid="status-range" class="status-bar__range">
        {range === null || !rangeActive
          ? t("status.rangeAll")
          : t("status.range", { period: rangePeriodText(range.fromMs, range.toMs) })}
      </span>
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
