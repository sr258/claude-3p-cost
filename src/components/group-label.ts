/**
 * The only place where the model's `{ kind: "none" }` and `{ kind: "unknown" }`
 * project labels, and the folder ref's `{ kind: "none" }` label, become
 * translated text (S8 plan §6.3). Pure — no DOM, no signals — so `S10`'s
 * folder grouping needs no change here: a `{ kind: "folders" }` label already
 * renders basenames joined for display and carries the joined full paths as
 * `title`.
 */
import { pathBasename } from "../model/paths.js";
import { t } from "../i18n/index.js";
import type { GroupLabel } from "../model/report-types.js";

export interface GroupLabelText {
  readonly text: string;
  /** Hover only (NFR-6). The full folder path; S19 MUST strip it from exports. */
  readonly title?: string;
}

export function groupLabelText(label: GroupLabel): GroupLabelText {
  if (label.kind === "project") {
    const project = label.project;
    if (project.kind === "none") {
      return { text: t("overview.noProject") };
    }
    if (project.kind === "named") {
      return { text: project.name };
    }
    return { text: t("overview.unknownProject", { spaceId: project.spaceId }) };
  }

  const folder = label.folder;
  if (folder.kind === "none") {
    return { text: t("overview.noFolder") };
  }
  const names = folder.folders.map((f) => pathBasename(f.path ?? f.display));
  const paths = folder.folders.map((f) => f.path ?? f.display);
  return { text: names.join(", "), title: paths.join(", ") };
}
