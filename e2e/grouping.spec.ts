/**
 * The grouping/model-panel/gap-strip path (S10 plan §7.2, §9.2, US-2.3,
 * US-2.4, US-1.5, NFR-9, NFR-11). Every assertion is on `data-testid`,
 * `data-group-key`, `data-model`, `data-share`, `data-scope`, `data-selected`,
 * `aria-pressed`, `aria-checked`, a `title` derived from an exported fixture
 * constant, or a string derived from the catalogue — never a quoted English
 * string (LEARNINGS: the translated-text trap in its easiest disguise;
 * "Network drive" and "Netzlaufwerk" must never appear quoted here).
 *
 * The gap counts asserted here are the FIXTURE's constants
 * (`GROUPING_OPEN_REQUESTS` etc.). The real reference numbers (14 open
 * requests, 0 sessions without a manifest) stay in `npm run regression` and
 * the manual `npm run dev` pass — Playwright never sees `reference-material/`,
 * which is not in Git.
 */
import { expect, test } from "@playwright/test";
import { gotoApp } from "./support/app.js";
import {
  GROUPING_APP_FOLDER_KEY,
  GROUPING_APP_FOLDER_TITLE,
  GROUPING_ARCHIVED_SESSIONS,
  GROUPING_FOLDER_GROUP_KEYS,
  GROUPING_MISSING_MANIFEST_COST_USD,
  GROUPING_NAS_FOLDER_KEY,
  GROUPING_NEBULA_SPACE_ID,
  GROUPING_NO_FOLDER_KEY,
  GROUPING_ONE_TWO_FOLDER_KEY,
  GROUPING_OPEN_REQUESTS,
  GROUPING_PROJECT_GROUP_KEYS,
  GROUPING_QUARTZ_NAME,
  GROUPING_QUARTZ_SPACE_ID,
  GROUPING_SESSIONS_WITHOUT_MANIFEST,
  groupingTree,
} from "./fixtures/trees.js";

// `GROUPING_NO_FOLDER_KEY` and `GROUPING_ONE_TWO_FOLDER_KEY` both contain a
// literal U+0000: CSS tokenises a NUL byte in a selector as U+FFFD, so a
// `[data-group-key="..."]` attribute selector can never match either of
// them. Both fixture keys have a known, fixed position in
// `GROUPING_FOLDER_GROUP_KEYS` instead (plan §8's exported constants), so
// locating them by row index sidesteps the CSS/NUL interaction entirely.
function folderRowByKey(page: import("@playwright/test").Page, key: string) {
  return page.getByTestId("group-row").nth(GROUPING_FOLDER_GROUP_KEYS.indexOf(key as never));
}

test("switching to folder grouping replaces the project buckets with folder buckets", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  await expect(page.getByTestId("group-row")).toHaveCount(GROUPING_PROJECT_GROUP_KEYS.length);

  await page.getByTestId("grouping-folder").click();

  await expect(page.getByTestId("group-row")).toHaveCount(GROUPING_FOLDER_GROUP_KEYS.length);
  const keys = await page
    .getByTestId("group-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-group-key")));
  expect(keys).toEqual([...GROUPING_FOLDER_GROUP_KEYS]);
});

test("the folder grouping produces a different row count and order than the project grouping", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const projectKeys = await page
    .getByTestId("group-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-group-key")));
  expect(projectKeys).toEqual([...GROUPING_PROJECT_GROUP_KEYS]);

  await page.getByTestId("grouping-folder").click();

  const folderKeys = await page
    .getByTestId("group-row")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-group-key")));
  expect(folderKeys).toEqual([...GROUPING_FOLDER_GROUP_KEYS]);
  expect(folderKeys).not.toEqual(projectKeys);
  expect(folderKeys.length).not.toBe(projectKeys.length);
});

test("sessions with no connected folder appear in the no-folder bucket", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });
  await page.getByTestId("grouping-folder").click();

  const noFolderRow = folderRowByKey(page, GROUPING_NO_FOLDER_KEY);
  await expect(noFolderRow).toHaveAttribute("data-group-key", GROUPING_NO_FOLDER_KEY);
  await expect(noFolderRow.getByTestId("cell-group-sessions")).toHaveText("1");
});

test("a network-drive folder group carries the network badge and a local one does not", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });
  await page.getByTestId("grouping-folder").click();

  const nasRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_NAS_FOLDER_KEY}"]`,
  );
  await expect(nasRow.getByTestId("network-drive-badge")).toHaveCount(1);

  const appRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_APP_FOLDER_KEY}"]`,
  );
  await expect(appRow.getByTestId("network-drive-badge")).toHaveCount(0);
});

test("the full folder path is available as hover text and never as visible row text", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });
  await page.getByTestId("grouping-folder").click();

  const appRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_APP_FOLDER_KEY}"]`,
  );
  const part = appRow.getByTestId("folder-part").first();
  await expect(part).toHaveAttribute("title", GROUPING_APP_FOLDER_TITLE);
  expect(await part.textContent()).not.toBe(GROUPING_APP_FOLDER_TITLE);
});

test("the first column header changes with the grouping", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const table = page.getByTestId("overview-table");
  const headerBefore = await table.locator("thead th").first().textContent();

  await page.getByTestId("grouping-folder").click();
  const headerAfter = await table.locator("thead th").first().textContent();

  expect(headerAfter).not.toBe(headerBefore);
});

