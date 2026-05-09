// issue #168: 状态栏字段加中文标签 + 消除 helped/risk 重叠 + 抑制
// SQLite ExperimentalWarning + B-lite 0/0/0 待命引导。
//
// 这里通过 spawn 真实 `node scripts/teamagent-statusline.cjs` 验证 stdout /
// stderr / exit code，不 mock —— statusline 是 sub-shell 黑盒进程，行为合同
// 必须按"实际拼出的字符串"来锁。
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Vite transformer 在 ESM test file 里会把 `import "node:sqlite"` 重写成
// `import "sqlite"` → resolve 失败。其他 test 走 createRequire 兜底。
const requireCjs = createRequire(import.meta.url);
const { DatabaseSync } = requireCjs("node:sqlite") as typeof import("node:sqlite");

const HERE = path.dirname(fileURLToPath(import.meta.url));
// repo root: packages/cli/src/__tests__ → 4 up
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const STATUSLINE = path.join(REPO_ROOT, "scripts", "teamagent-statusline.cjs");

function mkTmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "statusline-iss168-"));
}

function seedKnowledge(home: string, file: "global.db" | "knowledge.db", projectDir = home): void {
  const dir =
    file === "knowledge.db"
      ? path.join(projectDir, ".teamagent")
      : path.join(home, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, file));
  db.exec("CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)");
  db.close();
}

function seedKnowledgeWithRows(
  home: string,
  rows: Array<{ status: string; type: string | null }>,
): void {
  const dir = path.join(home, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "global.db"));
  db.exec("CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)");
  const ins = db.prepare("INSERT INTO knowledge VALUES (?, ?, ?)");
  const ts = new Date().toISOString();
  for (const r of rows) ins.run(r.status, r.type, ts);
  db.close();
}

function seedEvents(home: string, rows: Array<{ kind: string; daysAgo?: number }>): void {
  const dir = path.join(home, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "events.db"));
  db.exec("CREATE TABLE events (kind TEXT, timestamp TEXT)");
  const ins = db.prepare("INSERT INTO events (kind, timestamp) VALUES (?, ?)");
  for (const r of rows) {
    const d = new Date();
    d.setDate(d.getDate() - (r.daysAgo ?? 0));
    ins.run(r.kind, d.toISOString());
  }
  db.close();
}

function runStatusline(home: string, cwd?: string): { stdout: string; stderr: string; status: number } {
  const out = spawnSync("node", [STATUSLINE], {
    cwd: cwd ?? home,
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, ".config") },
    encoding: "utf-8",
  });
  return { stdout: out.stdout, stderr: out.stderr, status: out.status ?? -1 };
}

