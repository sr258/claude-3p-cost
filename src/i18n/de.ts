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
  "language.de": "Deutsch",
  "language.en": "Englisch",
  "language.label": "Sprache",
  "placeholder.noData":
    "Noch keine Daten geladen — die Datenerfassung folgt in einer späteren Version.",
} as const;
