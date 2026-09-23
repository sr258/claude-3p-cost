/**
 * US-4.2's price table editor — the session's exit spec (S15 plan §6).
 * Every assertion is on an accessible role, a `data-testid`, or a value
 * derived from `translate()` / `formatNumber()` / `formatDate()` — never on
 * quoted English text, so the German spec at the bottom exercises the same
 * file as the rest.
 *
 * `overviewTree` (from `fixtures/trees.ts`) is reused rather than a new
 * fixture: its "nebula" session already carries BOTH `claude-opus-5` and
 * `claude-opus-5[1m]` in one `modelUsage` map — exactly the base/[1m]
 * independence this spec needs, invented for S12 and untouched here.
 */
import { expect, test, type Page } from "@playwright/test";
import { translate } from "../src/i18n/translate.js";
import { gotoApp } from "./support/app.js";
import { overviewTree } from "./fixtures/trees.js";

async function gotoPrices(page: Page, locale: "de" | "en" = "en"): Promise<void> {
  await gotoApp(page, { tree: overviewTree, locale });
  await page.getByTestId("nav-prices").click();
  await page.getByTestId("price-table-editor").waitFor();
}

test("edits a price, reloads, and the value persists", async ({ page }) => {
  await gotoPrices(page);

  const input = page.getByTestId("price-input-claude-opus-5-input");
  await input.fill("6.5");
  await input.press("Enter");
  await expect(input).toHaveAttribute("data-edited", "true");

  // "Restart" is a reload, same origin, same localStorage (LEARNINGS-style
  // e2e convention already used elsewhere in this harness).
  await page.reload();
  await page.getByTestId("app-shell").waitFor();
  await page.getByTestId("nav-prices").click();
  await page.getByTestId("price-table-editor").waitFor();

  const reloadedInput = page.getByTestId("price-input-claude-opus-5-input");
  await expect(reloadedInput).toHaveValue("6.5");
  await expect(reloadedInput).toHaveAttribute("data-edited", "true");
});

test("resets a row and the shipped default returns, with the edited marker gone", async ({
  page,
}) => {
  await gotoPrices(page);

  const input = page.getByTestId("price-input-claude-opus-5-input");
  await input.fill("9.99");
  await input.press("Enter");
  await expect(input).toHaveAttribute("data-edited", "true");

  await page.getByTestId("price-reset-claude-opus-5").click();

  await expect(input).toHaveValue("5");
  await expect(input).toHaveAttribute("data-edited", "false");
  await expect(page.getByTestId("price-reset-claude-opus-5")).toHaveCount(0);
});

test("resets the whole table", async ({ page }) => {
  await gotoPrices(page);

  await page.getByTestId("price-input-claude-opus-5-input").fill("1");
  await page.getByTestId("price-input-claude-opus-5-input").press("Enter");
  await page.getByTestId("price-input-claude-opus-5[1m]-output").fill("2");
  await page.getByTestId("price-input-claude-opus-5[1m]-output").press("Enter");

  await page.getByTestId("price-reset-all").click();
  await page.getByTestId("price-confirm-reset-all-yes").click();

  await expect(page.getByTestId("price-input-claude-opus-5-input")).toHaveValue("5");
  await expect(page.getByTestId("price-input-claude-opus-5[1m]-output")).toHaveValue("25");
  await expect(page.getByTestId("price-row")).toHaveCount(2);
  for (const row of await page.getByTestId("price-row").all()) {
    const model = await row.getAttribute("data-model");
    expect(model).not.toBeNull();
  }
});

test("the base model and the [1m] variant are independently editable", async ({ page }) => {
  await gotoPrices(page);

  const baseInput = page.getByTestId("price-input-claude-opus-5-input");
  const longContextInput = page.getByTestId("price-input-claude-opus-5[1m]-input");

  await baseInput.fill("4");
  await baseInput.press("Enter");

  await expect(baseInput).toHaveValue("4");
  await expect(longContextInput).toHaveValue("5"); // untouched, still the default
  await expect(longContextInput).toHaveAttribute("data-edited", "false");
});

