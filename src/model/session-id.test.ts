import { describe, expect, it } from "vitest";
import { sessionIdFromCwd } from "./session-id.js";

describe("sessionIdFromCwd", () => {
  it("derives the directory id from a Windows cwd ending in outputs", () => {
    expect(sessionIdFromCwd("C:\\Users\\testuser\\sessions\\a1b2c3d4\\outputs")).toBe("a1b2c3d4");
  });

  it("derives it from a cwd ending in uploads", () => {
    expect(sessionIdFromCwd("C:\\Users\\testuser\\sessions\\a1b2c3d4\\uploads")).toBe("a1b2c3d4");
  });

  it("returns the last segment when there is no outputs suffix", () => {
    expect(sessionIdFromCwd("C:\\Users\\testuser\\sessions\\a1b2c3d4")).toBe("a1b2c3d4");
  });

  it("handles forward slashes and trailing separators", () => {
    expect(sessionIdFromCwd("/home/testuser/sessions/a1b2c3d4/outputs/")).toBe("a1b2c3d4");
  });

  it("returns null for null and for an empty string", () => {
    expect(sessionIdFromCwd(null)).toBeNull();
    expect(sessionIdFromCwd(undefined)).toBeNull();
    expect(sessionIdFromCwd("")).toBeNull();
  });
});
