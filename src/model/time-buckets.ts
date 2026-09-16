/**
 * Day/month bucketing for `report.ts` (S5 plan §4.3). No clock: `new Date(epochMs)`
 * and `Date.parse(iso)` are deterministic functions of their argument, not a
 * read of "now" — see S5 plan §0's narrowed purity grep. `new Date()` with no
 * argument and `Date.now()` stay forbidden under `src/model/`.
 */

/** Minutes east of UTC at a given instant. Injected so src/model stays pure. */
export type ZoneOffsetResolver = (epochMs: number) => number;

/** The default. Reproduces the POC's UTC-day bucketing. */
export const utcOffset: ZoneOffsetResolver = () => 0;

/**
 * Strict ISO-8601 → epoch ms. Returns null for null, "", and anything
 * `Date.parse` cannot read. Deterministic: not a clock.
 */
export function parseTimestamp(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, "0");
}

/**
 * Shifted calendar fields, read in UTC after the zone offset has been applied
 * arithmetically. Reading with the host-zone getters (`getFullYear` etc.)
 * would apply the offset a second time — see S5 plan §10.3.
 */
function shiftedFields(
  epochMs: number,
  zone: ZoneOffsetResolver,
): { y: number; m: number; d: number } {
  const shifted = epochMs + Math.round(zone(epochMs)) * 60_000;
  const date = new Date(shifted);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

/** "YYYY-MM-DD" in the zone the resolver reports for that instant. */
export function dayKey(epochMs: number, zone: ZoneOffsetResolver = utcOffset): string {
  const { y, m, d } = shiftedFields(epochMs, zone);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** "YYYY-MM" in the zone the resolver reports for that instant. */
export function monthKey(epochMs: number, zone: ZoneOffsetResolver = utcOffset): string {
  const { y, m } = shiftedFields(epochMs, zone);
  return `${pad(y, 4)}-${pad(m, 2)}`;
}
