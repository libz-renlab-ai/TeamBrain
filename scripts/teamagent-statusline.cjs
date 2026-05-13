#!/usr/bin/env node
"use strict";

// Suppress Node 22's `(node:NNN) ExperimentalWarning: SQLite is an experimental
// feature ...` line. CC concatenates statusline stdout+stderr onto the same
// status row, so the warning corrupts the rendered line and tricks new users
// into thinking the install is broken (issue #168). Filter ONLY
// ExperimentalWarning — preserve DeprecationWarning, MaxListenersExceededWarning,
// UnhandledPromiseRejectionWarning, etc. so we still see real production issues.
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w?.name === "ExperimentalWarning") return;
  process.stderr.write(`(node:${process.pid}) ${w?.name ?? "Warning"}: ${w?.message ?? w}\n`);
});

const path = require("path");
const os = require("os");

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  process.stdout.write("TeamAgent正在运行 | (sqlite不可用)");
  process.exit(0);
}

// CC 运行 statusLine 时 cwd = 当前项目根，不是 script 所在目录。
// 旧实现用 __dirname 凑巧在 dev repo 能 resolve，但 tarball 装到
// node_modules/teamagent/dist/ 之后 ../.teamagent/knowledge.db 指向
// 包内部（无 db），就会错报 0 条。
const fs = require("node:fs");

// `teamagent init` is repo-scoped: it lands `.teamagent/knowledge.db` in the
// main checkout, not in every git worktree spawned from it. A worktree's
// `.git` entry is a FILE pointing to `<main>/.git/worktrees/<name>`; without
// walking that pointer the statusline saw no project DB under the worktree
// cwd and printed "TeamAgent 未初始化本项目" every time the user opened a
// worktree session. resolveProjectDbPath probes cwd first (preserves
// non-worktree behaviour and lets explicit per-worktree init still win),
// then follows the .git pointer to the main checkout if cwd has no DB.
const PROJECT_DB_RELPATH = path.join(".teamagent", "knowledge.db");

function findMainCheckoutFromWorktree(cwd) {
  try {
    const gitEntry = path.join(cwd, ".git");
    const st = fs.statSync(gitEntry);
    if (!st.isFile()) return null;
    const content = fs.readFileSync(gitEntry, "utf-8");
    // /m flag so we still match when git (or third-party tools) emit a
    // multi-line `.git` file like `gitdir: <path>\ncommondir: <path>`.
    const m = content.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!m) return null;
    const gitdir = m[1];
    // Real `git worktree add` always writes absolute paths. Rejecting
    // relative entries closes a path-traversal vector where a hostile
    // `.git` file in an attacker-writable cwd could redirect us to read
    // an arbitrary `.teamagent/knowledge.db`.
    if (!path.isAbsolute(gitdir)) return null;
    // Only follow `<main>/.git/worktrees/<name>` shape — submodules use
    // `<super>/.git/modules/<name>` and must be ignored.
    const segs = gitdir.split(/[\\/]/);
    const wtIdx = segs.lastIndexOf("worktrees");
    if (wtIdx < 1 || segs[wtIdx - 1] !== ".git") return null;
    return path.resolve(gitdir, "..", "..", "..");
  } catch {
    return null;
  }
}

function resolveProjectDbPath(cwd) {
  const direct = path.resolve(cwd, PROJECT_DB_RELPATH);
  try {
    if (fs.existsSync(direct)) return direct;
  } catch { /* ignore */ }
  const mainRoot = findMainCheckoutFromWorktree(cwd);
  if (mainRoot) {
    const fromMain = path.join(mainRoot, PROJECT_DB_RELPATH);
    try {
      if (fs.existsSync(fromMain)) return fromMain;
    } catch { /* ignore */ }
  }
  return direct;
}

// issue #306 — surface the project name as a presence field. Worktree-aware:
// when cwd is a `git worktree` checkout the basename is the worktree name
// (e.g. `issue-306`), not the repo name (`TeamBrain`). We reuse the same
// main-checkout walk-up that resolveProjectDbPath already does so the rendered
// project name stays stable across worktrees of the same repo. Per grill verdict
// §12 (B), the statusline is a local presence/health view; a `项目:<name>` field
// directly answers the "which repo am I in" question without overstepping into
// #326's full landing→init→statusline RESCOPE territory.
function getProjectName(cwd) {
  try {
    const mainRoot = findMainCheckoutFromWorktree(cwd);
    const root = mainRoot || cwd;
    if (typeof root !== "string" || root.length === 0) return "unknown";
    const base = path.basename(root);
    if (!base || base === "." || base === "/" || base === "\\") return "unknown";
    // Statusline width is precious — cap long names. Drive-letter-only or
    // pathological inputs fall through `path.basename` to the input itself,
    // which the cap also catches.
    return base.length > 32 ? base.slice(0, 29) + "..." : base;
  } catch {
    return "unknown";
  }
}

