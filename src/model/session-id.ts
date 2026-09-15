/**
 * Port of `session_id_from_cwd()` in `poc/cowork_costs.py`.
 */

/**
 * "…\\<8hex>\\outputs" → "<8hex>". Normalises backslashes to forward slashes,
 * strips trailing separators, drops a final "outputs" or "uploads" segment.
 * Returns null for null, undefined or an empty string.
 */
export function sessionIdFromCwd(cwd: string | null | undefined): string | null {
  if (!cwd) {
    return null;
  }
  const parts = cwd.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
  if (parts.length >= 2 && (parts[parts.length - 1] === "outputs" || parts[parts.length - 1] === "uploads")) {
    return parts[parts.length - 2];
  }
  return parts.length > 0 ? parts[parts.length - 1] : null;
}
