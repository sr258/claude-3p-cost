/**
 * US-5.2's trend section (S14 plan §6, §9). Every string assertion comes
 * from `translate()` / `formatCurrency` / `formatDate` / `formatPercent` —
 * never a quoted English string (LEARNINGS: the translated-text trap in its
 * easiest disguise).
 */
import { expect, test, type Page } from "@playwright/test";
import { formatCurrency } from "../src/i18n/format.js";
import { gotoApp } from "./support/app.js";
import { TREND_GAP_DAY_KEY, TREND_SPACE_ID, trendTree } from "./fixtures/trees.js";

function trendRow(page: Page, key: string) {
  return page.locator(`[data-testid="trend-row"][data-key="${key}"]`);
}

async function switchToDayGranularity(page: Page): Promise<void> {
  await page.locator('[data-testid="trend-granularity"] [data-granularity="day"]').click();
}

async function selectProjectA(page: Page): Promise<void> {
  await page
    .locator(`[data-testid="group-row"][data-group-key="${TREND_SPACE_ID}"]`)
    .getByTestId("scope-select")
    .click();
}

test("the trend table appears with month granularity and switches to days", async ({ page }) => {
  await gotoApp(page, { tree: trendTree, locale: "en" });

  const table = page.getByTestId("trend-table");
  await expect(table).toBeVisible();
  // Default granularity is month (S14 plan §2 Q3): two calendar months are
  // present in the fixture.
  await expect(page.getByTestId("trend-row")).toHaveCount(2);
  await expect(trendRow(page, "2026-04")).toHaveCount(1);
  await expect(trendRow(page, "2026-05")).toHaveCount(1);

  await switchToDayGranularity(page);

  // Switching to days changes the KEY SET, not merely the row count: April
  // has 30 days, plus May 1st -- the last observed bucket (unbounded range).
  await expect(page.getByTestId("trend-row")).toHaveCount(31);
  await expect(trendRow(page, "2026-04-01")).toHaveCount(1);
  await expect(trendRow(page, "2026-05-01")).toHaveCount(1);
});

test("a gap day appears as a zero row", async ({ page }) => {
  await gotoApp(page, { tree: trendTree, locale: "en" });
  await switchToDayGranularity(page);

  const gapRow = trendRow(page, TREND_GAP_DAY_KEY);
  await expect(gapRow).toHaveAttribute("data-zero", "true");
  await expect(gapRow.getByTestId("trend-cell-cost")).toHaveText(formatCurrency("en", 0));

  const dataRow = trendRow(page, "2026-04-01");
  await expect(dataRow).toHaveAttribute("data-zero", "false");
});

test("selecting a project row scopes the trend, and clearing it restores all projects", async ({
  page,
}) => {
  await gotoApp(page, { tree: trendTree, locale: "en" });

  // Global scope: April's month bucket is A's 10+20+30 plus B's 5 = 65.00.
  await expect(trendRow(page, "2026-04").getByTestId("trend-cell-cost")).toHaveText(
    formatCurrency("en", 65.0),
  );

  await selectProjectA(page);

  // Scoped to project A only: April's bucket drops to 60.00 (B's request no
  // longer counted), while May (only ever A's) stays at 40.00.
  await expect(trendRow(page, "2026-04").getByTestId("trend-cell-cost")).toHaveText(
    formatCurrency("en", 60.0),
  );
  await expect(trendRow(page, "2026-05").getByTestId("trend-cell-cost")).toHaveText(
    formatCurrency("en", 40.0),
  );
  await expect(page.getByTestId("trend-scope-reset")).toBeVisible();

  await page.getByTestId("trend-scope-reset").click();

  await expect(trendRow(page, "2026-04").getByTestId("trend-cell-cost")).toHaveText(
    formatCurrency("en", 65.0),
  );
  await expect(page.getByTestId("trend-scope-reset")).toHaveCount(0);
});

test("applying a date range shortens the trend and pads to the range ends", async ({ page }) => {
  await gotoApp(page, { tree: trendTree, locale: "en" });
  await switchToDayGranularity(page);

  await page.locator('[data-testid="range-preset"][data-preset="custom"]').click();
  await page.getByTestId("range-from").fill("2026-04-01");
  await page.getByTestId("range-to").fill("2026-04-05");
  await page.getByTestId("range-to").press("Tab");

  // Padded to the range bounds (S14 plan §2 Q4): exactly 5 days, the last
  // point is the last INCLUDED day (2026-04-05), not one past it.
  await expect(page.getByTestId("trend-row")).toHaveCount(5);
  await expect(trendRow(page, "2026-04-01")).toHaveCount(1);
  await expect(trendRow(page, "2026-04-05")).toHaveCount(1);
  await expect(trendRow(page, "2026-04-06")).toHaveCount(0);
  await expect(trendRow(page, TREND_GAP_DAY_KEY)).toHaveAttribute("data-zero", "true");
});