const PROJECT_DB = resolveProjectDbPath(process.cwd());
const GLOBAL_DB = path.join(os.homedir(), ".teamagent", "global.db");
const EVENTS_DB = path.join(os.homedir(), ".teamagent", "events.db");

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
];

function isProjectDir(cwd) {
  for (const m of PROJECT_MARKERS) {
    try {
      if (fs.existsSync(path.join(cwd, m))) return true;
    } catch { /* ignore */ }
  }
  return false;
}

function hasProjectDb() {
  try {
    return fs.existsSync(PROJECT_DB);
  } catch {
    return false;
  }
}

function tryOpenDb(dbPath) {
  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
}

function getEntryCount(db) {
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM knowledge WHERE status = 'active' AND (type IS NULL OR type != 'wiki')",
      )
      .get();
    return row ? row.n : null;
  } catch {
    return null;
  }
}

function getWikiCount(db) {
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM knowledge WHERE status = 'active' AND type = 'wiki'")
      .get();
    return row ? row.n : null;
  } catch {
    return null;
  }
}

function getLastWikiPullDate(db) {
  try {
    const row = db
      .prepare(
        "SELECT MAX(created_at) AS d FROM knowledge WHERE status = 'active' AND type = 'wiki'",
      )
      .get();
    if (!row || !row.d) return null;
    const d = new Date(row.d);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function getLastLearnedDate(db) {
  try {
    const row = db.prepare("SELECT MAX(created_at) AS d FROM knowledge WHERE status = 'active'").get();
    if (!row || !row.d) return null;
    const d = new Date(row.d);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

// issue #168: HELPED 与 RISK 事件来源必须不重叠，否则 helped+risk 加不平、
// 新用户算账算不通。HELPED = 工具的"正向贡献"（静默命中、AI 听了提醒、KB 增长）；
// RISK = 工具拦下/标记的风险事件（warned / blocked / bypass / bad pattern）。
// 同一条事件只能落在一组里。
//
// 注意：不收 `hook-post.result` 与 `error.candidate.rejected` —— 前者是
// post-tool-use 元事件（成功失败一并 emit），把失败次数算成"帮过"会把指标
// 反向膨胀；后者是用户对 extractor 错误候选的"否决"（rule was wrong），
// 算工具贡献语义不通。两者都是 metadata，不进 HELPED；为保证正交也不进 RISK。
const HELPED_EVENT_KINDS = [
  "hook-pre.passive_matched", // 静默命中（passive 规则）—— PreToolUse 实际发出的"matched"事件
  "ai.narrative.injected",
  "ai.narrative.complied",
  "ai.override.complied",
  "pitfall.added",
  "compiler.updated",
  "extractor.extracted",
  "calibrator.adjusted",
  "init.completed",
  "scenario.run",
  "error.candidate.approved",
];

const RISK_EVENT_KINDS = [
  "hook-pre.warned",
  "hook-pre.blocked",
  "ai.override.ignored",
  "ai.override.blocked_circumvented",
  "ai.output.bad_pattern",
  "ai.narrative.recurred",
  "ai.user_input.flagged",
  "error.candidate.added",
];

// /review iter-2 finding #2: keep hints in sync with HELPED/RISK categorization.
// `hook-post.result` and `error.candidate.rejected` are intentionally NOT in
// either bucket (they are metadata/feedback, not help or risk signals). If they
// were ever the "latest event", the old map's friendly hint would print while
// 帮过/拦过 stayed 0 — visually contradicting the de-overlap fix. Drop them
// here so getLatestContributionHint falls through to the idle/护航 path for
// these kinds.
const CONTRIBUTION_HINTS = {
  "hook-pre.passive_matched": "刚静默命中规则",
  "hook-pre.warned": "刚提醒风险",
  "hook-pre.blocked": "刚拦截风险",
  "ai.override.ignored": "刚发现规则绕过",
  "ai.override.complied": "刚确认规则生效",
  "ai.override.blocked_circumvented": "刚发现拦截绕过",
  "pitfall.added": "刚记住踩坑",
  "compiler.updated": "刚更新规则注入",
  "extractor.extracted": "刚提炼经验",
  "calibrator.adjusted": "刚校准规则",
  "init.completed": "刚完成初始化",
  "scenario.run": "刚跑完场景",
  "error.candidate.added": "刚捕获失败信号",
  "error.candidate.approved": "刚沉淀新规则",
  "ai.output.bad_pattern": "刚发现输出问题",
  "ai.narrative.injected": "刚注入提醒",
  "ai.narrative.recurred": "刚发现重复踩坑",
  "ai.narrative.complied": "刚确认提醒有效",
  "ai.user_input.flagged": "刚提醒输入风险",
};

function sinceIso(daysAgo) {
  const d = new Date();
  if (daysAgo === 0) {
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - daysAgo);
  }
  return d.toISOString();
}

// /review iter-2 finding #1: clamp count window upper bound to "now" so a
// clock-skewed laptop or events synced from another machine with timestamps
// in the future do NOT inflate today/week counters until the future date.
function countEventsSince(db, kinds, since) {
  if (!db || kinds.length === 0) return null;
  try {
    const now = new Date().toISOString();
    const placeholders = kinds.map(() => "?").join(",");
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM events WHERE kind IN (${placeholders}) AND timestamp >= ? AND timestamp <= ?`,
      )
      .get(...kinds, since, now);
    return row ? row.n : null;
  } catch {
    return null;
  }
}

function getLatestContributionHint(db) {
  if (!db) return null;
  try {
    const row = db
      .prepare("SELECT kind FROM events ORDER BY timestamp DESC LIMIT 1")
      .get();
    return row ? CONTRIBUTION_HINTS[row.kind] ?? null : null;
  } catch {
    return null;
  }
}

function formatMetric(value) {
  return typeof value === "number" ? String(value) : "-";
}

// issue #331: Claude Code 把 statusline 渲染的 stdin 一次性写完即关闭，shape:
//   { hook_event_name:"Status", session_id, transcript_path, cwd,
//     model:{ id, display_name }, workspace:{ current_dir, project_dir },
//     cost:{ total_cost_usd, ... }, exceeds_200k_tokens, ... }
// 读 stdin 同步、有上限、空 stdin → null，容错最大化（任何一项失败都让整行
// 回落到老 4 字段，不挂状态栏）。
function readStdinJsonSync(maxBytes) {
  try {
    // 守卫：如果 stdin 是 TTY（手工 `node scripts/teamagent-statusline.cjs`
    // 直接跑、没有 stdin redirect），`readFileSync(0)` 会 block 等 Ctrl-D。
    // CC spawn 时 stdin 是 pipe，isTTY 为 undefined / false → 进 read 路径。
    if (process.stdin.isTTY) return null;
    // fd 0 同步读到 EOF。CC 写完会 close，所以 readFileSync 不会卡。
    // 老调用（test、手跑）没人喂 stdin → ENOENT/EAGAIN → 返回 null。
    const raw = fs.readFileSync(0, { encoding: "utf-8" });
    if (!raw || raw.length === 0) return null;
    if (typeof maxBytes === "number" && raw.length > maxBytes) {
      // 防御性：CC 不太可能塞超大 JSON 给 statusline，但 cap 一下避免 OOM。
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTokens(n) {
  if (typeof n !== "number" || !isFinite(n) || n < 0) return null;
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${Math.round(n / 100) / 10}K`.replace(/\.0K$/, "K");
  return `${Math.round(n / 100_000) / 10}M`.replace(/\.0M$/, "M");
}

// 读 transcript JSONL 文件末尾若干 KB，反向找最近一条 assistant `usage`。
// 不读全文件——transcript 在长 session 里可能几十 MB。
function readLatestUsage(transcriptPath) {
  try {
    if (typeof transcriptPath !== "string" || transcriptPath.length === 0) return null;
    const stat = fs.statSync(transcriptPath);
    const tailBytes = Math.min(stat.size, 256 * 1024);
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const buf = Buffer.alloc(tailBytes);
      fs.readSync(fd, buf, 0, tailBytes, stat.size - tailBytes);
      const text = buf.toString("utf-8");
      const lines = text.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line || line[0] !== "{") continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        const usage = obj?.message?.usage;
        if (!usage) continue;
        const input = Number(usage.input_tokens) || 0;
        const creation = Number(usage.cache_creation_input_tokens) || 0;
        const read = Number(usage.cache_read_input_tokens) || 0;
        const output = Number(usage.output_tokens) || 0;
        return {
          ctx: input + creation + read,
          output,
          turn_total: input + creation + read + output,
        };
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

// 同一 transcript 目录下 mtime > now - 7d 的 JSONL，按行扫 timestamp >= since
// 的 assistant usage 累加 input+creation+read+output。bounded：每个文件只读
// 末尾 256 KB；目录文件数 cap 20，单次预算 < 200 ms。
function aggregateWindowedTokens(transcriptPath, since5hMs, since7dMs) {
  const result = { h5: null, d7: null };
  try {
    if (typeof transcriptPath !== "string" || transcriptPath.length === 0) return result;
    const dir = path.dirname(transcriptPath);
    const now = Date.now();
    const cutoff7d = now - since7dMs;
    const cutoff5h = now - since5hMs;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return result; }
    const files = entries
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => path.join(dir, n))
      .map((p) => {
        try { return { p, m: fs.statSync(p).mtimeMs, size: fs.statSync(p).size }; }
        catch { return null; }
      })
      .filter((x) => x && x.m >= cutoff7d)
      .sort((a, b) => b.m - a.m)
      .slice(0, 20);

    let h5 = 0;
    let d7 = 0;
    let any = false;
    for (const f of files) {
      let buf;
      try {
        const tail = Math.min(f.size, 256 * 1024);
        const fd = fs.openSync(f.p, "r");
        try {
          buf = Buffer.alloc(tail);
          fs.readSync(fd, buf, 0, tail, f.size - tail);
        } finally {
          fs.closeSync(fd);
        }
      } catch { continue; }
      const lines = buf.toString("utf-8").split("\n");
      for (const line of lines) {
        if (!line || line[0] !== "{") continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        const usage = obj?.message?.usage;
        if (!usage) continue;
        const ts = obj?.timestamp ? Date.parse(obj.timestamp) : NaN;
        if (!isFinite(ts)) continue;
        const tokens =
          (Number(usage.input_tokens) || 0) +
          (Number(usage.cache_creation_input_tokens) || 0) +
          (Number(usage.cache_read_input_tokens) || 0) +
          (Number(usage.output_tokens) || 0);
        if (ts >= cutoff7d) { d7 += tokens; any = true; }
        if (ts >= cutoff5h) { h5 += tokens; }
      }
    }
    if (any) { result.h5 = h5; result.d7 = d7; }
    return result;
  } catch {
    return result;
  }
}

// 把 CC stdin 中 6 项渲染成 ["模型:X", "上下文:YK", ...] 数组，缺的字段跳过。
function buildCcFields(cc) {
  const out = [];
  if (!cc || typeof cc !== "object") return out;
  try {
    const model = cc?.model?.display_name ?? cc?.model?.id;
    if (typeof model === "string" && model.trim().length > 0) {
      out.push(`模型:${model.trim()}`);
    }
  } catch { /* skip */ }
  try {
    const usage = readLatestUsage(cc?.transcript_path);
    if (usage && usage.ctx > 0) {
      const t = formatTokens(usage.ctx);
      if (t) out.push(`上下文:${t}`);
    }
  } catch { /* skip */ }
  try {
    const cost = cc?.cost?.total_cost_usd;
    if (typeof cost === "number" && cost > 0) {
      out.push(`用量:$${cost.toFixed(2)}`);
    }
  } catch { /* skip */ }
  try {
    const FIVE_H = 5 * 60 * 60 * 1000;
    const SEVEN_D = 7 * 24 * 60 * 60 * 1000;
    const win = aggregateWindowedTokens(cc?.transcript_path, FIVE_H, SEVEN_D);
    const h5 = formatTokens(win.h5);
    const d7 = formatTokens(win.d7);
    if (h5) out.push(`5h:${h5}`);
    if (d7) out.push(`7d:${d7}`);
  } catch { /* skip */ }
  try {
    if (cc?.exceeds_200k_tokens === true) out.push("会话:⚠超长");
    else if (cc?.exceeds_200k_tokens === false) out.push("会话:OK");
  } catch { /* skip */ }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// issue #350 — push a CC runtime status snapshot to the digital-twin server.
//
// The statusline already has every field the snapshot needs (model / cost /
// exceeds_200k_tokens from CC stdin; context / 5h / 7d from the transcript) and
// runs frequently, so it's the natural — and lowest-blast-radius — push site.
// Throttled to once per 30s via ~/.teamagent/cc-status/.last-push, and the POST
// itself runs in a detached child so a hung server can never slow the status
// row. Everything here is best-effort: any failure is swallowed so the
// statusline render is never affected. Canonical spec for the body shape:
// packages/digital-twin/src/cc-status/{types,compute}.ts (this is the
// standalone .cjs parallel — the script can't import a workspace package).
// ───────────────────────────────────────────────────────────────────────────

const CC_STATUS_PUSH_INTERVAL_MS = 30 * 1000;
const CC_STATUS_EXTRAS_MAX_FULL_BYTES = 4 * 1024 * 1024;
const CC_STATUS_EDIT_TOOLS = new Set([
  "Write", "Edit", "MultiEdit", "NotebookEdit",
  "str_replace_editor", "str_replace_based_edit_tool",
]);
// Inline JS executed by a detached `node -e` child: read {endpoint,token,body}
// as JSON from stdin (passing it via stdin rather than a temp-file argv avoids
// leaking a file if the child is SIGKILL'd, and dodges Windows argv-quoting
// fragility). 10s fetch timeout so the child can't linger. No top-level `return`
// — `node -e` evaluates in a non-function scope.
const CC_STATUS_PUSH_CHILD = [
  "let b='';process.stdin.on('data',c=>{b+=c});",
  "process.stdin.on('end',()=>{let p=null;try{p=JSON.parse(b)}catch(e){p=null}",
  "if(!p){return}",
  "try{var url=String(p.endpoint||'').replace(/[/]+$/,'')+'/v1/cc-status';",
  "fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+String(p.token||'')},body:JSON.stringify(p.body),signal:AbortSignal.timeout(10000)}).catch(()=>{});",
  "}catch(e){}});",
].join("");

function ccNumOr(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function ccSafeUserId(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "unknown";
  let c = raw.replace(/[^a-zA-Z0-9._@+-]/g, "_").slice(0, 80);
  c = c.replace(/\.{2,}/g, "_").replace(/^[._-]+/, "").replace(/[._-]+$/, "");
  return c.length > 0 ? c : "unknown";
}

function readDigitalTwinConfig() {
  try {
    const f = path.join(os.homedir(), ".teamagent", "digital-twin.json");
    const c = JSON.parse(fs.readFileSync(f, "utf-8"));
    if (!c || typeof c !== "object" || !c.uploader || !c.identity) return null;
    return c;
  } catch { return null; }
}

function readQuotaCache() {
  try {
    const f = path.join(os.homedir(), ".teamagent", "digital-twin", "quota-cache.json");
    const q = JSON.parse(fs.readFileSync(f, "utf-8"));
    return q && typeof q === "object" ? q : null;
  } catch { return null; }
}

// Worktree-aware git branch read: <cwd>/.git is a dir for a normal checkout, a
// file (`gitdir: <path>`) for a worktree. We want THIS worktree's branch, so we
// read whichever HEAD <cwd>/.git points at — not the main checkout's.
function readGitBranch(cwd) {
  try {
    if (typeof cwd !== "string" || cwd.length === 0) return undefined;
    const gitEntry = path.join(cwd, ".git");
    let st;
    try { st = fs.statSync(gitEntry); } catch { return undefined; }
    let headPath;
    if (st.isDirectory()) {
      headPath = path.join(gitEntry, "HEAD");
    } else if (st.isFile()) {
      const m = fs.readFileSync(gitEntry, "utf-8").match(/^gitdir:\s*(.+?)\s*$/m);
      if (!m) return undefined;
      let gitdir = m[1];
      if (!path.isAbsolute(gitdir)) gitdir = path.resolve(cwd, gitdir);
      headPath = path.join(gitdir, "HEAD");
    } else { return undefined; }
    const head = fs.readFileSync(headPath, "utf-8").trim();
    const rm = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (rm) return rm[1].trim();
    if (/^[0-9a-f]{7,40}$/i.test(head)) return head.slice(0, 12);
    return undefined;
  } catch { return undefined; }
}

// One transcript scan for turn_count / tool_calls_* / files_touched /
// session_started_at. Reads the whole file when ≤ 4 MB (accurate); for a huge
// transcript reads only the head 64 KB (gives session_started_at, omits the
// count aggregates — they'd be undercounts so we don't report them).
function aggregateCcExtras(transcriptPath) {
  const out = {};
  try {
    if (typeof transcriptPath !== "string" || transcriptPath.length === 0) return out;
    const st = fs.statSync(transcriptPath);
    const readFull = st.size <= CC_STATUS_EXTRAS_MAX_FULL_BYTES;
    let text;
    if (readFull) {
      text = fs.readFileSync(transcriptPath, "utf-8");
    } else {
      const fd = fs.openSync(transcriptPath, "r");
      try {
        const buf = Buffer.alloc(Math.min(st.size, 64 * 1024));
        fs.readSync(fd, buf, 0, buf.length, 0);
        text = buf.toString("utf-8");
      } finally { fs.closeSync(fd); }
    }
    let turns = 0, toolTotal = 0, toolFailed = 0;
    const files = new Set();
    let startedAt;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t[0] !== "{") continue;
      let obj;
      try { obj = JSON.parse(t); } catch { continue; }
      if (!startedAt && typeof obj.timestamp === "string" && !Number.isNaN(Date.parse(obj.timestamp))) {
        startedAt = obj.timestamp;
      }
      const msg = obj.message;
      const isAssistant = obj.type === "assistant" || (msg && msg.role === "assistant");
      if (isAssistant) {
        turns += 1;
        const content = msg && msg.content;
        if (Array.isArray(content)) {
          for (const b of content) {
            if (b && b.type === "tool_use") {
              toolTotal += 1;
              if (CC_STATUS_EDIT_TOOLS.has(String(b.name))) {
                const inp = b.input;
                // keep this key list in sync with cc-status/compute.ts fileFromToolInput
                const f = inp && (inp.file_path || inp.path || inp.notebook_path || inp.filePath);
                if (typeof f === "string" && f) files.add(f);
              }
            }
          }
        }
      }
      const isUser = obj.type === "user" || (msg && msg.role === "user");
      if (isUser && msg && Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && b.type === "tool_result" && b.is_error === true) toolFailed += 1;
        }
      }
    }
    if (readFull) {
      out.turn_count = turns;
      out.tool_calls_total = toolTotal;
      out.tool_calls_failed = toolFailed;
      out.files_touched = files.size;
    }
    if (startedAt) out.session_started_at = startedAt;
  } catch { /* best-effort */ }
  return out;
}

function buildCcStatusBody(cc, cfg) {
  try {
    if (!cc || typeof cc !== "object" || !cfg) return null;
    const sid = typeof cc.session_id === "string" ? cc.session_id : "";
    if (!/^[A-Za-z0-9._-]+$/.test(sid)) return null; // server requires a filename-safe id
    const userId = ccSafeUserId(cfg.identity && cfg.identity.user_id);
    const cwd =
      (typeof cc.cwd === "string" && cc.cwd) ||
      (cc.workspace && typeof cc.workspace.current_dir === "string" && cc.workspace.current_dir) ||
      process.cwd();
    const transcriptPath = typeof cc.transcript_path === "string" ? cc.transcript_path : "";

    const usage = readLatestUsage(transcriptPath);
    const contextTokens = usage && typeof usage.ctx === "number" ? usage.ctx : undefined;
    const FIVE_H = 5 * 60 * 60 * 1000;
    const SEVEN_D = 7 * 24 * 60 * 60 * 1000;
    const win = aggregateWindowedTokens(transcriptPath, FIVE_H, SEVEN_D);
    const extras = aggregateCcExtras(transcriptPath);
    const q = readQuotaCache();

    const body = {
      schema_version: 1,
      session_id: sid,
      user_id: userId,
      ts: new Date().toISOString(),
      event: typeof cc.hook_event_name === "string" && cc.hook_event_name ? cc.hook_event_name : "Status",
    };
    if (cfg.identity && typeof cfg.identity.machine_id === "string" && cfg.identity.machine_id) {
      body.machine_id = cfg.identity.machine_id;
    }
    if (cwd) body.cwd = cwd;
    const gb = readGitBranch(cwd);
    if (gb) body.git_branch = gb;
    const model = cc.model && (cc.model.display_name || cc.model.id);
    if (typeof model === "string" && model.trim()) body.model = model.trim();
    if (typeof contextTokens === "number") {
      body.context_tokens = contextTokens;
      body.context_pct = Math.round((contextTokens / 200000) * 1000) / 1000;
    }
    if (cc.exceeds_200k_tokens === true) body.session_health = "OVER_200K";
    else if (cc.exceeds_200k_tokens === false) body.session_health = "OK";
    else if (typeof contextTokens === "number") body.session_health = contextTokens > 200000 ? "OVER_200K" : "OK";
    const cost = cc.cost && cc.cost.total_cost_usd;
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) body.cost_usd = cost;
    if (typeof win.h5 === "number") body.tokens_5h = win.h5;
    if (typeof win.d7 === "number") body.tokens_7d = win.d7;
    if (q) {
      if (typeof q.subscription_tier === "string" && q.subscription_tier) body.subscription_tier = q.subscription_tier;
      const n5u = ccNumOr(q.five_hour_utilization); if (n5u !== undefined) body.five_hour_utilization = n5u;
      const n7u = ccNumOr(q.seven_day_utilization); if (n7u !== undefined) body.seven_day_utilization = n7u;
      const n5r = ccNumOr(q.five_hour_reset_at); if (n5r !== undefined) body.five_hour_reset_at = n5r;
      const n7r = ccNumOr(q.seven_day_reset_at); if (n7r !== undefined) body.seven_day_reset_at = n7r;
      if (typeof q.stale === "boolean") body.quota_stale = q.stale;
    }
    if (typeof extras.turn_count === "number") body.turn_count = extras.turn_count;
    if (typeof extras.tool_calls_total === "number") body.tool_calls_total = extras.tool_calls_total;
    if (typeof extras.tool_calls_failed === "number") body.tool_calls_failed = extras.tool_calls_failed;
    if (typeof extras.files_touched === "number") body.files_touched = extras.files_touched;
    if (typeof extras.session_started_at === "string" && extras.session_started_at) {
      body.session_started_at = extras.session_started_at;
    }
    return body;
  } catch { return null; }
}

