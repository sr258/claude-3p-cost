import type { Locale } from "./types.js";

/**
 * Returns "de" if the first candidate's primary subtag is "de"
 * (case-insensitive: "de", "de-DE", "de-AT", "DE-ch" all match), otherwise
 * "en". An empty or malformed list yields "en". Takes the candidate list as
 * an argument rather than reading `navigator` itself, so it stays testable.
 */
export function detectLocale(candidates: readonly string[]): Locale {
  const first = candidates[0];
  if (!first) {
    return "en";
  }
  const primarySubtag = first.split("-")[0]?.toLowerCase();
  return primarySubtag === "de" ? "de" : "en";
}
