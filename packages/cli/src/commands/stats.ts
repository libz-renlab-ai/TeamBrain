import { duckifyText } from "@teamagent/core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  DualLayerStore,
  SqliteEventLog,
  openDb,
} from "@teamagent/adapters";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

export interface StatsOptions {
  projectDbPath?: string;
  userGlobalDbPath?: string;
  eventsDbPath?: string;
  cwd?: string;
  homeDir?: string;
  /** 校准变化窗口（天），默认 7 */
  windowDays?: number;
  now?: () => Date;
  /** 展示单条规则的 tier/confidence/demerit 详情 */
  explain?: string;
  /** 列出被卡在晋升通道的规则（current_tier=probation，tier_entered_at 超 N 天） */
  stuckInPromotion?: boolean;
  /** --stuck-in-promotion 的天数阈值，默认 14 */
  stuckDays?: number;
  /** 展示 ai.override.ignored / complied 的统计 */
  overrideSignals?: boolean;
}

/** 校准变化聚合：按 knowledge_id 累计该窗口内的总 delta */
export interface ConfidenceMovement {
  knowledge_id: string;
  totalDelta: number;
  trigger?: string;
  archivedThisWindow: boolean;
}

/**
 * Issue #245: 升级事件 7d 摘要。Counts each `update-*` kind in the recent
 * window so the CEO sees prompt impressions / snooze drop-offs / installs
 * conversion side-by-side. `total` is the sum across the 4 kinds.
 */
export interface UpgradeEventCounts {
  promptShown: number;
  snoozed: number;
  neverSet: number;
  installed: number;
  total: number;
}

function resolvePaths(opts: StatsOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    eventsDbPath:
      opts.eventsDbPath ?? path.join(home, ".teamagent", "events.db"),
  };
}

/**
 * 纯函数：从 calibrator.adjusted 事件聚合每条规则的 confidence 变化。
 * 仅看 windowDays 内的事件，按 |totalDelta| 倒序。
 */
