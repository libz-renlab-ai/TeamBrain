/**
 * Aggregate a ProjectGroup into a small, LLM-friendly per-project digest.
 *
 * No LLM call here — pure deterministic counting + first/last user-turn
 * excerpt. The downstream rewriter feeds this into the user's own Claude
 * window so it can write the one-line summary itself (issue #371 grill §2:
 * "TeamAgent 主流程零 LLM 调用").
 */

import type { ProjectGroup } from "./scanner.js";

export interface ProjectDigest {
  /** Display name (basename of canonical project path). */
  readonly displayName: string;
  /** Canonical project absolute path. */
  readonly canonicalCwd: string;
  /** Number of session files touched today across host + worktrees. */
  readonly sessionCount: number;
  /** Number of user turns aggregated across those sessions. */
  readonly userTurnCount: number;
  /** Total assistant text characters (rough effort proxy). */
  readonly assistantCharCount: number;
  /** First user turn message (truncated to 200 chars). */
  readonly firstUserExcerpt: string;
  /** Most recent user turn message (truncated to 200 chars). */
  readonly lastUserExcerpt: string;
  /** Names of distinct tools the assistant invoked today (sorted). */
  readonly toolsUsed: readonly string[];
  /** True iff any of the sessions came from a worktree path. */
  readonly hadWorktreeSession: boolean;
}

const EXCERPT_LIMIT = 200;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function firstLine(s: string): string {
  const nl = s.indexOf("\n");
  return nl < 0 ? s : s.slice(0, nl);
}

export function digestProjectGroup(group: ProjectGroup): ProjectDigest {
  let userTurnCount = 0;
  let assistantCharCount = 0;
  let firstUser: string | undefined;
  let lastUser: string | undefined;
  let lastUserTimeMs = 0;
  let firstUserTimeMs = Number.POSITIVE_INFINITY;
  const tools = new Set<string>();
  let hadWorktreeSession = false;

  for (const rec of group.sessions) {
    // SessionRecord doesn't directly track its source dir, but we know any
    // session merged here either came from the host's project dir or a
    // `.{codex,claude}/worktrees/...` dir — group.project.isWorktree reflects
    // whether the canonical path itself sits inside a worktree (impossible
    // for valid sources) so we instead infer from rawCwd here.
    if (
      rec.rawCwd.includes("/.codex/worktrees/") ||
      rec.rawCwd.includes("/.claude/worktrees/")
    ) {
      hadWorktreeSession = true;
    }
    for (const turn of rec.session.turns) {
      const trimmed = turn.userMessage.trim();
      if (trimmed.length > 0) {
        userTurnCount += 1;
        const turnTimeMs = Date.parse(turn.timestamp);
        const tsMs = Number.isNaN(turnTimeMs) ? rec.mtimeMs : turnTimeMs;
        if (tsMs < firstUserTimeMs) {
          firstUserTimeMs = tsMs;
          firstUser = trimmed;
        }
        if (tsMs >= lastUserTimeMs) {
          lastUserTimeMs = tsMs;
          lastUser = trimmed;
        }
      }
      assistantCharCount += turn.assistantText.length;
      for (const call of turn.toolCalls) {
        tools.add(call.name);
      }
    }
  }

  return {
    displayName: group.project.displayName,
    canonicalCwd: group.project.canonicalCwd,
    sessionCount: group.sessions.length,
    userTurnCount,
    assistantCharCount,
    firstUserExcerpt: firstUser ? truncate(firstLine(firstUser), EXCERPT_LIMIT) : "",
    lastUserExcerpt: lastUser ? truncate(firstLine(lastUser), EXCERPT_LIMIT) : "",
    toolsUsed: Array.from(tools).sort(),
    hadWorktreeSession,
  };
}
