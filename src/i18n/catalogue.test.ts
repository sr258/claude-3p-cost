import { describe, expect, it } from "vitest";
import { de } from "./de.js";
import { en } from "./en.js";

function extractPlaceholders(value: string): Set<string> {
  const matches = value.matchAll(/\{([^{}]+)\}/g);
  return new Set(Array.from(matches, (m) => m[1]));
}

describe("catalogue", () => {
  it("de and en expose identical key sets", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it("every value is a non-empty string", () => {
    for (const catalogue of [de, en]) {
      for (const [key, value] of Object.entries(catalogue)) {
        expect(typeof value, `${key} should be a string`).toBe("string");
        expect((value as string).length, `${key} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("placeholders match between de and en for every key", () => {
    for (const key of Object.keys(de) as (keyof typeof de)[]) {
      const dePlaceholders = extractPlaceholders(de[key]);
      const enPlaceholders = extractPlaceholders(en[key]);
      expect(enPlaceholders, `placeholder mismatch for key "${key}"`).toEqual(dePlaceholders);
    }
  });

  it("no value contains an unclosed brace", () => {
    for (const catalogue of [de, en]) {
      for (const [key, value] of Object.entries(catalogue)) {
        const opens = (value.match(/\{/g) ?? []).length;
        const closes = (value.match(/\}/g) ?? []).length;
        expect(opens, `unbalanced braces in "${key}"`).toBe(closes);
      }
    }
  });

  it("every .one key has a matching .other key", () => {
    const keys = Object.keys(de);
    const oneKeys = keys.filter((k) => k.endsWith(".one"));
    for (const oneKey of oneKeys) {
      const base = oneKey.slice(0, -".one".length);
      expect(keys, `"${base}.other" missing for "${oneKey}"`).toContain(`${base}.other`);
    }
  });
});
