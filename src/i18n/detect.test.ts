import { describe, expect, it } from "vitest";
import { detectLocale } from "./detect.js";

describe("detectLocale", () => {
  it("de, de-DE and de-AT yield German", () => {
    expect(detectLocale(["de"])).toBe("de");
    expect(detectLocale(["de-DE"])).toBe("de");
    expect(detectLocale(["de-AT"])).toBe("de");
  });

  it("matches the primary subtag case-insensitively", () => {
    expect(detectLocale(["DE-ch"])).toBe("de");
  });

  it("en-GB yields English", () => {
    expect(detectLocale(["en-GB"])).toBe("en");
  });

  it("fr-FR yields English", () => {
    expect(detectLocale(["fr-FR"])).toBe("en");
  });

  it("an empty candidate list yields English", () => {
    expect(detectLocale([])).toBe("en");
  });
});
