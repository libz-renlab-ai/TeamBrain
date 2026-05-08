#!/usr/bin/env node
/**
 * SessionStart Hook entry. NEVER blocks UI. NEVER exits non-zero.
 */
import os from "node:os";
import path from "node:path";
import {
  decideAction,
  spawnAutoInit,
  logError,
  shouldSpawnUpdater,
  spawnUpdater,
  maybeShowPendingBanner,
  maybeShowReinstallBanner,
} from "./session-start-logic.js";
import { cleanupWikiResidue } from "./wiki-residue-cleanup.js";
import { cleanupDbBackups } from "./db-backup-cleanup.js";
import { runM5Session, renderM5SessionBanner } from "./m5-session-hook.js";

async function main(): Promise<void> {
  // B-090: best-effort cleanup of orphan ~/.teamagent/wiki-refresh-errors.log
  // left over by the removed wiki subsystem (commit 280e4e8). Silent + cheap;
  // never blocks the hook.
  cleanupWikiResidue();

  // B-094: prune legacy `*.before-*` schema-migration db backups in both
  // user-global ~/.teamagent and project-local <cwd>/.teamagent so they do
  // not accumulate forever. Best-effort.
  const homeTeamagent = path.join(os.homedir(), ".teamagent");
  cleanupDbBackups(homeTeamagent);

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();

  let cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  // B-145: validate input is a real Claude Code SessionStart payload before
  // running side-effecting auto-init / M5 bootstrap. Any tool / cron / typo
  // that pipes garbage to this binary will otherwise trigger heavy work and
  // can write to ~/.claude/settings.json. We accept the call only when at
  // least one of these signals is present:
  //   1. CLAUDE_PROJECT_DIR env var (set by Claude Code before invoking hooks)
  //   2. stdin contains a JSON object with hook_event_name === "SessionStart"
  //      (the documented Claude Code hook payload shape)
  //   3. stdin is empty AND TEAMAGENT_ALLOW_BARE_SESSIONSTART=1 (manual dogfood)
  type SessionStartPayload = {
    cwd?: string;
    hook_event_name?: string;
    session_id?: string;
  };
  let parsedInput: SessionStartPayload | null = null;
  if (raw) {
    try {
      parsedInput = JSON.parse(raw) as SessionStartPayload;
      if (parsedInput && typeof parsedInput === "object" && parsedInput.cwd) {
        cwd = parsedInput.cwd;
      }
    } catch { /* fall through to validation below */ }
  }

  const looksLikeClaudeInvocation =
    typeof process.env["CLAUDE_PROJECT_DIR"] === "string" ||
    (parsedInput !== null && parsedInput.hook_event_name === "SessionStart") ||
    (raw === "" && process.env["TEAMAGENT_ALLOW_BARE_SESSIONSTART"] === "1");

  if (!looksLikeClaudeInvocation) {
    // Garbage / empty / non-SessionStart payload. Stay silent (Stop-hook
    // contract: never block, never noise) and skip all side effects.
    return;
  }

  // B-094: project-scoped db backup pruning once we know cwd.
  cleanupDbBackups(path.join(cwd, ".teamagent"));

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
  // B-104: 如果自动更新连续失败（旧 SSH PACKAGE_SPEC 卡死），提示用户手动重装。
  // 24h 节流，避免每次 SessionStart 刷屏。
  try { maybeShowReinstallBanner(); } catch (e) { logError("reinstall-banner-failed", e); }
  try {
    if (shouldSpawnUpdater()) spawnUpdater();
  } catch (e) {
    logError("updater-spawn-failed", e);
  }

  // M5 自动管线：infect + bootstrap apply + sync apply + auto-publish（全部降级，不阻塞）
  // 默认开启（spec §7"激进模式"）：设 TEAMAGENT_M5_AUTOSESSION=0 显式关闭
  // auto-push 也默认开启：设 TEAMAGENT_M5_AUTOPUSH=0 显式关闭
  // 闸门 1 (secret scanner) + 闸门 2 (scope classifier) 兜底，规则离不开本机前都已过两道闸
  if (process.env["TEAMAGENT_M5_AUTOSESSION"] !== "0") {
    try {
      const r = await runM5Session({
        projectRoot: cwd,
        homeDir: os.homedir(),
        autoPush: process.env["TEAMAGENT_M5_AUTOPUSH"] !== "0",
      });
      const banner = renderM5SessionBanner(r);
      if (banner) process.stderr.write(banner + "\n");
    } catch (e) {
      logError("m5-session-failed", e);
    }
  }
}

main().catch((e) => { logError("main-crash", e); process.exit(0); });