describe("statusline issue #168 — labelled fields + de-overlap + warning suppression", () => {
  it("uses Chinese labels with 今/周 suffix and pipe-with-space separator", () => {
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [
        { status: "active", type: "avoidance" },
        { status: "active", type: "practice" },
        { status: "active", type: "wiki" }, // wiki 不计
      ]);
      seedEvents(home, [
        { kind: "hook-pre.passive_matched", daysAgo: 0 },
        { kind: "hook-pre.passive_matched", daysAgo: 0 },
        { kind: "ai.narrative.injected", daysAgo: 1 },
        { kind: "hook-pre.warned", daysAgo: 0 },
      ]);
      const r = runStatusline(home);
      // 中文标签 + 时间窗后缀 + " | " 分隔符
      expect(r.stdout).toContain("规则:2");
      expect(r.stdout).toContain("帮过:");
      expect(r.stdout).toContain("今/");
      expect(r.stdout).toContain("周");
      expect(r.stdout).toContain("拦过:");
      expect(r.stdout).toMatch(/TeamAgent \| 规则:/);
      // 不含老英文裸字段
      expect(r.stdout).not.toMatch(/\brules:/);
      expect(r.stdout).not.toMatch(/\bhelped:/);
      expect(r.stdout).not.toMatch(/\brisk:/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("counts helped and risk on disjoint event kinds (no double-counting)", () => {
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: "avoidance" }]);
      // 关键 case: hook-pre.warned 和 hook-pre.blocked 旧实现里同时计入 helped+risk。
      // 新实现里它们只属于 RISK，不再被算成 helped。
      seedEvents(home, [
        { kind: "hook-pre.warned", daysAgo: 0 },
        { kind: "hook-pre.blocked", daysAgo: 0 },
      ]);
      const r = runStatusline(home);
      // helped 今 = 0（passive_matched 等正向事件没出现）
      expect(r.stdout).toContain("帮过:0今");
      // risk 今 = 2（warned + blocked 都计 risk）
      expect(r.stdout).toContain("拦过:2今");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("suppresses Node 22 SQLite ExperimentalWarning on stderr", () => {
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: null }]);
      const r = runStatusline(home);
      expect(r.status).toBe(0);
      // stderr 不应该含 ExperimentalWarning（issue #168 D 修复）
      expect(r.stderr).not.toContain("ExperimentalWarning");
      expect(r.stderr).not.toContain("SQLite is an experimental feature");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back to onboarding idle hint when 0/0/0 with no events", () => {
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: "avoidance" }]);
      // 显式建空 events 表（无 row）→ 三个 count 都是 0
      seedEvents(home, []);
      const r = runStatusline(home);
      // B-lite hint 出现
      expect(r.stdout).toContain("待命中（让我学几条规则吧）");
      // 老的干瘪 hint 不再出现在 idle 路径
      expect(r.stdout).not.toMatch(/\| 护航中$/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("uses contribution hint (not idle) once any event exists", () => {
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: "avoidance" }]);
      seedEvents(home, [{ kind: "hook-pre.passive_matched", daysAgo: 0 }]);
      const r = runStatusline(home);
      // 命中过事件 → hint 走 CONTRIBUTION_HINTS 文案，不再用 idle
      expect(r.stdout).toContain("刚静默命中规则");
      expect(r.stdout).not.toContain("待命中（让我学几条规则吧）");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("HELPED_EVENT_KINDS and RISK_EVENT_KINDS arrays do not overlap (static check)", () => {
    const src = fs.readFileSync(STATUSLINE, "utf-8");
    function extractArray(name: string): string[] {
      // /review iter-1 finding #2: matchAll + 断言唯一声明，避免 shadow 偷藏。
      // /review iter-2 finding #3: 先剥掉行注释，避免 `// const NAME = [...]`
      // 这种被 grep 套进来的注释行让"唯一声明"断言假阳性。
      const stripped = src
        .split("\n")
        .map((line) => line.replace(/\/\/.*$/, ""))
        .join("\n");
      const matches = Array.from(
        stripped.matchAll(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`, "g")),
      );
      expect(matches.length, `${name} should be declared exactly once`).toBe(1);
      const body = matches[0]?.[1];
      if (!body) throw new Error(`array ${name} body empty`);
      return body
        .split("\n")
        .map((line) => {
          const q = line.match(/"([^"]+)"/);
          return q ? q[1] : null;
        })
        .filter((v): v is string => v !== null);
    }
    const helped = extractArray("HELPED_EVENT_KINDS");
    const risk = extractArray("RISK_EVENT_KINDS");
    expect(helped.length).toBeGreaterThan(0);
    expect(risk.length).toBeGreaterThan(0);
    const overlap = helped.filter((k) => risk.includes(k));
    expect(overlap).toEqual([]);
  });

  it("clamps count window upper bound to now (future-dated events do not inflate counters)", () => {
    // /review iter-2 finding #1: clock-skewed laptop or events synced from
    // another machine with timestamp > now used to land in 今/周 forever.
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: "avoidance" }]);
      // helper seedEvents only supports daysAgo (past). Manually insert future row:
      const dir = path.join(home, ".teamagent");
      fs.mkdirSync(dir, { recursive: true });
      const db = new DatabaseSync(path.join(dir, "events.db"));
      db.exec("CREATE TABLE events (kind TEXT, timestamp TEXT)");
      const future = new Date();
      future.setDate(future.getDate() + 5); // +5 days
      db.prepare("INSERT INTO events (kind, timestamp) VALUES (?, ?)").run(
        "hook-pre.passive_matched",
        future.toISOString(),
      );
      db.close();
      const r = runStatusline(home);
      // future-dated event must NOT be counted in 今/周
      expect(r.stdout).toContain("帮过:0今/0周");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not count hook-post.result or error.candidate.rejected as helped (metadata events)", () => {
    // /review adversarial pass finding #1: hook-post.result fires for every
    // post-tool-use including failures, and error.candidate.rejected is a user
    // saying "your extracted candidate was wrong" — neither is a "tool helped"
    // signal. Both must NOT inflate the 帮过 counter.
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: "avoidance" }]);
      seedEvents(home, [
        { kind: "hook-post.result", daysAgo: 0 },
        { kind: "hook-post.result", daysAgo: 0 },
        { kind: "error.candidate.rejected", daysAgo: 0 },
      ]);
      const r = runStatusline(home);
      expect(r.stdout).toContain("帮过:0今/0周");
      // 也不能误归到风险里；它们是 metadata，两边都不进
      expect(r.stdout).toContain("拦过:0今");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("preserves non-Experimental warnings on stderr (DeprecationWarning still surfaces)", () => {
    // /review adversarial pass finding #3: blanket suppression hides real
    // production issues. Filter must be selective.
    const home = mkTmpHome();
    try {
      seedKnowledgeWithRows(home, [{ status: "active", type: "avoidance" }]);
      // We can't easily trigger a DeprecationWarning from inside the spawned
      // statusline process, but we can assert the handler shape: it explicitly
      // checks `w.name === "ExperimentalWarning"` and writes others to stderr.
      const src = fs.readFileSync(STATUSLINE, "utf-8");
      expect(src).toContain('w?.name === "ExperimentalWarning"');
      expect(src).toMatch(/process\.stderr\.write/);
      // And the smoke run still exits clean
      const r = runStatusline(home);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain("ExperimentalWarning");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
