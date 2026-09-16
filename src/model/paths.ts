/**
 * The one address-normalisation boundary (S6 plan §2 Q6, §6). This module
 * normalises strings this application constructs and hands back to a
 * `FileSystem` — never display data read out of manifest JSON, which stays
 * `manifest.ts`'s private `normalizePath`/`basename` pair.
 *
 * Filenames are opaque bytes: this file never calls
 * `String.prototype.normalize()`. No `node:path`, no I/O, no clock.
 */

const BACKSLASH_RE = /\\/g;

/**
 * Backslashes -> "/", repeated separators collapsed EXCEPT a leading "//"
 * (a UNC prefix), one trailing separator stripped. Never resolves "." or
 * ".."; never calls `String.prototype.normalize()`.
 */
export function normalizePath(raw: string): string {
  const slashed = raw.replace(BACKSLASH_RE, "/");
  const isUnc = slashed.startsWith("//");
  const rest = isUnc ? slashed.slice(2) : slashed;
  const collapsedRest = rest.replace(/\/+/g, "/");
  let result = isUnc ? `//${collapsedRest}` : collapsedRest;

  const isBareUncRoot = isUnc && result.length === 2;
  if (result.length > 1 && result.endsWith("/") && !isBareUncRoot) {
    result = result.slice(0, -1);
  }
  return result;
}

/** Joins normalised segments with "/". An empty base yields the first segment unprefixed. */
export function joinPath(base: string, ...segments: string[]): string {
  return [base, ...segments].filter((part) => part.length > 0).join("/");
}

export function pathSegments(path: string): readonly string[] {
  return Object.freeze(path.split("/").filter((segment) => segment.length > 0));
}

/** Last segment of a normalised path; "" for "" and for "/". */
export function pathBasename(path: string): string {
  const segments = pathSegments(path);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

const DRIVE_LETTER_RE = /^[A-Za-z]:/;

/**
 * True for an absolute path, a drive-letter prefix, a NUL byte, or any
 * segment exactly "." or ".." — and FALSE for a legal name such as "..foo"
 * or "a.b". `..` and `.` are rejected, never resolved.
 */
export function isUnsafeRelativePath(path: string): boolean {
  if (path.includes("\u0000")) {
    return true;
  }
  if (path.startsWith("/") || path.startsWith("\\")) {
    return true;
  }
  if (DRIVE_LETTER_RE.test(path)) {
    return true;
  }
  const rawSegments = path.replace(BACKSLASH_RE, "/").split("/");
  for (const segment of rawSegments) {
    if (segment === "." || segment === "..") {
      return true;
    }
  }
  return false;
}
