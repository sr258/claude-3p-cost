import { describe, expect, it } from "vitest";
import { groupLabelText } from "./group-label.js";
import type { GroupLabel } from "../model/report-types.js";

describe("groupLabelText", () => {
  it("a named project uses its name", () => {
    const label: GroupLabel = {
      kind: "project",
      project: { kind: "named", spaceId: "space-1", name: "Acme Rollout" },
    };
    expect(groupLabelText(label)).toEqual({ text: "Acme Rollout" });
  });

  it("a project of kind none uses the translated label", () => {
    const label: GroupLabel = { kind: "project", project: { kind: "none" } };
    const result = groupLabelText(label);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).not.toBe("space-1");
  });

  it("an unknown spaceId is shown with the unknown marker and the raw id", () => {
    const label: GroupLabel = {
      kind: "project",
      project: { kind: "unknown", spaceId: "raw-space-id" },
    };
    const result = groupLabelText(label);
    expect(result.text).toContain("raw-space-id");
  });

  it("a folder set shows basenames and keeps the full path in the title", () => {
    const label: GroupLabel = {
      kind: "folder",
      folder: {
        kind: "folders",
        key: "k",
        folders: [
          { display: "invoices", path: "C:/Users/me/Documents/invoices", kind: "local" },
          { display: "reports", path: "C:/Users/me/Documents/reports", kind: "local" },
        ],
      },
    };
    const result = groupLabelText(label);
    expect(result.text).toBe("invoices, reports");
    expect(result.title).toBe("C:/Users/me/Documents/invoices, C:/Users/me/Documents/reports");
  });

  it("a folder ref of kind none uses the translated no-folder label", () => {
    const label: GroupLabel = { kind: "folder", folder: { kind: "none" } };
    const result = groupLabelText(label);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.title).toBeUndefined();
  });
});
