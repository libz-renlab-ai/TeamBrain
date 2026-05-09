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
  /** Aliases used by sandbox-style callers (mirror of toolName/toolInput). */
  tool?: string;
  input?: Record<string, unknown>;
}

/** Structured result of executeDemoHook: human text + machine-readable decision. */
export interface DemoHookResult {
  output: string;
  decision: "allow" | "deny";
}

function decisionFor(rule: KnowledgeEntry | undefined): "allow" | "deny" {
  if (rule && rule.enforcement === "block") return "deny";
  return "allow";
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
export function executeDemoHook(opts: DemoHookOptions): DemoHookResult {
  const cwd = normalizeCwd(opts.cwd ?? process.cwd());
  const home = opts.homeDir ?? os.homedir();
  const toolName = opts.toolName ?? opts.tool ?? "";
  const toolInput = opts.toolInput ?? opts.input ?? {};

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

  const matches = matchRules({ toolName, input: toolInput }, rules);

  if (matches.length === 0) {
    const out = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "🟢 TeamAgent · 模拟 PreToolUse 结果",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `▸ 工具: ${toolName}`,
      `▸ 输入: ${JSON.stringify(toolInput)}`,
      "▸ 决策: 通过 (无规则命中)",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n");
    return { output: out, decision: "allow" };
  }

  const top = matches[0]!;

  if (top.enforcement === "block") {
    const reason = formatBlockReason(top);
    const out = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "🚫 TeamAgent · 模拟 PreToolUse 结果",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `▸ 工具: ${toolName}`,
      `▸ 输入: ${JSON.stringify(toolInput)}`,
      "▸ 决策: deny",
      "▸ 拦截原因:",
      ...reason.split("\n").map((ln) => `    ${ln}`),
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n");
    return { output: out, decision: "deny" };
  }

  if (top.enforcement === "warn") {
    const msg = formatWarnMessage(top);
    const out = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "💡 TeamAgent · 模拟 PreToolUse 结果",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `▸ 工具: ${toolName}`,
      `▸ 输入: ${JSON.stringify(toolInput)}`,
      "▸ 决策: allow",
      "▸ 给 AI 的提示:",
      ...msg.split("\n").map((ln) => `    ${ln}`),
      `▸ 附加上下文: ${top.correct_pattern}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n");
    return { output: out, decision: "allow" };
  }

  // suggest / passive 默认通过
  const out = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "🟢 TeamAgent · 模拟 PreToolUse 结果",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `▸ 工具: ${toolName}`,
    `▸ 输入: ${JSON.stringify(toolInput)}`,
    "▸ 决策: 通过 (suggest/passive)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ].join("\n");
  return { output: out, decision: decisionFor(top) };
}

/**
 * 解析 demo-hook 的 CLI 参数：argv[0]=tool, argv[1..]=key=value
 *
 * 支持两种输入形式：
 *  1. 空格分隔多 slot（canonical）：`Write file_path=test.js content='console.log(1)'`
 *  2. 单 slot 整个 JSON：`Write '{"file_path":"test.js","content":"console.log(1)"}'`
 *
 * 历史注意：曾尝试支持单 slot 内 `;` / `&` 分隔多字段（例如
 * `Write 'file_path=a;content=b'`），但 `;` 是 shell 命令分隔符、`&` 在 URL
 * 查询串里随处可见，会把 `command=echo hi; rm -rf /` 或
 * `url=https://x.com/?a=1&b=2` 静默切断。Demo 工具必须忠实回放用户输入，所以
 * 那条路径已经下线（PR #183 fix）。多字段请用 JSON 形式。
 */
export function parseDemoHookArgs(args: string[]): DemoHookOptions | null {
  if (args.length === 0) return null;
  const toolName = args[0]!;
  const rest = args.slice(1);

  // Form 2: 单个 slot 且以 `{` 开头 `}` 结尾，整体当 JSON 解析为 toolInput
  if (rest.length === 1) {
    const only = rest[0]!.trim();
    if (only.startsWith("{") && only.endsWith("}")) {
      try {
        const parsed = JSON.parse(only);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const toolInput = parsed as Record<string, unknown>;
          return { toolName, toolInput, tool: toolName, input: toolInput };
        }
      } catch {
        // JSON parse 失败时 fallthrough 到普通 key=value 解析
      }
    }
  }

  // Form 1: 空格分隔多 slot，每 slot 是 `key=value`。value 内的 `;` / `&` 不被切。
  const toolInput: Record<string, unknown> = {};
  for (const a of rest) {
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

  return { toolName, toolInput, tool: toolName, input: toolInput };
}
