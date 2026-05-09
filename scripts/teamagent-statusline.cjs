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
const PROJECT_DB = path.resolve(process.cwd(), ".teamagent/knowledge.db");
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
  process.stdout.write(
    `TeamAgent | 规则:${formatMetric(count)} | 帮过:${formatMetric(helpedToday)}今/${formatMetric(helpedWeek)}周 | 拦过:${formatMetric(riskToday)}今 | ${hint}`,
  );
}

main();
