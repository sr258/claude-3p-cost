/**
 * The overview path (S8 plan §7.2, US-2.1, NFR-2, NFR-9). Every assertion is
 * on an accessible role, a `data-testid`, or a numeric shape produced by the
 * real `formatCurrency` — never on translated text, so both locale specs
 * exercise the same file (plan §1: the relocated language-switch case).
 */
import { expect, test } from "@playwright/test";
import { formatCurrency } from "../src/i18n/format.js";
import { gotoApp } from "./support/app.js";
import { overviewTree, OVERVIEW_TOTAL_USD } from "./fixtures/trees.js";

const EXPECTED_GROUP_ORDER = ["space-nebula", "space-quartz", "ghost-space-unknown", "\u0000none"];

test("start to overview renders one row per project group", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  await expect(page.getByTestId("group-row")).toHaveCount(4);
});

test("rows are in cost-descending order", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const rows = page.getByTestId("group-row");
  await expect(rows).toHaveCount(4);
  const keys = await rows.evaluateAll((elements) =>
    elements.map((el) => el.getAttribute("data-group-key")),
  );
  expect(keys).toEqual(EXPECTED_GROUP_ORDER);
});

test("the total row matches the fixture total", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const totalRow = page.getByTestId("total-row");
  await expect(totalRow.getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", OVERVIEW_TOTAL_USD),
  );
});

test("the overview path in German", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "de" });

  const rows = page.getByTestId("group-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.first().getByTestId("cell-cost")).toHaveText(formatCurrency("de", 1234.56));
});

test("the overview path in English", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const rows = page.getByTestId("group-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.first().getByTestId("cell-cost")).toHaveText(formatCurrency("en", 1234.56));
});

test("switching language re-renders the cost cells in the other locale", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const firstCostCell = page.getByTestId("group-row").first().getByTestId("cell-cost");
  await expect(firstCostCell).toHaveText(formatCurrency("en", 1234.56));

  // Positional, not by accessible name: the German button is always first in
  // DOM order regardless of the active locale (never click by translated
  // text — the trap ROADMAP.md names for this session).
  await page.getByTestId("language-switcher").locator("button").first().click();

  await expect(firstCostCell).toHaveText(formatCurrency("de", 1234.56));
});

test("the first group row is attached within 2 seconds of navigation", async ({ page }) => {
  const start = Date.now();

  await gotoApp(page, { tree: overviewTree, locale: "en" });
  await page.getByTestId("group-row").first().waitFor({ state: "attached" });

  const elapsedMs = Date.now() - start;
  expect(elapsedMs).toBeLessThan(2000);
});

test("the headline total matches the table's footer total", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const headlineCost = page.getByTestId("headline-cost");
  const footerCost = page.getByTestId("total-row").getByTestId("cell-cost");
  // `toContainText`, not `toHaveText`: the headline carries a
  // visually-hidden accessible label ahead of the figure (`textContent`
  // includes it even though it renders no visible text), so the real claim
  // is that the same currency text is IN there, not that the two elements'
  // full text content is identical.
  await expect(headlineCost).toContainText(await footerCost.innerText());
});

test("the headline total follows the selected scope", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const rows = page.getByTestId("group-row");
  const firstRow = rows.first();
  const firstRowCost = await firstRow.getByTestId("cell-cost").innerText();

  await firstRow.getByTestId("scope-select").click();

  await expect(page.getByTestId("headline-cost")).toContainText(firstRowCost);
});
