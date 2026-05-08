import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { KnowledgeEntry } from "@teamagent/types";

/** 候选规则条目（待人工审核）。 */
export interface RuleCandidate {
  id: string;
  /** 提取出的知识条目（尚未写入 KnowledgeStore） */
  entry: KnowledgeEntry;
  /** 来源信号摘要，展示给用户看 */
  sourceSignals: string;
  status: "pending" | "approved" | "rejected" | "skipped";
  created_at: string;
  reviewed_at?: string;
}

/** 待审核规则候选队列。 */
export interface CandidateQueue {
  /** 批量入队（id 重复则忽略） */
  enqueue(candidates: Omit<RuleCandidate, "status" | "created_at">[]): void;
  /** 返回所有 status=pending 的候选，按 created_at ASC */
  listPending(): RuleCandidate[];
  /** 更新状态。id 不存在时静默忽略。 */
  updateStatus(id: string, status: RuleCandidate["status"]): void;
  /** 总条目数（含所有状态） */
  count(): number;
}

export class SqliteCandidateQueue implements CandidateQueue {
  private readonly db: DatabaseSyncType;

  constructor(db: DatabaseSyncType) {
    this.db = db;
  }

  enqueue(candidates: Omit<RuleCandidate, "status" | "created_at">[]): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO rule_candidates
        (id, entry_json, source_signals, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `);
    const now = new Date().toISOString();
    for (const c of candidates) {
      stmt.run(c.id, JSON.stringify(c.entry), c.sourceSignals, now);
    }
  }

  listPending(): RuleCandidate[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM rule_candidates WHERE status IN ('pending', 'skipped') ORDER BY created_at ASC`,
      )
      .all() as any[];
    return rows.map(this.hydrate);
  }

  updateStatus(id: string, status: RuleCandidate["status"]): void {
    this.db
      .prepare(
        `UPDATE rule_candidates SET status = ?, reviewed_at = ? WHERE id = ?`,
      )
      .run(status, new Date().toISOString(), id);
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as n FROM rule_candidates`)
      .get() as any;
    return row.n as number;
  }

  private hydrate = (row: any): RuleCandidate => ({
    id: row.id,
    entry: JSON.parse(row.entry_json) as KnowledgeEntry,
    sourceSignals: row.source_signals,
    status: row.status as RuleCandidate["status"],
    created_at: row.created_at,
    reviewed_at: row.reviewed_at ?? undefined,
  });
}
