/**
 * Tolerant coercion helpers. Audit log fields arrive as `unknown` JSON values
 * that may be absent, `null`, the wrong type, or non-finite; these functions
 * turn that into a value the parser can use without a defensive `?? 0` at
 * every call site (S3 §4.2).
 */

/** Finite number → truncated integer. Anything else (undefined, null, NaN, a string) → 0. */
export function toInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value);
}

/** Finite USD amount → integer micro-USD via Math.round(value * 1e6). Anything else → 0. */
export function toMicroUsd(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1e6);
}

/** JavaScript truthiness, narrowed to a boolean. */
export function toBool(value: unknown): boolean {
  return Boolean(value);
}

/** A non-empty string → itself. Anything else → null. */
export function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
