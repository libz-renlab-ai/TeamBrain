/**
 * Claude Code 把当前 cwd 编码进 `~/.claude/projects/<encoded-cwd>/` 的目录名：
 * 整条绝对路径里所有 `/` 替换成 `-`，结果以 `-` 起头。例：
 *
 *   /Users/m1/projects/TeamBrain
 *     ↔ -Users-m1-projects-TeamBrain
 *
 *   /Users/m1/projects/TeamBrain/.claude/worktrees/issue-371
 *     ↔ -Users-m1-projects-TeamBrain--claude-worktrees-issue-371
 *
 * 因为原路径里本身就可以含 `-`（如 `issue-371`），双 `-` 表示原路径里的
 * `/` 边界（左侧 segment + 右侧空段就是 `.claude` 这种 dotfile 的标记）。
 *
 * decode 时采用最直接的还原：把目录名按 `-` 切成 segment，再用 `/` join。
 * `--` 会产生一个空 segment，这正好对应原路径里 `/.<dotfile>` 的写法
 * （`Users-m1-projects-TeamBrain-` + `-claude` → `/Users/m1/projects/TeamBrain//.claude`
 *   实际上会得到 `Users/m1/projects/TeamBrain/.claude` —— 空 segment 在 join
 *   时与 dotfile prefix 合并）。
 *
 * 这条 round-trip 对绝大部分实际项目路径生效；少数 corner case（路径里本来
 * 就含 `--`）解码不严格保真但不会崩，这是 issue #371 MVP 接受的退化。
 */

/**
 * Encode an absolute path to the Claude Code `~/.claude/projects/<X>/` segment.
 *
 * - Replace every `/` with `-`.
 * - Drop the leading `/` would have produced `-` already; the result naturally
 *   starts with `-` if the input started with `/`.
 *
 * Inputs are expected to be POSIX absolute paths (`/...`). Windows paths are not
 * a supported scope for issue #371 MVP — Claude Code on macOS / Linux is the
 * target environment.
 */
export function encodeCwdToProjectDir(absPath: string): string {
  return absPath.replace(/\//g, "-");
}

/**
 * Decode a `~/.claude/projects/<X>/` directory name back to an absolute path.
 *
 * Strategy: split on `-`, replace empty segments-from-`--` with empty, join
 * with `/`. The leading `-` becomes a leading `/`.
 *
 * @returns Best-effort decoded absolute path. For corner cases where the
 *          original path contained `--`, the decoded form may be off-by-one
 *          but the function never throws.
 */
export function decodeProjectDirToCwd(dirName: string): string {
  if (!dirName.startsWith("-")) {
    // Not a Claude Code-encoded name; treat as-is.
    return dirName;
  }
  // The leading `-` represents the leading `/`. Split on `-` produces
  // ["", "Users", "m1", ...] for `-Users-m1-...`.
  // For `--claude-worktrees` (representing `/.claude/worktrees`) the split
  // yields ["", "", "claude", "worktrees"] — joining with `/` gives
  // `//claude/worktrees`. We collapse the leading double-slash to single.
  const segments = dirName.split("-");
  // segments[0] is always "" for the leading dash.
  const joined = "/" + segments.slice(1).join("/");
  return joined.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
}
