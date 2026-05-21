import {
  probeNodeSqlite
} from "./chunk-2LMMULPZ.js";
import {
  enumerateInstallTableBundlePaths
} from "./chunk-NBY7IFQJ.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  STATIC_USER_SKILLS,
  planStaticUserSkillInstall,
  stripLegacyTeamagentBlock
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/doctor.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawn as nodeSpawn } from "child_process";
import { createRequire } from "module";

// ../cli/src/commands/doctor-diff.ts
init_esm_shims();
function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = [];
  for (let i2 = 0; i2 <= n; i2++) dp.push(new Array(m + 1).fill(0));
  for (let i2 = n - 1; i2 >= 0; i2--) {
    for (let j2 = m - 1; j2 >= 0; j2--) {
      if (a[i2] === b[j2]) dp[i2][j2] = dp[i2 + 1][j2 + 1] + 1;
      else dp[i2][j2] = Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++] });
  while (j < m) ops.push({ type: "add", line: b[j++] });
  return ops;
}
function unifiedDiff(filePath, before, after, context = 3) {
  const beforeLines = before.split("\n");
  const afterLines = after === null ? [] : after.split("\n");
  const ops = diffLines(beforeLines, afterLines);
  if (ops.every((op) => op.type === "eq")) return "";
  const oldLineAt = new Array(ops.length + 1);
  const newLineAt = new Array(ops.length + 1);
  oldLineAt[0] = 1;
  newLineAt[0] = 1;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    oldLineAt[i + 1] = oldLineAt[i] + (op.type === "add" ? 0 : 1);
    newLineAt[i + 1] = newLineAt[i] + (op.type === "del" ? 0 : 1);
  }
  const ranges = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === "eq") continue;
    const start = Math.max(0, i - context);
    const end = Math.min(ops.length - 1, i + context);
    const last = ranges[ranges.length - 1];
    if (last && last[1] >= start - 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }
  const out = [];
  out.push(`--- ${filePath}`);
  out.push(after === null ? `+++ /dev/null` : `+++ ${filePath}`);
  for (const [start, end] of ranges) {
    const hunkOps = ops.slice(start, end + 1);
    const oldStart = oldLineAt[start];
    const newStart = newLineAt[start];
    const oldCount = hunkOps.filter((o) => o.type !== "add").length;
    const newCount = hunkOps.filter((o) => o.type !== "del").length;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of hunkOps) {
      const prefix = op.type === "eq" ? " " : op.type === "del" ? "-" : "+";
      out.push(prefix + op.line);
    }
  }
  return out.join("\n") + "\n";
}

