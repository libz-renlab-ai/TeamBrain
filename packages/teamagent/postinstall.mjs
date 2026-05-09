#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Issue #164: as of v0.10.x the vector deps (@xenova/transformers +
 * onnxruntime-node) are listed in `dependencies` (no longer optional / opt-in).
 * Default install therefore *always* has them. This gate becomes a defensive
 * fallback for edge cases:
 *   - user manually `npm uninstall @xenova/transformers` after install
 *   - corporate registry mirror that strips the deps
 *   - --no-optional / lockfile drift
 * In those cases we still skip Stage 2 cleanly to avoid leaving a stale
 * `status=downloading pid=0` placeholder that confuses bin-pre-tool-use.
 *
 * Uses bounded fs.existsSync rather than createRequire walks: we must NOT find
 * a globally-installed @xenova in the user's nvm/node_modules; we want to know
 * specifically whether the optionals were installed alongside this teamagent
 * (npm hoists deps to <prefix>/lib/node_modules/ peer dirs in -g installs, or
 * to ./node_modules/ for local installs).
 */
function vectorOptionalsInstalled(pkgDir) {
  // Both @xenova/transformers AND onnxruntime-node must be present for warmup
  // to actually succeed; if only @xenova is found the runtime fails on missing
  // native ORT bindings. Mirrors the AND check in
  // packages/cli/src/commands/init.ts:haveVectorOptionals.
  const xenovaCandidates = [
    path.join(pkgDir, "node_modules", "@xenova", "transformers", "package.json"),
    path.join(pkgDir, "..", "@xenova", "transformers", "package.json"),
  ];
  const onnxCandidates = [
    path.join(pkgDir, "node_modules", "onnxruntime-node", "package.json"),
    path.join(pkgDir, "..", "onnxruntime-node", "package.json"),
  ];
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const hasXenova = xenovaCandidates.some(exists);
  const hasOnnx = onnxCandidates.some(exists);
  let found = hasXenova && hasOnnx;

  // Third strategy: pnpm content-addressable store puts deps at
  // ~/.local/share/pnpm/global/<N>/.pnpm/<dep>@<ver>/node_modules/<dep>/.
  // The two fs.existsSync candidates above miss that layout. Use
  // createRequire to let Node's own module-resolution algorithm find the
  // package.json — it follows pnpm's symlink structure correctly.
  // Constrain the resolved path to known global roots so we don't
  // false-positive on the user's unrelated nvm/system install of @xenova.
  if (!found) {
    try {
      const req = createRequire(pathToFileURL(path.join(pkgDir, "package.json")).href);
      const knownRoots = [
        pkgDir,
        path.join(os.homedir(), ".local", "share", "pnpm"),
        path.join(os.homedir(), ".npm-global"),
        path.join(os.homedir(), ".pnpm-global"),
      ];
      const isUnderKnownRoot = (resolved) =>
        knownRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
      let rxResolved;
      try { rxResolved = req.resolve("@xenova/transformers/package.json"); } catch { /* not found */ }
      let onnxResolved;
      try { onnxResolved = req.resolve("onnxruntime-node/package.json"); } catch { /* not found */ }
      if (rxResolved && onnxResolved && isUnderKnownRoot(rxResolved) && isUnderKnownRoot(onnxResolved)) {
        found = true;
      }
    } catch {
      // createRequire path is best-effort; fall through to found=false
    }
  }
  if (process.env.TEAMAGENT_POSTINSTALL_DEBUG === "1") {
    process.stderr.write(`DEBUG postinstall pkgDir=${pkgDir} found=${found} (xenova=${hasXenova} onnx=${hasOnnx})\n`);
  }
  return found;
}

/**
 * Issue #158: detect whether the optional tree-sitter native deps
 * (web-tree-sitter + tree-sitter-typescript + tree-sitter-python) are present.
 * They have been removed from packages/teamagent/package.json entirely because
 * their install scripts spawn cmd.exe on Windows during npm reify (ENOENT) and
 * the partial install deletes the user's prior teamagent. Their absence is the
 * default case post-#158; the matcher's `ast-context.ts:initAstMatcher` already
 * has a try/catch fallback that returns false → "conservative mode" (don't
 * filter comment/string false-positives). Surface the state in the banner so
 * users grepping postinstall.log can distinguish "skipped on purpose" from
 * "ast-matcher never reached" — symmetric to vectorOptionalsInstalled (#160).
 */
