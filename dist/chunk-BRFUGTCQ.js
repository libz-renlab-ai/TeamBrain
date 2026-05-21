import {
  SqliteEventLog,
  makeSkillCompiler
} from "./chunk-NPSW37EI.js";
import {
  DualLayerStore
} from "./chunk-MXJDRQEB.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  defaultCalibrator,
  runCalibrationPipeline,
  runCalibrationPipelineV2,
  runCompile,
  v2Calibrator
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/calibrate.ts
init_esm_shims();
import os from "os";
import path from "path";
import fs from "fs";
function resolvePaths(opts) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    projectDbPath: opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    eventsDbPath: opts.eventsDbPath ?? path.join(home, ".teamagent", "events.db"),
    skillsDir: opts.skillsDir ?? path.join(home, ".claude", "skills", "teamagent")
  };
}
function synthesizeObservations(events) {
  return events.filter((e) => e.kind === "hook-post.result" && e.knowledge_id).map((e) => ({
    id: `obs-${e.id}`,
    knowledge_id: e.knowledge_id,
    timestamp: e.timestamp,
    // B-055: use !== true so null/undefined/0 payload.success is treated as "failure"
    // (conservative; aligns with the closed-world assumption: unknown = not confirmed success)
    outcome: e.payload?.success !== true ? "failure" : "success",
    source_event: e.id,
    tool_use_id: e.tool_use_id
  }));
}
function filterEventsByDays(events, days, now) {
  if (!days || days <= 0) return events;
  const cutoff = now.getTime() - days * 24 * 3600 * 1e3;
  return events.filter((e) => {
    try {
      return new Date(e.timestamp).getTime() >= cutoff;
    } catch {
      return true;
    }
  });
}
function makeEventId(now) {
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cal-${ts}-${rand}`;
}
function recordAdjustment(log, adj, now) {
  log.append({
    id: makeEventId(now),
    kind: "calibrator.adjusted",
    knowledge_id: adj.knowledge_id,
    confidence_before: adj.before,
    confidence_after: adj.after,
    status_after: adj.status_after,
    timestamp: now.toISOString(),
    schema_version: 1
  });
}
function recordV2Adjustment(log, adj, now) {
  const event = {
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
    delta_breakdown: adj.delta_breakdown
  };
  log.append(event);
}
function makeReadOnlyStore(real) {
  const proxy = Object.create(real);
  proxy.update = () => {
  };
  return proxy;
}
async function executeCalibrate(opts = {}) {
  const paths = resolvePaths(opts);
  const dryRun = opts.dryRun ?? false;
  const legacy = opts.legacy ?? false;
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const nowDate = now();
  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.eventsDbPath), { recursive: true });
  let events = [];
  let eventLog = null;
  try {
    if (fs.existsSync(paths.eventsDbPath)) {
      eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
      events = eventLog.readAll();
    }
  } catch {
  }
  events = filterEventsByDays(events, opts.days, nowDate);
  const dualStore = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  const scopes = [
    { scope: "personal", label: "personal", store: dualStore.getProjectStore(), storePath: paths.projectDbPath },
    { scope: "global", label: "global", store: dualStore.getGlobalStore(), storePath: paths.userGlobalDbPath }
  ];
  const byScope = [];
  let totalAdjusted = 0;
  let totalArchived = 0;
  if (legacy) {
    for (const { label, store, storePath } of scopes) {
      if (store.count() === 0 && !fs.existsSync(storePath)) {
        byScope.push({
          scope: label,
          storePath,
          scanned: 0,
          adjustedCount: 0,
          archivedCount: 0,
          adjustments: []
        });
        continue;
      }
      if (dryRun) {
        const fakeStore = makeReadOnlyStore(store);
        const pred = await runCalibrationPipeline({
          calibrator: defaultCalibrator,
          store: fakeStore,
          events,
          now
        });
        byScope.push({
          scope: label,
          storePath,
          scanned: pred.scanned,
          adjustedCount: pred.adjusted.length,
          archivedCount: pred.archivedNew.length,
          adjustments: pred.adjusted
        });
        totalAdjusted += pred.adjusted.length;
        totalArchived += pred.archivedNew.length;
        continue;
      }
      const result = await runCalibrationPipeline({
        calibrator: defaultCalibrator,
        store,
        events,
        now
      });
      if (result.adjusted.length > 0) {
        if (!eventLog) {
          eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
        }
        for (const adj of result.adjusted) {
          try {
            recordAdjustment(eventLog, adj, nowDate);
          } catch {
          }
        }
      }
      byScope.push({
        scope: label,
        storePath,
        scanned: result.scanned,
        adjustedCount: result.adjusted.length,
        archivedCount: result.archivedNew.length,
        adjustments: result.adjusted
      });
      totalAdjusted += result.adjusted.length;
      totalArchived += result.archivedNew.length;
    }
  } else {
    for (const { label, store, storePath } of scopes) {
      if (store.count() === 0 && !fs.existsSync(storePath)) {
        byScope.push({
          scope: label,
          storePath,
          scanned: 0,
          adjustedCount: 0,
          archivedCount: 0,
          adjustments: [],
          v2Adjustments: []
        });
        continue;
      }
      const observations = synthesizeObservations(events);
      const v2Result = await runCalibrationPipelineV2({
        calibrator: v2Calibrator,
        store,
        events,
        observations,
        now,
        dryRun
      });
      if (!dryRun && v2Result.adjusted.length > 0) {
        if (!eventLog) {
          eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
        }
        for (const adj of v2Result.adjusted) {
          try {
            recordV2Adjustment(eventLog, adj, nowDate);
          } catch {
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
        v2Adjustments: v2Result.adjusted
      });
      totalAdjusted += v2Result.adjusted.length;
      totalArchived += v2Result.dormantNew.length;
    }
  }
  if (!dryRun && totalAdjusted > 0) {
    try {
      await runCompile({
        store: dualStore,
        skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir })
      });
    } catch {
    }
  }
  dualStore.close();
  eventLog?.close();
  return { dryRun, byScope, totalAdjusted, totalArchived };
}
var CALIBRATE_KNOWN_FLAGS = /* @__PURE__ */ new Set([
  "--dry-run",
  "--legacy",
  "--days"
]);
var CalibrateArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CalibrateArgError";
  }
};
function parseCalibrateArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--legacy") opts.legacy = true;
    else if (a === "--days" && argv[i + 1]) {
      opts.days = parseInt(argv[i + 1], 10);
      i++;
    } else if (a.startsWith("--days=")) {
      opts.days = parseInt(a.slice("--days=".length), 10);
    } else if (a.startsWith("--")) {
      const base = a.split("=")[0];
      if (!CALIBRATE_KNOWN_FLAGS.has(base)) {
        throw new CalibrateArgError(
          `calibrate: unknown flag "${a}". Run 'teamagent --help' for valid flags.`
        );
      }
    }
  }
  return opts;
}
function renderCalibrateResult(r) {
  const lines = [];
  lines.push(r.dryRun ? "\u{1F50D} TeamAgent Calibrate (dry-run)" : "\u2696\uFE0F  TeamAgent Calibrate");
  lines.push("");
  for (const { scope, scanned, adjustedCount, archivedCount, adjustments, v2Adjustments } of r.byScope) {
    if (scanned === 0) {
      lines.push(`  ${scope.padEnd(8)} \u65E0 store / \u8DF3\u8FC7`);
      continue;
    }
    if (adjustedCount === 0) {
      lines.push(`  ${scope.padEnd(8)} \u626B\u63CF ${scanned}, \u65E0\u53D8\u5316`);
      continue;
    }
    lines.push(
      `  ${scope.padEnd(8)} \u626B\u63CF ${scanned}, \u8C03\u6574 ${adjustedCount}` + (archivedCount > 0 ? ` (\u542B\u5F52\u6863 ${archivedCount})` : "")
    );
    if (v2Adjustments && v2Adjustments.length > 0) {
      for (const adj of v2Adjustments.slice(0, 5)) {
        const tierPart = adj.tier_transition ? ` [${adj.tier_before} \u2192 ${adj.tier_after}]` : adj.tier_after !== adj.tier_before ? ` [${adj.tier_before} \u2192 ${adj.tier_after}]` : "";
        const demPart = Math.abs(adj.demerit_after - adj.demerit_before) > 1e-6 ? ` demerit ${adj.demerit_before.toFixed(0)} \u2192 ${adj.demerit_after.toFixed(0)}` : "";
        const confDelta = adj.confidence_after - adj.confidence_before;
        lines.push(
          `    - ${adj.knowledge_id}: conf ${adj.confidence_before.toFixed(2)} \u2192 ${adj.confidence_after.toFixed(2)} (${confDelta > 0 ? "+" : ""}${confDelta.toFixed(2)})${demPart}${tierPart}`
        );
      }
      if (v2Adjustments.length > 5) {
        lines.push(`    ... (${v2Adjustments.length - 5} more)`);
      }
    } else {
      for (const adj of adjustments.slice(0, 5)) {
        const arrow = adj.status_after !== adj.status_before ? ` \u2192 ${adj.status_after}` : "";
        lines.push(
          `    - ${adj.knowledge_id}: ${adj.before.toFixed(2)} \u2192 ${adj.after.toFixed(2)} (${adj.delta > 0 ? "+" : ""}${adj.delta.toFixed(2)})${arrow}`
        );
      }
      if (adjustments.length > 5) {
        lines.push(`    ... (${adjustments.length - 5} more)`);
      }
    }
  }
  lines.push("");
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  lines.push(
    `  \u603B\u8BA1: ${r.totalAdjusted} \u6761\u8C03\u6574${r.totalArchived > 0 ? `, ${r.totalArchived} \u6761\u5F52\u6863` : ""}`
  );
  if (r.dryRun) {
    lines.push("  (dry-run\uFF0C\u672A\u5199\u5165)");
  }
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  return lines.join("\n") + "\n";
}

export {
  executeCalibrate,
  CalibrateArgError,
  parseCalibrateArgs,
  renderCalibrateResult
};
