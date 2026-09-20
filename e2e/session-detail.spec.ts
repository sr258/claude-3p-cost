/**
 * US-3.1's cost-driver detail path (S11 plan §7, NFR-9, NFR-11). Every
 * assertion is on `data-testid`, `data-session-id`, `data-error`,
 * `aria-expanded`, or a value derived from the catalogue — never on a
 * quoted English string (LEARNINGS: a quoted English string in an
 * end-to-end assertion is the translated-text trap in its easiest disguise).
 */
import { expect, test } from "@playwright/test";
import { translate } from "../src/i18n/translate.js";
import { gotoApp } from "./support/app.js";
import {
  COST_DRIVERS_QUIET_SESSION_ID,
  COST_DRIVERS_SESSION_ID,
  COST_DRIVERS_SPACE_ID,
  costDriversTree,
} from "./fixtures/trees.js";

async function expandCostDriversSession(page: import("@playwright/test").Page, sessionId: string) {
  const groupRow = page.locator(
    `[data-testid="group-row"][data-group-key="${COST_DRIVERS_SPACE_ID}"]`,
  );
  await groupRow.getByTestId("group-disclosure").click();

  const sessionRow = page.locator(`[data-testid="session-row"][data-session-id="${sessionId}"]`);
  await sessionRow.getByTestId("session-disclosure").click();
  return sessionRow;
}

test("drilling project to session to detail shows the cost-driver categories", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "en" });

  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detail = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  await expect(detail).toBeVisible();

  const categoryRows = detail.getByTestId("category-row");
  const kinds = await categoryRows.evaluateAll((rows) =>
    rows.map((r) => r.getAttribute("data-category")),
  );
  expect(kinds).toEqual([
    "input",
    "output",
    "cacheWrite1h",
    "cacheWrite5m",
    "cacheWriteOther",
    "cacheRead",
  ]);

  // Thinking is a sub-row of output, never a sixth sibling category.
  await expect(detail.getByTestId("thinking-row")).toHaveCount(1);
  expect(kinds).not.toContain("thinking");
});

test("the token-share header comes from the catalogue in both locales", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "de" });
  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detailDe = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  await expect(detailDe.getByTestId("category-table").locator("th").nth(2)).toHaveText(
    translate("de", "detail.columnTokenShare"),
  );
  await expect(detailDe.getByTestId("token-share-note")).toHaveText(
    translate("de", "detail.tokenShareNote"),
  );

  await gotoApp(page, { tree: costDriversTree, locale: "en" });
  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detailEn = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  await expect(detailEn.getByTestId("category-table").locator("th").nth(2)).toHaveText(
    translate("en", "detail.columnTokenShare"),
  );
});

test("an error request is flagged by text and attribute, not by colour", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "en" });

  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detail = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  const errorRow = detail.locator('[data-testid="request-row"][data-error="true"]');
  await expect(errorRow).toHaveCount(1);
  await expect(errorRow.getByTestId("request-error-badge")).toHaveText(
    translate("en", "detail.requestError"),
  );

  const okRows = detail.locator('[data-testid="request-row"]:not([data-error])');
  await expect(okRows).toHaveCount(1);
});

test("a session with no server-tool use shows no server-tool summary", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "en" });

  await expandCostDriversSession(page, COST_DRIVERS_QUIET_SESSION_ID);

  const detail = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_QUIET_SESSION_ID}"]`,
  );
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("server-tool-summary")).toHaveCount(0);
});

test("collapsing the session removes the detail", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "en" });

  const sessionRow = await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);
  await expect(page.getByTestId("session-detail")).toHaveCount(1);

  const disclosure = sessionRow.getByTestId("session-disclosure");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await disclosure.click();

  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("session-detail")).toHaveCount(0);
  await expect(page.getByTestId("session-detail-row")).toHaveCount(0);
});
