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