export function aggregateConfidenceMovements(
  events: PersistedEvent[],
  windowDays: number,
  now: Date,
): ConfidenceMovement[] {
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1000;
  const recent = events.filter((e) => {
    if (e.kind !== "calibrator.adjusted") return false;
    if (!e.knowledge_id) return false;
    if (typeof e.confidence_before !== "number") return false;
    if (typeof e.confidence_after !== "number") return false;
    try {
      return new Date(e.timestamp).getTime() >= cutoff;
    } catch {
      return false;
    }
  });

  const byId = new Map<string, ConfidenceMovement>();
  for (const e of recent) {
    const id = e.knowledge_id!;
    const delta = (e.confidence_after as number) - (e.confidence_before as number);
    const existing = byId.get(id);
    if (existing) {
      existing.totalDelta += delta;
      if (e.status_after === "archived") existing.archivedThisWindow = true;
    } else {
      byId.set(id, {
        knowledge_id: id,
        totalDelta: delta,
        archivedThisWindow: e.status_after === "archived",
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta),
  );
}

/**
 * Issue #245: pure aggregation of `update-*` events in the trailing window.
 * Reads kind from a flat list of `PersistedEvent`-like rows; tolerates
 * events that don't carry an `update-*` kind by simply not matching.
 */
export function aggregateUpgradeEvents7d(
  events: PersistedEvent[],
  windowDays: number,
  now: Date,
): UpgradeEventCounts {
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1000;
  const counts: UpgradeEventCounts = {
    promptShown: 0,
    snoozed: 0,
    neverSet: 0,
    installed: 0,
    total: 0,
  };
  for (const e of events) {
    if (typeof e.kind !== "string" || !e.kind.startsWith("update-")) continue;
    let ts = 0;
    try {
      ts = new Date(e.timestamp).getTime();
    } catch {
      continue;
    }
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    switch (e.kind) {
      case "update-prompt-shown": counts.promptShown += 1; counts.total += 1; break;
      case "update-snoozed":      counts.snoozed += 1;      counts.total += 1; break;
      case "update-never-set":    counts.neverSet += 1;     counts.total += 1; break;
      case "update-installed":    counts.installed += 1;    counts.total += 1; break;
      default: /* unknown update-* kind: ignore */ break;
    }
  }
  return counts;
}

/**
 * Issue #245: render 升级事件 7d 摘要 段落。Returns "" when total === 0
 * so an empty events.db doesn't pollute the report with a noisy header.
 */
export function renderUpgradeEvents7d(
  counts: UpgradeEventCounts,
  windowDays: number,
): string {
  if (counts.total === 0) return "";
  const lines: string[] = [];
  lines.push(`升级事件（最近 ${windowDays} 天，共 ${counts.total} 条）:`);
  lines.push(`  banner 弹出 (update-prompt-shown):  ${counts.promptShown}`);
  lines.push(`  snooze 推迟 (update-snoozed):       ${counts.snoozed}`);
  lines.push(`  永久关闭 (update-never-set):        ${counts.neverSet}`);
  lines.push(`  安装完成 (update-installed):        ${counts.installed}`);
  return lines.join("\n") + "\n";
}

/** 纯函数：给定条目列表 + 校准变化，生成 stats 报告文本。 */
export function renderStats(
  byScope: { personal: KnowledgeEntry[]; team: KnowledgeEntry[]; global: KnowledgeEntry[] },
  movements: ConfidenceMovement[] = [],
  windowDays = 7,
  upgradeCounts: UpgradeEventCounts = { promptShown: 0, snoozed: 0, neverSet: 0, installed: 0, total: 0 },
): string {
  const all = [...byScope.personal, ...byScope.team, ...byScope.global];
  const active = all.filter((e) => e.status === "active");
  const archived = all.filter((e) => e.status === "archived");

  if (all.length === 0) {
    const emptyLines = [
      "📊 TeamAgent 知识库统计",
      "",
      "尚无知识条目。",
      "",
      "录入方式:",
      "  pnpm teamagent pitfall            交互式录入",
      "  pnpm teamagent pitfall --non-interactive --trigger=... --wrong=... --correct=... --reason=...",
      "",
    ];
    // Issue #245: even in the "no knowledge yet" state, show 升级事件
    // because a fresh user can already have prompt/snooze/install rows
    // from SessionStart hooks before they record any rule.
    const upgradeBlockEarly = renderUpgradeEvents7d(upgradeCounts, windowDays);
    if (upgradeBlockEarly) {
      emptyLines.push(upgradeBlockEarly.trimEnd(), "");
    }
    return emptyLines.join("\n");
  }

  const byCategory: Record<string, number> = { C: 0, E: 0, S: 0, K: 0 };
  for (const e of active) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }

  const byScopeLevel = {
    personal: byScope.personal.filter((e) => e.status === "active").length,
    team: byScope.team.filter((e) => e.status === "active").length,
    global: byScope.global.filter((e) => e.status === "active").length,
  };

  const topHits = active
    .filter((e) => e.hit_count > 0)
    .sort((a, b) => b.hit_count - a.hit_count)
    .slice(0, 5);

  const recent = active
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const lines: string[] = [];
  lines.push("📊 TeamAgent 知识库统计");
  lines.push("");
  lines.push(
    `总数: ${all.length} (活跃 ${active.length}${archived.length > 0 ? `, 归档 ${archived.length}` : ""})`,
  );
  lines.push("");
  lines.push("按作用域:");
  lines.push(`  personal  ${byScopeLevel.personal}`);
  lines.push(`  team      ${byScopeLevel.team}`);
  lines.push(`  global    ${byScopeLevel.global}`);
  lines.push("");
  lines.push("按分类:");
  lines.push(`  C 代码层  ${byCategory.C}`);
  lines.push(`  E 工程层  ${byCategory.E}`);
  lines.push(`  S 策略层  ${byCategory.S}`);
  lines.push(`  K 认知层  ${byCategory.K}`);
  lines.push("");

  if (topHits.length > 0) {
    lines.push(`Top ${topHits.length} 高频命中:`);
    for (const e of topHits) {
      lines.push(
        `  [${e.hit_count}次] ${e.trigger} → ${e.correct_pattern} (conf=${e.confidence.toFixed(2)})`,
      );
    }
    lines.push("");
  }

  lines.push(`最近 ${recent.length} 条新增:`);
  for (const e of recent) {
    const date = e.created_at.slice(0, 10);
    lines.push(`  [${date}] ${e.category}/${e.tags[0] ?? "-"}  ${e.trigger}`);
  }

  // M6: 本窗口 confidence 变化 top 5
  if (movements.length > 0) {
    lines.push("");
    lines.push(`本周（${windowDays} 天）confidence 变化 top ${Math.min(5, movements.length)}:`);
    const triggerById = new Map<string, string>();
    for (const e of all) triggerById.set(e.id, e.trigger);
    for (const m of movements.slice(0, 5)) {
      const sign = m.totalDelta > 0 ? "+" : "";
      const tag = m.archivedThisWindow ? " [自动归档]" : "";
      const trig = triggerById.get(m.knowledge_id) ?? "(已删)";
      lines.push(
        `  ${sign}${m.totalDelta.toFixed(2)}  ${m.knowledge_id}${tag}`,
      );
      lines.push(`         ${trig.slice(0, 80)}`);
    }
  }

  // Issue #245: 升级事件 7d 摘要 — append after movements so the upgrade
  // funnel sits below confidence movements (both share the 7d window
  // semantics, which keeps the trailing-time-window section grouped).
  const upgradeBlock = renderUpgradeEvents7d(upgradeCounts, windowDays);
  if (upgradeBlock) {
    lines.push("");
    lines.push(upgradeBlock.trimEnd());
  }

  return lines.join("\n") + "\n";
}

/** 纯函数：渲染单条规则的 explain 详情。 */
export function renderExplain(entry: KnowledgeEntry | undefined, id: string): string {
  if (!entry) {
    return `rule ${id} not found\n`;
  }
  const debitUpdated = entry.demerit_last_updated || "never";
  const lines: string[] = [
    `rule ${entry.id}`,
    `  tier: ${entry.current_tier} (max ever: ${entry.max_tier_ever})`,
    `  confidence: ${entry.confidence.toFixed(3)}`,
    `  demerit: ${entry.demerit.toFixed(2)} (updated ${debitUpdated})`,
  ];
  return lines.join("\n") + "\n";
}

/** 纯函数：找出卡在晋升通道的规则（current_tier=probation，且已在该 tier 超 stuckDays 天）。 */
export function findStuckInPromotion(
  entries: KnowledgeEntry[],
  stuckDays: number,
  now: Date,
): KnowledgeEntry[] {
  const cutoffMs = now.getTime() - stuckDays * 24 * 3600 * 1000;
  return entries.filter((e) => {
    if (e.status !== "active") return false;
    if (e.current_tier !== "probation") return false;
    const enteredAt = e.tier_entered_at || e.created_at;
    if (!enteredAt) return true; // unknown entry date → report it
    try {
      return new Date(enteredAt).getTime() <= cutoffMs;
    } catch {
      return false;
    }
  });
}

/** 纯函数：渲染 stuck-in-promotion 表格。 */
export function renderStuckInPromotion(stuck: KnowledgeEntry[], stuckDays: number, now: Date): string {
  if (stuck.length === 0) {
    return `📌 stuck-in-promotion: 无规则卡在 probation 超 ${stuckDays} 天\n`;
  }
  const lines: string[] = [];
  lines.push(`📌 stuck-in-promotion（probation tier > ${stuckDays} 天，共 ${stuck.length} 条）:`);
  lines.push("");
  const COL_ID = 24;
  const COL_DAYS = 6;
  lines.push(
    `  ${"ID".padEnd(COL_ID)} ${"天数".padStart(COL_DAYS)}  Trigger`,
  );
  lines.push("  " + "─".repeat(COL_ID + COL_DAYS + 14));
  for (const e of stuck) {
    const enteredAt = e.tier_entered_at || e.created_at;
    let days = "?";
    if (enteredAt) {
      try {
        const d = Math.floor((now.getTime() - new Date(enteredAt).getTime()) / (24 * 3600 * 1000));
        days = String(d);
      } catch {
        // ignore
      }
    }
    lines.push(
      `  ${e.id.padEnd(COL_ID)} ${days.padStart(COL_DAYS)}  ${e.trigger.slice(0, 60)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** 纯函数：渲染 ai.override.ignored / complied 的统计。 */
export function renderOverrideSignals(events: PersistedEvent[]): string {
  const counts = new Map<string, { ignored: number; complied: number }>();

  for (const e of events) {
    if (e.kind !== "ai.override.ignored" && e.kind !== "ai.override.complied") continue;
    const id = e.knowledge_id ?? "(unknown)";
    const entry = counts.get(id) ?? { ignored: 0, complied: 0 };
    if (e.kind === "ai.override.ignored") entry.ignored++;
    else entry.complied++;
    counts.set(id, entry);
  }

  if (counts.size === 0) {
    return "TeamAgent Override Signals\n\n  (无记录)\n";
  }

  const rows = [...counts.entries()].sort((a, b) => b[1].ignored - a[1].ignored);

  const lines = ["TeamAgent Override Signals", ""];
  lines.push(
    "  Rule ID".padEnd(32) + "ignored".padEnd(10) + "complied",
  );
  lines.push("  " + "─".repeat(50));
  for (const [id, { ignored, complied }] of rows) {
    lines.push(
      `  ${id.slice(0, 30).padEnd(32)}ignored: ${String(ignored).padEnd(6)}complied: ${complied}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** IO 入口：读 SQLite 知识库 + events.db 并渲染统计。 */
export function executeStats(opts: StatsOptions = {}): string {
  const paths = resolvePaths(opts);
  const windowDays = opts.windowDays ?? 7;
  const now = (opts.now ?? (() => new Date()))();

  // --stuck-in-promotion: show rules stuck in probation tier
  if (opts.stuckInPromotion) {
    const stuckDays = opts.stuckDays ?? 14;
    let allEntries: KnowledgeEntry[] = [];
    try {
      const projectDbExists = fs.existsSync(paths.projectDbPath);
      const globalDbExists = fs.existsSync(paths.userGlobalDbPath);
      if (projectDbExists || globalDbExists) {
        fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
        fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
        const store = new DualLayerStore({
          projectDbPath: paths.projectDbPath,
          userGlobalDbPath: paths.userGlobalDbPath,
        });
        allEntries = store.getAll();
        store.close();
      }
    } catch {
      // DB 损坏 → 视为空
    }
    const stuck = findStuckInPromotion(allEntries, stuckDays, now);
    return duckifyText(renderStuckInPromotion(stuck, stuckDays, now));
  }

  // --override-signals: show per-rule ignored/complied counts
  if (opts.overrideSignals) {
    let events: PersistedEvent[] = [];
    try {
      if (fs.existsSync(paths.eventsDbPath)) {
        const eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
        events = eventLog.readAll();
        eventLog.close();
      }
    } catch {
      // 损坏 → 视为空
    }
    return duckifyText(renderOverrideSignals(events));
  }

  // --explain <rule-id>: just look up the entry and print v2 fields
  if (opts.explain !== undefined) {
    const id = opts.explain;
    let entry: KnowledgeEntry | undefined;
    try {
      const projectDbExists = fs.existsSync(paths.projectDbPath);
      const globalDbExists = fs.existsSync(paths.userGlobalDbPath);
      if (projectDbExists || globalDbExists) {
        fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
        fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
        const store = new DualLayerStore({
          projectDbPath: paths.projectDbPath,
          userGlobalDbPath: paths.userGlobalDbPath,
        });
        entry = store.getById(id);
        store.close();
      }
    } catch {
      // DB 损坏 → entry remains undefined
    }
    return duckifyText(renderExplain(entry, id));
  }

  let events: PersistedEvent[] = [];
  try {
    if (fs.existsSync(paths.eventsDbPath)) {
      const eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
      events = eventLog.readAll();
      eventLog.close();
    }
  } catch {
    // 损坏 → 视为空
  }
  const movements = aggregateConfidenceMovements(events, windowDays, now);
  const upgradeCounts = aggregateUpgradeEvents7d(events, windowDays, now);

  let personal: KnowledgeEntry[] = [];
  let team: KnowledgeEntry[] = [];
  let global: KnowledgeEntry[] = [];

  try {
    const projectDbExists = fs.existsSync(paths.projectDbPath);
    const globalDbExists = fs.existsSync(paths.userGlobalDbPath);
    if (projectDbExists || globalDbExists) {
      fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
      fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
      const store = new DualLayerStore({
        projectDbPath: paths.projectDbPath,
        userGlobalDbPath: paths.userGlobalDbPath,
      });
      const all = store.getAll();
      store.close();
      personal = all.filter((e) => e.scope.level === "personal");
      team = all.filter((e) => e.scope.level === "team");
      global = all.filter((e) => e.scope.level === "global");
    }
  } catch {
    // DB 损坏 → 视为空
  }

  return duckifyText(renderStats(
    { personal, team, global },
    movements,
    windowDays,
    upgradeCounts,
  ));
}