function treesitterOptionalsInstalled(pkgDir) {
  // All three packages must be present for ast-context.ts to initialize all
  // language parsers. Mirrors the AND check pattern from vectorOptionalsInstalled.
  const wtsCandidates = [
    path.join(pkgDir, "node_modules", "web-tree-sitter", "package.json"),
    path.join(pkgDir, "..", "web-tree-sitter", "package.json"),
  ];
  const tsCandidates = [
    path.join(pkgDir, "node_modules", "tree-sitter-typescript", "package.json"),
    path.join(pkgDir, "..", "tree-sitter-typescript", "package.json"),
  ];
  const pyCandidates = [
    path.join(pkgDir, "node_modules", "tree-sitter-python", "package.json"),
    path.join(pkgDir, "..", "tree-sitter-python", "package.json"),
  ];
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const hasWts = wtsCandidates.some(exists);
  const hasTs = tsCandidates.some(exists);
  const hasPy = pyCandidates.some(exists);
  let found = hasWts && hasTs && hasPy;

  // pnpm content-addressable store fallback — same strategy as vector check.
  if (!found) {
    try {
      const req = createRequire(pathToFileURL(path.join(pkgDir, "package.json")).href);
      // /review iter-1 hardening: original list — pkgDir, ~/.local/share/pnpm,
      // ~/.npm-global, ~/.pnpm-global — has zero hits on Windows where pnpm
      // lives at %LOCALAPPDATA%\pnpm (e.g. C:\Users\<u>\AppData\Local\pnpm)
      // and npm at %APPDATA%\npm. Without these roots the fallback
      // false-negatives every Windows user who explicitly installed the
      // tree-sitter packages, permanently flagging matcher AST as absent.
      const knownRoots = [
        pkgDir,
        path.join(os.homedir(), ".local", "share", "pnpm"),
        path.join(os.homedir(), ".npm-global"),
        path.join(os.homedir(), ".pnpm-global"),
        // Windows pnpm + npm globals.
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "pnpm") : null,
        process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules") : null,
        process.env.APPDATA ? path.join(process.env.APPDATA, "npm") : null,
      ].filter(Boolean);
      const isUnderKnownRoot = (resolved) =>
        knownRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
      let wtsResolved, tsResolved, pyResolved;
      try { wtsResolved = req.resolve("web-tree-sitter/package.json"); } catch { /* not found */ }
      try { tsResolved = req.resolve("tree-sitter-typescript/package.json"); } catch { /* not found */ }
      try { pyResolved = req.resolve("tree-sitter-python/package.json"); } catch { /* not found */ }
      if (
        wtsResolved && tsResolved && pyResolved &&
        isUnderKnownRoot(wtsResolved) && isUnderKnownRoot(tsResolved) && isUnderKnownRoot(pyResolved)
      ) {
        found = true;
      }
    } catch {
      // best-effort
    }
  }
  if (process.env.TEAMAGENT_POSTINSTALL_DEBUG === "1") {
    process.stderr.write(`DEBUG postinstall tree-sitter pkgDir=${pkgDir} found=${found} (wts=${hasWts} ts=${hasTs} py=${hasPy})\n`);
  }
  return found;
}

