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

// issue #331: CC pipes a JSON payload to the statusline command's stdin.
// `runStatuslineWithStdin` runs the cjs with that payload supplied so we can
// lock the new 模型/上下文/用量/5h/7d/会话 fields without spinning a real CC.
function runStatuslineWithStdin(
  home: string,
  stdin: string,
  cwd?: string,
): { stdout: string; stderr: string; status: number } {
  const out = spawnSync("node", [STATUSLINE], {
    cwd: cwd ?? home,
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, ".config") },
    encoding: "utf-8",
    input: stdin,
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

// Worktree handling: when cwd is a git worktree, PROJECT_DB used to be
// resolved purely from `process.cwd()/.teamagent/knowledge.db`. Worktrees
// share state with their main checkout (`.git` is a FILE pointing to
// `<main>/.git/worktrees/<name>`), so the project DB lives in the main
// checkout — not under the worktree. The statusline must walk the .git
// pointer to find the main checkout's DB instead of falsely flagging the
// project as uninitialised every time the user opens a worktree session.
function seedProjectKnowledge(
  projectRoot: string,
  rows: Array<{ status: string; type: string | null }>,
): void {
  const dir = path.join(projectRoot, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "knowledge.db"));
  db.exec("CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)");
  const ins = db.prepare("INSERT INTO knowledge VALUES (?, ?, ?)");
  const ts = new Date().toISOString();
  for (const r of rows) ins.run(r.status, r.type, ts);
  db.close();
}

function makeFakeWorktree(): { home: string; main: string; worktree: string } {
  const home = mkTmpHome();
  const main = fs.mkdtempSync(path.join(os.tmpdir(), "statusline-main-"));
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "statusline-wt-"));
  fs.mkdirSync(path.join(main, ".git", "worktrees", "wt1"), { recursive: true });
  fs.writeFileSync(
    path.join(worktree, ".git"),
    `gitdir: ${path.join(main, ".git", "worktrees", "wt1")}\n`,
    "utf-8",
  );
  return { home, main, worktree };
}

