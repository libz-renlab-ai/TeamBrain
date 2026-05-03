import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import * as readline from "node:readline";
import {
  DualLayerStore,
  SqliteCandidateQueue,
  SqliteEventLog,
  openDb,
  makeSkillCompiler,
} from "@teamagent/adapters";
import { runCalibrationPipeline, defaultCalibrator, runCompile } from "@teamagent/core";
import type { PersistedEvent } from "@teamagent/types";
import { scheduleDocsPropagation } from "./docs-propagate.js";

export interface ReviewCandidatesOptions {
  limit?: number;
  homeDir?: string;
  cwd?: string;
  candidatesDbPath?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
  eventsDbPath?: string;
  skillsDir?: string;
  /** @deprecated 新规则路径不再写 CLAUDE.md；保留字段仅为兼容旧调用方。 */
  claudeMdPath?: string;
  now?: () => Date;
  docsPropagationScheduler?: (ruleIds: string[]) => void | Promise<void>;
}

export async function executeReviewCandidates(
  opts: ReviewCandidatesOptions = {},
): Promise<string> {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const candidatesDbPath =
    opts.candidatesDbPath ?? path.join(home, ".teamagent", "candidates.db");
  const projectDbPath =
    opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath =
    opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db");
  const eventsDbPath =
    opts.eventsDbPath ?? path.join(home, ".teamagent", "events.db");
  const skillsDir = opts.skillsDir ?? path.join(home, ".claude", "skills", "teamagent");
  const now = opts.now ?? (() => new Date());

  const emitEvent = (evt: Omit<PersistedEvent, "schema_version">): void => {
    if (!fs.existsSync(eventsDbPath)) return;
    try {
      const eventLog = new SqliteEventLog(openDb(eventsDbPath));
      eventLog.append({ ...evt, schema_version: 1 } as PersistedEvent);
      eventLog.close();
    } catch {
      // non-fatal
    }
  };

  if (!fs.existsSync(candidatesDbPath)) {
    return "📭 候选队列为空（candidates.db 不存在）。先运行 teamagent scan-errors。\n";
  }

  const queueDb = openDb(candidatesDbPath);
  const queue = new SqliteCandidateQueue(queueDb);
  let pending = queue.listPending();

  if (opts.limit !== undefined) {
    pending = pending.slice(0, opts.limit);
  }

  if (pending.length === 0) {
    queueDb.close();
    return "✅ 候选队列已清空，无待审核条目。\n";
  }

  fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const projectStore = store.getProjectStore();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  process.stdout.write(`📋 候选规则审核 — 共 ${pending.length} 条待审\n`);
  process.stdout.write("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let approved = 0;
  let rejected = 0;
  let skipped = 0;
  const approvedRuleIds: string[] = [];

  for (let i = 0; i < pending.length; i++) {
    const candidate = pending[i]!;
    const e = candidate.entry;

    process.stdout.write(`\n[${i + 1}/${pending.length}] category=${e.category}  tags=[${e.tags.join(", ")}]\n`);
    process.stdout.write(`  trigger:  ${e.trigger}\n`);
    if (e.wrong_pattern) process.stdout.write(`  wrong:    ${e.wrong_pattern}\n`);
    process.stdout.write(`  correct:  ${e.correct_pattern}\n`);
    process.stdout.write(`  reason:   ${e.reasoning}\n`);
    process.stdout.write(`  来源信号: ${candidate.sourceSignals}\n`);
    process.stdout.write(`  confidence: ${e.confidence.toFixed(2)}\n`);
    process.stdout.write("\n  [a]pprove  [r]eject  [s]kip  [q]uit\n");

    const answer = (await ask("> ")).trim().toLowerCase();

    if (answer === "q") {
      process.stdout.write("\n退出审核，剩余条目保留在队列中。\n");
      break;
    }

    if (answer === "a") {
      try {
        projectStore.add(e);
        queue.updateStatus(candidate.id, "approved");
        approved++;
        approvedRuleIds.push(e.id);
        process.stdout.write(`✓ 已写入知识库 (id: ${e.id})\n`);
        emitEvent({
          id: `ev-cand-approved-${now().getTime()}-${candidate.id.slice(-6)}`,
          kind: "error.candidate.approved",
          knowledge_id: e.id,
          timestamp: now().toISOString(),
        });
      } catch (err) {
        process.stdout.write(`⚠ 写入失败: ${String(err).slice(0, 100)}\n`);
      }
    } else if (answer === "r") {
      queue.updateStatus(candidate.id, "rejected");
      rejected++;
      process.stdout.write("✗ 已拒绝\n");
      emitEvent({
        id: `ev-cand-rejected-${now().getTime()}-${candidate.id.slice(-6)}`,
        kind: "error.candidate.rejected",
        timestamp: now().toISOString(),
      });
    } else {
      queue.updateStatus(candidate.id, "skipped");
      skipped++;
      process.stdout.write("→ 已跳过（下次审核可见）\n");
    }
  }

  rl.close();

  if (approved > 0) {
    process.stdout.write("\n重新校准 + 更新 Skills + 调度 docs propagation…\n");
    try {
      await runCalibrationPipeline({
        calibrator: defaultCalibrator,
        store: projectStore as any,
        events: [],
        now,
      });
      await runCompile({
        store,
        skillCompiler: makeSkillCompiler({ skillsDir }),
      });
      if (opts.docsPropagationScheduler) {
        await opts.docsPropagationScheduler(approvedRuleIds);
      } else {
        scheduleDocsPropagation(approvedRuleIds, { cwd });
      }
      process.stdout.write("✓ Skills 已更新；docs propagation 已调度\n");
    } catch (err) {
      process.stdout.write(`⚠ 校准/导出失败: ${String(err).slice(0, 100)}\n`);
    }
  }

  store.close();
  queueDb.close();

  return `\n审核完成: ✓批准 ${approved}  ✗拒绝 ${rejected}  →跳过 ${skipped}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
}

export function parseReviewCandidatesArgs(argv: string[]): ReviewCandidatesOptions {
  // Default to Infinity so CLI semantics ("no flag = process all pending") are
  // preserved; the value is still a number (sandbox-style callers expect that),
  // and Array.prototype.slice(0, Infinity) returns the full array unchanged.
  const opts: ReviewCandidatesOptions = { limit: Number.POSITIVE_INFINITY };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[++i]!, 10);
    } else if (a.startsWith("--limit=")) {
      opts.limit = parseInt(a.slice("--limit=".length), 10);
    }
  }
  return opts;
}
