import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executePitfall, parsePitfallArgs } from "../commands/pitfall.js";
import { DualLayerStore, openDb } from "@teamagent/adapters";

// 384-dim stub embedder，无 Xenova native 依赖，行为确定。
const stubEmbedder = {
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

function mkTmp(): { cwd: string; home: string; cleanup: () => void } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pitfall-cwd-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pitfall-home-"));
  return {
    cwd,
    home,
    cleanup: () => {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

describe("executePitfall", () => {
  let tmp: ReturnType<typeof mkTmp>;
  const fixedNow = "2026-04-14T10:00:00Z";

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("writes a new entry to personal knowledge store (project DB)", async () => {
    await executePitfall(
      {
        trigger: "npm install moment",
        wrong: "moment",
        correct: "dayjs",
        reason: "moment 已停止维护",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );

    const dbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const globalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    const store = new DualLayerStore({ projectDbPath: dbPath, userGlobalDbPath: globalDbPath });
    const all = store.getAll();
    store.close();
    expect(all).toHaveLength(1);
    const entry = all[0]!;
    expect(entry.trigger).toBe("npm install moment");
    expect(entry.wrong_pattern).toBe("moment");
    expect(entry.correct_pattern).toBe("dayjs");
    expect(entry.scope.level).toBe("personal");
  });

  it("creates CLAUDE.md with TEAMAGENT block", async () => {
    await executePitfall(
      {
        trigger: "t",
        wrong: "w",
        correct: "c",
        reason: "r",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );

    const mdPath = path.join(tmp.cwd, "CLAUDE.md");
    expect(fs.existsSync(mdPath)).toBe(true);
    const content = fs.readFileSync(mdPath, "utf-8");
    expect(content).toContain("TEAMAGENT:START");
    expect(content).toContain("使用 c 而非 w");
  });

  it("preserves existing CLAUDE.md content when updating", async () => {
    const mdPath = path.join(tmp.cwd, "CLAUDE.md");
    fs.writeFileSync(mdPath, "# My Project\n\nRule: always X\n", "utf-8");

    await executePitfall(
      { trigger: "t", wrong: "w", correct: "c", reason: "r" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );

    const content = fs.readFileSync(mdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Rule: always X");
    expect(content).toContain("TEAMAGENT:START");
  });

  it("returns attribution block in smart mode by default", async () => {
    const out = await executePitfall(
      {
        trigger: "t",
        wrong: "moment",
        correct: "dayjs",
        reason: "r",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );
    expect(out).toContain("✨ TeamAgent");
    expect(out).toContain("添加知识条目");
    expect(out).toContain("知识库变化: 0 → 1 条");
    expect(out).toContain("传播到:");
    expect(out).toContain("CLAUDE.md");
    expect(out).toContain("dayjs");
  });

  // B-065: avoidance pitfall 实际写入 CLAUDE.md 知识块；归因消息以前
  // 硬编码 count: 0 → 显示 "第 0 行"，让用户怀疑规则没生效。修复后
  // count 应反映实际写入的块行数 ≥ 1。
  it("avoidance pitfall: 传播到 显示真实的 CLAUDE.md 行数 (>0, 不再是 '第 0 行')", async () => {
    const out = await executePitfall(
      {
        trigger: "moment 用法",
        wrong: "moment().format()",
        correct: "dayjs().format()",
        reason: "moment 体积大 + 不再维护",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );
    // 显示到 CLAUDE.md
    expect(out).toMatch(/传播到:.*CLAUDE\.md/);
    // 不再显示 "第 0 行"
    expect(out).not.toMatch(/CLAUDE\.md\s*第\s*0\s*行/);
    // 真实写入的块至少 1 行
    expect(out).toMatch(/CLAUDE\.md\s*第\s*[1-9]\d*\s*行/);
  });

  // B-065: practice pitfall (无 wrong_pattern) 不进 CLAUDE.md，只
  // 进 ~/.claude/skills/teamagent/<id>/SKILL.md。归因应该指向
  // SKILL.md，避免误导用户以为规则在 CLAUDE.md 生效。
  it("practice pitfall: 传播到 应指向 SKILL.md (不在 CLAUDE.md)", async () => {
    const out = await executePitfall(
      {
        trigger: "完成开发分支后",
        wrong: "", // practice 类
        correct: "调用 finishing-a-development-branch skill 跑完整流程",
        reason: "skill 流程是验证的",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );
    expect(out).toContain("传播到:");
    // practice 类规则总是写入 skill 路径
    expect(out).toMatch(/SKILL\.md/);
  });

  it("silent mode returns empty output", async () => {
    const out = await executePitfall(
      { trigger: "t", wrong: "w", correct: "c", reason: "r" },
      {
        cwd: tmp.cwd,
        homeDir: tmp.home,
        now: () => fixedNow,
        env: { TEAMAGENT_VISIBILITY: "silent" },
        embedder: stubEmbedder,
      },
    );
    expect(out).toBe("");
  });

  it("verbose mode includes counterfactual", async () => {
    const out = await executePitfall(
      { trigger: "t", wrong: "w", correct: "c", reason: "r" },
      {
        cwd: tmp.cwd,
        homeDir: tmp.home,
        now: () => fixedNow,
        env: { TEAMAGENT_VISIBILITY: "verbose" },
        embedder: stubEmbedder,
      },
    );
    expect(out).toContain("如果没有 TeamAgent");
  });

  it("empty wrong_pattern → type=practice", async () => {
    await executePitfall(
      {
        trigger: "代码审查前",
        wrong: "",
        correct: "运行完整测试套件确认零破坏",
        reason: "改了再测是敏捷核心",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );
    const dbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const globalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    const store = new DualLayerStore({ projectDbPath: dbPath, userGlobalDbPath: globalDbPath });
    const all = store.getAll();
    store.close();
    expect(all[0]?.type).toBe("practice");
  });

  it("team level → personal scope in project DB (v2 maps team→personal)", async () => {
    await executePitfall(
      {
        trigger: "t",
        wrong: "w",
        correct: "c",
        reason: "r",
        level: "team",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );

    const dbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const globalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    const store = new DualLayerStore({ projectDbPath: dbPath, userGlobalDbPath: globalDbPath });
    const all = store.getAll();
    store.close();
    expect(all).toHaveLength(1);
    expect(all[0]?.scope.level).toBe("personal");
  });

  it("subjective nature caps enforcement at warn even with high confidence", async () => {
    await executePitfall(
      {
        trigger: "t",
        wrong: "w",
        correct: "c",
        reason: "r",
        nature: "subjective",
      },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );
    const dbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    const globalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    const store = new DualLayerStore({ projectDbPath: dbPath, userGlobalDbPath: globalDbPath });
    const all = store.getAll();
    store.close();
    expect(all[0]?.enforcement).toBe("warn");
  });
});

describe("executePitfall: 自动向量同步", () => {
  let tmp: ReturnType<typeof mkTmp>;
  const fixedNow = "2026-04-27T10:00:00Z";

  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { tmp.cleanup(); });

  it("新规则写入后 trigger_description 已被填充", async () => {
    await executePitfall(
      { trigger: "调用外部 HTTP API 时", wrong: "axios", correct: "fetch + 错误处理", reason: "axios 过重" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );

    const db = openDb(path.join(tmp.cwd, ".teamagent", "knowledge.db"));
    const row = db.prepare("SELECT trigger_description FROM knowledge LIMIT 1").get() as any;
    db.close();

    expect(typeof row?.trigger_description).toBe("string");
    expect(row.trigger_description.length).toBeGreaterThan(0);
  });

  it("新规则写入后 knowledge_trigger_vec 中有对应向量", async () => {
    await executePitfall(
      { trigger: "调用外部 HTTP API 时", wrong: "axios", correct: "fetch", reason: "r" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    );

    const db = openDb(path.join(tmp.cwd, ".teamagent", "knowledge.db"));
    // 查询 vec 表行数：修复前 = 0，修复后 = 1
    const vecCount = db.prepare("SELECT COUNT(*) as n FROM knowledge_trigger_vec").get() as any;
    db.close();

    expect(vecCount.n).toBe(1);
  });

  it("embedder 失败时也不崩溃（embedder 是 best-effort）", async () => {
    const failingEmbedder = {
      async embed(): Promise<number[][]> {
        throw new Error("embedding unavailable");
      },
    };
    await expect(
      executePitfall(
        { trigger: "t", wrong: "w", correct: "c", reason: "r" },
        {
          cwd: tmp.cwd,
          homeDir: tmp.home,
          now: () => fixedNow,
          env: {},
          embedder: failingEmbedder,
        },
      ),
    ).resolves.not.toThrow();
  });

  it.skipIf(process.platform === "win32" && process.env.CI === "true")(
    "不提供 embedder 时也不崩溃（embedder 是 best-effort）",
    async () => {
      // 不注入 embedder，默认会尝试 XenovaRuleEmbedder；超时或失败都不应该抛出
      await expect(
        executePitfall(
          { trigger: "t", wrong: "w", correct: "c", reason: "r" },
          { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {} },
        ),
      ).resolves.not.toThrow();
    },
  );

  it("异步生成不阻塞 pitfall：录入后函数正常返回", async () => {
    // 只验证 pitfall 本身不因 generateToolContextAsync 失败而崩溃
    await expect(
      executePitfall(
        { trigger: "git push --force 到主分支", wrong: "--force", correct: "PR 流程", reason: "保护主分支历史" },
        { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
      ),
    ).resolves.not.toThrow();
  });
});

describe("parsePitfallArgs", () => {
  it("returns null without --non-interactive", () => {
    expect(parsePitfallArgs([])).toBeNull();
    expect(parsePitfallArgs(["--trigger=x"])).toBeNull();
  });

  it("parses flags into input object", () => {
    const input = parsePitfallArgs([
      "--non-interactive",
      "--trigger=npm install moment",
      "--wrong=moment",
      "--correct=dayjs",
      "--reason=deprecated",
      "--category=E",
      "--tags=tech-choice,date",
      "--level=personal",
      "--nature=subjective",
    ]);
    expect(input).toEqual({
      trigger: "npm install moment",
      wrong: "moment",
      correct: "dayjs",
      reason: "deprecated",
      category: "E",
      tags: ["tech-choice", "date"],
      level: "personal",
      nature: "subjective",
    });
  });

  it("handles missing optional flags", () => {
    const input = parsePitfallArgs([
      "--non-interactive",
      "--trigger=t",
      "--wrong=w",
      "--correct=c",
      "--reason=r",
    ]);
    expect(input).not.toBeNull();
    expect(input!.trigger).toBe("t");
    expect(input!.category).toBeUndefined();
    expect(input!.tags).toBeUndefined();
  });

  it("throws PitfallValidationError when required flags are missing", () => {
    expect(() =>
      parsePitfallArgs([
        "--non-interactive",
        "--trigger=t",
        "--wrong=w",
        "--correct=c",
        // --reason missing
      ]),
    ).toThrow(/缺少必填字段.*--reason/);
    expect(() =>
      parsePitfallArgs([
        "--non-interactive",
        "--trigger=", // empty
        "--correct=c",
        "--reason=r",
      ]),
    ).toThrow(/缺少必填字段.*--trigger/);
  });

  // B-067: pitfall 字段无长度上限会让 10000 字符的 trigger 入库 + 向量化 +
  // 编译进 CLAUDE.md 的 3000 token 预算，造成知识被一条恶性条目占满。
  describe("B-067 length validation", () => {
    it("rejects trigger over 1000 chars", () => {
      const longText = "a".repeat(1001);
      expect(() =>
        parsePitfallArgs([
          "--non-interactive",
          `--trigger=${longText}`,
          "--correct=c",
          "--reason=r",
        ]),
      ).toThrow(/超长|过长|长度|too long|length/i);
    });

    it("rejects wrong over 1000 chars", () => {
      const longText = "x".repeat(1500);
      expect(() =>
        parsePitfallArgs([
          "--non-interactive",
          "--trigger=t",
          `--wrong=${longText}`,
          "--correct=c",
          "--reason=r",
        ]),
      ).toThrow(/超长|过长|长度|too long|length/i);
    });

    it("rejects correct over 1000 chars", () => {
      const longText = "y".repeat(2000);
      expect(() =>
        parsePitfallArgs([
          "--non-interactive",
          "--trigger=t",
          `--correct=${longText}`,
          "--reason=r",
        ]),
      ).toThrow(/超长|过长|长度|too long|length/i);
    });

    it("rejects reason over 1000 chars", () => {
      const longText = "z".repeat(1001);
      expect(() =>
        parsePitfallArgs([
          "--non-interactive",
          "--trigger=t",
          "--correct=c",
          `--reason=${longText}`,
        ]),
      ).toThrow(/超长|过长|长度|too long|length/i);
    });

    it("accepts fields exactly at 1000-char boundary", () => {
      const exact = "a".repeat(1000);
      const input = parsePitfallArgs([
        "--non-interactive",
        `--trigger=${exact}`,
        "--correct=c",
        "--reason=r",
      ]);
      expect(input).not.toBeNull();
      expect(input!.trigger.length).toBe(1000);
    });
  });
});