// --- duck-mode (issue #116) — inline because postinstall.mjs ships
// standalone without bundled @teamagent/core. Full copy of the
// authoritative table at packages/core/src/duck-mode/translations.ts.
// Copying all entries future-proofs against banner copy changes (table
// is small: ~25 entries × ~150 bytes ≈ 3 KB).
const POSTINSTALL_DUCK = [
  { term: "归因渲染", aliases: ["attribution", "AttributionBus"], duck: "鸭鸭说: 归因渲染就是把'系统帮你做了什么'拼成一段人话给你看呷~" },
  { term: "知识种子", aliases: ["seed", "seeds"], duck: "呷呷~ 知识种子是预先打包给鸭鸭的一袋通用规则，鸭鸭装完就能跑 (>ω<)" },
  { term: "hooks", aliases: ["hook", "Hook", "Hooks"], duck: "呷呷~ Hook 是 Claude 做事前/后的小钩子，鸭鸭可以悄悄在中间加一道关卡 (>ω<)" },
  { term: "doctor", duck: "鸭鸭说: doctor 就是体检命令，跑一遍看哪里没装好呷~" },
  { term: "knowledge.db", duck: "呷呷~ knowledge.db 是鸭鸭存所有规则的小本本（SQLite 文件）(>ω<)" },
  { term: "verbose", aliases: ["Verbose"], duck: "鸭鸭说: verbose 模式 = 鸭鸭话比较多，会把过程说更细呷~" },
  { term: "Skills", aliases: ["skills", "skill", "Skill"], duck: "鸭鸭说: Skills 就是鸭鸭准备好的小本事，每个 .md 文件就是一招呷~ 装上 Skills，鸭鸭可以多会一招事。" },
  { term: "PreToolUse", aliases: ["pre-tool-use", "pretooluse"], duck: "鸭鸭说: PreToolUse 是 Claude 工具调用前的钩子，鸭鸭可以在动手前提一句呷~" },
  { term: "Stop hook", aliases: ["stop-hook", "Stop Hook"], duck: "呷呷~ Stop hook 是每轮回答结束触发，鸭鸭借此偷偷做总结、记笔记 (>ω<)" },
  { term: "embedding", aliases: ["embeddings", "向量模型", "向量化"], duck: "鸭鸭说: embedding 是把文字捏成一串数字，鸭鸭就能算两段话有多像呷~" },
  { term: "vector", aliases: ["vectors", "向量"], duck: "呷呷~ vector 是 embedding 出来的一串数字，鸭鸭用它在大堆话里找最像的那条 (>ω<)" },
  { term: "matcher", aliases: ["matching", "match"], duck: "鸭鸭说: matcher 是鸭鸭的小雷达，扫过一句话看有没有匹配的规则呷~" },
  { term: "RAG", aliases: ["rag"], duck: "呷呷~ RAG 就是先去鸭鸭的资料库捞几条相关笔记，再让 Claude 看完笔记答题 (>ω<)" },
  { term: "quantization", aliases: ["quantized", "量化"], duck: "鸭鸭说: quantization 是把模型缩水让它跑更快、占更少内存呷~ 像鸭鸭把胖羽毛压扁。" },
  { term: "canonical", aliases: ["canonical+", "Canonical"], duck: "呷呷~ canonical 表示这条规则非常稳，已经升级成鸭鸭的官方教科书等级 (>ω<)" },
  { term: "token 预算", aliases: ["token budget", "token-budget"], duck: "鸭鸭说: token 预算是 Claude 一次能装多少话的上限，鸭鸭得挑最重要的塞进去呷~" },
  { term: "MCP", aliases: ["mcp", "Model Context Protocol"], duck: "呷呷~ MCP 是让 Claude 接外部小工具的标准接口，鸭鸭借此装上各种插件 (>ω<)" },
  { term: "reload", aliases: ["reloading"], duck: "鸭鸭说: reload 就是重新加载，鸭鸭把刚改的设定再吃一遍呷~" },
  { term: "statusLine", aliases: ["statusline", "status line"], duck: "呷呷~ statusLine 是终端最底下那条提示条，鸭鸭把它用来显示状态 (>ω<)" },
  { term: "settings.local.json", duck: "鸭鸭说: settings.local.json 是 Claude Code 的项目专属配置呷~ 里面写了哪些 hook 和工具开了。" },
  { term: "tier", aliases: ["tiers", "experimental", "probation"], duck: "鸭鸭说: tier 就是规则的修炼等级呷~ 新规则算 experimental，可信了升 probation，再稳就到 canonical 教科书级 (>ω<)" },
  { term: "confidence", aliases: ["conf"], duck: "鸭鸭说: confidence 是这条规则的可信度分数，越高鸭鸭越敢按它来办事呷~" },
  { term: "demerit", aliases: ["demerits"], duck: "呷呷~ demerit 是规则犯错的扣分记录，鸭鸭用它来识别失效的旧规则 (>ω<)" },
  { term: "元原则", aliases: ["meta-principle", "meta principles"], duck: "鸭鸭说: 元原则是最顶层的几条铁律，比如'不要让代码自己评价自己'呷~" },
  { term: "Codex", aliases: ["codex", ".codex/skills"], duck: "鸭鸭说: Codex 是另一个 AI 编程助手，鸭鸭也给它准备一份 Skills 让它读呷~" },
  { term: "plugins", aliases: ["plugin", "Plugin"], duck: "呷呷~ plugins 是给 Claude Code 装的小扩展包，鸭鸭借此让 Claude 多会几招呷~ (>ω<)" },
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

/**
 * Issue #160: positive log entry for non-failure outcomes (skipped / ok). The
 * warmup gate skips silently when optional vector deps are absent, but users
 * grepping postinstall.log for `stage=warmup` should still see the decision —
 * "no warmup attempted" is meaningfully different from "no log line at all"
 * (the latter looks like postinstall.mjs never reached Stage 2).
 */
function recordSetupStatus(stage, status, detail) {
  try {
    fs.mkdirSync(path.dirname(setupLogPath), { recursive: true });
    const ts = new Date().toISOString();
    const detailStr = detail ? ` reason=${detail}` : "";
    fs.appendFileSync(setupLogPath, `[${ts}] stage=${stage} status=${status}${detailStr}\n`, "utf-8");
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

/**
 * Two-stage install (ADR 0001): write placeholder warmup state + spawn detached
 * `bin warmup --write-state <path>`. Returns immediately so postinstall.mjs
 * itself unblocks `npm install -g <tarball>` within ~30s.
 *
 * Mirrors packages/cli/src/commands/init.ts:589 spawnDetachedWarmup +
 * packages/cli/src/warmup-state.ts writeInitialPlaceholder. postinstall.mjs is
 * standalone (no @teamagent/core import), so the schema is inlined.
 */
function spawnDetachedWarmup(binJsPath) {
  const teamagentDir = path.join(os.homedir(), ".teamagent");
  const statePath = path.join(teamagentDir, ".warmup-state.json");
  const logPath = path.join(teamagentDir, "warmup.log");
  try {
    fs.mkdirSync(teamagentDir, { recursive: true });
  } catch (err) {
    return { ok: false, detail: `mkdir ~/.teamagent failed: ${String(err).slice(0, 80)}` };
  }
  // 1) atomic placeholder so first reader (PreToolUse / doctor) sees
  //    status="downloading" rather than the moment-of-no-file.
  const placeholder = {
    status: "downloading",
    started_at: new Date().toISOString(),
    pid: 0,
    model: "Xenova/multilingual-e5-small",
  };
  try {
    const tmp = `${statePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(placeholder, null, 2), "utf-8");
    fs.renameSync(tmp, statePath);
  } catch (err) {
    return { ok: false, detail: `state-file write failed: ${String(err).slice(0, 80)}` };
  }
  // 2) open log fd so the child can keep writing after parent exits.
  let logFd;
  try {
    logFd = fs.openSync(logPath, "a");
  } catch (err) {
    return { ok: false, detail: `warmup.log open failed: ${String(err).slice(0, 80)}` };
  }
  // 3) spawn detached + unref so the npm install pipe closes immediately.
  try {
    const child = spawn(
      process.execPath,
      [binJsPath, "warmup", "--write-state", statePath],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    child.unref();
    return { ok: true, pid: child.pid ?? 0, statePath, logPath };
  } catch (err) {
    return { ok: false, detail: `spawn failed: ${String(err).slice(0, 80)}` };
  } finally {
    try { fs.closeSync(logFd); } catch { /* child already inherited the fd */ }
  }
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

  // === Stage 2: warmup vector model (two-stage install — ADR 0001) ===
  // 关键资产：multilingual-e5-small ~120MB；首次会从 HuggingFace 拉。
  //
  // 默认 detached：写一份 placeholder state 到 ~/.teamagent/.warmup-state.json
  // (status="downloading", pid=0)，spawn detached child + child.unref()，立即返回。
  // 主流程 wall-clock 不再卡在模型下载上 → install 进 30s（ADR 0001 promise）。
  // bin-pre-tool-use 在 status !== "ready" 时回退 legacy substring matcher，universal
  // pack 的 substring-friendly 关键词在 ~10 分钟下载完之前已能拦截高频陷阱。
  //
  // postinstall.mjs 是 standalone（不能 import @teamagent/core / warmup-state.ts），
  // 所以这里 inline 复制 placeholder schema；与 packages/cli/src/warmup-state.ts
  // writeInitialPlaceholder 保持一致。
  //
  // 三个 env：
  //   TEAMAGENT_SKIP_WARMUP=1     完全跳过（用户首次 PreToolUse 才按需下载）
  //   TEAMAGENT_FOREGROUND_WARMUP=1   foreground 同步等齐（旧行为；适合 CI / 预热镜像）
  //   (默认)                       detached 后台
  let warmupStatus = "skipped";
  const haveVectorOptionals = vectorOptionalsInstalled(pkgDir);
  if (process.env.TEAMAGENT_SKIP_WARMUP === "1") {
    // Issue #160: log BEFORE the user-visible message so a SIGINT / EPIPE
    // crash mid-banner still leaves `stage=warmup status=skipped` in
    // postinstall.log — the whole point of this entry is to disambiguate
    // "skipped on purpose" from "Stage 2 never reached."
    recordSetupStatus("warmup", "skipped", "env-skip-warmup");
    process.stderr.write(duckify("[2/2] warmup: 跳过 (TEAMAGENT_SKIP_WARMUP=1)\n"));
  } else if (!haveVectorOptionals) {
    // Issue #164: defensive fallback. As of v0.10.x the vector deps ship by
    // default in `dependencies`, so reaching this branch means something
    // stripped them post-install (manual uninstall, --no-optional, mirror).
    warmupStatus = "vector-deps-absent";
    recordSetupStatus("warmup", "skipped", "vector-deps-missing-after-install");
    process.stderr.write(
      duckify(
        "[2/2] warmup: 跳过 (vector deps 缺失; substring matcher 仍可用)\n" +
          "     这通常意味着 @xenova/transformers 或 onnxruntime-node 在装后被移除了。\n" +
          "     恢复语义匹配：npm install -g @xenova/transformers@^2.17.0 onnxruntime-node@1.14.0\n",
      ),
    );
  } else if (process.env.TEAMAGENT_FOREGROUND_WARMUP === "1") {
    process.stderr.write(duckify("[2/2] 下载向量模型 (TEAMAGENT_FOREGROUND_WARMUP=1; ~120MB):\n"));
    const t2 = Date.now();
    try {
      await spawnWithTimeout(
        process.execPath,
        [binPath, "warmup"],
        { inheritStdio: true },
        300_000,
      );
      warmupStatus = "foreground-ok";
      process.stderr.write(`     warmup: ok · ${Date.now() - t2}ms\n`);
      // Issue #160: positive log entry symmetric with the skip case.
      recordSetupStatus("warmup", "ok", "foreground");
    } catch (err) {
      warmupStatus = "foreground-failed";
      recordSetupFailure("warmup", err);
      process.stderr.write(
        `     warmup: 失败 (${err.message}) → 首次 embed 时按需下载 · ${Date.now() - t2}ms\n`,
      );
    }
  } else {
    process.stderr.write(duckify("[2/2] 启动后台向量模型预热 (~120MB, 约 10 分钟):\n"));
    const t2 = Date.now();
    const detach = spawnDetachedWarmup(binPath);
    if (detach.ok) {
      warmupStatus = "detached";
      process.stderr.write(
        `     warmup: 后台 pid=${detach.pid} state=${detach.statePath} · ${Date.now() - t2}ms\n`,
      );
      // Issue #160: detached spawn succeeded; child's terminal status flips
      // ~/.teamagent/.warmup-state.json once it lands. postinstall.log only
      // records the parent decision (we forked the warmup; we did not block
      // on it).
      recordSetupStatus("warmup", "detached", "background");
    } else {
      warmupStatus = "detached-failed";
      recordSetupFailure("warmup-detach", { message: detach.detail });
      process.stderr.write(
        `     warmup: detach 失败 (${detach.detail}) → 首次 embed 时按需下载 · ${Date.now() - t2}ms\n`,
      );
    }
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

  // === Stage 4: tree-sitter AST matcher detection (issue #158) ===
  // The 3 tree-sitter packages (web-tree-sitter, tree-sitter-typescript,
  // tree-sitter-python) were removed from packages/teamagent/package.json
  // because their native install scripts spawn cmd.exe on Windows and fail
  // (ENOENT), and npm reify deletes the prior teamagent install before that
  // failure surfaces — destroying user state. ast-context.ts:initAstMatcher
  // already has a try/catch fallback returning false when import fails (=>
  // matcher runs in conservative mode: comment/string false-positives are NOT
  // filtered). Surface the state symmetric to vector-deps-absent (#160).
  const haveTreesitter = treesitterOptionalsInstalled(pkgDir);
  const astMatcherStatus = haveTreesitter ? "ready" : "skipped";
  recordSetupStatus(
    "ast-matcher",
    astMatcherStatus,
    haveTreesitter ? "tree-sitter-installed" : "tree-sitter-deps-absent",
  );

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
    warmupStatus === "detached"
      ? "向量模型: 后台下载中 (~10 分钟); 期间使用 substring fallback (ADR 0001)"
      : warmupStatus === "detached-failed"
        ? "向量模型: 后台启动失败, 首次 embed 会按需下载 (~5–10s)"
        : warmupStatus === "foreground-ok"
          ? "向量模型已预热 (TEAMAGENT_FOREGROUND_WARMUP=1)"
          : warmupStatus === "foreground-failed"
            ? "向量模型预热失败 (foreground 模式), 首次 embed 会按需下载 (~5–10s)"
            : warmupStatus === "vector-deps-absent"
              ? "向量模型: vector deps 缺失 (substring matcher 兜底; 跑 npm install -g @xenova/transformers onnxruntime-node 恢复)"
              : "向量模型: 跳过预热 (TEAMAGENT_SKIP_WARMUP=1)";

  // Issue #158: ast-matcher banner — symmetric to warmupMsg.
  const astMsg =
    astMatcherStatus === "ready"
      ? "AST 精准过滤已启用 (web-tree-sitter)"
      : "AST 过滤: 未安装 (matcher 跑保守模式; 注释/字符串里的关键词也会触发提醒)\n     · 启用精准过滤: npm install -g teamagent web-tree-sitter@^0.26 tree-sitter-typescript@^0.23 tree-sitter-python@^0.23";

  // B-152: previously the banner always said "✨ TeamAgent 安装成功" even when
  // install-user-hook failed (e.g., monorepo dev mode where dist/bin.js is
  // missing). That misled users into thinking SessionStart would auto-trigger.
  // Now the banner reflects the real state.
  const hookOk = userHookStatus === "registered";
  const headerLine = hookOk
    ? "✨ TeamAgent 安装成功"
    : "⚠️  TeamAgent 部分安装 — 用户级 hook 注册失败";
  const closingLine = hookOk
    ? "✅ 装好啦 🎉 立刻可以做的 3 件事:"
    : "⚠️  装了但没完全跑通。SessionStart hook 没装 → 不会自动 init 新项目。详情:";
  const nextLine = hookOk
    ? "   · 下一步  : 直接打开 Claude Code, 任何项目首次开会自动 init"
    : `   · 下一步  : 看 ${setupLogPath} 排查；修好后跑 \`teamagent install-user-hook\``;

  process.stdout.write(
    duckify([
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      headerLine,
      `   · 归因渲染: verbose 模式 (TEAMAGENT_VISIBILITY=smart 可调)`,
      `   · 知识种子: ${ruleMsg}`,
      `   · 自动初始化: ${userHookMsg}`,
      `   · 向量模型  : ${warmupMsg}`,
      `   · AST 过滤  : ${astMsg}`,
      nextLine,
      "",
      closingLine,
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