// Returns true (and stamps the throttle file) when ≥ minIntervalMs has elapsed
// since the last push. The stamp is written BEFORE the push to *reduce* the
// chance two near-simultaneous statusline renders both spawn — it's a plain
// stat→write, not an atomic claim, so a tight race can still double-push. That's
// harmless: the server stores last-write-wins and a redundant snapshot is fine.
function claimCcStatusPushSlot(lastPushPath, minIntervalMs) {
  try {
    let lastMs = null;
    try { lastMs = fs.statSync(lastPushPath).mtimeMs; } catch { lastMs = null; }
    if (typeof lastMs === "number" && Number.isFinite(lastMs) && Date.now() - lastMs < minIntervalMs) {
      return false;
    }
    try {
      fs.mkdirSync(path.dirname(lastPushPath), { recursive: true });
      fs.writeFileSync(lastPushPath, String(Date.now()), "utf-8");
    } catch { /* best-effort; a failed stamp just means we may push again sooner */ }
    return true;
  } catch { return false; }
}

function pushCcStatusDetached(endpoint, token, body) {
  try {
    const { spawn } = require("node:child_process");
    // stdin pipe carries the payload (no temp file → nothing to leak if the
    // child is killed; also sidesteps Windows argv-quoting of JSON strings).
    const child = spawn(process.execPath, ["-e", CC_STATUS_PUSH_CHILD], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      windowsHide: true,
      cwd: os.tmpdir(),
    });
    child.on("error", () => { /* server unreachable / node missing — best-effort */ });
    try {
      if (child.stdin) {
        child.stdin.on("error", () => { /* EPIPE if the child died — ignore */ });
        child.stdin.end(JSON.stringify({ endpoint, token, body }));
      }
    } catch { /* ignore */ }
    child.unref();
  } catch { /* never block the statusline */ }
}

