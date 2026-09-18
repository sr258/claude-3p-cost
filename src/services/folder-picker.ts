/**
 * The US-1.2 folder picker: the dialog call, the runtime scope grant, the
 * persistence, and AC 4's "no session data here" probe (S7 plan §5.5).
 *
 * Not on the US-1.6 analyser's entry list (`scan.ts`, `discovery.ts`,
 * `filesystem.ts`, `filesystem-tauri.ts`) — it is reachable only from
 * `src/state/app-state.ts`, exactly the "misses" the plan names in §8. It
 * still touches no write API: `@tauri-apps/plugin-dialog`'s `open` only
 * *reads* a path back from the user, and `grant_read_access` is the same
 * read-only-scope command `filesystem-tauri.ts` calls.
 *
 * No new walking logic: the "does this folder have session data" probe is
 * S6's `discover()`, called with a single candidate.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as pickDirectoryDialog } from "@tauri-apps/plugin-dialog";
import { normalizePath } from "../model/paths.js";
import { discover } from "./discovery.js";
import type { FileSystem } from "./filesystem.js";
import { loadManualRoots, storeManualRoots } from "./root-store.js";

export type PickOutcome =
  | { readonly kind: "cancelled" }
  | { readonly kind: "added"; readonly paths: readonly string[] }
  | { readonly kind: "no-session-data"; readonly paths: readonly string[] }
  | { readonly kind: "failed" };

/** Everything this module needs from Tauri, injected so tests need no globals. */
export interface DialogBridge {
  pickDirectories(): Promise<readonly string[] | null>;
  grantReadAccess(paths: readonly string[]): Promise<number>;
}

const defaultDialogBridge: DialogBridge = {
  pickDirectories: () => pickDirectoryDialog({ directory: true, multiple: true, recursive: true }),
  // `recursive: true` matters (S7 plan §2.5): without it, the dialog plugin
  // grants only the picked directory itself and every session subdirectory
  // stays forbidden.
  grantReadAccess: (paths) => invoke<number>("grant_read_access", { paths: [...paths] }),
};

export interface PickRootFoldersOptions {
  readonly bridge?: DialogBridge; // defaults to the real dialog plugin
}

export async function pickRootFolders(
  fs: FileSystem,
  options?: PickRootFoldersOptions,
): Promise<PickOutcome> {
  const bridge = options?.bridge ?? defaultDialogBridge;

  let picked: readonly string[] | null;
  try {
    picked = await bridge.pickDirectories();
  } catch {
    return { kind: "failed" };
  }
  if (picked === null || picked.length === 0) {
    return { kind: "cancelled" };
  }

  const normalized = [...new Set(picked.map((path) => normalizePath(path)))];

  // Restored persisted roots get their grant from `filesystem-tauri.ts` on
  // the next start; a freshly picked folder needs it now, before it is
  // probed (S7 plan §2.5).
  try {
    await bridge.grantReadAccess(normalized);
  } catch {
    return { kind: "failed" };
  }

  const withData: string[] = [];
  const withoutData: string[] = [];
  for (const path of normalized) {
    const discovery = await discover(fs, {
      candidates: [{ path, label: path, origin: "manual" }],
    });
    if (discovery.sessions.length > 0) {
      withData.push(path);
    } else {
      withoutData.push(path);
    }
  }

  if (withData.length === 0) {
    // US-1.2 AC 4: never persisted when the folder has no session data.
    return { kind: "no-session-data", paths: withoutData };
  }

  const existing = loadManualRoots();
  storeManualRoots([...existing, ...withData]);
  return { kind: "added", paths: withData };
}

/** Removes `path` from the persisted manual roots and returns the remainder. */
export function removeRoot(path: string): readonly string[] {
  const normalized = normalizePath(path);
  const remaining = loadManualRoots().filter((existing) => existing !== normalized);
  storeManualRoots(remaining);
  return remaining;
}
