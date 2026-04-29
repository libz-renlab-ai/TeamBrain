#!/usr/bin/env node
/**
 * SessionStart Hook entry. NEVER blocks UI. NEVER exits non-zero.
 */
import {
  decideAction,
  spawnAutoInit,
  logError,
  shouldSpawnUpdater,
  spawnUpdater,
  maybeShowPendingBanner,
} from "./session-start-logic.js";
import { cleanupWikiResidue } from "./wiki-residue-cleanup.js";

async function main(): Promise<void> {
  // B-090: best-effort cleanup of orphan ~/.teamagent/wiki-refresh-errors.log
  // left over by the removed wiki subsystem (commit 280e4e8). Silent + cheap;
  // never blocks the hook.
  cleanupWikiResidue();

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();

  let cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  if (raw) {
    try {
      const input = JSON.parse(raw) as { cwd?: string };
      if (input.cwd) cwd = input.cwd;
    } catch { /* fallback to env/cwd */ }
  }

  const action = decideAction(cwd, new Date());
  if (action === "auto-init") {
    // New project: show visible banner to user + kick off init in background.
    // Claude Code displays SessionStart stderr/stdout on first turn.
    process.stderr.write(
      `✨ TeamAgent: 新项目检测到 (无 .teamagent/knowledge.db)，后台自动 init 中...\n` +
      `   日志: ~/.teamagent/auto-init.log\n` +
      `   禁用: touch ~/.teamagent/auto-init.disabled\n`,
    );
    try { spawnAutoInit(cwd); } catch (e) { logError("auto-init-spawn-failed", e); }
  } else if (action === "skip-not-a-project") {
    // 当前目录没有项目标记 (.git / package.json / pyproject.toml 等), 不敢自动建 .teamagent/.
    // 告诉用户为啥没动作 + 提供出路.
    process.stderr.write(
      `ℹ️  TeamAgent: 当前目录不像项目 (无 .git / package.json / pyproject.toml 等标记), 跳过 auto-init\n` +
      `   想启用: 在有这些标记的项目里开 Claude Code, 或手动运行 \`teamagent init\`\n` +
      `   完全静默: touch ~/.teamagent/auto-init.disabled\n`,
    );
  }

  // 自动更新：先显示上次更新完成的 banner，再决定是否后台 spawn updater
  try { maybeShowPendingBanner(); } catch (e) { logError("banner-show-failed", e); }
  try {
    if (shouldSpawnUpdater()) spawnUpdater();
  } catch (e) {
    logError("updater-spawn-failed", e);
  }
}

main().catch((e) => { logError("main-crash", e); process.exit(0); });
