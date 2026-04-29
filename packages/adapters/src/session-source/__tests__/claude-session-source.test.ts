import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ClaudeSessionSource } from "../claude-session-source.js";

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sess-src-"));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// 用项目内已有的 fixture（vitest 从 repo 根启动，cwd 可靠）
const FIXTURE_ROOT = path.resolve(process.cwd(), "fixtures/sessions");

describe("ClaudeSessionSource", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  describe("loadFromFile (direct path)", () => {
    it("parses fixture into ParsedSession", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      const session = await src.loadById(
        path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
      );
      expect(session.sessionId).toBe("fix-denial-01");
      expect(session.turns.length).toBe(2);
      expect(session.turns[0]?.userMessage).toContain("获取用户数据");
      expect(session.turns[1]?.userMessage).toContain("不对");
    });

    it("extracts assistant text and tool calls", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      const session = await src.loadById(
        path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
      );
      const turn0 = session.turns[0]!;
      expect(turn0.assistantText).toContain("axios");
      expect(turn0.toolCalls).toHaveLength(1);
      expect(turn0.toolCalls[0]?.name).toBe("Write");
    });

    it("handles multi-tool-result turns (failures)", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      const session = await src.loadById(
        path.join(FIXTURE_ROOT, "correction-multi-failure-01.jsonl"),
      );
      // 应该只有 2 个 user→assistant 回合 (u1→a1+a2 / u2→a3)
      expect(session.turns.length).toBe(2);
      const turn0 = session.turns[0]!;
      // 第一个回合里 2 次 Bash 调用
      expect(turn0.toolCalls.length).toBe(2);
      expect(turn0.toolCalls[0]?.name).toBe("Bash");
      // 可以捕获到失败标记
      expect(turn0.toolCalls[0]?.succeeded).toBe(false);
    });

    it("turns are indexed in order", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      const session = await src.loadById(
        path.join(FIXTURE_ROOT, "success-repeated-01.jsonl"),
      );
      expect(session.turns.map((t) => t.turnIndex)).toEqual([0, 1, 2]);
    });

    it("fills in timestamps", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      const session = await src.loadById(
        path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
      );
      expect(session.startTime).toBe("2026-04-14T09:00:00Z");
      expect(session.endTime).toBeDefined();
    });

    it("gracefully handles unknown file", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      await expect(
        src.loadById(path.join(tmp.dir, "nonexistent.jsonl")),
      ).rejects.toThrow();
    });

    // B-089: when caller passes a path-shaped argument that doesn't exist,
    // loadById must NOT fall back to resolveSessionFile (which treats the
    // argument as a session UUID and produces a confusing "Session not found:
    // <full-path>" error). Path-shaped inputs should surface a clear
    // "transcript file" error instead.
    it("path-shaped input that doesn't exist throws transcript-file error, not session-id error", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      const ghostAbs = path.join(tmp.dir, "ghost-dir", "abc-123.jsonl");
      await expect(src.loadById(ghostAbs)).rejects.toThrow(/transcript file/i);
      await expect(src.loadById(ghostAbs)).rejects.not.toThrow(/Session not found:/);
    });

    it("bare session-id (not path-shaped) without match goes through resolveSessionFile", async () => {
      const src = new ClaudeSessionSource(tmp.dir);
      await expect(src.loadById("uuid-without-path-shape")).rejects.toThrow(
        /Session not found:/,
      );
    });
  });

  describe("listRecent (scans ~/.claude/projects/...)", () => {
    it("returns empty list when directory missing", async () => {
      const src = new ClaudeSessionSource(path.join(tmp.dir, "nope"));
      const recent = await src.listRecent(5);
      expect(recent).toEqual([]);
    });

    it("lists jsonl files sorted by mtime desc", async () => {
      // 构造 3 个伪 project 目录，各 1 个 jsonl
      const projA = path.join(tmp.dir, "projects", "C--bzli-app");
      const projB = path.join(tmp.dir, "projects", "C--bzli-teamagent");
      fs.mkdirSync(projA, { recursive: true });
      fs.mkdirSync(projB, { recursive: true });

      const a1 = path.join(projA, "sess-a1.jsonl");
      const b1 = path.join(projB, "sess-b1.jsonl");
      const b2 = path.join(projB, "sess-b2.jsonl");

      fs.writeFileSync(
        a1,
        JSON.stringify({
          type: "user",
          uuid: "u",
          timestamp: "2026-04-14T01:00:00Z",
          sessionId: "sess-a1",
          message: { role: "user", content: "hi" },
        }) + "\n",
      );
      fs.writeFileSync(
        b1,
        JSON.stringify({
          type: "user",
          uuid: "u",
          timestamp: "2026-04-14T02:00:00Z",
          sessionId: "sess-b1",
          message: { role: "user", content: "hi" },
        }) + "\n",
      );
      fs.writeFileSync(
        b2,
        JSON.stringify({
          type: "user",
          uuid: "u",
          timestamp: "2026-04-14T03:00:00Z",
          sessionId: "sess-b2",
          message: { role: "user", content: "hi" },
        }) + "\n",
      );

      // 强制设置 mtime（文件系统时戳）
      const now = Date.now();
      fs.utimesSync(a1, now / 1000 - 30, now / 1000 - 30);
      fs.utimesSync(b1, now / 1000 - 20, now / 1000 - 20);
      fs.utimesSync(b2, now / 1000 - 10, now / 1000 - 10);

      const src = new ClaudeSessionSource(path.join(tmp.dir, "projects"));
      const recent = await src.listRecent(5);

      expect(recent.length).toBe(3);
      expect(recent[0]?.sessionId).toBe("sess-b2"); // newest
      expect(recent[2]?.sessionId).toBe("sess-a1"); // oldest
    });

    it("respects limit", async () => {
      const projA = path.join(tmp.dir, "projects", "C--bzli-app");
      fs.mkdirSync(projA, { recursive: true });
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(
          path.join(projA, `s${i}.jsonl`),
          JSON.stringify({
            type: "user",
            sessionId: `s${i}`,
            timestamp: "2026-04-14T00:00:00Z",
            message: { role: "user", content: "x" },
          }) + "\n",
        );
      }
      const src = new ClaudeSessionSource(path.join(tmp.dir, "projects"));
      const recent = await src.listRecent(3);
      expect(recent).toHaveLength(3);
    });

    it("reports turn count per session", async () => {
      const projA = path.join(tmp.dir, "projects", "C--bzli-a");
      fs.mkdirSync(projA, { recursive: true });
      const file = path.join(projA, "sess.jsonl");
      const content = [
        JSON.stringify({
          type: "user",
          uuid: "u1",
          timestamp: "2026-04-14T00:00:00Z",
          sessionId: "sess",
          message: { role: "user", content: "q1" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "a1",
          parentUuid: "u1",
          timestamp: "2026-04-14T00:00:01Z",
          sessionId: "sess",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "a1" }],
          },
        }),
        JSON.stringify({
          type: "user",
          uuid: "u2",
          timestamp: "2026-04-14T00:00:02Z",
          sessionId: "sess",
          message: { role: "user", content: "q2" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "a2",
          parentUuid: "u2",
          timestamp: "2026-04-14T00:00:03Z",
          sessionId: "sess",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "a2" }],
          },
        }),
      ].join("\n");
      fs.writeFileSync(file, content + "\n");

      const src = new ClaudeSessionSource(path.join(tmp.dir, "projects"));
      const recent = await src.listRecent(5);
      expect(recent[0]?.turnCount).toBe(2);
    });
  });
});
