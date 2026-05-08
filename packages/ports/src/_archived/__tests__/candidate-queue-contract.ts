import { describe, it, expect, beforeEach } from "vitest";
import type { CandidateQueue, RuleCandidate } from "../candidate-queue.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeEntry(id = "e-001"): KnowledgeEntry {
  return {
    id,
    scope: { level: "personal" },
    category: "E",
    tags: ["build", "test"],
    type: "avoidance",
    nature: "objective",
    trigger: "build fails on Windows",
    wrong_pattern: "fileParallelism: true",
    correct_pattern: "fileParallelism: false",
    reasoning: "OOM on Windows vitest concurrent mode",
    confidence: 0.6,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-16T10:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };
}

function makeCandidate(
  id = "cand-001",
  entryId = "e-001",
): Omit<RuleCandidate, "status" | "created_at"> {
  return { id, entry: makeEntry(entryId), sourceSignals: "B×2 跨 2 session" };
}

/**
 * 契约测试套件——任何 CandidateQueue 实现都应通过。
 */
export function runCandidateQueueContract(factory: () => CandidateQueue): void {
  describe("CandidateQueue contract", () => {
    let queue: CandidateQueue;

    beforeEach(() => {
      queue = factory();
    });

    it("starts empty", () => {
      expect(queue.listPending()).toEqual([]);
      expect(queue.count()).toBe(0);
    });

    it("enqueue + listPending returns pending items", () => {
      queue.enqueue([makeCandidate("c1", "e1")]);
      const pending = queue.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe("c1");
      expect(pending[0]!.status).toBe("pending");
    });

    it("duplicate id is ignored on second enqueue", () => {
      queue.enqueue([makeCandidate("dup", "e1")]);
      queue.enqueue([makeCandidate("dup", "e1")]);
      expect(queue.count()).toBe(1);
    });

    it("updateStatus removes from pending", () => {
      queue.enqueue([makeCandidate("c1", "e1")]);
      queue.updateStatus("c1", "approved");
      expect(queue.listPending()).toHaveLength(0);
      expect(queue.count()).toBe(1);
    });

    it("updateStatus on non-existent id does not throw", () => {
      expect(() => queue.updateStatus("ghost", "rejected")).not.toThrow();
    });

    it("count includes non-pending items", () => {
      queue.enqueue([makeCandidate("c1", "e1"), makeCandidate("c2", "e2")]);
      queue.updateStatus("c1", "approved");
      expect(queue.count()).toBe(2);
    });

    it("listPending returns items sorted by created_at ASC", () => {
      queue.enqueue([makeCandidate("c1", "e1"), makeCandidate("c2", "e2")]);
      const ids = queue.listPending().map((c) => c.id);
      expect(ids[0]).toBe("c1");
    });
  });
}
