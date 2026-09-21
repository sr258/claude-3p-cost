/**
 * US-5.1's date range filter (S13 plan §6, §7.2, NFR-9, NFR-11). Every
 * assertion is on `data-testid`, `data-partial`, a numeric shape produced by
 * the real `formatCurrency`, or a string derived from `translate()` — never
 * a quoted English string (LEARNINGS: the translated-text trap in its
 * easiest disguise).
 */
import { expect, test, type Page } from "@playwright/test";
import { formatCurrency, formatDate } from "../src/i18n/format.js";
import { translate } from "../src/i18n/translate.js";
import { gotoApp } from "./support/app.js";
import {
  DATE_RANGE_DROPPED_SESSION_ID,
  DATE_RANGE_PARTIAL_SESSION_ID,
  DATE_RANGE_SPACE_ID,
  DATE_RANGE_TOTAL_ALL_USD,
  DATE_RANGE_TOTAL_MARCH_USD,
  dateRangeTree,
} from "./fixtures/trees.js";

const MARCH_FROM = "2026-03-01";
const MARCH_TO = "2026-03-31";
// Noon UTC on the fixture's boundary days: within one calendar day of local
// midnight under any realistic host offset, so the expected label text is
// robust regardless of the CI runner's timezone.
const MARCH_FROM_DISPLAY_INSTANT = Date.UTC(2026, 2, 1, 12);
const MARCH_TO_DISPLAY_INSTANT = Date.UTC(2026, 2, 31, 12);

async function applyMarchCustomRange(page: Page): Promise<void> {
  await page.locator('[data-testid="range-preset"][data-preset="custom"]').click();
  await page.getByTestId("range-from").fill(MARCH_FROM);
  await page.getByTestId("range-to").fill(MARCH_TO);
  // Blurring forces a "change" event on browsers that only fire it on blur —
  // the component applies on change, not on input (Q16).
  await page.getByTestId("range-to").press("Tab");
}

async function expandDateRangeGroup(page: Page) {
  const groupRow = page.locator(
    `[data-testid="group-row"][data-group-key="${DATE_RANGE_SPACE_ID}"]`,
  );
  await groupRow.getByTestId("group-disclosure").click();
  return groupRow;
}

test("a custom range lowers the total and marks the straddling session as partial", async ({
  page,
}) => {
  await gotoApp(page, { tree: dateRangeTree, locale: "en" });

  await expect(page.getByTestId("total-row").getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", DATE_RANGE_TOTAL_ALL_USD),
  );

  await applyMarchCustomRange(page);

  await expect(page.getByTestId("total-row").getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", DATE_RANGE_TOTAL_MARCH_USD),
  );

  await expandDateRangeGroup(page);
  const partialRow = page.locator(
    `[data-testid="session-row"][data-session-id="${DATE_RANGE_PARTIAL_SESSION_ID}"]`,
  );
  await expect(partialRow).toHaveAttribute("data-partial", "true");
  await expect(partialRow.getByTestId("partial-badge")).toBeVisible();
});

test("a session outside the range disappears from the overview and the status bar count drops", async ({
  page,
}) => {
  await gotoApp(page, { tree: dateRangeTree, locale: "en" });
  await expandDateRangeGroup(page);
  const droppedRowLocator = () =>
    page.locator(`[data-testid="session-row"][data-session-id="${DATE_RANGE_DROPPED_SESSION_ID}"]`);
  await expect(droppedRowLocator()).toHaveCount(1);

  await applyMarchCustomRange(page);

  await expect(droppedRowLocator()).toHaveCount(0);
  await expect(page.getByTestId("status-sessions")).toHaveText(
    translate("en", "status.sessionsInRange", { included: "2", total: "3" }),
  );
});

test("clearing back to Alles restores the unfiltered total", async ({ page }) => {
  await gotoApp(page, { tree: dateRangeTree, locale: "en" });
  await applyMarchCustomRange(page);
  await expect(page.getByTestId("total-row").getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", DATE_RANGE_TOTAL_MARCH_USD),
  );

  await page.locator('[data-testid="range-preset"][data-preset="all"]').click();

  await expect(page.getByTestId("total-row").getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", DATE_RANGE_TOTAL_ALL_USD),
  );
  await expect(page.getByTestId("status-range")).toHaveText(translate("en", "status.rangeAll"));
});

test("the active period label comes from the catalogue in both locales", async ({ page }) => {
  const expectedPeriod = (locale: "en" | "de") =>
    translate(locale, "range.span", {
      from: formatDate(locale, MARCH_FROM_DISPLAY_INSTANT),
      to: formatDate(locale, MARCH_TO_DISPLAY_INSTANT),
    });

  await gotoApp(page, { tree: dateRangeTree, locale: "de" });
  await applyMarchCustomRange(page);
  await expect(page.getByTestId("status-range")).toHaveText(
    translate("de", "status.range", { period: expectedPeriod("de") }),
  );

  await gotoApp(page, { tree: dateRangeTree, locale: "en" });
  await applyMarchCustomRange(page);
  await expect(page.getByTestId("status-range")).toHaveText(
    translate("en", "status.range", { period: expectedPeriod("en") }),
  );
});

test("the Dieser Monat preset resolves against a fixed clock", async ({ page }) => {
  // A deterministic "now" so this assertion never depends on the day the
  // suite happens to run (LEARNINGS: build the test so the wrong
  // implementation gives a different answer -- a real clock would pass today
  // and fail in a different month).
  await page.clock.install({ time: new Date("2026-03-15T12:00:00.000Z") });

  await gotoApp(page, { tree: dateRangeTree, locale: "en" });

  await page.locator('[data-testid="range-preset"][data-preset="thisMonth"]').click();

  await expect(page.getByTestId("total-row").getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", DATE_RANGE_TOTAL_MARCH_USD),
  );
});
