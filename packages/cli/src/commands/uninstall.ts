import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installHook, uninstallHook } from "./install-hook.js";

/** 宽松匹配 TEAMAGENT 区块标记；comment 中间可以是任何说明文字。 */
const BLOCK_START_RE = /<!--\s*TEAMAGENT:START[^>]*-->/;
const BLOCK_END_RE = /<!--\s*TEAMAGENT:END[^>]*-->/;

export interface DisableEnableOptions {
  cwd?: string;
  hookEntry?: string;
}

export interface UninstallOptions {
  cwd?: string;
  homeDir?: string;
  /** 同时删除知识数据（personal/team/global stores）。默认 false 保留。 */
  deleteData?: boolean;
  /** 不真删——只报告会做什么。 */
  dryRun?: boolean;
}

export interface UninstallResult {
  dryRun: boolean;
  actions: string[];
}

/** 禁用：删 hook 注册，不动数据。可后续 enable 恢复。 */
export function disable(opts: DisableEnableOptions = {}): {
  settingsPath: string;
  removed: boolean;
} {
  return uninstallHook(opts);
}

/** 启用：重新注册 hook（等价于 install-hook）。 */
export function enable(opts: DisableEnableOptions = {}): {
  settingsPath: string;
  hookEntry: string;
  alreadyInstalled: boolean;
} {
  return installHook(opts);
}

/**
 * 完全卸载：
 * - 移除 .claude/settings.local.json 的 hook 注册
 * - 移除 CLAUDE.md 里的 TEAMAGENT:START/END 区块（保留其他内容）
 * - 可选：--delete-data 把 ~/.teamagent + ./.teamagent 全删掉
 *
 * 失败处理：单步失败只 warn，不中止；actions 逐条列出实际做了什么，
 * 对齐设计文档"不承诺原子性"的哲学。
 */
export function uninstall(opts: UninstallOptions = {}): UninstallResult {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  const dryRun = opts.dryRun ?? false;
  const actions: string[] = [];

  // 1. 卸 hook
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  if (fs.existsSync(settingsPath)) {
    if (dryRun) {
      actions.push(`(dry-run) 会从 ${settingsPath} 移除 TeamAgent hook`);
    } else {
      try {
        const r = uninstallHook({ cwd });
        actions.push(
          r.removed
            ? `已移除 hook 注册: ${r.settingsPath}`
            : `hook 注册未发现（已无），跳过: ${r.settingsPath}`,
        );
      } catch (err) {
        actions.push(`⚠ 移除 hook 失败: ${String(err).slice(0, 160)}`);
      }
    }
  } else {
    actions.push(`无 .claude/settings.local.json，跳过 hook 卸载`);
  }

  // 2. 移除 CLAUDE.md 的 TEAMAGENT 区块
  const claudeMd = path.join(cwd, "CLAUDE.md");
  if (fs.existsSync(claudeMd)) {
    if (dryRun) {
      actions.push(`(dry-run) 会从 ${claudeMd} 移除 TEAMAGENT 区块`);
    } else {
      try {
        const stripped = stripTeamagentBlock(
          fs.readFileSync(claudeMd, "utf-8"),
        );
        if (stripped.changed) {
          // 如果剥掉 TEAMAGENT 区块后只剩空白（仅换行/空格），干脆删 CLAUDE.md：
          // 留一个 1-byte 空文件给用户的工作区只是垃圾，且 init 会重建。
          if (stripped.content.trim().length === 0) {
            fs.unlinkSync(claudeMd);
            actions.push(`已从 CLAUDE.md 移除 TEAMAGENT 区块（剩余空白，已删除空文件）`);
          } else {
            fs.writeFileSync(claudeMd, stripped.content, "utf-8");
            actions.push(`已从 CLAUDE.md 移除 TEAMAGENT 区块`);
          }
        } else {
          actions.push(`CLAUDE.md 无 TEAMAGENT 区块，跳过`);
        }
      } catch (err) {
        actions.push(`⚠ 处理 CLAUDE.md 失败: ${String(err).slice(0, 160)}`);
      }
    }
  } else {
    actions.push(`无 CLAUDE.md，跳过区块清理`);
  }

  // 3. 可选：删数据
  if (opts.deleteData) {
    const dirs = [
      path.join(home, ".teamagent"),
      path.join(cwd, ".teamagent"),
    ];
    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        actions.push(`数据目录不存在，跳过: ${d}`);
        continue;
      }
      if (dryRun) {
        actions.push(`(dry-run) 会删除 ${d}`);
      } else {
        try {
          fs.rmSync(d, { recursive: true, force: true });
          actions.push(`已删除: ${d}`);
        } catch (err) {
          actions.push(`⚠ 删除失败 ${d}: ${String(err).slice(0, 160)}`);
        }
      }
    }
  } else {
    actions.push(
      "保留知识数据（~/.teamagent 和 ./.teamagent）。加 --delete-data 同时清理",
    );
  }

  return { dryRun, actions };
}

