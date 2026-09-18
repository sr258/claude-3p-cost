/**
 * The only place where the model's `{ kind: "none" }` and `{ kind: "unknown" }`
 * project labels, and the folder ref's `{ kind: "none" }` label, become
 * translated text (S8 plan §6.3). Pure — no DOM, no signals — so `S10`'s
 * folder grouping needs no change here: a `{ kind: "folders" }` label already
 * renders basenames joined for display and carries the joined full paths as
 * `title`.
 */
import { isNetworkDrive } from "../model/folder-grouping.js";
import { pathBasename } from "../model/paths.js";
import { t } from "../i18n/index.js";
import type { GroupLabel } from "../model/report-types.js";

export interface GroupLabelPart {
  /** Basename, or the translated project label. Never a path. */
  readonly text: string;
  /** Full path -- HOVER ONLY (NFR-6). S19 MUST strip it from exports. */
  readonly title?: string;
  readonly isNetworkDrive: boolean;
}

export interface GroupLabelText {
  /** The parts' text joined with ", ". */
  readonly text: string;
  /** The parts' titles joined with ", ". */
  readonly title?: string;
  readonly parts: readonly GroupLabelPart[];
}

export function groupLabelText(label: GroupLabel): GroupLabelText {
  if (label.kind === "project") {
    const project = label.project;
    let text: string;
    if (project.kind === "none") {
      text = t("overview.noProject");
    } else if (project.kind === "named") {
      text = project.name;
    } else {
      text = t("overview.unknownProject", { spaceId: project.spaceId });
    }
    return { text, parts: [{ text, isNetworkDrive: false }] };
  }

  const folder = label.folder;
  if (folder.kind === "none") {
    const text = t("overview.noFolder");
    return { text, parts: [{ text, isNetworkDrive: false }] };
  }
  const parts: GroupLabelPart[] = folder.folders.map((f) => ({
    text: pathBasename(f.path ?? f.display),
    title: f.path ?? f.display,
    isNetworkDrive: isNetworkDrive(f),
  }));
  const text = parts.map((p) => p.text).join(", ");
  const title = parts.map((p) => p.title).join(", ");
  return { text, title, parts };
}
