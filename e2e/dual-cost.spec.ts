/**
 * US-4.1/US-4.2's dual cost display and exclusion reporting (S16 plan §7.5).
 * Every assertion is on `data-testid`, an attribute, or a value derived from
 * the catalogue — never a quoted English word (LEARNINGS: a quoted English
 * string in an end-to-end assertion is the translated-text trap in its
 * easiest disguise).
 *
 * Reuses `overviewTree` (`e2e/fixtures/trees.ts`): its "nebula" session
 * carries `claude-opus-5` AND `claude-opus-5[1m]` in one `modelUsage` map,
 * exactly the shape S16's exclusion rule and dual display need.
 */
import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./support/app.js";
import { overviewTree } from "./fixtures/trees.js";

async function gotoOverview(page: Page): Promise<void> {
  await gotoApp(page, { tree: overviewTree, locale: "en" });
  await page.getByTestId("overview-table").waitFor();
}

async function expandNebula(page: Page) {
  const groupRow = page.locator('[data-testid="group-row"][data-group-key="space-nebula"]');
  await groupRow.getByTestId("group-disclosure").click();
  return groupRow;
}

test("enters an own price, then shows both figures and a signed deviation", async ({ page }) => {
  await gotoOverview(page);

  // Enter an own price for claude-opus-5, different from its shipped default
  // ($5/Mtok), so a deviation actually exists.
  await page.getByTestId("nav-prices").click();
  const input = page.getByTestId("price-input-claude-opus-5-input");
  await input.fill("10");
  await input.press("Enter");
  await expect(input).toHaveAttribute("data-edited", "true");

  await page.getByTestId("nav-overview").click();
  await page.getByTestId("overview-table").waitFor();

  // The dual column is now present, and the own-price cell is marked as
  // computed (never by colour alone).
  await expect(page.getByTestId("col-cost-own")).toBeVisible();
  const ownCells = page.getByTestId("cell-cost-own");
  await expect(ownCells.first()).toHaveAttribute("data-computed", "true");
  await expect(ownCells.first()).toContainText("≈"); // the "≈" glyph

  // The deviation note states a signed percentage/amount.
  await expect(page.getByTestId("recompute-deviation")).toBeVisible();

  // The session detail's transparency panel also shows a calculation.
  await expandNebula(page);
  const panel = page.locator("#session-panel-space-nebula");
  const sessionRow = panel.getByTestId("session-row").first();
  await sessionRow.getByTestId("session-disclosure").click();
  const detail = panel.getByTestId("session-detail");
  await expect(detail.getByTestId("recompute-table")).toBeVisible();
  await expect(detail.getByTestId("recompute-session-deviation")).toBeVisible();
});

test("clears a price, then reports the exclusion in the overview", async ({ page }) => {
  await gotoOverview(page);

  await page.getByTestId("nav-prices").click();

  // First, enter SOME own price so the dual display turns on at all (Q1) —
  // for the "[1m]" variant, which nebula's session also uses.
  const variantInput = page.getByTestId("price-input-claude-opus-5[1m]-input");
  await variantInput.fill("7");
  await variantInput.press("Enter");

  // Now clear claude-opus-5's OUTPUT price — nebula's session has non-zero
  // output tokens for this model, so this makes the whole session's own
  // price unknown (Q2: null price + non-zero usage -> excluded).
  const outputInput = page.getByTestId("price-input-claude-opus-5-output");
  await outputInput.fill("");
  await outputInput.press("Enter");
  await expect(outputInput).toHaveValue("");

  await page.getByTestId("nav-overview").click();
  await page.getByTestId("overview-table").waitFor();

  // The exclusion is reported in the tfoot row and in the prose note.
  await expect(page.getByTestId("excluded-row")).toBeVisible();
  await expect(page.getByTestId("recompute-exclusion")).toBeVisible();
  await expect(page.getByTestId("recompute-exclusion")).toContainText("1");
  await expect(page.getByTestId("recompute-excluded-models")).toContainText("claude-opus-5");
});
