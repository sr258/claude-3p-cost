import { describe, expect, it } from "vitest";
import { groupLabelText } from "./group-label.js";
import type { GroupLabel } from "../model/report-types.js";

describe("groupLabelText", () => {
  it("a named project uses its name", () => {
    const label: GroupLabel = {
      kind: "project",
      project: { kind: "named", spaceId: "space-1", name: "Acme Rollout" },
    };
    expect(groupLabelText(label)).toEqual({
      text: "Acme Rollout",
      parts: [{ text: "Acme Rollout", isNetworkDrive: false }],
    });
  });

  it("a project of kind none uses the translated label", () => {
    const label: GroupLabel = { kind: "project", project: { kind: "none" } };
    const result = groupLabelText(label);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text).not.toBe("space-1");
  });

  it("a project label exposes a single unmarked part with no title", () => {
    const label: GroupLabel = {
      kind: "project",
      project: { kind: "named", spaceId: "space-1", name: "Acme Rollout" },
    };
    const result = groupLabelText(label);
    expect(result.parts).toEqual([{ text: "Acme Rollout", isNetworkDrive: false }]);
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

  it("a network-drive folder part is marked and a local one is not", () => {
    const label: GroupLabel = {
      kind: "folder",
      folder: {
        kind: "folders",
        key: "k",
        folders: [{ display: "share", path: "//nas/share", kind: "network-drive" }],
      },
    };
    const result = groupLabelText(label);
    expect(result.parts).toEqual([{ text: "share", title: "//nas/share", isNetworkDrive: true }]);

    const localLabel: GroupLabel = {
      kind: "folder",
      folder: {
        kind: "folders",
        key: "k2",
        folders: [{ display: "src", path: "/home/me/src", kind: "local" }],
      },
    };
    expect(groupLabelText(localLabel).parts[0]!.isNetworkDrive).toBe(false);
  });

  it("a folder set mixing kinds marks only the network-drive part", () => {
    const label: GroupLabel = {
      kind: "folder",
      folder: {
        kind: "folders",
        key: "k",
        folders: [
          { display: "local-src", path: "/home/me/local-src", kind: "local" },
          { display: "share", path: "//nas/share", kind: "network-drive" },
        ],
      },
    };
    const result = groupLabelText(label);
    expect(result.parts.map((p) => p.isNetworkDrive)).toEqual([false, true]);
  });

  it("the joined text and title are unchanged from S8", () => {
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
});
