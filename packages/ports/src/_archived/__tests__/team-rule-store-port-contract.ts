/**
 * ⚠️ ARCHIVED CONTRACT — frozen historical artifact.
 *
 * 见 docs/adr/0005-archive-hypothetical-port-seams.md。
 * 此文件不再被 CI 跑，但保留以便未来 ≥2 production adapter
 * 出现时可参考原 contract 设计。
 *
 * 不要在这里加新 case；如果当前 lone implementation
 * 演化出 contract 偏差，请直接编辑 lone-impl 的 unit test，
 * 不要"复活"这个 contract。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { TeamRuleStorePort } from "../team-rule-store-port.js";
import type { TeamRuleFile } from "@teamagent/types";

function alive(
  ruleId: string,
  author: string,
  modifiedBy: string,
  ts: string,
  content = "x"
): TeamRuleFile {
  return {
    rule_id: ruleId,
    author,
    current: {
      deleted: false,
      content,
      confidence: 0.9,
      modified_by: modifiedBy,
      modified_ts: ts,
      scope: "team",
    },
  };
}

function tomb(
  ruleId: string,
  author: string,
  deletedBy: string,
  ts: string
): TeamRuleFile {
  return {
    rule_id: ruleId,
    author,
    current: {
      deleted: true,
      deleted_by: deletedBy,
      deleted_ts: ts,
    },
  };
}

export function runTeamRuleStorePortContract(
  factory: () => Promise<{
    port: TeamRuleStorePort;
    projectRoot: string;
    cleanup: () => Promise<void>;
  }>
): void {
  describe("TeamRuleStorePort contract", () => {
    let port: TeamRuleStorePort;
    let projectRoot: string;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      ({ port, projectRoot, cleanup } = await factory());
    });

    afterEach(async () => {
      await cleanup();
    });

    it("listAll on empty project: []", async () => {
      const all = await port.listAll(projectRoot);
      expect(all).toEqual([]);
    });

    it("readRule non-existent: null", async () => {
      const r = await port.readRule(projectRoot, "alice", "R-X");
      expect(r).toBeNull();
    });

    it("writeRule then readRule: round-trip", async () => {
      const r = alive("R-1", "alice", "alice", "2026-05-06T10:00:00Z");
      await port.writeRule(projectRoot, "alice", r);
      const got = await port.readRule(projectRoot, "alice", "R-1");
      expect(got).toEqual(r);
    });

    it("writeRule overwrites same (claim_author, rule_id)", async () => {
      await port.writeRule(
        projectRoot,
        "alice",
        alive("R-1", "alice", "alice", "2026-05-06T10:00:00Z", "v1")
      );
      await port.writeRule(
        projectRoot,
        "alice",
        alive("R-1", "alice", "alice", "2026-05-06T11:00:00Z", "v2")
      );
      const got = await port.readRule(projectRoot, "alice", "R-1");
      expect(got && !got.current.deleted && got.current.content).toBe("v2");
    });

    it("listAll picks up multiple authors, multiple rules", async () => {
      await port.writeRule(
        projectRoot,
        "alice",
        alive("R-1", "alice", "alice", "2026-05-06T10:00:00Z")
      );
      await port.writeRule(
        projectRoot,
        "bob",
        alive("R-1", "alice", "bob", "2026-05-06T11:00:00Z", "edit-by-bob")
      );
      await port.writeRule(
        projectRoot,
        "alice",
        alive("R-2", "alice", "alice", "2026-05-06T09:00:00Z")
      );
      const all = await port.listAll(projectRoot);
      expect(all.length).toBe(3);
      const claimAuthors = all.map((c) => c.claim_author).sort();
      expect(claimAuthors).toEqual(["alice", "alice", "bob"]);
    });

    it("supports tombstone files", async () => {
      const t = tomb("R-1", "alice", "bob", "2026-05-06T12:00:00Z");
      await port.writeRule(projectRoot, "bob", t);
      const got = await port.readRule(projectRoot, "bob", "R-1");
      expect(got?.current.deleted).toBe(true);
    });
  });
}
