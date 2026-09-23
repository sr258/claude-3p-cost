/**
 * S16a's navigation shell (plan §7.2, US-2.2/US-2.3/US-2.4/US-5.1/US-5.2,
 * NFR-11). Every assertion is on `data-testid`, an attribute, or a value
 * derived from the catalogue — never a quoted English string (LEARNINGS:
 * the translated-text trap in its easiest disguise). No new date assertions
 * (LEARNINGS: `localZoneOffset` in an e2e test means the CI machine's zone).
 */
import { expect, test } from "@playwright/test";
import { gotoApp } from "./support/app.js";
import { overviewTree } from "./fixtures/trees.js";

const NEBULA_KEY = "space-nebula";

test("expansion and sort survive a round trip through every page", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const nebulaRow = page.locator(`[data-testid="group-row"][data-group-key="${NEBULA_KEY}"]`);
  await nebulaRow.getByTestId("group-disclosure").click();
  await expect(page.getByTestId("session-table")).toHaveCount(1);

  await page.getByTestId("sort-title").first().click();
  const titleHeader = page.getByTestId("sort-title").first().locator("xpath=ancestor::th[1]");
  await expect(titleHeader).toHaveAttribute("aria-sort", "ascending");

  for (const key of ["nav-models", "nav-trend", "nav-prices", "nav-overview"]) {
    await page.getByTestId(key).click();
  }

  await expect(nebulaRow.getByTestId("group-disclosure")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("session-table")).toHaveCount(1);
  await expect(titleHeader).toHaveAttribute("aria-sort", "ascending");
});

test("the active page carries aria-current", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  await expect(page.getByTestId("nav-overview")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-models")).not.toHaveAttribute("aria-current", "page");

  await page.getByTestId("nav-models").click();

  await expect(page.getByTestId("nav-models")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-overview")).not.toHaveAttribute("aria-current", "page");
});

test("the nav is reachable and operable from the keyboard", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const trendButton = page.getByTestId("nav-trend");
  await trendButton.focus();
  await expect(trendButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(trendButton).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("page-heading")).toBeVisible();
});

test("a scope chosen on the overview is shown on the models page", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });

  const nebulaRow = page.locator(`[data-testid="group-row"][data-group-key="${NEBULA_KEY}"]`);
  await nebulaRow.getByTestId("scope-select").click();
  await expect(nebulaRow.getByTestId("scope-select")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("nav-models").click();

  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "group");
  await expect(page.getByTestId("context-scope-select").locator("select")).toHaveValue(NEBULA_KEY);
});

test("a scope chosen on the models page selects the overview row", async ({ page }) => {
  await gotoApp(page, { tree: overviewTree, locale: "en" });
  await page.getByTestId("nav-models").click();

  await page
    .getByTestId("context-scope-select")
    .locator("select")
    .selectOption({ value: NEBULA_KEY });
  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "group");

  await page.getByTestId("nav-overview").click();

  const nebulaRow = page.locator(`[data-testid="group-row"][data-group-key="${NEBULA_KEY}"]`);
  await expect(nebulaRow.getByTestId("scope-select")).toHaveAttribute("aria-pressed", "true");
  await expect(nebulaRow).toHaveAttribute("data-selected", "true");
});
