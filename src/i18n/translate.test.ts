import { describe, expect, it } from "vitest";
import { substitute, translate, translatePlural } from "./translate.js";

describe("translate", () => {
  it("returns the German string for locale de", () => {
    expect(translate("de", "card.totalCost")).toBe("Gesamtkosten");
  });

  it("returns the English string for locale en", () => {
    expect(translate("en", "card.totalCost")).toBe("Total cost");
  });

  it("substitutes a named placeholder", () => {
    expect(translate("de", "app.version", { version: "0.1.0" })).toBe("Version 0.1.0");
  });

  it("substitutes every occurrence of a repeated placeholder", () => {
    expect(substitute("{name} and {name} again", { name: "X" })).toBe("X and X again");
  });

  it("leaves an unmatched brace untouched", () => {
    expect(substitute("{known} and {unknown}", { known: "X" })).toBe("X and {unknown}");
  });

  it("leaves an unsupplied placeholder untouched through translate itself", () => {
    // The shipped path, not just `substitute`: a params object that lacks the
    // placeholder must never render "undefined". Reachable only through a cast,
    // since the compiler requires `version` at a literal call site.
    const translateUnsafe = translate as (
      locale: "de" | "en",
      key: "app.version",
      params: Record<string, string>,
    ) => string;
    expect(translateUnsafe("de", "app.version", {})).toBe("Version {version}");
  });

  it("falls back to the key when the entry is missing at runtime", () => {
    // Only reachable through a cast — the compiler forbids passing an
    // unknown key to a literal call site. Cast the whole function, not just
    // the key, since casting a union-typed key still forces TArgs<K> to
    // distribute over every branch of TranslationKey.
    const translateUnsafe = translate as (locale: "de" | "en", key: string) => string;
    expect(translateUnsafe("de", "does.not.exist")).toBe("does.not.exist");
  });

  it("tPlural selects the one form at count 1", () => {
    expect(translatePlural("de", "card.sessionCount", 1)).toBe("1 Sitzung");
  });

  it("tPlural selects the other form at count 0 and count 2", () => {
    expect(translatePlural("de", "card.sessionCount", 0)).toBe("0 Sitzungen");
    expect(translatePlural("de", "card.sessionCount", 2)).toBe("2 Sitzungen");
  });

  it("tPlural formats the count for the active locale", () => {
    expect(translatePlural("de", "card.sessionCount", 1234)).toBe("1.234 Sitzungen");
    expect(translatePlural("en", "card.sessionCount", 1234)).toBe("1,234 sessions");
  });
});