function cleanupFakeWorktree(dirs: { home: string; main: string; worktree: string }): void {
  for (const d of [dirs.home, dirs.main, dirs.worktree]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

// issue #331: expose Claude Code runtime state (模型/上下文/用量/5h/7d/会话健康)
// when CC pipes its stdin JSON to the statusline command. Empty stdin must
// remain byte-identical to the legacy 4-field output (existing tests above).
describe("statusline issue #331 — CC runtime fields when stdin is supplied", () => {
  function seedDbs(home: string): void {
    fs.mkdirSync(path.join(home, ".teamagent"), { recursive: true });
    for (const f of ["global.db", "events.db"] as const) {
      const db = new DatabaseSync(path.join(home, ".teamagent", f));
      if (f === "global.db") {
        db.exec("CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)");
      } else {
        db.exec("CREATE TABLE events (kind TEXT, timestamp TEXT)");
      }
      db.close();
    }
  }

  function writeTranscript(
    home: string,
    rows: Array<{ tsOffsetMs: number; input: number; cacheCreate?: number; cacheRead?: number; output: number }>,
  ): string {
    const dir = path.join(home, ".claude", "projects", "fake");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "sess.jsonl");
    const now = Date.now();
    const lines = rows
      .map((r) => {
        const obj = {
          type: "assistant",
          timestamp: new Date(now - r.tsOffsetMs).toISOString(),
          message: {
            model: "Test",
            usage: {
              input_tokens: r.input,
              cache_creation_input_tokens: r.cacheCreate ?? 0,
              cache_read_input_tokens: r.cacheRead ?? 0,
              output_tokens: r.output,
            },
          },
        };
        return JSON.stringify(obj);
      })
      .join("\n");
    fs.writeFileSync(file, lines, "utf-8");
    return file;
  }

  it("appends 模型/上下文/用量/5h/7d/会话 fields when CC stdin supplied", () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      const transcript = writeTranscript(home, [
        // Most-recent line is the FIRST entry latest-by-timestamp (60s ago)
        { tsOffsetMs: 60_000, input: 200, cacheCreate: 40_000, cacheRead: 60_000, output: 500 },
        // Inside the 5h window but not the latest
        { tsOffsetMs: 2 * 60 * 60 * 1000, input: 100, cacheRead: 900, output: 0 },
        // Outside 5h but inside 7d
        { tsOffsetMs: 3 * 24 * 60 * 60 * 1000, input: 50, cacheRead: 450, output: 0 },
      ]);
      const payload = JSON.stringify({
        hook_event_name: "Status",
        session_id: "sess",
        transcript_path: transcript,
        cwd: "/fake",
        model: { id: "opus-4-7", display_name: "Opus 4.7 (1M)" },
        cost: { total_cost_usd: 0.42 },
        exceeds_200k_tokens: false,
      });
      const r = runStatuslineWithStdin(home, payload);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("模型:Opus 4.7 (1M)");
      // 上下文 = latest assistant usage from transcript tail (LAST row order in
      // file). The latest line in file order has output 0 and small cache_read,
      // so ctx is the sum of its tokens. We assert presence rather than exact
      // value so the test stays stable across rounding tweaks.
      expect(r.stdout).toMatch(/上下文:\d/);
      expect(r.stdout).toContain("用量:$0.42");
      // 5h window contains the 60s-ago line (100,700 tokens) + 2h-ago line
      // (1,000 tokens) = 101,700 → 101.7K. Use a loose regex since formatting
      // may evolve.
      expect(r.stdout).toMatch(/5h:\d+(?:\.\d+)?K/);
      expect(r.stdout).toMatch(/7d:\d+(?:\.\d+)?K/);
      expect(r.stdout).toContain("会话:OK");
      // Legacy fields still present in exact form.
      expect(r.stdout).toContain("TeamAgent | 规则:");
      expect(r.stdout).toContain("帮过:");
      expect(r.stdout).toContain("拦过:");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("renders 会话:⚠超长 when exceeds_200k_tokens is true", () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      const transcript = writeTranscript(home, [
        { tsOffsetMs: 60_000, input: 200_000, output: 0 },
      ]);
      const payload = JSON.stringify({
        transcript_path: transcript,
        model: { display_name: "Sonnet 4" },
        exceeds_200k_tokens: true,
      });
      const r = runStatuslineWithStdin(home, payload);
      expect(r.stdout).toContain("会话:⚠超长");
      expect(r.stdout).not.toContain("会话:OK");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("skips missing CC fields gracefully (partial stdin → only present fields shown)", () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      // Only model.display_name supplied — no transcript, no cost, no exceeds flag.
      const payload = JSON.stringify({ model: { display_name: "Haiku 4.5" } });
      const r = runStatuslineWithStdin(home, payload);
      expect(r.stdout).toContain("模型:Haiku 4.5");
      expect(r.stdout).not.toContain("上下文:");
      expect(r.stdout).not.toContain("用量:");
      expect(r.stdout).not.toContain("5h:");
      expect(r.stdout).not.toContain("7d:");
      // exceeds_200k_tokens absent → 会话 field skipped entirely (not OK, not 超长).
      expect(r.stdout).not.toContain("会话:");
      // Legacy fields still rendered.
      expect(r.stdout).toContain("TeamAgent | 规则:0 | 帮过:0今/0周 | 拦过:0今");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("treats invalid JSON stdin like empty stdin (legacy 4-field output)", () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      const r = runStatuslineWithStdin(home, "not-valid-json");
      expect(r.status).toBe(0);
      // Legacy bytes only — none of the new fields should leak through.
      for (const anchor of ["模型:", "上下文:", "用量:", "5h:", "7d:", "会话:"]) {
        expect(r.stdout).not.toContain(anchor);
      }
      expect(r.stdout).toMatch(/TeamAgent \| 规则:0 \| 帮过:0今\/0周 \| 拦过:0今 \| /);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("ignores cost.total_cost_usd === 0 (no 用量:$0.00 noise)", () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      const payload = JSON.stringify({
        model: { display_name: "Sonnet 4" },
        cost: { total_cost_usd: 0 },
      });
      const r = runStatuslineWithStdin(home, payload);
      expect(r.stdout).toContain("模型:Sonnet 4");
      expect(r.stdout).not.toContain("用量:");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("handles missing transcript file silently (上下文/5h/7d skipped)", () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      const payload = JSON.stringify({
        model: { display_name: "Opus" },
        transcript_path: path.join(home, "does-not-exist.jsonl"),
        cost: { total_cost_usd: 0.05 },
        exceeds_200k_tokens: false,
      });
      const r = runStatuslineWithStdin(home, payload);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("模型:Opus");
      expect(r.stdout).toContain("用量:$0.05");
      expect(r.stdout).toContain("会话:OK");
      // 上下文 / 5h / 7d skipped because transcript_path doesn't exist
      expect(r.stdout).not.toContain("上下文:");
      expect(r.stdout).not.toContain("5h:");
      expect(r.stdout).not.toContain("7d:");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("statusline worktree handling — resolve project DB via main checkout", () => {
  it("reads project DB from the main checkout when cwd is a git worktree", () => {
    const dirs = makeFakeWorktree();
    try {
      // Seed 7 rules into the MAIN checkout, NOT the worktree
      seedProjectKnowledge(
        dirs.main,
        Array.from({ length: 7 }, () => ({ status: "active", type: "avoidance" })),
      );
      const r = runStatusline(dirs.home, dirs.worktree);
      expect(r.stdout).not.toContain("TeamAgent 未初始化本项目");
      // Rule count must come from the main checkout's project DB
      expect(r.stdout).toContain("规则:7");
    } finally {
      cleanupFakeWorktree(dirs);
    }
  });

  it("still warns when the worktree's main checkout has no project DB", () => {
    const dirs = makeFakeWorktree();
    try {
      // No seedProjectKnowledge call — main checkout is NOT init'd.
      const r = runStatusline(dirs.home, dirs.worktree);
      // The warning must still fire, telling the user to run `teamagent init`
      // (in the main checkout — `teamagent init` itself is responsible for
      // landing the DB at the canonical location).
      expect(r.stdout).toContain("TeamAgent 未初始化本项目");
    } finally {
      cleanupFakeWorktree(dirs);
    }
  });

  it("prefers project DB inside the worktree over the main checkout when both exist", () => {
    // If somebody explicitly init'd inside the worktree (unusual), the local
    // DB wins — the resolver's first probe is always cwd itself, so non-
    // worktree behaviour is preserved.
    const dirs = makeFakeWorktree();
    try {
      seedProjectKnowledge(
        dirs.main,
        Array.from({ length: 3 }, () => ({ status: "active", type: "avoidance" })),
      );
      seedProjectKnowledge(
        dirs.worktree,
        Array.from({ length: 11 }, () => ({ status: "active", type: "avoidance" })),
      );
      const r = runStatusline(dirs.home, dirs.worktree);
      expect(r.stdout).not.toContain("TeamAgent 未初始化本项目");
      expect(r.stdout).toContain("规则:11");
    } finally {
      cleanupFakeWorktree(dirs);
    }
  });

  it("does not follow submodule .git files (gitdir: <super>/.git/modules/<name>)", () => {
    // Submodules also write `.git` as a FILE pointing back to the super-
    // project, but the gitdir path contains `.git/modules/<name>`, NOT
    // `.git/worktrees/<name>`. The resolver must NOT walk it as a worktree —
    // otherwise we'd bleed across module boundaries.
    const home = mkTmpHome();
    const superRoot = fs.mkdtempSync(path.join(os.tmpdir(), "statusline-super-"));
    const submodule = fs.mkdtempSync(path.join(os.tmpdir(), "statusline-sub-"));
    try {
      fs.mkdirSync(path.join(superRoot, ".git", "modules", "sub"), { recursive: true });
      // Seed knowledge in the super-project so a buggy resolver would
      // wrongly suppress the uninitialised warning.
      seedProjectKnowledge(superRoot, [{ status: "active", type: "avoidance" }]);
      fs.writeFileSync(
        path.join(submodule, ".git"),
        `gitdir: ${path.join(superRoot, ".git", "modules", "sub")}\n`,
        "utf-8",
      );
      const r = runStatusline(home, submodule);
      expect(r.stdout).toContain("TeamAgent 未初始化本项目");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(superRoot, { recursive: true, force: true });
      fs.rmSync(submodule, { recursive: true, force: true });
    }
  });

  it("parses multi-line .git files (gitdir: <path>\\ncommondir: ...)", () => {
    // Some git versions / third-party tooling emit a multi-line `.git` file:
    //   gitdir: <main>/.git/worktrees/<name>
    //   commondir: <main>/.git
    // The regex must still match the gitdir line in that shape.
    const dirs = makeFakeWorktree();
    try {
      seedProjectKnowledge(
        dirs.main,
        Array.from({ length: 5 }, () => ({ status: "active", type: "avoidance" })),
      );
      const gitdir = path.join(dirs.main, ".git", "worktrees", "wt1");
      const commondir = path.join(dirs.main, ".git");
      fs.writeFileSync(
        path.join(dirs.worktree, ".git"),
        `gitdir: ${gitdir}\ncommondir: ${commondir}\n`,
        "utf-8",
      );
      const r = runStatusline(dirs.home, dirs.worktree);
      expect(r.stdout).not.toContain("TeamAgent 未初始化本项目");
      expect(r.stdout).toContain("规则:5");
    } finally {
      cleanupFakeWorktree(dirs);
    }
  });

  it("rejects relative gitdir paths to close path-traversal vector", () => {
    // A hostile `.git` file in an attacker-writable cwd with a relative
    // `gitdir: ../../../some/path/.git/worktrees/x` could otherwise be
    // resolved against cwd to redirect us to read an arbitrary DB. Real
    // `git worktree add` always writes absolute paths, so rejecting
    // relative entries is safe and closes the attack surface.
    const home = mkTmpHome();
    const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "statusline-sibling-"));
    const hostile = fs.mkdtempSync(path.join(os.tmpdir(), "statusline-hostile-"));
    try {
      // Put a real DB at `sibling/.teamagent/knowledge.db` and shape a
      // `.git/worktrees/...` directory under it, then point a relative
      // gitdir from hostile cwd to it.
      fs.mkdirSync(path.join(sibling, ".git", "worktrees", "wt1"), { recursive: true });
      seedProjectKnowledge(
        sibling,
        Array.from({ length: 99 }, () => ({ status: "active", type: "avoidance" })),
      );
      const relGitdir = path.relative(
        hostile,
        path.join(sibling, ".git", "worktrees", "wt1"),
      );
      fs.writeFileSync(path.join(hostile, ".git"), `gitdir: ${relGitdir}\n`, "utf-8");
      const r = runStatusline(home, hostile);
      // The traversal must fail: warning fires, no spoofed rule count.
      expect(r.stdout).toContain("TeamAgent 未初始化本项目");
      expect(r.stdout).not.toContain("规则:99");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(sibling, { recursive: true, force: true });
      fs.rmSync(hostile, { recursive: true, force: true });
    }
  });
});
