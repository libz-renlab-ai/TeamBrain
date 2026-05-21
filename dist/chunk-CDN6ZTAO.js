import {
  loadBundledChangelog
} from "./chunk-MCAKDVT7.js";
import {
  probeNodeSqlite
} from "./chunk-2LMMULPZ.js";
import {
  auditOrphanShellHooks,
  installHook
} from "./chunk-NBY7IFQJ.js";
import {
  executeInstallPlugins
} from "./chunk-3OL7Q76U.js";
import {
  ClaudeCodeLLMClient,
  makeSkillCompiler
} from "./chunk-NPSW37EI.js";
import {
  DualLayerStore,
  SqliteKnowledgeStore
} from "./chunk-MXJDRQEB.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  DEFAULT_IMPORT_CONFIDENCE,
  OBSERVED_FILE_LIST,
  detectStack,
  diffPackRequest,
  duckifyText,
  entryHasPackTag,
  extractCursorRules,
  extractRuleBullets,
  getMetaPrinciples,
  packTag,
  parseChangelog,
  parsePackMeta,
  planStaticUserSkillInstall,
  renderPackPromptBody,
  renderWhatsNewTail,
  runCompile,
  structureRuleTextsBatch
} from "./chunk-4Y7LCJVR.js";
import {
  computeEnforcement
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/init.ts
init_esm_shims();
import fs5 from "fs";
import path5 from "path";
import os3 from "os";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createRequire } from "module";

// ../cli/src/commands/pack.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
function resolvePacksDir(explicit) {
  if (explicit) return explicit;
  const envPath = process.env["TEAMAGENT_PACKS_DIR"];
  if (envPath) return envPath;
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    const bundled = path.join(dir, "dist", "seed", "packs");
    if (fs.existsSync(bundled)) return bundled;
    const dev = path.join(dir, "packages", "teamagent", "seed", "packs");
    if (fs.existsSync(dev)) return dev;
    const sibling = path.join(dir, "..", "teamagent", "seed", "packs");
    if (fs.existsSync(sibling)) return sibling;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
function resolveUserGlobalDb(opts) {
  if (opts.userGlobalDbPath) return opts.userGlobalDbPath;
  const home = opts.homeDir ?? os.homedir();
  return path.join(home, ".teamagent", "global.db");
}
function readPackRegistry(packsDir) {
  if (!fs.existsSync(packsDir) || !fs.statSync(packsDir).isDirectory()) {
    return [];
  }
  const entries = fs.readdirSync(packsDir);
  const metas = [];
  for (const f of entries) {
    if (!f.endsWith(".meta.json")) continue;
    const full = path.join(packsDir, f);
    try {
      const text = fs.readFileSync(full, "utf-8");
      metas.push(parsePackMeta(text));
    } catch (err) {
      process.stderr.write(
        `[pack] skip malformed meta ${f}: ${String(err).slice(0, 200)}
`
      );
    }
  }
  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}
function readPackRules(packsDir, name) {
  const file = path.join(packsDir, `${name}.jsonl`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `pack rule file missing: ${file} (registry meta is present but the jsonl is not \u2014 packaging / registry mismatch)`
    );
  }
  const text = fs.readFileSync(file, "utf-8");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}
function findInstalledPackNamesFromStore(store) {
  const all = store.getAll();
  const names = /* @__PURE__ */ new Set();
  for (const e of all) {
    for (const t of e.tags ?? []) {
      if (t.startsWith("pack:")) names.add(t.slice("pack:".length));
    }
  }
  return [...names].sort();
}
function orphanMetaStub(name) {
  return {
    name,
    description: "(metadata unavailable \u2014 pack rules are installed but the registry has no matching meta.json)",
    tags: [],
    file_hints: [],
    prompt_version: 1
  };
}
function executePackList(opts = {}) {
  const packsDir = resolvePacksDir(opts.packsDir);
  const dbPath = resolveUserGlobalDb(opts);
  const available = packsDir ? readPackRegistry(packsDir) : [];
  let installed = [];
  if (fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(dbPath));
    try {
      const names = findInstalledPackNamesFromStore(store);
      installed = names.map((name) => {
        const meta = available.find((m) => m.name === name);
        return meta ?? orphanMetaStub(name);
      });
    } finally {
      store.close();
    }
  }
  return { installed, available, packsDir: packsDir ?? null };
}
function executePackAdd(names, opts = {}) {
  const packsDir = resolvePacksDir(opts.packsDir);
  const dbPath = resolveUserGlobalDb(opts);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const available = packsDir ? readPackRegistry(packsDir) : [];
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  const added = [];
  const failed = [];
  try {
    const installedNames = findInstalledPackNamesFromStore(store);
    const diff = diffPackRequest({
      requested: names,
      available: available.map((m) => m.name),
      installed: installedNames
    });
    for (const name of diff.toAdd) {
      try {
        if (!packsDir) {
          throw new Error(
            "no packs registry resolved (set TEAMAGENT_PACKS_DIR or ensure seed/packs/ exists)"
          );
        }
        const rules = readPackRules(packsDir, name);
        let inserted = 0;
        for (const r of rules) {
          if (store.getById(r.id)) continue;
          const tag = packTag(name);
          const tags = r.tags?.includes(tag) ? r.tags : [...r.tags ?? [], tag];
          try {
            store.add({ ...r, tags });
            inserted++;
          } catch (err) {
            failed.push({ name, error: String(err).slice(0, 200) });
          }
        }
        added.push({ name, rules: inserted });
      } catch (err) {
        failed.push({ name, error: String(err).slice(0, 200) });
      }
    }
    return {
      added,
      alreadyInstalled: diff.alreadyInstalled,
      notFound: diff.notFound,
      failed
    };
  } finally {
    store.close();
  }
}
function executePackRemove(names, opts = {}) {
  const dbPath = resolveUserGlobalDb(opts);
  if (!fs.existsSync(dbPath)) {
    return { removed: [], notInstalled: [...new Set(names)] };
  }
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  const removed = [];
  const notInstalled = [];
  try {
    const all = store.getAll();
    const seen = /* @__PURE__ */ new Set();
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const matching = all.filter((e) => entryHasPackTag(e, name));
      if (matching.length === 0) {
        notInstalled.push(name);
        continue;
      }
      for (const m of matching) {
        store.delete(m.id);
      }
      removed.push({ name, rules: matching.length });
    }
    return { removed, notInstalled };
  } finally {
    store.close();
  }
}
function parsePackArgs(argv) {
  if (argv.length === 0) {
    throw new Error(
      "Usage: teamagent pack <list|add|remove> [names] [--json]\n  pack list [--json]\n  pack add <names>      e.g. pack add frontend-js,ops-safety\n  pack remove <names>"
    );
  }
  const sub = argv[0];
  if (sub !== "list" && sub !== "add" && sub !== "remove") {
    throw new Error(`\u672A\u77E5\u5B50\u547D\u4EE4: ${sub}. \u53EF\u7528: list / add / remove`);
  }
  let json = false;
  const names = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      json = true;
      continue;
    }
    for (const part of a.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) names.push(trimmed);
    }
  }
  if ((sub === "add" || sub === "remove") && names.length === 0) {
    throw new Error(`pack ${sub} \u9700\u8981\u81F3\u5C11\u4E00\u4E2A pack \u540D\uFF08\u9017\u53F7\u6216\u7A7A\u683C\u5206\u9694\uFF09`);
  }
  return { sub, names, json };
}
function renderPackList(result, json) {
  if (json) {
    return JSON.stringify(
      {
        installed: result.installed,
        available: result.available,
        packs_dir: result.packsDir
      },
      null,
      2
    ) + "\n";
  }
  const lines = [];
  if (result.installed.length === 0) {
    lines.push("Installed packs: (none)");
  } else {
    lines.push(`Installed packs (${result.installed.length}):`);
    for (const p of result.installed) {
      lines.push(`  - ${p.name} [${p.tags.join(", ")}] \u2014 ${p.description}`);
    }
  }
  lines.push("");
  if (result.available.length === 0) {
    lines.push("Available packs: (no packs shipped in this teamagent build)");
  } else {
    lines.push(`Available packs (${result.available.length}):`);
    for (const p of result.available) {
      lines.push(`  - ${p.name} [${p.tags.join(", ")}] \u2014 ${p.description}`);
    }
  }
  return lines.join("\n") + "\n";
}
function renderPackAdd(result) {
  const lines = [];
  if (result.added.length > 0) {
    const totalRules = result.added.reduce((s, a) => s + a.rules, 0);
    lines.push(
      `\u2705 Installed ${result.added.length} pack${result.added.length === 1 ? "" : "s"} (${totalRules} rule${totalRules === 1 ? "" : "s"} added)`
    );
    for (const a of result.added) {
      lines.push(`   \u2022 ${a.name}: ${a.rules} rule${a.rules === 1 ? "" : "s"}`);
    }
  }
  if (result.alreadyInstalled.length > 0) {
    lines.push(
      `\u21BA Already installed: ${result.alreadyInstalled.join(", ")}`
    );
  }
  if (result.notFound.length > 0) {
    lines.push(`\u274C Unknown pack: ${result.notFound.join(", ")}`);
    lines.push("   Run `teamagent pack list` to see available packs.");
  }
  if (result.failed.length > 0) {
    lines.push(`\u26A0  Failed: ${result.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`);
  }
  if (lines.length === 0) lines.push("(nothing to do)");
  return lines.join("\n") + "\n";
}
function renderPackRemove(result) {
  const lines = [];
  if (result.removed.length > 0) {
    for (const r of result.removed) {
      lines.push(`\u2705 Removed pack "${r.name}" (${r.rules} rule${r.rules === 1 ? "" : "s"} deleted)`);
    }
  }
  if (result.notInstalled.length > 0) {
    lines.push(`\u21BA Not installed: ${result.notInstalled.join(", ")}`);
  }
  if (lines.length === 0) lines.push("(nothing to do)");
  return lines.join("\n") + "\n";
}
function packAddExitCode(result) {
  if (result.notFound.length > 0) return 1;
  if (result.failed.length > 0) return 1;
  return 0;
}

