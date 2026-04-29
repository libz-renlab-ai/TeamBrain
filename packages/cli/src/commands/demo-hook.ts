import os from "node:os";
import path from "node:path";
import nodeFs from "node:fs";
import { DualLayerStore, normalizeCwd } from "@teamagent/adapters";
import { matchRules } from "@teamagent/core";
import type { KnowledgeEntry } from "@teamagent/types";

export interface DemoHookOptions {
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd?: string;
  homeDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
}

function formatBlockReason(rule: KnowledgeEntry): string {
  return [
    `🚫 TeamAgent 拦截 (置信 ${rule.confidence.toFixed(2)})`,
    `应改用: ${rule.correct_pattern}`,
    `原因: ${rule.reasoning}`,
    `(规则 id: ${rule.id})`,
  ].join("\n");
}

function formatWarnMessage(rule: KnowledgeEntry): string {
  return [
    `💡 TeamAgent 经验 (置信 ${rule.confidence.toFixed(2)})`,
    `推荐: ${rule.correct_pattern}`,
    `原因: ${rule.reasoning}`,
  ].join("\n");
}

/**
 * 离线模拟一次 PreToolUse hook。
 * 用真实的知识库（personal/global SQLite）做匹配，但不需要 Claude Code。
 *
 * 返回归因式 stdout 文本（人类可读），而不是 hook JSON——便于命令行查看。
 *
 * B-066 — IRON LAW: demo-hook 是离线诊断命令，**严禁**写入 events.db、
 * 触发 store.update / hit_count / success_count 增量、或向 attribution
 * bus emit 任何被下游 calibrate 视为真实证据的事件。校准管线靠 events.db
 * 推断置信度，demo 一次会导致规则在没有任何真实触发的情况下置信度漂移
 * （历史上实测 0.70 → 0.83）。任何修改本函数的人都必须保持这个不变量；
 * `__tests__/demo-hook.test.ts` 里有 lock 这条约束的两条单元测试。
 */
export function executeDemoHook(opts: DemoHookOptions): string {
  const cwd = normalizeCwd(opts.cwd ?? process.cwd());
  const home = opts.homeDir ?? os.homedir();

  const projectDbPath = opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db");

  // 只打开已存在的 DB，避免在测试目录里意外创建空文件（也规避 Windows WAL 锁）
  const effectiveProject = nodeFs.existsSync(projectDbPath) ? projectDbPath : ":memory:";
  const effectiveGlobal = nodeFs.existsSync(userGlobalDbPath) ? userGlobalDbPath : ":memory:";

  let rules: KnowledgeEntry[] = [];
  try {
    const store = new DualLayerStore({
      projectDbPath: effectiveProject,
      userGlobalDbPath: effectiveGlobal,
    });
    rules = store.findActive();
    store.close();
  } catch {
    // store 打开失败时降级为空规则集
  }

  const matches = matchRules({ toolName: opts.toolName, input: opts.toolInput }, rules);

  if (matches.length === 0) {
    return [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "🟢 TeamAgent · 模拟 PreToolUse 结果",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `▸ 工具: ${opts.toolName}`,
      `▸ 输入: ${JSON.stringify(opts.toolInput)}`,
      "▸ 决策: 通过 (无规则命中)",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n");
  }

  const top = matches[0]!;

  if (top.enforcement === "block") {
    const reason = formatBlockReason(top);
    return [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "🚫 TeamAgent · 模拟 PreToolUse 结果",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `▸ 工具: ${opts.toolName}`,
      `▸ 输入: ${JSON.stringify(opts.toolInput)}`,
      "▸ 决策: deny",
      "▸ 拦截原因:",
      ...reason.split("\n").map((ln) => `    ${ln}`),
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n");
  }

  if (top.enforcement === "warn") {
    const msg = formatWarnMessage(top);
    return [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "💡 TeamAgent · 模拟 PreToolUse 结果",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `▸ 工具: ${opts.toolName}`,
      `▸ 输入: ${JSON.stringify(opts.toolInput)}`,
      "▸ 决策: allow",
      "▸ 给 AI 的提示:",
      ...msg.split("\n").map((ln) => `    ${ln}`),
      `▸ 附加上下文: ${top.correct_pattern}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n");
  }

  // suggest / passive 默认通过
  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🟢 TeamAgent · 模拟 PreToolUse 结果",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `▸ 工具: ${opts.toolName}`,
    `▸ 输入: ${JSON.stringify(opts.toolInput)}`,
    "▸ 决策: 通过 (无规则命中)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ].join("\n");
}

/** 解析 demo-hook 的 CLI 参数：argv[0]=tool, argv[1..]=key=value */
export function parseDemoHookArgs(args: string[]): DemoHookOptions | null {
  if (args.length === 0) return null;
  const toolName = args[0]!;
  const toolInput: Record<string, unknown> = {};

  for (const a of args.slice(1)) {
    const idx = a.indexOf("=");
    if (idx < 0) continue;
    const k = a.slice(0, idx);
    const v = a.slice(idx + 1);
    // 尝试解析 JSON，否则保留为字符串
    try {
      toolInput[k] = JSON.parse(v);
    } catch {
      toolInput[k] = v;
    }
  }

  return { toolName, toolInput };
}