test("expansion is independent per grouping", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const nebulaRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_NEBULA_SPACE_ID}"]`,
  );
  await nebulaRow.getByTestId("group-disclosure").click();
  await expect(page.getByTestId("session-table")).toHaveCount(1);

  await page.getByTestId("grouping-folder").click();
  await expect(page.getByTestId("session-table")).toHaveCount(0);

  await page.getByTestId("grouping-project").click();
  await expect(page.getByTestId("session-table")).toHaveCount(1);
});

test("the panel opens on the global scope and lists both model variants separately", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const panel = page.getByTestId("model-panel");
  await expect(panel).toHaveAttribute("data-scope", "all");
  await expect(panel.locator('[data-testid="model-row"][data-model="claude-opus-5"]')).toHaveCount(
    1,
  );
  await expect(
    panel.locator('[data-testid="model-row"][data-model="claude-opus-5[1m]"]'),
  ).toHaveCount(1);
});

test("selecting a group scopes the panel to that group", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const quartzRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_QUARTZ_SPACE_ID}"]`,
  );
  await quartzRow.getByTestId("scope-select").click();

  const panel = page.getByTestId("model-panel");
  await expect(panel).toHaveAttribute("data-scope", "group");
  // ModelScope (plan §6.4) carries only a display `label`, never the raw
  // group key -- `data-scope-key` therefore mirrors the label shown in
  // `model-scope-label`, not `GROUPING_QUARTZ_SPACE_ID`.
  await expect(panel).toHaveAttribute("data-scope-key", GROUPING_QUARTZ_NAME);
  await expect(quartzRow.getByTestId("scope-select")).toHaveAttribute("aria-pressed", "true");
  await expect(quartzRow).toHaveAttribute("data-selected", "true");

  // Quartz's mix (sonnet only + an unattributed remainder) differs from the
  // global mix (also carries both opus variants) — proof the panel is really
  // scoped, not just always showing the global breakdown.
  await expect(
    panel.locator('[data-testid="model-row"][data-model="claude-sonnet-5"]'),
  ).toHaveCount(1);
  await expect(panel.locator('[data-testid="model-row"][data-model="claude-opus-5"]')).toHaveCount(
    0,
  );
  await expect(panel.getByTestId("model-unattributed-row")).toHaveCount(1);
});

test("selecting the same group again returns the panel to the global scope", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const nebulaRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_NEBULA_SPACE_ID}"]`,
  );
  await nebulaRow.getByTestId("scope-select").click();
  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "group");

  await nebulaRow.getByTestId("scope-select").click();
  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "all");
  await expect(nebulaRow.getByTestId("scope-select")).toHaveAttribute("aria-pressed", "false");
});

test("the panel reset control returns to the global scope", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const nebulaRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_NEBULA_SPACE_ID}"]`,
  );
  await nebulaRow.getByTestId("scope-select").click();
  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "group");

  await page.getByTestId("scope-reset").click();
  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "all");
});

test("the panel scope is independent of which groups are expanded", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  const nebulaRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_NEBULA_SPACE_ID}"]`,
  );
  await nebulaRow.getByTestId("group-disclosure").click();
  await expect(page.getByTestId("model-panel")).toHaveAttribute("data-scope", "all");

  const quartzRow = page.locator(
    `[data-testid="group-row"][data-group-key="${GROUPING_QUARTZ_SPACE_ID}"]`,
  );
  await quartzRow.getByTestId("scope-select").click();
  await expect(page.getByTestId("model-panel")).toHaveAttribute(
    "data-scope-key",
    GROUPING_QUARTZ_NAME,
  );
  // Nebula's disclosure is still open; selecting quartz did not touch it.
  await expect(nebulaRow.getByTestId("group-disclosure")).toHaveAttribute("aria-expanded", "true");
});

test("closing the panel removes it from the DOM and the toolbar control reopens it", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  await expect(page.getByTestId("model-panel")).toHaveCount(1);
  await page.getByTestId("model-panel-close").click();
  await expect(page.getByTestId("model-panel")).toHaveCount(0);

  await page.getByTestId("model-panel-open").click();
  await expect(page.getByTestId("model-panel")).toHaveCount(1);
});

test("the gap indicators are visible on the main view with the fixture counts", async ({
  page,
}) => {
  await gotoApp(page, { tree: groupingTree, locale: "en" });

  await expect(page.getByTestId("gap-open-requests")).toContainText(String(GROUPING_OPEN_REQUESTS));
  await expect(page.getByTestId("gap-sessions-without-manifest")).toContainText(
    String(GROUPING_SESSIONS_WITHOUT_MANIFEST),
  );
  await expect(page.getByTestId("gap-sessions-without-manifest")).toContainText(
    GROUPING_MISSING_MANIFEST_COST_USD.toFixed(2),
  );
  await expect(page.getByTestId("gap-archived-sessions")).toContainText(
    String(GROUPING_ARCHIVED_SESSIONS),
  );
});

test("the grouping path in German", async ({ page }) => {
  await gotoApp(page, { tree: groupingTree, locale: "de" });

  await expect(page.getByTestId("group-row")).toHaveCount(GROUPING_PROJECT_GROUP_KEYS.length);

  await page.getByTestId("grouping-folder").click();
  await expect(page.getByTestId("group-row")).toHaveCount(GROUPING_FOLDER_GROUP_KEYS.length);

  const oneTwoRow = folderRowByKey(page, GROUPING_ONE_TWO_FOLDER_KEY);
  await expect(oneTwoRow).toHaveAttribute("data-group-key", GROUPING_ONE_TWO_FOLDER_KEY);
});
