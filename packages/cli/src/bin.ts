#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSkeletonDemo } from "./commands/skeleton-demo.js";
import {
  executePitfall,
  runPitfallInteractive,
  parsePitfallArgs,
} from "./commands/pitfall.js";
import { executeStats } from "./commands/stats.js";
import { executeDemoHook, parseDemoHookArgs } from "./commands/demo-hook.js";
import { installHook, uninstallHook } from "./commands/install-hook.js";
import { installUserHook, uninstallUserHook } from "./commands/install-user-hook.js";
import { executeAnalyze, parseAnalyzeArgs } from "./commands/analyze.js";
import { executeReview, parseReviewArgs } from "./commands/review.js";
import {
  executeInit,
  parseInitArgs,
  renderInitResult,
} from "./commands/init.js";
import {
  disable,
  enable,
  uninstall,
  parseUninstallArgs,
  renderUninstallResult,
} from "./commands/uninstall.js";
import {
  executeCalibrate,
  parseCalibrateArgs,
  renderCalibrateResult,
} from "./commands/calibrate.js";
import {
  executeVerify,
  parseVerifyArgs,
  renderVerifyTerminal,
} from "./commands/verify.js";
import {
  executeE2EEvaluate,
  parseE2EEvaluateArgs,
  renderE2EEvaluateResult,
} from "./commands/e2e-evaluate.js";
import {
  executeDogfoodReport,
  parseDogfoodReportArgs,
} from "./commands/dogfood-report.js";
import {
  DashboardArgsError,
  launchDashboard,
  parseDashboardArgs,
  renderDashboardLaunch,
} from "./commands/dashboard.js";
import { executeIngest, parseIngestArgs } from "./commands/ingest.js";
import { executeRecordingCommand } from "./commands/recording.js";
import {
  executeCompile,
  parseCompileArgs,
  renderCompileResult,
} from "./commands/compile.js";
import { executeConfig } from "./commands/config.js";
import {
  executeDoctor,
  parseDoctorArgs,
  renderDoctorResult,
} from "./commands/doctor.js";
import {
  executeInstallPlugins,
  parseInstallPluginsArgs,
  renderInstallPluginsResult,
} from "./commands/install-plugins.js";
import { executeScanErrors, parseScanErrorsArgs } from "./commands/scan-errors.js";
import {
  executeReviewCandidates,
  parseReviewCandidatesArgs,
} from "./commands/review-candidates.js";
import { executePrCycle, parsePrCycleArgs } from "./commands/pr-cycle.js";
import {
  executePairAccept,
  executePairCapsule,
  executePairKnock,
  executePairList,
  parsePairArgs,
  renderPairAcceptResult,
  renderPairCapsuleResult,
  renderPairKnockResult,
  renderPairList,
} from "./commands/pair.js";

function findPackageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  let workspaceRoot: string | null = null;
  for (let i = 0; i < 8; i++) {
    // Detect monorepo root for dev-mode fallback (pnpm uses pnpm-workspace.yaml,
    // not package.json's "workspaces" field).
    if (
      !workspaceRoot &&
      (fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
        fs.existsSync(path.join(dir, "packages", "teamagent", "package.json")))
    ) {
      workspaceRoot = dir;
    }
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
          name?: string;
          version?: string;
          bin?: Record<string, string>;
        };
        // Installed tarball: name=teamagent + bin.teamagent + version.
        if (pkg.name === "teamagent" && pkg.bin?.["teamagent"] && pkg.version) {
          return pkg.version;
        }
      } catch {
        // Keep walking upward; --version should never make the CLI fail.
      }
    }
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  // Dev fallback: read the publishable package.json directly.
  if (workspaceRoot) {
    try {
      const tpkgPath = path.join(workspaceRoot, "packages", "teamagent", "package.json");
      const tpkg = JSON.parse(fs.readFileSync(tpkgPath, "utf-8")) as { version?: string };
      if (tpkg.version) return tpkg.version;
    } catch {
      // fall through
    }
  }
  return "unknown";
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const rest = process.argv.slice(3);

  switch (command) {
    case "--version":
    case "-V":
    case "version": {
      process.stdout.write(`${findPackageVersion()}\n`);
      return;
    }
    case "skeleton-demo": {
      const output = await runSkeletonDemo();
      if (output) process.stdout.write(output + "\n");
      return;
    }
    case "pitfall": {
      let nonInteractive;
      try {
        nonInteractive = parsePitfallArgs(rest);
      } catch (err) {
        const { PitfallValidationError } = await import("./commands/pitfall.js");
        if (err instanceof PitfallValidationError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const output = nonInteractive
        ? await executePitfall(nonInteractive)
        : await runPitfallInteractive();
      if (output) process.stdout.write(output + "\n");
      return;
    }
    case "stats": {
      const statsOpts: import("./commands/stats.js").StatsOptions = {};
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--stuck-in-promotion") {
          statsOpts.stuckInPromotion = true;
        } else if (a === "--explain" && rest[i + 1]) {
          statsOpts.explain = rest[++i];
        } else if (a.startsWith("--explain=")) {
          statsOpts.explain = a.slice("--explain=".length);
        } else if (a.startsWith("--stuck-days=")) {
          const v = parseInt(a.slice("--stuck-days=".length), 10);
          if (isNaN(v) || v < 0) {
            process.stderr.write(`--stuck-days 必须是正整数，收到: "${a.slice("--stuck-days=".length)}"\n`);
            process.exit(1);
          }
          statsOpts.stuckDays = v;
        } else if (a === "--override-signals") {
          statsOpts.overrideSignals = true;
        }
      }
      process.stdout.write(executeStats(statsOpts));
      return;
    }
    case "demo": {
      // teamagent demo hook <tool> <key=value>...
      const sub = rest[0];
      if (sub === "hook") {
        const opts = parseDemoHookArgs(rest.slice(1));
        if (!opts) {
          process.stderr.write(
            "用法: teamagent demo hook <tool> <key=value>... 例: teamagent demo hook Bash 'command=npm install moment'\n",
          );
          process.exit(1);
        }
        process.stdout.write(executeDemoHook(opts));
        return;
      }
      process.stderr.write(`未知 demo 子命令: ${sub}\n`);
      process.exit(1);
      return;
    }
    case "install-hook": {
      const r = installHook();
      if (r.alreadyInstalled) {
        process.stdout.write(
          `✓ Hook 已安装（无变化）: ${r.settingsPath}\n  入口: ${r.hookEntry}\n`,
        );
      } else {
        process.stdout.write(
          `✅ Hook 已注册到 Claude Code: ${r.settingsPath}\n  入口: ${r.hookEntry}\n  下次开 Claude Code 时生效。可用 'teamagent demo hook ...' 离线测试。\n`,
        );
      }
      return;
    }
    case "uninstall-hook": {
      const r = uninstallHook();
      if (r.removed) {
        process.stdout.write(`✅ Hook 已移除: ${r.settingsPath}\n`);
      } else {
        process.stdout.write(`未找到 TeamAgent hook 注册。无需移除。\n`);
      }
      return;
    }
    case "install-user-hook": {
      if (rest.includes("--dry-run")) {
        process.stderr.write(
          `install-user-hook 不支持 --dry-run（该命令直接修改 ~/.claude/settings.json）。\n` +
            `如需查看注册路径，先运行: teamagent install-user-hook 后用 cat ~/.claude/settings.json 查看，` +
            `或用 teamagent uninstall-user-hook 撤销。\n`,
        );
        process.exit(2);
      }
      const r = installUserHook();
      if (r.alreadyInstalled) {
        process.stdout.write(
          `✓ 用户级 SessionStart hook 已安装 (无变化): ${r.settingsPath}\n`,
        );
      } else {
        process.stdout.write(
          `✅ 用户级 SessionStart hook 已注册: ${r.settingsPath}\n` +
            (r.backupPath ? `   原配置已备份: ${r.backupPath}\n` : "") +
            `   入口: ${r.hookEntry}\n` +
            `   打开任何新项目时将自动检测并 init\n`,
        );
      }
      return;
    }
    case "uninstall-user-hook": {
      if (rest.includes("--dry-run")) {
        process.stderr.write(
          `uninstall-user-hook 不支持 --dry-run（该命令直接修改 ~/.claude/settings.json）。\n`,
        );
        process.exit(2);
      }
      const r = uninstallUserHook();
      if (r.removed) {
        process.stdout.write(`✅ 用户级 SessionStart hook 已移除: ${r.settingsPath}\n`);
      } else {
        process.stdout.write(`未找到用户级 SessionStart hook，无需移除\n`);
      }
      return;
    }
    case "analyze": {
      const opts = parseAnalyzeArgs(rest);
      const output = await executeAnalyze(opts);
      process.stdout.write(output);
      return;
    }
    case "review": {
      const opts = parseReviewArgs(rest);
      process.stdout.write(executeReview(opts));
      return;
    }
    case "init": {
      const opts = parseInitArgs(rest);
      const result = await executeInit(opts);
      process.stdout.write(renderInitResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "install-codex": {
      const opts = parseInitArgs(rest);
      const result = await executeInit({ ...opts, target: "codex" });
      process.stdout.write(renderInitResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "disable": {
      const r = disable();
      if (r.removed) {
        process.stdout.write(`✓ Hook 已禁用: ${r.settingsPath}\n  数据保留；用 'teamagent enable' 恢复\n`);
      } else {
        process.stdout.write(`未找到已注册的 TeamAgent hook，无需禁用\n`);
      }
      return;
    }
    case "enable": {
      const r = enable();
      if (r.alreadyInstalled) {
        process.stdout.write(`✓ Hook 已启用（无变化）: ${r.settingsPath}\n`);
      } else {
        process.stdout.write(`✅ Hook 已重新启用: ${r.settingsPath}\n  下次开 Claude Code 时生效\n`);
      }
      return;
    }
    case "uninstall": {
      const opts = parseUninstallArgs(rest);
      const r = uninstall(opts);
      process.stdout.write(renderUninstallResult(r));
      return;
    }
    case "calibrate": {
      const opts = parseCalibrateArgs(rest);
      const r = await executeCalibrate(opts);
      process.stdout.write(renderCalibrateResult(r));
      return;
    }
    case "verify": {
      const opts = parseVerifyArgs(rest);
      const { result, reportPath } = await executeVerify(opts);
      process.stdout.write(renderVerifyTerminal(result));
      if (reportPath) {
        process.stdout.write(`\n📄 详细报告: ${reportPath}\n`);
      }
      if (result.passed !== result.total) process.exit(1);
      return;
    }
    case "e2e-evaluate": {
      const opts = parseE2EEvaluateArgs(rest);
      const result = await executeE2EEvaluate(opts);
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(renderE2EEvaluateResult(result));
      }
      if (!result.ok) process.exit(1);
      return;
    }
    case "ingest": {
      let opts;
      try {
        opts = parseIngestArgs(rest);
      } catch (err) {
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(1);
        return;
      }
      const output = await executeIngest(opts);
      if (output.startsWith("✗")) {
        process.stderr.write(output);
        process.exit(1);
        return;
      }
      process.stdout.write(output);
      return;
    }
    case "recording": {
      try {
        process.stdout.write(await executeRecordingCommand(rest, { cwd: process.cwd() }));
      } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(2);
      }
      return;
    }
    case "dogfood-report": {
      const opts = parseDogfoodReportArgs(rest);
      const r = await executeDogfoodReport(opts);
      process.stdout.write(
        `📊 自举报告生成: ${r.outputPath}\n  ${r.totalEntries} 条知识 / ${r.totalEvents} 个事件 / ${r.archivedCount} 自动归档\n`,
      );
      return;
    }
    case "dashboard": {
      try {
        const opts = parseDashboardArgs(rest);
        const result = await launchDashboard(opts);
        process.stdout.write(renderDashboardLaunch(result));
      } catch (err) {
        if (err instanceof DashboardArgsError) {
          process.stderr.write(
            `${err.message}\n` +
              "Usage: teamagent dashboard [--watch|--once] [--host=127.0.0.1] [--port=8787] [--interval=2s] [--open]\n",
          );
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "compile": {
      const opts = parseCompileArgs(rest);
      const result = await executeCompile(opts);
      process.stdout.write(renderCompileResult(result, opts.dryRun));
      return;
    }
    case "config": {
      const sub = rest[0];
      const val = rest[1];
      if (!sub || (sub !== "show" && sub !== "stop-mode")) {
        console.error('Usage: teamagent config stop-mode <sync|async>');
        console.error('       teamagent config show');
        process.exit(1);
      }
      try {
        const out = executeConfig({ subcommand: sub as "stop-mode" | "show", value: val });
        console.log(out);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
      break;
    }
    case "migrate-v6": {
      const dryRun = rest.includes("--dry-run");
      const fast = rest.includes("--fast");
      const repairAll = rest.includes("--repair-all");
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
      const dbArg = rest.find((a) => a.startsWith("--db="));
      const dbPath = dbArg ? dbArg.split("=").slice(1).join("=") : undefined;
      const { executeMigrateV6 } = await import("./commands/migrate-v6.js");
      const result = await executeMigrateV6({ dryRun, dbPath, limit, fast, repairAll });
      process.stdout.write(`migrated=${result.migrated} resurrected=${result.resurrected} skipped=${result.skipped}\n`);
      return;
    }
    case "migrate-v7": {
      const dryRun = rest.includes("--dry-run");
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : undefined;
      const dbArg = rest.find((a) => a.startsWith("--db="));
      const dbPath = dbArg ? dbArg.split("=").slice(1).join("=") : undefined;
      const { executeMigrateV7 } = await import("./commands/migrate-v7.js");
      await executeMigrateV7({ dryRun, dbPath, limit, cwd: process.cwd() });
      return;
    }
    case "migrate": {
      const dryRun = rest.includes("--dry-run");
      const { executeMigrate } = await import("./commands/migrate-v1-to-v2.js");
      const r = await executeMigrate({ dryRun });
      process.stdout.write(`Phase 1 → v2 迁移:\n`);
      process.stdout.write(`  读取条目: ${r.readEntries}\n`);
      process.stdout.write(`    personal: ${r.byScope.personal}\n`);
      process.stdout.write(`    team → personal: ${r.byScope.team}\n`);
      process.stdout.write(`    global: ${r.byScope.global}\n`);
      if (dryRun) {
        process.stdout.write(`\n(dry-run 模式，未写入 SQLite)\n`);
      } else {
        process.stdout.write(`  写入: ${r.written} 条; 拒绝: ${r.rejected} 条\n`);
        if (r.rejectionLog.length > 0) {
          for (const entry of r.rejectionLog) {
            process.stderr.write(`  rejected ${entry.id}: ${entry.reason}\n`);
          }
        }
      }
      return;
    }
    case "scan-errors": {
      const scanOpts = parseScanErrorsArgs(rest);
      const output = await executeScanErrors(scanOpts);
      if (output) process.stdout.write(output);
      return;
    }
    case "review-candidates": {
      const reviewOpts = parseReviewCandidatesArgs(rest);
      const output = await executeReviewCandidates(reviewOpts);
      if (output) process.stdout.write(output);
      return;
    }
    case "pr-cycle": {
      let opts;
      try {
        opts = parsePrCycleArgs(rest);
      } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
        return;
      }
      const result = await executePrCycle(opts);
      if (result.blocked) {
        process.stderr.write(result.output);
        process.exit(2);
        return;
      }
      process.stdout.write(result.output);
      return;
    }
    case "doctor": {
      const opts = parseDoctorArgs(rest);
      const result = await executeDoctor({ ...opts, cwd: process.cwd() });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else if (!opts.postinstall || !result.allPassed) {
        process.stdout.write(renderDoctorResult(result));
      }
      if (!result.allPassed) process.exit(1);
      return;
    }
    case "install-plugins": {
      const opts = parseInstallPluginsArgs(rest);
      const result = await executeInstallPlugins(opts);
      process.stdout.write(renderInstallPluginsResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "warmup": {
      const { runWarmup } = await import("./commands/warmup.js");
      const result = await runWarmup();
      process.exit(result.ok ? 0 : 1);
    }
    case "migrate-auto": {
      const { runMigrateAuto } = await import("./commands/migrate-auto.js");
      const r = await runMigrateAuto();
      process.stderr.write(JSON.stringify(r, null, 2) + "\n");
      process.exit(r.ok ? 0 : 1);
    }
    case "update": {
      const { runUpdateCommand, parseUpdateArgs } = await import("./commands/update.js");
      const { sub, rest: subRest } = parseUpdateArgs(rest);
      const r = await runUpdateCommand(sub, subRest);
      process.stdout.write(r.output);
      process.exit(r.ok ? 0 : 1);
    }
    case "pair": {
      const parsed = parsePairArgs(rest);
      if (parsed.subcommand === "capsule") {
        const result = executePairCapsule(parsed.options as unknown as Parameters<typeof executePairCapsule>[0]);
        process.stdout.write(renderPairCapsuleResult(result));
        return;
      }
      if (parsed.subcommand === "accept") {
        const result = executePairAccept(parsed.options as unknown as Parameters<typeof executePairAccept>[0]);
        process.stdout.write(renderPairAcceptResult(result));
        return;
      }
      if (parsed.subcommand === "knock") {
        const opts = parsed.options as unknown as Parameters<typeof executePairKnock>[0];
        const result = executePairKnock(opts);
        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(renderPairKnockResult(result));
        }
        if (!result.ok) process.exit(1);
        return;
      }
      const book = executePairList(parsed.options as Parameters<typeof executePairList>[0]);
      if ((parsed.options as { json?: boolean }).json) {
        process.stdout.write(JSON.stringify(book, null, 2) + "\n");
      } else {
        process.stdout.write(renderPairList(book));
      }
      return;
    }
    case "reclassify": {
      const sub = rest[0];
      const subArgs = rest.slice(1);
      const { runReclassifyApply, runReclassifyRollback } = await import("./commands/reclassify.js");
      if (sub === "apply") {
        const planIdx = subArgs.findIndex((a) => a === "--plan");
        const planFile = planIdx >= 0 ? subArgs[planIdx + 1] : undefined;
        if (!planFile) {
          process.stderr.write("Usage: teamagent reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n");
          process.exit(1);
        }
        const dryRun = subArgs.includes("--dry-run");
        const minConfArg = subArgs.find((a) => a.startsWith("--min-conf="));
        const minConfidence = minConfArg ? parseFloat(minConfArg.split("=")[1]!) : 0.7;
        runReclassifyApply({ plan: planFile, dryRun, minConfidence });
        return;
      }
      if (sub === "rollback") {
        const auditIdx = subArgs.findIndex((a) => a === "--audit");
        const auditId = auditIdx >= 0 ? subArgs[auditIdx + 1] : undefined;
        if (!auditId) {
          process.stderr.write("Usage: teamagent reclassify rollback --audit <audit-id>\n");
          process.exit(1);
        }
        runReclassifyRollback({ auditId });
        return;
      }
      process.stderr.write(
        "Usage:\n" +
          "  teamagent reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n" +
          "  teamagent reclassify rollback --audit <audit-id>\n",
      );
      process.exit(1);
      return;
    }
    case undefined:
    case "--help":
    case "-h":
    case "help": {
      process.stdout.write(
        [
          "teamagent — TeamAgent CLI",
          "",
          "用法:",
          "  teamagent skeleton-demo          M0 Walking Skeleton 演示",
          "  teamagent pitfall                手动记录一条踩坑经验 (交互)",
          "  teamagent pitfall --non-interactive --trigger=... --wrong=... --correct=... --reason=...",
          "                                   非交互模式 (可选: --category=C|E|S|K --tags=a,b --level=personal|team|global --nature=objective|subjective)",
          "  teamagent stats [--stuck-in-promotion] [--stuck-days=N] [--explain=<id>]",
          "                                   展示知识库统计；--stuck-in-promotion 列出卡在 probation 超 N 天的规则",
          "  teamagent demo hook <tool> <k=v>...",
          "                                   离线模拟 PreToolUse hook (例: teamagent demo hook Bash 'command=npm install moment')",
          "  teamagent install-hook           把 PreToolUse hook 注册到当前项目 .claude/settings.local.json",
          "  teamagent uninstall-hook         移除 PreToolUse hook 注册",
          "  teamagent install-user-hook      把 SessionStart hook 注册到 ~/.claude/settings.json",
          "                                   (打开任何新项目时自动 init, 一次装永久生效)",
          "  teamagent uninstall-user-hook    移除用户级 SessionStart hook 注册",
          "  teamagent analyze [--session=<id|path>] [--verbose] [--commit]",
          "                                   分析 Claude Code 会话日志，识别纠正时刻+成功信号",
          "                                   --commit: 通过 LLM 提取成知识条目并写入知识库 + 重编译 CLAUDE.md",
          "  teamagent review [N] [--scope=personal|team|global]",
          "                                   列出最近 N 条知识（默认 10），供人工复核",
          "  teamagent init [--dry-run] [--skip-import] [--skip-hook] [--install-plugins] [--target=claude|codex|both]",
          "                                   一键安装到当前项目：建目录 + 注入元原则 + 导入已有规则 + 注册 Hook + 编译规则文件",
          "                                   默认 target=claude；codex 会创建 AGENTS.md/.codex/skills 软链接且不注册 Claude hook",
          "                                   --install-plugins: 同时注册团队标配插件（opt-in，改写用户全局 settings）",
          "  teamagent install-codex [--dry-run] [--skip-import]",
          "                                   Codex 快捷安装：编译 CLAUDE.md，并创建 AGENTS.md -> CLAUDE.md",
          "  teamagent doctor [--fix] [--json]",
          "                                   诊断安装环境（Node版本/Claude Code/sqlite-vec/Hook/CLAUDE.md）",
          "                                   --fix: 自动修复能自动修的问题",
          "                                   --json: 输出机器可读 JSON",
          "  teamagent install-plugins [--dry-run] [--only=a,b] [--scope=user|project|local]",
          "                                   注册团队标配 plugins（superpowers/caveman/sales/playground）",
          "                                   通过 'claude plugin marketplace add' + 'claude plugin install' 调 CC CLI",
          "                                   默认装全部；--only 限定子集；--dry-run 只预览",
          "  teamagent pair capsule --name=<device> --host=<host> [--user=<user>] [--out=<file>]",
          "                                   生成短期 teammate 配对胶囊（不包含 SSH 私钥）",
          "  teamagent pair accept <capsule-file|token> [--local-name=<device>]",
          "                                   接受胶囊，写入 peer 账本、SSH config 受管块和收据",
          "  teamagent pair knock <peer> [--json] [--simulate]",
          "                                   通过 SSH 验证配对；--simulate 用于离线验收",
          "  teamagent pair list              列出已配对 teammate",
          "  teamagent disable                临时禁用 Hook（保留数据）",
          "  teamagent enable                 重新启用 Hook",
          "  teamagent uninstall [--delete-data] [--dry-run]",
          "                                   完全卸载：移除 Hook 注册 + 清掉 CLAUDE.md 区块；加 --delete-data 同时清数据",
          "  teamagent calibrate [--days=7] [--dry-run]",
          "                                   根据 events.jsonl 重算 confidence + 自动归档低分条目",
          "  teamagent verify [--report=path]",
          "                                   跑 5 个验证场景（踩坑→学习→避坑），输出 PRR/KP 指标",
          "  teamagent e2e-evaluate [--json] [--keep-temp]",
          "                                   真实 SQLite + analyze + compile + PreToolUse 测评学习、触发、误触发和新成员可见性",
          "  teamagent recording --help",
          "                                   Recording Memory 导入、检索、注入、指标和 golden benchmark",
          "  teamagent dogfood-report [--output=path]",
          "                                   扫 events.jsonl + knowledge.jsonl + git log，自动生成自举报告",
          "  teamagent dashboard --watch [--open] [--port=8787] [--interval=2s]",
          "                                   启动实时 HTML dashboard：生成 docs/dashboard.html，周期刷新真实规则/事件数据并本地服务",
          "  teamagent dashboard --once",
          "                                   只生成一次 docs/dashboard.html，不启动服务器",
          "  teamagent compile [--dry-run] [--skills-only] [--markdown-only] [--force] [--target=claude|codex|both]",
          "                                   编译出口：CLAUDE.md (canonical+, 3000 token 预算) + Claude Agent Skills (stable+)；Codex 通过软链接读取",
          "                                   --dry-run: 预览将写/删哪些文件，不实际写入",
          "                                   --skills-only / --markdown-only: 只写其中一路出口",
          "  teamagent config stop-mode <sync|async>  切换 Stop hook 运行模式（默认 sync）",
          "  teamagent config show                    查看当前配置",
          "  teamagent scan-errors [--mode=efficient|full] [--since=<duration|ISO>] [--min-freq=N] [--dry-run] [--quiet]",
          "                                   自动采集错误信号 → 提取候选规则 → 写入候选队列",
          "  teamagent review-candidates [--limit=N]",
          "                                   交互式审核候选规则：[a]批准 [r]拒绝 [s]跳过 [q]退出",
          "  teamagent pr-cycle [--pr=N] [--wait-ms=300000] [--dry-run]",
          "                                   创建/定位 PR，等待后检查 review；有反馈时要求先更新文档/规则并用 claudefast/codexfastg 验证答案",
          "  teamagent migrate-v6 [--dry-run] [--limit=N] [--db=<path>]",
          "                                   迁移旧规则（trigger_description 为空）通过 LLM 生成双描述，并写入 vec0 和 FTS5",
          "  teamagent migrate-v7 [--dry-run] [--limit=N] [--db=<path>]",
          "                                   批量为存量规则生成 tool_context_description，并写入 knowledge_tool_vec",
          "  teamagent ingest --from-insights <path> | --from-audit | --from-pr <n>",
          "                   | --from-git [--since=30d] | --from-ci [--since=30d] | --from-candidates <path>",
          "                                   多源摄入：Claude /insights / npm audit / PR review / git hotspot / CI failure",
          "                                   半自动源加 --dry-run 只产出候选 md 供人工勾选",
          "",
          "环境变量:",
          "  TEAMAGENT_VISIBILITY=silent|smart|verbose    归因渲染模式（默认 verbose）",
          "",
        ].join("\n"),
      );
      return;
    }
    default:
      process.stderr.write(`未知命令: ${command}\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
