#!/usr/bin/env node
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const pkgDir = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.join(pkgDir, "dist", "bin.js");
const seedPath = path.join(pkgDir, "dist", "seed", "rules.jsonl");

// B-097: capture diagnostics for any setup-time failure so bug reports have
// something to work with. Without this every `userHookStatus="failed"` /
// `warmupStatus="failed"` was a black box. File is rotated implicitly by
// being overwritten on each install (single source = current install).
const setupLogPath = path.join(os.homedir(), ".teamagent", "postinstall.log");
function recordSetupFailure(stage, err) {
  try {
    fs.mkdirSync(path.dirname(setupLogPath), { recursive: true });
    const ts = new Date().toISOString();
    const stderr = err && err.stderr ? String(err.stderr) : "";
    const stdout = err && err.stdout ? String(err.stdout) : "";
    const status = err && (err.status ?? err.code) !== undefined ? `exit=${err.status ?? err.code}` : "";
    const msg =
      `[${ts}] stage=${stage} ${status} message=${err && err.message ? String(err.message) : String(err)}\n` +
      (stderr ? `  stderr (last 500): ${stderr.slice(-500)}\n` : "") +
      (stdout ? `  stdout (last 500): ${stdout.slice(-500)}\n` : "");
    fs.appendFileSync(setupLogPath, msg, "utf-8");
  } catch {
    // best-effort; never block install
  }
}

function seedRuleCount() {
  try {
    if (!fs.existsSync(seedPath)) return 0;
    const text = fs.readFileSync(seedPath, "utf-8");
    return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}

// Run doctor to capture deeper issues but do NOT gate the welcome banner on it —
// knowledge.db + claude-md failures are expected before `teamagent init`.
let doctorFailed = false;
try {
  execSync(`node "${binPath}" doctor --postinstall`, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  });
} catch (err) {
  doctorFailed = true;
  // doctor failures during postinstall are usually expected (no knowledge.db
  // yet), so we only log when stderr is non-empty — that signals a deeper
  // problem worth surfacing.
  if (err && err.stderr && String(err.stderr).trim()) {
    recordSetupFailure("doctor", err);
  }
}

// Auto-register user-level SessionStart hook so any future project auto-inits
// on first Claude Code open. Non-fatal on failure (user can run manually).
let userHookStatus = "skipped";
try {
  execSync(`node "${binPath}" install-user-hook`, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  });
  userHookStatus = "registered";
} catch (err) {
  userHookStatus = "failed";
  recordSetupFailure("install-user-hook", err);
}

// Warmup vector model (skippable via TEAMAGENT_SKIP_WARMUP=1, e.g., during auto-update
// re-install where re-warming a cached model is wasteful)
let warmupStatus = "skipped";
if (process.env.TEAMAGENT_SKIP_WARMUP !== "1") {
  try {
    execSync(`node "${binPath}" warmup`, {
      stdio: "inherit",
      timeout: 300_000,
    });
    warmupStatus = "ok";
  } catch (err) {
    warmupStatus = "failed";
    // warmup uses stdio:"inherit", so err.stdout/err.stderr will be empty —
    // record what we have (signal/status/message).
    recordSetupFailure("warmup", err);
  }
}

// Initialize ~/.teamagent/update-state.json with the release sha if release-meta.json
// is present (i.e., installed from GitHub release branch).
try {
  const releaseMeta = path.join(pkgDir, "release-meta.json");
  if (fs.existsSync(releaseMeta)) {
    const meta = JSON.parse(fs.readFileSync(releaseMeta, "utf-8"));
    const home = path.join(os.homedir(), ".teamagent");
    fs.mkdirSync(home, { recursive: true });
    const statePath = path.join(home, "update-state.json");
    let state = {};
    if (fs.existsSync(statePath)) {
      try { state = JSON.parse(fs.readFileSync(statePath, "utf-8")); } catch { /* reset */ }
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
    state.last_installed_sha = meta.sha;
    state.last_installed_version = pkg.version;
    state.installed_at = Date.now();
    state.consecutive_install_failures = 0;
    state.last_install_error = null;
    if (!state.interval_hours) state.interval_hours = 1;
    if (!("last_check_ts" in state)) state.last_check_ts = 0;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  }
} catch (e) {
  process.stderr.write(`ℹ️  update-state init 失败: ${e.message}\n`);
}

const n = seedRuleCount();
const ruleMsg = n > 0 ? `${n} 条打包规则已就绪` : "无打包规则";
const userHookMsg =
  userHookStatus === "registered"
    ? "用户级 SessionStart hook 已注册 (新项目自动 init)"
    : userHookStatus === "failed"
      ? `用户级 hook 注册失败, 详情: ${setupLogPath}`
      : "用户级 hook 未注册";

process.stdout.write(
  [
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "✨ TeamAgent 安装成功",
    `   · 归因渲染: verbose 模式 (TEAMAGENT_VISIBILITY=smart 可调)`,
    `   · 知识种子: ${ruleMsg}`,
    `   · 自动初始化: ${userHookMsg}`,
    "   · 下一步  : 直接打开 Claude Code, 任何项目首次开会自动 init",
    "",
    "✅ 装好啦 🎉 立刻可以做的 3 件事:",
    "   1. teamagent skeleton-demo   — 跑最小学习闭环 demo，看系统怎么记住一条经验",
    "   2. teamagent stats           — 看自己 brain 学了多少经验",
    "   3. teamagent --help          — 看完整命令列表",
    "",
    "   📖 文档 & 反馈: https://github.com/libz-renlab-ai/TeamBrain",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
  ].join("\n"),
);

if (doctorFailed) {
  process.stderr.write(
    "ℹ️  TeamAgent doctor 有未通过项 (通常是 knowledge.db 未初始化，属正常)。\n" +
      "   运行 `teamagent doctor` 查看详情\n\n",
  );
}
