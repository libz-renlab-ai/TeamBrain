#!/usr/bin/env node
/**
 * SessionStart Hook entry — HookShell migration (commit 7 of M6 fused PR).
 *
 * Lifecycle (stdin / bus / mirror / exit) is owned by `runAdvancedHook` with
 * `escape.manualResources = true`. The handler never touches `ctx.store()`
 * or `ctx.eventLog()`, so neither sqlite handle is opened — which is
 * load-bearing: SessionStart's auto-init detection works by checking
 * whether `<cwd>/.teamagent/knowledge.db` exists, and `DualLayerStore`'s
 * eager open in the default `runHook` layer would create that file before
 * `decideAction` ran, flipping every probe to `skip-already-initialized`.
 *
 * The default layer (`runHook`) is therefore wrong for this channel; the
 * advanced layer's lazy resources are the right tool. SessionStart never
 * writes to knowledge.db / events.db, so passing `manualResources` and
 * never calling the lazy getters keeps zero filesystem footprint at
 * sqlite level.
 *
 * What runs in the handler:
 *   1. cleanup helpers (wiki-residue, db-backup) — best-effort, silent.
 *   2. `decideAction(cwd)` — detects new project vs. project-marker-less
 *      vs. already-initialized, drives the auto-init banner + spawn.
 *   3. update banners (`maybeShowPendingBanner`, `maybeShowReinstallBanner`)
 *      — both helpers accept an injectable `stderr` callback so we route
 *      them through `ctx.mirrorSystemMessage` instead of raw stderr,
 *      keeping the unified `TEAMAGENT_HOOK_STDERR=0` opt-out.
 *   4. updater spawn (detached, fire-and-forget).
 *   5. M5 auto-pipeline — same gates as before (`TEAMAGENT_M5_AUTOSESSION`,
 *      `TEAMAGENT_M5_AUTOPUSH`).
 *
 * SessionStart has no `hookSpecificOutput` envelope wired today (this bin
 * has historically returned exit 0 with empty stdout). We keep that —
 * the handler returns `undefined` and HookShell writes nothing to stdout.
 *
 * AttributionEvent currently has no `hook-session.*` kind. The user-facing
 * banners (auto-init, skip-not-a-project, pending-update, reinstall-needed,
 * M5 pipeline result) are info-only system messages, not structured
 * AttributionEvents — `mirrorSystemMessage` is the right channel. Adding
 * `hook-session.*` kinds is type-additive but explicitly deferred per the
 * task scope guard.
 *
 * cjs has no top-level await; wrap in `async main(); void main();` per the
 * commit-5 canary pattern. `runAdvancedHook` never throws, so no `.catch`
 * needed.
 */
import os from "node:os";
import path from "node:path";
import type { SessionStartHookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  decideAction,
  spawnAutoInit,
  logError,
  shouldSpawnUpdater,
  spawnUpdater,
  maybeShowPendingBanner,
  maybeShowReinstallBanner,
  maybeShowVersionCheckBanner,
  maybeShowUpgradePrompt,
} from "./session-start-logic.js";
import { cleanupWikiResidue } from "./wiki-residue-cleanup.js";
import { cleanupDbBackups } from "./db-backup-cleanup.js";
import { runM5Session, renderM5SessionBanner } from "./m5-session-hook.js";
import { runAdvancedHook } from "./hook-shell/index.js";
import { findTeamagentRoot } from "./lib/walk-up.js";
import { tryDetachedSpawn } from "./daemon-first-embedder.js";
import { defaultEmbedderStatePath } from "./embedder-state.js";
import { postRegister } from "./embedder-client.js";
import { emitCcStatus } from "./realtime-emit.js";

/**
 * SessionStart accepts a Claude Code SessionStart payload (or empty stdin
 * when invoked from a real Claude Code session that hasn't piped one).
 *
 * B-145 (preserved through merge): validate the input is a real Claude
 * Code SessionStart payload before running side-effecting auto-init / M5
 * bootstrap. Any tool / cron / typo that pipes garbage to this binary
 * will otherwise trigger heavy work and can write to ~/.claude/settings.json.
 * We accept the call only when at least one of these signals is present:
 *   1. CLAUDE_PROJECT_DIR env var set (Claude Code sets this before hooks)
 *   2. stdin contains a JSON object with hook_event_name === "SessionStart"
 *   3. stdin is empty AND TEAMAGENT_ALLOW_BARE_SESSIONSTART=1 (manual dogfood)
 * Returning `null` from parseInput fast-exits the shell without side effects.
 */
