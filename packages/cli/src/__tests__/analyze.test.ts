import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeAnalyze, parseAnalyzeArgs } from "../commands/analyze.js";
import { DualLayerStore, openDb } from "@teamagent/adapters";
import type { LLMClient } from "@teamagent/ports";

function mkTmp() {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), "analyze-"));
  return {
    dir,
    cleanup: () => nodeFs.rmSync(dir, { recursive: true, force: true }),
  };
}

const FIXTURE_ROOT = path.resolve(process.cwd(), "fixtures/sessions");

describe("executeAnalyze", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("directly given fixture path → analyzes + renders report", async () => {
    const fixturePath = path.join(FIXTURE_ROOT, "correction-denial-01.jsonl");
    const out = await executeAnalyze({
      session: fixturePath,
      homeDir: tmp.dir,
    });
    expect(out).toContain("TeamAgent Session Analyze");
    expect(out).toContain("回合数: 2");
    expect(out).toContain("纠正时刻: 1");
    expect(out).toContain("explicit_denial");
  });

  it("mixed fixture → both corrections and successes reported", async () => {
    const out = await executeAnalyze({
      session: path.join(FIXTURE_ROOT, "mixed-01.jsonl"),
      homeDir: tmp.dir,
    });
    expect(out).toContain("纠正时刻: 1");
    expect(out).toContain("成功信号: 1");
  });

  it("no signal fixture → 0 counts", async () => {
    const out = await executeAnalyze({
      session: path.join(FIXTURE_ROOT, "negative-no-signal-01.jsonl"),
      homeDir: tmp.dir,
    });
    expect(out).toContain("纠正时刻: 0");
  });

  it("no ~/.claude/projects → helpful message", async () => {
    const out = await executeAnalyze({
      homeDir: tmp.dir,
      projectsRoot: path.join(tmp.dir, "nonexistent"),
    });
    expect(out).toContain("未找到");
  });

  it("verbose flag → prints detail lines", async () => {
    const out = await executeAnalyze({
      session: path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
      homeDir: tmp.dir,
      verbose: true,
    });
    expect(out).toContain("纠正时刻明细");
    expect(out).toContain("turn");
  });

  it("dry-run notice in footer", async () => {
    const out = await executeAnalyze({
      session: path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
      homeDir: tmp.dir,
    });
    expect(out).toContain("未写入知识库");
  });

  // B-045: when transcript file is non-empty but contains no valid JSONL
  // messages (corrupted file, wrong format, etc.), analyze must surface
  // "transcript parse failed" instead of silently reporting "回合数: 0",
  // which is indistinguishable from a legitimately empty session.
  it("malformed transcript → reports parse failure, not '回合数: 0'", async () => {
    const garbagePath = path.join(tmp.dir, "garbage.jsonl");
    nodeFs.writeFileSync(
      garbagePath,
      "this is not jsonl at all\n!!! definitely not json\n<html>nope</html>\n".repeat(5),
      "utf-8",
    );
    const out = await executeAnalyze({
      session: garbagePath,
      homeDir: tmp.dir,
    });
    expect(out).toMatch(/transcript parse failed/i);
    expect(out).not.toContain("回合数: 0");
  });

  it("empty transcript file (legitimately empty session) → reports 回合数: 0 (not parse failure)", async () => {
    const emptyPath = path.join(tmp.dir, "empty.jsonl");
    nodeFs.writeFileSync(emptyPath, "", "utf-8");
    const out = await executeAnalyze({
      session: emptyPath,
      homeDir: tmp.dir,
    });
    expect(out).toContain("回合数: 0");
    expect(out).not.toMatch(/transcript parse failed/i);
  });

  describe("--commit mode", () => {
    const stubLLM = (response: string): LLMClient => ({
      complete: async () => response,
    });

    it("extracts corrections via LLM, writes to store, exports Skills, and schedules docs propagation", async () => {
      const projectDbPath = path.join(tmp.dir, "knowledge.db");
      const userGlobalDbPath = path.join(tmp.dir, "global.db");
      const claudeMdPath = path.join(tmp.dir, "CLAUDE.md");
      const scheduled: string[][] = [];

      const llm = stubLLM(
        "```json\n" +
          JSON.stringify({
            category: "E",
            tags: ["http-client"],
            type: "avoidance",
            nature: "subjective",
            trigger: "需要发 HTTP 请求",
            wrong_pattern: "axios",
            correct_pattern: "fetch",
            reasoning: "零依赖偏好",
          }) +
          "\n```",
      );

      const out = await executeAnalyze({
        session: path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
        homeDir: tmp.dir,
        cwd: tmp.dir,
        commit: true,
        llmClient: llm,
        projectDbPath,
        userGlobalDbPath,
        claudeMdPath,
        idGen: () => "pers-test-0001",
        now: () => new Date("2026-04-14T12:00:00Z"),
        skipCalibrate: true,
        docsPropagationScheduler: (ids) => {
          scheduled.push(ids);
        },
      });

      expect(out).toContain("--commit 模式");
      expect(out).toContain("成功提取: 1");
      expect(out).toContain("知识库: 0 → 1");
      expect(out).toContain("需要发 HTTP 请求");

      // store 落盘
      const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
      const all = store.getAll();
      store.close();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe("pers-test-0001");
      expect(all[0]!.wrong_pattern).toBe("axios");

      expect(nodeFs.existsSync(claudeMdPath)).toBe(false);
      const skillPath = path.join(tmp.dir, ".claude", "skills", "teamagent", "pers-test-0001", "SKILL.md");
      expect(nodeFs.existsSync(skillPath)).toBe(true);
      expect(nodeFs.readFileSync(skillPath, "utf-8")).toContain("fetch");
      expect(scheduled).toEqual([["pers-test-0001"]]);
    });

    it("LLM returning null → skipped, nothing written", async () => {
      const projectDbPath = path.join(tmp.dir, "knowledge.db");
      const userGlobalDbPath = path.join(tmp.dir, "global.db");
      const claudeMdPath = path.join(tmp.dir, "CLAUDE.md");

      const out = await executeAnalyze({
        session: path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
        homeDir: tmp.dir,
        cwd: tmp.dir,
        commit: true,
        llmClient: stubLLM("null"),
        projectDbPath,
        userGlobalDbPath,
        claudeMdPath,
        idGen: () => "never-used",
        now: () => new Date("2026-04-14T12:00:00Z"),
        skipCalibrate: true,
      });

      expect(out).toContain("成功提取: 0");
      expect(out).toContain("跳过 1");
      // store must be empty (DB may or may not exist)
      if (nodeFs.existsSync(projectDbPath)) {
        const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
        const all = store.getAll();
        store.close();
        expect(all).toHaveLength(0);
      }
    });

    it("per-correction LLM error does not abort run", async () => {
      const projectDbPath = path.join(tmp.dir, "knowledge.db");
      const userGlobalDbPath = path.join(tmp.dir, "global.db");
      const claudeMdPath = path.join(tmp.dir, "CLAUDE.md");

      let call = 0;
      const llm: LLMClient = {
        complete: async () => {
          call++;
          throw new Error("boom");
        },
      };

      const out = await executeAnalyze({
        session: path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
        homeDir: tmp.dir,
        cwd: tmp.dir,
        commit: true,
        llmClient: llm,
        projectDbPath,
        userGlobalDbPath,
        claudeMdPath,
        idGen: () => "never",
        now: () => new Date("2026-04-14T12:00:00Z"),
        skipCalibrate: true,
      });

      expect(out).toContain("失败 1");
      expect(call).toBeGreaterThan(0);
    });
  });
});

