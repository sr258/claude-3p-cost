/**
 * US-4.2's JSON export/import transport (S15 plan §5.4, §0.2, Q7). The
 * three-way branch — packaged Tauri, `npm run dev` browser, Playwright
 * `--mode e2e` — lives here and nowhere else, on the SAME
 * `"__TAURI_INTERNALS__" in globalThis` predicate `createFileSystem()`
 * already uses (`src/services/filesystem.ts`) rather than a second,
 * divergent detection rule.
 *
 * The write NEVER goes through `@tauri-apps/plugin-fs` (Q7): `dialog.save()`
 * returns a path string, and the actual bytes cross the IPC boundary through
 * `invoke("write_export_file", …)` / `invoke("read_import_file", …)` —
 * two Rust commands (`src-tauri/src/lib.rs`) that enforce the session-root
 * exclusion against the real filesystem. This keeps the `fs:` permission
 * list in `src-tauri/capabilities/default.json` and the assertions in
 * `read-only-guarantee.test.ts` untouched: this module never imports
 * `@tauri-apps/plugin-fs` at all.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

export type ExportOutcome =
  { readonly kind: "saved" } | { readonly kind: "cancelled" } | { readonly kind: "failed" };
export type ImportOutcome =
  | { readonly kind: "loaded"; readonly text: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed" };

const JSON_FILTER = { name: "JSON", extensions: ["json"] };

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in globalThis;
}

/** `npm run dev`'s browser transport: a Blob + a synthetic `<a download>`. No filesystem, no Tauri. */
function saveJsonInBrowser(suggestedName: string, contents: string): ExportOutcome {
  try {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { kind: "saved" };
  } catch {
    return { kind: "failed" };
  }
}

/** `npm run dev`'s browser transport: a hidden `<input type="file">` + `File.text()`. */
function loadJsonInBrowser(): Promise<ImportOutcome> {
  return new Promise((resolve) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.style.display = "none";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        document.body.removeChild(input);
        if (!file) {
          resolve({ kind: "cancelled" });
          return;
        }
        file
          .text()
          .then((text) => resolve({ kind: "loaded", text }))
          .catch(() => resolve({ kind: "failed" }));
      });
      // A cancelled native picker fires no "change" and no reliable event
      // this widget can await; browsers vary on "cancel" support, so a
      // caller that needs to distinguish "cancelled" here would need a
      // focus-return heuristic. Out of scope for the dev-only transport.
      document.body.appendChild(input);
      input.click();
    } catch {
      resolve({ kind: "failed" });
    }
  });
}

/**
 * Saves `contents` under `suggestedName`. Packaged Tauri (and `--mode e2e`,
 * which installs `__TAURI_INTERNALS__` and runs against the aliased fakes):
 * `dialog.save()` for the path, `invoke("write_export_file", …)` for the
 * bytes. Plain browser dev: a download anchor. Never throws (NFR-3).
 */
export async function saveJson(suggestedName: string, contents: string): Promise<ExportOutcome> {
  if (!isTauri()) {
    return saveJsonInBrowser(suggestedName, contents);
  }
  try {
    const path = await saveDialog({ filters: [JSON_FILTER], defaultPath: suggestedName });
    if (path === null || path === undefined) {
      return { kind: "cancelled" };
    }
    await invoke("write_export_file", { path, contents });
    return { kind: "saved" };
  } catch {
    return { kind: "failed" };
  }
}

/** The counterpart to `saveJson` — `dialog.open()` + `invoke("read_import_file", …)` under Tauri. */
export async function loadJson(): Promise<ImportOutcome> {
  if (!isTauri()) {
    return loadJsonInBrowser();
  }
  try {
    const path = await openDialog({ multiple: false, filters: [JSON_FILTER] });
    if (path === null || path === undefined || Array.isArray(path)) {
      return { kind: "cancelled" };
    }
    const text = await invoke<string>("read_import_file", { path });
    return { kind: "loaded", text };
  } catch {
    return { kind: "failed" };
  }
}