test("exports JSON to the save sink and the file content round-trips", async ({ page }) => {
  await gotoPrices(page);

  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__C3P_E2E_SAVE_PATH__ = "export.json";
  });

  await page.getByTestId("price-export").click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const sink = (window as unknown as Record<string, unknown>).__C3P_E2E_SAVED__ as
          Record<string, string> | undefined;
        return sink?.["export.json"] !== undefined;
      }),
    )
    .toBe(true);

  const saved = await page.evaluate(() => {
    const sink = (window as unknown as Record<string, unknown>).__C3P_E2E_SAVED__ as Record<
      string,
      string
    >;
    return sink["export.json"]!;
  });
  const parsed = JSON.parse(saved) as { format: string; prices: Record<string, unknown> };
  expect(parsed.format).toBe("claude3pcost.prices");
  expect(parsed.prices["claude-opus-5"]).toBeDefined();
});

test("imports JSON from the sink and the table updates", async ({ page }) => {
  await gotoPrices(page);

  const importDoc = JSON.stringify({
    format: "claude3pcost.prices",
    version: 1,
    currency: "USD",
    unit: "USD per 1M tokens",
    prices: {
      "claude-opus-5": {
        input: 7.5,
        output: 25,
        cacheWrite5m: 6.25,
        cacheWrite1h: 10,
        cacheRead: 0.5,
      },
      "claude-opus-5[1m]": {
        input: 5,
        output: 25,
        cacheWrite5m: 6.25,
        cacheWrite1h: 10,
        cacheRead: 0.5,
      },
    },
  });
  await page.evaluate((doc) => {
    (window as unknown as Record<string, unknown>).__C3P_E2E_OPEN_PATH__ = "import.json";
    (window as unknown as Record<string, unknown>).__C3P_E2E_SAVED__ = { "import.json": doc };
  }, importDoc);

  await page.getByTestId("price-import").click();
  await page.getByTestId("price-confirm-import-yes").click();

  await expect(page.getByTestId("price-input-claude-opus-5-input")).toHaveValue("7.5");
  await expect(page.getByTestId("price-input-claude-opus-5-input")).toHaveAttribute(
    "data-edited",
    "true",
  );
});

test("importing a file that omits a previously edited model drops that override", async ({
  page,
}) => {
  await gotoPrices(page);

  const input = page.getByTestId("price-input-claude-opus-5-input");
  await input.fill("1.23");
  await input.press("Enter");
  await expect(input).toHaveAttribute("data-edited", "true");

  // The imported file mentions ONLY the [1m] variant — replace semantics
  // (Q4) must drop the base model's override entirely, not merge over it.
  const importDoc = JSON.stringify({
    format: "claude3pcost.prices",
    version: 1,
    currency: "USD",
    unit: "USD per 1M tokens",
    prices: {
      "claude-opus-5[1m]": {
        input: 5,
        output: 25,
        cacheWrite5m: 6.25,
        cacheWrite1h: 10,
        cacheRead: 0.5,
      },
    },
  });
  await page.evaluate((doc) => {
    (window as unknown as Record<string, unknown>).__C3P_E2E_OPEN_PATH__ = "import2.json";
    (window as unknown as Record<string, unknown>).__C3P_E2E_SAVED__ = { "import2.json": doc };
  }, importDoc);

  await page.getByTestId("price-import").click();
  await page.getByTestId("price-confirm-import-yes").click();

  await expect(input).toHaveValue("5"); // back to the shipped default
  await expect(input).toHaveAttribute("data-edited", "false");
});

test("runs the price editor in German", async ({ page }) => {
  await gotoPrices(page, "de");

  await expect(page.getByTestId("price-table-editor")).toBeVisible();
  await expect(page.getByTestId("nav-prices")).toHaveText(translate("de", "nav.prices"));
  await expect(page.getByTestId("price-reset-all")).toHaveText(translate("de", "prices.resetAll"));
});
