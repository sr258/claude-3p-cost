/**
 * US-2.4's folder bucketing (S5 plan §4.4, §2 Q4). One bucket per folder SET,
 * keyed on `path` (falling back to `display`), in manifest order -- sorting
 * would read nicer but would also let two differently-ordered sessions merge
 * into one bucket, which is not the invariant this buys.
 */
import type { ConnectedFolder, FolderRef } from "./project-types.js";

const NUL = "\u0000";

/** The no-folder bucket. NUL-prefixed so no real path can collide with it. */
export const NO_FOLDER_KEY = `${NUL}none`;

/**
 * A session's folder set as one bucket. Manifest order is preserved, not
 * sorted -- see plan section 2 Q4. Key segments are `path`, falling back to
 * `display`, joined with NUL -- not legal in a JSON-sourced path, the same
 * collision-proofing `project-assignment.ts` uses for `projectKey`.
 */
export function folderRefOf(folders: readonly ConnectedFolder[]): FolderRef {
  if (folders.length === 0) {
    return { kind: "none" };
  }
  const key = folders.map((f) => f.path ?? f.display).join(NUL);
  return { kind: "folders", key, folders };
}

export function folderKey(ref: FolderRef): string {
  return ref.kind === "none" ? NO_FOLDER_KEY : ref.key;
}
