/**
 * US-1.1's candidate root list (S6 plan §4.2). Pure: no `process.env`, no
 * I/O. Callers supply the environment; that keeps this module testable
 * without mocking the host.
 */
import { joinPath, normalizePath } from "./paths.js";

export type HostPlatform = "windows" | "macos" | "linux";

export interface HostEnvironment {
  readonly platform: HostPlatform;
  readonly localAppData: string | null; // %LOCALAPPDATA%
  readonly appData: string | null; // %APPDATA%
  readonly home: string | null;
}

export interface RootCandidate {
  /** Passed back to the FileSystem verbatim; opaque to every caller. */
  readonly path: string;
  /** For display and for the US-1.1 empty state: the UNEXPANDED form. */
  readonly label: string;
  readonly origin: "auto" | "manual";
}

function candidateOrNull(
  base: string | null,
  labelPrefix: string,
  segments: readonly string[],
): RootCandidate | null {
  if (!base) {
    return null;
  }
  return {
    path: joinPath(normalizePath(base), ...segments),
    label: `${labelPrefix}\\${segments.join("\\")}`,
    origin: "auto",
  };
}

/**
 * US-1.1's five paths, in order. A candidate whose variable is null or
 * empty is omitted entirely — never joined into a bogus relative path.
 */
export function rootCandidates(env: HostEnvironment): readonly RootCandidate[] {
  const out: RootCandidate[] = [];

  const localLocal = candidateOrNull(env.localAppData, "%LOCALAPPDATA%", [
    "Claude-3p",
    "local-agent-mode-sessions",
  ]);
  if (localLocal) out.push(localLocal);

  const localCode = candidateOrNull(env.localAppData, "%LOCALAPPDATA%", [
    "Claude-3p",
    "claude-code-sessions",
  ]);
  if (localCode) out.push(localCode);

  const appLocal = candidateOrNull(env.appData, "%APPDATA%", [
    "Claude",
    "local-agent-mode-sessions",
  ]);
  if (appLocal) out.push(appLocal);

  const appCode = candidateOrNull(env.appData, "%APPDATA%", ["Claude", "claude-code-sessions"]);
  if (appCode) out.push(appCode);

  if (env.platform === "macos" && env.home) {
    out.push({
      path: joinPath(
        normalizePath(env.home),
        "Library",
        "Application Support",
        "Claude",
        "local-agent-mode-sessions",
      ),
      label: "~/Library/Application Support/Claude/local-agent-mode-sessions",
      origin: "auto",
    });
  }

  return Object.freeze(out);
}