type SessionStartInput = Partial<SessionStartHookInput>;

function parseInput(raw: unknown): SessionStartInput | null {
  const isObject = raw && typeof raw === "object";
  const hookEventName = isObject
    ? (raw as { hook_event_name?: unknown }).hook_event_name
    : undefined;

  const claudeProjectDir = process.env["CLAUDE_PROJECT_DIR"];
  const allowBare = process.env["TEAMAGENT_ALLOW_BARE_SESSIONSTART"] === "1";

  // Signal 2: documented Claude Code SessionStart hook payload shape.
  if (isObject && hookEventName === "SessionStart") {
    return raw as SessionStartInput;
  }
  // Signal 1: CLAUDE_PROJECT_DIR set + stdin is an object (or empty).
  if (claudeProjectDir && (isObject || raw === null)) {
    return isObject ? (raw as SessionStartInput) : ({} as SessionStartInput);
  }
  // Signal 3: empty stdin + manual dogfood opt-in.
  if (raw === null && allowBare) {
    return {} as SessionStartInput;
  }
  // No signal — silently fast-exit (do not run auto-init).
  return null;
}

async function main(): Promise<void> {
  await runAdvancedHook({
    channel: "SessionStart",
    parseInput,
    escape: { manualResources: true },
    handler: async (ctx) => {
      // Issue #343 PR-1: master kill switch. When TEAMAGENT_DISABLED=1 the
      // SessionStart hook bails before any side effect (embedder daemon
      // spawn, wiki residue cleanup, schema-migration backup prune, M5
      // pipeline). Returning undefined yields a minimal no-op envelope so
      // Claude Code proceeds without surprise. Used by PR-2/PR-3 paired
      // TB-ON vs TB-OFF token-cost ablation.
      if (ctx.env.TEAMAGENT_DISABLED === "1") {
        return undefined;
      }

      // Feature #2 v3: fire-and-forget cc-status push to the team receiver.
      // No-op when TEAMAGENT_REALTIME_URL is unset, so this is silent until a
      // teammate opts in by exporting the env var (see docs/features/team-realtime.md).
      // Wrapped in try/catch even though emitCcStatus already swallows everything
      // — the SessionStart path must never propagate a failure here.
      try {
        const sessionId = (ctx.input as { session_id?: unknown }).session_id;
        emitCcStatus({
          event: "session_start",
          ...(typeof sessionId === "string" ? { sessionId } : {}),
          cwd: ctx.cwd,
        });
      } catch { /* never propagate */ }

      // Issue #164: kick off the embedder daemon if it's not already running.
      // Fire-and-forget detached spawn so SessionStart returns immediately;
      // subsequent PreToolUse / Stop hooks will hit the daemon over HTTP
      // (3-4s cold load happens once, off the critical path). Register
      // this session asynchronously so the daemon's idle-exit logic knows
      // it has live members.
      try {
        const statePath = defaultEmbedderStatePath();
        tryDetachedSpawn(statePath);
        const sessionId =
          (ctx.input as { session_id?: unknown }).session_id;
        if (typeof sessionId === "string" && sessionId.length > 0) {
          // Fire-and-forget: postRegister polls up to 5s for daemon ready,
          // then POSTs /register. Don't await — SessionStart must return fast.
          void postRegister(sessionId, { statePath }).catch(() => { /* best-effort */ });
        }
      } catch { /* best-effort — daemon failure must not break SessionStart */ }

      // B-090: best-effort cleanup of orphan wiki-refresh-errors.log left
      // over by the removed wiki subsystem (commit 280e4e8). Silent + cheap.
      cleanupWikiResidue();

      // B-094: prune legacy `*.before-*` schema-migration db backups in both
      // user-global ~/.teamagent and project-local <cwd>/.teamagent so they
      // do not accumulate forever. Best-effort.
      // Issue #161: when Claude Code is launched from a sub-directory of a
      // teamagent-initialized project, walk up to the real project root so
      // we clean the right `.teamagent/`. Falls back to `ctx.cwd` when no
      // ancestor is initialized — preserves the legacy behaviour for cwds
      // that are themselves the project root.
      const homeTeamagent = path.join(os.homedir(), ".teamagent");
      cleanupDbBackups(homeTeamagent);
      const projectRoot = findTeamagentRoot(ctx.cwd) ?? ctx.cwd;
      cleanupDbBackups(path.join(projectRoot, ".teamagent"));

      // CRITICAL: decideAction MUST run before any code that could touch
      // <cwd>/.teamagent/knowledge.db. We're using runAdvancedHook with
      // manualResources=true precisely so the shell does NOT eagerly open
      // DualLayerStore (which would create the .db file and flip the
      // detection from "auto-init" to "skip-already-initialized"). The
      // handler never calls ctx.store() / ctx.eventLog().
      const action = decideAction(ctx.cwd, new Date());
      if (action === "auto-init") {
        // New project: show visible banner + kick off init in background.
        // Claude Code displays SessionStart stderr on first turn.
        ctx.mirrorSystemMessage(
          `✨ TeamAgent: 新项目检测到 (无 .teamagent/knowledge.db)，后台自动 init 中...\n` +
          `   日志: ~/.teamagent/auto-init.log\n` +
          `   禁用: touch ~/.teamagent/auto-init.disabled`,
        );
        try { spawnAutoInit(ctx.cwd); } catch (e) { logError("auto-init-spawn-failed", e); }
      } else if (action === "skip-not-a-project") {
        // 当前目录没有项目标记 (.git / package.json / pyproject.toml 等),
        // 不敢自动建 .teamagent/. 告诉用户为啥没动作 + 提供出路.
        ctx.mirrorSystemMessage(
          `ℹ️  TeamAgent: 当前目录不像项目 (无 .git / package.json / pyproject.toml 等标记), 跳过 auto-init\n` +
          `   想启用: 在有这些标记的项目里开 Claude Code, 或手动运行 \`teamagent init\`\n` +
          `   完全静默: touch ~/.teamagent/auto-init.disabled`,
        );
      }

      // 自动更新：先显示上次更新完成的 banner，再决定是否后台 spawn updater.
      // session-start-logic 的 banner helper 默认写 process.stderr；这里改走
      // ctx.mirrorSystemMessage 以遵守 TEAMAGENT_HOOK_STDERR=0 的统一开关。
      // helper 自己加 \n，mirror 也加 \n，所以 strip 末尾换行避免双重换行。
      try {
        maybeShowPendingBanner((s) => ctx.mirrorSystemMessage(s.replace(/\n$/, "")));
      } catch (e) { logError("banner-show-failed", e); }
      // B-104: 自动更新连续失败时的手动重装提示。24h 节流。
      try {
        maybeShowReinstallBanner((s) => ctx.mirrorSystemMessage(s.replace(/\n$/, "")));
      } catch (e) { logError("reinstall-banner-failed", e); }
      // Issue #313: Tier 3 — Pages + npm 双挂时显式提示，替代 silent backoff。
      // 无节流；每次 SessionStart 都尝试，因为下一次 fetch 成功会自动 clear。
      try {
        maybeShowVersionCheckBanner((s) => ctx.mirrorSystemMessage(s.replace(/\n$/, "")));
      } catch (e) { logError("version-check-banner-failed", e); }
      // Issue #225: soft-force upgrade prompt. Re-fires every SessionStart
      // until the user picks A/B/C; honors snooze backoff + never_prompt +
      // TEAMAGENT_NEVER_PROMPT env override. Shown AFTER the pending /
      // reinstall banners so a successful auto-update gets its "✨ 已更新"
      // celebration first, then the next-version prompt (if any) follows.
      try {
        maybeShowUpgradePrompt((s) => ctx.mirrorSystemMessage(s.replace(/\n$/, "")));
      } catch (e) { logError("upgrade-prompt-failed", e); }
      try {
        if (shouldSpawnUpdater()) spawnUpdater();
      } catch (e) {
        logError("updater-spawn-failed", e);
      }

      // M5 自动管线：infect + bootstrap apply + sync apply + auto-publish
      // （全部降级，不阻塞）。默认开启（spec §7"激进模式"），TEAMAGENT_M5_AUTOSESSION=0
      // 显式关闭；auto-push 也默认开启，TEAMAGENT_M5_AUTOPUSH=0 显式关闭。
      // 闸门 1（secret scanner）+ 闸门 2（scope classifier）兜底，规则离开本机前
      // 都已过两道闸。
      if (ctx.env["TEAMAGENT_M5_AUTOSESSION"] !== "0") {
        try {
          const r = await runM5Session({
            projectRoot: ctx.cwd,
            homeDir: os.homedir(),
            autoPush: ctx.env["TEAMAGENT_M5_AUTOPUSH"] !== "0",
          });
          const banner = renderM5SessionBanner(r);
          if (banner) ctx.mirrorSystemMessage(banner);
        } catch (e) {
          logError("m5-session-failed", e);
        }
      }

      return undefined;
    },
  });
}

void main();
