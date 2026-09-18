/**
 * German translation catalogue — the source of truth for `TranslationKey`.
 *
 * `en.ts` must carry exactly this key set (checked by TypeScript, see
 * `types.ts` and CLAUDE.md "Localization"). Keep both files sorted by key.
 */
export const de = {
  "app.title": "Claude3PCost",
  "app.version": "Version {version}",
  "app.subtitle": "Kostenübersicht für Claude Desktop (3P)",
  "card.lastScan": "Letzter Scan",
  "card.sessionCount.one": "{count} Sitzung",
  "card.sessionCount.other": "{count} Sitzungen",
  "card.sessions": "Sitzungen",
  "card.totalCost": "Gesamtkosten",
  "empty.chooseFolder": "Ordner wählen…",
  "empty.manualRootsTitle": "Eigene Ordner",
  "empty.noDataInFolder": "Keine Sitzungsdaten in diesem Ordner gefunden",
  "empty.noKnownLocations": "Keine bekannten Speicherorte auf diesem System.",
  "empty.pickFailed": "Der Ordner konnte nicht geöffnet werden.",
  "empty.removeRoot": "Entfernen",
  "empty.removeRootLabel": "{name} entfernen",
  "empty.searchedIntro": "Claude3PCost hat an diesen Orten gesucht:",
  "empty.title": "Keine Sitzungsdaten gefunden",
  "language.de": "Deutsch",
  "language.en": "Englisch",
  "language.label": "Sprache",
  "scan.accountCount.one": "{count} Konto",
  "scan.accountCount.other": "{count} Konten",
  "scan.profileCount.one": "{count} Profil",
  "scan.profileCount.other": "{count} Profile",
  "scan.rootCount.one": "{count} Ort",
  "scan.rootCount.other": "{count} Orte",
  "scan.running": "Suche läuft…",
  "scan.sessionCount.one": "{count} Sitzung",
  "scan.sessionCount.other": "{count} Sitzungen",
} as const;
