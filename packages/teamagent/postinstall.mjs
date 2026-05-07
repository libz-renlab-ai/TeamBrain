#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// --- duck-mode (issue #116) — inline because postinstall.mjs ships
// standalone without bundled @teamagent/core. Synced subset of the
// authoritative table at packages/core/src/duck-mode/translations.ts.
const POSTINSTALL_DUCK = [
  { term: "归因渲染", aliases: ["attribution"], duck: "鸭鸭说: 归因渲染就是把'系统帮你做了什么'拼成一段人话给你看呷~" },
  { term: "知识种子", aliases: ["seed"], duck: "呷呷~ 知识种子是预先打包给鸭鸭的一袋通用规则，鸭鸭装完就能跑 (>ω<)" },
  { term: "hook", aliases: ["Hook", "hooks", "Hooks", "SessionStart"], duck: "呷呷~ Hook 是 Claude 做事前/后的小钩子，鸭鸭可以悄悄在中间加一道关卡 (>ω<)" },
  { term: "doctor", duck: "鸭鸭说: doctor 就是体检命令，跑一遍看哪里没装好呷~" },
  { term: "knowledge.db", duck: "呷呷~ knowledge.db 是鸭鸭存所有规则的小本本（SQLite 文件）(>ω<)" },
  { term: "verbose", duck: "鸭鸭说: verbose 模式 = 鸭鸭话比较多，会把过程说更细呷~" },
];
const DUCK_KEY = "TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK";
const isDuckModeOn = () => process["env"][DUCK_KEY] === "1";
function duckify(text) {
  if (!isDuckModeOn()) return text;
  return text.split("\n").flatMap((line) => {
    const lower = line.toLowerCase();
    const seen = new Set();
    const ducks = [];
    for (const t of POSTINSTALL_DUCK) {
      if (seen.has(t.term)) continue;
      const cands = [t.term, ...(t.aliases ?? [])];
      if (cands.some((c) => lower.includes(c.toLowerCase()))) {
        ducks.push(`   ${t.duck}`);
        seen.add(t.term);
      }
    }
    return [line, ...ducks];
  }).join("\n");
}


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

/**
 * Spawn a child process, collect stdout/stderr (when piped), with timeout.
 * Resolves with {stdout, stderr} on exit code 0; rejects with err {status, signal, stdout, stderr}.
 *
 * `inheritStdio=true` runs with stdio:"inherit" so the child's progress bar
 * appears live in the terminal (used by warmup). When inheriting, stdout/stderr
 * are not captured by the parent.
 */