function maybePushCcStatus(cc) {
  try {
    if (!cc || typeof cc !== "object") return; // only on a real CC-driven render
    const cfg = readDigitalTwinConfig();
    if (
      !cfg || !cfg.uploader ||
      cfg.uploader.enabled !== true ||
      typeof cfg.uploader.token !== "string" || cfg.uploader.token.length === 0 ||
      typeof cfg.uploader.endpoint !== "string" || cfg.uploader.endpoint.length === 0
    ) {
      return;
    }
    const lastPushPath = path.join(os.homedir(), ".teamagent", "cc-status", ".last-push");
    if (!claimCcStatusPushSlot(lastPushPath, CC_STATUS_PUSH_INTERVAL_MS)) return;
    const body = buildCcStatusBody(cc, cfg);
    if (!body) return;
    pushCcStatusDetached(cfg.uploader.endpoint, cfg.uploader.token, body);
  } catch { /* never affect the statusline */ }
}

function main() {
  // 未 init 且像项目 → 显眼提醒 (此路径在 --dangerously-skip-permissions 下也触发,
  // 因为 statusline 不经过 hook 系统)
  if (!hasProjectDb() && isProjectDir(process.cwd())) {
    process.stdout.write("⚠️  TeamAgent 未初始化本项目 | 运行 `teamagent init` 启用");
    return;
  }

  const projectDb = tryOpenDb(PROJECT_DB);
  const globalDb  = tryOpenDb(GLOBAL_DB);
  const eventsDb = tryOpenDb(EVENTS_DB);

  if (!projectDb && !globalDb && !eventsDb) {
    process.stdout.write("TeamAgent 未安装 | 运行 `npm install -g teamagent-X.Y.Z.tgz`");
    return;
  }

  // 两库分别取活跃数 + 最近更新日，聚合。
  let count = 0;
  let wikiCount = 0;
  let lastDate = null;
  let lastWikiDate = null;
  for (const db of [projectDb, globalDb]) {
    if (!db) continue;
    try {
      const c = getEntryCount(db);
      if (typeof c === "number") count += c;
      const w = getWikiCount(db);
      if (typeof w === "number") wikiCount += w;
      const d = getLastLearnedDate(db);
      if (d && (!lastDate || d > lastDate)) lastDate = d;
      const wd = getLastWikiPullDate(db);
      if (wd && (!lastWikiDate || wd > lastWikiDate)) lastWikiDate = wd;
    } finally {
      db.close();
    }
  }

  const helpedToday = countEventsSince(eventsDb, HELPED_EVENT_KINDS, sinceIso(0));
  const helpedWeek = countEventsSince(eventsDb, HELPED_EVENT_KINDS, sinceIso(7));
  const riskToday = countEventsSince(eventsDb, RISK_EVENT_KINDS, sinceIso(0));
  const latestHint = getLatestContributionHint(eventsDb);

  if (eventsDb) eventsDb.close();

  // issue #168 B-lite: 当 helped + risk 全为 0 / null 且 events 库里也找不到
  // 任何最近事件时，hint 给出"待命引导"文案而不是干瘪的"护航中"。这避免了
  // 全新装、状态栏永远显示 0/0 + 护航中的死气沉沉。命中过任意一条事件后，
  // getLatestContributionHint 会查到最新 row → 自动回到具体文案。
  const allCountsZeroOrNull =
    (helpedToday === null || helpedToday === 0) &&
    (helpedWeek === null || helpedWeek === 0) &&
    (riskToday === null || riskToday === 0);
  const idleHint = allCountsZeroOrNull && !latestHint
    ? "待命中（让我学几条规则吧）"
    : "护航中";
  const hint = latestHint ?? idleHint;

  // issue #168: 字段加中文标签 + 时间窗后缀（今/周），分隔符 " | "。
  // 老格式 `helped:T/W · risk:T` 让新用户三秒内连环三问；新格式让数字自带语义。
  //
  // issue #331: CC stdin 有内容时，把 模型 / 上下文 / 用量 / 5h / 7d / 会话健康
  // 6 项拼到老 4 字段后面、hint 之前。空 stdin（test/legacy 调用）→ ccFields = []
  // → 老格式 byte-identical。
  const cc = readStdinJsonSync(64 * 1024);
  const ccFields = buildCcFields(cc);
  const ccSegment = ccFields.length > 0 ? ` | ${ccFields.join(" | ")}` : "";

  // issue #306 — project name surfaces between the existing 4-field prefix
  // (TeamAgent | 规则 | 帮过 | 拦过) and any CC stdin fields, so existing tests
  // that pin the exact 4-field prefix substring keep passing while new
  // presence info (which repo this session is in) becomes visible at a glance.
  const projectName = getProjectName(process.cwd());

  process.stdout.write(
    `TeamAgent | 规则:${formatMetric(count)} | 帮过:${formatMetric(helpedToday)}今/${formatMetric(helpedWeek)}周 | 拦过:${formatMetric(riskToday)}今 | 项目:${projectName}${ccSegment} | ${hint}`,
  );

  // issue #350 — after the status row is rendered, best-effort push a CC
  // runtime status snapshot to the digital-twin server (throttled, detached).
  // Runs last so it can never delay or corrupt the rendered line.
  maybePushCcStatus(cc);
}

main();
