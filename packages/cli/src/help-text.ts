/**
 * CLI surface triage — single source of truth for the 3-tier command split.
 *
 * `teamagent` ships a long list of subcommands, but they are not all equal.
 * Cut once with the knife "can this command prove a business feature?":
 *
 *   - STOREFRONT     — the customer's first glance, curated by the active
 *                       business feature (auto-capture / learning). The
 *                       Feature #2 (team realtime visibility) and Feature #3
 *                       (video recording + centralized upload) storefront
 *                       slots were removed when the upload chain (digital-twin
 *                       uploader, realtime cc-status push, video upload) was
 *                       deleted; M5 viral sync remains live in BACKGROUND.
 *   - FOLDED         — install / uninstall / enable / disable / config
 *                       plumbing; collapsed to a one-line list in `--help`.
 *   - BACKGROUND     — engine-room commands; reachable but only listed under
 *                       `teamagent help --all`.
 *
 * This is a *presentation* triage only. Every command in all three tiers still
 * has its `case` in bin.ts and stays fully callable — not one line of command
 * implementation changed. `bin-help-triage.test.ts` asserts the union of the
 * three tiers exactly equals the `case` labels declared in bin.ts, so a
 * newly-added command that forgets to pick a tier fails CI.
 *
 * The storefront tier is declared ONCE, as `STOREFRONT_ENTRIES` (structured
 * objects). `STOREFRONT_COMMANDS` (the name list the union/drift-guard needs)
 * and `buildStorefrontHelp()` (the rendered text) are both *derived* from it —
 * there is no second hand-maintained copy of storefront command names.
 */

/** One storefront command: its tier membership AND its rendered help line. */
export interface StorefrontEntry {
  /** Subcommand name — must match a `case` label in bin.ts. */
  readonly name: string;
  /** Section header this command renders under (business-feature group). */
  readonly group: string;
  /** The `teamagent <name> ...` invocation line shown in help. */
  readonly usage: string;
  /** One-line description shown under the usage line. */
  readonly desc: string;
}

/**
 * Tier 1 — the 8 storefront commands, in render order, grouped by the business
 * feature each one proves. This is the ONLY place storefront commands are
 * declared; `STOREFRONT_COMMANDS` and `buildStorefrontHelp()` derive from it.
 */
export const STOREFRONT_ENTRIES: readonly StorefrontEntry[] = [
  {
    name: "init",
    group: "入口",
    usage: "teamagent init [--target=claude|codex|both] [--install-plugins]",
    desc: "一键装到当前项目：建目录 + 注入元原则 + 注册集成 + 导出 Skills",
  },
  {
    name: "analyze",
    group: "特性① AI 不再重犯旧错（自动捕获 + 学习）",
    usage: "teamagent analyze [--commit]",
    desc: "分析 Claude Code 会话日志，识别纠正时刻；--commit 提取成知识条目入库",
  },
  {
    name: "doctor",
    group: "特性① AI 不再重犯旧错（自动捕获 + 学习）",
    usage: "teamagent doctor [--fix]",
    desc: "诊断安装环境（Node / Claude Code / sqlite-vec / Hook / CLAUDE.md）",
  },
  {
    name: "dashboard",
    group: "本地状态",
    usage: "teamagent dashboard --watch",
    desc: "启动本地 HTML dashboard，周期刷新真实规则/事件数据并本地服务",
  },
  {
    name: "daily",
    group: "本地状态",
    usage: "teamagent daily",
    desc: "跨项目扫今天活动，输出 member×project 一句话日报骨架",
  },
];

/** Tier 1 names — derived from STOREFRONT_ENTRIES, consumed by the union/drift guard. */
export const STOREFRONT_COMMANDS: readonly string[] = STOREFRONT_ENTRIES.map(
  (e) => e.name,
);

/** Tier 2 — install/config/lifecycle plumbing, collapsed to a one-line list in `--help`. */
export const FOLDED_COMMANDS = [
  "install",
  "install-codex",
  "install-plugins",
  "install-hook",
  "install-user-hook",
  "uninstall",
  "uninstall-hook",
  "uninstall-user-hook",
  "enable",
  "disable",
  "config",
  "docs-propagate",
  "warmup",
] as const;

/** Tier 3 — engine-room commands, listed only under `teamagent help --all`. */
export const BACKGROUND_COMMANDS = [
  "skeleton-demo",
  "m5-infect",
  "m5-bootstrap",
  "m5-share",
  "m5-sync",
  "m5-replay",
  "m5-delete",
  "m5-status",
  "m5-publish",
  "inspect-member",
  "pitfall",
  "stats",
  "try",
  "demo",
  "review",
  "required-check",
  "calibrate",
  "verify",
  "verify-anchors",
  "e2e-evaluate",
  "ingest",
  "dogfood-report",
  "bug-report",
  "recording",
  "pack",
  "fixture",
  "symphony",
  "compile",
  "compile-cursor",
  "migrate-v6",
  "migrate-v7",
  "migrate",
  "scan-errors",
  "review-candidates",
  "team-export",
  "team-import",
  "sync",
  "pr-cycle",
  "migrate-auto",
  "update",
  "whatsnew",
  "pair",
  "reclassify",
] as const;

/** Every triaged command name across all three tiers. */
export const ALL_TRIAGED_COMMANDS: readonly string[] = [
  ...STOREFRONT_COMMANDS,
  ...FOLDED_COMMANDS,
  ...BACKGROUND_COMMANDS,
];

/**
 * Whether `teamagent --help` / `teamagent help` should print the full
 * 67-command listing instead of the 8-command storefront view.
 *
 * Only the explicit `--all` flag triggers it — a bare positional `all` does
 * NOT, so a stray `all` token elsewhere in the args can't silently flip the
 * output. `--all` is the form documented in the storefront help footer and
 * used by the judge harness.
 */
export function isShowAll(rest: readonly string[]): boolean {
  return rest.includes("--all");
}

/**
 * The default `teamagent --help` body: only the 8 storefront commands, grouped
 * by the business feature each one proves, plus a folded one-line list for the
 * 13 lifecycle commands and a hint to `teamagent help --all` for the rest.
 *
 * Rendered entirely from STOREFRONT_ENTRIES + FOLDED_COMMANDS — no hand-kept
 * copy of command names lives in this function.
 */
export function buildStorefrontHelp(): string {
  const lines: string[] = [
    "teamagent — TeamAgent CLI",
    "",
    "默认只列 8 个门面命令（按 3 大业务特性精选）。67 个命令全部仍可调用。",
  ];
  let lastGroup = "";
  for (const entry of STOREFRONT_ENTRIES) {
    if (entry.group !== lastGroup) {
      lines.push("", `${entry.group}:`);
      lastGroup = entry.group;
    }
    lines.push(`  ${entry.usage}`, `      ${entry.desc}`);
  }
  lines.push(
    "",
    "配置 / 生命周期（13 个安装·卸载·开关·配置命令已折叠，完整帮助见 teamagent help --all）:",
    `  ${FOLDED_COMMANDS.join(" · ")}`,
    "",
    "完整 67 个命令（含 46 个后台引擎室命令）:  teamagent help --all",
    "",
    "环境变量:",
    "  TEAMAGENT_VISIBILITY=silent|smart|verbose    归因渲染模式（默认 verbose）",
    "",
  );
  return lines.join("\n");
}