// ../cli/src/commands/required-check.ts
init_esm_shims();
import * as fs2 from "fs";
import * as path2 from "path";
var REQUIRED_JSON_SCHEMA = "teamagent.required.v1";
var REQUIRED_JSON_MODE = "required";
function executeRequiredCheck(opts = {}) {
  const projectRoot = opts.projectRoot ?? process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const configPath = path2.join(projectRoot, ".teamagent", "required.json");
  let raw;
  try {
    raw = fs2.readFileSync(configPath, "utf8");
  } catch {
    return {
      status: "config-missing",
      exitCode: 2,
      configPath,
      reason: `.teamagent/required.json missing \u2014 run \`teamagent init .\` in this repo`
    };
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    return {
      status: "config-malformed",
      exitCode: 2,
      configPath,
      reason: `.teamagent/required.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  if (!isPlainObject(cfg)) {
    return {
      status: "config-malformed",
      exitCode: 2,
      configPath,
      reason: ".teamagent/required.json must be a JSON object"
    };
  }
  const schema = typeof cfg["schema"] === "string" ? cfg["schema"] : void 0;
  const mode = typeof cfg["mode"] === "string" ? cfg["mode"] : void 0;
  if (schema !== REQUIRED_JSON_SCHEMA) {
    return {
      status: "schema-unsupported",
      exitCode: 3,
      configPath,
      ...schema !== void 0 ? { schema } : {},
      ...mode !== void 0 ? { mode } : {},
      reason: `unsupported schema: ${schema ?? "(missing)"} (expected ${REQUIRED_JSON_SCHEMA})`
    };
  }
  if (mode !== REQUIRED_JSON_MODE) {
    return {
      status: "schema-unsupported",
      exitCode: 3,
      configPath,
      schema,
      ...mode !== void 0 ? { mode } : {},
      reason: `unsupported mode: ${mode ?? "(missing)"} (expected ${REQUIRED_JSON_MODE})`
    };
  }
  return {
    status: "ok",
    exitCode: 0,
    configPath,
    schema,
    mode
  };
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function parseRequiredCheckArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--project") {
      const v = args[++i];
      if (v !== void 0) opts.projectRoot = v;
      continue;
    }
    if (a.startsWith("--project=")) {
      opts.projectRoot = a.slice("--project=".length);
      continue;
    }
  }
  return opts;
}
function renderRequiredCheckResult(r, json) {
  if (json) {
    return JSON.stringify(r);
  }
  if (r.status === "ok") {
    return `[required-check] ok \xB7 schema=${r.schema} \xB7 mode=${r.mode}`;
  }
  return `[required-check] ${r.status}: ${r.reason ?? "(no reason)"}`;
}
var REQUIRED_JSON_CONTENT = {
  schema: REQUIRED_JSON_SCHEMA,
  mode: REQUIRED_JSON_MODE,
  scope: "claude-assisted-work",
  binary: "teamagent",
  check: {
    installed: "command -v teamagent",
    required: 'teamagent required-check --project "$CLAUDE_PROJECT_DIR"'
  },
  remediation: {
    installOrUpdate: "npm install -g github:libz-renlab-ai/TeamBrain#release",
    restart: "Restart Claude after installing or updating TeamAgent."
  }
};
var CHECK_TEAMAGENT_SH_CONTENT = `#!/usr/bin/env bash
set -euo pipefail

INSTALL_OR_UPDATE_CMD='npm install -g github:libz-renlab-ai/TeamBrain#release'
PROJECT_DIR="\${CLAUDE_PROJECT_DIR:-$(pwd)}"

deny() {
  local reason="$1"

  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TeamAgent is required for Claude-assisted work in this repository. \${reason} Install or update TeamAgent, then restart Claude. Command: \${INSTALL_OR_UPDATE_CMD}"
  }
}
JSON

  exit 0
}

if ! command -v teamagent >/dev/null 2>&1; then
  deny "TeamAgent is not installed."
fi

if ! teamagent required-check --project "$PROJECT_DIR" >/dev/null 2>&1; then
  deny "TeamAgent is missing, stale, unhealthy, or not current for this repository."
fi

exit 0
`;

// ../cli/src/lib/walk-up.ts
init_esm_shims();
import * as fs4 from "fs";
import * as os2 from "os";
import * as path4 from "path";

// ../cli/src/lib/project-markers.ts
init_esm_shims();
import * as fs3 from "fs";
import * as path3 from "path";
var PROJECT_MARKERS = [
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
  // TeamAgent-managed marker. `teamagent init` writes
  // `<dir>/.teamagent/.project-root` on first run so docs-only projects
  // (no .git, no package.json) are still discoverable by walk-up.
  path3.join(".teamagent", ".project-root")
];
function hasProjectMarker(dir) {
  for (const m of PROJECT_MARKERS) {
    if (fs3.existsSync(path3.join(dir, m))) return true;
  }
  return false;
}

// ../cli/src/lib/walk-up.ts
function findTeamagentRoot(start, opts) {
  const homeDir = opts?.homeDir ?? os2.homedir();
  let cur = path4.resolve(start);
  while (true) {
    const candidate = path4.join(cur, ".teamagent", "knowledge.db");
    try {
      if (fs4.lstatSync(candidate).isFile() && hasProjectMarker(cur)) return cur;
    } catch (err) {
      const code = err?.code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") {
      } else {
        process.stderr.write(
          `teamagent walk-up: ${code ?? String(err)} at ${candidate}; aborting walk
`
        );
        return null;
      }
    }
    if (cur === homeDir) return null;
    const parent = path4.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

// ../cli/src/commands/init.ts
var CLAIM_TO_MERGE_SKILL_ID = "claim-to-merge";
var MIRROR_CLAIM_STEP = `mirror-${CLAIM_TO_MERGE_SKILL_ID}-skill`;
var STATIC_USER_SKILLS_STEP = "mirror-static-user-skills";
var FIXEDFLOW_BANNER_DOC_PATHS = [
  `.claude/skills/${CLAIM_TO_MERGE_SKILL_ID}/SKILL.md`,
  "docs/FIXEDFLOW.md",
  "docs/PR-PLAN.md",
  "docs/POSTPR.md"
];
function resolvePaths(opts) {
  const home = opts.homeDir ?? os3.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    home,
    cwd,
    projectDbPath: opts.projectDbPath ?? path5.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path5.join(home, ".teamagent", "global.db"),
    claudeMdPath: opts.claudeMdPath ?? path5.join(cwd, "CLAUDE.md"),
    agentsMdPath: opts.agentsMdPath ?? path5.join(cwd, "AGENTS.md"),
    skillsDir: opts.skillsDir ?? process.env["TEAMAGENT_SKILLS_DIR"] ?? path5.join(home, ".claude", "skills", "teamagent"),
    installLogPath: path5.join(home, ".teamagent", ".install-log")
  };
}
function targetIncludesClaude(target) {
  return target === "claude" || target === "both";
}
function targetIncludesCodex(target) {
  return target === "codex" || target === "both";
}
function cwdFilePresence(cwd) {
  return {
    exists: (rel) => fs5.existsSync(path5.join(cwd, rel)),
    read: (rel) => {
      const full = path5.join(cwd, rel);
      try {
        return fs5.statSync(full).isFile() ? fs5.readFileSync(full, "utf-8") : void 0;
      } catch {
        return void 0;
      }
    }
  };
}
async function executeInit(opts = {}) {
  const paths = resolvePaths(opts);
  const dryRun = opts.dryRun ?? false;
  const target = opts.target ?? "claude";
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const steps = [];
  if (!opts.force) {
    const ancestor = findTeamagentRoot(paths.cwd, { homeDir: paths.home });
    if (ancestor !== null && ancestor !== paths.cwd) {
      const failedStep = {
        step: "nested-init-guard",
        status: "failed",
        detail: `detected ancestor TeamAgent project at ${ancestor}; refusing to create duplicate .teamagent/ in ${paths.cwd} \u2014 cd to the project root or use --force-nested-init to override.`
      };
      return finalize(false, dryRun, [failedStep], emptySummary());
    }
  }
  const preCheck = runPreChecks(
    paths,
    target,
    opts.structure ?? false,
    opts.nodeSqliteProbe
  );
  steps.push(preCheck);
  if (preCheck.status === "failed") {
    return finalize(false, dryRun, steps, emptySummary());
  }
  const stackStep = doDetectStack(paths.cwd);
  steps.push(stackStep);
  const stackSummary = stackStep.detail;
  steps.push(doCreateDirs(paths, dryRun));
  const presetStep = doLoadPresets(paths.userGlobalDbPath, dryRun, now);
  steps.push(presetStep.step);
  const seedStep = opts.skipSeed ? { step: { step: "load-seed", status: "skipped", detail: "skipSeed=true" }, addedCount: 0, wouldAddCount: 0 } : doLoadSeed(paths.userGlobalDbPath, dryRun, opts.seedPath);
  steps.push(seedStep.step);
  const importStep = await doImportRules(paths, opts, dryRun, now);
  steps.push(...importStep.steps);
  if (targetIncludesClaude(target) && !opts.skipHook) {
    steps.push(
      doInstallHook(paths.cwd, opts.hookEntry, dryRun, opts.userLevelHook ?? true)
    );
    steps.push(doAuditOrphanShellHooks(paths.cwd, dryRun));
  } else if (!targetIncludesClaude(target) && !targetIncludesCodex(target)) {
    steps.push({ step: "install-hook", status: "skipped", detail: "skipHook=true" });
  } else if (!targetIncludesClaude(target)) {
    steps.push({ step: "install-hook", status: "skipped", detail: "target=codex\uFF1BClaude PreToolUse hook \u4E0D\u6CE8\u518C" });
  } else if (opts.skipHook) {
    steps.push({ step: "install-hook", status: "skipped", detail: "skipHook=true" });
  }
  if (targetIncludesCodex(target) && !opts.skipHook) {
    steps.push(doInstallCodexHooks(paths, dryRun));
  }
  if (targetIncludesClaude(target)) {
    steps.push(doWriteRequiredArtifacts(paths.cwd, dryRun));
  }
  if (opts.installPlugins) {
    steps.push(await doInstallPlugins(dryRun, opts.pluginInstaller));
  }
  steps.push(await doCompileSkills(paths, dryRun));
  if (targetIncludesClaude(target)) {
    steps.push(doMirrorClaimToMergeSkill(paths, dryRun));
  }
  if (targetIncludesCodex(target)) {
    steps.push(doLinkCodexFiles(paths, dryRun));
  }
  steps.push(doMirrorStaticUserSkills(paths, target, dryRun));
  const skipWarmup = opts.skipWarmup === true || dryRun || process.env["NODE_ENV"] === "test" || process.env["TEAMAGENT_SKIP_WARMUP"] === "1";
  const haveVectorOptionals = (() => {
    try {
      const here = fileURLToPath2(import.meta.url);
      let dir = path5.dirname(here);
      for (let i = 0; i < 8; i++) {
        const hasXenova = fs5.existsSync(path5.join(dir, "node_modules", "@xenova", "transformers", "package.json")) || fs5.existsSync(path5.join(dir, "..", "@xenova", "transformers", "package.json"));
        const hasOnnx = fs5.existsSync(path5.join(dir, "node_modules", "onnxruntime-node", "package.json")) || fs5.existsSync(path5.join(dir, "..", "onnxruntime-node", "package.json"));
        if (hasXenova && hasOnnx) {
          return true;
        }
        const parent = path5.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      try {
        const req = createRequire(here);
        const home = os3.homedir();
        const pkgRoot = (() => {
          let cur = path5.dirname(here);
          for (let i = 0; i < 16; i++) {
            if (fs5.existsSync(path5.join(cur, "package.json"))) return cur;
            const parent = path5.dirname(cur);
            if (parent === cur) return path5.dirname(here);
            cur = parent;
          }
          return path5.dirname(here);
        })();
        const knownRoots = [
          pkgRoot,
          path5.join(home, ".local", "share", "pnpm"),
          path5.join(home, ".npm-global"),
          path5.join(home, ".pnpm-global")
        ];
        const isUnderKnownRoot = (resolved) => knownRoots.some((root) => resolved.startsWith(root + path5.sep) || resolved === root);
        let rxResolved;
        try {
          rxResolved = req.resolve("@xenova/transformers/package.json");
        } catch {
        }
        let onnxResolved;
        try {
          onnxResolved = req.resolve("onnxruntime-node/package.json");
        } catch {
        }
        if (rxResolved && onnxResolved && isUnderKnownRoot(rxResolved) && isUnderKnownRoot(onnxResolved)) {
          return true;
        }
      } catch {
      }
      return false;
    } catch {
      return false;
    }
  })();
  if (skipWarmup) {
    steps.push({ step: "warmup", status: "skipped", detail: "skipWarmup / dryRun / test env" });
  } else if (!haveVectorOptionals) {
    steps.push({
      step: "warmup",
      status: "skipped",
      detail: "vector deps \u672A\u5728 node_modules \u4E2D\u627E\u5230 (issue #164 / PR #227 \u8D77\u9ED8\u8BA4\u8FDB dependencies); \u91CD\u88C5 teamagent \u6062\u590D"
    });
  } else {
    const useForegroundWarmup = process.env["TEAMAGENT_FOREGROUND_WARMUP"] === "1";
    if (useForegroundWarmup) {
      try {
        const { runWarmup } = await import("./warmup-BG43KCQI.js");
        const { defaultWarmupStatePath } = await import("./warmup-state-4E7RVQWL.js");
        const stateFile = defaultWarmupStatePath(paths.home);
        const w = await runWarmup({ stateFilePath: stateFile });
        steps.push({
          step: "warmup",
          status: w.ok ? "ok" : "failed",
          detail: w.ok ? `\u6A21\u578B\u9884\u70ED ${w.durationMs}ms (foreground; TEAMAGENT_FOREGROUND_WARMUP=1)` : `\u9884\u70ED\u5931\u8D25\uFF1A${w.error ?? "unknown"}`
        });
      } catch (err) {
        steps.push({
          step: "warmup",
          status: "failed",
          detail: `\u9884\u70ED\u5F02\u5E38\uFF1A${String(err).slice(0, 120)}`
        });
      }
    } else {
      const detachResult = await spawnDetachedWarmup(paths.home);
      steps.push({
        step: "warmup",
        status: detachResult.ok ? "ok" : "failed",
        detail: detachResult.detail
      });
    }
  }
  let packPrompt = "";
  const packsDir = resolvePacksDir(opts.packsDir);
  const observed = collectObservedFiles(paths.cwd);
  const available = packsDir ? readPackRegistry(packsDir) : [];
  let packAddedRules = 0;
  if (opts.pack && opts.pack.trim().length > 0) {
    const requested = opts.pack.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (dryRun) {
      steps.push(
        okStep(
          "load-pack",
          `(dry-run) \u4F1A\u5B89\u88C5 packs: ${requested.join(", ")}`
        )
      );
    } else {
      try {
        const result = executePackAdd(requested, {
          ...opts.packsDir ? { packsDir: opts.packsDir } : {},
          userGlobalDbPath: paths.userGlobalDbPath
        });
        const parts = [];
        if (result.added.length > 0) {
          packAddedRules = result.added.reduce((s, a) => s + a.rules, 0);
          parts.push(`\u5B89\u88C5 ${result.added.length} \u4E2A pack\uFF08${packAddedRules} \u6761\u89C4\u5219\uFF09`);
        }
        if (result.alreadyInstalled.length > 0) {
          parts.push(`\u5DF2\u5B58\u5728: ${result.alreadyInstalled.join(", ")}`);
        }
        if (result.notFound.length > 0) {
          parts.push(`\u672A\u627E\u5230: ${result.notFound.join(", ")}`);
        }
        if (result.failed.length > 0) {
          parts.push(`\u5931\u8D25: ${result.failed.length}`);
        }
        const status = result.notFound.length > 0 || result.failed.length > 0 ? "failed" : "ok";
        steps.push({
          step: "load-pack",
          status,
          detail: parts.join("\uFF0C") || "\u65E0\u4E8B\u53EF\u505A"
        });
      } catch (err) {
        steps.push(failStep("load-pack", String(err).slice(0, 200)));
      }
    }
  } else if (!dryRun) {
    if (available.length === 0) {
      packPrompt = "";
      steps.push(
        okStep(
          "pack-prompt",
          "\u2139\uFE0F  \u6682\u65E0 stack packs \u53EF\u7528\uFF08teamagent pack list \u67E5\u770B\uFF09"
        )
      );
    } else {
      const installedNames = collectInstalledPackNames(
        paths.userGlobalDbPath,
        available
      );
      packPrompt = renderPackPromptBody({
        observed,
        available,
        installed: installedNames
      });
      steps.push(
        okStep(
          "pack-prompt",
          `\u5DF2\u751F\u6210 v1 markdown prompt\uFF08${available.length} \u4E2A\u53EF\u7528 pack\uFF09`
        )
      );
    }
  } else {
    steps.push(
      okStep(
        "pack-prompt",
        `(dry-run) \u4F1A\u6E32\u67D3 v1 prompt\uFF08${available.length} \u4E2A pack\uFF09`
      )
    );
  }
  if (!dryRun) {
    try {
      appendInstallLog(paths.installLogPath, steps, now);
    } catch {
    }
  }
  let totalActive = 0;
  if (dryRun) {
    totalActive = presetStep.wouldAddCount + seedStep.wouldAddCount + importStep.wouldImport + packAddedRules;
  } else {
    try {
      fs5.mkdirSync(path5.dirname(paths.projectDbPath), { recursive: true });
      fs5.mkdirSync(path5.dirname(paths.userGlobalDbPath), { recursive: true });
      const store = new DualLayerStore({
        projectDbPath: paths.projectDbPath,
        userGlobalDbPath: paths.userGlobalDbPath
      });
      totalActive = store.findActive().length;
      store.close();
    } catch {
    }
  }
  const summary = {
    stack: stackSummary,
    presetAdded: presetStep.addedCount,
    seedAdded: seedStep.addedCount,
    importedRules: importStep.importedCount,
    totalActiveEntries: totalActive
  };
  const ok = !steps.some((s) => s.status === "failed");
  return finalize(ok, dryRun, steps, summary, packPrompt);
}
function collectObservedFiles(cwd) {
  const out = {};
  for (const f of OBSERVED_FILE_LIST) {
    out[f] = fs5.existsSync(path5.join(cwd, f));
  }
  return out;
}
function collectInstalledPackNames(userGlobalDbPath, available) {
  if (!fs5.existsSync(userGlobalDbPath)) return [];
  try {
    const store = new SqliteKnowledgeStore(openDb(userGlobalDbPath));
    try {
      const all = store.getAll();
      const names = [];
      for (const meta of available) {
        const tag = `pack:${meta.name}`;
        if (all.some((e) => e.tags?.includes(tag))) names.push(meta.name);
      }
      return names.sort();
    } finally {
      store.close();
    }
  } catch {
    return [];
  }
}
function runPreChecks(paths, target, checkRuleFiles, nodeSqliteProbe = probeNodeSqlite) {
  if (!fs5.existsSync(paths.cwd)) {
    return failStep("pre-check", `\u9879\u76EE\u76EE\u5F55\u4E0D\u5B58\u5728: ${paths.cwd}`);
  }
  const sqliteProbe = nodeSqliteProbe();
  if (!sqliteProbe.ok) {
    return failStep(
      "pre-check",
      `${sqliteProbe.detail} \u2014 \u6240\u6709 hook \u5C06 DOA\uFF0Cinit \u4E2D\u6B62\u3002\u8BF7\u5347\u7EA7\u5230 Node >= 22.5 \u540E\u91CD\u8BD5\uFF0C\u6216\u8FD0\u884C \`teamagent doctor\` \u67E5\u770B\u4FEE\u590D\u5EFA\u8BAE\uFF08clean-uninstall \u6B65\u9AA4\u89C1 docs/CLEAN-UNINSTALL.md\uFF09\u3002`
    );
  }
  try {
    const tDir = path5.join(paths.home, ".teamagent");
    fs5.mkdirSync(tDir, { recursive: true });
    const probe = path5.join(tDir, `.probe-${process.pid}`);
    fs5.writeFileSync(probe, "");
    fs5.unlinkSync(probe);
  } catch {
    return failStep("pre-check", "\u65E0\u6CD5\u521B\u5EFA ~/.teamagent \u76EE\u5F55\uFF0C\u8BF7\u68C0\u67E5\u78C1\u76D8\u6743\u9650");
  }
  if (checkRuleFiles) {
    const mdPaths = [];
    if (targetIncludesClaude(target) || targetIncludesCodex(target)) {
      mdPaths.push({ path: paths.claudeMdPath, label: "CLAUDE.md" });
    }
    if (targetIncludesCodex(target)) {
      mdPaths.push({ path: paths.agentsMdPath, label: "AGENTS.md" });
    }
    for (const item of mdPaths) {
      if (!fs5.existsSync(item.path)) continue;
      try {
        fs5.accessSync(item.path, fs5.constants.R_OK);
      } catch {
        return failStep("pre-check", `${item.label} \u6587\u4EF6\u65E0\u8BFB\u53D6\u6743\u9650\uFF0C\u8BF7\u8FD0\u884C: chmod 644 ${item.label}`);
      }
    }
  }
  return okStep("pre-check", "\u6240\u6709\u524D\u7F6E\u68C0\u67E5\u901A\u8FC7");
}
function doDetectStack(cwd) {
  const fp = cwdFilePresence(cwd);
  const stack = detectStack(fp);
  const parts = [];
  if (stack.languages.length) parts.push(`lang=${stack.languages.join("+")}`);
  if (stack.frameworks.length) parts.push(`fw=${stack.frameworks.join("+")}`);
  if (stack.packageManagers.length) parts.push(`pm=${stack.packageManagers.join("+")}`);
  if (stack.testRunners.length) parts.push(`test=${stack.testRunners.join("+")}`);
  if (stack.otherSignals.length) parts.push(`other=${stack.otherSignals.join("+")}`);
  const detail = parts.length > 0 ? parts.join("  ") : "(\u8BC6\u522B\u4E0D\u5230\u5178\u578B\u4FE1\u53F7)";
  return okStep("detect-stack", detail);
}
function doCreateDirs(paths, dryRun) {
  const toCreate = [
    path5.dirname(paths.projectDbPath),
    path5.dirname(paths.userGlobalDbPath)
  ];
  if (dryRun) {
    return okStep("create-dirs", `(dry-run) \u4F1A\u521B\u5EFA: ${toCreate.join(", ")}`);
  }
  try {
    for (const d of toCreate) fs5.mkdirSync(d, { recursive: true });
    try {
      const marker = path5.join(paths.cwd, ".teamagent", ".project-root");
      if (!fs5.existsSync(marker)) {
        fs5.writeFileSync(
          marker,
          `# TeamAgent project marker \u2014 created by \`teamagent init\` on ${(/* @__PURE__ */ new Date()).toISOString()}
# This file makes the project discoverable by findTeamagentRoot from sub-directories.
`,
          "utf-8"
        );
      }
    } catch {
    }
    return okStep("create-dirs", `\u5DF2\u786E\u4FDD\u76EE\u5F55\u5B58\u5728: ${toCreate.length} \u4E2A`);
  } catch (err) {
    return failStep("create-dirs", String(err).slice(0, 200));
  }
}
function doLoadPresets(userGlobalDbPath, dryRun, now) {
  const presets = getMetaPrinciples(now);
  if (dryRun) {
    return {
      step: okStep("load-preset", `(dry-run) \u4F1A\u5199\u5165 ${presets.length} \u6761\u5143\u539F\u5219`),
      addedCount: 0,
      wouldAddCount: presets.length
    };
  }
  try {
    fs5.mkdirSync(path5.dirname(userGlobalDbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(userGlobalDbPath));
    let added = 0;
    for (const p of presets) {
      if (store.getById(p.id)) continue;
      store.add(p);
      added++;
    }
    store.close();
    return {
      step: okStep("load-preset", `\u6CE8\u5165\u5143\u539F\u5219 ${added} \u6761\uFF08\u603B ${presets.length} \u6761\uFF0C${presets.length - added} \u6761\u5DF2\u5B58\u5728\uFF09`),
      addedCount: added,
      wouldAddCount: presets.length
    };
  } catch (err) {
    return {
      step: failStep("load-preset", String(err).slice(0, 200)),
      addedCount: 0,
      wouldAddCount: 0
    };
  }
}
function resolveSeedPath() {
  const here = fileURLToPath2(import.meta.url);
  let dir = path5.dirname(here);
  for (let i = 0; i < 8; i++) {
    const bundled = path5.join(dir, "dist", "seed", "rules.jsonl");
    if (fs5.existsSync(bundled)) return bundled;
    const dev = path5.join(dir, "packages", "teamagent", "seed", "rules.jsonl");
    if (fs5.existsSync(dev)) return dev;
    const siblingSeed = path5.join(dir, "..", "teamagent", "seed", "rules.jsonl");
    if (fs5.existsSync(siblingSeed)) return siblingSeed;
    const parent = path5.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
function parseJsonlEntries(filePath) {
  const text = fs5.readFileSync(filePath, "utf-8");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}
function resolveTeamAgentBinPath() {
  const here = fileURLToPath2(import.meta.url);
  let dir = path5.dirname(here);
  for (let i = 0; i < 8; i++) {
    const sibling = path5.join(dir, "bin.js");
    if (fs5.existsSync(sibling)) return sibling;
    const dev = path5.join(dir, "packages", "teamagent", "dist", "bin.js");
    if (fs5.existsSync(dev)) return dev;
    const nested = path5.join(dir, "..", "teamagent", "dist", "bin.js");
    if (fs5.existsSync(nested)) return nested;
    const parent = path5.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
async function spawnDetachedWarmup(home) {
  const { writeInitialPlaceholder, defaultWarmupStatePath } = await import("./warmup-state-4E7RVQWL.js");
  const stateFile = defaultWarmupStatePath(home);
  const teamagentDir = path5.dirname(stateFile);
  fs5.mkdirSync(teamagentDir, { recursive: true });
  try {
    writeInitialPlaceholder(stateFile, "Xenova/multilingual-e5-small");
  } catch (err) {
    return { ok: false, detail: `state-file write failed: ${String(err).slice(0, 80)}` };
  }
  const binPath = resolveTeamAgentBinPath();
  if (!binPath) {
    return {
      ok: false,
      detail: "\u672A\u627E\u5230\u6253\u5305\u540E\u7684 bin.js\uFF08dev \u6A21\u5F0F\u672A\u8DD1 pnpm build\uFF1F\uFF09\uFF1B\u5411\u91CF\u6A21\u578B\u672A\u542F\u52A8\u540E\u53F0\u9884\u70ED\uFF0CPreToolUse \u4ECD\u53EF\u8D70 legacy substring matcher"
    };
  }
  const logPath = path5.join(teamagentDir, "warmup.log");
  const { spawn } = await import("child_process");
  let logFd;
  try {
    logFd = fs5.openSync(logPath, "a");
  } catch (err) {
    return { ok: false, detail: `warmup.log open failed: ${String(err).slice(0, 80)}` };
  }
  try {
    const child = spawn(
      process.execPath,
      [binPath, "warmup", "--write-state", stateFile],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd]
      }
    );
    child.unref();
    return {
      ok: true,
      detail: `detached pid=${child.pid ?? "?"} state=${stateFile} log=${logPath}`
    };
  } catch (err) {
    return { ok: false, detail: `spawn failed: ${String(err).slice(0, 80)}` };
  } finally {
    try {
      fs5.closeSync(logFd);
    } catch {
    }
  }
}
function doLoadSeed(userGlobalDbPath, dryRun, explicitSeedPath) {
  const seedPath = explicitSeedPath ?? resolveSeedPath();
  if (!seedPath) {
    return {
      step: okStep("load-seed", "\u672A\u627E\u5230 seed/rules.jsonl\uFF08\u5F00\u53D1\u5B89\u88C5\u6216 tarball \u7F3A\u5931\uFF09\uFF0C\u8DF3\u8FC7"),
      addedCount: 0,
      wouldAddCount: 0
    };
  }
  let entries;
  try {
    entries = parseJsonlEntries(seedPath);
  } catch (err) {
    return {
      step: failStep("load-seed", `\u8BFB\u53D6 seed \u5931\u8D25: ${String(err).slice(0, 150)}`),
      addedCount: 0,
      wouldAddCount: 0
    };
  }
  const packsDir = path5.join(path5.dirname(seedPath), "packs");
  if (fs5.existsSync(packsDir)) {
    let packFiles;
    try {
      packFiles = fs5.readdirSync(packsDir).filter((f) => f.endsWith(".jsonl")).sort();
    } catch {
      packFiles = [];
    }
    for (const file of packFiles) {
      try {
        entries.push(...parseJsonlEntries(path5.join(packsDir, file)));
      } catch {
      }
    }
  }
  if (dryRun) {
    return {
      step: okStep("load-seed", `(dry-run) \u4F1A\u6CE8\u5165 ${entries.length} \u6761\u6253\u5305\u89C4\u5219`),
      addedCount: 0,
      wouldAddCount: entries.length
    };
  }
  try {
    fs5.mkdirSync(path5.dirname(userGlobalDbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(userGlobalDbPath));
    let added = 0;
    for (const e of entries) {
      if (store.getById(e.id)) continue;
      try {
        store.add(e);
        added++;
      } catch {
      }
    }
    store.close();
    return {
      step: okStep(
        "load-seed",
        `\u6CE8\u5165\u6253\u5305\u89C4\u5219 ${added} \u6761\uFF08\u603B ${entries.length} \u6761\uFF0C${entries.length - added} \u6761\u5DF2\u5B58\u5728\uFF09`
      ),
      addedCount: added,
      wouldAddCount: entries.length
    };
  } catch (err) {
    return {
      step: failStep("load-seed", String(err).slice(0, 200)),
      addedCount: 0,
      wouldAddCount: 0
    };
  }
}
async function doImportRules(paths, opts, dryRun, now) {
  const steps = [];
  if (!opts.structure || opts.skipImport) {
    const why = opts.skipImport ? "skipImport=true\uFF08\u663E\u5F0F\u8DF3\u8FC7\uFF09" : "\u672A\u6307\u5B9A --structure\uFF08\u9ED8\u8BA4\u4E0D\u8C03\u7528 LLM\u3001\u4E0D\u8BFB CLAUDE.md\u3001\u4E0D\u6D88\u8017\u8BA2\u9605\u989D\u5EA6\uFF09";
    steps.push({
      step: "scan-rules",
      status: "skipped",
      detail: "\u8DF3\u8FC7\u89C4\u5219\u626B\u63CF\uFF08LLM \u7ED3\u6784\u5316\u5BFC\u5165\u4E3A --structure opt-in\uFF09"
    });
    steps.push({ step: "structure-rules", status: "skipped", detail: why });
    return { steps, importedCount: 0, wouldImport: 0 };
  }
  const claudeMdExists = fs5.existsSync(paths.claudeMdPath);
  const agentsMdExists = fs5.existsSync(paths.agentsMdPath) && !isManagedAgentsMdSymlink(paths);
  const cursorRulesPath = path5.join(paths.cwd, ".cursorrules");
  const cursorExists = fs5.existsSync(cursorRulesPath);
  const rawTexts = [];
  const scanDetails = [];
  if (claudeMdExists) {
    const md = fs5.readFileSync(paths.claudeMdPath, "utf-8");
    const bullets = extractRuleBullets(md);
    scanDetails.push(`CLAUDE.md: ${bullets.length} bullets`);
    rawTexts.push(...bullets);
  }
  if (agentsMdExists) {
    const md = fs5.readFileSync(paths.agentsMdPath, "utf-8");
    const bullets = extractRuleBullets(md);
    scanDetails.push(`AGENTS.md: ${bullets.length} bullets`);
    rawTexts.push(...bullets);
  }
  if (cursorExists) {
    const text = fs5.readFileSync(cursorRulesPath, "utf-8");
    const rules = extractCursorRules(text);
    scanDetails.push(`.cursorrules: ${rules.length} rules`);
    rawTexts.push(...rules);
  }
  steps.push(
    okStep(
      "scan-rules",
      scanDetails.length > 0 ? scanDetails.join(", ") : "CLAUDE.md / AGENTS.md / .cursorrules \u5747\u4E0D\u5B58\u5728\uFF0C\u8DF3\u8FC7\u5BFC\u5165"
    )
  );
  if (rawTexts.length === 0) {
    return {
      steps: [...steps, okStep("structure-rules", "\u65E0\u89C4\u5219\u53EF\u5BFC\u5165")],
      importedCount: 0,
      wouldImport: 0
    };
  }
  if (dryRun) {
    steps.push(
      okStep(
        "structure-rules",
        `(dry-run) \u4F1A LLM \u7ED3\u6784\u5316 ${rawTexts.length} \u6761\u89C4\u5219\u5199\u5165 personal store`
      )
    );
    return { steps, importedCount: 0, wouldImport: rawTexts.length };
  }
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  const idGen = opts.idGen ?? (() => defaultIdGen(now));
  try {
    const result = await structureRuleTextsBatch(
      rawTexts,
      (prompt) => llm.complete(prompt),
      { now }
    );
    fs5.mkdirSync(path5.dirname(paths.projectDbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(paths.projectDbPath));
    let imported = 0;
    for (const { partial } of result.structured) {
      const entry = assembleImported(partial, idGen(), now);
      try {
        store.add(entry);
        imported++;
      } catch {
      }
    }
    store.close();
    steps.push(
      okStep(
        "structure-rules",
        `\u6210\u529F\u5BFC\u5165 ${imported}/${rawTexts.length}\uFF08\u8DF3\u8FC7 ${result.skipped}\uFF0C\u5931\u8D25 ${result.failed}\uFF09`
      )
    );
    return { steps, importedCount: imported, wouldImport: rawTexts.length };
  } catch (err) {
    steps.push(failStep("structure-rules", String(err).slice(0, 200)));
    return { steps, importedCount: 0, wouldImport: rawTexts.length };
  }
}
async function doInstallPlugins(dryRun, injected) {
  if (dryRun) {
    return okStep(
      "install-plugins",
      "(dry-run) \u4F1A\u6CE8\u518C\u56E2\u961F\u6807\u914D marketplaces + plugins"
    );
  }
  try {
    const opts = {};
    if (injected) opts.installer = injected;
    const result = await executeInstallPlugins(opts);
    const s = result.summary;
    const detail = [
      s.added ? `${s.added} \u65B0\u88C5` : "",
      s.alreadyPresent ? `${s.alreadyPresent} \u5DF2\u5B58\u5728` : "",
      s.failed ? `${s.failed} \u5931\u8D25` : ""
    ].filter(Boolean).join("\uFF0C") || "\u65E0\u4E8B\u53EF\u505A";
    return result.ok ? okStep("install-plugins", detail) : failStep("install-plugins", detail);
  } catch (err) {
    return failStep("install-plugins", String(err).slice(0, 200));
  }
}
function doAuditOrphanShellHooks(cwd, dryRun) {
  if (dryRun) {
    return okStep(
      "audit-orphan-hooks",
      "(dry-run) \u4F1A\u626B\u63CF .claude/hooks/*.sh \u68C0\u67E5\u662F\u5426\u4ECD\u88AB settings \u5F15\u7528"
    );
  }
  try {
    const orphans = auditOrphanShellHooks(cwd);
    if (orphans.length === 0) {
      return okStep("audit-orphan-hooks", "\u65E0\u5B64\u513F .sh");
    }
    process.stderr.write(
      `[teamagent init] \u53D1\u73B0 ${orphans.length} \u4E2A\u672A\u5F15\u7528\u7684 .claude/hooks/*.sh\uFF1A
`
    );
    for (const o of orphans) {
      process.stderr.write(`  - ${o}
`);
    }
    process.stderr.write(
      "  \u8FD9\u4E9B\u811A\u672C\u4E0D\u5728 settings.json \u6216 settings.local.json \u4E2D\u3002\u53EF\u80FD\u662F\u5386\u53F2\u9057\u7559\u6216\u7528\u6237\u81EA\u5B9A\u4E49\u3002\n"
    );
    return {
      step: "audit-orphan-hooks",
      status: "ok",
      detail: `\u26A0\uFE0F  \u53D1\u73B0 ${orphans.length} \u4E2A\u5B64\u513F .sh: ${orphans.join(", ")}`
    };
  } catch (err) {
    return failStep("audit-orphan-hooks", String(err).slice(0, 200));
  }
}
function doWriteRequiredArtifacts(cwd, dryRun) {
  if (dryRun) {
    return okStep(
      "write-required-artifacts",
      "(dry-run) \u4F1A\u5199\u5165 .teamagent/required.json \u4E0E .claude/hooks/check-teamagent.sh"
    );
  }
  try {
    const reqPath = path5.join(cwd, ".teamagent", "required.json");
    const shPath = path5.join(cwd, ".claude", "hooks", "check-teamagent.sh");
    const reqContent = JSON.stringify(REQUIRED_JSON_CONTENT, null, 2) + "\n";
    const shContent = CHECK_TEAMAGENT_SH_CONTENT;
    const reqWritten = writeManagedFile(reqPath, reqContent);
    const shWritten = writeManagedFile(shPath, shContent);
    if (shWritten) {
      try {
        fs5.chmodSync(shPath, 493);
      } catch {
      }
    }
    const parts = [];
    parts.push(
      reqWritten ? `\u5DF2\u5199\u5165 ${path5.relative(cwd, reqPath)}` : `${path5.relative(cwd, reqPath)} \u5DF2\u662F\u6700\u65B0`
    );
    parts.push(
      shWritten ? `\u5DF2\u5199\u5165 ${path5.relative(cwd, shPath)}` : `${path5.relative(cwd, shPath)} \u5DF2\u662F\u6700\u65B0`
    );
    return okStep("write-required-artifacts", parts.join(" \xB7 "));
  } catch (err) {
    return failStep(
      "write-required-artifacts",
      String(err).slice(0, 200)
    );
  }
}
function writeManagedFile(absPath, content) {
  if (fs5.existsSync(absPath)) {
    let existing = null;
    try {
      existing = fs5.readFileSync(absPath, "utf8");
    } catch (err) {
      const code = err.code;
      if (code !== "ENOENT") throw err;
    }
    if (existing === content) return false;
  }
  fs5.mkdirSync(path5.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${process.pid}.${Date.now()}`;
  let renamed = false;
  try {
    fs5.writeFileSync(tmp, content);
    fs5.renameSync(tmp, absPath);
    renamed = true;
  } finally {
    if (!renamed) {
      try {
        fs5.unlinkSync(tmp);
      } catch {
      }
    }
  }
  return true;
}
function doInstallHook(cwd, hookEntry, dryRun, userLevel) {
  if (dryRun) {
    const dest = userLevel ? `${path5.join(cwd, ".claude", "settings.local.json")} + ~/.claude/settings.json` : path5.join(cwd, ".claude", "settings.local.json");
    return okStep("install-hook", `(dry-run) \u4F1A\u5199\u5165 ${dest}`);
  }
  try {
    const r = installHook({
      cwd,
      ...hookEntry ? { hookEntry } : {},
      userLevel
    });
    const parts = [];
    parts.push(r.alreadyInstalled ? `\u5DF2\u5B89\u88C5 (\u65E0\u53D8\u5316): ${r.settingsPath}` : `\u5DF2\u6CE8\u518C: ${r.settingsPath}`);
    if (userLevel) {
      parts.push("\u5DF2\u5199\u5165\u7528\u6237\u7EA7 ~/.claude/settings.json (Issue #161 viral install)");
    }
    if (r.statusLineSkipped) {
      parts.push("\u26A0\uFE0F  statusLine bundle \u7F3A\u5931\uFF0C\u672A\u6CE8\u518C");
    } else if (r.statusLineMergedScope) {
      parts.push(
        `\u5DF2\u5408\u5E76\u5DF2\u6709 statusLine (scope=${r.statusLineMergedScope}) \u2192 \u7528\u6237\u539F\u5185\u5BB9 + TeamBrain \u72B6\u6001\u680F\u4F1A\u540C\u65F6\u6E32\u67D3`
      );
    }
    return okStep("install-hook", parts.join(" \xB7 "));
  } catch (err) {
    return failStep("install-hook", String(err).slice(0, 200));
  }
}
async function doCompileSkills(paths, dryRun) {
  if (dryRun) {
    return okStep(
      "compile-skills",
      `(dry-run) \u4F1A\u628A stable+ \u6761\u76EE\u5BFC\u51FA\u5230 ${paths.skillsDir}`
    );
  }
  try {
    fs5.mkdirSync(path5.dirname(paths.projectDbPath), { recursive: true });
    fs5.mkdirSync(path5.dirname(paths.userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({
      projectDbPath: paths.projectDbPath,
      userGlobalDbPath: paths.userGlobalDbPath
    });
    const all = store.getAll();
    await runCompile({
      store,
      skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir })
    });
    store.close();
    return okStep(
      "compile-skills",
      `\u5DF2\u5BFC\u51FA ${all.length} \u6761\u5019\u9009\u89C4\u5219\u5230 Skills\uFF1BCLAUDE.md \u89C4\u5219\u5757\u8F93\u51FA\u5DF2\u7981\u7528`
    );
  } catch (err) {
    return failStep("compile-skills", String(err).slice(0, 200));
  }
}
var SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
function mirrorProjectSkillToUserLevel(skillId, stepKey, paths, dryRun) {
  if (!SKILL_ID_PATTERN.test(skillId)) {
    return failStep(
      stepKey,
      `invalid skillId "${skillId.slice(0, 32)}" \u2014 must match ${SKILL_ID_PATTERN}`
    );
  }
  const sourcePath = path5.join(
    paths.cwd,
    ".claude",
    "skills",
    skillId,
    "SKILL.md"
  );
  const targetPath = path5.join(paths.skillsDir, skillId, "SKILL.md");
  if (!fs5.existsSync(sourcePath)) {
    return {
      step: stepKey,
      status: "skipped",
      detail: `\u6E90 .claude/skills/${skillId}/SKILL.md \u4E0D\u5B58\u5728\uFF08\u4EC5 TeamBrain \u4ED3\u5E93\u9700\u8981\uFF09`
    };
  }
  if (dryRun) {
    return okStep(
      stepKey,
      `(dry-run) \u4F1A\u590D\u5236 ${sourcePath} \u2192 ${targetPath}`
    );
  }
  try {
    fs5.mkdirSync(path5.dirname(targetPath), { recursive: true });
    fs5.copyFileSync(sourcePath, targetPath);
    return okStep(stepKey, `\u5DF2\u590D\u5236\u5230 ${targetPath}\uFF08\u7528\u6237\u7EA7 FIXEDFLOW \u5165\u53E3\uFF09`);
  } catch (err) {
    return okStep(
      stepKey,
      `\u26A0\uFE0F \u955C\u50CF\u5931\u8D25\u4F46 init \u7EE7\u7EED\uFF08cosmetic\uFF09: ${String(err).slice(0, 160)}`
    );
  }
}
function doMirrorClaimToMergeSkill(paths, dryRun) {
  return mirrorProjectSkillToUserLevel(
    CLAIM_TO_MERGE_SKILL_ID,
    MIRROR_CLAIM_STEP,
    paths,
    dryRun
  );
}
function doMirrorStaticUserSkills(paths, target, dryRun) {
  const targets = [];
  if (targetIncludesClaude(target)) targets.push("claude");
  if (targetIncludesCodex(target)) targets.push("codex");
  const plan = planStaticUserSkillInstall({
    homeDir: paths.home,
    fileExists: (p) => fs5.existsSync(p),
    joinPath: path5.join,
    targets
  });
  let createdCount = 0;
  let skipExistingCount = 0;
  let skipDisabledCount = 0;
  const writeErrors = [];
  for (const entry of plan) {
    if (entry.action === "skip-disabled") {
      skipDisabledCount++;
      continue;
    }
    if (entry.action === "skip-exists") {
      skipExistingCount++;
      continue;
    }
    if (dryRun) {
      createdCount++;
      continue;
    }
    try {
      fs5.mkdirSync(path5.dirname(entry.destPath), { recursive: true });
      fs5.writeFileSync(entry.destPath, entry.content, "utf-8");
      createdCount++;
    } catch (err) {
      writeErrors.push(`${entry.skill}/${entry.target}: ${String(err).slice(0, 80)}`);
    }
  }
  const summary = `created=${createdCount} skip-exists=${skipExistingCount} skip-disabled=${skipDisabledCount}`;
  if (writeErrors.length > 0) {
    return okStep(
      STATIC_USER_SKILLS_STEP,
      `\u26A0\uFE0F \u90E8\u5206\u955C\u50CF\u5931\u8D25\u4F46 init \u7EE7\u7EED: ${summary}; errors=${writeErrors.join("; ").slice(0, 200)}`
    );
  }
  if (dryRun) {
    return okStep(
      STATIC_USER_SKILLS_STEP,
      `(dry-run) \u4F1A\u955C\u50CF ${createdCount} \u4E2A\u9759\u6001\u7528\u6237\u7EA7 skill\uFF08${summary}\uFF09`
    );
  }
  return okStep(STATIC_USER_SKILLS_STEP, `\u5DF2\u955C\u50CF\u9759\u6001\u7528\u6237\u7EA7 skills\uFF1A${summary}`);
}
function appendFixedflowBanner(lines) {
  lines.push("\u2501".repeat(36));
  lines.push("\u{1F30A} FIXEDFLOW \u2014 \u672C\u4ED3\u5E93 issue \u2192 merged code \u7684\u552F\u4E00\u8DEF\u5F84");
  lines.push("\u2501".repeat(36));
  lines.push("");
  lines.push("  \u4EA7\u54C1\u7279\u6027");
  lines.push("    \u4F60\u5199 \u226450 \u5B57 issue + \u8D34 grill \u8BC4\u8BBA + \u52A0 grill-ready label\u3002");
  lines.push("    maintainer \u5728 Claude Code \u91CC\u624B\u52A8\u8DD1 /fixed-flow-driver skill:");
  lines.push("    worktree \u2192 \u5B9E\u73B0 \u2192 /review fix-loop\uFF08\u5FAA\u73AF\u81F3 PASS\uFF09\u2192 \u666E\u901A PR \u2192");
  lines.push("    squash-merge \u2192 \u6E05\u7406\u3002\u65E0 watcher / \u65E0\u540E\u53F0\u8F6E\u8BE2 / \u65E0\u81EA\u52A8 dispatch\u3002");
  lines.push("    /review \u51FA issue \u65F6\u5F3A\u5236\u8D70 PR-PLAN\uFF08\u7981\u5F00 follow-up issue\uFF09\uFF1B");
  lines.push("    POSTPR \u4EC5 squash-merge\uFF08\u7981 --merge / --rebase\uFF09\u3002");
  lines.push("");
  lines.push("  \u5FEB\u901F\u9A8C\u8BC1\uFF08\u590D\u5236\u8FD0\u884C\uFF09");
  lines.push(
    '    claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, who triggers step 3"'
  );
  lines.push("");
  lines.push("  \u8BE6\u60C5");
  lines.push(`    ${FIXEDFLOW_BANNER_DOC_PATHS[0]} (TL;DR routing)`);
  lines.push(
    `    ${FIXEDFLOW_BANNER_DOC_PATHS[1]} / ${FIXEDFLOW_BANNER_DOC_PATHS[2]} / ${FIXEDFLOW_BANNER_DOC_PATHS[3]} (canonical)`
  );
  lines.push("");
}
function doLinkCodexFiles(paths, dryRun) {
  const links = [
    {
      linkPath: path5.join(paths.cwd, ".codex", "skills"),
      targetPath: paths.skillsDir,
      label: ".codex/skills -> TeamAgent skills",
      targetType: "dir"
    }
  ];
  if (dryRun) {
    return okStep(
      "link-codex-files",
      `(dry-run) \u4F1A\u521B\u5EFA\u8F6F\u94FE\u63A5: ${links.map((l) => l.label).join(", ")}\uFF1B\u4F1A\u6E05\u7406\u65E7 TeamAgent AGENTS.md \u8F6F\u94FE\u63A5\uFF08\u5982\u5B58\u5728\uFF09`
    );
  }
  try {
    const details = [];
    const cleanupState = cleanupManagedAgentsMdSymlink(paths);
    if (cleanupState !== "not-needed") {
      details.push(`AGENTS.md legacy link (${cleanupState})`);
    }
    for (const link of links) {
      fs5.mkdirSync(path5.dirname(link.linkPath), { recursive: true });
      fs5.mkdirSync(path5.dirname(link.targetPath), { recursive: true });
      if (link.targetType === "dir") {
        fs5.mkdirSync(link.targetPath, { recursive: true });
      }
      const state = ensureSymlink(link.linkPath, link.targetPath, link.targetType, () => /* @__PURE__ */ new Date());
      details.push(`${link.label} (${state})`);
    }
    return okStep("link-codex-files", `\u5DF2\u786E\u4FDD\u8F6F\u94FE\u63A5: ${details.join(", ")}`);
  } catch (err) {
    return failStep("link-codex-files", String(err).slice(0, 200));
  }
}
function doInstallCodexHooks(paths, dryRun) {
  const projectHooksPath = path5.join(paths.cwd, ".codex", "hooks.json");
  if (!fs5.existsSync(projectHooksPath)) {
    return okStep(
      "install-codex-hook",
      "\u9879\u76EE\u65E0 .codex/hooks.json \u2014 Codex hook \u8DF3\u8FC7\uFF08\u7528\u6237\u53EF\u624B\u52A8\u6DFB\u52A0\u540E\u518D init\uFF09"
    );
  }
  const userCodexDir = path5.join(paths.home, ".codex");
  const userCodexHooksPath = path5.join(userCodexDir, "hooks.json");
  const stagedHooksDir = path5.join(paths.home, ".teamagent", "hooks", "codex");
  let projectConfig;
  try {
    projectConfig = JSON.parse(
      fs5.readFileSync(projectHooksPath, "utf-8")
    );
  } catch (err) {
    return failStep(
      "install-codex-hook",
      `\u89E3\u6790 .codex/hooks.json \u5931\u8D25: ${String(err).slice(0, 200)}`
    );
  }
  if (!projectConfig.hooks || typeof projectConfig.hooks !== "object") {
    return failStep(
      "install-codex-hook",
      ".codex/hooks.json \u7F3A\u5C11 .hooks \u5B57\u6BB5\u6216\u7C7B\u578B\u9519"
    );
  }
  if (dryRun) {
    const eventCount = Object.keys(projectConfig.hooks).length;
    return okStep(
      "install-codex-hook",
      `(dry-run) \u4F1A\u6682\u5B58 .codex/hooks/*.sh \u5230 ${stagedHooksDir} \u5E76 merge ${eventCount} \u4E2A event \u5230 ${userCodexHooksPath}`
    );
  }
  const stagedScripts = [];
  try {
    fs5.mkdirSync(stagedHooksDir, { recursive: true });
    const projectScriptsDir = path5.join(paths.cwd, ".codex", "hooks");
    if (fs5.existsSync(projectScriptsDir)) {
      for (const name of fs5.readdirSync(projectScriptsDir)) {
        if (!name.endsWith(".sh")) continue;
        const src = path5.join(projectScriptsDir, name);
        const dst = path5.join(stagedHooksDir, name);
        fs5.copyFileSync(src, dst);
        try {
          fs5.chmodSync(dst, 493);
        } catch {
        }
        stagedScripts.push(name);
      }
    }
  } catch (err) {
    return failStep(
      "install-codex-hook",
      `\u6682\u5B58 .codex/hooks/*.sh \u5230 ${stagedHooksDir} \u5931\u8D25: ${String(err).slice(0, 200)}`
    );
  }
  const transformed = {};
  for (const [event, blocks] of Object.entries(projectConfig.hooks)) {
    if (!Array.isArray(blocks)) continue;
    transformed[event] = blocks.map((b) => ({
      ...b.matcher !== void 0 ? { matcher: b.matcher } : {},
      hooks: (b.hooks ?? []).map((h) => ({
        ...h,
        command: rewriteCodexHookCommand(h.command ?? "", stagedHooksDir)
      })),
      _teamagentTag: `teamagent:codex-${event}:v1`
    }));
  }
  let userConfig = { hooks: {} };
  if (fs5.existsSync(userCodexHooksPath)) {
    try {
      const parsed = JSON.parse(
        fs5.readFileSync(userCodexHooksPath, "utf-8")
      );
      if (parsed.hooks && typeof parsed.hooks === "object") {
        userConfig = parsed;
      }
    } catch (err) {
      const backup = `${userCodexHooksPath}.bak-teamagent-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
      try {
        fs5.renameSync(userCodexHooksPath, backup);
      } catch {
        return failStep(
          "install-codex-hook",
          `\u7528\u6237 hooks.json \u89E3\u6790\u5931\u8D25\u4E14\u65E0\u6CD5 backup: ${String(err).slice(0, 200)}`
        );
      }
    }
  }
  userConfig.hooks ??= {};
  const allEvents = /* @__PURE__ */ new Set([
    ...Object.keys(userConfig.hooks ?? {}),
    ...Object.keys(transformed)
  ]);
  const mergedHooks = {};
  let removedCount = 0;
  let addedCount = 0;
  for (const event of allEvents) {
    const existing = (userConfig.hooks?.[event] ?? []).filter((b) => {
      if (typeof b._teamagentTag === "string" && b._teamagentTag.startsWith("teamagent:codex-")) {
        removedCount += 1;
        return false;
      }
      return true;
    });
    const fresh = transformed[event] ?? [];
    addedCount += fresh.length;
    const combined = [...existing, ...fresh];
    if (combined.length > 0) {
      mergedHooks[event] = combined;
    }
  }
  const merged = { ...userConfig, hooks: mergedHooks };
  try {
    fs5.mkdirSync(userCodexDir, { recursive: true });
    fs5.writeFileSync(
      userCodexHooksPath,
      JSON.stringify(merged, null, 2) + "\n",
      "utf-8"
    );
  } catch (err) {
    return failStep(
      "install-codex-hook",
      `\u5199 ${userCodexHooksPath} \u5931\u8D25: ${String(err).slice(0, 200)}`
    );
  }
  const preservedUntagged = Object.values(mergedHooks).reduce((acc, blocks) => acc + blocks.length, 0) - addedCount;
  return okStep(
    "install-codex-hook",
    `Codex hook \u5DF2\u5199\u5230 ${userCodexHooksPath} (events=${Object.keys(transformed).length}, scripts=${stagedScripts.length}, replaced-old-teamagent=${removedCount}, added=${addedCount}, preserved-user=${preservedUntagged})`
  );
}
function rewriteCodexHookCommand(cmd, stagedHooksDir) {
  const match = cmd.match(/bash\s+"\$root\/\.codex\/hooks\/([\w.-]+\.sh)"/);
  const scriptName = match?.[1];
  if (!scriptName) return cmd;
  const stagedPath = path5.join(stagedHooksDir, scriptName).replace(/\\/g, "/");
  return `bash "${stagedPath}"`;
}
function ensureSymlink(linkPath, targetPath, targetType, now) {
  const relativeTarget = path5.relative(path5.dirname(linkPath), targetPath) || path5.basename(targetPath);
  try {
    const stat = fs5.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = fs5.readlinkSync(linkPath);
      const currentAbs = path5.resolve(path5.dirname(linkPath), current);
      if (currentAbs === targetPath) return "already";
      fs5.unlinkSync(linkPath);
    } else {
      const backupPath = `${linkPath}.bak-teamagent-${now().toISOString().replace(/[:.]/g, "-")}`;
      fs5.renameSync(linkPath, backupPath);
      fs5.symlinkSync(relativeTarget, linkPath, targetType === "dir" ? "junction" : "file");
      return "backed-up";
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  fs5.symlinkSync(relativeTarget, linkPath, targetType === "dir" ? "junction" : "file");
  return "created";
}
function symlinkTargetAbs(linkPath) {
  try {
    const stat = fs5.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return void 0;
    const current = fs5.readlinkSync(linkPath);
    return path5.resolve(path5.dirname(linkPath), current);
  } catch {
    return void 0;
  }
}
function pathIsInsideOrEqual(candidate, root) {
  const rel = path5.relative(root, candidate);
  return rel === "" || !rel.startsWith("..") && !path5.isAbsolute(rel);
}
function isManagedAgentsMdSymlink(paths) {
  const target = symlinkTargetAbs(paths.agentsMdPath);
  if (!target) return false;
  return target === paths.claudeMdPath || pathIsInsideOrEqual(target, path5.join(paths.home, ".claude", "teamagent"));
}
function cleanupManagedAgentsMdSymlink(paths) {
  if (!isManagedAgentsMdSymlink(paths)) return "not-needed";
  fs5.unlinkSync(paths.agentsMdPath);
  return "removed";
}
function appendInstallLog(logPath, steps, now) {
  const dir = path5.dirname(logPath);
  fs5.mkdirSync(dir, { recursive: true });
  const payload = { ts: now().toISOString(), steps };
  fs5.appendFileSync(logPath, JSON.stringify(payload) + "\n", "utf-8");
}
function assembleImported(partial, id, now) {
  const confidence = partial.confidence ?? DEFAULT_IMPORT_CONFIDENCE;
  const nature = partial.nature ?? "subjective";
  const nowIso = now().toISOString();
  return {
    id,
    scope: { level: "personal" },
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "practice",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement: computeEnforcement(confidence, nature),
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: "imported",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0
  };
}
function defaultIdGen(now) {
  const ts = now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `pers-${ts}-${rand}`;
}
function okStep(step, detail) {
  return { step, status: "ok", detail };
}
function failStep(step, detail) {
  return { step, status: "failed", detail };
}
function emptySummary() {
  return { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 };
}
function finalize(ok, dryRun, steps, summary, packPrompt = "") {
  return { ok, dryRun, steps, summary, packPrompt };
}
function parseInitArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--skip-import") opts.skipImport = true;
    else if (a === "--structure") opts.structure = true;
    else if (a === "--skip-hook") opts.skipHook = true;
    else if (a === "--skip-seed") opts.skipSeed = true;
    else if (a === "--no-user-level-hook") opts.userLevelHook = false;
    else if (a === "--force-nested-init") opts.force = true;
    else if (a === "--skip-warmup") opts.skipWarmup = true;
    else if (a === "--install-plugins") opts.installPlugins = true;
    else if (a === "--codex") opts.target = "codex";
    else if (a === "--claude") opts.target = "claude";
    else if (a === "--both") opts.target = "both";
    else if (a === "--target") {
      const value = argv[++i];
      opts.target = parseTarget(value);
    } else if (a.startsWith("--target=")) {
      opts.target = parseTarget(a.slice("--target=".length));
    } else if (a === "--pack") {
      const value = argv[++i];
      if (!value)
        throw new Error("--pack \u9700\u8981 <all|name1,name2> \u503C");
      opts.pack = value;
    } else if (a.startsWith("--pack=")) {
      opts.pack = a.slice("--pack=".length);
    } else if (a === "--cwd") {
      opts.cwd = parsePathArg("--cwd", argv[++i]);
    } else if (a.startsWith("--cwd=")) {
      opts.cwd = parsePathArg("--cwd", a.slice("--cwd=".length));
    } else if (a === "--home") {
      opts.homeDir = parsePathArg("--home", argv[++i]);
    } else if (a.startsWith("--home=")) {
      opts.homeDir = parsePathArg("--home", a.slice("--home=".length));
    } else if (a.startsWith("--")) {
      process.stderr.write(`teamagent init: \u5FFD\u7565\u672A\u77E5 flag ${a}
`);
    }
  }
  return opts;
}
function parsePathArg(flag, value) {
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} \u9700\u8981 <path> \u503C`);
  }
  return value;
}
function parseTarget(value) {
  if (value === "claude" || value === "codex" || value === "both") return value;
  throw new Error(`--target \u5FC5\u987B\u662F claude|codex|both\uFF0C\u6536\u5230: ${value ?? ""}`);
}
function renderInitResult(result) {
  const lines = [];
  if (result.dryRun) {
    lines.push("\u26A0\uFE0F  \u9884\u89C8\u6A21\u5F0F\uFF08--dry-run\uFF09\uFF1A\u4EE5\u4E0B\u64CD\u4F5C\u4E0D\u4F1A\u5B9E\u9645\u6267\u884C\n");
  }
  const stepGroups = [
    { icon: "\u{1F6E1}\uFE0F", label: "\u524D\u7F6E\u5B88\u536B", stepKeys: ["nested-init-guard"] },
    { icon: "\u{1F50D}", label: "\u68C0\u6D4B\u9879\u76EE\u73AF\u5883", stepKeys: ["detect-stack"] },
    { icon: "\u{1F4E6}", label: "\u521D\u59CB\u5316\u77E5\u8BC6\u5E93", stepKeys: ["pre-check", "create-dirs", "load-preset", "load-seed", "scan-rules", "structure-rules"] },
    { icon: "\u{1F517}", label: "\u6CE8\u518C\u96C6\u6210", stepKeys: ["install-hook", "audit-orphan-hooks", "write-required-artifacts"] },
    { icon: "\u{1F50C}", label: "\u5B89\u88C5\u56E2\u961F\u6807\u914D\u63D2\u4EF6", stepKeys: ["install-plugins"] },
    { icon: "\u{1F4C4}", label: "\u5BFC\u51FA Skills", stepKeys: ["compile-skills", MIRROR_CLAIM_STEP, STATIC_USER_SKILLS_STEP] },
    { icon: "\u{1F517}", label: "\u94FE\u63A5 Codex \u6587\u4EF6", stepKeys: ["link-codex-files"] },
    { icon: "\u{1F4E6}", label: "Stack packs", stepKeys: ["load-pack", "pack-prompt"] }
  ];
  for (const group of stepGroups) {
    const groupSteps = result.steps.filter((s) => group.stepKeys.includes(s.step));
    if (groupSteps.length === 0) continue;
    lines.push(`${group.icon} ${group.label}...`);
    for (const s of groupSteps) {
      if (s.step === "detect-stack" && s.status === "ok") {
        lines.push(`   \u6280\u672F\u6808: ${s.detail}`);
      } else if (s.status === "ok") {
        lines.push(`   \u2705 ${stepLabel(s.step)}: ${s.detail}`);
      } else if (s.status === "skipped") {
        lines.push(`   \u23ED  ${stepLabel(s.step)}: ${s.detail}`);
      } else {
        lines.push(`   \u274C ${stepLabel(s.step)}: ${friendlyError(s.detail)}`);
      }
    }
    lines.push("");
  }
  if (result.ok) {
    appendFixedflowBanner(lines);
    const verbose = process.env["TEAMAGENT_VERBOSE_INIT"] === "1";
    if (verbose) {
      const hasAnyCompileTarget = result.steps.some(
        (s) => s.step === "compile-skills" || s.step === "link-codex-files"
      );
      const hasClaude = result.steps.some(
        (s) => s.step === "install-hook" && !s.detail.includes("target=codex")
      ) || !hasAnyCompileTarget;
      const hasCodex = result.steps.some((s) => s.step === "link-codex-files");
      lines.push("\u4E0B\u4E00\u6B65\uFF08verbose\uFF09:");
      let next = 1;
      if (hasClaude) lines.push(`  ${next++}. \u91CD\u65B0\u6253\u5F00 Claude Code\uFF08\u8BA9 hook \u751F\u6548\uFF09`);
      if (hasCodex) lines.push(`  ${next++}. \u542F\u52A8\u65B0\u7684 Codex \u4F1A\u8BDD\uFF08\u8BA9 .codex/skills \u751F\u6548\uFF09`);
      lines.push(`  ${next++}. \u8FD0\u884C teamagent doctor \u9A8C\u8BC1\u5B89\u88C5`);
      lines.push(`  ${next++}. \u8FD0\u884C teamagent stats \u67E5\u770B\u77E5\u8BC6\u5E93\u72B6\u6001`);
      const pluginsInstalled = result.steps.some(
        (s) => s.step === "install-plugins"
      );
      if (hasClaude && !pluginsInstalled) {
        lines.push("");
        lines.push("\u{1F4A1} \u56E2\u961F\u6807\u914D\u63D2\u4EF6\uFF08\u4E0E .claude/settings.json:enabledPlugins \u540C\u6B65\uFF09\u9ED8\u8BA4\u4E0D\u88C5");
        lines.push("   \u9700\u8981\u65F6\u8FD0\u884C: teamagent install-plugins");
      }
      lines.push("");
    }
    lines.push("\u2501".repeat(36));
    lines.push("\u2705 TeamAgent \u5DF2\u5C31\u7EEA");
    lines.push("");
    lines.push("\u4E0B\u4E00\u6B65\uFF1A");
    lines.push("  cd your-project");
    lines.push("  claude");
  } else {
    lines.push("\u2501".repeat(36));
    lines.push("\u274C \u5B89\u88C5\u672A\u5B8C\u6210\uFF0C\u8BF7\u4FEE\u590D\u4EE5\u4E0A\u95EE\u9898\u540E\u91CD\u8BD5");
    lines.push("   \u8FD0\u884C teamagent doctor \u83B7\u53D6\u8BCA\u65AD\u5EFA\u8BAE");
  }
  if (result.packPrompt && result.packPrompt.length > 0) {
    lines.push("");
    lines.push(result.packPrompt);
  }
  if (result.ok && !result.dryRun && process.env["TEAMAGENT_VERBOSE_INIT"] === "1") {
    const tail = buildPostInitWhatsNewTail();
    if (tail.length > 0) {
      lines.push(tail);
    }
  }
  return duckifyText(lines.join("\n") + "\n");
}
function buildPostInitWhatsNewTail() {
  let content = "";
  try {
    content = loadBundledChangelog();
  } catch {
    return "";
  }
  if (!content) return "";
  const versionRe = /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?/gm;
  const versions = [];
  let m;
  while ((m = versionRe.exec(content)) !== null) {
    if (m[1]) versions.push(m[1]);
  }
  if (versions.length < 2) return "";
  const installedVersion = versions[0];
  const since = versions[1];
  const bullets = parseChangelog(content, since, installedVersion, {
    maxBullets: 7
  });
  return renderWhatsNewTail({ installedVersion, bullets });
}
function stepLabel(step) {
  const map = {
    "nested-init-guard": "\u5D4C\u5957\u9879\u76EE\u5B88\u536B",
    "pre-check": "\u524D\u7F6E\u68C0\u67E5",
    "detect-stack": "\u6280\u672F\u6808",
    "create-dirs": "\u76EE\u5F55\u521B\u5EFA",
    "load-preset": "\u9884\u7F6E\u89C4\u5219",
    "load-seed": "\u6253\u5305\u89C4\u5219",
    "scan-rules": "\u626B\u63CF\u89C4\u5219",
    "structure-rules": "\u5BFC\u5165\u89C4\u5219",
    "install-hook": "Hook \u6CE8\u518C",
    "audit-orphan-hooks": "\u5B64\u513F .sh \u5BA1\u8BA1",
    "write-required-artifacts": "Required \u6A21\u5F0F\u4EA7\u7269",
    "install-plugins": "Plugin \u5B89\u88C5",
    "compile-skills": "Skills",
    [MIRROR_CLAIM_STEP]: "FIXEDFLOW Skill",
    [STATIC_USER_SKILLS_STEP]: "\u9759\u6001\u7528\u6237\u7EA7 Skills",
    "link-codex-files": "Codex \u8F6F\u94FE\u63A5",
    "load-pack": "Pack \u5B89\u88C5",
    "pack-prompt": "Pack \u63D0\u793A"
  };
  return map[step] ?? step;
}
function friendlyError(raw) {
  if (raw.includes("ENOENT") && raw.includes(".teamagent")) {
    return "\u65E0\u6CD5\u521B\u5EFA ~/.teamagent \u76EE\u5F55\uFF0C\u8BF7\u68C0\u67E5\u78C1\u76D8\u6743\u9650";
  }
  if (raw.includes("sqlite-vec") || raw.includes("extension")) {
    return "sqlite-vec \u6269\u5C55\u52A0\u8F7D\u5931\u8D25\u3002\u8FD0\u884C teamagent doctor \u8BCA\u65AD";
  }
  if (raw.includes("CLAUDE.md") && (raw.includes("EACCES") || raw.includes("\u4E0D\u53EF\u8BFB"))) {
    return "CLAUDE.md \u6587\u4EF6\u4E0D\u53EF\u8BFB\uFF0C\u8BF7\u68C0\u67E5\u6743\u9650";
  }
  if (raw.includes("ancestor TeamAgent project")) return raw;
  if (raw.length < 120) return raw;
  return raw.slice(0, 100) + "...";
}

export {
  executePackList,
  executePackAdd,
  executePackRemove,
  parsePackArgs,
  renderPackList,
  renderPackAdd,
  renderPackRemove,
  packAddExitCode,
  executeRequiredCheck,
  parseRequiredCheckArgs,
  renderRequiredCheckResult,
  findTeamagentRoot,
  FIXEDFLOW_BANNER_DOC_PATHS,
  executeInit,
  mirrorProjectSkillToUserLevel,
  parseInitArgs,
  renderInitResult
};