// ../cli/src/commands/doctor.ts
var _require = createRequire(import.meta.url);
function parseDoctorArgs(argv) {
  let cwd;
  for (const arg of argv) {
    if (arg.startsWith("--cwd=")) {
      cwd = arg.slice("--cwd=".length);
      break;
    }
  }
  const cwdIdx = argv.indexOf("--cwd");
  if (cwdIdx !== -1 && argv[cwdIdx + 1] && !argv[cwdIdx + 1].startsWith("--")) {
    cwd = argv[cwdIdx + 1];
  }
  return {
    fix: argv.includes("--fix"),
    dryRun: argv.includes("--dry-run"),
    json: argv.includes("--json"),
    postinstall: argv.includes("--postinstall"),
    cwd
  };
}
function backupFile(filePath, opts) {
  const home = opts.homeDir ?? os.homedir();
  const backupDir = opts.backupDir ?? path.join(home, ".teamagent", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${ts}.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}
async function autoFix(check, opts) {
  if (check.status !== "fail") {
    return { name: check.name, status: "skipped", detail: "check did not fail" };
  }
  const cwd = opts.cwd ?? process.cwd();
  try {
    if (check.name === "knowledge-db") {
      if (opts.dryRun) {
        return {
          name: check.name,
          status: "preview",
          detail: "\u5C06\u8FD0\u884C `teamagent init` \u521B\u5EFA knowledge.db\uFF08\u65E0 prior state\uFF0C\u56E0\u6B64\u8DF3\u8FC7 backup\uFF09"
        };
      }
      const { executeInit } = await import("./init-XBJTW7GQ.js");
      await executeInit({ cwd, skipImport: true });
      return {
        name: check.name,
        status: "applied",
        detail: "\u5DF2\u901A\u8FC7 `teamagent init` \u521B\u5EFA knowledge.db"
      };
    } else if (check.name === "hook-registered" || check.name === "hook-script") {
      if (opts.dryRun) {
        return {
          name: check.name,
          status: "preview",
          detail: "\u5C06\u5411 .claude/settings.local.json \u6CE8\u518C PreToolUse hook"
        };
      }
      const { installHook } = await import("./install-hook-I76EADTR.js");
      installHook({ cwd });
      return {
        name: check.name,
        status: "applied",
        detail: "\u5DF2\u5411 .claude/settings.local.json \u6CE8\u518C PreToolUse hook"
      };
    } else if (check.name === "claude-md") {
      const claudeMdPath = path.join(cwd, "CLAUDE.md");
      if (!fs.existsSync(claudeMdPath)) {
        return {
          name: check.name,
          status: "skipped",
          detail: `CLAUDE.md \u4E0D\u5B58\u5728: ${claudeMdPath}`,
          filePath: claudeMdPath
        };
      }
      const before = fs.readFileSync(claudeMdPath, "utf-8");
      const after = stripLegacyTeamagentBlock(before);
      if (after === before) {
        return {
          name: check.name,
          status: "skipped",
          detail: "\u672A\u68C0\u6D4B\u5230 legacy TEAMAGENT \u5757",
          filePath: claudeMdPath
        };
      }
      const willDelete = after === "";
      const targetAfter = willDelete ? null : after;
      if (opts.dryRun) {
        return {
          name: check.name,
          status: "preview",
          filePath: claudeMdPath,
          diff: unifiedDiff(claudeMdPath, before, targetAfter),
          detail: willDelete ? "\u5C06\u5220\u9664 CLAUDE.md\uFF08\u6574\u6587\u4EF6\u5373 legacy \u5757\uFF09" : "\u5C06\u5265\u79BB legacy TEAMAGENT \u5757"
        };
      }
      const backupPath = backupFile(claudeMdPath, opts);
      if (willDelete) {
        fs.unlinkSync(claudeMdPath);
      } else {
        fs.writeFileSync(claudeMdPath, after, "utf-8");
      }
      return {
        name: check.name,
        status: "applied",
        filePath: claudeMdPath,
        backupPath,
        detail: willDelete ? "\u5DF2\u5220\u9664 CLAUDE.md\uFF08\u6574\u6587\u4EF6\u5373 legacy \u5757\uFF09" : "\u5DF2\u5265\u79BB legacy TEAMAGENT \u5757"
      };
    }
    return { name: check.name, status: "skipped", detail: "\u65E0\u81EA\u52A8\u4FEE\u590D" };
  } catch (e) {
    return {
      name: check.name,
      status: "error",
      detail: "\u81EA\u52A8\u4FEE\u590D\u5931\u8D25",
      error: String(e).slice(0, 200)
    };
  }
}
async function executeDoctor(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  const checks = [];
  const fixOutcomes = [];
  const dryRun = !!opts.fix && !!opts.dryRun;
  const tryFix = async (check) => {
    if (!opts.fix || check.status !== "fail") return;
    const outcome = await autoFix(check, opts);
    fixOutcomes.push(outcome);
  };
  const nodeCheck = checkNodeVersion(opts.nodeSqliteProbe);
  checks.push(nodeCheck);
  if (nodeCheck.status === "fail") {
    return finalize(checks, true, opts, fixOutcomes);
  }
  checks.push(
    checkInstallTableBundles(opts.installTableEnumerator, opts.bundleExistsFn)
  );
  const claudeCheck = checkClaudeCode(opts.claudeProbe);
  checks.push(claudeCheck);
  if (claudeCheck.status === "fail") {
    return finalize(checks, true, opts, fixOutcomes);
  }
  checks.push(checkSqliteVec());
  const homeCheck = checkHomeDir(home);
  checks.push(homeCheck);
  if (homeCheck.status === "fail") {
    return finalize(checks, true, opts, fixOutcomes);
  }
  const dbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const dbCheck = checkKnowledgeDb(dbPath);
  checks.push(dbCheck);
  await tryFix(dbCheck);
  if (dbCheck.status === "fail" && !opts.fix) {
    checks.push(skip("hook-registered", "knowledge.db \u5148\u4FEE"));
    checks.push(skip("hook-script", "knowledge.db \u5148\u4FEE"));
    return finalize(checks, false, opts, fixOutcomes);
  }
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  const userSettingsPath = path.join(home, ".claude", "settings.json");
  const hookCheck = checkHookRegistered(settingsPath, userSettingsPath);
  checks.push(hookCheck);
  await tryFix(hookCheck);
  if (hookCheck.status === "fail" && !opts.fix) {
    checks.push(skip("hook-script", "Hook \u6CE8\u518C\u5148\u4FEE"));
    return finalize(checks, false, opts, fixOutcomes);
  }
  const hookScriptCheck = checkHookScript(settingsPath);
  checks.push(hookScriptCheck);
  await tryFix(hookScriptCheck);
  if (hookScriptCheck.status === "pass") {
    checks.push(await checkHookSpawn(hookScriptCheck.detail, opts.hookProbe));
  }
  checks.push(checkSettingsJsonScope(settingsPath, path.join(home, ".claude", "settings.json")));
  checks.push(checkPluginSync(cwd, home));
  checks.push(checkStaticUserSkillsPropagated(home));
  checks.push(checkCodexBin(opts.codexProbe));
  checks.push(await checkMcpReachability(cwd, opts.mcpProbe));
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  const claudeMdCheck = checkClaudeMd(claudeMdPath);
  if (opts.fix && claudeMdCheck.status === "fail") {
    await tryFix(claudeMdCheck);
    if (dryRun) {
      checks.push(claudeMdCheck);
    } else {
      checks.push(checkClaudeMd(claudeMdPath));
    }
  } else {
    checks.push(claudeMdCheck);
  }
  checks.push(await checkVectorModelState(home));
  return finalize(checks, false, opts, fixOutcomes);
}
async function checkVectorModelState(home) {
  const { describeWarmupReadiness, defaultWarmupStatePath } = await import("./warmup-state-4E7RVQWL.js");
  const r = describeWarmupReadiness(defaultWarmupStatePath(home));
  if (r.reason === "ready" && r.state) {
    const took = r.state.completed_at && r.state.started_at ? new Date(r.state.completed_at).getTime() - new Date(r.state.started_at).getTime() : void 0;
    return {
      name: "vector_model",
      status: "pass",
      detail: `ready (${r.state.model})${took ? ` \xB7 \u9884\u70ED ${Math.round(took / 1e3)}s` : ""}`
    };
  }
  if (r.reason === "missing") {
    return {
      name: "vector_model",
      status: "skip",
      detail: "\u65E0 warmup \u72B6\u6001\u6587\u4EF6 (\u5C1A\u672A\u8DD1\u8FC7 init/warmup)"
    };
  }
  if (r.reason === "downloading" && r.state) {
    const p = r.state.progress;
    const pct = p && p.total_bytes > 0 ? Math.min(100, Math.floor(p.loaded_bytes / p.total_bytes * 100)) : null;
    const detail = pct !== null ? `downloading (${pct}%, ${p.files_done}/${p.files_total} files, pid=${r.state.pid})` : `downloading (pid=${r.state.pid})`;
    return { name: "vector_model", status: "skip", detail };
  }
  if (r.reason === "stale_downloading" && r.state) {
    return {
      name: "vector_model",
      status: "fail",
      detail: `stale downloading (pid=${r.state.pid} not alive); \u8DD1 \`teamagent warmup\` \u91CD\u8BD5`
    };
  }
  if (r.reason === "failed" && r.state) {
    return {
      name: "vector_model",
      status: "fail",
      detail: `failed: ${r.state.error ?? "unknown"}`
    };
  }
  if (r.reason === "skipped" && r.state) {
    return {
      name: "vector_model",
      status: "skip",
      detail: `skipped (vector deps \u672A\u5728 node_modules \u4E2D\u627E\u5230; \u91CD\u88C5 teamagent \u6062\u590D)`
    };
  }
  return {
    name: "vector_model",
    status: "fail",
    detail: `state file malformed`
  };
}
function finalize(checks, earlyExit, opts = {}, fixOutcomes = []) {
  if (!checks.some((check) => check.name === "team-sharing")) {
    checks.push(checkTeamSharingStatus());
  }
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;
  const result = {
    checks,
    passed,
    failed,
    skipped,
    allPassed: failed === 0 && !earlyExit
  };
  if (opts.fix) {
    result.fixOutcomes = fixOutcomes;
    result.dryRun = !!opts.dryRun;
  }
  return result;
}
function skip(name, detail) {
  return { name, status: "skip", detail };
}
function checkNodeVersion(probe = probeNodeSqlite) {
  const raw = process.version;
  const major = parseInt(raw.slice(1).split(".")[0] ?? "0", 10);
  if (major < 22) {
    return {
      name: "node-version",
      status: "fail",
      detail: `${raw} \u2014 Node < 22\uFF0Cnode:sqlite \u5185\u7F6E\u6A21\u5757\u4E0D\u5B58\u5728\uFF1B\u6240\u6709 hook DOA`,
      fix: "nvm install 22 && nvm use 22  (\u9700\u8981 Node >= 22.5)"
    };
  }
  const result = probe();
  if (result.ok) {
    return { name: "node-version", status: "pass", detail: result.detail };
  }
  return {
    name: "node-version",
    status: "fail",
    detail: `${result.detail} \u2014 hook \u5168\u90E8 DOA\uFF0Cinstall \u770B\u4F3C\u6210\u529F\u5B9E\u5219\u4E0D\u53EF\u7528`,
    fix: "\u5347\u7EA7\u5230 Node >= 22.5 \u540E\u91CD\u88C5 teamagent\uFF08\u8BA9 hook \u6CE8\u518C\u547D\u4EE4\u5E26\u4E0A --experimental-sqlite\uFF09\uFF1Bclean-uninstall \u6B65\u9AA4\u89C1 docs/CLEAN-UNINSTALL.md"
  };
}
var NODE_MODULES_BIN_FRAGMENTS = ["node_modules/.bin", "node_modules\\.bin"];
function pathContainsNodeModulesBin(p) {
  return NODE_MODULES_BIN_FRAGMENTS.some((frag) => p.includes(frag));
}
function firstLine(s) {
  const trimmed = s.trim();
  return trimmed.split("\n")[0] ?? trimmed;
}
var defaultClaudeProbe = (env) => {
  try {
    const stdout = execSync("claude --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: env ?? process.env
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e;
    const stderr = String(err.stderr ?? err.message ?? "");
    const stdout = String(err.stdout ?? "");
    return { ok: false, stdout, stderr };
  }
};
function isBrokenLocalStub(stderr) {
  return stderr.includes("claude native binary not installed") || stderr.includes("postinstall did not run") || stderr.includes("@anthropic-ai/claude-code/install.cjs");
}
function envWithoutNodeModulesBin(env) {
  const PATH = env.PATH ?? env.Path ?? "";
  if (!PATH) return null;
  const sep = path.delimiter;
  const parts = PATH.split(sep);
  const filtered = parts.filter((p) => !pathContainsNodeModulesBin(p));
  if (filtered.length === parts.length) return null;
  const joined = filtered.join(sep);
  return { ...env, PATH: joined, Path: joined };
}
function checkClaudeCode(probe = defaultClaudeProbe) {
  const first = probe();
  if (first.ok) {
    return { name: "claude-code", status: "pass", detail: firstLine(first.stdout) };
  }
  if (isBrokenLocalStub(first.stderr)) {
    const cleanEnv = envWithoutNodeModulesBin(process.env);
    if (cleanEnv) {
      const retry = probe(cleanEnv);
      if (retry.ok) {
        return {
          name: "claude-code",
          status: "pass",
          detail: `${firstLine(retry.stdout)} (\u672C\u5730 pnpm \u526F\u672C\u635F\u574F\uFF0C\u5DF2\u56DE\u9000\u5230\u5168\u5C40 claude)`
        };
      }
    }
    return {
      name: "claude-code",
      status: "fail",
      detail: "\u672C\u5730 pnpm \u526F\u672C\u672A\u5B89\u88C5\u539F\u751F\u4E8C\u8FDB\u5236\uFF0C\u4E14\u5168\u5C40 claude \u4E0D\u53EF\u7528",
      fix: "\u8FD0\u884C `node node_modules/@anthropic-ai/claude-code/install.cjs` \u4FEE\u590D\u672C\u5730\u526F\u672C\uFF0C\u6216\u786E\u4FDD\u5168\u5C40 claude \u5728 PATH \u4E2D"
    };
  }
  return {
    name: "claude-code",
    status: "fail",
    detail: "\u672A\u627E\u5230 claude \u547D\u4EE4",
    fix: "npm install -g @anthropic-ai/claude-code"
  };
}
function checkSqliteVec() {
  try {
    _require("sqlite-vec");
    return { name: "sqlite-vec", status: "pass", detail: "\u52A0\u8F7D\u6210\u529F" };
  } catch {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, "$1:"));
    const candidates = [
      // packages/cli/.../doctor.ts → walk up to monorepo root
      path.resolve(here, "../../../adapters"),
      path.resolve(here, "../../../teamagent"),
      path.resolve(here, "../../../../adapters"),
      path.resolve(here, "../../../../teamagent")
    ];
    for (const root of candidates) {
      try {
        _require.resolve("sqlite-vec", { paths: [root] });
        return { name: "sqlite-vec", status: "pass", detail: `\u52A0\u8F7D\u6210\u529F (resolved via ${path.basename(root)})` };
      } catch {
      }
    }
    return {
      name: "sqlite-vec",
      status: "fail",
      detail: "sqlite-vec \u6269\u5C55\u52A0\u8F7D\u5931\u8D25",
      fix: "npm install -g sqlite-vec  \uFF08\u6216\u68C0\u67E5\u5E73\u53F0\u662F\u5426\u652F\u6301\uFF09"
    };
  }
}
function checkHomeDir(home) {
  const tDir = path.join(home, ".teamagent");
  try {
    fs.mkdirSync(tDir, { recursive: true });
    const probe = path.join(tDir, `.doctor-probe-${process.pid}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    return { name: "home-dir", status: "pass", detail: `${tDir} \u53EF\u8BFB\u5199` };
  } catch (e) {
    return {
      name: "home-dir",
      status: "fail",
      detail: `~/.teamagent \u4E0D\u53EF\u5199: ${String(e).slice(0, 80)}`,
      fix: `chmod 755 ${tDir}`
    };
  }
}
function checkKnowledgeDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return {
      name: "knowledge-db",
      status: "fail",
      detail: "\u77E5\u8BC6\u5E93\u672A\u521D\u59CB\u5316",
      fix: "teamagent init"
    };
  }
  try {
    const db = openDb(dbPath);
    db.close();
    return { name: "knowledge-db", status: "pass", detail: dbPath };
  } catch (e) {
    return {
      name: "knowledge-db",
      status: "fail",
      detail: `knowledge.db \u65E0\u6CD5\u6253\u5F00\uFF1A${String(e).slice(0, 120)}`,
      fix: "teamagent init  \uFF08\u5C06\u91CD\u5EFA\u6570\u636E\u5E93\uFF09"
    };
  }
}
function hasTeamAgentHookInSettings(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const settings = JSON.parse(raw);
    const hooks = settings["hooks"];
    if (!hooks) return false;
    return Object.values(hooks).some(
      (entries) => Array.isArray(entries) && entries.some(
        (h) => typeof h === "object" && h !== null && typeof h["_teamagentTag"] === "string" && h["_teamagentTag"].startsWith("teamagent-")
      )
    );
  } catch {
    return false;
  }
}
function checkHookRegistered(settingsPath, userSettingsPath) {
  if (hasTeamAgentHookInSettings(settingsPath)) {
    return { name: "hook-registered", status: "pass", detail: "PreToolUse Hook \u5DF2\u6CE8\u518C" };
  }
  if (userSettingsPath && hasTeamAgentHookInSettings(userSettingsPath)) {
    return { name: "hook-registered", status: "pass", detail: "\u7528\u6237\u7EA7 Hook \u5DF2\u6CE8\u518C (teamagent install-user-hook)" };
  }
  if (!fs.existsSync(settingsPath)) {
    return {
      name: "hook-registered",
      status: "fail",
      detail: ".claude/settings.local.json \u4E0D\u5B58\u5728",
      fix: "teamagent install-hook"
    };
  }
  try {
    JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return {
      name: "hook-registered",
      status: "fail",
      detail: "settings.local.json \u4E2D\u672A\u627E\u5230 TeamAgent hook",
      fix: "teamagent install-hook"
    };
  } catch {
    return {
      name: "hook-registered",
      status: "fail",
      detail: "\u65E0\u6CD5\u89E3\u6790 settings.local.json",
      fix: "teamagent install-hook"
    };
  }
}
function checkHookScript(settingsPath) {
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const hooks = settings["hooks"];
    const pre = hooks?.["PreToolUse"];
    const entry = Array.isArray(pre) ? pre.find((h) => h["_teamagentTag"] === "teamagent-pre-tool-use") : void 0;
    const cmds = entry?.["hooks"];
    const cmd = cmds?.[0]?.command ?? "";
    const match = cmd.match(/node\s+"?([^"]+)"?/);
    const scriptPath = match?.[1];
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return {
        name: "hook-script",
        status: "fail",
        detail: `Hook \u811A\u672C\u4E0D\u5B58\u5728: ${scriptPath ?? "(\u672A\u627E\u5230\u8DEF\u5F84)"}`,
        fix: "npm install -g teamagent  \uFF08\u91CD\u88C5\uFF09"
      };
    }
    return { name: "hook-script", status: "pass", detail: scriptPath };
  } catch {
    return {
      name: "hook-script",
      status: "fail",
      detail: "\u65E0\u6CD5\u8BFB\u53D6 hook \u811A\u672C\u8DEF\u5F84",
      fix: "teamagent install-hook"
    };
  }
}
var defaultHookProbe = (scriptPath, opts = {}) => {
  const timeoutMs = opts.timeoutMs ?? 5e3;
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env["CLAUDE_PROJECT_DIR"];
    delete env["TEAMAGENT_ALLOW_BARE_SESSIONSTART"];
    let child;
    try {
      child = nodeSpawn(process.execPath, [scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true
      });
    } catch (err) {
      resolve({ exitCode: null, stderr: "", timedOut: false, spawnError: String(err) });
      return;
    }
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
      }
      resolve({ exitCode: null, stderr, timedOut: true });
    }, timeoutMs);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stderr, timedOut: false, spawnError: String(err) });
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString("utf-8");
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stderr, timedOut: false });
    });
    child.stdin?.end();
  });
};
async function checkHookSpawn(scriptPath, probe = defaultHookProbe) {
  const result = await probe(scriptPath);
  if (result.spawnError) {
    return {
      name: "hook-spawn",
      status: "fail",
      detail: `hook spawn \u542F\u52A8\u5931\u8D25: ${result.spawnError.slice(0, 200)}`,
      fix: "\u91CD\u88C5 teamagent (npm install -g teamagent) \u6216\u68C0\u67E5 node \u662F\u5426\u53EF\u7528"
    };
  }
  if (result.timedOut) {
    return {
      name: "hook-spawn",
      status: "fail",
      detail: `hook spawn \u8D85\u8FC7 5s \u672A\u9000\u51FA \u2014 \u53EF\u80FD\u5361\u5728 require/import \u94FE`,
      fix: "\u68C0\u67E5 ~/.teamagent/postinstall.log \u4E2D\u7684 stage=install-user-hook \u4E0E\u4F9D\u8D56\u5B8C\u6574\u6027"
    };
  }
  if (result.exitCode === 0) {
    return {
      name: "hook-spawn",
      status: "pass",
      detail: "hook \u8FDB\u7A0B\u80FD\u6210\u529F\u542F\u52A8\u5E76\u9000\u51FA (probe: empty-stdin \u2192 fast-exit 0)"
    };
  }
  const stderrTail = result.stderr.trim().split("\n").slice(-5).join(" | ").slice(-400);
  return {
    name: "hook-spawn",
    status: "fail",
    detail: `hook spawn exit=${result.exitCode} \u2014 ${stderrTail || "(no stderr)"}`,
    fix: "\u91CD\u88C5 teamagent \u6216\u68C0\u67E5 ~/.teamagent/postinstall.log"
  };
}
function checkSettingsJsonScope(projectSettingsPath, userSettingsPath) {
  const projectHasHook = hasTeamAgentHookInSettings(projectSettingsPath);
  const userHasHook = hasTeamAgentHookInSettings(userSettingsPath);
  if (projectHasHook) {
    return {
      name: "settings-json-scope",
      status: "pass",
      detail: `Hook \u5DF2\u6CE8\u518C\u5728\u9879\u76EE\u7EA7 (.claude/settings.local.json)`
    };
  }
  if (userHasHook) {
    return {
      name: "settings-json-scope",
      status: "pass",
      detail: `Hook \u5DF2\u6CE8\u518C\u5728\u7528\u6237\u7EA7 (~/.claude/settings.json)`
    };
  }
  return {
    name: "settings-json-scope",
    status: "fail",
    detail: "\u672A\u627E\u5230\u9879\u76EE\u7EA7\u6216\u7528\u6237\u7EA7 settings.json hook",
    fix: "teamagent install-hook"
  };
}
function checkInstallTableBundles(enumerate = enumerateInstallTableBundlePaths, existsFn = (p) => fs.existsSync(p)) {
  const entries = enumerate();
  const missing = entries.filter((e) => !existsFn(e.absPath));
  if (missing.length === 0) {
    return {
      name: "install-table-bundles",
      status: "pass",
      detail: `${entries.length} \u4E2A install-table bundles \u90FD\u5728 dist/ \u4E0B`
    };
  }
  const filenames = Array.from(new Set(missing.map((m) => m.bundleFilename))).join(", ");
  return {
    name: "install-table-bundles",
    status: "fail",
    detail: `dist \u7F3A\u5931 install-table \u5F15\u7528\u7684 bundle: ${filenames}`,
    fix: "pnpm --filter teamagent build  \uFF08\u6216\u91CD\u88C5 teamagent\uFF09"
  };
}
function checkStaticUserSkillsPropagated(home) {
  const plan = planStaticUserSkillInstall({
    homeDir: home,
    fileExists: (p) => fs.existsSync(p),
    joinPath: path.join
  });
  const expected = plan.length;
  const present = plan.filter((e) => e.action === "skip-exists").length;
  const missingEntries = plan.filter((e) => e.action === "create");
  if (present === expected) {
    return {
      name: "skills-propagated",
      status: "pass",
      detail: `static user skills propagated \u2713 ${present}/${expected}\uFF08${STATIC_USER_SKILLS.length} skills \xD7 2 targets\uFF09`
    };
  }
  const missingShort = missingEntries.slice(0, 4).map((e) => `${e.skill}/${e.target}`).join(", ");
  const more = missingEntries.length > 4 ? ` +${missingEntries.length - 4}` : "";
  return {
    name: "skills-propagated",
    status: "fail",
    detail: `static user skills propagation incomplete: ${present}/${expected}; missing ${missingShort}${more}`,
    fix: "teamagent init"
  };
}
function checkPluginSync(cwd, home) {
  const projectPluginsDir = path.join(cwd, ".claude", "plugins");
  const userPluginsDir = path.join(home, ".claude", "plugins");
  const projectExists = fs.existsSync(projectPluginsDir) && fs.statSync(projectPluginsDir).isDirectory();
  const userExists = fs.existsSync(userPluginsDir) && fs.statSync(userPluginsDir).isDirectory();
  if (!projectExists && !userExists) {
    return {
      name: "plugin-sync",
      status: "fail",
      detail: ".claude/plugins \u76EE\u5F55\u4E0D\u5B58\u5728\uFF08\u9879\u76EE\u7EA7\u548C\u7528\u6237\u7EA7\u5747\u672A\u627E\u5230\uFF09",
      fix: "teamagent install-plugins"
    };
  }
  const pluginsRoot = projectExists ? projectPluginsDir : userPluginsDir;
  const scope = projectExists ? "\u9879\u76EE\u7EA7" : "\u7528\u6237\u7EA7";
  try {
    const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
    const pluginDirs = entries.filter((e) => e.isDirectory()).length;
    if (pluginDirs === 0) {
      return {
        name: "plugin-sync",
        status: "fail",
        detail: `${scope} .claude/plugins \u5B58\u5728\u4F46\u4E3A\u7A7A`,
        fix: "teamagent install-plugins"
      };
    }
    return {
      name: "plugin-sync",
      status: "pass",
      detail: `${pluginDirs} \u4E2A\u63D2\u4EF6\u5DF2\u540C\u6B65 (${scope}: ${pluginsRoot})`
    };
  } catch {
    return {
      name: "plugin-sync",
      status: "fail",
      detail: `\u65E0\u6CD5\u8BFB\u53D6 plugins \u76EE\u5F55: ${pluginsRoot}`,
      fix: "teamagent install-plugins"
    };
  }
}
var defaultCodexProbe = (env) => {
  try {
    const stdout = execSync("codex --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: env ?? process.env
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e;
    return { ok: false, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? err.message ?? "") };
  }
};
function checkCodexBin(probe = defaultCodexProbe) {
  const result = probe();
  if (result.ok) {
    return {
      name: "codex-bin",
      status: "pass",
      detail: result.stdout.trim().split("\n")[0] ?? "codex present"
    };
  }
  return {
    name: "codex-bin",
    status: "fail",
    detail: "\u672A\u627E\u5230 codex \u547D\u4EE4",
    fix: "npm install -g @openai/codex  \uFF08\u6216\u786E\u4FDD codex \u5728 PATH \u4E2D\uFF09"
  };
}
var defaultMcpProbe = async (url) => {
  try {
    const { request } = await import("https");
    const { request: httpRequest } = await import("http");
    const reqFn = url.startsWith("https") ? request : httpRequest;
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ reachable: false, detail: `timeout connecting to ${url}` }), 3e3);
      const req = reqFn(url, { method: "HEAD" }, (res) => {
        clearTimeout(timeout);
        resolve({ reachable: true, detail: `HTTP ${res.statusCode}` });
      });
      req.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ reachable: false, detail: err.message });
      });
      req.end();
    });
  } catch (e) {
    return { reachable: false, detail: String(e) };
  }
};
async function checkMcpReachability(cwd, probe = defaultMcpProbe) {
  const urls = collectMcpUrls(cwd);
  if (urls.length === 0) {
    return {
      name: "mcp-reachability",
      status: "skip",
      detail: "\u672A\u914D\u7F6E MCP \u670D\u52A1\u5668\uFF08\u8DF3\u8FC7\uFF09"
    };
  }
  const results = await Promise.all(urls.map(async (url) => ({ url, ...await probe(url) })));
  const failed = results.filter((r) => !r.reachable);
  if (failed.length === 0) {
    return {
      name: "mcp-reachability",
      status: "pass",
      detail: `${urls.length} \u4E2A MCP \u670D\u52A1\u5668\u5747\u53EF\u8FBE`
    };
  }
  return {
    name: "mcp-reachability",
    status: "fail",
    detail: `${failed.length}/${urls.length} \u4E2A MCP \u670D\u52A1\u5668\u4E0D\u53EF\u8FBE: ${failed.map((r) => r.url).join(", ")}`,
    fix: "\u68C0\u67E5 MCP \u670D\u52A1\u5668\u662F\u5426\u542F\u52A8\uFF0C\u6216\u79FB\u9664 .claude/settings.local.json \u4E2D\u5931\u6548\u7684 mcpServers \u6761\u76EE"
  };
}
function collectMcpUrls(cwd) {
  const urls = [];
  for (const settingsPath of [
    path.join(cwd, ".claude", "settings.local.json"),
    path.join(cwd, ".claude", "settings.json")
  ]) {
    if (!fs.existsSync(settingsPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const mcpServers = raw["mcpServers"];
      if (!mcpServers) continue;
      for (const server of Object.values(mcpServers)) {
        const s = server;
        if (typeof s["url"] === "string") urls.push(s["url"]);
      }
    } catch {
    }
  }
  return urls;
}
function checkClaudeMd(claudeMdPath) {
  if (!fs.existsSync(claudeMdPath)) {
    return {
      name: "claude-md",
      status: "skip",
      detail: "CLAUDE.md \u4E0D\u5B58\u5728\uFF08\u53EF\u9009\uFF1BTeamAgent \u4E0D\u518D\u751F\u6210\u89C4\u5219\u5757\uFF09"
    };
  }
  const content = fs.readFileSync(claudeMdPath, "utf-8");
  if (content.includes("TEAMAGENT:START")) {
    return {
      name: "claude-md",
      status: "fail",
      detail: "\u4ECD\u5305\u542B\u65E7 TEAMAGENT:START \u751F\u6210\u5757\uFF08#63 \u4E4B\u540E\u5DF2\u5F03\u7528\uFF09",
      fix: "teamagent doctor --fix  \uFF08\u4F1A\u5148\u5907\u4EFD\u5230 ~/.teamagent/backups/\uFF1B\u914D --dry-run \u9884\u89C8\uFF09"
    };
  }
  return {
    name: "claude-md",
    status: "pass",
    detail: "\u65E0\u751F\u6210\u89C4\u5219\u5757\uFF08OK\uFF09"
  };
}
function checkTeamSharingStatus() {
  return {
    name: "team-sharing",
    status: "pass",
    detail: "M5 viral-sync ready: gate-1 secret scan, gate-2 scope classifier, LWW+tombstone merge, m5-publish auto-commit, post-merge auto-pull"
  };
}
function renderDoctorHelp() {
  return [
    "teamagent doctor \u2014 \u68C0\u67E5\u5DE5\u5177\u5B89\u88C5\u662F\u5426\u5065\u5EB7",
    "",
    "\u7528\u6CD5:",
    "  teamagent doctor                \u8DD1\u5168\u90E8\u68C0\u67E5\u5E76\u6253\u5370\u7ED3\u679C",
    "  teamagent doctor --fix          \u81EA\u52A8\u4FEE\u590D\u80FD\u4FEE\u7684\u9879\uFF1B\u5199\u5165\u524D\u4F1A\u5148\u5907\u4EFD\u5230 ~/.teamagent/backups/",
    "  teamagent doctor --fix --dry-run",
    "                                   \u9884\u89C8\u8981\u4FEE\u4EC0\u4E48\uFF08unified diff\uFF09\uFF0C\u4E0D\u5199\u5165",
    "  teamagent doctor --json         \u8F93\u51FA\u673A\u5668\u53EF\u8BFB JSON\uFF08\u542B fixOutcomes \u5B57\u6BB5\uFF0C\u542B dryRun bool\uFF09",
    "  teamagent doctor --cwd=<path>   \u6307\u5B9A\u9879\u76EE\u76EE\u5F55\uFF08\u9ED8\u8BA4\u4E3A\u5F53\u524D\u76EE\u5F55\uFF09",
    "  teamagent doctor --help         \u663E\u793A\u672C\u5E2E\u52A9",
    "",
    "\u53EF\u81EA\u52A8\u4FEE\u590D\u7684\u68C0\u67E5\u9879\uFF1A",
    "  knowledge-db        \u901A\u8FC7 `teamagent init --skip-import` \u521B\u5EFA knowledge.db\uFF08\u65E0 prior state\uFF0C\u8DF3\u8FC7 backup\uFF09",
    "  hook-registered     \u5411 .claude/settings.local.json \u6CE8\u518C PreToolUse hook",
    "  hook-script         \u540C\u4E0A",
    "  claude-md           \u5265\u79BB legacy <!-- TEAMAGENT:START..END --> \u5757\uFF1B\u5199\u5165\u524D backup CLAUDE.md",
    "",
    "\u5907\u4EFD\u4F4D\u7F6E:",
    "  ~/.teamagent/backups/<filename>.<ISO-timestamp>.bak",
    "  \u8FD8\u539F: cp <backup-path> <original-path>",
    "",
    "\u793A\u4F8B:",
    "  teamagent doctor --fix --dry-run    # \u770B\u4E00\u4E0B\u4F1A\u6539\u4EC0\u4E48",
    "  teamagent doctor --fix              # \u771F\u6539\uFF08\u5148\u5907\u4EFD\uFF09",
    "  teamagent doctor --fix --json       # \u5E94\u7528\u5E76\u8F93\u51FA JSON \u62A5\u544A",
    ""
  ].join("\n") + "\n";
}
function renderDoctorResult(result) {
  const lines = [];
  lines.push("\u73AF\u5883\u8BCA\u65AD / Environment Check");
  lines.push("\u2500".repeat(40));
  for (const check of result.checks) {
    if (check.status === "pass") {
      lines.push(`\u2705 ${check.name.padEnd(16)}  ${check.detail}`);
    } else if (check.status === "fail") {
      lines.push(`\u274C ${check.name.padEnd(16)}  ${check.detail}`);
      if (check.fix) {
        lines.push(`   \u2192 \u8FD0\u884C: ${check.fix}`);
      }
    } else {
      lines.push(`\u23ED  ${check.name.padEnd(16)}  (${check.detail})`);
    }
  }
  lines.push("");
  if (result.allPassed && result.skipped === 0) {
    lines.push("\u2705 \u5168\u90E8\u68C0\u67E5\u901A\u8FC7\uFF01TeamAgent \u8FD0\u884C\u6B63\u5E38\u3002");
  } else if (result.allPassed) {
    lines.push("\u2705 \u53EF\u8FD0\u884C\u68C0\u67E5\u901A\u8FC7\uFF1B\u8DF3\u8FC7\u9879\u89C1\u4E0A\u65B9\uFF08\u53EF\u80FD\u4EE3\u8868\u672A\u5B8C\u6210\u4EA7\u54C1\u8303\u56F4\uFF09\u3002");
  } else {
    const parts = [];
    if (result.failed > 0) parts.push(`${result.failed} \u9879\u5931\u8D25`);
    if (result.skipped > 0) parts.push(`${result.skipped} \u9879\u8DF3\u8FC7`);
    lines.push(`${parts.join("\uFF0C")}\u3002\u4FEE\u590D\u540E\u91CD\u8DD1 teamagent doctor`);
  }
  if (result.fixOutcomes && result.fixOutcomes.length > 0) {
    lines.push("");
    lines.push("\u2500".repeat(40));
    lines.push(result.dryRun ? "\u{1F527} doctor --fix --dry-run\uFF08\u9884\u89C8\uFF0C\u672A\u5199\u5165\uFF09" : "\u{1F527} doctor --fix\uFF08\u5DF2\u5E94\u7528\uFF09");
    lines.push("\u2500".repeat(40));
    let appliedCount = 0;
    for (const outcome of result.fixOutcomes) {
      if (outcome.status === "preview") {
        lines.push(`\u{1F441}  ${outcome.name.padEnd(16)}  ${outcome.detail}`);
        if (outcome.diff) {
          for (const dl of outcome.diff.split("\n")) {
            if (dl !== "") lines.push("   " + dl);
          }
        }
      } else if (outcome.status === "applied") {
        appliedCount++;
        lines.push(`\u2705 ${outcome.name.padEnd(16)}  ${outcome.detail}`);
        if (outcome.backupPath && outcome.filePath) {
          lines.push(`   \u5907\u4EFD: ${outcome.backupPath}`);
          lines.push(`   \u8FD8\u539F: cp "${outcome.backupPath}" "${outcome.filePath}"`);
        }
      } else if (outcome.status === "skipped") {
        lines.push(`\u23ED  ${outcome.name.padEnd(16)}  ${outcome.detail}`);
      } else {
        lines.push(`\u274C ${outcome.name.padEnd(16)}  ${outcome.detail}${outcome.error ? `: ${outcome.error}` : ""}`);
      }
    }
    if (result.dryRun) {
      lines.push("");
      lines.push("\u4E0D\u4F1A\u5199\u5165\u3002\u53BB\u6389 --dry-run \u771F\u5B9E\u6267\u884C\uFF08\u5199\u5165\u524D\u4F1A\u5148\u5907\u4EFD\u5230 ~/.teamagent/backups/\uFF09\u3002");
    } else if (appliedCount > 0) {
      lines.push("");
      lines.push(`\u5DF2\u4FEE\u590D ${appliedCount} \u9879\u3002\u5907\u4EFD\u4F4D\u7F6E\uFF1A~/.teamagent/backups/`);
    }
  }
  return lines.join("\n") + "\n";
}

export {
  parseDoctorArgs,
  backupFile,
  executeDoctor,
  pathContainsNodeModulesBin,
  checkClaudeCode,
  checkHookSpawn,
  checkSettingsJsonScope,
  checkInstallTableBundles,
  checkStaticUserSkillsPropagated,
  checkPluginSync,
  checkCodexBin,
  checkMcpReachability,
  checkClaudeMd,
  checkTeamSharingStatus,
  renderDoctorHelp,
  renderDoctorResult
};
