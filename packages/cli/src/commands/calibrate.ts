import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  SqliteEventLog,
  SqliteKnowledgeStore,
  DualLayerStore,
  openDb,
  makeSkillCompiler,
} from "@teamagent/adapters";
import {
  defaultCalibrator,
  runCalibrationPipeline,
  v2Calibrator,
  runCalibrationPipelineV2,
  runCompile,
  type AdjustmentRecord,
  type CalibrationV2Record,
} from "@teamagent/core";
import type { PersistedEvent } from "@teamagent/types";
import type { Observation } from "@teamagent/adapters";

export interface CalibrateOptions {
  cwd?: string;
  homeDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
  eventsDbPath?: string;
  skillsDir?: string;
  claudeMdPath?: string;
  /** 只看会做什么，不写盘 */
  dryRun?: boolean;
  /** 只考虑最近 N 天的事件（默认全部） */
  days?: number;
  now?: () => Date;
  /** 使用旧 v1 pipeline（默认走 v2） */
  legacy?: boolean;
}

export interface CalibrateResult {
  dryRun: boolean;
  byScope: Array<{
    scope: "personal" | "team" | "global";
    storePath: string;
    scanned: number;
    adjustedCount: number;
    archivedCount: number;
    adjustments: AdjustmentRecord[];
    v2Adjustments?: CalibrationV2Record[];
  }>;
  totalAdjusted: number;
  totalArchived: number;
}

function resolvePaths(opts: CalibrateOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    eventsDbPath:
      opts.eventsDbPath ?? path.join(home, ".teamagent", "events.db"),
    skillsDir: opts.skillsDir ?? path.join(home, ".claude", "skills", "teamagent"),
  };
}

/**
 * Convert hook-post.result events into Observation objects for the v2 calibrator.
 * The v2 calibrator uses Wilson LB on observations — without this, confidence never moves.
 */
function synthesizeObservations(events: PersistedEvent[]): Observation[] {
  return events
    .filter((e) => e.kind === "hook-post.result" && e.knowledge_id)
    .map((e) => ({
      id: `obs-${e.id}`,
      knowledge_id: e.knowledge_id!,
      timestamp: e.timestamp,
      // B-055: use !== true so null/undefined/0 payload.success is treated as "failure"
      // (conservative; aligns with the closed-world assumption: unknown = not confirmed success)
      outcome: ((e as any).payload?.success !== true) ? "failure" : "success",
      source_event: e.id,
      tool_use_id: e.tool_use_id,
    } satisfies Observation));
}

function filterEventsByDays(
  events: PersistedEvent[],
  days: number | undefined,
  now: Date,
): PersistedEvent[] {
  if (!days || days <= 0) return events;
  const cutoff = now.getTime() - days * 24 * 3600 * 1000;
  return events.filter((e) => {
    try {
      return new Date(e.timestamp).getTime() >= cutoff;
    } catch {
      return true;
    }
  });
}

