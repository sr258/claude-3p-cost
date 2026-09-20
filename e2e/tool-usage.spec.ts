/**
 * US-3.2's tool-usage section on the session detail (S12 plan §6, NFR-9).
 * Assertions are on `data-testid`, `data-tool`, or values derived from the
 * catalogue -- except tool NAMES, which are data, not UI text, so asserting
 * them literally is correct here, not the translated-text trap (LEARNINGS).
 */
import { expect, test } from "@playwright/test";
import { translate } from "../src/i18n/translate.js";
import { gotoApp } from "./support/app.js";
import {
  COST_DRIVERS_QUIET_SESSION_ID,
  COST_DRIVERS_SESSION_ID,
  COST_DRIVERS_SPACE_ID,
  COST_DRIVERS_TOOL_NAMES_RANKED,
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

test("the session detail lists tool chips in ranked order", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "en" });
  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detail = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  await expect(detail).toBeVisible();

  const chips = detail.getByTestId("tool-chip");
  // DOM order IS the rank (S12 plan §2 Q4) -- "Bash" (3 calls) before "Read" (1 call).
  const names = await chips.evaluateAll((els) => els.map((el) => el.getAttribute("data-tool")));
  expect(names).toEqual([...COST_DRIVERS_TOOL_NAMES_RANKED]);
});

test("the tool-usage note comes from the catalogue in both locales", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "de" });
  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detailDe = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  await expect(detailDe.getByTestId("tool-usage-note")).toHaveText(
    translate("de", "detail.tools.note"),
  );

  await gotoApp(page, { tree: costDriversTree, locale: "en" });
  await expandCostDriversSession(page, COST_DRIVERS_SESSION_ID);

  const detailEn = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_SESSION_ID}"]`,
  );
  await expect(detailEn.getByTestId("tool-usage-note")).toHaveText(
    translate("en", "detail.tools.note"),
  );
});

test("a session with no tool calls shows the empty state", async ({ page }) => {
  await gotoApp(page, { tree: costDriversTree, locale: "en" });
  await expandCostDriversSession(page, COST_DRIVERS_QUIET_SESSION_ID);

  const detail = page.locator(
    `[data-testid="session-detail"][data-session-id="${COST_DRIVERS_QUIET_SESSION_ID}"]`,
  );
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("tool-usage-empty")).toHaveText(
    translate("en", "detail.tools.empty"),
  );
  await expect(detail.getByTestId("tool-usage-note")).toHaveCount(0);
  await expect(detail.getByTestId("tool-chip")).toHaveCount(0);
});
