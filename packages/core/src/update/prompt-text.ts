/**
 * Pure renderer for the soft-force upgrade prompt (issue #225).
 *
 * Produces the multi-line stderr banner the SessionStart hook surfaces
 * when an upgrade is available and the user hasn't snoozed/never'd.
 *
 * Layout (mirrors gstack with TeamAgent's CLI vocabulary):
 *
 *   ┌─────────────────────────────────────────┐
 *   │ ✨ TeamAgent v0.10.5 available          │
 *   │                                         │
 *   │ 你装的是 v0.10.1 (落后 4 个版本):       │
 *   │   • bullet1                             │
 *   │   • bullet2                             │
 *   │   • bullet3                             │
 *   │                                         │
 *   │ A) teamagent update --now    立刻升级   │
 *   │ B) teamagent update --snooze 下次再说   │
 *   │ C) teamagent update --never  永远别问   │
 *   └─────────────────────────────────────────┘
 *
 * No box-drawing — Unicode boxes break in some Windows terminals; use plain
 * ASCII separators that survive every terminal/codepage we've seen in support
 * tickets.
 */

import type { ChangelogBullet } from "./changelog-parser.js";

export interface RenderUpgradePromptInput {
  /** Currently-installed user-facing version (e.g. "0.10.1"). */
  fromVersion: string;
  /** Target version available on the release branch (e.g. "0.10.5"). */
  toVersion: string;
  /** Bullets from `parseChangelog`, capped by caller (gstack uses 5-7). */
  bullets: ChangelogBullet[];
  /**
   * Current snooze level BEFORE the user's pending decision. Drives the
   * footnote "已 snooze {N} 次" so the user sees they're escalating.
   */
  snoozeLevel: number;
}

export function renderUpgradePrompt(input: RenderUpgradePromptInput): string {
  const { fromVersion, toVersion, bullets, snoozeLevel } = input;
  const lines: string[] = [];

  const sep = "━".repeat(48);
  lines.push("");
  lines.push(sep);
  lines.push(`✨ TeamAgent ${toVersion} 可用 (你装的是 ${fromVersion || "(unknown)"})`);
  lines.push(sep);

  if (bullets.length > 0) {
    lines.push("");
    lines.push("本次新增:");
    for (const b of bullets) {
      const themePrefix = b.theme ? `[${b.theme}] ` : "";
      lines.push(`  • ${themePrefix}${b.bullet}`);
    }
  }

  lines.push("");
  lines.push("三选一:");
  lines.push("  A) teamagent update --now      立刻升级 (前台执行, 几十秒)");
  lines.push("  B) teamagent update --snooze   下次再说 (24h → 48h → 7d 退避)");
  lines.push("  C) teamagent update --never    永远别问 (--enable 可恢复)");

  if (snoozeLevel > 0) {
    lines.push("");
    lines.push(`(已 snooze ${snoozeLevel} 次, 下次 snooze 将延长退避窗口)`);
  }

  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}

/**
 * Compact post-init "what's new" tail (no decision buttons; just a digest
 * appended to `teamagent init` ok-path output). Same bullet list, no box.
 *
 * Used by `renderInitResult` and `teamagent whatsnew`.
 */
export function renderWhatsNewTail(input: {
  installedVersion: string;
  bullets: ChangelogBullet[];
}): string {
  const { installedVersion, bullets } = input;
  if (bullets.length === 0) return "";
  const lines: string[] = [];
  lines.push("");
  lines.push("━".repeat(48));
  lines.push(`🆕 本次安装的 ${installedVersion} 新增:`);
  lines.push("");
  for (const b of bullets) {
    const themePrefix = b.theme ? `[${b.theme}] ` : "";
    lines.push(`  • ${themePrefix}${b.bullet}`);
  }
  lines.push("");
  lines.push("详情: teamagent whatsnew");
  lines.push("━".repeat(48));
  return lines.join("\n");
}
