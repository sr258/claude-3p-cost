/**
 * The harness-shaped specs (S8 plan §7.2, §1): one drives the empty tree,
 * one the smoke tree. Every assertion is on an accessible role or a
 * `data-testid`, never on translated text.
 */
import { expect, test } from "@playwright/test";
import { formatCurrency } from "../src/i18n/format.js";
import { translatePlural } from "../src/i18n/translate.js";
import { gotoApp } from "./support/app.js";
import { emptyTree, smokeTree, SMOKE_TOTAL_USD } from "./fixtures/trees.js";

test("an empty tree shows the empty state with the searched locations", async ({ page }) => {
  await gotoApp(page, { tree: emptyTree, locale: "en" });

  await expect(page.getByTestId("empty-state")).toBeVisible();
  const locations = page.getByTestId("searched-locations").getByRole("listitem");
  await expect(locations).toHaveCount(4);
});

test("a multi-line audit log terminates: the fake handle returns null at EOF", async ({ page }) => {
  // The LEARNINGS trap made into a test that fails first if the fake gets it
  // wrong: a fake handle returning 0 instead of null at EOF hangs the read
  // loop in filesystem-tauri.ts, and this assertion times out rather than
  // failing cleanly — which is itself the diagnostic (plan §0.3 item 1).
  await gotoApp(page, { tree: smokeTree, locale: "en" });

  // Never a translated literal (NFR-9): the expected string comes from the
  // catalogue itself, so a catalogue edit cannot silently break the spec.
  await expect(page.getByTestId("status-sessions")).toHaveText(
    translatePlural("en", "scan.sessionCount", 1),
  );
  // The result line sits mid-file, so this cost only appears if the reader
  // consumed the whole log and stopped cleanly at EOF.
  await expect(page.getByTestId("total-row").getByTestId("cell-cost")).toHaveText(
    formatCurrency("en", SMOKE_TOTAL_USD),
  );
});
