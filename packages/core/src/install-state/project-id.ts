/**
 * Pure project-id resolution.
 *
 * Maps an absolute project directory to a deterministic, filesystem-safe
 * slug suitable for `~/.teamagent/install-state/<projectId>.json`. Pure
 * (no fs, no IO) — the SHA-256 dependency comes from `node:crypto`,
 * which is the standard library's hash module and is allowed in
 * `packages/core/` because it does no IO (only computes a digest of a
 * value the caller already has in memory).
 *
 * Note: M0's CLAUDE.md ban targets `fs / node:fs / node:child_process /
 * 任何 IO 模块`. `node:crypto` is a pure compute API (no fs, no socket,
 * no spawn) — it is the one node: stdlib import core may use without
 * violating Functional Core / Imperative Shell.
 */
import { createHash } from "node:crypto";

/**
 * Resolve a project directory to a stable, short, filesystem-safe slug.
 *
 * Implementation:
 *   - normalize the input (trim trailing slash, lowercase the drive
 *     letter on Windows-style paths — we do NOT canonicalize via fs).
 *   - SHA-256 the normalized string.
 *   - Take the first 16 hex chars as a slug (64 bits of entropy is
 *     plenty for "this machine, this project" disambiguation; we are
 *     not signing anything).
 *   - Prefix with "p_" so the slug is always a legal filename stem on
 *     all platforms (no leading digit issues, no shell-special chars).
 *
 * The slug is a function of the literal projectDir string. Two different
 * absolute paths to the same physical directory (symlinks, /private/var
 * vs /var on macOS) will hash differently — that is intentional: the
 * caller decides whether to canonicalize before passing in.
 */
export function resolveProjectId(projectDir: string): string {
  if (typeof projectDir !== "string" || projectDir.length === 0) {
    throw new Error(
      "resolveProjectId: projectDir must be a non-empty string",
    );
  }
  const normalized = normalizeProjectDir(projectDir);
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `p_${digest.slice(0, 16)}`;
}

/**
 * Normalize for hashing only — does NOT touch the filesystem.
 *
 *   - strip a trailing slash / backslash (so "/foo" and "/foo/" hash the same)
 *   - lowercase the Windows drive letter (so "C:\" and "c:\" hash the same)
 *
 * Symlink resolution and case-folding of path segments deliberately are
 * NOT done here — those require fs and live in the caller.
 */
function normalizeProjectDir(projectDir: string): string {
  let normalized = projectDir;
  // Strip a single trailing path separator (but keep root "/" or "C:\")
  if (
    (normalized.endsWith("/") || normalized.endsWith("\\")) &&
    normalized.length > 1 &&
    !/^[a-zA-Z]:[/\\]$/.test(normalized)
  ) {
    normalized = normalized.slice(0, -1);
  }
  // Lowercase the Windows drive letter prefix if present
  if (/^[A-Z]:/.test(normalized)) {
    normalized = normalized[0]!.toLowerCase() + normalized.slice(1);
  }
  return normalized;
}