/**
 * 从 CLAUDE.md 内容里剥掉 <!-- TEAMAGENT:START --> … <!-- TEAMAGENT:END --> 整段。
 * 保留上下文的空白结构（把 block 前后合并成单空行）。
 */
export function stripTeamagentBlock(content: string): {
  content: string;
  changed: boolean;
} {
  const startMatch = content.match(BLOCK_START_RE);
  if (!startMatch) return { content, changed: false };
  const startIdx = startMatch.index!;
  const afterStart = content.slice(startIdx + startMatch[0].length);
  const endMatch = afterStart.match(BLOCK_END_RE);
  if (!endMatch) return { content, changed: false };
  const endOfBlock =
    startIdx + startMatch[0].length + endMatch.index! + endMatch[0].length;
  const before = content.slice(0, startIdx).replace(/\s+$/, "");
  const after = content.slice(endOfBlock).replace(/^\s+/, "");
  const glue = before && after ? "\n\n" : "";
  const joined = before + glue + after;
  return { content: joined.endsWith("\n") ? joined : joined + "\n", changed: true };
}

/** B-127/B-149: known flags for `uninstall`; reject typos so a fat-fingered
 *  `--delette-data` does not silently miss the actual --delete-data toggle. */
const UNINSTALL_KNOWN_FLAGS = new Set<string>(["--delete-data", "--dry-run"]);

export class UninstallArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UninstallArgError";
  }
}

export function parseUninstallArgs(argv: string[]): UninstallOptions {
  const opts: UninstallOptions = {};
  for (const a of argv) {
    if (a === "--delete-data") opts.deleteData = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--")) {
      const base = a.split("=")[0]!;
      if (!UNINSTALL_KNOWN_FLAGS.has(base)) {
        throw new UninstallArgError(
          `uninstall: unknown flag "${a}". Run 'teamagent --help' for valid flags.`,
        );
      }
    }
  }
  return opts;
}

export function renderUninstallResult(r: UninstallResult): string {
  const lines: string[] = [];
  lines.push(r.dryRun ? "🔍 TeamAgent Uninstall (dry-run)" : "🗑️  TeamAgent Uninstall");
  lines.push("");
  for (const a of r.actions) lines.push(`  ${a}`);
  lines.push("");

  // Real uninstall + we actually removed something => leave a clear path back.
  // 否则用户跑完只看到一片"已移除"，不知道 statusline 和 4 类 hook 怎么找回来。
  // 详见 bugs.md B-155、PR fix/install-md-and-uninstall-hint。
  const removedSomething =
    !r.dryRun && r.actions.some((a) => a.startsWith("已"));
  if (removedSomething) {
    lines.push("🔁 想恢复（重新启用 statusline + PreToolUse / PostToolUse / UserPromptSubmit / Stop hooks）？跑：");
    lines.push("    pnpm teamagent install-hook    # 仅重装 hook + statusline，最小改动");
    lines.push("    pnpm teamagent init             # 顺便重新预热向量模型 + 注入 universal pack");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}