describe("--commit mode: auto-vectorization", () => {
  let tmp: ReturnType<typeof mkTmp>;

  const stubLLM = (response: string): LLMClient => ({
    complete: async () => response,
  });

  // 384-dim deterministic stub embedder (no Xenova dependency)
  const stubEmbedder = {
    modelId: "analyze-test-deterministic",
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((t) => {
        const v = new Array(384).fill(0.5);
        let h = 0;
        for (let i = 0; i < t.length; i++) h = ((h * 31 + t.charCodeAt(i)) & 0xffff);
        v[h % 384] += 0.5;
        const n = Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0));
        return v.map((x: number) => x / n);
      });
    },
  };

  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { tmp.cleanup(); });

  it("新规则提取后自动写入 knowledge_trigger_vec", async () => {
    const projectDbPath = path.join(tmp.dir, "knowledge.db");
    const userGlobalDbPath = path.join(tmp.dir, "global.db");

    const llm = stubLLM(
      "```json\n" +
        JSON.stringify({
          category: "E",
          tags: ["http-client"],
          type: "avoidance",
          nature: "subjective",
          trigger: "需要发 HTTP 请求",
          wrong_pattern: "axios",
          correct_pattern: "fetch",
          reasoning: "零依赖偏好",
        }) +
        "\n```",
    );

    await executeAnalyze({
      session: path.join(FIXTURE_ROOT, "correction-denial-01.jsonl"),
      homeDir: tmp.dir,
      cwd: tmp.dir,
      commit: true,
      llmClient: llm,
      projectDbPath,
      userGlobalDbPath,
      claudeMdPath: path.join(tmp.dir, "CLAUDE.md"),
      idGen: () => "pers-vec-test-0001",
      now: () => new Date("2026-04-28T12:00:00Z"),
      skipCalibrate: true,
      embedder: stubEmbedder,
    });

    const db = openDb(projectDbPath);
    const vecCount = db.prepare("SELECT COUNT(*) as n FROM knowledge_trigger_vec").get() as { n: number };
    const patVecCount = db.prepare("SELECT COUNT(*) as n FROM knowledge_pattern_vec").get() as { n: number };
    const metadata = db.prepare("SELECT embedder_model_id FROM knowledge WHERE id = ?").get(
      "pers-vec-test-0001",
    ) as { embedder_model_id: string };
    db.close();

    expect(vecCount.n).toBe(1);
    expect(patVecCount.n).toBe(1);
    expect(metadata.embedder_model_id).toBe(stubEmbedder.modelId);
  });
});

describe("parseAnalyzeArgs", () => {
  it("empty → no options", () => {
    expect(parseAnalyzeArgs([])).toEqual({});
  });

  it("--verbose", () => {
    expect(parseAnalyzeArgs(["--verbose"])).toEqual({ verbose: true });
    expect(parseAnalyzeArgs(["-v"])).toEqual({ verbose: true });
  });

  it("--session=path", () => {
    expect(parseAnalyzeArgs(["--session=/a/b.jsonl"])).toEqual({
      session: "/a/b.jsonl",
    });
  });

  it("--session path (two args)", () => {
    expect(parseAnalyzeArgs(["--session", "abc"])).toEqual({ session: "abc" });
  });

  it("combined", () => {
    expect(parseAnalyzeArgs(["--session=x", "-v"])).toEqual({
      session: "x",
      verbose: true,
    });
  });

  it("--commit flag", () => {
    expect(parseAnalyzeArgs(["--commit"])).toEqual({ commit: true });
    expect(parseAnalyzeArgs(["--session=a", "--commit", "-v"])).toEqual({
      session: "a",
      commit: true,
      verbose: true,
    });
  });
});