function makeEventId(now: Date): string {
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cal-${ts}-${rand}`;
}

function recordAdjustment(
  log: SqliteEventLog,
  adj: AdjustmentRecord,
  now: Date,
): void {
  log.append({
    id: makeEventId(now),
    kind: "calibrator.adjusted",
    knowledge_id: adj.knowledge_id,
    confidence_before: adj.before,
    confidence_after: adj.after,
    status_after: adj.status_after,
    timestamp: now.toISOString(),
    schema_version: 1,
  });
}

function recordV2Adjustment(
  log: SqliteEventLog,
  adj: CalibrationV2Record,
  now: Date,
): void {
  const event: PersistedEvent = {
    id: makeEventId(now),
    kind: "calibrator.adjusted",
    knowledge_id: adj.knowledge_id,
    confidence_before: adj.confidence_before,
    confidence_after: adj.confidence_after,
    status_after: adj.status_after,
    timestamp: now.toISOString(),
    schema_version: 1,
    demerit_before: adj.demerit_before,
    demerit_after: adj.demerit_after,
    tier_before: adj.tier_before,
    tier_after: adj.tier_after,
    tier_transition: adj.tier_transition,
    delta_breakdown: adj.delta_breakdown,
  };
  log.append(event);
}

/** 包一层只读 store 用于 dry-run（calibrator-pipeline 仍调 update，但 noop） */
function makeReadOnlyStore(real: SqliteKnowledgeStore): SqliteKnowledgeStore {
  const proxy = Object.create(real) as SqliteKnowledgeStore;
  (proxy as any).update = () => {};
  return proxy;
}

export async function executeCalibrate(
  opts: CalibrateOptions = {},
): Promise<CalibrateResult> {
  const paths = resolvePaths(opts);
  const dryRun = opts.dryRun ?? false;
  const legacy = opts.legacy ?? false;
  const now = opts.now ?? (() => new Date());
  const nowDate = now();

  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.eventsDbPath), { recursive: true });

  let events: PersistedEvent[] = [];
  let eventLog: SqliteEventLog | null = null;
  try {
    if (fs.existsSync(paths.eventsDbPath)) {
      eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
      events = eventLog.readAll();
    }
  } catch {
    // events DB 不存在或损坏 → 视为空
  }
  events = filterEventsByDays(events, opts.days, nowDate);

  const dualStore = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });

  const scopes: Array<{
    scope: "personal" | "global";
    label: "personal" | "team" | "global";
    store: SqliteKnowledgeStore;
    storePath: string;
  }> = [
    { scope: "personal", label: "personal", store: dualStore.getProjectStore(), storePath: paths.projectDbPath },
    { scope: "global", label: "global", store: dualStore.getGlobalStore(), storePath: paths.userGlobalDbPath },
  ];

  const byScope: CalibrateResult["byScope"] = [];
  let totalAdjusted = 0;
  let totalArchived = 0;

  if (legacy) {
    // ── v1 pipeline (unchanged) ──────────────────────────────────────
    for (const { label, store, storePath } of scopes) {
      if (store.count() === 0 && !fs.existsSync(storePath)) {
        byScope.push({
          scope: label,
          storePath,
          scanned: 0,
          adjustedCount: 0,
          archivedCount: 0,
          adjustments: [],
        });
        continue;
      }

      if (dryRun) {
        const fakeStore = makeReadOnlyStore(store);
        const pred = await runCalibrationPipeline({
          calibrator: defaultCalibrator,
          store: fakeStore as any,
          events,
          now,
        });
        byScope.push({
          scope: label,
          storePath,
          scanned: pred.scanned,
          adjustedCount: pred.adjusted.length,
          archivedCount: pred.archivedNew.length,
          adjustments: pred.adjusted,
        });
        totalAdjusted += pred.adjusted.length;
        totalArchived += pred.archivedNew.length;
        continue;
      }

      const result = await runCalibrationPipeline({
        calibrator: defaultCalibrator,
        store: store as any,
        events,
        now,
      });

      // 写 calibrator.adjusted 事件
      if (result.adjusted.length > 0) {
        if (!eventLog) {
          eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
        }
        for (const adj of result.adjusted) {
          try {
            recordAdjustment(eventLog, adj, nowDate);
          } catch {
            // 单条写失败不影响后续
          }
        }
      }

      byScope.push({
        scope: label,
        storePath,
        scanned: result.scanned,
        adjustedCount: result.adjusted.length,
        archivedCount: result.archivedNew.length,
        adjustments: result.adjusted,
      });
      totalAdjusted += result.adjusted.length;
      totalArchived += result.archivedNew.length;
    }
  } else {
    // ── v2 pipeline (default) ─────────────────────────────────────────
    for (const { label, store, storePath } of scopes) {
      if (store.count() === 0 && !fs.existsSync(storePath)) {
        byScope.push({
          scope: label,
          storePath,
          scanned: 0,
          adjustedCount: 0,
          archivedCount: 0,
          adjustments: [],
          v2Adjustments: [],
        });
        continue;
      }

      const observations = synthesizeObservations(events);
      const v2Result = await runCalibrationPipelineV2({
        calibrator: v2Calibrator,
        store: store as any,
        events,
        observations,
        now,
        dryRun,
      });

      if (!dryRun && v2Result.adjusted.length > 0) {
        if (!eventLog) {
          eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
        }
        for (const adj of v2Result.adjusted) {
          try {
            recordV2Adjustment(eventLog, adj, nowDate);
          } catch {
            // 单条写失败不影响后续
          }
        }
      }

      byScope.push({
        scope: label,
        storePath,
        scanned: v2Result.scanned,
        adjustedCount: v2Result.adjusted.length,
        archivedCount: v2Result.dormantNew.length,
        adjustments: [],
        v2Adjustments: v2Result.adjusted,
      });
      totalAdjusted += v2Result.adjusted.length;
      totalArchived += v2Result.dormantNew.length;
    }
  }

  // 若有调整且非 dry-run，更新 Skills；CLAUDE.md 规则块输出已禁用。
  if (!dryRun && totalAdjusted > 0) {
    try {
      await runCompile({
        store: dualStore,
        skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir }),
      });
    } catch {
      // Skill 导出失败不算 fatal
    }
  }

  dualStore.close();
  eventLog?.close();

  return { dryRun, byScope, totalAdjusted, totalArchived };
}

export function parseCalibrateArgs(argv: string[]): CalibrateOptions {
  const opts: CalibrateOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--legacy") opts.legacy = true;
    else if (a === "--days" && argv[i + 1]) {
      opts.days = parseInt(argv[i + 1]!, 10);
      i++;
    } else if (a.startsWith("--days=")) {
      opts.days = parseInt(a.slice("--days=".length), 10);
    }
  }
  return opts;
}

export function renderCalibrateResult(r: CalibrateResult): string {
  const lines: string[] = [];
  lines.push(r.dryRun ? "🔍 TeamAgent Calibrate (dry-run)" : "⚖️  TeamAgent Calibrate");
  lines.push("");
  for (const { scope, scanned, adjustedCount, archivedCount, adjustments, v2Adjustments } of r.byScope) {
    if (scanned === 0) {
      lines.push(`  ${scope.padEnd(8)} 无 store / 跳过`);
      continue;
    }
    if (adjustedCount === 0) {
      lines.push(`  ${scope.padEnd(8)} 扫描 ${scanned}, 无变化`);
      continue;
    }
    lines.push(
      `  ${scope.padEnd(8)} 扫描 ${scanned}, 调整 ${adjustedCount}` +
        (archivedCount > 0 ? ` (含归档 ${archivedCount})` : ""),
    );

    if (v2Adjustments && v2Adjustments.length > 0) {
      // v2 rendering: show tier/demerit alongside confidence
      for (const adj of v2Adjustments.slice(0, 5)) {
        const tierPart =
          adj.tier_transition
            ? ` [${adj.tier_before} → ${adj.tier_after}]`
            : adj.tier_after !== adj.tier_before
              ? ` [${adj.tier_before} → ${adj.tier_after}]`
              : "";
        const demPart =
          Math.abs(adj.demerit_after - adj.demerit_before) > 1e-6
            ? ` demerit ${adj.demerit_before.toFixed(0)} → ${adj.demerit_after.toFixed(0)}`
            : "";
        const confDelta = adj.confidence_after - adj.confidence_before;
        lines.push(
          `    - ${adj.knowledge_id}: conf ${adj.confidence_before.toFixed(2)} → ${adj.confidence_after.toFixed(2)} (${confDelta > 0 ? "+" : ""}${confDelta.toFixed(2)})${demPart}${tierPart}`,
        );
      }
      if (v2Adjustments.length > 5) {
        lines.push(`    ... (${v2Adjustments.length - 5} more)`);
      }
    } else {
      // v1 rendering
      for (const adj of adjustments.slice(0, 5)) {
        const arrow =
          adj.status_after !== adj.status_before
            ? ` → ${adj.status_after}`
            : "";
        lines.push(
          `    - ${adj.knowledge_id}: ${adj.before.toFixed(2)} → ${adj.after.toFixed(2)} (${adj.delta > 0 ? "+" : ""}${adj.delta.toFixed(2)})${arrow}`,
        );
      }
      if (adjustments.length > 5) {
        lines.push(`    ... (${adjustments.length - 5} more)`);
      }
    }
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(
    `  总计: ${r.totalAdjusted} 条调整${r.totalArchived > 0 ? `, ${r.totalArchived} 条归档` : ""}`,
  );
  if (r.dryRun) {
    lines.push("  (dry-run，未写入)");
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return lines.join("\n") + "\n";
}
