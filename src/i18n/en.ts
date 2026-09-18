import type { TranslationKey } from "./types.js";

/**
 * English translation catalogue.
 *
 * `as const satisfies Record<TranslationKey, string>` is load-bearing (see
 * CLAUDE.md "Localization" and docs/plans/S2-localization-layer.md §8): it
 * keeps the literal string types (so placeholder inference still works) while
 * still forcing this object to have exactly the keys of `de.ts` — a missing
 * key is TS1360, an extra key is TS2353. A `: Record<TranslationKey, string>`
 * annotation would check the same key set but widen every value to `string`,
 * silently destroying `Params<K>` and the typed `t()` signature.
 */
export const en = {
  "app.title": "Claude3PCost",
  "app.version": "Version {version}",
  "app.subtitle": "Cost overview for Claude Desktop (3P)",
  "card.lastScan": "Last scan",
  "card.sessionCount.one": "{count} session",
  "card.sessionCount.other": "{count} sessions",
  "card.sessions": "Sessions",
  "card.totalCost": "Total cost",
  "empty.chooseFolder": "Choose folder…",
  "empty.manualRootsTitle": "Custom folders",
  "empty.noDataInFolder": "No session data found in this folder",
  "empty.noKnownLocations": "No known locations on this system.",
  "empty.pickFailed": "The folder could not be opened.",
  "empty.removeRoot": "Remove",
  "empty.removeRootLabel": "Remove {name}",
  "empty.searchedIntro": "Claude3PCost looked in these locations:",
  "empty.title": "No session data found",
  "language.de": "German",
  "language.en": "English",
  "language.label": "Language",
  "scan.accountCount.one": "{count} account",
  "scan.accountCount.other": "{count} accounts",
  "scan.profileCount.one": "{count} profile",
  "scan.profileCount.other": "{count} profiles",
  "scan.rootCount.one": "{count} location",
  "scan.rootCount.other": "{count} locations",
  "scan.running": "Scanning…",
  "scan.sessionCount.one": "{count} session",
  "scan.sessionCount.other": "{count} sessions",
} as const satisfies Record<TranslationKey, string>;