function spawnWithTimeout(cmd, args, { inheritStdio = false } = {}, timeoutMs) {
  return new Promise((resolve, reject) => {
    const stdio = inheritStdio ? "inherit" : ["ignore", "pipe", "pipe"];
    const child = spawn(cmd, args, { stdio });
    let stdout = "";
    let stderr = "";
    if (!inheritStdio) {
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch { /* already dead */ }
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(timedOut ? `timeout after ${timeoutMs}ms` : `exit code ${code}`);
        err.status = code;
        err.signal = signal;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

async function main() {
  // === Stage 1: doctor + install-user-hook in parallel ===
  // 二者彼此不依赖；以前串行白白多花 ~5s（doctor 15s timeout + hook 10s timeout
  // 顺序跑）。并行后只算慢的那一个的 wall-clock。stdio:"pipe" 静默捕捉，避免
  // 跟父进程 npm 的进度条互相干扰；失败时 stderr 落到 ~/.teamagent/postinstall.log。
  process.stderr.write(duckify("[1/2] 自检 + 注册用户级 hook (并行)...\n"));
  const t1 = Date.now();
  const [doctorR, hookR] = await Promise.allSettled([
    spawnWithTimeout(process.execPath, [binPath, "doctor", "--postinstall"], {}, 15000),
    spawnWithTimeout(process.execPath, [binPath, "install-user-hook"], {}, 10000),
  ]);
  const t1ms = Date.now() - t1;

  const doctorFailed = doctorR.status === "rejected";
  if (doctorFailed) {
    // doctor failures during postinstall are usually expected (no knowledge.db
    // yet), so we only log when stderr is non-empty — that signals a deeper
    // problem worth surfacing.
    const r = doctorR.reason || {};
    if (r.stderr && String(r.stderr).trim()) {
      recordSetupFailure("doctor", r);
    }
  }
  let userHookStatus;
  if (hookR.status === "fulfilled") {
    userHookStatus = "registered";
  } else {
    userHookStatus = "failed";
    recordSetupFailure("install-user-hook", hookR.reason || {});
  }

  process.stderr.write(
    duckify(`     doctor: ${doctorFailed ? "未通过 (通常正常)" : "ok"} · hook: ${userHookStatus} · ${t1ms}ms\n`),
  );

  // === Stage 2: warmup vector model (default ON; opt-out via TEAMAGENT_SKIP_WARMUP=1) ===
  // 关键资产：multilingual-e5-small ~120MB；首次会从 HuggingFace 拉。
  // 用 stdio:"inherit" 让 warmup 子进程的进度条直接渲染到用户终端
  // （warmup 命令本身渲染 \r 重写的进度条，TTY 友好）。
  // timeout 保留 300s 因为模型本身就大；网络慢用户也得能装上。
  let warmupStatus = "skipped";
  if (process.env.TEAMAGENT_SKIP_WARMUP !== "1") {
    process.stderr.write(duckify("[2/2] 下载向量模型 (首次安装会拉 ~120MB；后续走缓存):\n"));
    const t2 = Date.now();
    try {
      await spawnWithTimeout(
        process.execPath,
        [binPath, "warmup"],
        { inheritStdio: true },
        300_000,
      );
      warmupStatus = "ok";
      process.stderr.write(`     warmup: ok · ${Date.now() - t2}ms\n`);
    } catch (err) {
      warmupStatus = "failed";
      // warmup 用了 stdio:inherit，捕捉不到 stdout/stderr，只能记 message
      recordSetupFailure("warmup", err);
      process.stderr.write(
        `     warmup: 失败 (${err.message}) → 首次 embed 时按需下载 · ${Date.now() - t2}ms\n`,
      );
    }
  } else {
    process.stderr.write(duckify("[2/2] warmup: 跳过 (TEAMAGENT_SKIP_WARMUP=1)\n"));
  }

  // === Stage 3: update-state init (always, fast) ===
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
    process.stderr.write(duckify(`ℹ️  update-state init 失败: ${e.message}\n`));
  }

  // === banner ===
  const n = seedRuleCount();
  const ruleMsg = n > 0 ? `${n} 条打包规则已就绪` : "无打包规则";
  const userHookMsg =
    userHookStatus === "registered"
      ? "用户级 SessionStart hook 已注册 (新项目自动 init)"
      : userHookStatus === "failed"
        ? `用户级 hook 注册失败, 详情: ${setupLogPath}`
        : "用户级 hook 未注册";
  const warmupMsg =
    warmupStatus === "ok"
      ? "向量模型已预热"
      : warmupStatus === "failed"
        ? `向量模型预热失败, 首次 embed 会按需下载 (~5–10s)`
        : "向量模型: 跳过预热 (TEAMAGENT_SKIP_WARMUP=1)";

  process.stdout.write(
    duckify([
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "✨ TeamAgent 安装成功",
      `   · 归因渲染: verbose 模式 (TEAMAGENT_VISIBILITY=smart 可调)`,
      `   · 知识种子: ${ruleMsg}`,
      `   · 自动初始化: ${userHookMsg}`,
      `   · 向量模型  : ${warmupMsg}`,
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
    ].join("\n")),
  );

  if (doctorFailed) {
    process.stderr.write(
      duckify(
        "ℹ️  TeamAgent doctor 有未通过项 (通常是 knowledge.db 未初始化，属正常)。\n" +
          "   运行 `teamagent doctor` 查看详情\n\n",
      ),
    );
  }
}

// 入口：never block install — 任何顶层异常都吞掉记录后 exit 0
main().catch((e) => {
  process.stderr.write(`postinstall 顶层异常: ${e && e.message ? e.message : String(e)}\n`);
  try { recordSetupFailure("main", e); } catch { /* best-effort */ }
  process.exit(0);
});
