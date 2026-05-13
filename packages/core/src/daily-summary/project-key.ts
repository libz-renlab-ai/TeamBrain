/**
 * Fold a cwd path into a "canonical project key" that merges worktrees back
 * to the host repository.
 *
 * Worktree conventions handled (issue #371 grill §2):
 *   /<host>/.codex/worktrees/<task>   → /<host>
 *   /<host>/.claude/worktrees/<task>  → /<host>
 *
 * Other paths are returned unchanged. The project display name is the
 * `basename` of the canonical path, which mirrors what the grill expects
 * ("项目名: 一句话语义总结").
 */

const WORKTREE_MARKERS: readonly string[] = [
  "/.codex/worktrees/",
  "/.claude/worktrees/",
];

export interface ProjectKey {
  /** Absolute canonical path (worktree merged back to host repo root). */
  readonly canonicalCwd: string;
  /** Display name (basename of canonical path). */
  readonly displayName: string;
  /** True iff the source cwd was inside a `.{codex,claude}/worktrees/<task>` segment. */
  readonly isWorktree: boolean;
}

function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return trimmed;
  return trimmed.slice(idx + 1) || trimmed;
}

export function toProjectKey(absPath: string): ProjectKey {
  for (const marker of WORKTREE_MARKERS) {
    const idx = absPath.indexOf(marker);
    if (idx >= 0) {
      const canonical = absPath.slice(0, idx);
      return {
        canonicalCwd: canonical,
        displayName: basename(canonical),
        isWorktree: true,
      };
    }
  }
  return {
    canonicalCwd: absPath,
    displayName: basename(absPath),
    isWorktree: false,
  };
}
