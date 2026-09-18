/**
 * The session drill-down path (S9 plan §7.2, US-2.2, NFR-9, NFR-11). Every
 * assertion is on `data-testid`, `data-session-id`, `data-group-key`,
 * `aria-expanded`, `aria-sort`, or a value derived from the catalogue — never
 * on a quoted English string (LEARNINGS: a quoted English string in an
 * end-to-end assertion is the translated-text trap in its easiest disguise).
 */
import { expect, test } from "@playwright/test";
import { gotoApp } from "./support/app.js";
import {
  AURORA_ARCHIVED_SESSION_ID,
  AURORA_COST_DESC_ORDER,
  AURORA_SPACE_ID,
  AURORA_TITLE_ASC_ORDER,
  drilldownTree,
  SOLSTICE_SPACE_ID,
} from "./fixtures/trees.js";

test("expanding a project reveals its session table", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const groupRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  await expect(page.getByTestId("session-table")).toHaveCount(0);

  await groupRow.getByTestId("group-disclosure").click();

  await expect(page.getByTestId("session-table")).toHaveCount(1);
  await expect(page.getByTestId("session-row")).toHaveCount(4);
});

test("two projects can be expanded at once", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  const solsticeRow = page.locator(
    `[data-testid="group-row"][data-group-key="${SOLSTICE_SPACE_ID}"]`,
  );

  await auroraRow.getByTestId("group-disclosure").click();
  await solsticeRow.getByTestId("group-disclosure").click();

  await expect(page.getByTestId("session-table")).toHaveCount(2);
  await expect(page.getByTestId("session-row")).toHaveCount(5);
});

test("the session rows open in cost-descending order", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  await auroraRow.getByTestId("group-disclosure").click();

  const auroraTable = page.locator(
    `[data-testid="session-table"][data-group-key="${AURORA_SPACE_ID}"]`,
  );
  const ids = await auroraTable
    .getByTestId("session-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-session-id")));
  expect(ids).toEqual(AURORA_COST_DESC_ORDER);
});

test("sorting by title ascending reorders the session rows", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  await auroraRow.getByTestId("group-disclosure").click();

  await page.getByTestId("sort-title").first().click();

  const auroraTable = page.locator(
    `[data-testid="session-table"][data-group-key="${AURORA_SPACE_ID}"]`,
  );
  const ids = await auroraTable
    .getByTestId("session-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-session-id")));
  expect(ids).toEqual(AURORA_TITLE_ASC_ORDER);

  const titleHeader = auroraTable.getByTestId("sort-title").locator("xpath=ancestor::th[1]");
  await expect(titleHeader).toHaveAttribute("aria-sort", "ascending");
});

test("expansion survives a sort", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  const solsticeRow = page.locator(
    `[data-testid="group-row"][data-group-key="${SOLSTICE_SPACE_ID}"]`,
  );
  await auroraRow.getByTestId("group-disclosure").click();
  await solsticeRow.getByTestId("group-disclosure").click();

  await page.getByTestId("sort-cost").first().click();

  // Both panels are still open, and both re-sorted (one global sort state).
  await expect(page.getByTestId("session-table")).toHaveCount(2);
  const auroraDisclosureButton = auroraRow.getByTestId("group-disclosure");
  await expect(auroraDisclosureButton).toHaveAttribute("aria-expanded", "true");
  const solsticeDisclosureButton = solsticeRow.getByTestId("group-disclosure");
  await expect(solsticeDisclosureButton).toHaveAttribute("aria-expanded", "true");

  // "Still open" alone would pass even if the sort click did nothing at all.
  // Clicking the active column flips the direction, so the rows must now be
  // in cost-ASCENDING order, and both panels' headers must agree.
  const auroraTable = page.locator(
    `[data-testid="session-table"][data-group-key="${AURORA_SPACE_ID}"]`,
  );
  const ids = await auroraTable
    .getByTestId("session-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-session-id")));
  expect(ids).toEqual([...AURORA_COST_DESC_ORDER].reverse());
  for (const key of [AURORA_SPACE_ID, SOLSTICE_SPACE_ID]) {
    const header = page
      .locator(`[data-testid="session-table"][data-group-key="${key}"]`)
      .getByTestId("sort-cost")
      .locator("xpath=ancestor::th[1]");
    await expect(header).toHaveAttribute("aria-sort", "ascending");
  }
});

test("collapsing removes the session table from the DOM", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  const disclosure = auroraRow.getByTestId("group-disclosure");

  await disclosure.click();
  await expect(page.getByTestId("session-table")).toHaveCount(1);

  await disclosure.click();
  await expect(page.getByTestId("session-table")).toHaveCount(0);
  await expect(page.getByTestId("session-panel-row")).toHaveCount(0);
});

test("an archived session carries the archived badge", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  await auroraRow.getByTestId("group-disclosure").click();

  const archivedRow = page.locator(
    `[data-testid="session-row"][data-session-id="${AURORA_ARCHIVED_SESSION_ID}"]`,
  );
  await expect(archivedRow).toHaveAttribute("data-archived", "true");
  await expect(archivedRow.getByTestId("archived-badge")).toHaveCount(1);
});

test("the disclosure is reachable and operable by keyboard", async ({ page }) => {
  await gotoApp(page, { tree: drilldownTree, locale: "en" });

  const auroraRow = page.locator(`[data-testid="group-row"][data-group-key="${AURORA_SPACE_ID}"]`);
  const disclosure = auroraRow.getByTestId("group-disclosure");

  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("session-table")).toHaveCount(1);
});
