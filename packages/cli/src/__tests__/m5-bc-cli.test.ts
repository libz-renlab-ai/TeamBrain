import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  M5ShareValidationError,
  parseM5ShareArgs,
  runM5Share,
} from "../commands/m5-share.js";
import {
  renderM5SyncResult,
  runM5Sync,
} from "../commands/m5-sync.js";
import { runM5Delete } from "../commands/m5-delete.js";
import { runM5Status } from "../commands/m5-status.js";
import { runM5Infect } from "../commands/m5-infect.js";

async function tmpProject(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "m5-bc-cli-"));
}

describe("m5-share command (闸门 1 + 2)", () => {
  it("含 token 的规则被封存：action=seal_in_l1, 不写 L2", async () => {
    const root = await tmpProject();
    try {
      const r = await runM5Share({
        projectRoot: root,
        text: "API key=sk-abcdef1234567890ABCDEFghijkl 用这个",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.action.kind).toBe("seal_in_l1");
      expect(r.scan_matches_count).toBeGreaterThan(0);
      expect(r.written_path).toBeUndefined();
      // 验证 L2 没文件
      const teamDir = path.join(root, ".teamagent", "team");
      await expect(fs.access(teamDir)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("含本机绝对路径：classifier 也判 personal，闸门 1 + 闸门 2 都拦", async () => {
    const root = await tmpProject();
    try {
      const r = await runM5Share({
        projectRoot: root,
        text: "数据库密码在 /Users/alice/.config/db.json",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.action.kind).toBe("seal_in_l1");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("纯流程经验：自动 promote 到 L2", async () => {
    const root = await tmpProject();
    try {
      const r = await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review 直到 silent，不能假定 CI green = ship",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.action.kind).toBe("promote_to_l2");
      expect(r.classification_scope).toBe("shareable");
      expect(r.written_path).toBeDefined();
      // 验证文件写出
      const written = await fs.readFile(
        path.join(root, ".teamagent", "team", "alice", `${r.rule_id}.json`),
        "utf8"
      );
      expect(written).toContain('"author": "alice"');
      expect(written).toContain('"scope": "team"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("user override personal：即便 classifier 判 shareable 也留 L1", async () => {
    const root = await tmpProject();
    try {
      const r = await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review 直到 silent",
        scope: "personal",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.action.kind).toBe("keep_in_l1");
      expect(r.written_path).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("user override team：即便 classifier 判 personal 也推 L2（前提闸门 1 通过）", async () => {
    const root = await tmpProject();
    try {
      const r = await runM5Share({
        projectRoot: root,
        text: "短文不说话",
        scope: "team",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      expect(r.action.kind).toBe("promote_to_l2");
      expect(r.written_path).toBeDefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("m5-sync command (LWW + tombstone)", () => {
  it("空项目：total_claims=0", async () => {
    const root = await tmpProject();
    try {
      const r = await runM5Sync({ projectRoot: root });
      expect(r.total_claims).toBe(0);
      expect(r.merged.length).toBe(0);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("两人共写一个 rule_id：晚 ts 赢", async () => {
    const root = await tmpProject();
    try {
      // Alice 写 v1
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review",
        ruleId: "R-shared",
        scope: "team",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      // Bob 写 v2（晚一小时）
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review 直到 silent — Bob 改写",
        ruleId: "R-shared",
        scope: "team",
        author: "bob",
        now: "2026-05-06T11:00:00Z",
      });
      const sync = await runM5Sync({ projectRoot: root });
      expect(sync.total_claims).toBe(2);
      expect(sync.merged.length).toBe(1);
      const r = sync.merged[0]!;
      expect(r.rule_id).toBe("R-shared");
      expect(r.state).toBe("alive");
      expect(r.winner_claim_author).toBe("bob");
      expect(r.summary).toContain("Bob 改写");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("tombstone 晚于 alive：tombstone 赢", async () => {
    const root = await tmpProject();
    try {
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review",
        ruleId: "R-tomb",
        scope: "team",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      await runM5Delete({
        projectRoot: root,
        ruleId: "R-tomb",
        deletedBy: "bob",
        reason: "已过时",
        now: "2026-05-06T11:00:00Z",
      });
      const sync = await runM5Sync({ projectRoot: root });
      const r = sync.merged.find((m) => m.rule_id === "R-tomb")!;
      expect(r.state).toBe("tombstone");
      expect(r.winner_claim_author).toBe("bob");
      expect(r.original_author).toBe("alice"); // lineage 保留
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("M5-C: 跨 author edit 保留 original_author lineage", async () => {
    const root = await tmpProject();
    try {
      // Alice 首创 R-1
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review",
        ruleId: "R-1",
        scope: "team",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      // Bob 改写
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review — Bob 补充",
        ruleId: "R-1",
        scope: "team",
        author: "bob",
        now: "2026-05-06T11:00:00Z",
      });
      // Bob 写入的文件应该带 author=alice (lineage 保留)
      const bobFile = await fs.readFile(
        path.join(root, ".teamagent", "team", "bob", "R-1.json"),
        "utf8"
      );
      expect(bobFile).toContain('"author": "alice"');
      // sync 也应该把 original_author 报告为 alice
      const sync = await runM5Sync({ projectRoot: root });
      const r = sync.merged.find((m) => m.rule_id === "R-1")!;
      expect(r.original_author).toBe("alice");
      expect(r.winner_claim_author).toBe("bob");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("M5-D: m5-status 显示契约 + 团队规则统计", async () => {
    const root = await tmpProject();
    try {
      // 完整端到端：infect → share 一条 alive → share 另一条 sealed → delete 一条
      await runM5Infect({
        projectRoot: root,
        author: "alice",
        teamagentVersion: "0.9.4",
        now: "2026-05-06T10:00:00Z",
      });
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review 直到 silent",
        ruleId: "R-alive",
        scope: "team",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      await runM5Share({
        projectRoot: root,
        text: "API key=sk-abc1234567890ABCDEFghijkl",
        ruleId: "R-sealed",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      await runM5Share({
        projectRoot: root,
        text: "另一条共享规则关于 Port + 契约测试先行",
        ruleId: "R-alive2",
        scope: "team",
        author: "bob",
        now: "2026-05-06T10:30:00Z",
      });
      await runM5Delete({
        projectRoot: root,
        ruleId: "R-alive2",
        deletedBy: "alice",
        now: "2026-05-06T11:00:00Z",
      });

      const status = await runM5Status({ projectRoot: root });
      expect(status.has_manifest).toBe(true);
      expect(status.manifest_summary?.created_by).toBe("alice");
      expect(status.team_rules_alive).toBe(1);       // R-alive
      expect(status.team_rules_tombstoned).toBe(1);  // R-alive2
      // 总 claims: alice/R-alive + bob/R-alive2(alive) + alice/R-alive2(tomb) = 3
      expect(status.team_rules_total_claims).toBe(3);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("alive resurrect: 晚 alive 覆盖早 tombstone", async () => {
    const root = await tmpProject();
    try {
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review",
        ruleId: "R-rez",
        scope: "team",
        author: "alice",
        now: "2026-05-06T10:00:00Z",
      });
      await runM5Delete({
        projectRoot: root,
        ruleId: "R-rez",
        deletedBy: "bob",
        now: "2026-05-06T11:00:00Z",
      });
      // Alice 又改回来（晚于 tombstone）
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review — 改回",
        ruleId: "R-rez",
        scope: "team",
        author: "alice",
        now: "2026-05-06T12:00:00Z",
      });
      const sync = await runM5Sync({ projectRoot: root });
      const r = sync.merged.find((m) => m.rule_id === "R-rez")!;
      expect(r.state).toBe("alive");
      expect(r.summary).toContain("改回");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("W15-010: --confidence is parsed and stored as the rule's confidence", async () => {
    const root = await tmpProject();
    try {
      const opts = parseM5ShareArgs([
        "--text=PR 后必须 fetch codex review",
        "--rule-id=R-w15010",
        "--scope=team",
        "--author=tester",
        "--confidence=0.42",
        `--project-root=${root}`,
      ]);
      expect(opts.confidence).toBe(0.42);

      const r = await runM5Share({
        ...opts,
        now: "2026-05-08T10:00:00Z",
      });
      expect(r.action.kind).toBe("promote_to_l2");

      const written = JSON.parse(
        await fs.readFile(
          path.join(root, ".teamagent", "team", "tester", "R-w15010.json"),
          "utf8",
        ),
      );
      expect(written.current.confidence).toBe(0.42);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("W15-010: invalid --confidence values throw validation error", () => {
    for (const bad of ["NaN", "2", "-1", "abc"]) {
      expect(() => parseM5ShareArgs([`--confidence=${bad}`])).toThrow(
        M5ShareValidationError,
      );
    }
  });

  it("W15-010: runM5Share rejects out-of-range confidence from internal caller", async () => {
    const root = await tmpProject();
    try {
      await expect(
        runM5Share({
          projectRoot: root,
          text: "x",
          author: "tester",
          confidence: 5,
          now: "2026-05-08T10:00:00Z",
        }),
      ).rejects.toThrow(M5ShareValidationError);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("W15-012: rule_id at 200 chars under a long projectRoot is rejected", async () => {
    const longRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "m5-w15012-very-long-root-prefix-"),
    );
    try {
      await expect(
        runM5Share({
          projectRoot: longRoot,
          text: "x",
          ruleId: "a".repeat(200),
          scope: "team",
          author: "tester",
          now: "2026-05-08T10:00:00Z",
        }),
      ).rejects.toThrow(/Windows MAX_PATH/);
    } finally {
      await fs.rm(longRoot, { recursive: true, force: true });
    }
  });

  it("W15-014: surfaces every skipped file (no truncation) + reason breakdown", async () => {
    const root = await tmpProject();
    try {
      const dir = path.join(root, ".teamagent", "team", "alice");
      await fs.mkdir(dir, { recursive: true });
      // 30 corrupt JSON files — pre-fix only the first was listed.
      for (let i = 0; i < 30; i++) {
        await fs.writeFile(
          path.join(dir, `corrupt-${String(i).padStart(2, "0")}.json`),
          "this is not json",
        );
      }
      const sync = await runM5Sync({ projectRoot: root });
      expect(sync.skipped_files?.length).toBe(30);

      const rendered = renderM5SyncResult(sync);
      // every file path appears in the rendered output
      for (let i = 0; i < 30; i++) {
        expect(rendered).toContain(`corrupt-${String(i).padStart(2, "0")}.json`);
      }
      // reason-category breakdown surfaces the count by category
      expect(rendered).toMatch(/skipped 30 file\(s\)/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
