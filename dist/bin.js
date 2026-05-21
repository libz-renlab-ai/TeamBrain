#!/usr/bin/env node
import {
  disable,
  enable,
  parseUninstallArgs,
  renderUninstallResult,
  uninstall
} from "./chunk-ISRJXVLE.js";
import {
  executeCalibrate,
  parseCalibrateArgs,
  renderCalibrateResult
} from "./chunk-BRFUGTCQ.js";
import {
  allScenarios,
  executeVerify,
  parseVerifyArgs,
  renderVerifyTerminal
} from "./chunk-PXGAGN6L.js";
import {
  executeCompile,
  parseCompileArgs,
  renderCompileResult
} from "./chunk-L34SAPPC.js";
import {
  executeDemoHook,
  parseDemoHookArgs
} from "./chunk-H5GRZNPU.js";
import {
  executeDocsPropagate,
  executePitfall,
  parseDocsPropagateArgs,
  parsePitfallArgs,
  renderDocsPropagationResult,
  runPitfallInteractive,
  scheduleDocsPropagation
} from "./chunk-XKVTJJAP.js";
import "./chunk-JIMRSSDR.js";
import {
  installUserHook,
  uninstallUserHook
} from "./chunk-2ACJWPHN.js";
import {
  defaultWarmupStatePath,
  writeInitialPlaceholder
} from "./chunk-ZIUCUPFV.js";
import {
  executeInit,
  executePackAdd,
  executePackList,
  executePackRemove,
  executeRequiredCheck,
  findTeamagentRoot,
  packAddExitCode,
  parseInitArgs,
  parsePackArgs,
  parseRequiredCheckArgs,
  renderInitResult,
  renderPackAdd,
  renderPackList,
  renderPackRemove,
  renderRequiredCheckResult
} from "./chunk-CDN6ZTAO.js";
import "./chunk-MCAKDVT7.js";
import {
  executeDoctor,
  parseDoctorArgs,
  renderDoctorHelp,
  renderDoctorResult
} from "./chunk-RFHBW5M5.js";
import "./chunk-2LMMULPZ.js";
import {
  installHook,
  uninstallHook
} from "./chunk-NBY7IFQJ.js";
import "./chunk-DC7TE56Y.js";
import {
  executeVerifyAnchors,
  parseVerifyAnchorsArgs,
  renderVerifyAnchorsJson,
  renderVerifyAnchorsTerminal
} from "./chunk-K2HDCCBI.js";
import {
  executeInstallPlugins,
  parseInstallPluginsArgs,
  renderInstallPluginsResult
} from "./chunk-3OL7Q76U.js";
import {
  ClaudeCodeLLMClient,
  ClaudeSessionSource,
  CompositeErrorSignalCollector,
  FsBootstrap,
  GhCliGitHubActivityAdapter,
  InMemoryAttributionBus,
  InMemoryGitHubActivityPort,
  InMemoryKnowledgeStore,
  SqliteCandidateQueue,
  SqliteEventLog,
  StdoutRenderer,
  XenovaRuleEmbedder,
  createPreToolUseHandler,
  makeSkillCompiler
} from "./chunk-NPSW37EI.js";
import {
  DualLayerStore,
  syncRuleVectors
} from "./chunk-MXJDRQEB.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  parseM5ShareArgs,
  renderM5ShareResult,
  runM5Share
} from "./chunk-3J4EETNE.js";
import {
  parseM5DeleteArgs,
  renderM5DeleteResult,
  runM5Delete
} from "./chunk-DXZTIL4M.js";
import {
  FsTeamRuleStore
} from "./chunk-JJSYX6XZ.js";
import {
  buildErrorBatches,
  compileCursorRules,
  compileMarkdownBlock,
  composeAdditionalContext,
  composeArchiveMarkdown,
  computeBootstrapDiff,
  defaultCalibrator,
  defaultValidator,
  detectSensitiveText,
  detectStack,
  digestProjectGroup,
  duckifyText,
  filterSignals,
  formatAsAgentSkill,
  llmBasedKnowledgeExtractor,
  matchRules2 as matchRules,
  mergeLwwBatch,
  parseManifest,
  parseSessionFile,
  planInfection,
  ruleBasedCorrectionDetector,
  ruleBasedSuccessDetector,
  runCalibrationPipeline,
  runCompile,
  runExtractPipeline,
  runIngestPipeline,
  runVerify,
  scanTodayActivity,
  teamRuleToKnowledgeEntry,
  validateLevel0
} from "./chunk-4Y7LCJVR.js";
import {
  external_exports,
  parseVisibilityMode
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/bin.ts
init_esm_shims();
import fs30 from "fs";
import path32 from "path";
import { fileURLToPath as fileURLToPath4 } from "url";

// ../cli/src/commands/skeleton-demo.ts
init_esm_shims();
async function runSkeletonDemo(opts = {}) {
  const env = opts.env ?? process.env;
  const now = opts.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const mode = parseVisibilityMode(env.TEAMAGENT_VISIBILITY);
  const store = new InMemoryKnowledgeStore();
  const bus = new InMemoryAttributionBus();
  const entry = {
    id: "skeleton-demo-001",
    scope: { level: "personal" },
    category: "K",
    tags: ["metacognition", "skeleton"],
    type: "practice",
    nature: "subjective",
    trigger: "\u9047\u5230\u9884\u671F\u5916\u7684\u72B6\u6001",
    wrong_pattern: "",
    correct_pattern: "\u5148\u505C\u4E0B\u67E5\u6E05\u695A\u6839\u56E0\uFF0C\u518D\u52A8\u624B",
    reasoning: "\u7ED5\u8FC7\u5F0F\u4FEE\u590D\u7ECF\u5E38\u63A9\u76D6\u771F\u95EE\u9898",
    confidence: 0.8,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: now,
    last_hit_at: "",
    last_validated_at: now,
    source: "preset",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0
  };
  store.add(entry);
  const block = compileMarkdownBlock(store.getAll(), now);
  const lineCount = block.split("\n").length;
  bus.emit({
    kind: "skeleton.knowledge-added",
    source: "skeleton",
    knowledgeId: entry.id,
    knowledgeCountBefore: 0,
    knowledgeCountAfter: store.count(),
    blockLines: lineCount,
    severity: "highlight",
    timestamp: now,
    userFacingValue: `\u6A21\u62DF\u77E5\u8BC6\u6761\u76EE\u53EF\u751F\u6210 ${lineCount} \u884C legacy/internal markdown \u9884\u89C8\uFF1B\u666E\u901A\u547D\u4EE4\u4E0D\u518D\u5199\u5165 CLAUDE.md \u89C4\u5219\u5757`,
    counterfactual: "\u6CA1\u6709 Walking Skeleton \u7684\u9AA8\u67B6\u8D2F\u901A\uFF0C\u540E\u7EED Milestone \u6CA1\u6709\u843D\u811A\u70B9"
  });
  const badEntry = {
    id: "skeleton-demo-bad",
    scope: { level: "team", paths: [] },
    // 空 paths 会触发 scope_paths_empty
    type: "avoidance",
    trigger: "bad-rule",
    wrong_pattern: "nonexistent-pattern",
    correct_pattern: "c"
  };
  const l0 = defaultValidator.validateLevel0({
    entry: badEntry,
    sourceText: "nothing matches here",
    existingRules: [],
    projectStack: ["ts"]
  });
  bus.emit({
    kind: "skeleton.l0-validation",
    source: "skeleton",
    knowledgeId: "skeleton-demo-bad",
    ok: l0.ok,
    failedChecks: l0.failed_checks,
    severity: l0.ok ? "info" : "warning",
    timestamp: now,
    userFacingValue: l0.ok ? "\uFF08\u51FA\u4E4E\u610F\u6599\uFF1AL0 \u95E8\u53E3\u6CA1\u62E6\u4F4F\u8FD9\u6761\u574F\u6761\u76EE\uFF09" : `L0 \u5982\u9884\u671F\u62E6\u4E0B\uFF1A${l0.failed_checks.join(", ")}`,
    counterfactual: "\u6CA1\u6709 L0 \u95E8\u95F8\uFF0C\u574F\u6761\u76EE\u4F1A\u6C61\u67D3\u77E5\u8BC6\u5E93"
  });
  const canonicalEntry = {
    ...entry,
    id: "skeleton-demo-canonical",
    trigger: "use-fetch-not-axios",
    correct_pattern: "fetch",
    wrong_pattern: "axios",
    reasoning: "\u9879\u76EE\u7EDF\u4E00\u539F\u751F fetch\uFF0C\u51CF\u5C11\u4F9D\u8D56",
    current_tier: "canonical",
    max_tier_ever: "canonical"
  };
  const stableEntry = {
    ...entry,
    id: "skeleton-demo-stable",
    trigger: "batch-insert-over-loop",
    correct_pattern: "batch insert",
    wrong_pattern: "for.*insert",
    reasoning: "\u6279\u91CF\u63D2\u5165\u907F\u514D\u9010\u6761\u5F80\u8FD4\u5F00\u9500",
    current_tier: "stable",
    max_tier_ever: "stable"
  };
  store.add(canonicalEntry);
  store.add(stableEntry);
  const STABLE_PLUS = /* @__PURE__ */ new Set(["stable", "canonical", "enforced"]);
  const skillCompilerStub = {
    compile(entries) {
      return entries.filter((e) => e.status === "active" && STABLE_PLUS.has(e.current_tier)).map((e) => ({ ruleId: e.id, dirname: e.id, skillMd: formatAsAgentSkill(e) }));
    },
    async write(artifacts) {
      return { written: artifacts.map((a) => a.ruleId), skipped: [] };
    },
    async cleanup(ids) {
      return { removed: ids };
    }
  };
  const compileResult = await runCompile({
    store,
    skillCompiler: skillCompilerStub,
    bus,
    dryRun: true
  });
  bus.emit({
    kind: "skeleton.skills-compiled",
    source: "skeleton",
    written: compileResult.skills.written,
    legacyDisabled: true,
    severity: "highlight",
    timestamp: now,
    userFacingValue: [
      "CLAUDE.md \u51FA\u53E3\uFF1Alegacy/internal \u5DF2\u7981\u7528\uFF08\u666E\u901A\u547D\u4EE4\u4E0D\u5199 root rule dump\uFF09",
      `Skills \u51FA\u53E3\uFF1Astable+ \u89C4\u5219 ${compileResult.skills.written.length} \u6761 \u2192 ~/.claude/skills/teamagent/ \u76EE\u5F55\uFF08dry-run\uFF0C\u672A\u5B9E\u9645\u5199\u5165\uFF09`,
      `  \u5BFC\u51FA skill: [${compileResult.skills.written.join(", ")}]`
    ].join("\n  "),
    counterfactual: "\u6CA1\u6709 Skills \u7F16\u8BD1\uFF0C\u89C4\u5219\u65E0\u6CD5\u4F5C\u4E3A Claude Code skill \u88AB\u6240\u6709\u9879\u76EE\u590D\u7528"
  });
  const renderer = new StdoutRenderer();
  return renderer.render(bus.drain(), mode);
}

// ../cli/src/help-text.ts
init_esm_shims();
var STOREFRONT_ENTRIES = [
  {
    name: "init",
    group: "\u5165\u53E3",
    usage: "teamagent init [--target=claude|codex|both] [--install-plugins]",
    desc: "\u4E00\u952E\u88C5\u5230\u5F53\u524D\u9879\u76EE\uFF1A\u5EFA\u76EE\u5F55 + \u6CE8\u5165\u5143\u539F\u5219 + \u6CE8\u518C\u96C6\u6210 + \u5BFC\u51FA Skills"
  },
  {
    name: "analyze",
    group: "\u7279\u6027\u2460 AI \u4E0D\u518D\u91CD\u72AF\u65E7\u9519\uFF08\u81EA\u52A8\u6355\u83B7 + \u5B66\u4E60\uFF09",
    usage: "teamagent analyze [--commit]",
    desc: "\u5206\u6790 Claude Code \u4F1A\u8BDD\u65E5\u5FD7\uFF0C\u8BC6\u522B\u7EA0\u6B63\u65F6\u523B\uFF1B--commit \u63D0\u53D6\u6210\u77E5\u8BC6\u6761\u76EE\u5165\u5E93"
  },
  {
    name: "doctor",
    group: "\u7279\u6027\u2460 AI \u4E0D\u518D\u91CD\u72AF\u65E7\u9519\uFF08\u81EA\u52A8\u6355\u83B7 + \u5B66\u4E60\uFF09",
    usage: "teamagent doctor [--fix]",
    desc: "\u8BCA\u65AD\u5B89\u88C5\u73AF\u5883\uFF08Node / Claude Code / sqlite-vec / Hook / CLAUDE.md\uFF09"
  },
  {
    name: "dashboard",
    group: "\u672C\u5730\u72B6\u6001",
    usage: "teamagent dashboard --watch",
    desc: "\u542F\u52A8\u672C\u5730 HTML dashboard\uFF0C\u5468\u671F\u5237\u65B0\u771F\u5B9E\u89C4\u5219/\u4E8B\u4EF6\u6570\u636E\u5E76\u672C\u5730\u670D\u52A1"
  },
  {
    name: "daily",
    group: "\u672C\u5730\u72B6\u6001",
    usage: "teamagent daily",
    desc: "\u8DE8\u9879\u76EE\u626B\u4ECA\u5929\u6D3B\u52A8\uFF0C\u8F93\u51FA member\xD7project \u4E00\u53E5\u8BDD\u65E5\u62A5\u9AA8\u67B6"
  }
];
var STOREFRONT_COMMANDS = STOREFRONT_ENTRIES.map(
  (e) => e.name
);
var FOLDED_COMMANDS = [
  "install",
  "install-codex",
  "install-plugins",
  "install-hook",
  "install-user-hook",
  "uninstall",
  "uninstall-hook",
  "uninstall-user-hook",
  "enable",
  "disable",
  "config",
  "docs-propagate",
  "warmup"
];
var BACKGROUND_COMMANDS = [
  "skeleton-demo",
  "m5-infect",
  "m5-bootstrap",
  "m5-share",
  "m5-sync",
  "m5-replay",
  "m5-delete",
  "m5-status",
  "m5-publish",
  "inspect-member",
  "pitfall",
  "stats",
  "try",
  "demo",
  "review",
  "required-check",
  "calibrate",
  "verify",
  "verify-anchors",
  "e2e-evaluate",
  "ingest",
  "dogfood-report",
  "bug-report",
  "recording",
  "pack",
  "fixture",
  "symphony",
  "compile",
  "compile-cursor",
  "migrate-v6",
  "migrate-v7",
  "migrate",
  "scan-errors",
  "review-candidates",
  "team-export",
  "team-import",
  "sync",
  "pr-cycle",
  "migrate-auto",
  "update",
  "whatsnew",
  "pair",
  "reclassify"
];
var ALL_TRIAGED_COMMANDS = [
  ...STOREFRONT_COMMANDS,
  ...FOLDED_COMMANDS,
  ...BACKGROUND_COMMANDS
];
function isShowAll(rest) {
  return rest.includes("--all");
}
function buildStorefrontHelp() {
  const lines = [
    "teamagent \u2014 TeamAgent CLI",
    "",
    "\u9ED8\u8BA4\u53EA\u5217 8 \u4E2A\u95E8\u9762\u547D\u4EE4\uFF08\u6309 3 \u5927\u4E1A\u52A1\u7279\u6027\u7CBE\u9009\uFF09\u300267 \u4E2A\u547D\u4EE4\u5168\u90E8\u4ECD\u53EF\u8C03\u7528\u3002"
  ];
  let lastGroup = "";
  for (const entry of STOREFRONT_ENTRIES) {
    if (entry.group !== lastGroup) {
      lines.push("", `${entry.group}:`);
      lastGroup = entry.group;
    }
    lines.push(`  ${entry.usage}`, `      ${entry.desc}`);
  }
  lines.push(
    "",
    "\u914D\u7F6E / \u751F\u547D\u5468\u671F\uFF0813 \u4E2A\u5B89\u88C5\xB7\u5378\u8F7D\xB7\u5F00\u5173\xB7\u914D\u7F6E\u547D\u4EE4\u5DF2\u6298\u53E0\uFF0C\u5B8C\u6574\u5E2E\u52A9\u89C1 teamagent help --all\uFF09:",
    `  ${FOLDED_COMMANDS.join(" \xB7 ")}`,
    "",
    "\u5B8C\u6574 67 \u4E2A\u547D\u4EE4\uFF08\u542B 46 \u4E2A\u540E\u53F0\u5F15\u64CE\u5BA4\u547D\u4EE4\uFF09:  teamagent help --all",
    "",
    "\u73AF\u5883\u53D8\u91CF:",
    "  TEAMAGENT_VISIBILITY=silent|smart|verbose    \u5F52\u56E0\u6E32\u67D3\u6A21\u5F0F\uFF08\u9ED8\u8BA4 verbose\uFF09",
    ""
  );
  return lines.join("\n");
}

// ../cli/src/commands/m5-infect.ts
init_esm_shims();
import { promises as fs } from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
async function runM5Infect(opts) {
  const port = new FsBootstrap({
    readTeamagentVersion: async () => readSelfVersion(),
    readInstalledPlugins: async () => [],
    readInstalledProjectSkills: async () => [],
    readInstalledHooks: async () => []
  });
  const snap = await port.probeProject(opts.projectRoot);
  const author = opts.author ?? gitUserName(opts.projectRoot) ?? gitUserName() ?? "unknown";
  const teamagent_version = opts.teamagentVersion ?? await readSelfVersion() ?? "0.0.0";
  const now = opts.now ?? (/* @__PURE__ */ new Date()).toISOString();
  const plan = planInfection(snap, { author, now, teamagent_version });
  if (!plan.required) {
    return { written_files: [], written_dirs: [], skipped: true };
  }
  const writeRes = await port.applyInfection(opts.projectRoot, plan);
  let git_hookspath_set = false;
  let hookspath_blocked = false;
  let hookspath_existing;
  let existingValue = null;
  try {
    existingValue = execSync("git config --get core.hooksPath", {
      cwd: opts.projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim() || null;
  } catch {
    existingValue = null;
  }
  const safeExisting = existingValue === null || existingValue === ".githooks";
  if (safeExisting || opts.force) {
    try {
      execSync("git config core.hooksPath .githooks", {
        cwd: opts.projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      git_hookspath_set = true;
    } catch {
    }
  } else {
    hookspath_blocked = true;
    hookspath_existing = existingValue ?? "";
  }
  return {
    written_files: writeRes.written,
    chained_files: writeRes.chained,
    skipped_files: writeRes.skipped,
    written_dirs: plan.dirs_to_create,
    skipped: false,
    git_hookspath_set,
    hookspath_blocked,
    hookspath_existing
  };
}
async function readSelfVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(here, "..", "..", "..", "teamagent", "package.json"),
      path.resolve(here, "..", "..", "..", "..", "teamagent", "package.json")
    ];
    for (const p of candidates) {
      try {
        const raw = await fs.readFile(p, "utf8");
        return JSON.parse(raw).version ?? null;
      } catch {
      }
    }
    return null;
  } catch {
    return null;
  }
}
function gitUserName(cwd) {
  try {
    return execSync("git config user.name", {
      encoding: "utf8",
      ...cwd ? { cwd } : {}
    }).trim() || null;
  } catch {
    return null;
  }
}
function parseM5InfectArgs(args) {
  const opts = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--force") {
      opts.force = true;
      continue;
    }
    const take = (flag) => {
      if (a === flag) return args[++i];
      if (a.startsWith(flag + "=")) return a.slice(flag.length + 1);
      return void 0;
    };
    const r = take("--project-root");
    if (r !== void 0) {
      opts.projectRoot = r;
      continue;
    }
    const au = take("--author");
    if (au !== void 0) {
      opts.author = au;
      continue;
    }
    const tv = take("--teamagent-version");
    if (tv !== void 0) {
      opts.teamagentVersion = tv;
      continue;
    }
  }
  return opts;
}
var M5_INFECT_DEPRECATION_BANNER = "[legacy] `teamagent m5-infect` \u5DF2\u5F52\u6863\uFF0C\u8BF7\u6539\u7528\uFF1Ateamagent init .";
function renderM5InfectResult(r) {
  if (r.skipped) {
    return `${M5_INFECT_DEPRECATION_BANNER}
[m5-infect] \u9879\u76EE\u5DF2\u88AB\u4F20\u67D3\uFF0C\u65E0\u9700\u52A8\u4F5C\u3002`;
  }
  const lines = [M5_INFECT_DEPRECATION_BANNER, "[m5-infect] \u4F20\u67D3\u5B8C\u6210\u3002"];
  if (r.written_files.length) {
    lines.push("  \u5DF2\u5199\u5165\u6587\u4EF6:");
    for (const f of r.written_files) lines.push(`    - ${f}`);
  }
  if (r.chained_files && r.chained_files.length) {
    lines.push("  \u5DF2 chain-load \u8FDB\u73B0\u6709 hook (W15-003):");
    for (const f of r.chained_files) lines.push(`    - ${f}`);
  }
  if (r.skipped_files && r.skipped_files.length) {
    lines.push("  \u5DF2\u5B58\u5728\u5185\u5BB9\u3001\u4FDD\u7559\u539F\u6587\u4EF6 (idempotent):");
    for (const f of r.skipped_files) lines.push(`    - ${f}`);
  }
  if (r.written_dirs.length) {
    lines.push("  \u5DF2\u5EFA\u76EE\u5F55:");
    for (const d of r.written_dirs) lines.push(`    - ${d}`);
  }
  if (r.hookspath_blocked) {
    lines.push("");
    lines.push(
      `\u26A0\uFE0F  W15-002: core.hooksPath \u5DF2\u8BBE\u4E3A "${r.hookspath_existing}"\uFF08\u7591\u4F3C husky / lefthook / \u81EA\u5B9A\u4E49 hook \u6846\u67B6\uFF09\uFF0C\u672A\u8986\u76D6\u3002`
    );
    lines.push(
      "    \u2192 TeamAgent \u7684 .githooks/post-merge \u4E0D\u4F1A\u81EA\u52A8\u89E6\u53D1\uFF1B\u8BF7\u624B\u52A8\u628A hooks \u76EE\u5F55\u94FE\u5230 .githooks\uFF0C"
    );
    lines.push("      \u6216\u91CD\u8DD1 `teamagent m5-infect --force` \u663E\u5F0F\u8986\u76D6\u3002");
  }
  return lines.join("\n");
}

// ../cli/src/commands/m5-bootstrap.ts
init_esm_shims();
import { execSync as execSync2 } from "child_process";
import { existsSync } from "fs";
import * as path3 from "path";

// ../cli/src/m5-default-port.ts
init_esm_shims();
import { promises as fs2 } from "fs";
import * as os from "os";
import * as path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var ALL_HOOK_KINDS = [
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "SessionStart",
  "SessionEnd",
  "PreCompact"
];
function createDefaultBootstrapPort(projectRoot2) {
  return new FsBootstrap({
    readTeamagentVersion: readSelfVersion2,
    readInstalledPlugins: readInstalledPluginsImpl,
    readInstalledProjectSkills: async () => [],
    readInstalledHooks: () => readInstalledHooksImpl(projectRoot2)
  });
}
async function readSelfVersion2() {
  try {
    const here = path2.dirname(fileURLToPath2(import.meta.url));
    const candidates = [
      path2.resolve(here, "..", "..", "teamagent", "package.json"),
      path2.resolve(here, "..", "..", "..", "teamagent", "package.json"),
      path2.resolve(here, "..", "..", "..", "..", "teamagent", "package.json")
    ];
    for (const p of candidates) {
      try {
        const raw = await fs2.readFile(p, "utf8");
        const v = JSON.parse(raw).version;
        if (typeof v === "string" && v.length > 0) return v;
      } catch {
      }
    }
  } catch {
  }
  return null;
}
async function readHooksFromSettingsFile(settingsPath) {
  try {
    const raw = await fs2.readFile(settingsPath, "utf8");
    const cfg = JSON.parse(raw);
    const hooks = cfg.hooks ?? {};
    return ALL_HOOK_KINDS.filter((k) => hooks[k] !== void 0);
  } catch {
    return [];
  }
}
async function readInstalledHooksFromPaths(opts) {
  const [userHooks, projectHooks] = await Promise.all([
    opts.userSettingsPath ? readHooksFromSettingsFile(opts.userSettingsPath) : Promise.resolve([]),
    opts.projectSettingsPath ? readHooksFromSettingsFile(opts.projectSettingsPath) : Promise.resolve([])
  ]);
  return Array.from(/* @__PURE__ */ new Set([...userHooks, ...projectHooks]));
}
async function readInstalledHooksImpl(projectRoot2) {
  return readInstalledHooksFromPaths({
    userSettingsPath: path2.join(os.homedir(), ".claude", "settings.json"),
    projectSettingsPath: projectRoot2 ? path2.join(projectRoot2, ".claude", "settings.local.json") : void 0
  });
}
async function readInstalledPluginsImpl() {
  const pluginsDir = path2.join(os.homedir(), ".claude", "plugins", "installed");
  try {
    const entries = await fs2.readdir(pluginsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// ../cli/src/commands/m5-bootstrap.ts
async function runM5Bootstrap(opts) {
  const port = opts.port ?? createDefaultBootstrapPort(opts.projectRoot);
  const manifestRaw = await port.readManifest(opts.projectRoot);
  if (manifestRaw === null) {
    return { diff: null, reason: "no manifest (project not infected)" };
  }
  const manifest = parseManifest(manifestRaw);
  const localState = await port.getLocalState();
  const diff = computeBootstrapDiff(manifest, localState);
  if (opts.checkOnly !== false) {
    return { diff };
  }
  const applied = {};
  if (diff.install_plugins.length > 0) {
    try {
      applied.plugins = await executeInstallPlugins({
        only: diff.install_plugins
      });
    } catch (e) {
      applied.plugins = {
        ok: false,
        dryRun: false,
        marketplaces: [],
        plugins: diff.install_plugins.map((name) => ({
          name,
          status: "failed",
          detail: `install threw: ${e.message}`
        })),
        summary: {
          added: 0,
          alreadyPresent: 0,
          failed: diff.install_plugins.length,
          wouldDo: 0
        }
      };
    }
  }
  if (diff.install_teamagent_version) {
    applied.teamagent_install_command = `npm install -g github:libz-renlab-ai/TeamBrain#release  # \u5347\u7EA7\u5230 ${diff.install_teamagent_version}+`;
  }
  if (diff.install_project_skills.length > 0) {
    applied.skills_pending = diff.install_project_skills;
  }
  if (diff.install_hooks.length > 0) {
    applied.hooks_pending = diff.install_hooks;
  }
  if (existsSync(path3.join(opts.projectRoot, ".githooks"))) {
    try {
      execSync2("git config core.hooksPath .githooks", {
        cwd: opts.projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      applied.git_hookspath_set = true;
    } catch {
      applied.git_hookspath_set = false;
    }
  }
  return { diff, applied };
}
function parseM5BootstrapArgs(args) {
  const opts = {
    projectRoot: process.cwd(),
    checkOnly: true
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    } else if (a === "--check") {
      opts.checkOnly = true;
    } else if (a === "--apply") {
      opts.checkOnly = false;
    }
  }
  return opts;
}
function renderM5BootstrapResult(r) {
  if (!r.diff) {
    return {
      output: `[m5-bootstrap] ${r.reason ?? "ok"}`,
      exitCode: 0
    };
  }
  if (!r.diff.needs_bootstrap) {
    return { output: "[m5-bootstrap] OK\uFF0C\u65E0\u9700\u52A8\u4F5C\u3002", exitCode: 0 };
  }
  if (r.applied) {
    const lines = ["[m5-bootstrap] \u81EA\u52A8\u5B89\u88C5\u5B8C\u6210\uFF08apply \u6A21\u5F0F\uFF09\uFF1A"];
    if (r.applied.plugins) {
      const s = r.applied.plugins.summary;
      lines.push(
        `  \u63D2\u4EF6\uFF1Aadded=${s.added} already=${s.alreadyPresent} failed=${s.failed}`
      );
      for (const p of r.applied.plugins.plugins) {
        lines.push(`    [${p.status}] ${p.name} \u2014 ${p.detail}`);
      }
    }
    if (r.applied.teamagent_install_command) {
      lines.push(`  CLI \u5347\u7EA7\uFF08\u624B\u52A8\u8DD1\uFF09\uFF1A${r.applied.teamagent_install_command}`);
    }
    if (r.applied.skills_pending && r.applied.skills_pending.length) {
      lines.push(`  Skill \u5F85\u8865\uFF1A${r.applied.skills_pending.join(", ")}\uFF08M5-D2 \u81EA\u52A8\uFF09`);
    }
    if (r.applied.hooks_pending && r.applied.hooks_pending.length) {
      lines.push(`  Hook \u5F85\u8865\uFF1A${r.applied.hooks_pending.join(", ")}\uFF08teamagent install-user-hook\uFF09`);
    }
    return { output: lines.join("\n"), exitCode: 0 };
  }
  return {
    output: "[m5-bootstrap] \u9700\u8981\u8865\u9F50\uFF1A\n" + JSON.stringify(r.diff, null, 2),
    exitCode: 2
  };
}

// ../cli/src/commands/m5-sync.ts
init_esm_shims();
import * as path4 from "path";
import * as os2 from "os";
import * as fs3 from "fs";
import { execSync as execSync3 } from "child_process";
import { createHash } from "crypto";
function summarizeSkipReasons(skipped) {
  const buckets = /* @__PURE__ */ new Map();
  for (const s of skipped) {
    const cat = categorizeSkipReason(s.reason);
    buckets.set(cat, (buckets.get(cat) ?? 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => b[1] - a[1]);
}
function categorizeSkipReason(reason) {
  const r = reason.toLowerCase();
  if (r.includes("json") && (r.includes("parse") || r.includes("unexpected") || r.includes("invalid"))) {
    return "JSON parse error";
  }
  if (r.includes("future")) return "future timestamp";
  if (r.includes("schema") || r.includes("validation") || r.includes("required field") || r.includes("must be")) {
    return "schema violation";
  }
  if (r.includes("eperm") || r.includes("eacces")) return "permission denied";
  if (r.includes("enoent")) return "file vanished";
  return "other";
}
function sanitizeForTerminal(s) {
  return s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "?").replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
}
async function runM5Sync(opts) {
  const fsStore = new FsTeamRuleStore();
  const skipped = [];
  const claims = await fsStore.listAll(opts.projectRoot, {
    onSkip: (entry) => skipped.push(entry)
  });
  const merged = mergeLwwBatch(claims);
  const out = [];
  for (const [ruleId, mr] of merged) {
    out.push(formatMerged(ruleId, mr));
  }
  out.sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  const result = { total_claims: claims.length, merged: out };
  if (skipped.length > 0) {
    result.skipped_files = skipped;
  }
  if (opts.apply) {
    const teamId = computeTeamId(opts.projectRoot);
    const kb = opts.kbStore ?? openProjectKb(opts.projectRoot);
    const applied = {
      upserted: [],
      deleted: [],
      skipped: []
    };
    for (const [ruleId, mr] of merged) {
      if (!mr.winner) continue;
      try {
        if (mr.winner.deleted) {
          const wasThere = kb.delete(ruleId);
          if (wasThere) applied.deleted.push(ruleId);
        } else {
          const entry = teamRuleToKnowledgeEntry(
            ruleId,
            mr.winner,
            mr.original_author ?? "unknown",
            teamId
          );
          if (kb.getById(ruleId)) {
            kb.update(ruleId, entry);
          } else {
            kb.add(entry);
          }
          applied.upserted.push(ruleId);
        }
      } catch (e) {
        applied.skipped.push({
          rule_id: ruleId,
          reason: e.message
        });
      }
    }
    result.applied = applied;
  }
  return result;
}
function computeTeamId(projectRoot2) {
  try {
    const url = execSync3("git remote get-url origin", {
      cwd: projectRoot2,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
      // suppress stderr "No such remote"
    }).trim();
    if (!url) return void 0;
    const normalized = url.replace(/\.git$/, "").replace(/^https?:\/\/[^@\/]+@/, "https://").toLowerCase();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  } catch {
    return void 0;
  }
}
function openProjectKb(projectRoot2) {
  const projectDbPath = path4.join(projectRoot2, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path4.join(os2.homedir(), ".teamagent", "global.db");
  fs3.mkdirSync(path4.dirname(projectDbPath), { recursive: true });
  fs3.mkdirSync(path4.dirname(userGlobalDbPath), { recursive: true });
  return new DualLayerStore({ projectDbPath, userGlobalDbPath });
}
function formatMerged(ruleId, mr) {
  const w = mr.winner;
  if (!w) {
    return {
      rule_id: ruleId,
      state: "tombstone",
      winner_claim_author: mr.winner_claim_author ?? "",
      original_author: mr.original_author ?? ""
    };
  }
  if (w.deleted) {
    return {
      rule_id: ruleId,
      state: "tombstone",
      winner_claim_author: mr.winner_claim_author ?? "",
      original_author: mr.original_author ?? ""
    };
  }
  return {
    rule_id: ruleId,
    state: "alive",
    winner_claim_author: mr.winner_claim_author ?? "",
    original_author: mr.original_author ?? "",
    // B-130: strip ANSI escapes / control chars so a malicious rule cannot
    // clear the user's terminal or inject cursor sequences when printed.
    summary: sanitizeForTerminal(w.content.slice(0, 60))
  };
}
function parseM5SyncArgs(args) {
  const opts = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    } else if (a === "--apply") {
      opts.apply = true;
    }
  }
  return opts;
}
function renderM5SyncResult(r) {
  const lines = [];
  lines.push(
    `[m5-sync] \u8BFB\u5230 ${r.total_claims} \u4E2A claim\uFF0C\u5408\u5E76\u4E3A ${r.merged.length} \u6761\u89C4\u5219\u3002`
  );
  for (const m of r.merged) {
    if (m.state === "alive") {
      lines.push(
        `  \u2713 ${m.rule_id} (claim=${m.winner_claim_author}, original=${m.original_author}): ${m.summary}`
      );
    } else {
      lines.push(
        `  \u2717 ${m.rule_id} (tombstone by ${m.winner_claim_author}, original=${m.original_author})`
      );
    }
  }
  if (r.skipped_files && r.skipped_files.length > 0) {
    lines.push(
      `[m5-sync] \u26A0 skipped ${r.skipped_files.length} file(s) (corrupt JSON / schema violation / future timestamp):`
    );
    if (r.skipped_files.length >= 5) {
      const breakdown = summarizeSkipReasons(r.skipped_files);
      for (const [cat, count] of breakdown) {
        lines.push(`    \xB7 ${cat}: ${count}`);
      }
      lines.push("");
    }
    for (const s of r.skipped_files) {
      lines.push(`  - ${s.path}: ${s.reason}`);
    }
  }
  if (r.applied) {
    lines.push(
      `[apply] upserted=${r.applied.upserted.length} deleted=${r.applied.deleted.length} skipped=${r.applied.skipped.length}`
    );
    for (const s of r.applied.skipped) {
      lines.push(`  ! skip ${s.rule_id}: ${s.reason}`);
    }
  }
  return lines.join("\n");
}

// ../cli/src/commands/m5-status.ts
init_esm_shims();
async function runM5Status(opts) {
  const port = createDefaultBootstrapPort(opts.projectRoot);
  const manifestRaw = await port.readManifest(opts.projectRoot);
  const result = {
    has_manifest: !!manifestRaw,
    team_rules_total_claims: 0,
    team_rules_alive: 0,
    team_rules_tombstoned: 0
  };
  if (manifestRaw) {
    const m = JSON.parse(manifestRaw);
    result.manifest_summary = {
      teamagent_version: m.teamagent_version,
      required_plugins: m.required_plugins,
      required_hooks: m.required_hooks,
      created_by: m.created_by
    };
    const bs = await runM5Bootstrap({
      projectRoot: opts.projectRoot,
      checkOnly: true
    });
    if (bs.diff) {
      if (bs.diff.needs_bootstrap) {
        const bits = [];
        if (bs.diff.install_teamagent_version)
          bits.push(`teamagent\u2192${bs.diff.install_teamagent_version}`);
        if (bs.diff.install_plugins.length)
          bits.push(`plugins:${bs.diff.install_plugins.join(",")}`);
        if (bs.diff.install_hooks.length)
          bits.push(`hooks:${bs.diff.install_hooks.join(",")}`);
        result.bootstrap_diff_brief = `\u9700\u8865\u9F50 ${bits.join("; ")}`;
      } else {
        result.bootstrap_diff_brief = "OK\uFF0C\u65E0\u9700\u52A8\u4F5C";
      }
    }
  }
  const sync = await runM5Sync({ projectRoot: opts.projectRoot });
  result.team_rules_total_claims = sync.total_claims;
  for (const m of sync.merged) {
    if (m.state === "alive") result.team_rules_alive++;
    else result.team_rules_tombstoned++;
  }
  return result;
}
function parseM5StatusArgs(args) {
  const opts = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    }
  }
  return opts;
}
function renderM5StatusResult(r) {
  const lines = [];
  lines.push("=== TeamAgent M5 \u72B6\u6001 ===");
  if (!r.has_manifest) {
    lines.push("\u9879\u76EE\u5C1A\u672A\u4F20\u67D3\uFF08\u65E0 .teamagent/manifest.json\uFF09\u3002");
    lines.push("\u63D0\u793A\uFF1A\u8DD1 `teamagent m5-infect` \u5199\u5165\u5951\u7EA6\u3002");
    return lines.join("\n");
  }
  const m = r.manifest_summary;
  lines.push(`\u5951\u7EA6\uFF08manifest\uFF09\uFF1A`);
  lines.push(`  \u521B\u5EFA\u8005\uFF1A${m.created_by}`);
  lines.push(`  TeamAgent \u7248\u672C\uFF1A${m.teamagent_version}`);
  lines.push(`  \u5FC5\u5907\u63D2\u4EF6\uFF1A${m.required_plugins.join(", ") || "(\u65E0)"}`);
  lines.push(`  \u5FC5\u5907 hook\uFF1A${m.required_hooks.join(", ") || "(\u65E0)"}`);
  lines.push(`\u672C\u673A vs \u5951\u7EA6\uFF1A${r.bootstrap_diff_brief}`);
  lines.push(``);
  lines.push(
    `\u56E2\u961F\u89C4\u5219\u96C6\uFF1A${r.team_rules_total_claims} \u4E2A claim\uFF0C\u5408\u5E76\u540E alive=${r.team_rules_alive} / tombstoned=${r.team_rules_tombstoned}`
  );
  return lines.join("\n");
}

// ../cli/src/commands/inspect-member.ts
init_esm_shims();
import path5 from "path";
import fs4 from "fs";
import os3 from "os";
import { randomBytes } from "crypto";

// ../core/src/live-inspection/index.ts
init_esm_shims();

// ../core/src/live-inspection/correlate.ts
init_esm_shims();
function correlate(input) {
  const { since, until } = input.window;
  const counts = {
    events: 0,
    commits: 0,
    prsOpened: 0,
    prsMerged: 0,
    issuesOpened: 0,
    preDenied: 0,
    narrativeRecurred: 0,
    userPromptInjected: 0
  };
  const timeline = [];
  for (const e of input.events) {
    if (e.timestamp < since || e.timestamp > until) continue;
    timeline.push({ kind: "event", at: e.timestamp, event: e });
    counts.events++;
    if (e.kind === "hook-pre.blocked") counts.preDenied++;
    if (e.kind === "ai.narrative.recurred") counts.narrativeRecurred++;
    if (e.kind === "ai.narrative.injected") counts.userPromptInjected++;
  }
  for (const c of input.commits) {
    if (c.authoredAt < since || c.authoredAt > until) continue;
    timeline.push({ kind: "commit", at: c.authoredAt, commit: c });
    counts.commits++;
  }
  for (const p of input.pullRequests) {
    if (p.createdAt < since || p.createdAt > until) continue;
    timeline.push({ kind: "pull-request", at: p.createdAt, pr: p });
    counts.prsOpened++;
    if (p.state === "merged" && p.mergedAt) counts.prsMerged++;
  }
  for (const i of input.issues) {
    if (i.createdAt < since || i.createdAt > until) continue;
    timeline.push({ kind: "issue", at: i.createdAt, issue: i });
    counts.issuesOpened++;
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));
  return { timeline, counts };
}

// ../core/src/live-inspection/detect-abnormal.ts
init_esm_shims();
var DEFAULT_THRESHOLDS = {
  repeatedDenyN: 3,
  educationLoopN: 3,
  stuckInjectedN: 10,
  noActivityWhen: "always"
};
function detectAbnormal(counts, thresholds = DEFAULT_THRESHOLDS) {
  const signals = [];
  if (counts.preDenied >= thresholds.repeatedDenyN) {
    signals.push({
      id: "repeated_deny",
      message: `Pre-tool-use deny fired ${counts.preDenied} times in the window \u2014 member may be repeatedly attempting blocked actions.`,
      evidence: {
        preDenied: counts.preDenied,
        threshold: thresholds.repeatedDenyN
      }
    });
  }
  if (counts.narrativeRecurred >= thresholds.educationLoopN) {
    signals.push({
      id: "education_loop",
      message: `Narrative-rule recurrence ${counts.narrativeRecurred} times \u2014 previously injected guidance is being ignored.`,
      evidence: {
        narrativeRecurred: counts.narrativeRecurred,
        threshold: thresholds.educationLoopN
      }
    });
  }
  if (counts.commits === 0 && counts.userPromptInjected >= thresholds.stuckInjectedN) {
    signals.push({
      id: "stuck",
      message: `${counts.userPromptInjected} prompt injections with 0 commits \u2014 many interactions, no shipped code.`,
      evidence: {
        userPromptInjected: counts.userPromptInjected,
        commits: counts.commits,
        threshold: thresholds.stuckInjectedN
      }
    });
  }
  if (thresholds.noActivityWhen === "always" && counts.events === 0 && counts.commits === 0 && counts.prsOpened === 0 && counts.issuesOpened === 0) {
    signals.push({
      id: "no_activity",
      message: "No AI events and no GitHub activity in the window.",
      evidence: { ...counts }
    });
  }
  return signals;
}

// ../core/src/live-inspection/summarize.ts
init_esm_shims();
function escapeMdInline(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/[\r\n]+/g, " ").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function summarize(result) {
  const lines = [];
  lines.push(`## Inspection summary`);
  lines.push("");
  lines.push(`- **member**: \`${escapeMdInline(result.member)}\``);
  if (result.project)
    lines.push(`- **project**: \`${escapeMdInline(result.project)}\``);
  lines.push(
    `- **window**: ${result.window.since} \u2192 ${result.window.until}`
  );
  lines.push(`- **generated at**: ${result.generatedAt}`);
  lines.push("");
  lines.push(`### Counts`);
  lines.push("");
  const c = result.counts;
  lines.push(`- AI events: **${c.events}**`);
  lines.push(`- commits: **${c.commits}**`);
  lines.push(
    `- PRs: **${c.prsOpened}** opened, **${c.prsMerged}** merged`
  );
  lines.push(`- issues opened: **${c.issuesOpened}**`);
  lines.push(`- pre-tool-use denies: **${c.preDenied}**`);
  lines.push(`- narrative recurrences: **${c.narrativeRecurred}**`);
  lines.push(`- prompt injections: **${c.userPromptInjected}**`);
  lines.push("");
  if (result.abnormalSignals.length > 0) {
    lines.push(`### \u{1F6A8} abnormal signals`);
    lines.push("");
    for (const s of result.abnormalSignals) {
      lines.push(`- **${s.id}**: ${s.message}`);
    }
    lines.push("");
  } else {
    lines.push(`### Status`);
    lines.push("");
    lines.push(`healthy \u2014 no abnormal signals detected.`);
    lines.push("");
  }
  if (result.timeline.length > 0) {
    lines.push(`### Recent timeline (${result.timeline.length} entries)`);
    lines.push("");
    for (const entry of result.timeline.slice(-20)) {
      lines.push(`- \`${entry.at}\` ${renderEntry(entry)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function renderEntry(entry) {
  switch (entry.kind) {
    case "event":
      return `event \`${escapeMdInline(entry.event.kind)}\``;
    case "commit":
      return `commit \`${entry.commit.sha.slice(0, 7)}\` ${escapeMdInline(
        entry.commit.message
      )}`;
    case "pull-request":
      return `PR #${entry.pr.number} (${entry.pr.state}) ${escapeMdInline(
        entry.pr.title
      )}`;
    case "issue":
      return `issue #${entry.issue.number} (${entry.issue.state}) ${escapeMdInline(entry.issue.title)}`;
  }
}

// ../core/src/live-inspection/freeze-incident.ts
init_esm_shims();
function freezeIncident(input) {
  const max = input.maxTimeline ?? 200;
  const trimmed = input.result.timeline.length > max ? input.result.timeline.slice(-max) : input.result.timeline;
  const yyyymmddhhmm = input.now.replace(/[-:]/g, "").replace(/T/, "T").slice(0, 13);
  return {
    incidentId: `${input.result.member}-${yyyymmddhhmm}-${input.randomSuffix}`,
    member: input.result.member,
    project: input.result.project,
    frozenAt: input.now,
    window: input.result.window,
    signals: input.result.abnormalSignals,
    timeline: trimmed,
    counts: input.result.counts
  };
}

// ../cli/src/commands/inspect-member.ts
var InspectMemberError = class extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
  kind;
};
function parseInspectMemberArgs(args) {
  let member;
  let project;
  let window = "24h";
  let now;
  let out;
  let githubFake = false;
  let fakeAbnormal;
  let teamagentHome;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--project") project = args[++i];
    else if (a?.startsWith("--project="))
      project = a.slice("--project=".length);
    else if (a === "--window") {
      const v = takeValue(args, ++i, "--window");
      if (v !== "24h" && v !== "7d" && v !== "since-creation") {
        throw new InspectMemberError(
          "bad_flag",
          `unknown --window value: ${v}`
        );
      }
      window = v;
    } else if (a === "--now") now = takeValue(args, ++i, "--now");
    else if (a?.startsWith("--now=")) now = a.slice("--now=".length);
    else if (a === "--out") out = takeValue(args, ++i, "--out");
    else if (a?.startsWith("--out=")) out = a.slice("--out=".length);
    else if (a === "--github-fake") githubFake = true;
    else if (a === "--fake-abnormal") {
      const v = takeValue(args, ++i, "--fake-abnormal");
      if (v !== "repeated_deny" && v !== "education_loop" && v !== "stuck") {
        throw new InspectMemberError(
          "bad_flag",
          `unknown --fake-abnormal value: ${v}`
        );
      }
      fakeAbnormal = v;
    } else if (a === "--teamagent-home")
      teamagentHome = takeValue(args, ++i, "--teamagent-home");
    else if (a?.startsWith("--teamagent-home="))
      teamagentHome = a.slice("--teamagent-home=".length);
    else if (a === "--help" || a === "-h") {
    } else if (!a.startsWith("--") && !member) {
      member = a;
    }
  }
  if (!member) {
    throw new InspectMemberError(
      "missing_member",
      "missing member (positional argument)"
    );
  }
  return {
    member,
    project,
    window,
    now: now ?? (/* @__PURE__ */ new Date()).toISOString(),
    out,
    githubFake,
    fakeAbnormal,
    teamagentHome
  };
}
function renderInspectMemberHelp() {
  return [
    "Usage: teamagent inspect-member <member> [options]",
    "",
    "Click-time live inspection of a team member (issue #372). Pulls #308",
    "AI events + recent GitHub activity, summarizes progress, and freezes",
    "an incident if abnormal signals are detected.",
    "",
    "Options:",
    "  --project <owner/repo>     GitHub repo slug (default: omit \u2192 fake-only)",
    "  --window <name>            24h | 7d | since-creation",
    "                             (default: 24h)",
    "  --now <ISO8601>            override 'now' (default: real wall clock)",
    "  --out <path>               also write inspection JSON here",
    "  --github-fake              use in-memory fake GitHub adapter",
    "  --fake-abnormal <kind>     inject a fake abnormal-path fixture",
    "                             (repeated_deny | education_loop | stuck)",
    "  --teamagent-home <dir>     override TEAMAGENT_HOME (default: env or",
    "                             ~/.teamagent)",
    "  -h, --help                 show this help"
  ].join("\n");
}
function takeValue(args, i, flag) {
  const v = args[i];
  if (v === void 0) {
    throw new InspectMemberError(
      "bad_flag",
      `${flag} requires a value`
    );
  }
  return v;
}
async function executeInspectMember(opts, deps = {}) {
  const writeFile = deps.writeFile ?? defaultWriteFile;
  const randomSuffix = deps.randomSuffix ?? defaultRandomSuffix;
  const home = opts.teamagentHome ?? process.env["TEAMAGENT_HOME"] ?? path5.join(os3.homedir(), ".teamagent");
  const window = resolveWindow(opts.window, opts.now);
  const projectSlug = deriveProjectSlug(opts.project);
  const eventsDbPath = path5.join(home, "events.db");
  const events = opts.fakeAbnormal ? fakeAbnormalEvents(opts.fakeAbnormal, opts.now) : deps.eventReader ? Array.from(deps.eventReader(eventsDbPath)) : readEventsFromDb(eventsDbPath);
  const ghPort = deps.githubFactory ? deps.githubFactory() : opts.githubFake ? new InMemoryGitHubActivityPort({
    commits: [],
    pullRequests: [],
    issues: []
  }) : new GhCliGitHubActivityAdapter({
    defaultProject: opts.project
  });
  const [commits, prs, issues] = await Promise.all([
    ghPort.fetchCommitsByAuthor({
      author: opts.member,
      project: opts.project,
      since: window.since,
      until: window.until
    }),
    ghPort.fetchPullRequestsByAuthor({
      author: opts.member,
      project: opts.project,
      since: window.since,
      until: window.until
    }),
    ghPort.fetchIssuesByAuthor({
      author: opts.member,
      project: opts.project,
      since: window.since,
      until: window.until
    })
  ]);
  const { timeline, counts } = correlate({
    events,
    commits,
    pullRequests: prs,
    issues,
    window
  });
  const abnormalSignals = detectAbnormal(counts);
  const result = {
    member: opts.member,
    project: opts.project,
    window,
    generatedAt: opts.now,
    counts,
    timeline,
    abnormalSignals
  };
  const inspectionsDir = path5.join(home, projectSlug, "inspections");
  const memberFsSafe = sanitize(opts.member);
  const inspectionFileName = `${tsForFilename(opts.now)}-${memberFsSafe}.json`;
  const inspectionPath = path5.join(inspectionsDir, inspectionFileName);
  writeFile(inspectionPath, JSON.stringify(result, null, 2) + "\n");
  if (opts.out) writeFile(opts.out, JSON.stringify(result, null, 2) + "\n");
  let incidentPath;
  if (abnormalSignals.length > 0) {
    const incident = freezeIncident({
      result,
      now: opts.now,
      randomSuffix: randomSuffix()
    });
    const incidentsDir = path5.join(home, projectSlug, "incidents");
    incidentPath = path5.join(incidentsDir, `${incident.incidentId}.json`);
    writeFile(incidentPath, JSON.stringify(incident, null, 2) + "\n");
  }
  return { result, inspectionPath, incidentPath };
}
function renderInspectMemberResult(out) {
  const md = summarize(out.result);
  const lines = [md, ""];
  lines.push(`> inspection: ${out.inspectionPath}`);
  if (out.incidentPath) lines.push(`> incident: ${out.incidentPath}`);
  return lines.join("\n");
}
function resolveWindow(window, now) {
  const nowMs = new Date(now).getTime();
  const until = new Date(nowMs).toISOString();
  let sinceMs = nowMs;
  switch (window) {
    case "24h":
      sinceMs = nowMs - 24 * 3600 * 1e3;
      break;
    case "7d":
      sinceMs = nowMs - 7 * 24 * 3600 * 1e3;
      break;
    case "since-creation":
      sinceMs = 0;
      break;
  }
  return { since: new Date(sinceMs).toISOString(), until };
}
function deriveProjectSlug(project) {
  if (!project) {
    const cwd = process.cwd();
    return sanitize(path5.basename(cwd));
  }
  const parts = project.split("/");
  return sanitize(parts[parts.length - 1] ?? project);
}
function sanitize(s) {
  return s.replace(/[^A-Za-z0-9._-]/g, "-").toLowerCase() || "default";
}
function tsForFilename(now) {
  return now.replace(/[-:]/g, "").replace(/T/, "T").slice(0, 15);
}
function defaultRandomSuffix() {
  return randomBytes(2).toString("hex");
}
function defaultWriteFile(filePath, contents) {
  fs4.mkdirSync(path5.dirname(filePath), { recursive: true });
  fs4.writeFileSync(filePath, contents, { encoding: "utf-8", mode: 384 });
}
function readEventsFromDb(dbPath) {
  if (!fs4.existsSync(dbPath)) return [];
  let log;
  try {
    log = new SqliteEventLog(openDb(dbPath));
    return log.readAll();
  } catch (err) {
    process.stderr.write(
      `inspect-member: failed to read events.db at ${dbPath}: ${err instanceof Error ? err.message : String(err)}
`
    );
    return [];
  } finally {
    log?.close();
  }
}
function fakeAbnormalEvents(kind, now) {
  const events = [];
  const nowMs = new Date(now).getTime();
  const push = (eventKind, extra = {}) => {
    events.push({
      id: `fake-${eventKind}-${events.length}`,
      kind: eventKind,
      timestamp: new Date(nowMs - events.length * 6e4).toISOString(),
      schema_version: 1,
      ...extra
    });
  };
  if (kind === "repeated_deny") {
    for (let i = 0; i < 3; i++) push("hook-pre.blocked");
  } else if (kind === "education_loop") {
    for (let i = 0; i < 3; i++) push("ai.narrative.recurred");
  } else if (kind === "stuck") {
    for (let i = 0; i < 10; i++) push("ai.narrative.injected");
  }
  return events;
}

// ../cli/src/commands/m5-publish.ts
init_esm_shims();
import { execSync as execSync4, execFileSync } from "child_process";
import { existsSync as existsSync2 } from "fs";
import * as path6 from "path";
async function runM5Publish(opts) {
  const result = {
    changes_count: 0,
    committed: false,
    pushed: false
  };
  const CANDIDATE_PATHS = [
    ".teamagent/team",
    ".teamagent/manifest.json",
    ".githooks"
  ];
  const PATHS = CANDIDATE_PATHS.filter(
    (p) => existsSync2(path6.join(opts.projectRoot, p))
  );
  if (PATHS.length === 0) {
    result.reason = "no team-rule / manifest / githooks paths exist yet";
    return result;
  }
  let status = "";
  try {
    status = execSync4(
      `git status --porcelain -- ${PATHS.join(" ")}`,
      { cwd: opts.projectRoot, encoding: "utf8" }
    );
  } catch (e) {
    result.reason = `git status failed: ${e.message}`;
    return result;
  }
  const lines = status.split("\n").filter((l) => l.trim().length > 0);
  result.changes_count = lines.length;
  if (lines.length === 0) {
    result.reason = "no team-rule / manifest / githooks changes to publish";
    return result;
  }
  try {
    execFileSync("git", ["add", ...PATHS], {
      cwd: opts.projectRoot,
      encoding: "utf8"
    });
  } catch (e) {
    result.reason = `git add failed: ${e.message}`;
    return result;
  }
  const prefix = opts.commitMsgPrefix ?? "[teamagent-sync]";
  const msg = `${prefix} sync ${lines.length} team rule(s)`;
  try {
    execFileSync("git", ["commit", "-m", msg], {
      cwd: opts.projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    result.committed = true;
    result.commit_sha = execSync4("git rev-parse HEAD", {
      cwd: opts.projectRoot,
      encoding: "utf8"
    }).trim();
  } catch (e) {
    result.reason = `git commit failed: ${e.message}`;
    return result;
  }
  const shouldPush = opts.push ?? false;
  if (shouldPush) {
    try {
      execSync4("git push", {
        cwd: opts.projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      result.pushed = true;
    } catch (e) {
      result.push_error = e.message;
    }
  }
  return result;
}
function parseM5PublishArgs(args) {
  const opts = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === void 0) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    } else if (a === "--push") {
      opts.push = true;
    } else if (a === "--no-push") {
      opts.push = false;
    }
  }
  return opts;
}
function renderM5PublishResult(r) {
  if (r.changes_count === 0) {
    return `[m5-publish] ${r.reason ?? "no changes"}`;
  }
  const lines = [];
  lines.push(`[m5-publish] ${r.changes_count} \u5904\u53D8\u5316`);
  if (r.committed) {
    lines.push(`  \u2713 committed: ${r.commit_sha?.slice(0, 12) ?? ""}`);
  } else {
    lines.push(`  \u2717 commit failed: ${r.reason}`);
  }
  if (r.pushed) {
    lines.push(`  \u2713 pushed to origin`);
  } else if (r.push_error) {
    lines.push(`  \u2717 push failed: ${r.push_error}`);
  }
  return lines.join("\n");
}

// ../cli/src/commands/m5-replay.ts
init_esm_shims();
import { promises as fs8 } from "fs";
import * as path10 from "path";

// ../adapters/src/m5/testing/index.ts
init_esm_shims();

// ../adapters/src/m5/testing/dual-home-setup.ts
init_esm_shims();
import { promises as fs5 } from "fs";
import * as path7 from "path";
import * as os4 from "os";
import { randomUUID } from "crypto";
var DEFAULT_PREFIX = "teamagent-m5-l4";
async function setupDualHomes(opts = {}) {
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const uuid = randomUUID();
  const parentTemplate = path7.join(os4.tmpdir(), `${prefix}-${uuid}-`);
  const parent = await fs5.mkdtemp(parentTemplate);
  const homeA = path7.resolve(parent, "homeA");
  const homeB = path7.resolve(parent, "homeB");
  const projectA = path7.resolve(parent, "projectA");
  const projectB = path7.resolve(parent, "projectB");
  await Promise.all([
    fs5.mkdir(path7.join(homeA, ".claude"), { recursive: true }),
    fs5.mkdir(path7.join(homeB, ".claude"), { recursive: true }),
    fs5.mkdir(path7.join(projectA, ".teamagent", "team"), { recursive: true }),
    fs5.mkdir(path7.join(projectB, ".teamagent", "team"), { recursive: true })
  ]);
  const cleanup = async () => {
    await fs5.rm(parent, { recursive: true, force: true });
  };
  return { homeA, homeB, projectA, projectB, cleanup };
}

// ../adapters/src/m5/testing/bare-git-bridge.ts
init_esm_shims();
import { execFileSync as execFileSync2 } from "child_process";
import { promises as fs6 } from "fs";
import * as os5 from "os";
import * as path8 from "path";

// ../adapters/src/m5/testing/fs-copy-bridge.ts
init_esm_shims();
import { promises as fs7 } from "fs";
import * as path9 from "path";
function createFsCopyBridge() {
  return new FsCopyBridgeImpl();
}
var FsCopyBridgeImpl = class {
  async copyTeamRules(fromProjectRoot, toProjectRoot) {
    const srcTeamDir = path9.join(fromProjectRoot, ".teamagent", "team");
    const dstTeamDir = path9.join(toProjectRoot, ".teamagent", "team");
    let authors;
    try {
      authors = await fs7.readdir(srcTeamDir);
    } catch (e) {
      if (e.code === "ENOENT") return 0;
      throw e;
    }
    let copied = 0;
    for (const claimAuthor of authors) {
      const srcAuthorDir = path9.join(srcTeamDir, claimAuthor);
      let stat;
      try {
        stat = await fs7.stat(srcAuthorDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      let entries;
      try {
        entries = await fs7.readdir(srcAuthorDir);
      } catch {
        continue;
      }
      const dstAuthorDir = path9.join(dstTeamDir, claimAuthor);
      let dstAuthorDirReady = false;
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const srcFile = path9.join(srcAuthorDir, entry);
        let entryStat;
        try {
          entryStat = await fs7.stat(srcFile);
        } catch {
          continue;
        }
        if (!entryStat.isFile()) continue;
        if (!dstAuthorDirReady) {
          await fs7.mkdir(dstAuthorDir, { recursive: true });
          dstAuthorDirReady = true;
        }
        const finalPath = path9.join(dstAuthorDir, entry);
        const tmpPath = `${finalPath}.tmp.${process.pid}.${Date.now()}.${copied}`;
        await fs7.copyFile(srcFile, tmpPath);
        await fs7.rename(tmpPath, finalPath);
        copied += 1;
      }
    }
    return copied;
  }
};

// ../adapters/src/m5/testing/mock-llm-responder.ts
init_esm_shims();
var DEFAULT_RESPONSE = Object.freeze({
  text: "ok",
  toolCalls: []
});

// ../cli/src/commands/m5-replay.ts
var M5ReplayArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "M5ReplayArgError";
  }
};
var DEFAULT_SCENARIOS_ROOT = "tests/fixtures/scenarios";
function parseM5ReplayArgs(argv) {
  const opts = { slug: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug" || a === "--scenario") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) {
        throw new M5ReplayArgError(`${a} requires a value`);
      }
      opts.slug = v;
    } else if (a.startsWith("--slug=")) {
      opts.slug = a.slice("--slug=".length);
    } else if (a.startsWith("--scenario=")) {
      opts.slug = a.slice("--scenario=".length);
    } else if (a === "--transit") {
      const v = argv[++i];
      if (v !== "fs-copy" && v !== "bare-git") {
        throw new M5ReplayArgError(`--transit must be fs-copy|bare-git, got "${v ?? ""}"`);
      }
      opts.transit = v;
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--scenarios-root") {
      const v = argv[++i];
      if (!v) throw new M5ReplayArgError("--scenarios-root requires a value");
      opts.scenariosRoot = v;
    } else if (a === "--help" || a === "-h") {
      throw new M5ReplayArgError(renderM5ReplayHelp());
    } else if (a.startsWith("--")) {
      throw new M5ReplayArgError(`unknown flag "${a}"`);
    }
  }
  if (!opts.slug) {
    throw new M5ReplayArgError("missing --slug; usage: m5-replay --slug <id> [--transit fs-copy|bare-git] [--json]");
  }
  return opts;
}
function renderM5ReplayHelp() {
  return [
    "Usage: teamagent m5-replay --slug <scenario-id> [--transit fs-copy|bare-git] [--json]",
    "",
    "Replays an m5 rule propagation scenario fixture through the A\u2192B pipeline",
    "and emits a deterministic PASS/FAIL verdict.",
    "",
    "Options:",
    "  --slug ID            Scenario slug, e.g. m5-rule-propagation-l4-avoidance",
    "  --scenario ID        Alias for --slug",
    "  --transit fs-copy    Use slice 1 fs-copy fast track (default)",
    "  --transit bare-git   Use slice 1 bare-git slow track (TODO: not wired in slice 6)",
    "  --scenarios-root D   Override scenarios root (default tests/fixtures/scenarios)",
    "  --json               Emit single-line JSON instead of human-readable text",
    ""
  ].join("\n");
}
async function executeM5Replay(opts) {
  const root = opts.scenariosRoot ?? DEFAULT_SCENARIOS_ROOT;
  const fixtureDir = path10.join(root, opts.slug);
  const ruleJsonPath = path10.join(fixtureDir, "rule.json");
  let rule;
  try {
    rule = JSON.parse(await fs8.readFile(ruleJsonPath, "utf8"));
  } catch (e) {
    throw new M5ReplayArgError(
      `scenario "${opts.slug}" missing or unreadable rule.json at ${ruleJsonPath}: ${e.message}`
    );
  }
  const transit = opts.transit ?? "fs-copy";
  if (transit === "bare-git") {
    throw new M5ReplayArgError("--transit=bare-git is reserved for a follow-up slice; use fs-copy for now");
  }
  const safePrefix = `m5-replay-${opts.slug.replace(/[^A-Za-z0-9._-]/g, "-")}`;
  const ctx = await setupDualHomes({ prefix: safePrefix });
  try {
    const store = new FsTeamRuleStore();
    await store.writeRule(ctx.projectA, rule.author, rule);
    const bridge = createFsCopyBridge();
    await bridge.copyTeamRules(ctx.projectA, ctx.projectB);
    const claims = await store.listAll(ctx.projectB);
    const bRule = claims.find(
      (c) => c.claim_author === rule.author && c.file.rule_id === rule.rule_id
    );
    if (!bRule) {
      return {
        scenario: opts.slug,
        transit,
        rule_landed_at_b: false,
        rule_id_match: false,
        content_match: false,
        confidence_match: false,
        scope_match: false,
        passed: false,
        diagnostic: `B's .teamagent/team/${rule.author}/${rule.rule_id}.json not found after transit`
      };
    }
    const ruleIdMatch = bRule.file.rule_id === rule.rule_id;
    let contentMatch = false;
    let confidenceMatch = false;
    let scopeMatch = false;
    if (rule.current.deleted === false && bRule.file.current.deleted === false) {
      contentMatch = bRule.file.current.content === rule.current.content;
      confidenceMatch = bRule.file.current.confidence === rule.current.confidence;
      scopeMatch = bRule.file.current.scope === rule.current.scope;
    } else if (rule.current.deleted === true && bRule.file.current.deleted === true) {
      contentMatch = true;
      confidenceMatch = true;
      scopeMatch = true;
    }
    const passed = ruleIdMatch && contentMatch && confidenceMatch && scopeMatch;
    return {
      scenario: opts.slug,
      transit,
      rule_landed_at_b: true,
      rule_id_match: ruleIdMatch,
      content_match: contentMatch,
      confidence_match: confidenceMatch,
      scope_match: scopeMatch,
      passed
    };
  } finally {
    await ctx.cleanup();
  }
}
function renderM5ReplayResult(result) {
  const lines = [];
  lines.push(`m5-replay: scenario=${result.scenario} transit=${result.transit}`);
  lines.push(`  rule_landed_at_b: ${result.rule_landed_at_b}`);
  lines.push(`  rule_id_match:    ${result.rule_id_match}`);
  lines.push(`  content_match:    ${result.content_match}`);
  lines.push(`  confidence_match: ${result.confidence_match}`);
  lines.push(`  scope_match:      ${result.scope_match}`);
  lines.push(`  verdict:          ${result.passed ? "PASS" : "FAIL"}`);
  if (result.diagnostic) {
    lines.push(`  diagnostic:       ${result.diagnostic}`);
  }
  return lines.join("\n");
}

// ../cli/src/commands/stats.ts
init_esm_shims();
import os6 from "os";
import path11 from "path";
import fs9 from "fs";
function resolvePaths(opts) {
  const home = opts.homeDir ?? os6.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    projectDbPath: opts.projectDbPath ?? path11.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path11.join(home, ".teamagent", "global.db"),
    eventsDbPath: opts.eventsDbPath ?? path11.join(home, ".teamagent", "events.db")
  };
}
function aggregateConfidenceMovements(events, windowDays, now) {
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1e3;
  const recent = events.filter((e) => {
    if (e.kind !== "calibrator.adjusted") return false;
    if (!e.knowledge_id) return false;
    if (typeof e.confidence_before !== "number") return false;
    if (typeof e.confidence_after !== "number") return false;
    try {
      return new Date(e.timestamp).getTime() >= cutoff;
    } catch {
      return false;
    }
  });
  const byId = /* @__PURE__ */ new Map();
  for (const e of recent) {
    const id = e.knowledge_id;
    const delta = e.confidence_after - e.confidence_before;
    const existing = byId.get(id);
    if (existing) {
      existing.totalDelta += delta;
      if (e.status_after === "archived") existing.archivedThisWindow = true;
    } else {
      byId.set(id, {
        knowledge_id: id,
        totalDelta: delta,
        archivedThisWindow: e.status_after === "archived"
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta)
  );
}
function aggregateUpgradeEvents7d(events, windowDays, now) {
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1e3;
  const counts = {
    promptShown: 0,
    snoozed: 0,
    neverSet: 0,
    installed: 0,
    total: 0
  };
  for (const e of events) {
    if (typeof e.kind !== "string" || !e.kind.startsWith("update-")) continue;
    let ts = 0;
    try {
      ts = new Date(e.timestamp).getTime();
    } catch {
      continue;
    }
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    switch (e.kind) {
      case "update-prompt-shown":
        counts.promptShown += 1;
        counts.total += 1;
        break;
      case "update-snoozed":
        counts.snoozed += 1;
        counts.total += 1;
        break;
      case "update-never-set":
        counts.neverSet += 1;
        counts.total += 1;
        break;
      case "update-installed":
        counts.installed += 1;
        counts.total += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}
function renderUpgradeEvents7d(counts, windowDays) {
  if (counts.total === 0) return "";
  const lines = [];
  lines.push(`\u5347\u7EA7\u4E8B\u4EF6\uFF08\u6700\u8FD1 ${windowDays} \u5929\uFF0C\u5171 ${counts.total} \u6761\uFF09:`);
  lines.push(`  banner \u5F39\u51FA (update-prompt-shown):  ${counts.promptShown}`);
  lines.push(`  snooze \u63A8\u8FDF (update-snoozed):       ${counts.snoozed}`);
  lines.push(`  \u6C38\u4E45\u5173\u95ED (update-never-set):        ${counts.neverSet}`);
  lines.push(`  \u5B89\u88C5\u5B8C\u6210 (update-installed):        ${counts.installed}`);
  return lines.join("\n") + "\n";
}
function renderStats(byScope, movements = [], windowDays = 7, upgradeCounts = { promptShown: 0, snoozed: 0, neverSet: 0, installed: 0, total: 0 }) {
  const all = [...byScope.personal, ...byScope.team, ...byScope.global];
  const active = all.filter((e) => e.status === "active");
  const archived = all.filter((e) => e.status === "archived");
  if (all.length === 0) {
    const emptyLines = [
      "\u{1F4CA} TeamAgent \u77E5\u8BC6\u5E93\u7EDF\u8BA1",
      "",
      "\u5C1A\u65E0\u77E5\u8BC6\u6761\u76EE\u3002",
      "",
      "\u5F55\u5165\u65B9\u5F0F:",
      "  pnpm teamagent pitfall            \u4EA4\u4E92\u5F0F\u5F55\u5165",
      "  pnpm teamagent pitfall --non-interactive --trigger=... --wrong=... --correct=... --reason=...",
      ""
    ];
    const upgradeBlockEarly = renderUpgradeEvents7d(upgradeCounts, windowDays);
    if (upgradeBlockEarly) {
      emptyLines.push(upgradeBlockEarly.trimEnd(), "");
    }
    return emptyLines.join("\n");
  }
  const byCategory = { C: 0, E: 0, S: 0, K: 0 };
  for (const e of active) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  const byScopeLevel = {
    personal: byScope.personal.filter((e) => e.status === "active").length,
    team: byScope.team.filter((e) => e.status === "active").length,
    global: byScope.global.filter((e) => e.status === "active").length
  };
  const topHits = active.filter((e) => e.hit_count > 0).sort((a, b) => b.hit_count - a.hit_count).slice(0, 5);
  const recent = active.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const lines = [];
  lines.push("\u{1F4CA} TeamAgent \u77E5\u8BC6\u5E93\u7EDF\u8BA1");
  lines.push("");
  lines.push(
    `\u603B\u6570: ${all.length} (\u6D3B\u8DC3 ${active.length}${archived.length > 0 ? `, \u5F52\u6863 ${archived.length}` : ""})`
  );
  lines.push("");
  lines.push("\u6309\u4F5C\u7528\u57DF:");
  lines.push(`  personal  ${byScopeLevel.personal}`);
  lines.push(`  team      ${byScopeLevel.team}`);
  lines.push(`  global    ${byScopeLevel.global}`);
  lines.push("");
  lines.push("\u6309\u5206\u7C7B:");
  lines.push(`  C \u4EE3\u7801\u5C42  ${byCategory.C}`);
  lines.push(`  E \u5DE5\u7A0B\u5C42  ${byCategory.E}`);
  lines.push(`  S \u7B56\u7565\u5C42  ${byCategory.S}`);
  lines.push(`  K \u8BA4\u77E5\u5C42  ${byCategory.K}`);
  lines.push("");
  if (topHits.length > 0) {
    lines.push(`Top ${topHits.length} \u9AD8\u9891\u547D\u4E2D:`);
    for (const e of topHits) {
      lines.push(
        `  [${e.hit_count}\u6B21] ${e.trigger} \u2192 ${e.correct_pattern} (conf=${e.confidence.toFixed(2)})`
      );
    }
    lines.push("");
  }
  lines.push(`\u6700\u8FD1 ${recent.length} \u6761\u65B0\u589E:`);
  for (const e of recent) {
    const date = e.created_at.slice(0, 10);
    lines.push(`  [${date}] ${e.category}/${e.tags[0] ?? "-"}  ${e.trigger}`);
  }
  if (movements.length > 0) {
    lines.push("");
    lines.push(`\u672C\u5468\uFF08${windowDays} \u5929\uFF09confidence \u53D8\u5316 top ${Math.min(5, movements.length)}:`);
    const triggerById = /* @__PURE__ */ new Map();
    for (const e of all) triggerById.set(e.id, e.trigger);
    for (const m of movements.slice(0, 5)) {
      const sign = m.totalDelta > 0 ? "+" : "";
      const tag = m.archivedThisWindow ? " [\u81EA\u52A8\u5F52\u6863]" : "";
      const trig = triggerById.get(m.knowledge_id) ?? "(\u5DF2\u5220)";
      lines.push(
        `  ${sign}${m.totalDelta.toFixed(2)}  ${m.knowledge_id}${tag}`
      );
      lines.push(`         ${trig.slice(0, 80)}`);
    }
  }
  const upgradeBlock = renderUpgradeEvents7d(upgradeCounts, windowDays);
  if (upgradeBlock) {
    lines.push("");
    lines.push(upgradeBlock.trimEnd());
  }
  return lines.join("\n") + "\n";
}
function renderExplain(entry, id) {
  if (!entry) {
    return `rule ${id} not found
`;
  }
  const debitUpdated = entry.demerit_last_updated || "never";
  const lines = [
    `rule ${entry.id}`,
    `  tier: ${entry.current_tier} (max ever: ${entry.max_tier_ever})`,
    `  confidence: ${entry.confidence.toFixed(3)}`,
    `  demerit: ${entry.demerit.toFixed(2)} (updated ${debitUpdated})`
  ];
  return lines.join("\n") + "\n";
}
function findStuckInPromotion(entries, stuckDays, now) {
  const cutoffMs = now.getTime() - stuckDays * 24 * 3600 * 1e3;
  return entries.filter((e) => {
    if (e.status !== "active") return false;
    if (e.current_tier !== "probation") return false;
    const enteredAt = e.tier_entered_at || e.created_at;
    if (!enteredAt) return true;
    try {
      return new Date(enteredAt).getTime() <= cutoffMs;
    } catch {
      return false;
    }
  });
}
function renderStuckInPromotion(stuck, stuckDays, now) {
  if (stuck.length === 0) {
    return `\u{1F4CC} stuck-in-promotion: \u65E0\u89C4\u5219\u5361\u5728 probation \u8D85 ${stuckDays} \u5929
`;
  }
  const lines = [];
  lines.push(`\u{1F4CC} stuck-in-promotion\uFF08probation tier > ${stuckDays} \u5929\uFF0C\u5171 ${stuck.length} \u6761\uFF09:`);
  lines.push("");
  const COL_ID = 24;
  const COL_DAYS = 6;
  lines.push(
    `  ${"ID".padEnd(COL_ID)} ${"\u5929\u6570".padStart(COL_DAYS)}  Trigger`
  );
  lines.push("  " + "\u2500".repeat(COL_ID + COL_DAYS + 14));
  for (const e of stuck) {
    const enteredAt = e.tier_entered_at || e.created_at;
    let days = "?";
    if (enteredAt) {
      try {
        const d = Math.floor((now.getTime() - new Date(enteredAt).getTime()) / (24 * 3600 * 1e3));
        days = String(d);
      } catch {
      }
    }
    lines.push(
      `  ${e.id.padEnd(COL_ID)} ${days.padStart(COL_DAYS)}  ${e.trigger.slice(0, 60)}`
    );
  }
  lines.push("");
  return lines.join("\n");
}
function renderOverrideSignals(events) {
  const counts = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.kind !== "ai.override.ignored" && e.kind !== "ai.override.complied") continue;
    const id = e.knowledge_id ?? "(unknown)";
    const entry = counts.get(id) ?? { ignored: 0, complied: 0 };
    if (e.kind === "ai.override.ignored") entry.ignored++;
    else entry.complied++;
    counts.set(id, entry);
  }
  if (counts.size === 0) {
    return "TeamAgent Override Signals\n\n  (\u65E0\u8BB0\u5F55)\n";
  }
  const rows = [...counts.entries()].sort((a, b) => b[1].ignored - a[1].ignored);
  const lines = ["TeamAgent Override Signals", ""];
  lines.push(
    "  Rule ID".padEnd(32) + "ignored".padEnd(10) + "complied"
  );
  lines.push("  " + "\u2500".repeat(50));
  for (const [id, { ignored, complied }] of rows) {
    lines.push(
      `  ${id.slice(0, 30).padEnd(32)}ignored: ${String(ignored).padEnd(6)}complied: ${complied}`
    );
  }
  lines.push("");
  return lines.join("\n");
}
function executeStats(opts = {}) {
  const paths = resolvePaths(opts);
  const windowDays = opts.windowDays ?? 7;
  const now = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
  if (opts.stuckInPromotion) {
    const stuckDays = opts.stuckDays ?? 14;
    let allEntries = [];
    try {
      const projectDbExists = fs9.existsSync(paths.projectDbPath);
      const globalDbExists = fs9.existsSync(paths.userGlobalDbPath);
      if (projectDbExists || globalDbExists) {
        fs9.mkdirSync(path11.dirname(paths.projectDbPath), { recursive: true });
        fs9.mkdirSync(path11.dirname(paths.userGlobalDbPath), { recursive: true });
        const store = new DualLayerStore({
          projectDbPath: paths.projectDbPath,
          userGlobalDbPath: paths.userGlobalDbPath
        });
        allEntries = store.getAll();
        store.close();
      }
    } catch {
    }
    const stuck = findStuckInPromotion(allEntries, stuckDays, now);
    return duckifyText(renderStuckInPromotion(stuck, stuckDays, now));
  }
  if (opts.overrideSignals) {
    let events2 = [];
    try {
      if (fs9.existsSync(paths.eventsDbPath)) {
        const eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
        events2 = eventLog.readAll();
        eventLog.close();
      }
    } catch {
    }
    return duckifyText(renderOverrideSignals(events2));
  }
  if (opts.explain !== void 0) {
    const id = opts.explain;
    let entry;
    try {
      const projectDbExists = fs9.existsSync(paths.projectDbPath);
      const globalDbExists = fs9.existsSync(paths.userGlobalDbPath);
      if (projectDbExists || globalDbExists) {
        fs9.mkdirSync(path11.dirname(paths.projectDbPath), { recursive: true });
        fs9.mkdirSync(path11.dirname(paths.userGlobalDbPath), { recursive: true });
        const store = new DualLayerStore({
          projectDbPath: paths.projectDbPath,
          userGlobalDbPath: paths.userGlobalDbPath
        });
        entry = store.getById(id);
        store.close();
      }
    } catch {
    }
    return duckifyText(renderExplain(entry, id));
  }
  let events = [];
  try {
    if (fs9.existsSync(paths.eventsDbPath)) {
      const eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
      events = eventLog.readAll();
      eventLog.close();
    }
  } catch {
  }
  const movements = aggregateConfidenceMovements(events, windowDays, now);
  const upgradeCounts = aggregateUpgradeEvents7d(events, windowDays, now);
  let personal = [];
  let team = [];
  let global = [];
  try {
    const projectDbExists = fs9.existsSync(paths.projectDbPath);
    const globalDbExists = fs9.existsSync(paths.userGlobalDbPath);
    if (projectDbExists || globalDbExists) {
      fs9.mkdirSync(path11.dirname(paths.projectDbPath), { recursive: true });
      fs9.mkdirSync(path11.dirname(paths.userGlobalDbPath), { recursive: true });
      const store = new DualLayerStore({
        projectDbPath: paths.projectDbPath,
        userGlobalDbPath: paths.userGlobalDbPath
      });
      const all = store.getAll();
      store.close();
      personal = all.filter((e) => e.scope.level === "personal");
      team = all.filter((e) => e.scope.level === "team");
      global = all.filter((e) => e.scope.level === "global");
    }
  } catch {
  }
  return duckifyText(renderStats(
    { personal, team, global },
    movements,
    windowDays,
    upgradeCounts
  ));
}

// ../cli/src/commands/install-manifest.ts
init_esm_shims();
var DEFAULT_PROJECT_SKILLS = [
  "canary",
  "design-html",
  "design-shotgun",
  "office-hours",
  "plan-ceo-review",
  "claim-to-merge"
];
var VECTOR_MODEL_SIZE_MB = 120;
var CONFIG_WRITE_KB = 1;
function renderInstallManifest(opts = {}) {
  const skillIds = opts.projectSkills ?? DEFAULT_PROJECT_SKILLS;
  const modelMb = opts.vectorModelSizeMb ?? VECTOR_MODEL_SIZE_MB;
  const configKb = opts.configWriteKb ?? CONFIG_WRITE_KB;
  return {
    config: {
      header: "[config]",
      lines: [
        `~/.teamagent/config.json  (~${configKb} KB write)`,
        "  user-level config; created on first run, idempotent on rerun."
      ]
    },
    skills: {
      header: "[skills]",
      lines: [
        `<project>/.claude/skills/  (${skillIds.length} project-level skill files: ${skillIds.join(", ")})`,
        "  user-level ~/.claude/skills/teamagent/<id>/SKILL.md is the compile output downstream of [kb] and is NOT listed here."
      ]
    },
    kb: {
      header: "[kb]",
      lines: [
        ".teamagent/kb/  (project knowledge base; user-level ~/.claude/skills/teamagent/<id>/SKILL.md is the compile output downstream of [kb], not listed here)"
      ]
    },
    download: {
      header: "[download]",
      lines: [
        `vector model: ~${modelMb} MB  (downloaded in background after install; can be stopped any time via kill or rm)`,
        "  detached warmup per ADR-0001 (revised 2026-05-09); Stage-1 install returns ~3s.",
        "  no foreground skip flag is exposed; abort by killing the warmup pid or removing in-progress files."
      ]
    },
    refusal: {
      header: "[refusal]",
      lines: [
        "Pressing No leaves no half-state; the vector-model background warmup can be killed or removed at any time."
      ]
    }
  };
}
function formatInstallManifest(manifest) {
  const sections = [
    manifest.config,
    manifest.skills,
    manifest.kb,
    manifest.download,
    manifest.refusal
  ];
  const blocks = [];
  for (const section of sections) {
    const block = [section.header, ...section.lines].join("\n");
    blocks.push(block);
  }
  return blocks.join("\n\n") + "\nExit code: 0\n";
}
function renderInstallPreviewOutput(opts = {}) {
  return formatInstallManifest(renderInstallManifest(opts));
}
function parseInstallArgs(argv) {
  return {
    preview: argv.includes("--preview"),
    yes: argv.includes("--yes") || argv.includes("-y"),
    nonInteractive: argv.includes("--non-interactive"),
    help: argv.includes("--help") || argv.includes("-h")
  };
}

// ../cli/src/commands/install.ts
init_esm_shims();
import { spawn as nodeSpawn } from "child_process";
import fs11 from "fs";
import os8 from "os";
import path13 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// ../core/src/install-state/index.ts
init_esm_shims();

// ../core/src/install-state/schema.ts
init_esm_shims();
var STEP_KEYS = [
  "npm-global-install",
  "hook-write",
  "plugin-copy",
  "config-write",
  "migration-apply",
  "post-install-verify"
];
var StepKeySchema = external_exports.enum(STEP_KEYS);
var InstallStateV1Schema = external_exports.object({
  schemaVersion: external_exports.literal("v1"),
  projectId: external_exports.string().min(1),
  createdAt: external_exports.number().int().nonnegative(),
  updatedAt: external_exports.number().int().nonnegative(),
  completedSteps: external_exports.array(StepKeySchema),
  lastRunAt: external_exports.number().int().nonnegative()
});
var InstallStateSchema = InstallStateV1Schema;

// ../core/src/install-state/encode.ts
init_esm_shims();
function serializeState(state) {
  const validated = InstallStateSchema.parse(state);
  return JSON.stringify(validated, null, 2);
}
function parseState(raw) {
  if (raw === null || raw === void 0) {
    return { ok: false, reason: "missing" };
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "missing" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  const result = InstallStateSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "schema-mismatch" };
  }
  return { ok: true, state: result.data };
}

// ../core/src/install-state/lifecycle.ts
init_esm_shims();
function makeEmptyState(projectId, now = Date.now()) {
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("makeEmptyState: projectId must be a non-empty string");
  }
  if (!Number.isFinite(now) || now < 0) {
    throw new Error("makeEmptyState: now must be a non-negative finite number");
  }
  return {
    schemaVersion: "v1",
    projectId,
    createdAt: now,
    updatedAt: now,
    completedSteps: [],
    lastRunAt: now
  };
}
function isStepDone(state, step) {
  return state.completedSteps.includes(step);
}
function markStepDone(state, step, now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) {
    throw new Error("markStepDone: now must be a non-negative finite number");
  }
  const completedSteps = state.completedSteps.includes(step) ? state.completedSteps : [...state.completedSteps, step];
  return {
    schemaVersion: state.schemaVersion,
    projectId: state.projectId,
    createdAt: state.createdAt,
    updatedAt: now,
    completedSteps,
    lastRunAt: now
  };
}

// ../core/src/install-state/project-id.ts
init_esm_shims();
import { createHash as createHash2 } from "crypto";
function resolveProjectId(projectDir) {
  if (typeof projectDir !== "string" || projectDir.length === 0) {
    throw new Error(
      "resolveProjectId: projectDir must be a non-empty string"
    );
  }
  const normalized = normalizeProjectDir(projectDir);
  const digest = createHash2("sha256").update(normalized).digest("hex");
  return `p_${digest.slice(0, 16)}`;
}
function normalizeProjectDir(projectDir) {
  let normalized = projectDir;
  if ((normalized.endsWith("/") || normalized.endsWith("\\")) && normalized.length > 1 && !/^[a-zA-Z]:[/\\]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  if (/^[A-Z]:/.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

// ../core/src/install-state/checkpoint.ts
init_esm_shims();
async function checkpoint(store, projectId, step, now = Date.now()) {
  const loaded = await store.load(projectId);
  const base = loaded ?? makeEmptyState(projectId, now);
  const next = markStepDone(base, step, now);
  await store.save(projectId, next);
  return next;
}

// ../cli/src/install-state-fs-store.ts
init_esm_shims();
import { promises as fs10 } from "fs";
import path12 from "path";
import os7 from "os";
var FsInstallStateStore = class {
  rootDir;
  now;
  constructor(options = {}) {
    const envHome = process.env["TEAMAGENT_HOME"];
    const defaultRoot = envHome ?? path12.join(os7.homedir(), ".teamagent");
    this.rootDir = options.rootDir ?? defaultRoot;
    this.now = options.now ?? (() => Date.now());
  }
  /** Absolute path to the JSON file for this projectId. */
  filePath(projectId) {
    return path12.join(this.rootDir, "install-state", `${projectId}.json`);
  }
  async load(projectId) {
    const file = this.filePath(projectId);
    let raw;
    try {
      raw = await fs10.readFile(file, "utf-8");
    } catch (err) {
      if (err.code === "ENOENT") return null;
      return null;
    }
    const result = parseState(raw);
    if (result.ok) {
      return result.state;
    }
    await this.renameCorrupt(file).catch(() => {
    });
    return null;
  }
  async save(projectId, state) {
    const file = this.filePath(projectId);
    const body = serializeState(state);
    await fs10.mkdir(path12.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}.${this.now()}`;
    await fs10.writeFile(tmp, body, "utf-8");
    await fs10.rename(tmp, file);
  }
  /** Move a bad file aside so a re-run starts clean. */
  async renameCorrupt(file) {
    const corruptName = `${file}.corrupt.${this.now()}.bak`;
    await fs10.rename(file, corruptName);
  }
};

// ../cli/src/commands/install.ts
var INSTALL_STEPS = [
  {
    id: "hook-write",
    label: "Installing hooks",
    run: async (deps) => {
      const result = await deps.installHook();
      return result.alreadyInstalled ? `already installed at ${result.settingsPath}` : `registered at ${result.settingsPath}`;
    }
  },
  {
    id: "plugin-copy",
    label: "Installing plugins",
    run: async (deps) => {
      const result = await deps.installPlugins();
      if (!result.ok) throw new Error("install-plugins failed");
      return "plugins installed or already present";
    }
  },
  {
    id: "config-write",
    label: "Installing user hook",
    run: async (deps) => {
      const result = await deps.installUserHook();
      return result.alreadyInstalled ? `already installed at ${result.settingsPath}` : `registered at ${result.settingsPath}`;
    }
  }
];
function renderInstallHelp() {
  return [
    "Usage: teamagent install [--preview] [--yes|-y] [--non-interactive]",
    "",
    "Options:",
    "  --preview          Print the install manifest and exit without writes",
    "  --yes, -y          Accept the single install permission prompt",
    "  --non-interactive  CI alias for --yes; still emits the prompt line once",
    "  --help, -h         Show this help",
    "",
    "Vector model warmup runs detached after install; no foreground skip flag is exposed."
  ].join("\n") + "\n";
}
function createDefaultInstallDeps(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os8.homedir();
  return {
    installHook: async () => {
      const { installHook: installHook2 } = await import("./install-hook-I76EADTR.js");
      return installHook2({ cwd, homeDir });
    },
    installPlugins: async () => {
      const { executeInstallPlugins: executeInstallPlugins2 } = await import("./install-plugins-ZY7X4WJS.js");
      return executeInstallPlugins2();
    },
    installUserHook: async () => {
      const { installUserHook: installUserHook2 } = await import("./install-user-hook-6KGDUWW2.js");
      return installUserHook2({ homeDir });
    },
    healthCheck: async () => {
      const { executeDoctor: executeDoctor2 } = await import("./doctor-USD6R4QE.js");
      const result = await executeDoctor2({ cwd, homeDir });
      return {
        status: "ok",
        hooks: result.checks.some((c) => c.name === "hook-registered" && c.status === "pass"),
        kb: result.checks.some((c) => c.name === "knowledge-db" && c.status === "pass"),
        model: "warmup-pending"
      };
    },
    warmup: () => spawnDetachedWarmup(homeDir),
    confirm: (question) => confirmPrompt(question, opts.args),
    store: new FsInstallStateStore({ rootDir: path13.join(homeDir, ".teamagent") }),
    projectId: resolveProjectId(cwd)
  };
}
async function runInstall(args, deps = createDefaultInstallDeps({ args })) {
  const lines = [];
  lines.push(formatInstallManifest(renderInstallManifest()).trimEnd());
  lines.push("");
  const question = "Install TeamAgent hooks and knowledge base? (Y/n)";
  lines.push(question);
  const accepted = await deps.confirm(question);
  const promptCount = 1;
  if (!accepted) {
    lines.push("Install refused; no files were written.");
    return {
      ok: false,
      refused: true,
      output: lines.join("\n") + "\n",
      promptCount,
      steps: [],
      warmup: null,
      health: null
    };
  }
  const state = await deps.store.load(deps.projectId);
  const firstPendingIndex = INSTALL_STEPS.findIndex((s) => !state || !isStepDone(state, s.id));
  if (state && firstPendingIndex > 0) {
    lines.push(`Resuming from step [${firstPendingIndex + 1}/${INSTALL_STEPS.length}]...`);
  }
  const steps = [];
  for (let i = 0; i < INSTALL_STEPS.length; i++) {
    const step = INSTALL_STEPS[i];
    const latest = await deps.store.load(deps.projectId);
    if (latest && isStepDone(latest, step.id)) {
      lines.push(`\u25B6 [${i + 1}/${INSTALL_STEPS.length}] ${step.label}... skipped`);
      steps.push({ id: step.id, label: step.label, status: "skipped", detail: "checkpoint exists" });
      continue;
    }
    lines.push(`\u25B6 [${i + 1}/${INSTALL_STEPS.length}] ${step.label}...`);
    const detail = await step.run(deps);
    await checkpoint(deps.store, deps.projectId, step.id);
    lines.push(`  \u2713 ${detail}`);
    steps.push({ id: step.id, label: step.label, status: "ran", detail });
  }
  const warmup = await deps.warmup();
  const warmupPid = warmup.pid === null ? "?" : String(warmup.pid);
  lines.push(`\u25B6 Spawning vector-model warmup in background (pid ${warmupPid}; parent returns immediately)`);
  if (!warmup.ok) lines.push(`  warmup launch warning: ${warmup.detail}`);
  const health = await deps.healthCheck();
  lines.push("");
  lines.push("\u2713 Install complete.");
  lines.push("");
  lines.push("Auto health check:");
  lines.push(JSON.stringify(health));
  return {
    ok: true,
    refused: false,
    output: lines.join("\n") + "\n",
    promptCount,
    steps,
    warmup,
    health
  };
}
async function confirmPrompt(question, args) {
  if (args?.yes || args?.nonInteractive) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const readline2 = await import("readline/promises");
  const rl = readline2.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} `)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
async function spawnDetachedWarmup(homeDir) {
  const stateFile = defaultWarmupStatePath(homeDir);
  const teamagentDir = path13.dirname(stateFile);
  fs11.mkdirSync(teamagentDir, { recursive: true });
  writeInitialPlaceholder(stateFile, "Xenova/multilingual-e5-small");
  const entry = resolveCliEntry();
  if (!entry) {
    return {
      ok: false,
      pid: null,
      detail: "CLI entry not resolvable; run `teamagent warmup` manually",
      stateFile
    };
  }
  const logFile = path13.join(teamagentDir, "warmup.log");
  const fd = fs11.openSync(logFile, "a");
  try {
    const child = nodeSpawn(process.execPath, [entry, "warmup", "--write-state", stateFile], {
      detached: true,
      stdio: ["ignore", fd, fd]
    });
    child.unref();
    return {
      ok: true,
      pid: child.pid ?? null,
      detail: `state=${stateFile} log=${logFile}`,
      stateFile,
      logFile
    };
  } catch (err) {
    return {
      ok: false,
      pid: null,
      detail: `spawn failed: ${String(err).slice(0, 120)}`,
      stateFile,
      logFile
    };
  } finally {
    try {
      fs11.closeSync(fd);
    } catch {
    }
  }
}
function resolveCliEntry() {
  const argvEntry = process.argv[1];
  if (argvEntry && (argvEntry.endsWith("bin.js") || argvEntry.endsWith("bin.cjs"))) {
    return argvEntry;
  }
  const here = fileURLToPath3(import.meta.url);
  let dir = path13.dirname(here);
  for (let i = 0; i < 8; i++) {
    const bundled = path13.join(dir, "bin.js");
    if (fs11.existsSync(bundled)) return bundled;
    const teamagentDist = path13.join(dir, "packages", "teamagent", "dist", "bin.js");
    if (fs11.existsSync(teamagentDist)) return teamagentDist;
    const parent = path13.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}

// ../cli/src/commands/analyze.ts
init_esm_shims();
import os9 from "os";
import path14 from "path";
import fs12 from "fs";
function hasAnyValidJsonlLine(raw) {
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
    }
  }
  return false;
}
async function executeAnalyze(opts = {}) {
  const home = opts.homeDir ?? os9.homedir();
  const projectsRoot = opts.projectsRoot ?? path14.join(home, ".claude", "projects");
  let session;
  let sourceDesc;
  if (opts.session) {
    if (fs12.existsSync(opts.session)) {
      const raw = fs12.readFileSync(opts.session, "utf-8");
      if (raw.trim().length > 0 && !hasAnyValidJsonlLine(raw)) {
        return [
          `# transcript parse failed`,
          ``,
          `\u8DEF\u5F84: ${opts.session}`,
          `\u75C7\u72B6: \u6587\u4EF6\u975E\u7A7A\uFF08${raw.length} \u5B57\u8282\uFF09\u4F46\u672A\u53D1\u73B0\u53EF\u89E3\u6790\u7684 JSONL \u6D88\u606F\u3002`,
          `\u5E38\u89C1\u539F\u56E0: \u6587\u4EF6\u88AB\u5916\u90E8\u5DE5\u5177\u622A\u65AD/\u635F\u574F\uFF0C\u6216\u4E0D\u662F Claude Code \u4F1A\u8BDD\u65E5\u5FD7\u683C\u5F0F\u3002`,
          `\u64CD\u4F5C: \u68C0\u67E5\u6587\u4EF6\u9996\u884C\u662F\u5426\u4E3A\u5408\u6CD5 JSON\uFF08\u5E94\u6709 {"type":"user"...} \u7B49\u7ED3\u6784\uFF09\u3002`,
          ``
        ].join("\n");
      }
      session = parseSessionFile(raw);
      sourceDesc = opts.session;
    } else {
      const src = new ClaudeSessionSource(projectsRoot);
      session = await src.loadById(opts.session);
      sourceDesc = opts.session;
    }
  } else {
    const src = new ClaudeSessionSource(projectsRoot);
    const recent = await src.listRecent(1);
    if (recent.length === 0) {
      return [
        "\u672A\u627E\u5230\u4EFB\u4F55\u4F1A\u8BDD\u65E5\u5FD7 (~/.claude/projects/ \u4E3A\u7A7A)\u3002",
        "\u5148\u7528 Claude Code \u5F00\u51E0\u6B21\u4F1A\u8BDD\u518D\u8DD1 teamagent analyze\u3002",
        ""
      ].join("\n");
    }
    session = await src.loadById(recent[0].sessionId);
    sourceDesc = `\u6700\u8FD1\u4F1A\u8BDD ${recent[0].sessionId}`;
  }
  const rawCorrections = ruleBasedCorrectionDetector.detect(session);
  const rawSuccesses = ruleBasedSuccessDetector.detect(session);
  const fromTi = opts.fromTurnIndex;
  const corrections = fromTi !== void 0 ? rawCorrections.filter((m) => m.turnIndex > fromTi) : rawCorrections;
  const successes = fromTi !== void 0 ? rawSuccesses.filter((m) => m.turnIndex > fromTi) : rawSuccesses;
  const dryRun = renderReport(
    session,
    corrections,
    successes,
    sourceDesc,
    opts.verbose ?? false,
    opts.commit === true
  );
  const lastTurnIndex = session.turns.length > 0 ? session.turns[session.turns.length - 1].turnIndex : -1;
  if (!opts.commit) {
    opts.onMeta?.({
      sessionId: session.sessionId,
      lastTurnIndex,
      correctionsFound: corrections.length,
      extracted: 0,
      skipped: 0,
      failed: 0,
      rejected: 0,
      deduped: 0,
      newEntries: []
    });
    return dryRun;
  }
  const { output: commitOutput, meta } = await runCommit(session, opts);
  opts.onMeta?.({
    sessionId: session.sessionId,
    lastTurnIndex,
    ...meta
  });
  return dryRun + "\n" + commitOutput;
}
async function runCommit(session, opts) {
  const home = opts.homeDir ?? os9.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const projectDbPath = opts.projectDbPath ?? path14.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = opts.userGlobalDbPath ?? path14.join(home, ".teamagent", "global.db");
  const eventsDbPath = opts.eventsDbPath ?? path14.join(home, ".teamagent", "events.db");
  const skillsDir = opts.skillsDir ?? path14.join(home, ".claude", "skills", "teamagent");
  fs12.mkdirSync(path14.dirname(projectDbPath), { recursive: true });
  fs12.mkdirSync(path14.dirname(userGlobalDbPath), { recursive: true });
  fs12.mkdirSync(path14.dirname(eventsDbPath), { recursive: true });
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  const dualStore = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const projectStore = dualStore.getProjectStore();
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const idGen = opts.idGen ?? (() => {
    const ts = now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 8);
    return `pers-${ts}-${rand}`;
  });
  const recompile = async (_activeFromProject) => {
    await runCompile({
      store: dualStore,
      skillCompiler: makeSkillCompiler({ skillsDir })
    });
  };
  const before = projectStore.count();
  const fromTurnIndex = opts.fromTurnIndex;
  const filteredDetector = fromTurnIndex !== void 0 ? {
    detect: (s) => ruleBasedCorrectionDetector.detect(s).filter((m) => m.turnIndex > fromTurnIndex)
  } : ruleBasedCorrectionDetector;
  const result = await runExtractPipeline(session, {
    detector: filteredDetector,
    extractor: llmBasedKnowledgeExtractor,
    callLLM: (prompt) => llm.complete(prompt),
    store: projectStore,
    recompile,
    scope: { level: "personal" },
    source: "accumulated",
    now,
    idGen,
    validator: defaultValidator,
    projectStack: [],
    isMomentSeen: opts.isMomentSeen,
    markMomentSeen: opts.markMomentSeen
  });
  const after = projectStore.count();
  let calibrationSummary = "";
  if (!opts.skipCalibrate) {
    try {
      const eventLog = new SqliteEventLog(openDb(eventsDbPath));
      const events = eventLog.readAll();
      for (const [label, store] of [
        ["personal", dualStore.getProjectStore()],
        ["global", dualStore.getGlobalStore()]
      ]) {
        const calResult = await runCalibrationPipeline({
          calibrator: defaultCalibrator,
          store,
          events,
          now
        });
        for (const adj of calResult.adjusted) {
          try {
            const ts = now().toISOString();
            const rand = Math.random().toString(36).slice(2, 8);
            eventLog.append({
              id: `cal-${ts.replace(/[-:T.Z]/g, "").slice(0, 14)}-${rand}`,
              kind: "calibrator.adjusted",
              knowledge_id: adj.knowledge_id,
              confidence_before: adj.before,
              confidence_after: adj.after,
              status_after: adj.status_after,
              timestamp: ts,
              schema_version: 1
            });
          } catch {
          }
        }
        if (calResult.adjusted.length > 0) {
          calibrationSummary += `  ${label}: \u8C03\u6574 ${calResult.adjusted.length} \u6761` + (calResult.archivedNew.length > 0 ? `\uFF0C\u5F52\u6863 ${calResult.archivedNew.length} \u6761` : "") + "\n";
        }
      }
      eventLog.close();
      if (calibrationSummary) {
        await recompile([]);
      }
    } catch (err) {
      calibrationSummary = `  \u26A0 \u6821\u51C6\u9636\u6BB5\u5931\u8D25: ${String(err).slice(0, 120)}
`;
    }
  }
  dualStore.close();
  if (result.extracted.length > 0) {
    try {
      await vectorizeExtractedEntries(result.extracted, projectDbPath, opts.embedder);
    } catch {
    }
    try {
      const ids = result.extracted.map((e) => e.id);
      if (opts.docsPropagationScheduler) {
        await opts.docsPropagationScheduler(ids);
      } else {
        scheduleDocsPropagation(ids, { cwd });
      }
    } catch {
    }
  }
  const lines = [];
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  lines.push(`  --commit \u5B8C\u6210`);
  lines.push(`  \u8BC6\u522B\u7EA0\u6B63: ${result.correctionsFound}`);
  lines.push(`  \u6210\u529F\u63D0\u53D6: ${result.extracted.length}  (\u8DF3\u8FC7 ${result.skipped}, \u5931\u8D25 ${result.failed})`);
  lines.push(`  \u77E5\u8BC6\u5E93: ${before} \u2192 ${after}`);
  lines.push(`  Skills \u5DF2\u66F4\u65B0\uFF1Bdocs propagation \u5DF2\u8C03\u5EA6`);
  if (result.extracted.length > 0) {
    lines.push("");
    lines.push("  \u65B0\u589E\u6761\u76EE:");
    for (const e of result.extracted) {
      lines.push(
        `    - [${e.category}/${e.tags[0] ?? "untagged"}] ${e.trigger} \u2192 ${e.correct_pattern}`
      );
    }
  }
  if (calibrationSummary) {
    lines.push("");
    lines.push("  \u6821\u51C6:");
    lines.push(calibrationSummary.trimEnd());
  }
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  return {
    output: lines.join("\n") + "\n",
    meta: {
      correctionsFound: result.correctionsFound,
      extracted: result.extracted.length,
      skipped: result.skipped,
      failed: result.failed,
      rejected: result.rejected.length,
      deduped: result.deduped,
      newEntries: result.extracted.map((e) => ({
        trigger: e.trigger,
        correct_pattern: e.correct_pattern,
        confidence: e.confidence
      }))
    }
  };
}
function renderReport(session, corrections, successes, sourceDesc, verbose, committing) {
  const lines = [];
  lines.push(
    committing ? "\u{1F4CA} TeamAgent Session Analyze (--commit \u6A21\u5F0F)" : "\u{1F4CA} TeamAgent Session Analyze (dry-run\uFF0C\u4E0D\u5199\u77E5\u8BC6\u5E93)"
  );
  lines.push("");
  lines.push(`\u6E90: ${sourceDesc}`);
  lines.push(`\u4F1A\u8BDD id: ${session.sessionId}`);
  lines.push(`\u56DE\u5408\u6570: ${session.turns.length}`);
  lines.push("");
  lines.push(`\u25B8 \u8BC6\u522B\u5230\u7EA0\u6B63\u65F6\u523B: ${corrections.length}`);
  const byCSig = {};
  for (const c of corrections) byCSig[c.signal] = (byCSig[c.signal] ?? 0) + 1;
  for (const [s, n] of Object.entries(byCSig)) {
    lines.push(`    - ${s}: ${n}`);
  }
  lines.push("");
  lines.push(`\u25B8 \u8BC6\u522B\u5230\u6210\u529F\u4FE1\u53F7: ${successes.length}`);
  const bySSig = {};
  for (const s of successes) bySSig[s.signal] = (bySSig[s.signal] ?? 0) + 1;
  for (const [s, n] of Object.entries(bySSig)) {
    lines.push(`    - ${s}: ${n}`);
  }
  lines.push("");
  if (verbose || corrections.length + successes.length <= 10) {
    if (corrections.length > 0) {
      lines.push("--- \u7EA0\u6B63\u65F6\u523B\u660E\u7EC6 ---");
      for (const c of corrections) {
        lines.push(
          `  [turn ${c.turnIndex}] ${c.signal} (w=${c.weight.toFixed(2)})`
        );
        lines.push(`    \u7528\u6237: ${truncate(c.correctionText, 80)}`);
        if (c.previousAssistantText) {
          lines.push(`    AI\u4E0A\u4E00\u53E5: ${truncate(c.previousAssistantText, 80)}`);
        }
      }
      lines.push("");
    }
    if (successes.length > 0) {
      lines.push("--- \u6210\u529F\u4FE1\u53F7\u660E\u7EC6 ---");
      for (const s of successes) {
        lines.push(
          `  [turn ${s.turnIndex}] ${s.signal} (w=${s.weight.toFixed(2)})`
        );
        lines.push(`    AI: ${truncate(s.assistantText, 80)}`);
      }
      lines.push("");
    }
  }
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  if (committing) {
    lines.push("  dry-run \u5B8C\u6210\uFF1B\u4E0B\u9762\u5F00\u59CB --commit \u5199\u5165\u2026");
  } else {
    lines.push("  dry-run \u5B8C\u6210\uFF0C\u672A\u5199\u5165\u77E5\u8BC6\u5E93\u3002\u52A0 --commit \u89E6\u53D1\u63D0\u53D6+\u843D\u76D8\u3002");
  }
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  return lines.join("\n") + "\n";
}
async function vectorizeExtractedEntries(entries, projectDbPath, embedder) {
  const { buildSemanticDescriptions } = await import("./src-XM5WNPR2.js");
  const actualEmbedder = embedder ?? new XenovaRuleEmbedder();
  const embedderModelId = actualEmbedder.modelId ?? "Xenova/multilingual-e5-small";
  const vdb = openDb(projectDbPath);
  try {
    for (const entry of entries) {
      const e = entry;
      const desc = e.trigger_description?.trim() && e.pattern_description?.trim() ? { trigger_description: e.trigger_description, pattern_description: e.pattern_description } : buildSemanticDescriptions({
        trigger: entry.trigger,
        wrong_pattern: entry.wrong_pattern,
        correct_pattern: entry.correct_pattern,
        reasoning: entry.reasoning
      });
      const [tv, pv] = await actualEmbedder.embed([desc.trigger_description, desc.pattern_description]);
      if (tv && pv) {
        vdb.prepare(
          "UPDATE knowledge SET trigger_description=?, pattern_description=?, embedder_model_id=? WHERE id=?"
        ).run(desc.trigger_description, desc.pattern_description, embedderModelId, entry.id);
        syncRuleVectors(vdb, entry.id, new Float32Array(tv), new Float32Array(pv));
      }
    }
  } finally {
    vdb.close();
  }
}
function truncate(s, max) {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "\u2026";
}
function parseAnalyzeArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verbose" || a === "-v") opts.verbose = true;
    else if (a === "--commit") opts.commit = true;
    else if (a.startsWith("--session=")) opts.session = a.slice("--session=".length);
    else if (a === "--session" && argv[i + 1]) {
      opts.session = argv[i + 1];
      i++;
    }
  }
  return opts;
}

// ../cli/src/commands/review.ts
init_esm_shims();
import os10 from "os";
import path15 from "path";
import fs13 from "fs";
function executeReview(opts = {}) {
  const home = opts.homeDir ?? os10.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const projectDbPath = opts.projectDbPath ?? path15.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = opts.userGlobalDbPath ?? path15.join(home, ".teamagent", "global.db");
  const rows = [];
  try {
    fs13.mkdirSync(path15.dirname(projectDbPath), { recursive: true });
    fs13.mkdirSync(path15.dirname(userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    const all = store.getAll();
    store.close();
    for (const entry of all) {
      const level = entry.scope.level;
      if (opts.scope) {
        if (level !== opts.scope) continue;
      }
      rows.push({ entry, scope: level });
    }
  } catch {
  }
  rows.sort(
    (a, b) => (b.entry.created_at ?? "").localeCompare(a.entry.created_at ?? "")
  );
  const limit = opts.limit ?? 10;
  const slice = rows.slice(0, limit);
  const lines = [];
  lines.push("\u{1F4D6} TeamAgent Review \u2014 \u6700\u8FD1\u5F55\u5165\u7684\u77E5\u8BC6\u6761\u76EE");
  lines.push("");
  lines.push(`\u5171 ${rows.length} \u6761\uFF0C\u5C55\u793A\u6700\u8FD1 ${slice.length}`);
  lines.push("");
  if (rows.length === 0) {
    lines.push("(\u77E5\u8BC6\u5E93\u4E3A\u7A7A)");
    lines.push("");
    return lines.join("\n");
  }
  if (slice.length === 0) {
    return lines.join("\n");
  }
  for (const { entry, scope } of slice) {
    const date = entry.created_at ? entry.created_at.slice(0, 10) : "????-??-??";
    const tag = entry.tags[0] ?? "untagged";
    lines.push(
      `[${date}] ${scope}/${entry.category}/${tag}  conf=${entry.confidence.toFixed(2)} ${entry.enforcement}`
    );
    lines.push(`  trigger:  ${entry.trigger}`);
    if (entry.wrong_pattern) {
      lines.push(`  wrong:    ${entry.wrong_pattern}`);
    }
    lines.push(`  correct:  ${entry.correct_pattern}`);
    lines.push(`  reason:   ${entry.reasoning}`);
    lines.push(`  id:       ${entry.id}`);
    lines.push("");
  }
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  lines.push("  \u60F3\u8C03\u6574\uFF1F\u7528 teamagent pitfall \u6216\u76F4\u63A5\u7F16\u8F91 .teamagent/knowledge.db");
  lines.push("  \u6539\u5B8C teamagent stats \u9A8C\u8BC1\uFF0C\u518D\u5F00\u65B0 Claude Code \u4F1A\u8BDD\u751F\u6548\u3002");
  lines.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
  return lines.join("\n") + "\n";
}
function parseReviewArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[i + 1], 10);
      i++;
    } else if (a.startsWith("--limit=")) {
      opts.limit = parseInt(a.slice("--limit=".length), 10);
    } else if (a === "--scope" && argv[i + 1]) {
      const v = argv[i + 1];
      if (v === "personal" || v === "team" || v === "global") opts.scope = v;
      i++;
    } else if (a.startsWith("--scope=")) {
      const v = a.slice("--scope=".length);
      if (v === "personal" || v === "team" || v === "global") opts.scope = v;
    } else if (/^-?\d+$/.test(a)) {
      const v = parseInt(a, 10);
      if (v < 0) {
        throw new Error(`review N \u5FC5\u987B\u662F\u6B63\u6574\u6570\uFF0C\u6536\u5230: ${a}`);
      }
      opts.limit = v;
    }
  }
  return opts;
}

// ../cli/src/commands/e2e-evaluate.ts
init_esm_shims();
import fs14 from "fs";
import os11 from "os";
import path16 from "path";
function deriveSummary(probes) {
  const results = probes.map((p) => ({
    ...p,
    pass: p.triggered === p.expectedTrigger
  }));
  const passed = results.filter((r) => r.pass).length;
  return { passed, failed: results.length - passed, results };
}
var CASES = [
  {
    id: "http-client",
    userRequest: "Please add a function that fetches user data.",
    assistantText: "I will use axios for the HTTP request.",
    toolName: "Write",
    toolInput: {
      file_path: "src/api.ts",
      content: `import axios from "axios";
export async function getUser(id: string) { return (await axios.get("/api/users/" + id)).data; }
`
    },
    correctionText: "Wrong, this project uses fetch instead of axios.",
    expectedWrong: "axios",
    expectedCorrect: "fetch",
    llm: {
      category: "E",
      tags: ["http-client"],
      type: "avoidance",
      nature: "objective",
      trigger: "When adding HTTP client code",
      wrong_pattern: "axios|Axios",
      correct_pattern: "Use built-in fetch.",
      reasoning: "The project standard avoids an extra HTTP dependency."
    },
    probes: [
      {
        id: "axios-bash-install",
        kind: "positive",
        tool_name: "Bash",
        tool_input: { command: "npm install axios" }
      },
      {
        id: "axios-import-write",
        kind: "generalization",
        tool_name: "Write",
        tool_input: {
          file_path: "src/other.ts",
          content: `import client from "axios";
export const get = client.get;
`
        }
      },
      {
        id: "axios-doc-mention",
        kind: "negative",
        tool_name: "Write",
        tool_input: {
          file_path: "docs/history.md",
          content: "Legacy docs mention axios as historical context."
        }
      }
    ]
  },
  {
    id: "date-library",
    userRequest: "Please add date formatting.",
    assistantText: "I will use moment for date formatting.",
    toolName: "Write",
    toolInput: {
      file_path: "src/date.ts",
      content: `import moment from "moment";
export const fmt = (d: Date) => moment(d).format("YYYY-MM-DD");
`
    },
    correctionText: "Wrong, use dayjs instead of moment.",
    expectedWrong: "moment",
    expectedCorrect: "dayjs",
    llm: {
      category: "E",
      tags: ["date-library"],
      type: "avoidance",
      nature: "objective",
      trigger: "When adding date formatting dependencies",
      wrong_pattern: "moment",
      correct_pattern: "Use dayjs.",
      reasoning: "The project standardizes on dayjs."
    },
    probes: [
      {
        id: "moment-install",
        kind: "positive",
        tool_name: "Bash",
        tool_input: { command: "pnpm add moment" }
      },
      {
        id: "moment-import-write",
        kind: "generalization",
        tool_name: "Write",
        tool_input: {
          file_path: "src/date2.ts",
          content: `import moment from "moment";
export const y = moment().year();
`
        }
      },
      {
        id: "momentum-substring",
        kind: "negative",
        tool_name: "Bash",
        tool_input: { command: "echo momentum is not a date library" }
      },
      {
        id: "moment-comment",
        kind: "negative",
        tool_name: "Write",
        tool_input: {
          file_path: "src/date3.ts",
          content: `// moment was used before migration
export const fmt = (d: Date) => d.toISOString();
`
        }
      }
    ]
  },
  {
    id: "state-library",
    userRequest: "Please add global UI state.",
    assistantText: "I will install Redux Toolkit and wire the store.",
    toolName: "Bash",
    toolInput: { command: "pnpm add @reduxjs/toolkit react-redux" },
    correctionText: "Wrong, use Zustand here instead of Redux.",
    expectedWrong: "redux",
    expectedCorrect: "zustand",
    llm: {
      category: "E",
      tags: ["state-library"],
      type: "avoidance",
      nature: "objective",
      trigger: "When adding client state management",
      wrong_pattern: "@reduxjs/toolkit|react-redux|redux",
      correct_pattern: "Use Zustand.",
      reasoning: "The app standardizes on Zustand for small client stores."
    },
    probes: [
      {
        id: "redux-install",
        kind: "positive",
        tool_name: "Bash",
        tool_input: { command: "pnpm add @reduxjs/toolkit react-redux" }
      },
      {
        id: "redux-generalized",
        kind: "generalization",
        tool_name: "Bash",
        tool_input: { command: "npm install redux" }
      },
      {
        id: "reducer-word",
        kind: "negative",
        tool_name: "Write",
        tool_input: {
          file_path: "src/reducer.ts",
          content: "export function reducer(state: number) { return state + 1; }\n"
        }
      }
    ]
  }
];
function parseE2EEvaluateArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--keep-temp") opts.keepTemp = true;
    else if (a === "--cwd" && args[i + 1]) opts.cwd = args[++i];
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
    else if (a === "--home-dir" && args[i + 1]) opts.homeDir = args[++i];
    else if (a.startsWith("--home-dir=")) opts.homeDir = a.slice("--home-dir=".length);
  }
  return opts;
}
async function executeE2EEvaluate(opts = {}) {
  const tempRoot = fs14.mkdtempSync(path16.join(os11.tmpdir(), "teamagent-e2e-"));
  const workspaceDir = opts.cwd ?? path16.join(tempRoot, "project");
  const homeDir = opts.homeDir ?? path16.join(tempRoot, "home");
  const sessionsDir = path16.join(tempRoot, "sessions");
  fs14.mkdirSync(workspaceDir, { recursive: true });
  fs14.mkdirSync(homeDir, { recursive: true });
  fs14.mkdirSync(sessionsDir, { recursive: true });
  fs14.mkdirSync(path16.join(workspaceDir, "src"), { recursive: true });
  fs14.mkdirSync(path16.join(workspaceDir, "docs"), { recursive: true });
  fs14.writeFileSync(path16.join(workspaceDir, "package.json"), JSON.stringify({ type: "module" }));
  const projectDbPath = path16.join(workspaceDir, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path16.join(homeDir, ".teamagent", "global.db");
  const eventsDbPath = path16.join(homeDir, ".teamagent", "events.db");
  const claudeMdPath = path16.join(workspaceDir, "CLAUDE.md");
  const skillsDir = path16.join(homeDir, ".claude", "skills", "teamagent");
  const now = opts.now ?? (() => /* @__PURE__ */ new Date("2026-04-24T00:00:00Z"));
  const llmClient = opts.llmClient ?? deterministicLLM();
  const failures = [];
  const scheduledDocsRuleIds = [];
  let correctionsFound = 0;
  let extracted = 0;
  let idSeq = 0;
  try {
    for (const c of CASES) {
      const sessionPath = path16.join(sessionsDir, `${c.id}.jsonl`);
      fs14.writeFileSync(sessionPath, makeSessionJsonl(c), "utf-8");
      let meta;
      await executeAnalyze({
        session: sessionPath,
        homeDir,
        cwd: workspaceDir,
        commit: true,
        llmClient,
        projectDbPath,
        userGlobalDbPath,
        eventsDbPath,
        claudeMdPath,
        skillsDir,
        idGen: () => `e2e-${++idSeq}`,
        now,
        skipCalibrate: true,
        embedder: opts.embedder,
        docsPropagationScheduler: (ids) => {
          scheduledDocsRuleIds.push(...ids);
        },
        onMeta: (m) => {
          meta = m;
        }
      });
      correctionsFound += meta?.correctionsFound ?? 0;
      extracted += meta?.extracted ?? 0;
    }
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    const eventLog = new SqliteEventLog(openDb(eventsDbPath));
    let lastRuleCount = 0;
    const matcher = {
      match: async ({ tool_name, tool_input }) => {
        const rules2 = store.findActive();
        lastRuleCount = rules2.length;
        return matchRules(
          {
            ...typeof tool_input === "object" && tool_input !== null ? tool_input : {},
            tool_name
          },
          rules2,
          {}
        );
      }
    };
    const handler = createPreToolUseHandler({
      matcher,
      eventLog,
      visibility: "silent",
      get ruleCount() {
        return lastRuleCount;
      }
    });
    const rules = store.findActive();
    const probes = [];
    for (const c of CASES) {
      for (const probe of c.probes) {
        const result = await handler({
          hook_event_name: "PreToolUse",
          tool_use_id: `probe-${probe.id}`,
          tool_name: probe.tool_name,
          tool_input: probe.tool_input
        });
        const message = result.permissionDecisionReason ?? result.systemMessage ?? "";
        const triggered = result.permissionDecision !== "allow" || message.length > 0;
        const helpful = triggered && message.toLowerCase().includes(c.expectedCorrect.toLowerCase());
        probes.push({
          id: probe.id,
          kind: probe.kind,
          triggered,
          helpful,
          expectedTrigger: probe.kind !== "negative",
          decision: result.permissionDecision,
          message
        });
      }
    }
    eventLog.close();
    store.close();
    const positives = probes.filter((p) => p.kind === "positive");
    const generalizations = probes.filter((p) => p.kind === "generalization");
    const negatives = probes.filter((p) => p.kind === "negative");
    const triggeredHelpful = probes.filter((p) => p.expectedTrigger && p.triggered);
    const skillFiles = rules.map((r) => path16.join(skillsDir, r.id, "SKILL.md"));
    const skillContents = skillFiles.filter((file) => fs14.existsSync(file)).map((file) => fs14.readFileSync(file, "utf-8"));
    const skillCorpusLower = skillContents.join("\n").toLowerCase();
    const skillsExported = skillFiles.length > 0 && skillFiles.every((file) => fs14.existsSync(file));
    const skillsHaveRules = CASES.every((c) => skillCorpusLower.includes(c.expectedCorrect.toLowerCase()));
    const scheduledDocsSet = new Set(scheduledDocsRuleIds);
    const docsPropagationCoverage = rate(
      rules.filter((r) => scheduledDocsSet.has(r.id)).length,
      rules.length
    );
    const docsPropagationScheduled = docsPropagationCoverage === 1;
    const claudeMdUntouched = !fs14.existsSync(claudeMdPath);
    const onboardingCoverage = CASES.length === 0 ? 1 : CASES.filter(
      (c) => skillCorpusLower.includes(c.expectedWrong.toLowerCase()) && skillCorpusLower.includes(c.expectedCorrect.toLowerCase())
    ).length / CASES.length;
    const metrics = {
      extractionYield: correctionsFound === 0 ? 0 : extracted / correctionsFound,
      positiveTriggerRate: rate(positives.filter((p) => p.triggered).length, positives.length),
      generalizationRate: rate(generalizations.filter((p) => p.triggered).length, generalizations.length),
      falsePositiveRate: rate(negatives.filter((p) => p.triggered).length, negatives.length),
      helpfulRate: rate(triggeredHelpful.filter((p) => p.helpful).length, triggeredHelpful.length),
      onboardingCoverage,
      docsPropagationCoverage
    };
    if (rules.length < CASES.length) failures.push(`Only learned ${rules.length}/${CASES.length} rules.`);
    if (metrics.extractionYield < 1) failures.push(`Extraction yield ${fmtPct(metrics.extractionYield)} is below 100%.`);
    if (metrics.positiveTriggerRate < 1) failures.push(`Positive trigger rate ${fmtPct(metrics.positiveTriggerRate)} is below 100%.`);
    if (metrics.generalizationRate < 1) failures.push(`Generalization rate ${fmtPct(metrics.generalizationRate)} is below 100%.`);
    if (metrics.falsePositiveRate > 0) failures.push(`False positive rate ${fmtPct(metrics.falsePositiveRate)} is above 0%.`);
    if (metrics.helpfulRate < 1) failures.push(`Helpful message rate ${fmtPct(metrics.helpfulRate)} is below 100%.`);
    if (!skillsExported) failures.push("Skills were not exported for every learned rule.");
    if (!skillsHaveRules) failures.push("Exported Skills do not contain every learned correction.");
    if (!docsPropagationScheduled) failures.push(`Docs propagation coverage ${fmtPct(metrics.docsPropagationCoverage)} is below 100%.`);
    if (!claudeMdUntouched) failures.push("CLAUDE.md was written even though Skills are the compile output.");
    if (metrics.onboardingCoverage < 1) failures.push(`Skills onboarding coverage ${fmtPct(metrics.onboardingCoverage)} is below 100%.`);
    const shouldClean = !opts.keepTemp && !opts.cwd && !opts.homeDir;
    if (shouldClean) cleanupTempRoot(tempRoot);
    return {
      ok: failures.length === 0,
      workspaceDir,
      homeDir,
      learnedRules: rules.length,
      correctionsFound,
      extracted,
      skillsExported,
      skillsHaveRules,
      docsPropagationScheduled,
      claudeMdUntouched,
      metrics,
      probes,
      failures,
      tempCleaned: shouldClean,
      ...deriveSummary(probes)
    };
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
    if (!opts.keepTemp && !opts.cwd && !opts.homeDir) cleanupTempRoot(tempRoot);
    return {
      ok: false,
      workspaceDir,
      homeDir,
      learnedRules: 0,
      correctionsFound,
      extracted,
      skillsExported: false,
      skillsHaveRules: false,
      docsPropagationScheduled: false,
      claudeMdUntouched: !fs14.existsSync(claudeMdPath),
      metrics: {
        extractionYield: correctionsFound === 0 ? 0 : extracted / correctionsFound,
        positiveTriggerRate: 0,
        generalizationRate: 0,
        falsePositiveRate: 0,
        helpfulRate: 0,
        onboardingCoverage: 0,
        docsPropagationCoverage: 0
      },
      probes: [],
      failures,
      tempCleaned: !opts.keepTemp && !opts.cwd && !opts.homeDir,
      ...deriveSummary([])
    };
  }
}
function renderE2EEvaluateResult(result) {
  const lines = [
    `TeamAgent real E2E evaluation: ${result.ok ? "PASS" : "FAIL"}`,
    "",
    `Rules learned: ${result.learnedRules}`,
    `Corrections found/extracted: ${result.correctionsFound}/${result.extracted}`,
    `Skills exported: ${result.skillsExported ? "yes" : "no"}`,
    `Docs propagation scheduled: ${result.docsPropagationScheduled ? "yes" : "no"}`,
    `CLAUDE.md untouched: ${result.claudeMdUntouched ? "yes" : "no"}`,
    `Onboarding rules in Skills: ${fmtPct(result.metrics.onboardingCoverage)}`,
    "",
    "Metrics:",
    `  extraction yield: ${fmtPct(result.metrics.extractionYield)}`,
    `  positive trigger rate: ${fmtPct(result.metrics.positiveTriggerRate)}`,
    `  generalization rate: ${fmtPct(result.metrics.generalizationRate)}`,
    `  false positive rate: ${fmtPct(result.metrics.falsePositiveRate)}`,
    `  helpful message rate: ${fmtPct(result.metrics.helpfulRate)}`,
    `  docs propagation coverage: ${fmtPct(result.metrics.docsPropagationCoverage)}`,
    "",
    "Probe results:",
    ...result.probes.map((p) => {
      const expected = p.expectedTrigger ? "hit" : "pass";
      const actual = p.triggered ? "hit" : "pass";
      const status = expected === actual ? "ok" : "bad";
      return `  ${status} ${p.id} [${p.kind}]: expected ${expected}, got ${actual}`;
    })
  ];
  if (result.failures.length > 0) {
    lines.push("", "Failures:", ...result.failures.map((f) => `  - ${f}`));
  }
  if (!result.tempCleaned) {
    lines.push("", `Workspace: ${result.workspaceDir}`, `Home: ${result.homeDir}`);
  }
  return lines.join("\n") + "\n";
}
function makeSessionJsonl(c) {
  const sessionId = `e2e-${c.id}`;
  const lines = [
    {
      type: "user",
      uuid: `${c.id}-u1`,
      timestamp: "2026-04-24T00:00:00Z",
      sessionId,
      message: { role: "user", content: c.userRequest }
    },
    {
      type: "assistant",
      uuid: `${c.id}-a1`,
      timestamp: "2026-04-24T00:00:01Z",
      sessionId,
      message: {
        role: "assistant",
        content: [
          { type: "text", text: c.assistantText },
          { type: "tool_use", id: `${c.id}-tool1`, name: c.toolName, input: c.toolInput }
        ]
      }
    },
    {
      type: "user",
      uuid: `${c.id}-u2`,
      timestamp: "2026-04-24T00:00:02Z",
      sessionId,
      message: { role: "user", content: c.correctionText }
    }
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}
function deterministicLLM() {
  return {
    complete: async (prompt) => {
      const lower = prompt.toLowerCase();
      const found = lower.includes("zustand") ? CASES.find((c) => c.id === "state-library") : lower.includes("dayjs") ? CASES.find((c) => c.id === "date-library") : lower.includes("fetch instead of axios") ? CASES.find((c) => c.id === "http-client") : void 0;
      if (!found) return "null";
      return "```json\n" + JSON.stringify(found.llm) + "\n```";
    }
  };
}
function rate(n, d) {
  return d === 0 ? 1 : n / d;
}
function fmtPct(v) {
  return `${Math.round(v * 1e3) / 10}%`;
}
function cleanupTempRoot(tempRoot) {
  try {
    fs14.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    });
  } catch {
  }
}

// ../cli/src/commands/dogfood-report.ts
init_esm_shims();
import os12 from "os";
import path17 from "path";
import fs15 from "fs";
import { execSync as execSync5 } from "child_process";
function resolvePaths2(opts) {
  const home = opts.homeDir ?? os12.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    home,
    cwd,
    projectDbPath: opts.projectDbPath ?? path17.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path17.join(home, ".teamagent", "global.db"),
    eventsDbPath: opts.eventsDbPath ?? path17.join(home, ".teamagent", "events.db"),
    outputPath: opts.outputPath ?? path17.join(cwd, "docs", "dogfood", "\u81EA\u4E3E\u62A5\u544A.md")
  };
}
function readGitTimeline(cwd) {
  try {
    const out = execSync5(
      'git log --pretty=format:"%h|%ad|%s" --date=short -100',
      // stdio: pipe stderr so a missing .git directory does not leak
      // "fatal: not a git repository" to the user's terminal — the catch
      // below already returns []. Without "ignore" / "pipe" stderr, the
      // child writes directly to our stderr.
      { cwd, encoding: "utf-8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    return out.split("\n").map((line) => {
      const [hash, date, ...rest] = line.split("|");
      return { hash: hash ?? "", date: date ?? "", message: rest.join("|") };
    }).filter((c) => c.hash);
  } catch {
    return [];
  }
}
async function executeDogfoodReport(opts = {}) {
  const paths = resolvePaths2(opts);
  const now = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
  let allEntries = [];
  try {
    fs15.mkdirSync(path17.dirname(paths.projectDbPath), { recursive: true });
    fs15.mkdirSync(path17.dirname(paths.userGlobalDbPath), { recursive: true });
    if (fs15.existsSync(paths.projectDbPath) || fs15.existsSync(paths.userGlobalDbPath)) {
      const store = new DualLayerStore({
        projectDbPath: paths.projectDbPath,
        userGlobalDbPath: paths.userGlobalDbPath
      });
      allEntries = store.getAll();
      store.close();
    }
  } catch {
  }
  const personal = allEntries.filter((e) => e.scope.level === "personal");
  const global = allEntries.filter((e) => e.scope.level === "global");
  let events = [];
  try {
    if (fs15.existsSync(paths.eventsDbPath)) {
      const eventLog = new SqliteEventLog(openDb(paths.eventsDbPath));
      events = eventLog.readAll();
      eventLog.close();
    }
  } catch {
  }
  const timeline = readGitTimeline(paths.cwd);
  const triggerById = /* @__PURE__ */ new Map();
  for (const e of allEntries) triggerById.set(e.id, e.trigger);
  const fireCount = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.knowledge_id && /^hook-pre/.test(e.kind)) {
      fireCount.set(e.knowledge_id, (fireCount.get(e.knowledge_id) ?? 0) + 1);
    }
  }
  const topFired = [...fireCount.entries()].map(([knowledge_id, fires]) => ({
    knowledge_id,
    trigger: triggerById.get(knowledge_id) ?? "(\u5DF2\u5220)",
    fires
  })).sort((a, b) => b.fires - a.fires).slice(0, 5);
  const deltaById = /* @__PURE__ */ new Map();
  for (const e of events) {
    if (e.kind === "calibrator.adjusted" && e.knowledge_id && typeof e.confidence_before === "number" && typeof e.confidence_after === "number") {
      const d = e.confidence_after - e.confidence_before;
      deltaById.set(e.knowledge_id, (deltaById.get(e.knowledge_id) ?? 0) + d);
    }
  }
  const topConfidenceGain = [...deltaById.entries()].map(([knowledge_id, totalDelta]) => ({
    knowledge_id,
    trigger: triggerById.get(knowledge_id) ?? "(\u5DF2\u5220)",
    totalDelta
  })).sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta)).slice(0, 5);
  const archivedCount = allEntries.filter((e) => e.status === "archived").length;
  const md = renderDogfoodReport({
    now,
    personal,
    team: [],
    global,
    events,
    timeline,
    topFired,
    topConfidenceGain,
    archivedCount
  });
  fs15.mkdirSync(path17.dirname(paths.outputPath), { recursive: true });
  fs15.writeFileSync(paths.outputPath, md, "utf-8");
  return {
    outputPath: paths.outputPath,
    totalEntries: allEntries.length,
    totalEvents: events.length,
    scopes: { personal: personal.length, team: 0, global: global.length },
    topFired,
    topConfidenceGain,
    archivedCount
  };
}
function renderDogfoodReport(input) {
  const { now, personal, team, global, events, timeline, topFired, topConfidenceGain, archivedCount } = input;
  const all = [...personal, ...team, ...global];
  const active = all.filter((e) => e.status === "active");
  const byCategory = { C: 0, E: 0, S: 0, K: 0 };
  for (const e of active) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  const eventKinds = {};
  for (const e of events) eventKinds[e.kind] = (eventKinds[e.kind] ?? 0) + 1;
  const corrections = events.filter((e) => /^hook-pre/.test(e.kind)).length;
  const calibrations = events.filter((e) => e.kind === "calibrator.adjusted").length;
  const lines = [];
  lines.push("# TeamAgent \u81EA\u4E3E\u62A5\u544A\uFF08Phase 2\uFF09");
  lines.push("");
  lines.push(`> \u751F\u6210\u65F6\u95F4: ${now.toISOString()}`);
  lines.push("> \u6570\u636E\u5B8C\u5168\u6765\u81EA\u7CFB\u7EDF\u81EA\u8EAB\uFF1Aevents.db + knowledge.db + git log");
  lines.push("> \u7531 `teamagent dogfood-report` \u81EA\u52A8\u751F\u6210\uFF0C\u672A\u7ECF\u4EBA\u5DE5\u4FEE\u9970");
  lines.push("");
  lines.push("## \u4E00\u53E5\u8BDD\u7ED3\u8BBA");
  lines.push("");
  lines.push(
    `Phase 2 \u671F\u95F4\u7D2F\u8BA1\u79EF\u7D2F **${all.length} \u6761\u77E5\u8BC6**\uFF08${active.length} \u6761\u6D3B\u8DC3${archivedCount > 0 ? `\u3001${archivedCount} \u6761\u81EA\u52A8\u5F52\u6863` : ""}\uFF09\uFF0CHook \u62E6\u622A **${corrections} \u6B21**\uFF0CCalibrator \u8C03\u6574 **${calibrations} \u6B21**\u3002`
  );
  lines.push("");
  lines.push("## \u77E5\u8BC6\u5E93");
  lines.push("");
  lines.push("| \u7EF4\u5EA6 | \u503C |");
  lines.push("|------|----|");
  lines.push(`| \u603B\u6761\u76EE | ${all.length} |`);
  lines.push(`| \u6D3B\u8DC3 | ${active.length} |`);
  lines.push(`| \u81EA\u52A8\u5F52\u6863 | ${archivedCount} |`);
  lines.push(`| personal | ${personal.length} |`);
  lines.push(`| global | ${global.length} |`);
  lines.push(`| C \u4EE3\u7801\u5C42 | ${byCategory.C} |`);
  lines.push(`| E \u5DE5\u7A0B\u5C42 | ${byCategory.E} |`);
  lines.push(`| S \u7B56\u7565\u5C42 | ${byCategory.S} |`);
  lines.push(`| K \u8BA4\u77E5\u5C42 | ${byCategory.K} |`);
  lines.push("");
  lines.push("## Hook \u5E72\u9884\u7EDF\u8BA1");
  lines.push("");
  lines.push("| \u4E8B\u4EF6\u7C7B\u578B | \u6B21\u6570 |");
  lines.push("|---------|------|");
  for (const [k, v] of Object.entries(eventKinds).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push(`## \u547D\u4E2D\u9891\u6B21 Top ${topFired.length}`);
  lines.push("");
  if (topFired.length === 0) {
    lines.push("(\u6682\u65E0\u547D\u4E2D\u8BB0\u5F55)");
  } else {
    lines.push("| # | \u547D\u4E2D\u6570 | trigger | id |");
    lines.push("|---|-------|---------|-----|");
    topFired.forEach((r, i) => {
      lines.push(
        `| ${i + 1} | ${r.fires} | ${r.trigger.slice(0, 60)} | ${r.knowledge_id} |`
      );
    });
  }
  lines.push("");
  lines.push(`## Confidence \u53D8\u5316 Top ${topConfidenceGain.length}`);
  lines.push("");
  if (topConfidenceGain.length === 0) {
    lines.push("(\u6682\u65E0\u6821\u51C6\u8BB0\u5F55\u2014\u2014\u5C1A\u672A\u8DD1\u8FC7 calibrate)");
  } else {
    lines.push("| # | \u0394confidence | trigger | id |");
    lines.push("|---|------------|---------|-----|");
    topConfidenceGain.forEach((r, i) => {
      const sign = r.totalDelta > 0 ? "+" : "";
      lines.push(
        `| ${i + 1} | ${sign}${r.totalDelta.toFixed(2)} | ${r.trigger.slice(0, 60)} | ${r.knowledge_id} |`
      );
    });
  }
  lines.push("");
  lines.push("## Phase 2 git \u65F6\u95F4\u7EBF");
  lines.push("");
  if (timeline.length === 0) {
    lines.push("(\u65E0 git \u5386\u53F2)");
  } else {
    const milestones = timeline.filter(
      (c) => /^(feat|fix|chore|test|docs|ci)\((m[0-9]+|stage0|compiler|hotfix)\)/.test(
        c.message
      )
    );
    lines.push("| date | hash | message |");
    lines.push("|------|------|---------|");
    for (const c of milestones.slice(0, 30)) {
      lines.push(`| ${c.date} | ${c.hash} | ${c.message.slice(0, 80)} |`);
    }
  }
  lines.push("");
  lines.push("## \u5173\u4E8E\u8FD9\u4EFD\u62A5\u544A");
  lines.push("");
  lines.push(
    "Phase 2 \u8BBE\u8BA1\u610F\u56FE\uFF1A\u7CFB\u7EDF**\u81EA\u52A8\u751F\u6210**\u4E00\u4EFD\u62A5\u544A\uFF0C\u4F5C\u4E3A\u5BF9 'TeamAgent \u662F\u5426\u771F\u6709\u7528' \u8FD9\u4E2A\u95EE\u9898\u7684**\u7B2C\u4E09\u65B9\u72EC\u7ACB\u8BC1\u636E**\u2014\u2014\u6240\u6709\u6570\u5B57\u6765\u81EA\u78C1\u76D8\u4E0A\u7684 SQLite DB\uFF0C\u6CA1\u4EBA\u624B\u52A8\u6539\u3002"
  );
  return lines.join("\n") + "\n";
}
function parseDogfoodReportArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output" && argv[i + 1]) {
      opts.outputPath = argv[i + 1];
      i++;
    } else if (a.startsWith("--output=")) {
      opts.outputPath = a.slice("--output=".length);
    }
  }
  return opts;
}

// ../cli/src/commands/bug-report.ts
init_esm_shims();
import fs16 from "fs";
import os13 from "os";
import path18 from "path";
import { execFileSync as execFileSync3 } from "child_process";
var MAX_LOG_BYTES = 128 * 1024;
function parseBugReportArgs(argv) {
  const opts = { stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stdout") {
      opts.stdout = true;
    } else if (a === "--out" && argv[i + 1]) {
      opts.outputPath = argv[++i];
    } else if (a.startsWith("--out=")) {
      opts.outputPath = a.slice("--out=".length);
    }
  }
  return opts;
}
async function executeBugReport(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os13.homedir();
  const env = opts.env ?? process.env;
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const teamagentHome = env["TEAMAGENT_HOME"] ?? path18.join(homeDir, ".teamagent");
  const outputPath = opts.outputPath ?? defaultReportPath(teamagentHome, now);
  const runCommand = opts.runCommand ?? defaultRunCommand;
  const markdown = renderBugReport({
    cwd,
    homeDir,
    teamagentHome,
    now,
    env,
    runCommand,
    teamagentVersion: opts.teamagentVersion,
    stdout: opts.stdout ?? false
  });
  if (!opts.stdout) {
    fs16.mkdirSync(path18.dirname(outputPath), { recursive: true });
    fs16.writeFileSync(outputPath, markdown, "utf-8");
  }
  return {
    markdown,
    outputPath: opts.stdout ? void 0 : outputPath
  };
}
function renderBugReport(args) {
  const lines = [];
  lines.push("# TeamAgent Bug Report");
  lines.push("");
  lines.push(`Generated: ${args.now.toISOString()}`);
  lines.push("");
  if (!args.stdout) {
    lines.push("## Summary");
    lines.push("");
    lines.push("- What happened:");
    lines.push("- What you expected:");
    lines.push("- Steps to reproduce:");
    lines.push("");
  }
  lines.push("## System");
  lines.push("");
  lines.push(`- platform: ${process.platform}`);
  lines.push(`- arch: ${process.arch}`);
  lines.push(`- os: ${os13.type()} ${os13.release()}`);
  lines.push(`- cpus: ${os13.cpus().length}`);
  lines.push(`- total_memory_mb: ${Math.round(os13.totalmem() / 1024 / 1024)}`);
  lines.push(`- cwd: ${args.cwd}`);
  lines.push(`- shell: ${args.env["SHELL"] ?? "(unknown)"}`);
  lines.push(`- TEAMAGENT_HOME: ${args.teamagentHome}`);
  lines.push("");
  lines.push("## Tool Versions");
  lines.push("");
  lines.push(`- node: ${process.version} (${process.execPath})`);
  lines.push(`- npm: ${commandOrUnavailable(args.runCommand, "npm", ["--version"])}`);
  lines.push(`- pnpm: ${commandOrUnavailable(args.runCommand, "pnpm", ["--version"])}`);
  lines.push(`- claude: ${commandOrUnavailable(args.runCommand, "claude", ["--version"])}`);
  lines.push(`- teamagent: ${args.teamagentVersion ?? commandOrUnavailable(args.runCommand, "teamagent", ["--version"])}`);
  lines.push("");
  lines.push("## Install State");
  lines.push("");
  lines.push(fileStatus("user Claude settings", path18.join(args.homeDir, ".claude", "settings.json")));
  lines.push(fileStatus("project Claude settings", path18.join(args.cwd, ".claude", "settings.local.json")));
  lines.push(fileStatus("project knowledge db", path18.join(args.cwd, ".teamagent", "knowledge.db")));
  lines.push(fileStatus("update state", path18.join(args.teamagentHome, "update-state.json")));
  lines.push(fileStatus("auto-update disabled marker", path18.join(args.teamagentHome, "auto-update.disabled")));
  lines.push("");
  lines.push("## Hook Commands");
  lines.push("");
  lines.push(renderHookCommands("user", path18.join(args.homeDir, ".claude", "settings.json")));
  lines.push(renderHookCommands("project", path18.join(args.cwd, ".claude", "settings.local.json")));
  lines.push("");
  lines.push("## Raw Logs");
  lines.push("");
  for (const log of logFiles(args.cwd, args.teamagentHome)) {
    lines.push(renderFileBlock(log.label, log.file));
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Secret-looking values are redacted before writing this report.");
  lines.push(`- Log blocks are capped at ${MAX_LOG_BYTES} bytes from the end of each file.`);
  lines.push("");
  if (args.stdout) {
    lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
    lines.push("\u{1F4E4} Paste this into a new issue at:");
    lines.push("   https://github.com/libz-renlab-ai/TeamBrain/issues/new");
    lines.push("");
    lines.push("   Tip: \u5728 Summary \u6BB5\u586B\u4E0A\u4F60\u5361\u4F4F\u7684\u5177\u4F53\u52A8\u4F5C\u3002");
    lines.push("");
  }
  return lines.join("\n");
}
function defaultRunCommand(cmd, args) {
  return execFileSync3(cmd, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5e3,
    windowsHide: true
  }).trim();
}
function commandOrUnavailable(runCommand, cmd, args) {
  try {
    const out = runCommand(cmd, args).trim();
    return out.length > 0 ? firstLine(redactSecrets(out)) : "(empty output)";
  } catch (err) {
    return `(unavailable: ${redactSecrets(String(err)).slice(0, 160)})`;
  }
}
function defaultReportPath(teamagentHome, now) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return path18.join(teamagentHome, "bug-reports", `teamagent-bug-report-${stamp}.md`);
}
function fileStatus(label, file) {
  try {
    const stat = fs16.statSync(file);
    return `- ${label}: present (${stat.size} bytes) ${file}`;
  } catch {
    return `- ${label}: missing ${file}`;
  }
}
function renderHookCommands(label, settingsPath) {
  if (!fs16.existsSync(settingsPath)) return `### ${label}

(missing: ${settingsPath})
`;
  try {
    const parsed = JSON.parse(fs16.readFileSync(settingsPath, "utf-8"));
    const hooks = parsed.hooks ?? {};
    const lines = [`### ${label}`, ""];
    let count = 0;
    for (const [event, entries] of Object.entries(hooks)) {
      for (const entry of entries ?? []) {
        for (const hook of entry.hooks ?? []) {
          count++;
          lines.push(`- ${event}: ${hook.type ?? "command"} timeout=${hook.timeout ?? "(default)"}`);
          lines.push(`  command: ${redactSecrets(hook.command ?? "(missing)")}`);
          if (entry.matcher) lines.push(`  matcher: ${entry.matcher}`);
        }
      }
    }
    if (count === 0) lines.push("(no hooks configured)");
    lines.push("");
    return lines.join("\n");
  } catch (err) {
    return `### ${label}

(settings parse failed: ${redactSecrets(String(err))})
`;
  }
}
function logFiles(cwd, teamagentHome) {
  return [
    { label: "TEAMAGENT_HOME update.log", file: path18.join(teamagentHome, "update.log") },
    { label: "TEAMAGENT_HOME update-state.json", file: path18.join(teamagentHome, "update-state.json") },
    { label: "project events.jsonl", file: path18.join(cwd, ".teamagent", "events.jsonl") },
    { label: "project config.json", file: path18.join(cwd, ".teamagent", "config.json") }
  ];
}
function renderFileBlock(label, file) {
  const heading = `### ${label}`;
  if (!fs16.existsSync(file)) return `${heading}

(missing: ${file})
`;
  try {
    const raw = readTail(file, MAX_LOG_BYTES);
    const text = redactSecrets(raw);
    return `${heading}

path: ${file}

\`\`\`text
${text}
\`\`\`
`;
  } catch (err) {
    return `${heading}

(read failed: ${redactSecrets(String(err))})
`;
  }
}
function readTail(file, maxBytes) {
  const stat = fs16.statSync(file);
  const fd = fs16.openSync(file, "r");
  try {
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    fs16.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
    const prefix = stat.size > maxBytes ? `[truncated: showing last ${maxBytes} bytes]
` : "";
    return prefix + buffer.toString("utf-8");
  } finally {
    fs16.closeSync(fd);
  }
}
function redactSecrets(input) {
  return input.replace(/(Authorization:\s*Bearer\s+)[^\s"']+/gi, "$1[redacted]").replace(/\b(sk-ant-[A-Za-z0-9._-]+)/g, "[redacted]").replace(/\b(sk-[A-Za-z0-9]{20,})\b/g, "[redacted]").replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, "[redacted]").replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]");
}
function firstLine(text) {
  return text.split(/\r?\n/)[0] ?? text;
}

// ../cli/src/commands/dashboard.ts
init_esm_shims();
import { spawn, spawnSync } from "child_process";
import fs17 from "fs";
import http from "http";
import os14 from "os";
import path19 from "path";
var DashboardArgsError = class extends Error {
};
function parseDurationMs(value) {
  const trimmed = value.trim();
  const match = /^(\d+)(ms|s|m)?$/.exec(trimmed);
  if (!match) throw new DashboardArgsError(`invalid interval: ${value}`);
  const n = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (!Number.isFinite(n) || n <= 0) throw new DashboardArgsError(`invalid interval: ${value}`);
  if (unit === "m") return n * 6e4;
  if (unit === "s") return n * 1e3;
  return n;
}
function parseDashboardArgs(argv) {
  const opts = {
    host: "127.0.0.1",
    port: 8787,
    intervalMs: 2e3
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--watch" || arg === "--serve") {
      opts.watch = true;
    } else if (arg === "--once") {
      opts.once = true;
    } else if (arg === "--open") {
      opts.open = true;
    } else if (arg === "--host") {
      const value = argv[++i];
      if (!value) throw new DashboardArgsError("--host requires a value");
      opts.host = value;
    } else if (arg.startsWith("--host=")) {
      opts.host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      const value = argv[++i];
      if (!value) throw new DashboardArgsError("--port requires a value");
      opts.port = Number(value);
    } else if (arg.startsWith("--port=")) {
      opts.port = Number(arg.slice("--port=".length));
    } else if (arg === "--interval") {
      const value = argv[++i];
      if (!value) throw new DashboardArgsError("--interval requires a value");
      opts.intervalMs = parseDurationMs(value);
    } else if (arg.startsWith("--interval=")) {
      opts.intervalMs = parseDurationMs(arg.slice("--interval=".length));
    } else {
      throw new DashboardArgsError(`unknown dashboard option: ${arg}`);
    }
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    throw new DashboardArgsError(`--port must be an integer between 0 and 65535`);
  }
  if (!opts.watch && !opts.once) opts.watch = true;
  if (opts.watch && opts.once) {
    throw new DashboardArgsError("--watch and --once cannot be used together");
  }
  return opts;
}
function findRepoRoot(cwd) {
  let dir = path19.resolve(cwd);
  for (let i = 0; i < 8; i++) {
    if (fs17.existsSync(path19.join(dir, "pnpm-workspace.yaml")) && fs17.existsSync(path19.join(dir, "scripts", "generate-dashboard.cjs"))) {
      return dir;
    }
    const next = path19.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return path19.resolve(cwd);
}
function dashboardPaths(cwd) {
  const root = findRepoRoot(cwd);
  return {
    root,
    generatorPath: path19.join(root, "scripts", "generate-dashboard.cjs"),
    outputPath: path19.join(root, "docs", "dashboard.html")
  };
}
function generateDashboardOnce(cwd = process.cwd()) {
  const { root, generatorPath, outputPath } = dashboardPaths(cwd);
  if (!fs17.existsSync(generatorPath)) {
    throw new Error(`dashboard generator not found: ${generatorPath}`);
  }
  const result = spawnSync(process.execPath, [generatorPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `dashboard generator failed with exit ${result.status ?? "unknown"}`,
        result.stdout?.trim(),
        result.stderr?.trim()
      ].filter(Boolean).join("\n")
    );
  }
  return outputPath;
}
function injectAutoRefresh(html, intervalMs) {
  const script = `
<script>
(() => {
  const ms = ${JSON.stringify(intervalMs)};
  const badge = document.createElement("div");
  badge.textContent = "live refresh: " + Math.round(ms / 1000) + "s";
  badge.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:99999;padding:8px 10px;border-radius:10px;background:rgba(15,23,42,.9);color:#e5e7eb;font:12px ui-monospace,Menlo,monospace";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(badge));
  setInterval(() => window.location.reload(), ms);
})();
</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${script}
</body>`) : `${html}
${script}`;
}
function openBrowser(url) {
  const platform = os14.platform();
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}
function dashboardHealthPayload(args) {
  const lastError = args.lastError ?? "";
  return {
    service: "teamagent-dashboard",
    ok: !lastError,
    status: lastError ? "error" : "ok",
    stableHealthSignal: "teamagent-dashboard-health",
    outputPath: args.outputPath,
    lastGeneratedAt: args.lastGeneratedAt,
    lastError
  };
}
async function launchDashboard(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const outputPath = generateDashboardOnce(cwd);
  if (options.once) {
    return { mode: "once", outputPath };
  }
  const intervalMs = options.intervalMs ?? 2e3;
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 8787;
  let lastGeneratedAt = (/* @__PURE__ */ new Date()).toISOString();
  let lastError = "";
  const regenerate = () => {
    try {
      generateDashboardOnce(cwd);
      lastGeneratedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastError = "";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  };
  const timer = setInterval(regenerate, intervalMs);
  const server = http.createServer((req, res) => {
    const url2 = new URL(req.url ?? "/", `http://${host}`);
    if (url2.pathname === "/health.json") {
      res.writeHead(lastError ? 500 : 200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(dashboardHealthPayload({ outputPath, lastGeneratedAt, lastError }), null, 2));
      return;
    }
    if (url2.pathname === "/" || url2.pathname === "/dashboard.html") {
      try {
        const html = fs17.readFileSync(outputPath, "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(injectAutoRefresh(html, intervalMs));
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });
  await new Promise((resolve5, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => resolve5());
  });
  server.on("close", () => clearInterval(timer));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${port}/dashboard.html`;
  if (options.open) openBrowser(url);
  return { mode: "watch", outputPath, url, host, port, intervalMs };
}
function renderDashboardLaunch(result) {
  if (result.mode === "once") {
    return `Dashboard generated: ${result.outputPath}
`;
  }
  return [
    `Real-time TeamAgent dashboard: ${result.url}`,
    `Serving: ${result.outputPath}`,
    `Refresh interval: ${result.intervalMs}ms`,
    `Press Ctrl+C to stop.`,
    ""
  ].join("\n");
}

// ../cli/src/commands/ingest.ts
init_esm_shims();
import os15 from "os";
import path21 from "path";
import fs19 from "fs";
import { execSync as execSync6 } from "child_process";

// ../adapters/src/ingest/insights.ts
init_esm_shims();
var InsightItemSchema = external_exports.object({
  type: external_exports.string(),
  text: external_exports.string().min(1),
  weight: external_exports.number().min(0).max(1).default(0.7)
});
var InsightsReportSchema = external_exports.object({
  insights: external_exports.array(InsightItemSchema)
});
function parseInsightsReport(raw) {
  const parsed = InsightsReportSchema.parse(JSON.parse(raw));
  return parsed.insights.map((item) => ({
    kind: "insights",
    context: `[type=${item.type}] ${item.text}`,
    weight: item.weight
  }));
}

// ../adapters/src/ingest/npm-audit.ts
init_esm_shims();
import fs18 from "fs";
import path20 from "path";
function parseNpmAudit(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const vulns = data.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return [];
  const out = [];
  for (const [pkg, rawVuln] of Object.entries(
    vulns
  )) {
    if (!rawVuln || typeof rawVuln !== "object") continue;
    const v = rawVuln;
    const severity = typeof v.severity === "string" ? v.severity.toLowerCase() : "";
    if (severity !== "high" && severity !== "critical") continue;
    const title = typeof v.title === "string" ? v.title : "";
    const url = typeof v.url === "string" ? v.url : "";
    out.push({
      kind: "npm-audit",
      context: `[severity=${severity}] ${pkg}: ${title} (${url || "no url"})`,
      weight: severity === "critical" ? 1 : 0.8
    });
  }
  return out;
}
function detectAuditCmd(cwd) {
  const dir = cwd ?? process.cwd();
  if (fs18.existsSync(path20.join(dir, "pnpm-lock.yaml"))) return "pnpm audit --json";
  if (fs18.existsSync(path20.join(dir, "yarn.lock"))) return "yarn audit --json";
  return "npm audit --json";
}
async function getNpmAuditOutput(runner, cwd) {
  const cmd = detectAuditCmd(cwd);
  try {
    return await runner(cmd, { cwd });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const match = message.match(/\{[\s\S]*\}$/);
    if (match) return match[0];
    throw err;
  }
}

// ../adapters/src/ingest/pr-review.ts
init_esm_shims();
function parseGhPrReviews(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const reviews = data.reviews;
  if (!Array.isArray(reviews)) return [];
  const out = [];
  for (const r of reviews) {
    if (!r || typeof r !== "object") continue;
    const body = typeof r.body === "string" ? r.body : "";
    const state = typeof r.state === "string" ? r.state : "";
    if (body.trim().length < 10) continue;
    if (state === "APPROVED") continue;
    const weight = state === "CHANGES_REQUESTED" ? 0.9 : 0.5;
    out.push({
      kind: "pr-review",
      context: `[state=${state || "unknown"}] ${body}`,
      weight
    });
  }
  return out;
}
async function getGhPrReviews(prNumber, runner) {
  return runner(`gh pr view ${prNumber} --json reviews`);
}
async function isGhAvailable(runner) {
  try {
    await runner("gh --version");
    return true;
  } catch {
    return false;
  }
}

// ../adapters/src/ingest/git-hotspot.ts
init_esm_shims();
var NUMSTAT_LINE = /^\s*(\d+|-)\s+(\d+|-)\s+(\S.*)$/;
function parseGitHotspots(logOutput, opts = {}) {
  const threshold = opts.threshold ?? 3;
  const counts = /* @__PURE__ */ new Map();
  for (const line of logOutput.split(/\r?\n/)) {
    const m = line.match(NUMSTAT_LINE);
    if (!m) continue;
    const filePath = m[3];
    counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c >= threshold).map(([path33, change_count]) => ({ path: path33, change_count })).sort((a, b) => b.change_count - a.change_count);
}
function hotspotsToCandidateItems(hotspots) {
  return hotspots.map((h) => ({
    label: `${h.path} (changed ${h.change_count} times)`
  }));
}
async function getGitNumstat(runner, opts = {}) {
  const since = opts.sinceDays ? `--since="${opts.sinceDays} days ago"` : "";
  const cmd = `git log ${since} --numstat --pretty=format:"commit %H"`;
  return runner(cmd, { cwd: opts.cwd });
}

// ../adapters/src/ingest/ci-failure.ts
init_esm_shims();
function parseGhRunList(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const row = r;
    if (typeof row.databaseId !== "number") continue;
    out.push({
      id: row.databaseId,
      name: typeof row.name === "string" ? row.name : "",
      branch: typeof row.headBranch === "string" ? row.headBranch : "",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : ""
    });
  }
  return out;
}
function runsToCandidateItems(runs) {
  return runs.map((r) => ({
    label: `Run #${r.id} (${r.name}, branch ${r.branch}) \u2014 ${r.createdAt}`
  }));
}
async function getGhRunList(runner, opts = {}) {
  const limit = opts.limit ?? 30;
  return runner(
    `gh run list --status=failure --json databaseId,name,headBranch,createdAt,conclusion --limit ${limit}`
  );
}
function filterBySince(runs, sinceDays, now) {
  if (!sinceDays || sinceDays <= 0) return runs;
  const cutoff = now.getTime() - sinceDays * 24 * 3600 * 1e3;
  return runs.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isNaN(t) ? true : t >= cutoff;
  });
}

// ../adapters/src/ingest/candidate-md.ts
init_esm_shims();
var SOURCE_COMMENT_RE = /<!--\s*teamagent-candidate-source:\s*([\w-]+)\s*-->/;
var CHECKBOX_LINE_RE = /^\s*-\s*\[([ xX])\]\s+(.+?)\s*$/;
function formatCandidateMd(source, items, opts = {}) {
  const lines = [];
  lines.push(`# TeamAgent ingest candidates (${source})`);
  lines.push(`<!-- teamagent-candidate-source: ${source} -->`);
  if (opts.generatedAt) {
    lines.push(`<!-- generated-at: ${opts.generatedAt} -->`);
  }
  lines.push("");
  lines.push("\u52FE\u9009 `[x]` \u4FDD\u7559\u60F3\u6444\u5165\u7684\u5019\u9009\uFF0C\u7136\u540E\u8DD1\uFF1A");
  lines.push("");
  lines.push("```");
  lines.push(`teamagent ingest --from-candidates <this-file>`);
  lines.push("```");
  lines.push("");
  if (items.length === 0) {
    lines.push("_(\u65E0\u5019\u9009)_");
  } else {
    for (const item of items) {
      lines.push(`- [ ] ${item.label}`);
      if (item.meta) lines.push(`      ${item.meta}`);
    }
  }
  return lines.join("\n") + "\n";
}
function parseCandidateMd(md) {
  const sourceMatch = md.match(SOURCE_COMMENT_RE);
  if (!sourceMatch) {
    throw new Error(
      "candidate md \u7F3A\u5C11 <!-- teamagent-candidate-source: ... --> \u6807\u8BB0"
    );
  }
  const source = sourceMatch[1];
  if (source !== "git-hotspot" && source !== "ci-failure") {
    throw new Error(`\u672A\u77E5 candidate source: ${source}`);
  }
  const checked = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(CHECKBOX_LINE_RE);
    if (!m) continue;
    const mark = m[1];
    if (mark !== "x" && mark !== "X") continue;
    checked.push(m[2]);
  }
  return { source, checked };
}
function candidatesToExtractionInputs(parsed) {
  const kind = parsed.source;
  return parsed.checked.map((label) => ({
    kind,
    context: label,
    weight: 0.5
  }));
}

// ../cli/src/commands/ingest.ts
function resolvePaths3(opts) {
  const home = opts.homeDir ?? os15.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    cwd,
    home,
    projectDbPath: opts.projectDbPath ?? path21.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path21.join(home, ".teamagent", "global.db"),
    skillsDir: opts.skillsDir ?? path21.join(home, ".claude", "skills", "teamagent"),
    candidatesDir: path21.join(cwd, ".teamagent", "candidates")
  };
}
function detectProjectStack(cwd) {
  try {
    const presence = {
      exists: (rel) => fs19.existsSync(path21.join(cwd, rel)),
      read: (rel) => {
        const full = path21.join(cwd, rel);
        return fs19.existsSync(full) ? fs19.readFileSync(full, "utf-8") : void 0;
      }
    };
    const fp = detectStack(presence);
    const langToFt = {
      typescript: "ts",
      javascript: "js",
      python: "py",
      go: "go",
      rust: "rs",
      java: "java"
    };
    return fp.languages.map((l) => langToFt[l] ?? l);
  } catch {
    return [];
  }
}
async function defaultRunner(cmd, opts = {}) {
  return execSync6(cmd, {
    cwd: opts.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
}
async function loadInputs(opts) {
  switch (opts.source) {
    case "insights": {
      if (!opts.filePath) {
        throw new Error("--from-insights \u9700\u8981 <path>");
      }
      const raw = fs19.readFileSync(opts.filePath, "utf-8");
      return parseInsightsReport(raw);
    }
    case "npm-audit": {
      const runner = opts.cmdRunner ?? defaultRunner;
      const raw = await getNpmAuditOutput(runner, opts.cwd);
      return parseNpmAudit(raw);
    }
    case "git-hotspot": {
      throw new Error(
        "git-hotspot \u6E90\u53EA\u4EA7\u51FA\u5019\u9009\u6587\u4EF6\uFF0C\u4E0D\u76F4\u63A5 ingest\u3002\u89C1 executeIngest \u7684 handleSemiAuto\u3002"
      );
    }
    case "ci-failure": {
      throw new Error(
        "ci-failure \u6E90\u53EA\u4EA7\u51FA\u5019\u9009\u6587\u4EF6\uFF0C\u4E0D\u76F4\u63A5 ingest\u3002\u89C1 executeIngest \u7684 handleSemiAuto\u3002"
      );
    }
    case "candidates": {
      if (!opts.filePath) {
        throw new Error("--from-candidates \u9700\u8981 <path>");
      }
      const raw = fs19.readFileSync(opts.filePath, "utf-8");
      const parsed = parseCandidateMd(raw);
      return candidatesToExtractionInputs(parsed);
    }
    case "pr-review": {
      if (opts.prNumber === void 0 || Number.isNaN(opts.prNumber)) {
        throw new Error("--from-pr \u9700\u8981 <number>");
      }
      const runner = opts.cmdRunner ?? defaultRunner;
      const simpleRunner = (cmd) => runner(cmd, {});
      if (!await isGhAvailable(simpleRunner)) {
        throw new Error(
          "gh CLI \u672A\u5B89\u88C5\u3002\u53C2\u8003 https://cli.github.com \u5B89\u88C5\u540E\u91CD\u8BD5\u3002"
        );
      }
      const raw = await getGhPrReviews(opts.prNumber, simpleRunner);
      return parseGhPrReviews(raw);
    }
    default:
      throw new Error(`\u6E90 '${opts.source}' \u5C1A\u672A\u5B9E\u73B0\uFF08M2.3 \u540E\u7EED task\uFF09`);
  }
}
async function executeIngest(opts) {
  const paths = resolvePaths3(opts);
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const idGen = opts.idGen ?? (() => {
    const ts = now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 8);
    return `ing-${ts}-${rand}`;
  });
  if (opts.source === "git-hotspot" || opts.source === "ci-failure") {
    return handleSemiAuto(opts, paths, now);
  }
  fs19.mkdirSync(path21.dirname(paths.projectDbPath), { recursive: true });
  fs19.mkdirSync(path21.dirname(paths.userGlobalDbPath), { recursive: true });
  let inputs;
  try {
    inputs = await loadInputs(opts);
  } catch (err) {
    return `\u2717 \u52A0\u8F7D ingest \u6E90\u5931\u8D25: ${String(err).slice(0, 200)}
`;
  }
  if (inputs.length === 0) {
    return `\u2713 ingest \u6E90 '${opts.source}' \u626B\u63CF\u5B8C\u6210\uFF1A0 \u6761\u5019\u9009
`;
  }
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  const dualStore = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  const projectStore = dualStore.getProjectStore();
  const projectStack = detectProjectStack(paths.cwd);
  const validator = { validateLevel0 };
  const result = await runIngestPipeline({
    inputs,
    extractor: llmBasedKnowledgeExtractor,
    callLLM: (prompt) => llm.complete(prompt),
    validator,
    store: projectStore,
    scope: { level: "personal" },
    source: "ingested",
    projectStack,
    now,
    idGen,
    dryRun
  });
  if (!dryRun && result.accepted.length > 0) {
    try {
      await runCompile({
        store: dualStore,
        skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir })
      });
      const ids = result.accepted.map((e) => e.id);
      if (opts.docsPropagationScheduler) {
        await opts.docsPropagationScheduler(ids);
      } else {
        scheduleDocsPropagation(ids, { cwd: paths.cwd });
      }
    } catch {
    }
  }
  dualStore.close();
  return formatReport(opts.source, result, dryRun);
}
function formatReport(source, result, dryRun) {
  const lines = [];
  lines.push(
    dryRun ? `\u{1F50D} TeamAgent Ingest (${source}, dry-run)` : `\u{1F4E5} TeamAgent Ingest (${source})`
  );
  lines.push("");
  lines.push(`  \u626B\u63CF: ${result.scanned}`);
  lines.push(`  \u5165\u5E93: ${result.accepted.length}`);
  lines.push(`  L0 \u62D2\u7EDD: ${result.rejected.length}`);
  lines.push(`  LLM \u8DF3\u8FC7: ${result.skipped}`);
  lines.push(`  \u5931\u8D25: ${result.failed}`);
  if (result.accepted.length > 0) {
    lines.push("");
    lines.push("  \u65B0\u589E\u6761\u76EE:");
    for (const e of result.accepted.slice(0, 5)) {
      lines.push(
        `    - [${e.category}/${e.tags[0] ?? "untagged"}] ${e.trigger} \u2192 ${e.correct_pattern}`
      );
    }
    if (result.accepted.length > 5) {
      lines.push(`    ... (${result.accepted.length - 5} more)`);
    }
  }
  if (result.rejected.length > 0) {
    lines.push("");
    lines.push("  L0 \u62D2\u7EDD\u6458\u8981:");
    const reasonCounts = {};
    for (const r of result.rejected) {
      for (const reason of r.reasons) {
        reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      }
    }
    for (const [reason, n] of Object.entries(reasonCounts)) {
      lines.push(`    - ${reason}: ${n}`);
    }
  }
  return lines.join("\n") + "\n";
}
function parseIngestArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--from-insights" && argv[i + 1]) {
      opts.source = "insights";
      opts.filePath = argv[++i];
    } else if (a === "--from-audit") {
      opts.source = "npm-audit";
    } else if (a === "--from-pr" && argv[i + 1]) {
      opts.source = "pr-review";
      opts.prNumber = parseInt(argv[++i], 10);
    } else if (a === "--from-git") {
      opts.source = "git-hotspot";
    } else if (a === "--from-ci") {
      opts.source = "ci-failure";
    } else if (a === "--from-candidates" && argv[i + 1]) {
      opts.source = "candidates";
      opts.filePath = argv[++i];
    } else if (a.startsWith("--since=")) {
      const raw = a.slice("--since=".length);
      const m = raw.match(/^(\d+)d?$/);
      if (m) {
        opts.sinceDays = parseInt(m[1], 10);
      } else if (raw) {
        throw new Error(`--since \u683C\u5F0F\u65E0\u6548: "${raw}"\u3002\u63A5\u53D7\u683C\u5F0F: "30d" \u6216 "45"\uFF08\u5929\u6570\uFF09`);
      }
    } else if (a.startsWith("--threshold=")) {
      opts.threshold = parseInt(a.slice("--threshold=".length), 10);
    }
  }
  if (!opts.source) {
    throw new Error(
      "ingest \u9700\u8981\u6E90\u6807\u8BB0\uFF1A--from-insights / --from-audit / --from-pr / --from-git / --from-ci / --from-candidates"
    );
  }
  return opts;
}
async function handleSemiAuto(opts, paths, now) {
  fs19.mkdirSync(paths.candidatesDir, { recursive: true });
  const runner = opts.cmdRunner ?? defaultRunner;
  const dateSlug = now().toISOString().slice(0, 10);
  if (opts.source === "git-hotspot") {
    const raw = await getGitNumstat(runner, {
      cwd: paths.cwd,
      sinceDays: opts.sinceDays
    });
    const hotspots = parseGitHotspots(raw, { threshold: opts.threshold });
    const items = hotspotsToCandidateItems(hotspots);
    const md = formatCandidateMd("git-hotspot", items, {
      generatedAt: now().toISOString()
    });
    const outPath = path21.join(
      paths.candidatesDir,
      `git-hotspot-${dateSlug}.md`
    );
    fs19.writeFileSync(outPath, md, "utf-8");
    return formatSemiAutoReport("git-hotspot", items.length, outPath);
  }
  if (opts.source === "ci-failure") {
    const simpleRunner = (cmd) => runner(cmd, {});
    if (!await isGhAvailable(simpleRunner)) {
      throw new Error(
        "gh CLI \u672A\u5B89\u88C5\u3002--from-ci \u9700\u8981 gh\uFF1B\u53C2\u8003 https://cli.github.com\u3002"
      );
    }
    const raw = await getGhRunList(simpleRunner, { limit: 30 });
    const allRuns = parseGhRunList(raw);
    const runs = filterBySince(allRuns, opts.sinceDays, now());
    const items = runsToCandidateItems(runs);
    const md = formatCandidateMd("ci-failure", items, {
      generatedAt: now().toISOString()
    });
    const outPath = path21.join(paths.candidatesDir, `ci-failure-${dateSlug}.md`);
    fs19.writeFileSync(outPath, md, "utf-8");
    return formatSemiAutoReport("ci-failure", items.length, outPath);
  }
  throw new Error(`semi-auto source '${opts.source}' \u672A\u5B9E\u73B0`);
}
function formatSemiAutoReport(source, candidateCount, outPath) {
  return [
    `\u{1F50D} TeamAgent Ingest (${source}, \u5019\u9009\u751F\u6210)`,
    "",
    `  \u5019\u9009\u6570: ${candidateCount}`,
    `  \u5199\u5165: ${outPath}`,
    "",
    `  \u7F16\u8F91\u8BE5\u6587\u4EF6\uFF0C\u628A\u60F3\u6444\u5165\u7684\u6761\u76EE\u6539\u4E3A - [x]\uFF0C\u7136\u540E\u8FD0\u884C\uFF1A`,
    `    teamagent ingest --from-candidates ${outPath}`,
    ""
  ].join("\n");
}

// ../cli/src/commands/compile-cursor.ts
init_esm_shims();
import os16 from "os";
import path22 from "path";
import fs20 from "fs";
function parseCompileCursorArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      opts.out = argv[++i];
    } else if (a.startsWith("--out=")) {
      opts.out = a.slice("--out=".length);
    } else if (a === "--top") {
      opts.top = parseInt(argv[++i] ?? "20", 10);
    } else if (a.startsWith("--top=")) {
      opts.top = parseInt(a.slice("--top=".length), 10);
    }
  }
  return opts;
}
async function executeCompileCursor(opts = {}) {
  const home = opts.homeDir ?? os16.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const top = opts.top ?? 20;
  const projectDbPath = opts.projectDbPath ?? path22.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = opts.userGlobalDbPath ?? path22.join(home, ".teamagent", "global.db");
  const outPath = opts.out ?? path22.join(cwd, ".cursorrules");
  fs20.mkdirSync(path22.dirname(projectDbPath), { recursive: true });
  fs20.mkdirSync(path22.dirname(userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  let entries;
  try {
    entries = store.getAll();
  } finally {
    store.close();
  }
  const sorted = [...entries].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, top);
  const output = compileCursorRules(sorted);
  fs20.mkdirSync(path22.dirname(outPath), { recursive: true });
  fs20.writeFileSync(outPath, output, "utf8");
  return { outPath, ruleCount: sorted.length };
}
function renderCompileCursorResult(result) {
  return `Cursor rules compiled: ${result.ruleCount} rule(s) written to ${result.outPath}
`;
}

// ../cli/src/commands/daily.ts
init_esm_shims();
import os17 from "os";
import path23 from "path";
import fs21 from "fs";
var HELP_PAYLOAD = {
  command: "teamagent daily",
  summary: "Aggregate today's Claude Code activity across all projects on this machine into a per-project digest. LLM-free.",
  usage: "teamagent daily [--projects-root=PATH] [--cwd=PATH] [--archive] [--format=json|context] [--help]",
  flags: {
    "--help": "Print this JSON help schema and exit.",
    "--projects-root": "Override `~/.claude/projects` (used by tests/fixture scans).",
    "--cwd": "Override the operator's cwd reference. Informational only; does not affect which sessions are scanned.",
    "--archive": "Also write ${TEAMAGENT_HOME}/daily/<YYYY-MM-DD>.md (overwrite-on-rerun).",
    "--format": 'Output mode. "json" (default) emits machine-readable JSON; "context" emits the markdown additionalContext the UserPromptSubmit hook would inject.'
  },
  notes: [
    "Source: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. No network.",
    "Worktrees under `.codex/worktrees/<task>` and `.claude/worktrees/<task>` are merged back to the host repo.",
    "TeamAgent itself never calls an LLM here \u2014 the additionalContext form is meant to be consumed by the operator's own Claude Code window.",
    "See `docs/plans/2026-05-13-issue-371-daily-summary/` for the verification playbook."
  ],
  schema: {
    output: {
      date: "YYYY-MM-DD (local time)",
      windowStartMs: "epoch ms of today's local midnight",
      windowEndMs: "epoch ms when the scan ran",
      projects: "array of ProjectDigest objects (see @teamagent/core)",
      worktreeMergedCount: "how many groups contained at least one worktree session",
      skippedSessionCount: "how many jsonl files failed to parse",
      archivedPath: "path to the written archive markdown when --archive is set",
      triggeredBy: '"cli"'
    }
  }
};
function parseDailyArgs(argv) {
  const opts = { format: "json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--archive") {
      opts.archive = true;
    } else if (a.startsWith("--projects-root=")) {
      opts.projectsRoot = a.slice("--projects-root=".length);
    } else if (a === "--projects-root") {
      opts.projectsRoot = argv[++i];
    } else if (a.startsWith("--cwd=")) {
      opts.cwd = a.slice("--cwd=".length);
    } else if (a === "--cwd") {
      opts.cwd = argv[++i];
    } else if (a.startsWith("--format=")) {
      const v = a.slice("--format=".length);
      if (v !== "json" && v !== "context") {
        throw new Error(`Unknown --format value: ${v}. Expected json|context.`);
      }
      opts.format = v;
    } else if (a === "--format") {
      const v = argv[++i];
      if (v !== "json" && v !== "context") {
        throw new Error(`Unknown --format value: ${v}. Expected json|context.`);
      }
      opts.format = v;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return opts;
}
function renderDailyHelp() {
  return JSON.stringify(HELP_PAYLOAD, null, 2) + "\n";
}
function buildDailyResult(opts = {}) {
  const home = opts.homeDir ?? os17.homedir();
  const projectsRoot = opts.projectsRoot ?? path23.join(home, ".claude", "projects");
  const scan = scanTodayActivity({ projectsRoot });
  const digests = scan.groups.map(digestProjectGroup);
  const worktreeMergedCount = digests.filter((d) => d.hadWorktreeSession).length;
  return {
    date: scan.date,
    windowStartMs: scan.windowStartMs,
    windowEndMs: scan.windowEndMs,
    projects: digests,
    worktreeMergedCount,
    skippedSessionCount: scan.skippedCount,
    triggeredBy: "cli"
  };
}
function executeDaily(opts = {}) {
  const result = buildDailyResult(opts);
  const json = JSON.stringify(result, null, 2) + "\n";
  const matcherReason = opts.triggeredBy ?? "cli";
  const contextMarkdown = composeAdditionalContext({
    date: result.date,
    digests: result.projects,
    matcherReason
  });
  const archiveMarkdown = composeArchiveMarkdown({
    date: result.date,
    digests: result.projects,
    matcherReason
  });
  const homeDir = opts.homeDir ?? os17.homedir();
  const teamagentRoot = process.env["TEAMAGENT_HOME"] ?? path23.join(homeDir, ".teamagent");
  const archivePath = path23.join(teamagentRoot, "daily", `${result.date}.md`);
  if (opts.archive) {
    fs21.mkdirSync(path23.dirname(archivePath), { recursive: true });
    const tmpPath = `${archivePath}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs21.writeFileSync(tmpPath, archiveMarkdown, "utf-8");
    fs21.renameSync(tmpPath, archivePath);
    const out = {
      result: { ...result, archivedPath: archivePath },
      json: JSON.stringify({ ...result, archivedPath: archivePath }, null, 2) + "\n",
      contextMarkdown,
      archiveMarkdown,
      archivePath
    };
    return out;
  }
  return {
    result,
    json,
    contextMarkdown,
    archiveMarkdown,
    archivePath
  };
}
function renderDailyStdout(out, opts) {
  const fmt = opts.format ?? "json";
  return fmt === "context" ? out.contextMarkdown + "\n" : out.json;
}

// ../cli/src/commands/config.ts
init_esm_shims();
import fs22 from "fs";
import path24 from "path";

// ../cli/src/find-teamagent-root.ts
init_esm_shims();
function findTeamagentRoot2(cwd) {
  return findTeamagentRoot(cwd) ?? cwd;
}

// ../cli/src/commands/config.ts
var DEFAULTS = {
  stop_mode: "async",
  stop_scan_errors: true,
  stop_scan_errors_timeout_ms: 9e4
};
function readTeamAgentConfig(cwd) {
  const root = findTeamagentRoot2(cwd);
  const file = path24.join(root, ".teamagent", "config.json");
  if (!fs22.existsSync(file)) return { ...DEFAULTS };
  try {
    const raw = fs22.readFileSync(file, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}
function writeTeamAgentConfig(cwd, patch) {
  const dir = path24.join(cwd, ".teamagent");
  const file = path24.join(dir, "config.json");
  fs22.mkdirSync(dir, { recursive: true });
  const existing = readTeamAgentConfig(cwd);
  const merged = { ...existing, ...patch };
  fs22.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}
function executeConfig(opts) {
  const cwd = opts.cwd ?? process.cwd();
  if (opts.subcommand === "stop-mode") {
    const val = opts.value;
    if (val !== "sync" && val !== "async") {
      throw new Error(`Invalid stop-mode value: "${val}". Use "sync" or "async".`);
    }
    writeTeamAgentConfig(cwd, { stop_mode: val });
    return `stop_mode set to "${val}"`;
  }
  if (opts.subcommand === "show") {
    const cfg = readTeamAgentConfig(cwd);
    return JSON.stringify(cfg, null, 2);
  }
  throw new Error(`Unknown config subcommand: "${opts.subcommand}"`);
}

// ../cli/src/commands/scan-errors.ts
init_esm_shims();
import os18 from "os";
import path25 from "path";
import fs23 from "fs";
var SCAN_STATE_FILENAME = "scan-state.json";
function resolveSince(sinceRaw, homeDir, now) {
  if (!sinceRaw) {
    const statePath = path25.join(homeDir, ".teamagent", SCAN_STATE_FILENAME);
    try {
      const state = JSON.parse(fs23.readFileSync(statePath, "utf-8"));
      if (state.lastScanAt) return new Date(String(state.lastScanAt));
    } catch {
    }
    return new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  }
  if (/^\d+h$/.test(sinceRaw)) {
    const hours = parseInt(sinceRaw, 10);
    return new Date(now.getTime() - hours * 60 * 60 * 1e3);
  }
  if (/^\d+d$/.test(sinceRaw)) {
    const days = parseInt(sinceRaw, 10);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1e3);
  }
  const d = new Date(sinceRaw);
  if (isNaN(d.getTime())) {
    throw new Error(
      `--since \u683C\u5F0F\u65E0\u6548: "${sinceRaw}"\u3002\u63A5\u53D7\u683C\u5F0F: "24h"\uFF08\u5C0F\u65F6\uFF09\u3001"7d"\uFF08\u5929\uFF09\u6216 ISO \u65E5\u671F "2026-01-01"`
    );
  }
  return d;
}
function saveScanState(homeDir, now, mode) {
  const dir = path25.join(homeDir, ".teamagent");
  fs23.mkdirSync(dir, { recursive: true });
  fs23.writeFileSync(
    path25.join(dir, SCAN_STATE_FILENAME),
    JSON.stringify({ lastScanAt: now.toISOString(), lastScanMode: mode }, null, 2)
  );
}
function validateAndBuildEntry(raw, id, now) {
  const { category, tags, type, nature, trigger, wrong_pattern, correct_pattern, reasoning } = raw;
  if (!["C", "E", "S", "K"].includes(String(category))) return null;
  if (!["avoidance", "practice"].includes(String(type))) return null;
  if (!["objective", "subjective"].includes(String(nature))) return null;
  if (typeof trigger !== "string" || !trigger.trim()) return null;
  if (typeof correct_pattern !== "string" || !correct_pattern.trim()) return null;
  if (typeof reasoning !== "string" || !reasoning.trim()) return null;
  const ts = now.toISOString();
  return {
    id,
    scope: { level: "personal" },
    category,
    tags: Array.isArray(tags) ? tags.filter((t) => typeof t === "string") : [],
    type,
    nature,
    trigger: String(trigger).trim(),
    wrong_pattern: typeof wrong_pattern === "string" ? wrong_pattern : "",
    correct_pattern: String(correct_pattern).trim(),
    reasoning: String(reasoning).trim(),
    confidence: 0.5,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: ts,
    last_hit_at: "",
    last_validated_at: ts,
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0
  };
}
async function executeScanErrors(opts = { mode: "efficient", minFreq: 2, dryRun: false, quiet: false }) {
  const home = opts.homeDir ?? os18.homedir();
  const now = opts.now ? opts.now() : /* @__PURE__ */ new Date();
  const since = resolveSince(opts.sinceRaw, home, now);
  const projectsRoot = opts.projectsRoot ?? path25.join(home, ".claude", "projects");
  const eventsDbPath = opts.eventsDbPath ?? path25.join(home, ".teamagent", "events.db");
  const candidatesDbPath = opts.candidatesDbPath ?? path25.join(home, ".teamagent", "candidates.db");
  let events = [];
  if (fs23.existsSync(eventsDbPath)) {
    const eventLog = new SqliteEventLog(openDb(eventsDbPath));
    events = eventLog.readAll();
    eventLog.close();
  }
  const sessions = [];
  try {
    const src = new ClaudeSessionSource(projectsRoot);
    const recent = await src.listRecent(20);
    for (const meta of recent) {
      if (meta.startTime < since.toISOString()) continue;
      try {
        sessions.push(await src.loadById(meta.sessionId));
      } catch {
      }
    }
  } catch {
  }
  const collector = new CompositeErrorSignalCollector({ events, sessions, since, now });
  let signals = await collector.collect(since);
  if (opts.mode === "efficient") {
    signals = filterSignals(signals, {
      weightThreshold: 0.3,
      minSessions: opts.minFreq
    });
  }
  if (signals.length === 0) {
    if (!opts.quiet) return "\u{1F4ED} \u65E0\u65B0\u9519\u8BEF\u4FE1\u53F7\uFF0C\u77E5\u8BC6\u5E93\u65E0\u9700\u66F4\u65B0\u3002\n";
    return "";
  }
  const batches = buildErrorBatches(signals);
  const lines = [];
  lines.push(`\u{1F50D} scan-errors [${opts.mode} mode] \u2014 since ${since.toISOString()}`);
  lines.push(`  \u4FE1\u53F7\u6570: ${signals.length}\uFF0C\u6279\u6B21\u6570: ${batches.length}`);
  lines.push("");
  if (opts.dryRun) {
    for (const batch of batches) {
      lines.push(`  [dry-run] category=${batch.category} signals=${batch.signals.length}`);
      for (const s of batch.signals) {
        lines.push(
          `    - [${s.signalType}] w=${s.weight.toFixed(2)} ${s.context.slice(0, 80)}`
        );
      }
    }
    lines.push("");
    lines.push("  (dry-run \u6A21\u5F0F\uFF0C\u672A\u5199\u5165\u5019\u9009\u961F\u5217)");
    return lines.join("\n") + "\n";
  }
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  fs23.mkdirSync(path25.dirname(candidatesDbPath), { recursive: true });
  const queueDb = openDb(candidatesDbPath);
  const queue = new SqliteCandidateQueue(queueDb);
  let totalCandidates = 0;
  for (const batch of batches) {
    let rawResponse;
    try {
      rawResponse = await llm.complete(batch.prompt);
    } catch (e) {
      lines.push(
        `  \u26A0 LLM \u8C03\u7528\u5931\u8D25 (category=${batch.category}): ${String(e).slice(0, 100)}`
      );
      continue;
    }
    let entries = [];
    try {
      const fenced = rawResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const json = fenced ? fenced[1].trim() : rawResponse.trim();
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) entries = parsed;
    } catch {
      lines.push(`  \u26A0 LLM \u54CD\u5E94\u89E3\u6790\u5931\u8D25 (category=${batch.category})`);
      continue;
    }
    for (const raw of entries) {
      const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
      const rand = Math.random().toString(36).slice(2, 8);
      const candidateId = `cand-${ts}-${rand}`;
      const entryId = `pers-${ts}-${rand}`;
      const entry = validateAndBuildEntry(raw, entryId, now);
      if (!entry) continue;
      const sourceDesc = batch.signals.map((s) => `${s.signalType}\xD7${s.sessionIds.length}`).join(", ");
      queue.enqueue([{ id: candidateId, entry, sourceSignals: sourceDesc }]);
      totalCandidates++;
    }
  }
  queueDb.close();
  saveScanState(home, now, opts.mode);
  if (totalCandidates > 0 && fs23.existsSync(eventsDbPath)) {
    try {
      const eventLog = new SqliteEventLog(openDb(eventsDbPath));
      const addedEvent = {
        id: `ev-cand-added-${now.getTime()}`,
        kind: "error.candidate.added",
        timestamp: now.toISOString(),
        schema_version: 1
      };
      addedEvent.count = totalCandidates;
      eventLog.append(addedEvent);
      eventLog.close();
    } catch {
    }
  }
  lines.push(`  \u2713 \u65B0\u589E\u5019\u9009\u89C4\u5219: ${totalCandidates} \u6761`);
  if (totalCandidates > 0) {
    lines.push(`  \u8FD0\u884C teamagent review-candidates \u5BA1\u6838`);
  }
  return lines.join("\n") + "\n";
}
function parseScanErrorsArgs(argv) {
  const opts = {
    mode: "efficient",
    minFreq: 2,
    dryRun: false,
    quiet: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode" && argv[i + 1]) {
      const v = argv[++i];
      if (v === "full" || v === "efficient") opts.mode = v;
      else throw new Error(`--mode \u5FC5\u987B\u662F "efficient" \u6216 "full"\uFF0C\u6536\u5230: "${v}"`);
    } else if (a.startsWith("--mode=")) {
      const v = a.slice("--mode=".length);
      if (v === "full" || v === "efficient") opts.mode = v;
      else throw new Error(`--mode \u5FC5\u987B\u662F "efficient" \u6216 "full"\uFF0C\u6536\u5230: "${v}"`);
    } else if (a === "--min-freq" && argv[i + 1]) {
      const v = parseInt(argv[++i], 10);
      if (isNaN(v)) throw new Error(`--min-freq \u5FC5\u987B\u662F\u6574\u6570\uFF0C\u6536\u5230: "${argv[i]}"`);
      opts.minFreq = v;
    } else if (a.startsWith("--min-freq=")) {
      const v = parseInt(a.slice("--min-freq=".length), 10);
      if (isNaN(v)) throw new Error(`--min-freq \u5FC5\u987B\u662F\u6574\u6570\uFF0C\u6536\u5230: "${a.slice("--min-freq=".length)}"`);
      opts.minFreq = v;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--quiet") {
      opts.quiet = true;
    } else if (a === "--since" && argv[i + 1]) {
      opts.sinceRaw = argv[++i];
    } else if (a.startsWith("--since=")) {
      opts.sinceRaw = a.slice("--since=".length);
    }
  }
  return opts;
}

// ../cli/src/commands/review-candidates.ts
init_esm_shims();
import os19 from "os";
import path26 from "path";
import fs24 from "fs";
import * as readline from "readline";
async function executeReviewCandidates(opts = {}) {
  const home = opts.homeDir ?? os19.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const candidatesDbPath = opts.candidatesDbPath ?? path26.join(home, ".teamagent", "candidates.db");
  const projectDbPath = opts.projectDbPath ?? path26.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = opts.userGlobalDbPath ?? path26.join(home, ".teamagent", "global.db");
  const eventsDbPath = opts.eventsDbPath ?? path26.join(home, ".teamagent", "events.db");
  const skillsDir = opts.skillsDir ?? path26.join(home, ".claude", "skills", "teamagent");
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const output = opts.output ?? process.stdout;
  const approveScope = opts.approveScope;
  const emitEvent = (evt) => {
    if (!fs24.existsSync(eventsDbPath)) return;
    try {
      const eventLog = new SqliteEventLog(openDb(eventsDbPath));
      eventLog.append({ ...evt, schema_version: 1 });
      eventLog.close();
    } catch {
    }
  };
  if (!fs24.existsSync(candidatesDbPath)) {
    return "\u{1F4ED} \u5019\u9009\u961F\u5217\u4E3A\u7A7A\uFF08candidates.db \u4E0D\u5B58\u5728\uFF09\u3002\u5148\u8FD0\u884C teamagent scan-errors\u3002\n";
  }
  const queueDb = openDb(candidatesDbPath);
  const queue = new SqliteCandidateQueue(queueDb);
  let pending = queue.listPending();
  if (opts.limit !== void 0) {
    pending = pending.slice(0, opts.limit);
  }
  if (pending.length === 0) {
    queueDb.close();
    return "\u2705 \u5019\u9009\u961F\u5217\u5DF2\u6E05\u7A7A\uFF0C\u65E0\u5F85\u5BA1\u6838\u6761\u76EE\u3002\n";
  }
  fs24.mkdirSync(path26.dirname(projectDbPath), { recursive: true });
  fs24.mkdirSync(path26.dirname(userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const projectStore = store.getProjectStore();
  const rl = readline.createInterface({
    input: opts.input ?? process.stdin,
    output
  });
  const ask = (prompt) => new Promise((resolve5) => rl.question(prompt, resolve5));
  output.write(`\u{1F4CB} \u5019\u9009\u89C4\u5219\u5BA1\u6838 \u2014 \u5171 ${pending.length} \u6761\u5F85\u5BA1
`);
  output.write("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n");
  let approved = 0;
  let rejected = 0;
  let skipped = 0;
  const approvedRuleIds = [];
  for (let i = 0; i < pending.length; i++) {
    const candidate = pending[i];
    const e = candidate.entry;
    output.write(`
[${i + 1}/${pending.length}] category=${e.category}  tags=[${e.tags.join(", ")}]
`);
    output.write(`  trigger:  ${e.trigger}
`);
    if (e.wrong_pattern) output.write(`  wrong:    ${e.wrong_pattern}
`);
    output.write(`  correct:  ${e.correct_pattern}
`);
    output.write(`  reason:   ${e.reasoning}
`);
    output.write(`  \u6765\u6E90\u4FE1\u53F7: ${candidate.sourceSignals}
`);
    output.write(`  confidence: ${e.confidence.toFixed(2)}
`);
    output.write("\n  [a]pprove  [r]eject  [s]kip  [q]uit\n");
    const answer = (await ask("> ")).trim().toLowerCase();
    if (answer === "q") {
      output.write("\n\u9000\u51FA\u5BA1\u6838\uFF0C\u5269\u4F59\u6761\u76EE\u4FDD\u7559\u5728\u961F\u5217\u4E2D\u3002\n");
      break;
    }
    if (answer === "a") {
      try {
        const approvedEntry = approveScope ? { ...e, scope: { ...e.scope, level: approveScope } } : e;
        if (approvedEntry.scope.level === "team") {
          const findings = detectSensitiveText([
            approvedEntry.trigger,
            approvedEntry.wrong_pattern,
            approvedEntry.correct_pattern,
            approvedEntry.reasoning,
            approvedEntry.tags.join("\n")
          ].join("\n"));
          if (findings.length > 0) {
            const kinds = [...new Set(findings.map((f) => f.kind))].join(", ");
            output.write(`\u26A0 \u9690\u79C1\u5B88\u95E8\u62E6\u622A: team \u5019\u9009\u542B\u654F\u611F\u4FE1\u606F (${kinds})\uFF0C\u672A\u5199\u5165\u77E5\u8BC6\u5E93
`);
            continue;
          }
        }
        store.add(approvedEntry);
        queue.updateStatus(candidate.id, "approved");
        approved++;
        approvedRuleIds.push(approvedEntry.id);
        output.write(`\u2713 \u5DF2\u5199\u5165\u77E5\u8BC6\u5E93 (id: ${approvedEntry.id}, scope: ${approvedEntry.scope.level})
`);
        emitEvent({
          id: `ev-cand-approved-${now().getTime()}-${candidate.id.slice(-6)}`,
          kind: "error.candidate.approved",
          knowledge_id: approvedEntry.id,
          timestamp: now().toISOString()
        });
      } catch (err) {
        output.write(`\u26A0 \u5199\u5165\u5931\u8D25: ${String(err).slice(0, 100)}
`);
      }
    } else if (answer === "r") {
      queue.updateStatus(candidate.id, "rejected");
      rejected++;
      output.write("\u2717 \u5DF2\u62D2\u7EDD\n");
      emitEvent({
        id: `ev-cand-rejected-${now().getTime()}-${candidate.id.slice(-6)}`,
        kind: "error.candidate.rejected",
        timestamp: now().toISOString()
      });
    } else {
      queue.updateStatus(candidate.id, "skipped");
      skipped++;
      output.write("\u2192 \u5DF2\u8DF3\u8FC7\uFF08\u4E0B\u6B21\u5BA1\u6838\u53EF\u89C1\uFF09\n");
    }
  }
  rl.close();
  if (approved > 0) {
    output.write("\n\u91CD\u65B0\u6821\u51C6 + \u66F4\u65B0 Skills + \u8C03\u5EA6 docs propagation\u2026\n");
    try {
      await runCalibrationPipeline({
        calibrator: defaultCalibrator,
        store: projectStore,
        events: [],
        now
      });
      await runCompile({
        store,
        skillCompiler: makeSkillCompiler({ skillsDir })
      });
      if (opts.docsPropagationScheduler) {
        await opts.docsPropagationScheduler(approvedRuleIds);
      } else {
        scheduleDocsPropagation(approvedRuleIds, { cwd });
      }
      output.write("\u2713 Skills \u5DF2\u66F4\u65B0\uFF1Bdocs propagation \u5DF2\u8C03\u5EA6\n");
    } catch (err) {
      output.write(`\u26A0 \u6821\u51C6/\u5BFC\u51FA\u5931\u8D25: ${String(err).slice(0, 100)}
`);
    }
  }
  store.close();
  queueDb.close();
  return `
\u5BA1\u6838\u5B8C\u6210: \u2713\u6279\u51C6 ${approved}  \u2717\u62D2\u7EDD ${rejected}  \u2192\u8DF3\u8FC7 ${skipped}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
`;
}
function parseReviewCandidatesArgs(argv) {
  const opts = { limit: Number.POSITIVE_INFINITY };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[++i], 10);
    } else if (a.startsWith("--limit=")) {
      opts.limit = parseInt(a.slice("--limit=".length), 10);
    } else if (a === "--approve-scope" && argv[i + 1]) {
      const scope = argv[++i];
      if (scope === "personal" || scope === "team" || scope === "global") {
        opts.approveScope = scope;
      }
    } else if (a.startsWith("--approve-scope=")) {
      const scope = a.slice("--approve-scope=".length);
      if (scope === "personal" || scope === "team" || scope === "global") {
        opts.approveScope = scope;
      }
    }
  }
  return opts;
}

// ../cli/src/commands/team-transfer.ts
init_esm_shims();
import fs25 from "fs";
import os20 from "os";
import path27 from "path";
function defaultPaths(cwd, homeDir) {
  return {
    projectDbPath: path27.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: path27.join(homeDir, ".teamagent", "global.db"),
    defaultOutPath: path27.join(cwd, ".teamagent", "team-rules.json")
  };
}
function sensitiveTextForEntry(entry) {
  return [
    entry.trigger,
    entry.wrong_pattern,
    entry.correct_pattern,
    entry.reasoning,
    entry.tags.join("\n")
  ].join("\n");
}
function buildTeamBundle(entries, exportedAt) {
  return {
    schema_version: 1,
    exported_at: exportedAt,
    entries: entries.map((entry) => ({
      ...entry,
      scope: { ...entry.scope, level: "team" }
    }))
  };
}
function parseTeamExportArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--out" || a === "--output") && argv[i + 1]) {
      opts.outPath = argv[++i];
    } else if (a.startsWith("--out=")) {
      opts.outPath = a.slice("--out=".length);
    } else if (a.startsWith("--output=")) {
      opts.outPath = a.slice("--output=".length);
    }
  }
  return opts;
}
function parseTeamImportArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--file" || a === "--input") && argv[i + 1]) {
      opts.filePath = argv[++i];
    } else if (a.startsWith("--file=")) {
      opts.filePath = a.slice("--file=".length);
    } else if (a.startsWith("--input=")) {
      opts.filePath = a.slice("--input=".length);
    }
  }
  return opts;
}
function executeTeamExport(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os20.homedir();
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const paths = defaultPaths(cwd, homeDir);
  const outPath = opts.outPath ?? paths.defaultOutPath;
  if (!fs25.existsSync(paths.projectDbPath)) {
    return { ok: true, exported: 0, output: `No project knowledge DB found; exported 0 team rules.
` };
  }
  fs25.mkdirSync(path27.dirname(outPath), { recursive: true });
  fs25.mkdirSync(path27.dirname(paths.userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  try {
    const entries = store.findByScopeLevel("team").filter((entry) => entry.status === "active");
    const sensitive = entries.map((entry) => ({ entry, findings: detectSensitiveText(sensitiveTextForEntry(entry)) })).filter(({ findings }) => findings.length > 0);
    if (sensitive.length > 0) {
      const details = sensitive.map(({ entry, findings }) => `${entry.id}: ${[...new Set(findings.map((f) => f.kind))].join(", ")}`).join("; ");
      return {
        ok: false,
        exported: 0,
        output: `Blocked team export: sensitive fields detected (${details}).
`
      };
    }
    const bundle = buildTeamBundle(entries, now().toISOString());
    fs25.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}
`, "utf-8");
    return {
      ok: true,
      exported: entries.length,
      output: `Exported ${entries.length} team rules to ${outPath}
`
    };
  } finally {
    store.close();
  }
}
function executeTeamImport(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os20.homedir();
  const paths = defaultPaths(cwd, homeDir);
  const filePath = opts.filePath ?? paths.defaultOutPath;
  if (!fs25.existsSync(filePath)) {
    return { ok: false, imported: 0, skipped: 0, output: `Team import file not found: ${filePath}
` };
  }
  const bundle = JSON.parse(fs25.readFileSync(filePath, "utf-8"));
  if (bundle.schema_version !== 1 || !Array.isArray(bundle.entries)) {
    return { ok: false, imported: 0, skipped: 0, output: `Invalid team import bundle: ${filePath}
` };
  }
  fs25.mkdirSync(path27.dirname(paths.projectDbPath), { recursive: true });
  fs25.mkdirSync(path27.dirname(paths.userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  let imported = 0;
  let skipped = 0;
  try {
    for (const entry of bundle.entries) {
      const teamEntry = { ...entry, scope: { ...entry.scope, level: "team" } };
      if (store.getById(teamEntry.id)) {
        skipped++;
        continue;
      }
      store.add(teamEntry);
      imported++;
    }
  } finally {
    store.close();
  }
  return {
    ok: true,
    imported,
    skipped,
    output: `Imported ${imported} team rules from ${filePath}; skipped ${skipped} existing rules.
`
  };
}

// ../cli/src/commands/git-sync.ts
init_esm_shims();
import fs26 from "fs";
import path28 from "path";
import { execSync as nodeExecSync } from "child_process";
function parseGitSyncArgs(argv) {
  const [subcommand, ...flags] = argv;
  if (subcommand !== "push" && subcommand !== "pull") {
    throw new Error(`Usage: teamagent sync <push|pull> --remote <url> [--branch <branch>] [--cwd <path>]`);
  }
  let remote;
  let branch;
  let rulesFile;
  let cwd;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (f.startsWith("--remote=")) {
      remote = f.slice("--remote=".length);
    } else if (f === "--remote" && flags[i + 1]) {
      remote = flags[++i];
    } else if (f.startsWith("--branch=")) {
      branch = f.slice("--branch=".length);
    } else if (f === "--branch" && flags[i + 1]) {
      branch = flags[++i];
    } else if (f.startsWith("--rules-file=")) {
      rulesFile = f.slice("--rules-file=".length);
    } else if (f === "--rules-file" && flags[i + 1]) {
      rulesFile = flags[++i];
    } else if (f.startsWith("--cwd=")) {
      cwd = f.slice("--cwd=".length);
    } else if (f === "--cwd" && flags[i + 1]) {
      cwd = flags[++i];
    }
  }
  if (!remote) throw new Error("Missing required flag: --remote");
  return { subcommand, remote, branch, rulesFile, cwd };
}
function executeGitSyncPush(opts) {
  const cwd = opts.cwd ?? process.cwd();
  const branch = opts.branch ?? "main";
  const rulesFile = opts.rulesFile ?? ".teamagent/team-rules.json";
  const exec = opts.execSync ?? ((cmd, o) => nodeExecSync(cmd, { ...o, stdio: "pipe" }).toString());
  const log = [];
  const outPath = path28.isAbsolute(rulesFile) ? rulesFile : path28.join(cwd, rulesFile);
  const exportResult = executeTeamExport({
    cwd,
    homeDir: opts.homeDir,
    outPath
  });
  log.push(exportResult.output.trim());
  if (!exportResult.ok) {
    return { ok: false, output: log.join("\n") };
  }
  const gitDir = path28.join(cwd, ".git");
  if (!fs26.existsSync(gitDir)) {
    exec("git init", { cwd, encoding: "utf-8" });
    exec(`git checkout -b ${branch}`, { cwd, encoding: "utf-8" });
    log.push(`Initialized git repo in ${cwd}`);
  }
  try {
    const remotes = exec("git remote", { cwd, encoding: "utf-8" });
    if (!remotes.includes("origin")) {
      exec(`git remote add origin "${opts.remote}"`, { cwd, encoding: "utf-8" });
      log.push(`Added remote origin: ${opts.remote}`);
    }
  } catch {
    exec(`git remote add origin "${opts.remote}"`, { cwd, encoding: "utf-8" });
    log.push(`Added remote origin: ${opts.remote}`);
  }
  if (!fs26.existsSync(outPath)) {
    fs26.mkdirSync(path28.dirname(outPath), { recursive: true });
    fs26.writeFileSync(outPath, JSON.stringify({ schema_version: 1, exported_at: (/* @__PURE__ */ new Date()).toISOString(), entries: [] }));
    log.push("Created empty team-rules.json (no rules to export)");
  }
  exec(`git add "${rulesFile}"`, { cwd, encoding: "utf-8" });
  let pushed = false;
  try {
    const status = exec("git status --porcelain", { cwd, encoding: "utf-8" });
    const hasChanges = status.trim().length > 0;
    if (hasChanges || !(opts.skipCleanCommit ?? true)) {
      exec(
        `git -c user.email="teamagent@sync" -c user.name="TeamAgent Sync" commit -m "sync: update team-rules.json"`,
        { cwd, encoding: "utf-8" }
      );
      log.push("Committed team-rules.json");
    } else {
      log.push("No changes to commit \u2014 rules already up to date");
    }
    exec(`git push origin ${branch}`, { cwd, encoding: "utf-8" });
    pushed = true;
    log.push(`Pushed to remote (branch: ${branch})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`Git push failed: ${msg}`);
    return { ok: false, output: log.join("\n"), pushed: false };
  }
  return {
    ok: true,
    output: log.join("\n"),
    exported: exportResult.exported,
    pushed
  };
}
function executeGitSyncPull(opts) {
  const cwd = opts.cwd ?? process.cwd();
  const branch = opts.branch ?? "main";
  const rulesFile = opts.rulesFile ?? ".teamagent/team-rules.json";
  const exec = opts.execSync ?? ((cmd, o) => nodeExecSync(cmd, { ...o, stdio: "pipe" }).toString());
  const log = [];
  const gitDir = path28.join(cwd, ".git");
  let pulled = false;
  try {
    if (!fs26.existsSync(gitDir)) {
      exec(`git clone "${opts.remote}" .`, { cwd, encoding: "utf-8" });
      log.push(`Cloned from ${opts.remote}`);
    } else {
      exec(`git fetch origin`, { cwd, encoding: "utf-8" });
      exec(`git checkout ${branch}`, { cwd, encoding: "utf-8" });
      exec(`git merge --ff-only origin/${branch}`, { cwd, encoding: "utf-8" });
      log.push(`Pulled from origin/${branch}`);
    }
    pulled = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push(`Git pull failed: ${msg}`);
    return { ok: false, output: log.join("\n"), pulled: false };
  }
  const filePath = path28.isAbsolute(rulesFile) ? rulesFile : path28.join(cwd, rulesFile);
  if (!fs26.existsSync(filePath)) {
    log.push(`No team-rules.json found at ${filePath} after pull \u2014 remote may be empty`);
    return { ok: false, output: log.join("\n"), pulled };
  }
  const importResult = executeTeamImport({
    cwd,
    homeDir: opts.homeDir,
    filePath
  });
  log.push(importResult.output.trim());
  return {
    ok: importResult.ok,
    output: log.join("\n"),
    imported: importResult.imported,
    skipped: importResult.skipped,
    pulled
  };
}

// ../cli/src/commands/pr-cycle.ts
init_esm_shims();
import { execSync as execSync7 } from "child_process";
var DEFAULT_WAIT_MS = 5 * 60 * 1e3;
async function executePrCycle(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.cmdRunner ?? defaultRunner2;
  const sleep = opts.sleep ?? defaultSleep;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const claudefastBin = opts.claudefastBin ?? "claudefast";
  const codexfastgBin = opts.codexfastgBin ?? "codexfastg";
  const lines = [];
  const createCommand = buildCreateCommand(opts);
  const initialViewCommand = buildViewCommand(opts.prNumber, opts);
  const reviewViewCommand = buildViewCommand(opts.prNumber, opts);
  if (opts.dryRun) {
    lines.push("\u{1F50D} TeamAgent PR Cycle (dry-run)");
    lines.push("");
    if (!opts.prNumber && !opts.noCreate) {
      lines.push(`  \u5C06\u521B\u5EFA PR: ${createCommand}`);
      lines.push(`  \u5C06\u5B9A\u4F4D PR: ${initialViewCommand}`);
    } else {
      lines.push(`  \u5C06\u4F7F\u7528\u73B0\u6709 PR: ${initialViewCommand}`);
    }
    lines.push(`  \u5C06\u7B49\u5F85: ${waitMs}ms`);
    lines.push(`  \u5C06\u68C0\u67E5 review: ${reviewViewCommand}`);
    lines.push("");
    lines.push("  \u82E5\u53D1\u73B0\u9700\u8981\u5904\u7406\u7684 review\uFF0C\u5C06\u963B\u585E\u76F4\u63A5\u4FEE\u590D\uFF0C\u5E76\u8981\u6C42\u5148\u66F4\u65B0\u6587\u6863/\u89C4\u5219\uFF1A");
    lines.push("  \u9A8C\u8BC1\u89C4\u5219\u7B54\u6848\uFF08\u4E8C\u9009\u4E00\uFF0C\u76F4\u5230\u7B54\u6848\u6B63\u786E\uFF09\uFF1A");
    lines.push(`    !${claudefastBin} -p "{pr_index} \u6839\u636E\u89C4\u5219\uFF0C\u6211\u4EEC\u5E94\u8BE5\u600E\u4E48\u89E3\u51B3\u8FD9\u4E2Areview\u51FA\u6765\u7684\u95EE\u9898\uFF1F"`);
    lines.push(`    !${codexfastgBin} -p "{pr_index} \u6839\u636E\u89C4\u5219\uFF0C\u6211\u4EEC\u5E94\u8BE5\u600E\u4E48\u89E3\u51B3\u8FD9\u4E2Areview\u51FA\u6765\u7684\u95EE\u9898\uFF1F"`);
    return { output: lines.join("\n") + "\n", blocked: false };
  }
  const simpleRunner = (cmd) => runner(cmd, { cwd });
  if (!await isGhAvailable(simpleRunner)) {
    return {
      output: "\u2717 gh CLI \u672A\u5B89\u88C5\u6216\u4E0D\u53EF\u7528\u3002pr-cycle \u9700\u8981 gh \u6765\u521B\u5EFA\u548C\u8BFB\u53D6 PR\u3002\n",
      blocked: true
    };
  }
  try {
    if (!opts.prNumber && !opts.noCreate) {
      lines.push(`\u{1F680} \u521B\u5EFA PR: ${createCommand}`);
      const createOut = await runner(createCommand, { cwd });
      const url = extractFirstUrl(createOut);
      if (url) lines.push(`  PR URL: ${url}`);
    }
    const initialView = parsePrView(await runner(initialViewCommand, { cwd }));
    const prNumber = opts.prNumber ?? initialView.number;
    const prUrl = initialView.url;
    if (!prNumber) {
      return {
        output: lines.concat([
          "\u2717 \u65E0\u6CD5\u5B9A\u4F4D PR number\u3002\u8BF7\u786E\u8BA4\u5F53\u524D\u5206\u652F\u5DF2\u6709 PR\uFF0C\u6216\u4F20 --pr <number>\u3002"
        ]).join("\n") + "\n",
        blocked: true
      };
    }
    lines.push(`\u2705 PR \u5DF2\u5B9A\u4F4D: #${prNumber}${prUrl ? ` ${prUrl}` : ""}`);
    lines.push(`\u23F1 \u7B49\u5F85 ${waitMs}ms \u540E\u68C0\u67E5 review`);
    await sleep(waitMs);
    const reviewView = parsePrView(await runner(buildViewCommand(prNumber, opts), { cwd }));
    const reviewInputs = parseGhPrReviews(JSON.stringify({ reviews: reviewView.reviews ?? [] }));
    if (reviewInputs.length === 0) {
      lines.push("\u2705 Review \u68C0\u67E5\u5B8C\u6210\uFF1A\u6CA1\u6709\u9700\u8981\u5148\u5199\u89C4\u5219\u7684 review\u3002");
      return { output: lines.join("\n") + "\n", blocked: false };
    }
    lines.push(`\u26D4 Review \u68C0\u67E5\u53D1\u73B0 ${reviewInputs.length} \u6761\u9700\u8981\u5904\u7406\u7684\u53CD\u9988\u3002`);
    lines.push("");
    reviewInputs.slice(0, 5).forEach((input, idx) => {
      lines.push(`  ${idx + 1}. ${input.context.replace(/\s+/g, " ").slice(0, 220)}`);
    });
    if (reviewInputs.length > 5) {
      lines.push(`  ... (${reviewInputs.length - 5} more)`);
    }
    lines.push("");
    lines.push("Gate: \u5148\u66F4\u65B0\u9879\u76EE\u6587\u6863/\u89C4\u5219\uFF0C\u5199\u6E05\u4EE5\u540E\u9047\u5230\u8FD9\u7C7B review \u5E94\u5982\u4F55\u56DE\u7B54\u548C\u5904\u7406\u3002");
    lines.push("\u6B63\u786E\u524D\u4E0D\u8981\u76F4\u63A5\u6539\u4EE3\u7801\u5904\u7406 review\uFF1B\u8BA9\u89C4\u5219\u5148\u88AB Claude Code \u8BFB\u5230\u3002");
    lines.push("");
    lines.push("\u5728 Claude Code \u4EA4\u4E92\u754C\u9762\u8FD0\u884C\u5E76\u53CD\u590D\u6821\u51C6\uFF0C\u76F4\u5230\u56DE\u7B54\u6B63\u786E\uFF08\u4E8C\u9009\u4E00\uFF09\uFF1A");
    lines.push(`  !${claudefastBin} -p "${prNumber} \u6839\u636E\u89C4\u5219\uFF0C\u6211\u4EEC\u5E94\u8BE5\u600E\u4E48\u89E3\u51B3\u8FD9\u4E2Areview\u51FA\u6765\u7684\u95EE\u9898\uFF1F"`);
    lines.push(`  !${codexfastgBin} -p "${prNumber} \u6839\u636E\u89C4\u5219\uFF0C\u6211\u4EEC\u5E94\u8BE5\u600E\u4E48\u89E3\u51B3\u8FD9\u4E2Areview\u51FA\u6765\u7684\u95EE\u9898\uFF1F"`);
    lines.push("");
    lines.push("\u56DE\u7B54\u6B63\u786E\u540E\uFF0C\u518D\u5904\u7406 review\uFF0C\u5E76\u53EF\u6444\u5165 review \u5F62\u6210\u5019\u9009\u89C4\u5219\uFF1A");
    lines.push(`  teamagent ingest --from-pr ${prNumber} --dry-run`);
    return { output: lines.join("\n") + "\n", blocked: true };
  } catch (err) {
    lines.push(`\u2717 pr-cycle \u5931\u8D25: ${err instanceof Error ? err.message : String(err)}`);
    return { output: lines.join("\n") + "\n", blocked: true };
  }
}
function parsePrCycleArgs(argv) {
  const opts = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pr" && argv[i + 1]) {
      opts.prNumber = parsePositiveInt(argv[++i], "--pr");
    } else if (a.startsWith("--pr=")) {
      opts.prNumber = parsePositiveInt(a.slice("--pr=".length), "--pr");
    } else if (a === "--no-create") {
      opts.noCreate = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--draft") {
      throw new Error("TeamBrain PRs must be normal PRs; --draft is not supported.");
    } else if (a === "--wait-ms" && argv[i + 1]) {
      opts.waitMs = parseNonNegativeInt(argv[++i], "--wait-ms");
    } else if (a.startsWith("--wait-ms=")) {
      opts.waitMs = parseNonNegativeInt(a.slice("--wait-ms=".length), "--wait-ms");
    } else if (a === "--wait-seconds" && argv[i + 1]) {
      opts.waitMs = parseNonNegativeInt(argv[++i], "--wait-seconds") * 1e3;
    } else if (a.startsWith("--wait-seconds=")) {
      opts.waitMs = parseNonNegativeInt(a.slice("--wait-seconds=".length), "--wait-seconds") * 1e3;
    } else if (a === "--title" && argv[i + 1]) {
      opts.title = argv[++i];
    } else if (a.startsWith("--title=")) {
      opts.title = a.slice("--title=".length);
    } else if (a === "--body" && argv[i + 1]) {
      opts.body = argv[++i];
    } else if (a.startsWith("--body=")) {
      opts.body = a.slice("--body=".length);
    } else if (a === "--body-file" && argv[i + 1]) {
      opts.bodyFile = argv[++i];
    } else if (a.startsWith("--body-file=")) {
      opts.bodyFile = a.slice("--body-file=".length);
    } else if (a === "--base" && argv[i + 1]) {
      opts.base = argv[++i];
    } else if (a.startsWith("--base=")) {
      opts.base = a.slice("--base=".length);
    } else if (a === "--head" && argv[i + 1]) {
      opts.head = argv[++i];
    } else if (a.startsWith("--head=")) {
      opts.head = a.slice("--head=".length);
    } else if (a === "--repo" && argv[i + 1]) {
      opts.repo = argv[++i];
    } else if (a.startsWith("--repo=")) {
      opts.repo = a.slice("--repo=".length);
    } else if (a === "--claudefast-bin" && argv[i + 1]) {
      opts.claudefastBin = argv[++i];
    } else if (a.startsWith("--claudefast-bin=")) {
      opts.claudefastBin = a.slice("--claudefast-bin=".length);
    } else if (a === "--codexfastg-bin" && argv[i + 1]) {
      opts.codexfastgBin = argv[++i];
    } else if (a.startsWith("--codexfastg-bin=")) {
      opts.codexfastgBin = a.slice("--codexfastg-bin=".length);
    }
  }
  return { ...opts, dryRun: opts.dryRun ?? false, pr: opts.prNumber };
}
function buildCreateCommand(opts) {
  const parts = ["gh", "pr", "create"];
  if (opts.repo) parts.push("--repo", opts.repo);
  if (opts.base) parts.push("--base", opts.base);
  if (opts.head) parts.push("--head", opts.head);
  if (opts.title) parts.push("--title", opts.title);
  if (opts.body) parts.push("--body", opts.body);
  if (opts.bodyFile) parts.push("--body-file", opts.bodyFile);
  if (!opts.title && !opts.body && !opts.bodyFile) parts.push("--fill");
  return shellJoin(parts);
}
function buildViewCommand(prNumber, opts) {
  const parts = ["gh", "pr", "view"];
  if (prNumber !== void 0) parts.push(String(prNumber));
  if (opts.repo) parts.push("--repo", opts.repo);
  parts.push("--json", "number,url,reviews");
  return shellJoin(parts);
}
function parsePrView(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function extractFirstUrl(raw) {
  return raw.match(/https?:\/\/\S+/)?.[0] ?? null;
}
function parsePositiveInt(raw, flag) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} \u5FC5\u987B\u662F\u6B63\u6574\u6570\uFF0C\u6536\u5230: "${raw}"`);
  }
  return n;
}
function parseNonNegativeInt(raw, flag) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${flag} \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570\uFF0C\u6536\u5230: "${raw}"`);
  }
  return n;
}
function shellJoin(parts) {
  return parts.map(shellQuote).join(" ");
}
function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@+,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
async function defaultRunner2(cmd, opts = {}) {
  return execSync7(cmd, {
    cwd: opts.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
}
function defaultSleep(ms) {
  return new Promise((resolve5) => setTimeout(resolve5, ms));
}

// ../cli/src/commands/pair.ts
init_esm_shims();
import fs27 from "fs";
import os21 from "os";
import path29 from "path";
import crypto from "crypto";
import { spawnSync as spawnSync2 } from "child_process";
function executePairCapsule(opts) {
  if (!opts.name.trim()) throw new Error("--name is required");
  if (!opts.host.trim()) throw new Error("--host is required");
  const homeDir = opts.homeDir ?? os21.homedir();
  const user = opts.user ?? os21.userInfo().username;
  const port = opts.port ?? 22;
  const createdAt = opts.now?.() ?? (/* @__PURE__ */ new Date()).toISOString();
  const ttlMinutes = opts.ttlMinutes ?? 30;
  const expiresAt = new Date(Date.parse(createdAt) + ttlMinutes * 6e4).toISOString();
  const nonce = opts.nonce ?? crypto.randomBytes(16).toString("hex");
  const publicKey = opts.publicKey ?? readDefaultPublicKey(homeDir, opts.publicKeyPath);
  const publicKeyFingerprint = fingerprintPublicKey(publicKey);
  const hostAlias = `teamagent-${slugify(opts.name)}`;
  const id = `tap_${sha256Hex([
    opts.name,
    opts.host,
    user,
    String(port),
    publicKeyFingerprint,
    nonce
  ].join("|")).slice(0, 16)}`;
  const capsule = {
    version: 1,
    kind: "teamagent.pair.capsule",
    peer: {
      id,
      name: opts.name,
      hostAlias,
      host: opts.host,
      user,
      port,
      publicKeyFingerprint
    },
    createdAt,
    expiresAt,
    nonce
  };
  const token = `tap1.${base64UrlEncode(JSON.stringify(capsule))}`;
  if (opts.out) {
    fs27.mkdirSync(path29.dirname(opts.out), { recursive: true });
    fs27.writeFileSync(opts.out, JSON.stringify({ capsule, token }, null, 2) + "\n");
  }
  return { capsule, token, ...opts.out ? { outPath: opts.out } : {} };
}
function executePairAccept(opts) {
  const homeDir = opts.homeDir ?? os21.homedir();
  const sshConfigPath = opts.sshConfigPath ?? path29.join(homeDir, ".ssh", "config");
  const now = opts.now?.() ?? (/* @__PURE__ */ new Date()).toISOString();
  const capsule = decodeCapsule(opts.capsule);
  ensureCapsuleFresh(capsule, now);
  const peer = {
    ...capsule.peer,
    acceptedAt: now,
    capsuleNonce: capsule.nonce,
    source: "capsule"
  };
  const pairDir = path29.join(homeDir, ".teamagent", "pairing");
  const receiptDir = path29.join(pairDir, "receipts");
  const peerBookPath = path29.join(pairDir, "peers.json");
  const receiptPath = path29.join(receiptDir, `${slugify(peer.name)}.json`);
  const changed = [];
  const currentBook = readPeerBook(peerBookPath);
  const nextBook = upsertPeer(currentBook, peer);
  const nextBookText = JSON.stringify(nextBook, null, 2) + "\n";
  const oldBookText = fs27.existsSync(peerBookPath) ? fs27.readFileSync(peerBookPath, "utf-8") : "";
  if (oldBookText !== nextBookText) changed.push(peerBookPath);
  const receipt = {
    version: 1,
    kind: "teamagent.pair.receipt",
    localName: opts.localName ?? os21.hostname(),
    acceptedAt: now,
    peer
  };
  const nextReceiptText = JSON.stringify(receipt, null, 2) + "\n";
  const oldReceiptText = fs27.existsSync(receiptPath) ? fs27.readFileSync(receiptPath, "utf-8") : "";
  if (oldReceiptText !== nextReceiptText) changed.push(receiptPath);
  const nextSshConfig = renderManagedSshConfig(
    fs27.existsSync(sshConfigPath) ? fs27.readFileSync(sshConfigPath, "utf-8") : "",
    peer
  );
  const oldSshConfig = fs27.existsSync(sshConfigPath) ? fs27.readFileSync(sshConfigPath, "utf-8") : "";
  if (oldSshConfig !== nextSshConfig) changed.push(sshConfigPath);
  if (!opts.dryRun) {
    fs27.mkdirSync(pairDir, { recursive: true });
    fs27.mkdirSync(receiptDir, { recursive: true });
    fs27.mkdirSync(path29.dirname(sshConfigPath), { recursive: true });
    fs27.writeFileSync(peerBookPath, nextBookText);
    fs27.writeFileSync(receiptPath, nextReceiptText);
    fs27.writeFileSync(sshConfigPath, nextSshConfig);
  }
  return {
    ok: true,
    peer,
    files: { peerBookPath, receiptPath, sshConfigPath },
    changed,
    dryRun: opts.dryRun ?? false
  };
}
function executePairKnock(opts) {
  const homeDir = opts.homeDir ?? os21.homedir();
  const sshConfigPath = opts.sshConfigPath ?? path29.join(homeDir, ".ssh", "config");
  const peerBook = readPeerBook(path29.join(homeDir, ".teamagent", "pairing", "peers.json"));
  const peer = peerBook.peers.find((p) => p.name === opts.peer || p.id === opts.peer || p.hostAlias === opts.peer);
  if (!peer) {
    return {
      ok: false,
      peer: opts.peer,
      command: [],
      stdout: "",
      stderr: `unknown peer: ${opts.peer}`,
      exitCode: 2
    };
  }
  const expected = `teamagent-pair-ok:${peer.id}`;
  const command = ["ssh", "-F", sshConfigPath, peer.hostAlias, "printf", "%s\\\\n", expected];
  if (opts.simulate) {
    return {
      ok: true,
      peer: peer.name,
      peerId: peer.id,
      hostAlias: peer.hostAlias,
      command,
      stdout: `${expected}
`,
      stderr: "",
      exitCode: 0
    };
  }
  const runner = opts.runner ?? defaultSshRunner;
  const result = runner(command.slice(1));
  const ok = result.exitCode === 0 && result.stdout.trim() === expected;
  return {
    ok,
    peer: peer.name,
    peerId: peer.id,
    hostAlias: peer.hostAlias,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
  };
}
function executePairList(opts = {}) {
  const homeDir = opts.homeDir ?? os21.homedir();
  return readPeerBook(path29.join(homeDir, ".teamagent", "pairing", "peers.json"));
}
function renderPairCapsuleResult(result) {
  const lines = [
    `\u63E1\u624B\u80F6\u56CA\u5DF2\u751F\u6210: ${result.capsule.peer.name} (${result.capsule.peer.hostAlias})`,
    `peer id: ${result.capsule.peer.id}`,
    `fingerprint: ${result.capsule.peer.publicKeyFingerprint}`,
    `expires: ${result.capsule.expiresAt}`
  ];
  if (result.outPath) lines.push(`\u6587\u4EF6: ${result.outPath}`);
  lines.push(`token: ${result.token}`);
  return lines.join("\n") + "\n";
}
function renderPairAcceptResult(result) {
  const changed = result.changed.length === 0 ? "\u65E0\u53D8\u5316" : `${result.changed.length} \u4E2A\u6587\u4EF6\u5DF2\u66F4\u65B0`;
  return [
    `\u5DF2\u63A5\u53D7 ${result.peer.name} \u7684\u63E1\u624B\u80F6\u56CA`,
    `host: ${result.peer.hostAlias} -> ${result.peer.user}@${result.peer.host}:${result.peer.port}`,
    `fingerprint: ${result.peer.publicKeyFingerprint}`,
    changed
  ].join("\n") + "\n";
}
function renderPairKnockResult(result) {
  if (result.ok) {
    return `SSH knock \u6210\u529F: ${result.peer} (${result.hostAlias})
${result.stdout}`;
  }
  return `SSH knock \u5931\u8D25: ${result.peer}
exit=${result.exitCode}
${result.stderr}`;
}
function renderPairList(book) {
  if (book.peers.length === 0) return "\u5C1A\u672A\u914D\u5BF9\u4EFB\u4F55 teammate\n";
  return book.peers.map((p) => `${p.name}	${p.hostAlias}	${p.user}@${p.host}:${p.port}	${p.publicKeyFingerprint}`).join("\n") + "\n";
}
function parsePairArgs(argv) {
  const sub = argv[0];
  if (!sub || !["capsule", "accept", "knock", "list"].includes(sub)) {
    throw new Error("Usage: teamagent pair <capsule|accept|knock|list> ...");
  }
  const rest = argv.slice(1);
  const flags = parseFlags(rest);
  if (sub === "capsule") {
    const now = stringFlag(flags, "now");
    return {
      subcommand: sub,
      options: {
        name: stringFlag(flags, "name", true),
        host: stringFlag(flags, "host", true),
        user: stringFlag(flags, "user"),
        port: numberFlag(flags, "port"),
        publicKey: stringFlag(flags, "public-key"),
        publicKeyPath: stringFlag(flags, "public-key-path"),
        homeDir: stringFlag(flags, "home-dir"),
        out: stringFlag(flags, "out"),
        ttlMinutes: numberFlag(flags, "ttl-minutes"),
        nonce: stringFlag(flags, "nonce"),
        ...now ? { now: () => now } : {}
      }
    };
  }
  if (sub === "accept") {
    const capsule = flags.positionals[0];
    if (!capsule) throw new Error("Usage: teamagent pair accept <capsule-file|token|json>");
    const now = stringFlag(flags, "now");
    return {
      subcommand: sub,
      options: {
        capsule,
        homeDir: stringFlag(flags, "home-dir"),
        sshConfigPath: stringFlag(flags, "ssh-config"),
        localName: stringFlag(flags, "local-name"),
        dryRun: booleanFlag(flags, "dry-run"),
        ...now ? { now: () => now } : {}
      }
    };
  }
  if (sub === "knock") {
    const peer = flags.positionals[0];
    if (!peer) throw new Error("Usage: teamagent pair knock <peer>");
    return {
      subcommand: sub,
      options: {
        peer,
        homeDir: stringFlag(flags, "home-dir"),
        sshConfigPath: stringFlag(flags, "ssh-config"),
        json: booleanFlag(flags, "json"),
        simulate: booleanFlag(flags, "simulate")
      }
    };
  }
  return {
    subcommand: sub,
    options: {
      homeDir: stringFlag(flags, "home-dir"),
      json: booleanFlag(flags, "json")
    }
  };
}
function defaultSshRunner(args) {
  const proc = spawnSync2("ssh", args, { encoding: "utf-8", timeout: 1e4 });
  return {
    exitCode: proc.status ?? 124,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? (proc.error ? String(proc.error) : "")
  };
}
function readDefaultPublicKey(homeDir, explicitPath) {
  const candidates = explicitPath ? [explicitPath] : ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"].map((f) => path29.join(homeDir, ".ssh", f));
  for (const candidate of candidates) {
    if (fs27.existsSync(candidate)) {
      const text = fs27.readFileSync(candidate, "utf-8").trim();
      if (text) return text;
    }
  }
  throw new Error("No SSH public key found. Pass --public-key or --public-key-path.");
}
function fingerprintPublicKey(publicKey) {
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length >= 2 && parts[1]) {
    try {
      const digest = crypto.createHash("sha256").update(Buffer.from(parts[1], "base64")).digest("base64");
      return `SHA256:${digest.replace(/=+$/, "")}`;
    } catch {
    }
  }
  return `SHA256:${crypto.createHash("sha256").update(publicKey).digest("base64").replace(/=+$/, "")}`;
}
function decodeCapsule(input) {
  let text = input.trim();
  if (fs27.existsSync(text)) {
    text = fs27.readFileSync(text, "utf-8").trim();
  }
  if (text.startsWith("tap1.")) {
    text = Buffer.from(text.slice("tap1.".length), "base64url").toString("utf-8");
  }
  const parsed = JSON.parse(text);
  const capsule = "capsule" in parsed && parsed.capsule ? parsed.capsule : parsed;
  if (capsule.version !== 1 || capsule.kind !== "teamagent.pair.capsule") {
    throw new Error("Invalid TeamAgent pairing capsule");
  }
  return capsule;
}
function ensureCapsuleFresh(capsule, now) {
  if (Date.parse(now) > Date.parse(capsule.expiresAt)) {
    throw new Error(`Pairing capsule expired at ${capsule.expiresAt}`);
  }
}
function readPeerBook(peerBookPath) {
  if (!fs27.existsSync(peerBookPath)) return { version: 1, peers: [] };
  const parsed = JSON.parse(fs27.readFileSync(peerBookPath, "utf-8"));
  if (parsed.version !== 1 || !Array.isArray(parsed.peers)) return { version: 1, peers: [] };
  return parsed;
}
function upsertPeer(book, peer) {
  const peers = book.peers.filter((p) => p.id !== peer.id && p.name !== peer.name && p.hostAlias !== peer.hostAlias);
  peers.push(peer);
  peers.sort((a, b) => a.name.localeCompare(b.name));
  return { version: 1, peers };
}
function renderManagedSshConfig(current, peer) {
  const start = `# >>> teamagent peer:${peer.id}`;
  const end = `# <<< teamagent peer:${peer.id}`;
  const block = [
    start,
    `Host ${peer.hostAlias}`,
    `  HostName ${peer.host}`,
    `  User ${peer.user}`,
    `  Port ${peer.port}`,
    "  IdentitiesOnly yes",
    "  StrictHostKeyChecking accept-new",
    "  UserKnownHostsFile ~/.ssh/known_hosts",
    `  # TeamAgent-Peer-Fingerprint ${peer.publicKeyFingerprint}`,
    end
  ].join("\n");
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");
  const trimmed = current.endsWith("\n") || current.length === 0 ? current : `${current}
`;
  if (re.test(trimmed)) return trimmed.replace(re, `${block}
`);
  return `${trimmed}${trimmed.length > 0 && !trimmed.endsWith("\n\n") ? "\n" : ""}${block}
`;
}
function parseFlags(argv) {
  const values = /* @__PURE__ */ new Map();
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      i++;
    } else {
      values.set(key, true);
    }
  }
  return { positionals, values };
}
function stringFlag(flags, key, required) {
  const v = flags.values.get(key);
  if (v === true || v === void 0) {
    if (required) throw new Error(`--${key} is required`);
    return void 0;
  }
  return v;
}
function numberFlag(flags, key) {
  const raw = stringFlag(flags, key);
  if (raw === void 0) return void 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${key} must be a positive number`);
  return n;
}
function booleanFlag(flags, key) {
  return flags.values.get(key) === true;
}
function slugify(input) {
  const slug = input.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "peer";
}
function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function base64UrlEncode(input) {
  return Buffer.from(input, "utf-8").toString("base64url");
}
function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ../cli/src/commands/recording.ts
init_esm_shims();
import fs28 from "fs";
import os22 from "os";
import path30 from "path";
import { createHash as createHash3 } from "crypto";
var DEFAULT_MAX_INJECTION_TOKENS = 800;
var SLOW_THRESHOLD_MS = 300;
var GOLDEN_MATERIALS = [
  {
    title: "Recording Memory import design review",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md",
    transcript: "Alice: Recording Memory should turn existing meeting transcripts and summaries into agent-loadable memory. Bob: Import must preserve source references. Chen: Do not inject the full transcript by default; cite the source and include a short summary unless explicitly expanded.",
    uploadedBy: "teamagent",
    useWhen: "Questions about recording-memory import, source references, concise prompt injection, and transcript expansion.",
    summary: "Recording Memory import stores transcripts, summaries, and source references. Default prompt injection cites the source and stays concise.",
    visibility: "public"
  },
  {
    title: "Recording Memory dashboard and latency review",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard",
    transcript: "Alice: We need externally visible evidence, not SelfVerify. Bob: The dashboard has to show latency numbers and counts for slow or empty queries. Chen: It should update after recording-memory activity.",
    uploadedBy: "teamagent",
    useWhen: "Questions about dashboard metrics, latency, slow retrievals, empty retrievals, failures, and oversized injections.",
    summary: "The dashboard must surface latency, slow retrievals, empty retrievals, failed retrievals, oversized injections, and latest Recording Memory activity.",
    visibility: "public"
  },
  {
    title: "Recording Memory golden prompt benchmark",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark",
    transcript: "Alice: We should use three real examples. Bob: Ten fixed prompts are enough for the first gate. Chen: Each row needs expected recording, actual recording, pass/fail, and injection token count. Dana: Full transcript should only appear with explicit expansion.",
    uploadedBy: "teamagent",
    useWhen: "Questions about golden prompt benchmark acceptance, ten prompts, three examples, pass rate, and token budget.",
    summary: "Golden benchmark uses three recording examples and ten fixed prompts. It passes at 8/10 correct retrievals with default injection under 800 tokens.",
    visibility: "public"
  }
];
var GOLDEN_PROMPTS = [
  { prompt: "What did we decide about importing recording transcripts?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "Where should recording memory cite source references?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "Should the full transcript be injected by default?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "How do we monitor slow recording-memory retrievals?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "What dashboard counts are required for recording memory?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "What evidence should show latency and empty retrievals?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "How many golden prompts are used for acceptance?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "What is the default recording memory token budget?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "What pass rate does the golden benchmark require?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "When is a full recording transcript allowed in context?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" }
];
function projectRoot(cwd) {
  return findTeamagentRoot2(cwd);
}
function projectKey(cwd) {
  return createHash3("sha256").update(path30.resolve(projectRoot(cwd))).digest("hex").slice(0, 20);
}
function legacyProjectKey(cwd) {
  return createHash3("sha256").update(path30.resolve(cwd)).digest("hex").slice(0, 20);
}
function publicStorePath(cwd) {
  return path30.join(projectRoot(cwd), ".teamagent", "recordings.json");
}
function privateStorePath(cwd, homeDir) {
  return path30.join(
    homeDir,
    ".teamagent",
    "recordings",
    `${projectKey(cwd)}.json`
  );
}
function legacyPrivateStorePath(cwd, homeDir) {
  return path30.join(
    homeDir,
    ".teamagent",
    "recordings",
    `${legacyProjectKey(cwd)}.json`
  );
}
function metricsPath(cwd) {
  return path30.join(projectRoot(cwd), ".teamagent", "recording-memory", "metrics.jsonl");
}
function readJsonl(filePath) {
  try {
    return fs28.readFileSync(filePath, "utf-8").split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function appendJsonl(filePath, item) {
  fs28.mkdirSync(path30.dirname(filePath), { recursive: true });
  fs28.appendFileSync(filePath, JSON.stringify(item) + "\n", "utf-8");
}
function estimateRecordingTokens(text) {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
function appendMetric(cwd, now, metric) {
  const full = {
    ...metric,
    id: `rm-${now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now().toISOString(),
    slow: metric.latencyMs > SLOW_THRESHOLD_MS,
    empty: metric.status === "empty",
    failed: metric.status === "failed",
    oversized: (metric.injectionTokens ?? 0) > DEFAULT_MAX_INJECTION_TOKENS
  };
  appendJsonl(metricsPath(cwd), full);
  return full;
}
function loadRecordingMetrics(cwd) {
  return readJsonl(metricsPath(cwd));
}
function summarizeRecordingMetrics(metrics) {
  const latencies = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const percentile = (p) => {
    if (latencies.length === 0) return 0;
    return latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] ?? 0;
  };
  return {
    total: metrics.length,
    imports: metrics.filter((m) => m.operation === "import").length,
    searches: metrics.filter((m) => m.operation === "search").length,
    injections: metrics.filter((m) => m.operation === "inject").length,
    benchmarks: metrics.filter((m) => m.operation === "benchmark").length,
    slow: metrics.filter((m) => m.slow).length,
    empty: metrics.filter((m) => m.empty).length,
    failed: metrics.filter((m) => m.failed).length,
    oversized: metrics.filter((m) => m.oversized).length,
    p50LatencyMs: percentile(0.5),
    p95LatencyMs: percentile(0.95),
    latest: metrics.slice(-5).reverse()
  };
}
function readStore(filePath) {
  try {
    const raw = fs28.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeStore(filePath, records) {
  fs28.mkdirSync(path30.dirname(filePath), { recursive: true });
  fs28.writeFileSync(filePath, JSON.stringify(records, null, 2) + "\n", "utf-8");
}
function loadPrivateStoreWithMigration(cwd, homeDir) {
  const newPath = privateStorePath(cwd, homeDir);
  if (fs28.existsSync(newPath)) return readStore(newPath);
  const legacyPath = legacyPrivateStorePath(cwd, homeDir);
  if (legacyPath !== newPath && fs28.existsSync(legacyPath)) {
    const records = readStore(legacyPath);
    if (records.length > 0) writeStore(newPath, records);
    return records;
  }
  return [];
}
function stringField(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}
function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeVisibility(value) {
  if (value === "public") return "public";
  if (value === void 0 || value === null || value === "private") return "private";
  throw new Error("visibility must be private or public");
}
function materialToRecord(input, opts) {
  const now = opts.now().toISOString();
  const source = stringField(
    input.source ?? input.sourceUrl ?? input.sourcePath,
    "source"
  );
  return {
    id: opts.idGen(),
    title: stringField(input.title, "title"),
    source,
    transcript: stringField(input.transcript, "transcript"),
    uploadedBy: stringField(input.uploadedBy ?? input.uploader, "uploadedBy"),
    useWhen: stringField(input.useWhen ?? input.usage, "useWhen"),
    summary: optionalString(input.summary) ?? stringField(input.transcript, "transcript").slice(0, 240),
    visibility: normalizeVisibility(input.visibility),
    createdAt: now,
    updatedAt: now
  };
}
function sanitizeRecord(record, expandTranscript = false) {
  const { transcript, ...rest } = record;
  return expandTranscript ? { ...rest, transcript } : rest;
}
function loadVisibleRecords(cwd, homeDir, visibility = "all") {
  const records = [];
  if (visibility === "all" || visibility === "public") {
    records.push(...readStore(publicStorePath(cwd)).filter((r) => r.visibility === "public"));
  }
  if (visibility === "all" || visibility === "private") {
    records.push(...loadPrivateStoreWithMigration(cwd, homeDir).filter((r) => r.visibility === "private"));
  }
  return records;
}
function tokenize(text) {
  return [...text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]).filter((t) => t.length > 1);
}
function scoreRecord(query, record) {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return { score: 0, why: "" };
  const fields = [
    ["title", 4, "title"],
    ["summary", 4, "summary"],
    ["useWhen", 3, "useWhen"],
    ["transcript", 1, "transcript"],
    ["uploadedBy", 1, "uploadedBy"]
  ];
  let score = 0;
  const matchedFields = /* @__PURE__ */ new Set();
  for (const term of terms) {
    for (const [field, weight, label] of fields) {
      const value = String(record[field] ?? "").toLowerCase();
      if (value.includes(term)) {
        score += weight;
        matchedFields.add(label);
      }
    }
  }
  const coverage = matchedFields.size > 0 ? terms.length / Math.max(terms.length, 1) : 0;
  return {
    score: score + coverage,
    why: matchedFields.size > 0 ? `matched ${[...matchedFields].join(", ")}` : ""
  };
}
function searchRecords(query, records, limit, expandTranscript = false) {
  return records.map((record) => {
    const scored = scoreRecord(query, record);
    return {
      record: sanitizeRecord(record, expandTranscript),
      score: scored.score,
      whyRelevant: scored.why
    };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.record.createdAt.localeCompare(b.record.createdAt)).slice(0, limit);
}
function parseRecordingArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { action: "help" };
  }
  const [actionRaw, ...rest] = argv;
  if (actionRaw !== "import" && actionRaw !== "search" && actionRaw !== "show" && actionRaw !== "inject" && actionRaw !== "metrics" && actionRaw !== "benchmark") {
    throw new Error("recording action must be import, search, show, inject, metrics, benchmark, or --help");
  }
  const opts = { action: actionRaw };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--file" && rest[i + 1]) opts.filePath = rest[++i];
    else if (a === "--query" && rest[i + 1]) opts.query = rest[++i];
    else if (a === "--id" && rest[i + 1]) opts.id = rest[++i];
    else if (a === "--transcript") opts.expandTranscript = true;
    else if (a === "--full") opts.expandTranscript = true;
    else if (a === "--json") opts.json = true;
    else if (a.startsWith("--report=")) opts.reportPath = a.slice("--report=".length);
    else if (a.startsWith("--visibility=")) {
      const raw = a.slice("--visibility=".length);
      if (raw !== "all" && raw !== "private" && raw !== "public") {
        throw new Error("--visibility must be all, private, or public");
      }
      opts.visibility = raw;
    } else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (!Number.isInteger(n) || n <= 0) throw new Error("--limit must be a positive integer");
      opts.limit = n;
    } else if (opts.action === "show" && !opts.id && !a.startsWith("--")) {
      opts.id = a;
    } else if ((opts.action === "inject" || opts.action === "search") && !opts.query && !a.startsWith("--")) {
      opts.query = a;
    }
  }
  if (opts.action === "import" && !opts.filePath) {
    throw new Error("recording import requires --file <path>");
  }
  if (opts.action === "import" && opts.filePath && /\.(ogg|opus|wav|mp3|m4a|flac|webm|aac)$/i.test(opts.filePath)) {
    throw new Error(
      `recording import expects a transcript JSON file, got an audio file (${opts.filePath}). 'teamagent recording' is the Recording Memory subsystem (transcript-first); audio files are not supported in this command.`
    );
  }
  if (opts.action === "search" && !opts.query) {
    throw new Error("recording search requires --query <text>");
  }
  if (opts.action === "inject" && !opts.query) {
    throw new Error("recording inject requires --query <text> or a query argument");
  }
  if (opts.action === "show" && !opts.id) {
    throw new Error("recording show requires <id> or --id <id>");
  }
  return opts;
}
async function executeRecording(opts) {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os22.homedir();
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const idGen = opts.idGen ?? (() => `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  if (opts.action === "help") {
    return {
      kind: "help",
      command: "teamagent recording",
      subcommands: [
        {
          name: "import",
          usage: "teamagent recording import --file <material.json>",
          output: "imports transcript JSON (audio files are not supported)"
        },
        {
          name: "search",
          usage: "teamagent recording search --query <text> [--visibility=all|private|public]",
          output: "returns source-backed recording memory hits without full transcript"
        },
        {
          name: "show",
          usage: "teamagent recording show <id> [--transcript]",
          output: "shows metadata by default; --transcript expands full transcript"
        },
        {
          name: "inject",
          usage: "teamagent recording inject --query <text> [--full]",
          output: "returns source-cited prompt context without full transcript by default"
        },
        {
          name: "metrics",
          usage: "teamagent recording metrics [--json]",
          output: "summarizes import/search/injection latency and retrieval health"
        },
        {
          name: "benchmark",
          usage: "teamagent recording benchmark [--report=<path>] [--json]",
          output: "runs 3-recording/10-prompt golden retrieval benchmark"
        }
      ]
    };
  }
  if (opts.action === "import") {
    const started = Date.now();
    const raw = fs28.readFileSync(opts.filePath, "utf-8");
    const record2 = materialToRecord(JSON.parse(raw), {
      now,
      idGen
    });
    const storePath = record2.visibility === "public" ? publicStorePath(cwd) : privateStorePath(cwd, homeDir);
    const records2 = record2.visibility === "private" ? loadPrivateStoreWithMigration(cwd, homeDir) : readStore(storePath);
    const duplicate = records2.find((r) => r.source === record2.source);
    if (duplicate) {
      appendMetric(cwd, now, {
        operation: "import",
        status: "ok",
        latencyMs: Date.now() - started,
        recordingId: duplicate.id,
        sourceReference: duplicate.source,
        fullTranscriptIncluded: false
      });
      return {
        kind: "import",
        status: "duplicate",
        record: sanitizeRecord(duplicate),
        storage: duplicate.visibility
      };
    }
    records2.push(record2);
    writeStore(storePath, records2);
    appendMetric(cwd, now, {
      operation: "import",
      status: "ok",
      latencyMs: Date.now() - started,
      recordingId: record2.id,
      sourceReference: record2.source,
      fullTranscriptIncluded: false
    });
    return {
      kind: "import",
      status: "created",
      record: sanitizeRecord(record2),
      storage: record2.visibility
    };
  }
  if (opts.action === "search") {
    const started = Date.now();
    const records2 = loadVisibleRecords(cwd, homeDir, opts.visibility ?? "all");
    const results = searchRecords(opts.query, records2, opts.limit ?? 5);
    appendMetric(cwd, now, {
      operation: "search",
      status: results.length > 0 ? "ok" : "empty",
      latencyMs: Date.now() - started,
      query: opts.query,
      recordingId: results[0]?.record.id,
      score: results[0]?.score,
      sourceReference: results[0]?.record.source,
      fullTranscriptIncluded: false
    });
    return {
      kind: "search",
      query: opts.query,
      results
    };
  }
  if (opts.action === "inject") {
    const started = Date.now();
    const records2 = loadVisibleRecords(cwd, homeDir, opts.visibility ?? "all");
    const results = searchRecords(opts.query, records2, opts.limit ?? 3, Boolean(opts.expandTranscript));
    const text = formatRecordingMemoryInjection(results, opts.expandTranscript);
    const tokenCount = estimateRecordingTokens(text);
    appendMetric(cwd, now, {
      operation: "inject",
      status: results.length > 0 ? "ok" : "empty",
      latencyMs: Date.now() - started,
      query: opts.query,
      recordingId: results[0]?.record.id,
      score: results[0]?.score,
      sourceReference: results[0]?.record.source,
      injectionTokens: tokenCount,
      fullTranscriptIncluded: Boolean(opts.expandTranscript)
    });
    return {
      kind: "inject",
      text,
      match: results[0],
      tokenCount,
      fullTranscriptIncluded: Boolean(opts.expandTranscript)
    };
  }
  if (opts.action === "metrics") {
    return {
      kind: "metrics",
      summary: summarizeRecordingMetrics(loadRecordingMetrics(cwd))
    };
  }
  if (opts.action === "benchmark") {
    return await runRecordingBenchmark({ cwd, homeDir, now, reportPath: opts.reportPath });
  }
  const records = loadVisibleRecords(cwd, homeDir, "all");
  const record = records.find((r) => r.id === opts.id);
  return {
    kind: "show",
    record: record ? sanitizeRecord(record, opts.expandTranscript) : void 0
  };
}
function formatRecordingMemoryInjection(matches, includeTranscript = false) {
  if (matches.length === 0) return "";
  const lines = ["\u25C8 TeamAgent Recording Memory \u76F8\u5173\u5F55\u97F3"];
  for (const match of matches) {
    const r = match.record;
    lines.push(
      `- ${r.title} (${r.visibility})`,
      `  \u6458\u8981: ${r.summary.slice(0, 220)}`,
      `  \u6765\u6E90: ${r.source}`,
      `  \u4E0A\u4F20\u4EBA: ${r.uploadedBy}`,
      `  \u9002\u7528\u573A\u666F: ${r.useWhen.slice(0, 180)}`,
      `  \u4E3A\u4EC0\u4E48\u76F8\u5173: ${match.whyRelevant}`,
      includeTranscript && r.transcript ? `  Transcript: ${r.transcript}` : `  \u5C55\u5F00: teamagent recording show ${r.id} --transcript`
    );
  }
  const text = lines.join("\n");
  if (includeTranscript || estimateRecordingTokens(text) <= DEFAULT_MAX_INJECTION_TOKENS) {
    return text;
  }
  return `${text.slice(0, DEFAULT_MAX_INJECTION_TOKENS * 4 - 64).trimEnd()}
[trimmed to ${DEFAULT_MAX_INJECTION_TOKENS} token budget]`;
}
function renderRecordingResult(result) {
  return JSON.stringify(result, null, 2) + "\n";
}
function renderBenchmarkReport(result) {
  const lines = [
    "# Recording Memory Golden Prompt Benchmark",
    "",
    "## Recording Examples",
    "",
    ...GOLDEN_MATERIALS.map((m) => `- ${String(m.title)} (${String(m.source)})`),
    "",
    "## Results",
    "",
    "| # | Prompt | Expected Recording | Actual Recording | Pass | Injection Tokens |",
    "|---|---|---|---|---|---|",
    ...result.rows.map(
      (row, i) => `| ${i + 1} | ${row.prompt.replace(/\|/g, "\\|")} | ${row.expectedId} | ${row.actualId || "(empty)"} | ${row.pass ? "PASS" : "FAIL"} | ${row.injectionTokens} |`
    ),
    "",
    `Pass rate: ${result.passCount}/${result.total}`,
    `Acceptance: ${result.ok ? "PASS" : "FAIL"}`,
    `Default injection budget: ${DEFAULT_MAX_INJECTION_TOKENS} tokens`,
    "Full transcript appears only after explicit expansion with `teamagent recording show <id> --transcript` or `teamagent recording inject --full`.",
    ""
  ];
  return lines.join("\n");
}
async function runRecordingBenchmark(args) {
  const started = Date.now();
  const tmpRoot = fs28.mkdtempSync(path30.join(os22.tmpdir(), "teamagent-recording-bench-"));
  const tmpHome = fs28.mkdtempSync(path30.join(os22.tmpdir(), "teamagent-recording-home-"));
  const idsBySource = /* @__PURE__ */ new Map();
  for (const [index, material] of GOLDEN_MATERIALS.entries()) {
    const filePath = path30.join(tmpRoot, `recording-${index}.json`);
    fs28.writeFileSync(filePath, JSON.stringify(material, null, 2), "utf-8");
    const imported = await executeRecording({
      action: "import",
      filePath,
      cwd: tmpRoot,
      homeDir: tmpHome,
      now: args.now,
      idGen: () => `golden-${index + 1}`
    });
    if (imported.kind === "import") idsBySource.set(imported.record.source, imported.record.id);
  }
  const evaluatedRows = [];
  for (const item of GOLDEN_PROMPTS) {
    const expectedId = idsBySource.get(item.expectedSource) ?? "";
    const injected = await executeRecording({
      action: "inject",
      query: item.prompt,
      cwd: tmpRoot,
      homeDir: tmpHome,
      now: args.now
    });
    const actualId = injected.kind === "inject" ? injected.match?.record.id ?? "" : "";
    const injectionTokens = injected.kind === "inject" ? injected.tokenCount : 0;
    evaluatedRows.push({
      prompt: item.prompt,
      expectedId,
      actualId,
      pass: actualId === expectedId && injectionTokens <= DEFAULT_MAX_INJECTION_TOKENS,
      injectionTokens
    });
  }
  const passCount = evaluatedRows.filter((r) => r.pass).length;
  const result = {
    kind: "benchmark",
    ok: passCount >= 8,
    passCount,
    total: evaluatedRows.length,
    reportPath: args.reportPath ?? path30.join(args.cwd, "docs", "verification", "recording-memory-golden-benchmark.md"),
    rows: evaluatedRows
  };
  fs28.mkdirSync(path30.dirname(result.reportPath), { recursive: true });
  fs28.writeFileSync(result.reportPath, renderBenchmarkReport(result), "utf-8");
  appendMetric(args.cwd, args.now, {
    operation: "benchmark",
    status: result.ok ? "ok" : "failed",
    latencyMs: Date.now() - started,
    injectionTokens: Math.max(...evaluatedRows.map((r) => r.injectionTokens)),
    fullTranscriptIncluded: false,
    error: result.ok ? void 0 : `passCount=${passCount}`
  });
  return result;
}

// ../cli/src/commands/fixture-replay.ts
init_esm_shims();
var FixtureReplayArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "FixtureReplayArgError";
  }
};
function parseFixtureReplayArgs(argv) {
  const subcommand = argv[0];
  if (subcommand !== "replay") {
    throw new FixtureReplayArgError(
      "fixture: expected subcommand 'replay'. Usage: teamagent fixture replay --tier=a [--scenario <id>] [--json]"
    );
  }
  const opts = { subcommand: "replay", tier: "a" };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tier") {
      opts.tier = parseTier(readValue(argv, ++i, "--tier"));
    } else if (a.startsWith("--tier=")) {
      opts.tier = parseTier(a.slice("--tier=".length));
    } else if (a === "--scenario" || a === "--slug") {
      opts.scenarioId = readValue(argv, ++i, a);
    } else if (a.startsWith("--scenario=")) {
      opts.scenarioId = readInlineValue(a, "--scenario");
    } else if (a.startsWith("--slug=")) {
      opts.scenarioId = readInlineValue(a, "--slug");
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--help" || a === "-h") {
      throw new FixtureReplayArgError(renderFixtureReplayHelp());
    } else if (a.startsWith("--")) {
      throw new FixtureReplayArgError(`fixture replay: unknown flag "${a}"`);
    }
  }
  return opts;
}
function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new FixtureReplayArgError(`fixture replay: ${flag} requires a value`);
  }
  return value;
}
function readInlineValue(arg, flag) {
  const value = arg.slice(`${flag}=`.length);
  if (!value) {
    throw new FixtureReplayArgError(`fixture replay: ${flag} requires a value`);
  }
  return value;
}
function parseTier(value) {
  if (value === "a") return "a";
  throw new FixtureReplayArgError(
    `fixture replay: unsupported tier "${value}". This implementation currently supports --tier=a.`
  );
}
function renderFixtureReplayHelp() {
  return [
    "Usage: teamagent fixture replay --tier=a [--scenario <id>] [--json]",
    "",
    "Replays deterministic scenario fixtures through the existing TeamAgent",
    "three-phase harness: correction detection -> rule extraction -> intercept.",
    "",
    "Options:",
    "  --tier=a          Run the deterministic offline replay tier",
    "  --scenario ID     Run one scenario only, e.g. moment-dayjs",
    "  --slug ID         Alias for --scenario, matching ADR-0010 docs",
    "  --json            Print machine-readable JSON",
    ""
  ].join("\n");
}
async function executeFixtureReplay(opts) {
  const scenarios = opts.scenarioId ? allScenarios.filter((s) => s.id === opts.scenarioId) : allScenarios;
  if (opts.scenarioId && scenarios.length === 0) {
    throw new FixtureReplayArgError(
      `fixture replay: unknown scenario "${opts.scenarioId}"`
    );
  }
  const verify = await runVerify(scenarios, {
    detector: ruleBasedCorrectionDetector,
    extractor: llmBasedKnowledgeExtractor,
    makeStore: () => new InMemoryKnowledgeStore(),
    now: () => /* @__PURE__ */ new Date("2026-05-11T00:00:00Z")
  });
  const replayScenarios = verify.scenarios.map((s) => ({
    id: s.scenarioId,
    passed: s.passed,
    prr: s.prr,
    kp: s.kp,
    phases: {
      correctionDetected: s.phaseA.passed,
      ruleGenerated: s.phaseB.passed,
      interceptMatched: s.phaseC.passed,
      expectedBehavior: s.phaseC.expectedBehavior,
      actualBehavior: s.phaseC.actualBehavior
    }
  }));
  return {
    ok: verify.passed === verify.total,
    command: "fixture replay",
    tier: opts.tier,
    total: verify.total,
    passed: verify.passed,
    scenarios: replayScenarios
  };
}
function renderFixtureReplayResult(result) {
  const lines = [];
  lines.push("TeamAgent fixture replay");
  lines.push(`tier: ${result.tier}`);
  lines.push(`passed: ${result.passed}/${result.total}`);
  lines.push("");
  for (const s of result.scenarios) {
    const mark = s.passed ? "PASS" : "FAIL";
    lines.push(
      `${mark} ${s.id} PRR=${s.prr} KP=${s.kp.toFixed(2)} expected=${s.phases.expectedBehavior} actual=${s.phases.actualBehavior}`
    );
  }
  return lines.join("\n") + "\n";
}

// ../cli/src/commands/symphony.ts
init_esm_shims();
import { spawn as spawn2 } from "child_process";
import fs29 from "fs";
import fsp from "fs/promises";
import http2 from "http";
import os23 from "os";
import path31 from "path";
var SymphonyError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "SymphonyError";
  }
  code;
};
var SymphonyArgError = class extends Error {
};
function parseSymphonyArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--once") opts.once = true;
    else if (arg === "--port") opts.port = parsePort(argv[++i], "--port");
    else if (arg.startsWith("--port=")) opts.port = parsePort(arg.slice("--port=".length), "--port");
    else if (arg === "--host") opts.host = readFlag(argv, ++i, "--host");
    else if (arg.startsWith("--host=")) opts.host = arg.slice("--host=".length);
    else if (arg.startsWith("--")) throw new SymphonyArgError(`symphony: unknown flag "${arg}"`);
    else if (!opts.workflowPath) opts.workflowPath = arg;
    else throw new SymphonyArgError(`symphony: unexpected argument "${arg}"`);
  }
  return opts;
}
function parsePort(value, flag) {
  const raw = value ?? "";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new SymphonyArgError(`symphony: ${flag} must be an integer between 0 and 65535`);
  }
  return n;
}
function readFlag(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new SymphonyArgError(`symphony: ${flag} requires a value`);
  return value;
}
function renderSymphonyHelp() {
  return [
    "Usage: teamagent symphony [path-to-WORKFLOW.md] [--once] [--port <port>] [--host 127.0.0.1]",
    "",
    "Runs the Symphony issue-orchestration service: WORKFLOW.md -> Linear issues ->",
    "per-issue workspaces -> Codex app-server agent sessions.",
    "",
    "Options:",
    "  --once            Run one poll/reconcile tick, then exit",
    "  --port PORT       Enable the optional HTTP status API/dashboard",
    "  --host HOST       Bind host for --port (default 127.0.0.1)",
    ""
  ].join("\n");
}
function selectWorkflowPath(explicitPath, cwd = process.cwd()) {
  return path31.resolve(cwd, explicitPath ?? "WORKFLOW.md");
}
async function loadWorkflow(explicitPath, cwd = process.cwd()) {
  const workflowPath = selectWorkflowPath(explicitPath, cwd);
  let stat;
  let raw;
  try {
    stat = await fsp.stat(workflowPath);
    raw = await fsp.readFile(workflowPath, "utf8");
  } catch {
    throw new SymphonyError("missing_workflow_file", `WORKFLOW.md not found: ${workflowPath}`);
  }
  if (!stat.isFile()) {
    throw new SymphonyError("missing_workflow_file", `workflow path is not a file: ${workflowPath}`);
  }
  const parsed = parseWorkflowMarkdown(raw);
  return {
    path: workflowPath,
    dir: path31.dirname(workflowPath),
    config: parsed.config,
    prompt_template: parsed.prompt_template,
    mtimeMs: stat.mtimeMs
  };
}
function parseWorkflowMarkdown(raw) {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { config: {}, prompt_template: normalized.trim() };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) throw new SymphonyError("workflow_parse_error", "workflow front matter is missing closing ---");
  const after = normalized.slice(end + 1);
  const markerEnd = after.indexOf("\n");
  const body = markerEnd >= 0 ? after.slice(markerEnd + 1) : "";
  const yamlText = normalized.slice(4, end);
  const config = parseYamlObject(yamlText);
  if (!isPlainObject(config)) {
    throw new SymphonyError("workflow_front_matter_not_a_map", "workflow front matter must decode to a map/object");
  }
  return { config, prompt_template: body.trim() };
}
function parseYamlObject(text) {
  const lines = text.replace(/\t/g, "  ").split("\n");
  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const trimmed = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new SymphonyError("workflow_parse_error", `unexpected list item: ${trimmed}`);
      parent.push(parseYamlScalar(trimmed.slice(2).trim()));
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep < 0) throw new SymphonyError("workflow_parse_error", `invalid yaml line: ${trimmed}`);
    const key = trimmed.slice(0, sep).trim();
    const rest = trimmed.slice(sep + 1).trim();
    if (!key) throw new SymphonyError("workflow_parse_error", `invalid yaml key: ${trimmed}`);
    if (!isPlainObject(parent)) throw new SymphonyError("workflow_parse_error", `cannot assign key under list: ${key}`);
    if (rest === "|" || rest === ">") {
      const blockIndent = findNextIndent(lines, i + 1, indent);
      const block = [];
      for (i = i + 1; i < lines.length; i++) {
        const nextRaw = lines[i];
        const nextIndent = nextRaw.match(/^ */)?.[0].length ?? 0;
        if (nextRaw.trim() && nextIndent < blockIndent) {
          i--;
          break;
        }
        block.push(nextRaw.slice(Math.min(blockIndent, nextRaw.length)));
      }
      parent[key] = rest === ">" ? block.join(" ").trimEnd() : block.join("\n").trimEnd();
      continue;
    }
    if (rest) {
      parent[key] = parseYamlScalar(rest);
      continue;
    }
    const next = nextMeaningfulLine(lines, i + 1);
    const child = next?.trimmed.startsWith("- ") ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child, key });
  }
  return root;
}
function findNextIndent(lines, start, fallback) {
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim()) return raw.match(/^ */)?.[0].length ?? fallback + 2;
  }
  return fallback + 2;
}
function nextMeaningfulLine(lines, start) {
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith("#")) return { trimmed };
  }
  return null;
}
function parseYamlScalar(raw) {
  if (raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitInline(inner).map((v) => parseYamlScalar(v.trim()));
  }
  if (raw.startsWith('"') && raw.endsWith('"') || raw.startsWith("'") && raw.endsWith("'")) {
    const inner = raw.slice(1, -1);
    return raw.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\n/g, "\n") : inner.replace(/''/g, "'");
  }
  return raw.replace(/\s+#.*$/, "");
}
function splitInline(inner) {
  const out = [];
  let current = "";
  let quote = null;
  for (const ch of inner) {
    if ((ch === '"' || ch === "'") && !quote) quote = ch;
    else if (ch === quote) quote = null;
    if (ch === "," && !quote) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}
function resolveSymphonyConfig(workflow, env = process.env) {
  const cfg = workflow.config;
  const tracker = getObject(cfg, "tracker");
  const polling = getObject(cfg, "polling");
  const workspace = getObject(cfg, "workspace");
  const hooks = getObject(cfg, "hooks");
  const agent = getObject(cfg, "agent");
  const codex = getObject(cfg, "codex");
  const trackerKind = getString(tracker, "kind", "");
  if (trackerKind !== "linear") {
    throw new SymphonyError("unsupported_tracker_kind", trackerKind ? `unsupported tracker.kind: ${trackerKind}` : "tracker.kind is required");
  }
  const apiKeyRaw = getString(tracker, "api_key", "$LINEAR_API_KEY");
  const apiKey = resolveEnvRef(apiKeyRaw, env);
  const projectSlug = getString(tracker, "project_slug", "");
  const codexCommand = getString(codex, "command", "codex app-server");
  const activeStates = getStringList(tracker, "active_states", ["Todo", "In Progress"]);
  const terminalStates = getStringList(tracker, "terminal_states", ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]);
  const workspaceRootRaw = getString(workspace, "root", path31.join(os23.tmpdir(), "symphony_workspaces"));
  const workspaceRoot = resolvePathValue(workspaceRootRaw, workflow.dir, env);
  return {
    workflowPath: workflow.path,
    workflowDir: workflow.dir,
    tracker: {
      kind: "linear",
      endpoint: getString(tracker, "endpoint", "https://api.linear.app/graphql"),
      apiKey,
      projectSlug,
      activeStates,
      terminalStates
    },
    polling: { intervalMs: positiveInteger(getValue(polling, "interval_ms"), 3e4, "polling.interval_ms") },
    workspace: { root: workspaceRoot },
    hooks: {
      afterCreate: nullableString(hooks, "after_create"),
      beforeRun: nullableString(hooks, "before_run"),
      afterRun: nullableString(hooks, "after_run"),
      beforeRemove: nullableString(hooks, "before_remove"),
      timeoutMs: positiveInteger(getValue(hooks, "timeout_ms"), 6e4, "hooks.timeout_ms")
    },
    agent: {
      maxConcurrentAgents: positiveInteger(getValue(agent, "max_concurrent_agents"), 10, "agent.max_concurrent_agents"),
      maxTurns: positiveInteger(getValue(agent, "max_turns"), 20, "agent.max_turns"),
      maxRetryBackoffMs: positiveInteger(getValue(agent, "max_retry_backoff_ms"), 3e5, "agent.max_retry_backoff_ms"),
      maxConcurrentAgentsByState: parseStateLimits(getObject(agent, "max_concurrent_agents_by_state"))
    },
    codex: {
      command: codexCommand,
      approvalPolicy: getValue(codex, "approval_policy") ?? null,
      threadSandbox: getValue(codex, "thread_sandbox") ?? null,
      turnSandboxPolicy: getValue(codex, "turn_sandbox_policy") ?? null,
      turnTimeoutMs: positiveInteger(getValue(codex, "turn_timeout_ms"), 36e5, "codex.turn_timeout_ms"),
      readTimeoutMs: positiveInteger(getValue(codex, "read_timeout_ms"), 5e3, "codex.read_timeout_ms"),
      stallTimeoutMs: integer(getValue(codex, "stall_timeout_ms"), 3e5, "codex.stall_timeout_ms")
    }
  };
}
function validateDispatchConfig(config) {
  if (!config.tracker.apiKey) throw new SymphonyError("missing_tracker_api_key", "tracker.api_key is required");
  if (!config.tracker.projectSlug) throw new SymphonyError("missing_tracker_project_slug", "tracker.project_slug is required");
  if (!config.codex.command.trim()) throw new SymphonyError("missing_codex_command", "codex.command is required");
}
function getObject(parent, key) {
  const value = parent[key];
  return isPlainObject(value) ? value : {};
}
function getValue(parent, key) {
  return parent[key];
}
function getString(parent, key, fallback) {
  const value = parent[key];
  return typeof value === "string" ? value : fallback;
}
function nullableString(parent, key) {
  const value = parent[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
function getStringList(parent, key, fallback) {
  const value = parent[key];
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : fallback;
}
function positiveInteger(value, fallback, field) {
  if (value === void 0 || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new SymphonyError("workflow_parse_error", `${field} must be a positive integer`);
  return n;
}
function integer(value, fallback, field) {
  if (value === void 0 || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new SymphonyError("workflow_parse_error", `${field} must be an integer`);
  return n;
}
function parseStateLimits(value) {
  const out = {};
  for (const [state, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) out[state.toLowerCase()] = n;
  }
  return out;
}
function resolveEnvRef(value, env) {
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return env[value.slice(1)] ?? "";
  return value;
}
function resolvePathValue(value, baseDir, env) {
  let resolved = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => env[name] ?? "");
  if (resolved === "~" || resolved.startsWith("~/")) {
    resolved = path31.join(os23.homedir(), resolved.slice(2));
  }
  if (!path31.isAbsolute(resolved)) resolved = path31.resolve(baseDir, resolved);
  return path31.normalize(resolved);
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function renderPrompt(template, input) {
  const base = template.trim() || "You are working on an issue from Linear.";
  return renderTemplate(base, { issue: input.issue, attempt: input.attempt ?? null }).trim();
}
function renderTemplate(template, context) {
  let rendered = template;
  const forRe = /{%\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z0-9_.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g;
  rendered = rendered.replace(forRe, (_match, local, source, body) => {
    const value = resolveTemplatePath(context, source);
    if (!Array.isArray(value)) throw new SymphonyError("template_render_error", `${source} is not iterable`);
    return value.map((item) => renderTemplate(body, { ...context, [local]: item })).join("");
  });
  if (/{%/.test(rendered)) throw new SymphonyError("template_parse_error", "unsupported template tag");
  return rendered.replace(/{{\s*([^}]+?)\s*}}/g, (_match, expr) => {
    if (expr.includes("|")) throw new SymphonyError("template_parse_error", `unknown filter in ${expr.trim()}`);
    const value = resolveTemplatePath(context, expr.trim());
    if (value === null || value === void 0) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}
function resolveTemplatePath(context, expr) {
  const parts = expr.split(".");
  let current = context;
  for (const part of parts) {
    if (!part) throw new SymphonyError("template_render_error", `invalid template path: ${expr}`);
    if (isPlainObject(current) && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      throw new SymphonyError("template_render_error", `unknown template variable: ${expr}`);
    }
  }
  return current;
}
var WorkspaceManager = class {
  constructor(config, logger = new StderrSymphonyLogger()) {
    this.config = config;
    this.logger = logger;
  }
  config;
  logger;
  workspaceForIdentifier(identifier) {
    const root = path31.resolve(this.config.workspace.root);
    const workspace_key = sanitizeWorkspaceKey(identifier);
    const workspacePath = path31.resolve(root, workspace_key);
    assertInsideRoot(root, workspacePath);
    return { path: workspacePath, workspace_key, created_now: false };
  }
  async createForIssue(identifier) {
    const info = this.workspaceForIdentifier(identifier);
    let created = false;
    try {
      const stat = await fsp.stat(info.path).catch(() => null);
      if (stat && !stat.isDirectory()) {
        throw new SymphonyError("workspace_path_not_directory", `workspace path exists but is not a directory: ${info.path}`);
      }
      if (!stat) {
        await fsp.mkdir(info.path, { recursive: true });
        created = true;
      }
      const result = { ...info, created_now: created };
      if (created) await this.runHook("after_create", this.config.hooks.afterCreate, result.path, true);
      return result;
    } catch (err) {
      throw err instanceof SymphonyError ? err : new SymphonyError("workspace_create_failed", String(err));
    }
  }
  async beforeRun(workspacePath) {
    await this.runHook("before_run", this.config.hooks.beforeRun, workspacePath, true);
  }
  async afterRun(workspacePath) {
    await this.runHook("after_run", this.config.hooks.afterRun, workspacePath, false);
  }
  async removeForIssue(identifier) {
    const info = this.workspaceForIdentifier(identifier);
    if (!fs29.existsSync(info.path)) return;
    await this.runHook("before_remove", this.config.hooks.beforeRemove, info.path, false);
    await fsp.rm(info.path, { recursive: true, force: true });
  }
  async runHook(name, script, cwd, fatal) {
    if (!script) return;
    this.logger.info("hook_start", { hook: name, cwd });
    try {
      await runShell(script, cwd, this.config.hooks.timeoutMs);
      this.logger.info("hook_completed", { hook: name, cwd });
    } catch (err) {
      this.logger.error("hook_failed", { hook: name, cwd, error: err instanceof Error ? err.message : String(err) });
      if (fatal) throw new SymphonyError("workspace_hook_failed", `${name} hook failed`);
    }
  }
};
function sanitizeWorkspaceKey(identifier) {
  const sanitized = identifier.replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized || "_";
}
function assertInsideRoot(root, candidate) {
  const rel = path31.relative(root, candidate);
  if (rel === "" || !rel.startsWith("..") && !path31.isAbsolute(rel)) return;
  throw new SymphonyError("invalid_workspace_path", `workspace path escapes root: ${candidate}`);
}
function runShell(script, cwd, timeoutMs) {
  return new Promise((resolve5, reject) => {
    const child = spawn2("sh", ["-lc", script], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`hook timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8").slice(0, 4e3);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve5();
      else reject(new Error(stderr.trim() || `hook exited with code ${code}`));
    });
  });
}
var LinearIssueTrackerClient = class {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }
  config;
  fetchImpl;
  async fetchCandidateIssues() {
    return this.paginatedIssues(CANDIDATE_QUERY, {
      projectSlug: this.config.tracker.projectSlug,
      activeStates: this.config.tracker.activeStates
    });
  }
  async fetchIssuesByStates(stateNames) {
    if (stateNames.length === 0) return [];
    return this.paginatedIssues(CANDIDATE_QUERY, {
      projectSlug: this.config.tracker.projectSlug,
      activeStates: stateNames
    });
  }
  async fetchIssueStatesByIds(issueIds) {
    if (issueIds.length === 0) return [];
    const response = await this.graphql(STATE_BY_IDS_QUERY, { ids: issueIds });
    const nodes = readIssueNodes(response);
    return nodes.map(normalizeLinearIssue);
  }
  async linearGraphql(query, variables = {}) {
    if (!query.trim()) return { success: false, error: "query must be non-empty" };
    if (countGraphqlOperations(query) !== 1) return { success: false, error: "query must contain exactly one GraphQL operation" };
    try {
      const body = await this.graphql(query, variables);
      return { success: !Array.isArray(body.errors), body };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  async paginatedIssues(query, variables) {
    const out = [];
    let after = null;
    for (; ; ) {
      const response = await this.graphql(query, { ...variables, after });
      const page = readIssueConnection(response);
      out.push(...page.nodes.map(normalizeLinearIssue));
      if (!page.hasNextPage) break;
      if (!page.endCursor) throw new SymphonyError("linear_missing_end_cursor", "Linear pagination indicated next page but omitted endCursor");
      after = page.endCursor;
    }
    return out;
  }
  async graphql(query, variables) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3e4);
    try {
      const res = await this.fetchImpl(this.config.tracker.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: this.config.tracker.apiKey
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      });
      if (!res.ok) throw new SymphonyError("linear_api_status", `Linear API returned HTTP ${res.status}`);
      const body = await res.json();
      if (Array.isArray(body.errors)) throw new SymphonyError("linear_graphql_errors", "Linear GraphQL returned errors");
      return body;
    } catch (err) {
      if (err instanceof SymphonyError) throw err;
      throw new SymphonyError("linear_api_request", err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }
};
var ISSUE_FIELDS = `
nodes {
  id
  identifier
  title
  description
  priority
  branchName
  url
  createdAt
  updatedAt
  state { name }
  labels { nodes { name } }
  inverseRelations { nodes { type issue { id identifier state { name } } } }
}
pageInfo { hasNextPage endCursor }
`;
var CANDIDATE_QUERY = `
query SymphonyCandidateIssues($projectSlug: String!, $activeStates: [String!], $after: String) {
  issues(first: 50, after: $after, filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $activeStates } } }) {
    ${ISSUE_FIELDS}
  }
}`;
var STATE_BY_IDS_QUERY = `
query SymphonyIssueStates($ids: [ID!]) {
  issues(first: 50, filter: { id: { in: $ids } }) {
    ${ISSUE_FIELDS}
  }
}`;
function readIssueConnection(body) {
  const issues = body.data?.issues;
  if (!issues || !Array.isArray(issues.nodes)) throw new SymphonyError("linear_unknown_payload", "Linear payload missing data.issues.nodes");
  const pageInfo = isPlainObject(issues.pageInfo) ? issues.pageInfo : {};
  return {
    nodes: issues.nodes,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    endCursor: typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null
  };
}
function readIssueNodes(body) {
  return readIssueConnection(body).nodes;
}
function normalizeLinearIssue(raw) {
  if (!isPlainObject(raw)) throw new SymphonyError("linear_unknown_payload", "issue node is not an object");
  const state = isPlainObject(raw.state) && typeof raw.state.name === "string" ? raw.state.name : "";
  return {
    id: stringField2(raw, "id"),
    identifier: stringField2(raw, "identifier"),
    title: stringField2(raw, "title"),
    description: typeof raw.description === "string" ? raw.description : null,
    priority: Number.isInteger(raw.priority) ? raw.priority : null,
    state,
    branch_name: typeof raw.branchName === "string" ? raw.branchName : null,
    url: typeof raw.url === "string" ? raw.url : null,
    labels: normalizeLabels(raw.labels),
    blocked_by: normalizeBlockers(raw.inverseRelations),
    created_at: typeof raw.createdAt === "string" ? raw.createdAt : null,
    updated_at: typeof raw.updatedAt === "string" ? raw.updatedAt : null
  };
}
function stringField2(raw, key) {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}
function normalizeLabels(value) {
  const nodes = isPlainObject(value) && Array.isArray(value.nodes) ? value.nodes : [];
  return nodes.map((node) => isPlainObject(node) && typeof node.name === "string" ? node.name.toLowerCase() : null).filter((v) => Boolean(v));
}
function normalizeBlockers(value) {
  const nodes = isPlainObject(value) && Array.isArray(value.nodes) ? value.nodes : [];
  return nodes.flatMap((node) => {
    if (!isPlainObject(node) || node.type !== "blocks" || !isPlainObject(node.issue)) return [];
    const issue = node.issue;
    return [{
      id: typeof issue.id === "string" ? issue.id : null,
      identifier: typeof issue.identifier === "string" ? issue.identifier : null,
      state: isPlainObject(issue.state) && typeof issue.state.name === "string" ? issue.state.name : null
    }];
  });
}
function countGraphqlOperations(query) {
  const stripped = query.replace(/#[^\n]*/g, " ");
  const matches = stripped.match(/\b(query|mutation|subscription)\b/g);
  return matches?.length ?? 0;
}
var StderrSymphonyLogger = class {
  info(event, fields = {}) {
    process.stderr.write(formatLog("info", event, fields) + "\n");
  }
  warn(event, fields = {}) {
    process.stderr.write(formatLog("warn", event, fields) + "\n");
  }
  error(event, fields = {}) {
    process.stderr.write(formatLog("error", event, fields) + "\n");
  }
};
function formatLog(level, event, fields) {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return [`level=${level}`, `event=${event}`, ...pairs].join(" ");
}
var CodexAppServerAgentRunner = class {
  processes = /* @__PURE__ */ new Map();
  cancel(issueId) {
    this.processes.get(issueId)?.kill("SIGTERM");
  }
  async run(context) {
    const root = path31.resolve(context.config.workspace.root);
    const cwd = path31.resolve(context.workspacePath);
    assertInsideRoot(root, cwd);
    const child = spawn2("bash", ["-lc", context.config.codex.command], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.processes.set(context.issue.id, child);
    const client = new JsonRpcLineClient(child, context.config.codex.readTimeoutMs);
    let threadId = "";
    let turnCount = 0;
    try {
      await client.request("initialize", {
        clientInfo: { name: "teamagent-symphony", title: "TeamAgent Symphony", version: "0.1.0" },
        capabilities: { experimentalApi: true }
      });
      const thread = await client.request("thread/start", {
        cwd,
        approvalPolicy: context.config.codex.approvalPolicy,
        sandbox: context.config.codex.threadSandbox,
        serviceName: "teamagent-symphony",
        threadSource: "user",
        ephemeral: false
      });
      threadId = thread.thread?.id ?? "";
      if (!threadId) throw new SymphonyError("response_error", "thread/start response missing thread.id");
      while (turnCount < context.config.agent.maxTurns) {
        const prompt = turnCount === 0 ? renderPrompt(context.workflow.prompt_template, { issue: context.issue, attempt: context.attempt }) : continuationPrompt(context.issue, turnCount + 1, context.config.agent.maxTurns);
        const response = await client.request("turn/start", {
          threadId,
          cwd,
          input: [{ type: "text", text: prompt }],
          approvalPolicy: context.config.codex.approvalPolicy,
          sandboxPolicy: context.config.codex.turnSandboxPolicy
        });
        const turn = response.turn;
        const turnId = typeof turn?.id === "string" ? turn.id : "";
        if (!turnId) throw new SymphonyError("response_error", "turn/start response missing turn.id");
        turnCount++;
        context.onEvent({
          event: "session_started",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          codex_app_server_pid: String(child.pid ?? ""),
          thread_id: threadId,
          turn_id: turnId
        });
        await client.waitForTurnCompletion(threadId, turnId, context.config.codex.turnTimeoutMs, (event) => {
          context.onEvent(event);
        });
        const refreshed = await context.shouldContinue();
        if (!refreshed) break;
        context.issue = refreshed;
      }
      return { status: "succeeded", turnCount };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err), turnCount };
    } finally {
      child.kill("SIGTERM");
      this.processes.delete(context.issue.id);
    }
  }
};
function continuationPrompt(issue, turn, maxTurns) {
  return [
    `Continue working on ${issue.identifier}: ${issue.title}.`,
    `This is continuation turn ${turn}/${maxTurns}; do not repeat the full original prompt.`,
    "Check the tracker state with the available workflow tools and move the issue toward the workflow-defined handoff."
  ].join("\n");
}
var JsonRpcLineClient = class {
  constructor(child, readTimeoutMs) {
    this.child = child;
    this.readTimeoutMs = readTimeoutMs;
    child.stdout.on("data", (chunk) => this.onData(chunk.toString("utf8")));
    child.on("error", (err) => this.rejectAll(err));
    child.on("exit", (code) => this.rejectAll(new Error(`codex app-server exited with code ${code}`)));
  }
  child;
  readTimeoutMs;
  nextId = 1;
  buffer = "";
  pending = /* @__PURE__ */ new Map();
  notifications = [];
  waiters = [];
  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params }) + "\n";
    this.child.stdin.write(payload);
    return new Promise((resolve5, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SymphonyError("response_timeout", `${method} timed out after ${this.readTimeoutMs}ms`));
      }, this.readTimeoutMs);
      this.pending.set(id, { resolve: resolve5, reject, timer });
    });
  }
  async waitForTurnCompletion(threadId, turnId, timeoutMs, onEvent) {
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      const foundIndex = this.notifications.findIndex((n) => n.method === "turn/completed" && isPlainObject(n.params));
      if (foundIndex >= 0) {
        const notification = this.notifications.splice(foundIndex, 1)[0];
        const params = notification.params;
        const turn = params.turn;
        const status = typeof turn?.status === "string" ? turn.status : "completed";
        onEvent({
          event: status === "completed" ? "turn_completed" : `turn_${status}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          thread_id: typeof params.threadId === "string" ? params.threadId : threadId,
          turn_id: typeof turn?.id === "string" ? turn.id : turnId
        });
        if (status === "completed") return;
        throw new SymphonyError("turn_failed", `turn ended with status ${status}`);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new SymphonyError("turn_timeout", `turn timed out after ${timeoutMs}ms`);
      await new Promise((resolve5) => {
        const timer = setTimeout(resolve5, Math.min(remaining, 100));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve5();
        });
      });
    }
  }
  onData(data) {
    this.buffer += data;
    for (; ; ) {
      const idx = this.buffer.indexOf("\n");
      if (idx < 0) return;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        this.notifications.push({ method: "malformed", params: { line: line.slice(0, 200) } });
        this.notify();
        continue;
      }
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (isPlainObject(msg.error)) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
      } else if (typeof msg.method === "string") {
        this.notifications.push(msg);
        this.notify();
      }
    }
  }
  notify() {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter();
  }
  rejectAll(err) {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }
};
var SymphonyOrchestrator = class {
  constructor(deps) {
    this.deps = deps;
    this.logger = deps.logger ?? new StderrSymphonyLogger();
    this.now = deps.now ?? (() => Date.now());
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
  }
  deps;
  running = /* @__PURE__ */ new Map();
  claimed = /* @__PURE__ */ new Set();
  retryAttempts = /* @__PURE__ */ new Map();
  completed = /* @__PURE__ */ new Set();
  codexTotals = { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 };
  codexRateLimits = null;
  logger;
  now;
  setTimer;
  clearTimer;
  async startupCleanup() {
    const workspace = new WorkspaceManager(this.deps.config, this.logger);
    try {
      const terminal = await this.deps.tracker.fetchIssuesByStates(this.deps.config.tracker.terminalStates);
      for (const issue of terminal) await workspace.removeForIssue(issue.identifier);
    } catch (err) {
      this.logger.warn("startup_cleanup_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  async tick() {
    await this.reconcileRunningIssues();
    try {
      validateDispatchConfig(this.deps.config);
    } catch (err) {
      this.logger.error("dispatch_validation_failed", { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let issues;
    try {
      issues = await this.deps.tracker.fetchCandidateIssues();
    } catch (err) {
      this.logger.error("candidate_fetch_failed", { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    for (const issue of sortIssuesForDispatch(issues)) {
      if (this.availableSlots() <= 0) break;
      if (this.shouldDispatch(issue)) this.dispatchIssue(issue, null);
    }
  }
  shouldDispatch(issue) {
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;
    if (!stateIn(issue.state, this.deps.config.tracker.activeStates)) return false;
    if (stateIn(issue.state, this.deps.config.tracker.terminalStates)) return false;
    if (this.running.has(issue.id) || this.claimed.has(issue.id)) return false;
    if (this.availableSlots() <= 0) return false;
    if (!this.hasStateSlot(issue.state)) return false;
    if (issue.state.toLowerCase() === "todo") {
      return !issue.blocked_by.some((b) => b.state && !stateIn(b.state, this.deps.config.tracker.terminalStates));
    }
    return true;
  }
  dispatchIssue(issue, attempt) {
    this.claimed.add(issue.id);
    const entry = {
      issue,
      identifier: issue.identifier,
      startedAtMs: this.now(),
      lastCodexTimestampMs: null,
      sessionId: null,
      lastCodexEvent: null,
      lastCodexMessage: null,
      turnCount: 0,
      retryAttempt: attempt,
      tokens: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      lastReportedTokens: { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
    };
    this.running.set(issue.id, entry);
    const existingRetry = this.retryAttempts.get(issue.id);
    if (existingRetry?.timer_handle) this.clearTimer(existingRetry.timer_handle);
    this.retryAttempts.delete(issue.id);
    void this.runWorker(issue, attempt);
  }
  snapshot() {
    const now = this.now();
    const activeSeconds = [...this.running.values()].reduce((sum, r) => sum + Math.max(0, now - r.startedAtMs) / 1e3, 0);
    return {
      generated_at: new Date(now).toISOString(),
      counts: { running: this.running.size, retrying: this.retryAttempts.size },
      running: [...this.running.entries()].map(([issueId, r]) => ({
        issue_id: issueId,
        issue_identifier: r.identifier,
        state: r.issue.state,
        session_id: r.sessionId,
        turn_count: r.turnCount,
        last_event: r.lastCodexEvent,
        last_message: r.lastCodexMessage,
        started_at: new Date(r.startedAtMs).toISOString(),
        last_event_at: r.lastCodexTimestampMs ? new Date(r.lastCodexTimestampMs).toISOString() : null,
        tokens: r.tokens
      })),
      retrying: [...this.retryAttempts.values()].map((r) => ({
        issue_id: r.issue_id,
        issue_identifier: r.identifier,
        attempt: r.attempt,
        due_at: new Date(r.due_at_ms).toISOString(),
        error: r.error
      })),
      codex_totals: { ...this.codexTotals, seconds_running: this.codexTotals.seconds_running + activeSeconds },
      rate_limits: this.codexRateLimits
    };
  }
  async refreshNow() {
    await this.tick();
  }
  async runWorker(issue, attempt) {
    const workspace = new WorkspaceManager(this.deps.config, this.logger);
    let workspacePath = "";
    try {
      const info = await workspace.createForIssue(issue.identifier);
      workspacePath = info.path;
      await workspace.beforeRun(workspacePath);
      const result = await this.deps.runner.run({
        issue,
        attempt,
        config: this.deps.config,
        workflow: this.deps.workflow,
        workspacePath,
        onEvent: (event) => this.onAgentEvent(issue.id, event),
        shouldContinue: async () => {
          const [refreshed] = await this.deps.tracker.fetchIssueStatesByIds([issue.id]);
          if (!refreshed || !stateIn(refreshed.state, this.deps.config.tracker.activeStates)) return null;
          return refreshed;
        }
      });
      await workspace.afterRun(workspacePath);
      this.onWorkerExit(issue.id, result.status === "succeeded" ? "normal" : result.status, result.error);
    } catch (err) {
      if (workspacePath) await workspace.afterRun(workspacePath);
      this.onWorkerExit(issue.id, "failed", err instanceof Error ? err.message : String(err));
    }
  }
  onAgentEvent(issueId, event) {
    const running = this.running.get(issueId);
    if (!running) return;
    const at = Date.parse(event.timestamp);
    running.lastCodexTimestampMs = Number.isFinite(at) ? at : this.now();
    running.lastCodexEvent = event.event;
    running.lastCodexMessage = event.message ?? running.lastCodexMessage;
    if (event.thread_id && event.turn_id) running.sessionId = `${event.thread_id}-${event.turn_id}`;
    if (event.event === "session_started") running.turnCount += 1;
    if (event.rate_limits) this.codexRateLimits = event.rate_limits;
    const tokens = extractTokenUsage(event.usage);
    if (tokens) {
      running.tokens = tokens;
      this.codexTotals.input_tokens += Math.max(0, tokens.input_tokens - running.lastReportedTokens.input_tokens);
      this.codexTotals.output_tokens += Math.max(0, tokens.output_tokens - running.lastReportedTokens.output_tokens);
      this.codexTotals.total_tokens += Math.max(0, tokens.total_tokens - running.lastReportedTokens.total_tokens);
      running.lastReportedTokens = tokens;
    }
  }
  onWorkerExit(issueId, reason, error) {
    const running = this.running.get(issueId);
    if (!running) return;
    this.running.delete(issueId);
    this.codexTotals.seconds_running += Math.max(0, this.now() - running.startedAtMs) / 1e3;
    if (reason === "normal") {
      this.completed.add(issueId);
      this.scheduleRetry(issueId, running.identifier, 1, null, true);
    } else {
      this.scheduleRetry(issueId, running.identifier, (running.retryAttempt ?? 0) + 1, error ?? reason, false);
    }
  }
  scheduleRetry(issueId, identifier, attempt, error, continuation) {
    const delay = continuation ? 1e3 : Math.min(1e4 * 2 ** Math.max(attempt - 1, 0), this.deps.config.agent.maxRetryBackoffMs);
    const entry = {
      issue_id: issueId,
      identifier,
      attempt,
      due_at_ms: this.now() + delay,
      error
    };
    entry.timer_handle = this.setTimer(() => void this.onRetryTimer(issueId), delay);
    this.retryAttempts.set(issueId, entry);
    this.claimed.add(issueId);
    this.logger.info("retry_scheduled", { issue_id: issueId, issue_identifier: identifier, attempt, delay_ms: delay, error });
  }
  async onRetryTimer(issueId) {
    const entry = this.retryAttempts.get(issueId);
    if (!entry) return;
    this.retryAttempts.delete(issueId);
    let candidates;
    try {
      candidates = await this.deps.tracker.fetchCandidateIssues();
    } catch {
      this.scheduleRetry(issueId, entry.identifier, entry.attempt + 1, "retry poll failed", false);
      return;
    }
    const issue = candidates.find((i) => i.id === issueId);
    if (!issue) {
      this.claimed.delete(issueId);
      return;
    }
    this.claimed.delete(issueId);
    if (this.availableSlots() === 0) {
      this.claimed.add(issueId);
      this.scheduleRetry(issueId, issue.identifier, entry.attempt + 1, "no available orchestrator slots", false);
      return;
    }
    if (this.shouldDispatch(issue)) this.dispatchIssue(issue, entry.attempt);
  }
  async reconcileRunningIssues() {
    if (this.deps.config.codex.stallTimeoutMs > 0) {
      for (const [issueId, running] of this.running.entries()) {
        const anchor = running.lastCodexTimestampMs ?? running.startedAtMs;
        if (this.now() - anchor > this.deps.config.codex.stallTimeoutMs) {
          this.deps.runner.cancel?.(issueId, "stalled");
          this.onWorkerExit(issueId, "stalled", "stalled session");
        }
      }
    }
    const ids = [...this.running.keys()];
    if (ids.length === 0) return;
    let refreshed;
    try {
      refreshed = await this.deps.tracker.fetchIssueStatesByIds(ids);
    } catch {
      this.logger.warn("state_refresh_failed", {});
      return;
    }
    const workspace = new WorkspaceManager(this.deps.config, this.logger);
    for (const issue of refreshed) {
      const running = this.running.get(issue.id);
      if (!running) continue;
      if (stateIn(issue.state, this.deps.config.tracker.terminalStates)) {
        this.terminateRunningIssue(issue.id, "terminal_state");
        await workspace.removeForIssue(issue.identifier);
      } else if (stateIn(issue.state, this.deps.config.tracker.activeStates)) {
        running.issue = issue;
      } else {
        this.terminateRunningIssue(issue.id, "non_active_state");
      }
    }
  }
  terminateRunningIssue(issueId, reason) {
    const running = this.running.get(issueId);
    if (!running) return;
    this.deps.runner.cancel?.(issueId, reason);
    this.running.delete(issueId);
    this.claimed.delete(issueId);
    this.codexTotals.seconds_running += Math.max(0, this.now() - running.startedAtMs) / 1e3;
    this.logger.info("run_terminated", { issue_id: issueId, issue_identifier: running.identifier, reason });
  }
  availableSlots() {
    return Math.max(this.deps.config.agent.maxConcurrentAgents - this.running.size, 0);
  }
  hasStateSlot(state) {
    const key = state.toLowerCase();
    const limit = this.deps.config.agent.maxConcurrentAgentsByState[key] ?? this.deps.config.agent.maxConcurrentAgents;
    const count = [...this.running.values()].filter((r) => r.issue.state.toLowerCase() === key).length;
    return count < limit;
  }
};
function stateIn(state, states) {
  const normalized = state.toLowerCase();
  return states.some((s) => s.toLowerCase() === normalized);
}
function sortIssuesForDispatch(issues) {
  return [...issues].sort((a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY;
    const bp = b.priority ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    const ac = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
    const bc = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
    if (ac !== bc) return ac - bc;
    return a.identifier.localeCompare(b.identifier);
  });
}
function extractTokenUsage(usage) {
  if (!usage) return null;
  const input = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  const total = Number(usage.total_tokens ?? usage.totalTokens ?? input + output);
  return {
    input_tokens: Number.isFinite(input) ? input : 0,
    output_tokens: Number.isFinite(output) ? output : 0,
    total_tokens: Number.isFinite(total) ? total : 0
  };
}
async function executeSymphony(options, cwd = process.cwd()) {
  const workflow = await loadWorkflow(options.workflowPath, cwd);
  const config = resolveSymphonyConfig(workflow);
  validateDispatchConfig(config);
  const orchestrator = new SymphonyOrchestrator({
    workflow,
    config,
    tracker: new LinearIssueTrackerClient(config),
    runner: new CodexAppServerAgentRunner()
  });
  await orchestrator.startupCleanup();
  const portFromWorkflow = getServerPort(workflow.config);
  const port = options.port ?? portFromWorkflow;
  let server = null;
  if (port !== null && port !== void 0) {
    server = await startSymphonyHttpServer(orchestrator, {
      host: options.host ?? "127.0.0.1",
      port
    });
  }
  await orchestrator.tick();
  if (options.once) {
    server?.close();
    return { output: `Symphony tick completed. running=${orchestrator.running.size} retrying=${orchestrator.retryAttempts.size}
`, exitCode: 0 };
  }
  const interval = setInterval(() => void orchestrator.tick(), config.polling.intervalMs);
  await new Promise((resolve5) => {
    const stop = () => {
      clearInterval(interval);
      server?.close();
      resolve5();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return { output: "Symphony stopped.\n", exitCode: 0 };
}
function getServerPort(config) {
  const server = getObject(config, "server");
  const port = server.port;
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : null;
}
function startSymphonyHttpServer(orchestrator, opts) {
  const server = http2.createServer((req, res) => {
    void handleHttp(orchestrator, req, res);
  });
  return new Promise((resolve5, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve5(server));
  });
}
async function handleHttp(orchestrator, req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/") {
    const snapshot = orchestrator.snapshot();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderDashboardHtml(snapshot));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/v1/state") {
    writeJson(res, 200, orchestrator.snapshot());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/v1/refresh") {
    await orchestrator.refreshNow();
    writeJson(res, 202, {
      queued: true,
      coalesced: false,
      requested_at: (/* @__PURE__ */ new Date()).toISOString(),
      operations: ["poll", "reconcile"]
    });
    return;
  }
  if (url.pathname.startsWith("/api/v1/")) {
    const identifier = decodeURIComponent(url.pathname.slice("/api/v1/".length));
    const snapshot = orchestrator.snapshot();
    const running = snapshot.running.find((r) => r.issue_identifier === identifier);
    const retry = snapshot.retrying.find((r) => r.issue_identifier === identifier);
    if (!running && !retry) {
      writeJson(res, 404, { error: { code: "issue_not_found", message: `Issue ${identifier} is not tracked` } });
      return;
    }
    writeJson(res, 200, {
      issue_identifier: identifier,
      issue_id: running?.issue_id ?? retry?.issue_id,
      status: running ? "running" : "retrying",
      running: running ?? null,
      retry: retry ?? null
    });
    return;
  }
  writeJson(res, 404, { error: { code: "not_found", message: "not found" } });
}
function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}
function renderDashboardHtml(snapshot) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Symphony</title><style>
body{font-family:ui-sans-serif,system-ui;margin:32px;color:#111827;background:#f8fafc}
table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #e5e7eb;padding:8px;text-align:left}code{background:#eef2ff;padding:2px 4px}
</style></head>
<body><h1>Symphony</h1><p>running=${snapshot.counts.running} retrying=${snapshot.counts.retrying}</p>
<h2>Running</h2><table><tr><th>Issue</th><th>State</th><th>Session</th><th>Last event</th></tr>
${snapshot.running.map((r) => `<tr><td>${escapeHtml(String(r.issue_identifier))}</td><td>${escapeHtml(String(r.state))}</td><td><code>${escapeHtml(String(r.session_id ?? ""))}</code></td><td>${escapeHtml(String(r.last_event ?? ""))}</td></tr>`).join("")}
</table><h2>Retrying</h2><pre>${escapeHtml(JSON.stringify(snapshot.retrying, null, 2))}</pre></body></html>`;
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// ../cli/src/bin.ts
function findPackageVersion() {
  let dir = path32.dirname(fileURLToPath4(import.meta.url));
  let workspaceRoot = null;
  for (let i = 0; i < 8; i++) {
    if (!workspaceRoot && (fs30.existsSync(path32.join(dir, "pnpm-workspace.yaml")) || fs30.existsSync(path32.join(dir, "packages", "teamagent", "package.json")))) {
      workspaceRoot = dir;
    }
    const pkgPath = path32.join(dir, "package.json");
    if (fs30.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs30.readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "teamagent" && pkg.bin?.["teamagent"] && pkg.version) {
          return pkg.version;
        }
      } catch {
      }
    }
    const next = path32.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  if (workspaceRoot) {
    try {
      const tpkgPath = path32.join(workspaceRoot, "packages", "teamagent", "package.json");
      const tpkg = JSON.parse(fs30.readFileSync(tpkgPath, "utf-8"));
      if (tpkg.version) return tpkg.version;
    } catch {
    }
  }
  return "unknown";
}
async function main() {
  const command = process.argv[2];
  const rawRest = process.argv.slice(3);
  const duckCliFlag = "--explain-like-ceo-duck";
  if (rawRest.includes(duckCliFlag)) {
    const envObj = globalThis.process.env;
    envObj["TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK"] = "1";
  }
  const rest = rawRest.filter((a) => a !== duckCliFlag);
  switch (command) {
    case "--version":
    case "-V":
    case "version": {
      process.stdout.write(`${findPackageVersion()}
`);
      return;
    }
    case "skeleton-demo": {
      const output = await runSkeletonDemo();
      if (output) process.stdout.write(output + "\n");
      return;
    }
    case "m5-infect": {
      const opts = parseM5InfectArgs(rest);
      const result = await runM5Infect(opts);
      process.stdout.write(renderM5InfectResult(result) + "\n");
      return;
    }
    case "m5-bootstrap": {
      const opts = parseM5BootstrapArgs(rest);
      try {
        const result = await runM5Bootstrap(opts);
        const { output, exitCode } = renderM5BootstrapResult(result);
        process.stdout.write(output + "\n");
        if (exitCode !== 0) process.exit(exitCode);
      } catch (err) {
        process.stderr.write(
          `[m5-bootstrap] ${err instanceof Error ? err.message : String(err)}
`
        );
        process.exit(2);
      }
      return;
    }
    case "m5-share": {
      const opts = parseM5ShareArgs(rest);
      if (!opts.text) {
        process.stderr.write(
          '[m5-share] \u5FC5\u987B\u63D0\u4F9B --text "<\u89C4\u5219\u6587\u672C>"\n'
        );
        process.exit(1);
      }
      try {
        const result = await runM5Share(opts);
        process.stdout.write(renderM5ShareResult(result) + "\n");
      } catch (err) {
        const { M5ShareValidationError } = await import("./m5-share-6U6SUCG5.js");
        if (err instanceof M5ShareValidationError) {
          process.stderr.write(`[m5-share] ${err.message}
`);
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "m5-sync": {
      const opts = parseM5SyncArgs(rest);
      const result = await runM5Sync(opts);
      process.stdout.write(renderM5SyncResult(result) + "\n");
      return;
    }
    case "m5-replay": {
      try {
        const opts = parseM5ReplayArgs(rest);
        const result = await executeM5Replay(opts);
        if (opts.json) {
          process.stdout.write(JSON.stringify(result) + "\n");
        } else {
          process.stdout.write(renderM5ReplayResult(result) + "\n");
        }
        if (!result.passed) {
          process.exit(1);
        }
      } catch (err) {
        if (err instanceof M5ReplayArgError) {
          process.stderr.write(`[m5-replay] ${err.message}
`);
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "m5-delete": {
      const opts = parseM5DeleteArgs(rest);
      if (!opts.ruleId) {
        process.stderr.write("[m5-delete] \u5FC5\u987B\u63D0\u4F9B --rule-id <id>\n");
        process.exit(1);
      }
      try {
        const result = await runM5Delete(opts);
        process.stdout.write(renderM5DeleteResult(result) + "\n");
      } catch (err) {
        const { M5DeleteValidationError } = await import("./m5-delete-Y3YDKWFX.js");
        if (err instanceof M5DeleteValidationError) {
          process.stderr.write(`[m5-delete] ${err.message}
`);
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "m5-status": {
      const opts = parseM5StatusArgs(rest);
      const result = await runM5Status(opts);
      process.stdout.write(renderM5StatusResult(result) + "\n");
      return;
    }
    case "m5-publish": {
      const opts = parseM5PublishArgs(rest);
      const result = await runM5Publish(opts);
      process.stdout.write(renderM5PublishResult(result) + "\n");
      return;
    }
    case "inspect-member": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(renderInspectMemberHelp() + "\n");
        return;
      }
      try {
        const opts = parseInspectMemberArgs(rest);
        const out = await executeInspectMember(opts);
        process.stdout.write(renderInspectMemberResult(out) + "\n");
      } catch (err) {
        if (err instanceof InspectMemberError) {
          process.stderr.write(`inspect-member: ${err.message}
`);
          process.stderr.write(renderInspectMemberHelp() + "\n");
          process.exitCode = 2;
          return;
        }
        throw err;
      }
      return;
    }
    case "pitfall": {
      let nonInteractive;
      try {
        nonInteractive = parsePitfallArgs(rest);
      } catch (err) {
        const { PitfallValidationError } = await import("./pitfall-RVP3W4DN.js");
        if (err instanceof PitfallValidationError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const output = nonInteractive ? await executePitfall(nonInteractive) : await runPitfallInteractive();
      if (output) process.stdout.write(output + "\n");
      return;
    }
    case "stats": {
      const statsOpts = {};
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--stuck-in-promotion") {
          statsOpts.stuckInPromotion = true;
        } else if (a === "--explain" && rest[i + 1]) {
          statsOpts.explain = rest[++i];
        } else if (a.startsWith("--explain=")) {
          statsOpts.explain = a.slice("--explain=".length);
        } else if (a.startsWith("--stuck-days=")) {
          const v = parseInt(a.slice("--stuck-days=".length), 10);
          if (isNaN(v) || v < 0) {
            process.stderr.write(`--stuck-days \u5FC5\u987B\u662F\u6B63\u6574\u6570\uFF0C\u6536\u5230: "${a.slice("--stuck-days=".length)}"
`);
            process.exit(1);
          }
          statsOpts.stuckDays = v;
        } else if (a === "--override-signals") {
          statsOpts.overrideSignals = true;
        }
      }
      process.stdout.write(executeStats(statsOpts));
      return;
    }
    case "try": {
      const { executeTry } = await import("./try-MPBWOQ2U.js");
      if (rest.includes("--help") || rest.includes("-h")) {
        const r2 = await executeTry({ help: true });
        process.stdout.write(r2.output);
        process.exit(r2.exitCode);
      }
      const r = await executeTry({});
      process.stdout.write(r.output);
      process.exit(r.exitCode);
    }
    case "demo": {
      const sub = rest[0];
      if (sub === "hook") {
        const opts = parseDemoHookArgs(rest.slice(1));
        if (!opts) {
          process.stderr.write(
            `\u7528\u6CD5: teamagent demo hook <tool> <key=value>... \u4F8B: teamagent demo hook Bash 'command=npm install moment'
\u591A\u5B57\u6BB5\uFF1A\u7528\u7A7A\u683C\u5206\u9694\u591A\u4E2A 'key=value' \u69FD\u4F4D\uFF0C\u6216\u4F20\u5355\u4E2A JSON \u5BF9\u8C61\uFF0C\u4F8B: teamagent demo hook Write '{"file_path":"a.js","content":"hi"}'
`
          );
          process.exit(1);
        }
        process.stdout.write(executeDemoHook(opts).output);
        return;
      }
      const { parseDemoArgs, executeDemo } = await import("./demo-26ZCGNPW.js");
      const demoArgs = parseDemoArgs(rest);
      const r = await executeDemo(demoArgs);
      process.stdout.write(r.output);
      if (r.exitCode !== 0) process.exit(r.exitCode);
      return;
    }
    case "install-hook": {
      const r = installHook();
      if (r.alreadyInstalled) {
        process.stdout.write(
          `\u2713 Hook \u5DF2\u5B89\u88C5\uFF08\u65E0\u53D8\u5316\uFF09: ${r.settingsPath}
  \u5165\u53E3: ${r.hookEntry}
`
        );
      } else {
        process.stdout.write(
          `\u2705 Hook \u5DF2\u6CE8\u518C\u5230 Claude Code: ${r.settingsPath}
  \u5165\u53E3: ${r.hookEntry}
  \u4E0B\u6B21\u5F00 Claude Code \u65F6\u751F\u6548\u3002\u53EF\u7528 'teamagent demo hook ...' \u79BB\u7EBF\u6D4B\u8BD5\u3002
`
        );
      }
      return;
    }
    case "uninstall-hook": {
      const r = uninstallHook();
      if (r.removed) {
        process.stdout.write(`\u2705 Hook \u5DF2\u79FB\u9664: ${r.settingsPath}
`);
      } else {
        process.stdout.write(`\u672A\u627E\u5230 TeamAgent hook \u6CE8\u518C\u3002\u65E0\u9700\u79FB\u9664\u3002
`);
      }
      return;
    }
    case "install-user-hook": {
      if (rest.includes("--dry-run")) {
        process.stderr.write(
          `install-user-hook \u4E0D\u652F\u6301 --dry-run\uFF08\u8BE5\u547D\u4EE4\u76F4\u63A5\u4FEE\u6539 ~/.claude/settings.json\uFF09\u3002
\u5982\u9700\u67E5\u770B\u6CE8\u518C\u8DEF\u5F84\uFF0C\u5148\u8FD0\u884C: teamagent install-user-hook \u540E\u7528 cat ~/.claude/settings.json \u67E5\u770B\uFF0C\u6216\u7528 teamagent uninstall-user-hook \u64A4\u9500\u3002
`
        );
        process.exit(2);
      }
      const r = installUserHook();
      if (r.alreadyInstalled) {
        process.stdout.write(
          `\u2713 \u7528\u6237\u7EA7 SessionStart hook \u5DF2\u5B89\u88C5 (\u65E0\u53D8\u5316): ${r.settingsPath}
`
        );
      } else {
        process.stdout.write(
          `\u2705 \u7528\u6237\u7EA7 SessionStart hook \u5DF2\u6CE8\u518C: ${r.settingsPath}
` + (r.backupPath ? `   \u539F\u914D\u7F6E\u5DF2\u5907\u4EFD: ${r.backupPath}
` : "") + `   \u5165\u53E3: ${r.hookEntry}
   \u6253\u5F00\u4EFB\u4F55\u65B0\u9879\u76EE\u65F6\u5C06\u81EA\u52A8\u68C0\u6D4B\u5E76 init
`
        );
      }
      return;
    }
    case "uninstall-user-hook": {
      if (rest.includes("--dry-run")) {
        process.stderr.write(
          `uninstall-user-hook \u4E0D\u652F\u6301 --dry-run\uFF08\u8BE5\u547D\u4EE4\u76F4\u63A5\u4FEE\u6539 ~/.claude/settings.json\uFF09\u3002
`
        );
        process.exit(2);
      }
      const r = uninstallUserHook();
      if (r.removed) {
        process.stdout.write(`\u2705 \u7528\u6237\u7EA7 SessionStart hook \u5DF2\u79FB\u9664: ${r.settingsPath}
`);
      } else {
        process.stdout.write(`\u672A\u627E\u5230\u7528\u6237\u7EA7 SessionStart hook\uFF0C\u65E0\u9700\u79FB\u9664
`);
      }
      return;
    }
    case "analyze": {
      const opts = parseAnalyzeArgs(rest);
      const output = await executeAnalyze(opts);
      process.stdout.write(output);
      return;
    }
    case "review": {
      const opts = parseReviewArgs(rest);
      process.stdout.write(executeReview(opts));
      return;
    }
    case "required-check": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: teamagent required-check [--project <dir>] [--json]\n\nValidates this repository's TeamAgent required-mode contract:\n  - reads `.teamagent/required.json` (written by `teamagent init .`)\n  - confirms its schema and mode are `teamagent.required.v1` / `required`\n\nExit code:\n  0 \u2014 OK; the project is configured for required mode.\n  2 \u2014 `.teamagent/required.json` missing or malformed.\n  3 \u2014 schema or mode unsupported.\n\nHook-safe (no DB access, no network, no writes). Designed to be\ninvoked from `.claude/hooks/check-teamagent.sh` before Claude tool use.\n"
        );
        return;
      }
      const opts = parseRequiredCheckArgs(rest);
      const r = executeRequiredCheck(opts);
      process.stdout.write(renderRequiredCheckResult(r, opts.json ?? false) + "\n");
      if (r.exitCode !== 0) process.exit(r.exitCode);
      return;
    }
    case "init": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: teamagent init [--dry-run] [--structure] [--skip-import] [--skip-hook]\n                      [--skip-seed] [--skip-warmup] [--install-plugins]\n                      [--target=claude|codex|both] [--pack <all|name1,name2>]\n                      [--no-user-level-hook] [--force-nested-init]\n                      [--cwd=<path>] [--home=<path>]\n\nOptions:\n  --dry-run              Preview what init would do without making changes\n  --structure            Opt in to LLM-based rule import from CLAUDE.md /\n                         AGENTS.md / .cursorrules. Spawns one `claude -p` call\n                         per rule and consumes Claude subscription quota.\n                         Default OFF: init does not call the LLM or read those\n                         files \u2014 rules live in the rule store, not CLAUDE.md.\n  --skip-import          Force-skip LLM rule import even when --structure is set\n  --skip-hook            Skip hook registration\n  --skip-seed            Skip bundled seed-rule injection\n  --skip-warmup          Skip embedding model warmup\n  --install-plugins      Also install team plugins (playground/code-review/code-simplifier/...)\n  --target=TARGET        claude (default), codex, or both\n  --pack=NAMES           Install stack packs without showing the agent prompt.\n                         NAMES may be 'all' or a comma-separated list (e.g. frontend-js,ops-safety).\n  --no-user-level-hook   Issue #161 escape hatch: do NOT register hooks in\n                         ~/.claude/settings.json. Default behaviour registers\n                         user-level hooks so cc launched from sub-directories\n                         still triggers TeamAgent (project DB resolved via walk-up).\n  --force-nested-init    Issue #161 escape hatch: allow `init` to create a\n                         child .teamagent/ even when an ancestor already has\n                         one. Default refuses to avoid duplicate state.\n  --cwd=<path>           Override target project dir (default: process.cwd()).\n                         Required for third-party judge harnesses that land init\n                         on a sandbox without `cd` (Feature \u2460 openable-and-usable).\n  --home=<path>          Override user home dir for state files / skills mirror\n                         (default: os.homedir()). Use together with --cwd to fully\n                         isolate a fresh-repo smoke run from existing TeamAgent state.\n\nScaffolds TeamAgent config in the current project:\n  - Creates .teamagent/ directory and initializes knowledge DB\n  - Injects meta-principles into global store\n  - Imports rules from CLAUDE.md / AGENTS.md / .cursorrules (only with --structure)\n  - Registers Claude Code hook (PreToolUse) at project AND user level\n  - Exports compiled Skills\n\nRun teamagent doctor after init to verify the installation.\n"
        );
        return;
      }
      const opts = parseInitArgs(rest);
      const result = await executeInit(opts);
      process.stdout.write(renderInitResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "install-codex": {
      const opts = parseInitArgs(rest);
      const result = await executeInit({ ...opts, target: "codex" });
      process.stdout.write(renderInitResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "install": {
      const installArgs = parseInstallArgs(rest);
      if (installArgs.help) {
        process.stdout.write(renderInstallHelp());
        return;
      }
      if (installArgs.preview) {
        process.stdout.write(renderInstallPreviewOutput());
        return;
      }
      const result = await runInstall(installArgs);
      process.stdout.write(result.output);
      if (!result.ok) process.exit(1);
      return;
    }
    case "disable": {
      const r = disable();
      if (r.removed) {
        process.stdout.write(`\u2713 Hook \u5DF2\u7981\u7528: ${r.settingsPath}
  \u6570\u636E\u4FDD\u7559\uFF1B\u7528 'teamagent enable' \u6062\u590D
`);
      } else {
        process.stdout.write(`\u672A\u627E\u5230\u5DF2\u6CE8\u518C\u7684 TeamAgent hook\uFF0C\u65E0\u9700\u7981\u7528
`);
      }
      return;
    }
    case "enable": {
      const r = enable();
      if (r.alreadyInstalled) {
        process.stdout.write(`\u2713 Hook \u5DF2\u542F\u7528\uFF08\u65E0\u53D8\u5316\uFF09: ${r.settingsPath}
`);
      } else {
        process.stdout.write(`\u2705 Hook \u5DF2\u91CD\u65B0\u542F\u7528: ${r.settingsPath}
  \u4E0B\u6B21\u5F00 Claude Code \u65F6\u751F\u6548
`);
      }
      return;
    }
    case "uninstall": {
      let opts;
      try {
        opts = parseUninstallArgs(rest);
      } catch (err) {
        const { UninstallArgError } = await import("./uninstall-P5YPPRT7.js");
        if (err instanceof UninstallArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const r = uninstall(opts);
      process.stdout.write(renderUninstallResult(r));
      return;
    }
    case "calibrate": {
      let opts;
      try {
        opts = parseCalibrateArgs(rest);
      } catch (err) {
        const { CalibrateArgError } = await import("./calibrate-SE4WO2UB.js");
        if (err instanceof CalibrateArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const r = await executeCalibrate(opts);
      process.stdout.write(renderCalibrateResult(r));
      return;
    }
    case "verify": {
      let opts;
      try {
        opts = parseVerifyArgs(rest);
      } catch (err) {
        const { VerifyArgError } = await import("./verify-KFNVAEZI.js");
        if (err instanceof VerifyArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const { result, reportPath } = await executeVerify(opts);
      process.stdout.write(renderVerifyTerminal(result));
      if (reportPath) {
        process.stdout.write(`
\u{1F4C4} \u8BE6\u7EC6\u62A5\u544A: ${reportPath}
`);
      }
      if (result.passed !== result.total) process.exit(1);
      return;
    }
    case "verify-anchors": {
      let opts;
      try {
        opts = parseVerifyAnchorsArgs(rest);
      } catch (err) {
        const { VerifyAnchorsArgError } = await import("./verify-anchors-OXEZABHV.js");
        if (err instanceof VerifyAnchorsArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const r = await executeVerifyAnchors(opts);
      if (opts.json) process.stdout.write(renderVerifyAnchorsJson(r));
      else process.stdout.write(renderVerifyAnchorsTerminal(r));
      if (r.failCount > 0) process.exit(1);
      return;
    }
    case "e2e-evaluate": {
      const opts = parseE2EEvaluateArgs(rest);
      const result = await executeE2EEvaluate(opts);
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(renderE2EEvaluateResult(result));
      }
      if (!result.ok) process.exit(1);
      return;
    }
    case "ingest": {
      let opts;
      try {
        opts = parseIngestArgs(rest);
      } catch (err) {
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}
`
        );
        process.exit(1);
        return;
      }
      const output = await executeIngest(opts);
      if (output.startsWith("\u2717")) {
        process.stderr.write(output);
        process.exit(1);
        return;
      }
      process.stdout.write(output);
      return;
    }
    case "dogfood-report": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: teamagent dogfood-report [--output=path]\n\nOptions:\n  --output=PATH    Write report to PATH (default: docs/dogfood/\u81EA\u4E3E\u62A5\u544A.md)\n\nScans events.db + knowledge.db + git log to generate a self-bootstrapping\ndogfood report. Shows knowledge stats, hook interventions, top fired rules,\nand confidence changes across all sandbox tiers.\n\nTier isolation: operates on current sandbox state without crossing tier\nboundaries. Use --output to redirect to a different path.\n"
        );
        return;
      }
      const opts = parseDogfoodReportArgs(rest);
      const r = await executeDogfoodReport(opts);
      process.stdout.write(
        `\u{1F4CA} \u81EA\u4E3E\u62A5\u544A\u751F\u6210: ${r.outputPath}
  ${r.totalEntries} \u6761\u77E5\u8BC6 / ${r.totalEvents} \u4E2A\u4E8B\u4EF6 / ${r.archivedCount} \u81EA\u52A8\u5F52\u6863
`
      );
      return;
    }
    case "bug-report": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: teamagent bug-report [--out=path] [--stdout]\n\nOptions:\n  --out=PATH       Write report to PATH (default: ~/.teamagent/bug-reports/...md)\n  --stdout         Print report to stdout instead of writing to file\n\nGenerates a diagnostic bug report with system info, tool versions,\nhook config, and raw logs. Attach to GitHub issues when reporting\nfirst-install or hook failures. Secrets are auto-redacted.\n\nIncludes: system info, how-to-reproduce steps, raw logs (auto-redacted).\n"
        );
        return;
      }
      const opts = parseBugReportArgs(rest);
      const result = await executeBugReport({
        ...opts,
        cwd: process.cwd(),
        teamagentVersion: findPackageVersion()
      });
      if (opts.stdout) {
        process.stdout.write(result.markdown);
      } else {
        process.stdout.write(
          `Bug report written: ${result.outputPath}
Attach this file when reporting first-install or hook failures.
`
        );
      }
      return;
    }
    case "dashboard": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: teamagent dashboard [--watch|--once] [--host=127.0.0.1] [--port=8787] [--interval=2s] [--open]\n\nOptions:\n  --watch          Start HTTP server; regenerate dashboard on interval (default)\n  --once           Generate docs/dashboard.html once and exit\n  --open           Open browser after server starts\n  --host=HOST      Bind host (default 127.0.0.1)\n  --port=PORT      Port (default 8787)\n  --interval=DUR   Refresh interval, e.g. 2s, 500ms (default 2s)\n\nDashboard shows VERIFIED / PLANNED feature status and live rule/event stats.\n"
        );
        return;
      }
      try {
        const opts = parseDashboardArgs(rest);
        const result = await launchDashboard(opts);
        process.stdout.write(renderDashboardLaunch(result));
      } catch (err) {
        if (err instanceof DashboardArgsError) {
          process.stderr.write(
            `${err.message}
Usage: teamagent dashboard [--watch|--once] [--host=127.0.0.1] [--port=8787] [--interval=2s] [--open]
`
          );
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "recording": {
      try {
        const opts = parseRecordingArgs(rest);
        const result = await executeRecording({ ...opts, cwd: process.cwd() });
        process.stdout.write(renderRecordingResult(result));
      } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
        process.exit(2);
      }
      return;
    }
    case "pack": {
      if (rest.length === 0 || rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage:\n  teamagent pack list [--json]\n  teamagent pack add <names>      e.g. pack add frontend-js,ops-safety\n  teamagent pack remove <names>\n\nManages stack packs (per ADR 0002 \u2014 agent-driven detection).\nPack rules are written to ~/.teamagent/global.db with tag pack:<name>.\n"
        );
        return;
      }
      let args;
      try {
        args = parsePackArgs(rest);
      } catch (err) {
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}
`
        );
        process.exit(2);
        return;
      }
      if (args.sub === "list") {
        const result = executePackList({});
        process.stdout.write(renderPackList(result, args.json));
        return;
      }
      if (args.sub === "add") {
        const result = executePackAdd(args.names, {});
        process.stdout.write(renderPackAdd(result));
        const code = packAddExitCode(result);
        if (code !== 0) process.exit(code);
        return;
      }
      if (args.sub === "remove") {
        const result = executePackRemove(args.names, {});
        process.stdout.write(renderPackRemove(result));
        return;
      }
      return;
    }
    case "fixture": {
      try {
        if (rest.length === 0 || rest.includes("--help") || rest.includes("-h")) {
          process.stdout.write(renderFixtureReplayHelp());
          return;
        }
        const opts = parseFixtureReplayArgs(rest);
        const result = await executeFixtureReplay(opts);
        process.stdout.write(
          opts.json ? JSON.stringify(result, null, 2) + "\n" : renderFixtureReplayResult(result)
        );
        if (!result.ok) process.exit(1);
      } catch (err) {
        if (err instanceof FixtureReplayArgError) {
          process.stderr.write(err.message.endsWith("\n") ? err.message : err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "symphony": {
      try {
        if (rest.includes("--help") || rest.includes("-h")) {
          process.stdout.write(renderSymphonyHelp());
          return;
        }
        const opts = parseSymphonyArgs(rest);
        const result = await executeSymphony(opts, process.cwd());
        process.stdout.write(result.output);
        if (result.exitCode !== 0) process.exit(result.exitCode);
      } catch (err) {
        if (err instanceof SymphonyArgError) {
          process.stderr.write(err.message.endsWith("\n") ? err.message : err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "compile": {
      let opts;
      try {
        opts = parseCompileArgs(rest);
      } catch (err) {
        const { CompileArgError } = await import("./compile-SGDWDBZZ.js");
        if (err instanceof CompileArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const result = await executeCompile(opts);
      process.stdout.write(renderCompileResult(result, opts.dryRun));
      return;
    }
    case "compile-cursor": {
      const opts = parseCompileCursorArgs(rest);
      const result = await executeCompileCursor(opts);
      process.stdout.write(renderCompileCursorResult(result));
      return;
    }
    case "daily": {
      let opts;
      try {
        opts = parseDailyArgs(rest);
      } catch (err) {
        process.stderr.write(`${err.message}
`);
        process.exit(2);
      }
      if (opts.help) {
        process.stdout.write(renderDailyHelp());
        return;
      }
      const out = executeDaily(opts);
      process.stdout.write(renderDailyStdout(out, opts));
      return;
    }
    case "docs-propagate": {
      const opts = parseDocsPropagateArgs(rest);
      const result = await executeDocsPropagate(opts);
      process.stdout.write(renderDocsPropagationResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "config": {
      const sub = rest[0];
      const val = rest[1];
      if (!sub || sub !== "show" && sub !== "stop-mode") {
        console.error("Usage: teamagent config stop-mode <sync|async>");
        console.error("       teamagent config show");
        process.exit(1);
      }
      try {
        const out = executeConfig({ subcommand: sub, value: val });
        console.log(out);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
      break;
    }
    case "migrate-v6": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./arg-utils-XGBSYGII.js");
      try {
        assertNoUnknownFlags("migrate-v6", rest, /* @__PURE__ */ new Set([
          "--dry-run",
          "--fast",
          "--repair-all",
          "--limit",
          "--db"
        ]));
      } catch (err) {
        if (err instanceof UnknownFlagError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const dryRun = rest.includes("--dry-run");
      const fast = rest.includes("--fast");
      const repairAll = rest.includes("--repair-all");
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const limit = limitArg ? Number(limitArg.split("=")[1]) : void 0;
      const dbArg = rest.find((a) => a.startsWith("--db="));
      const dbPath = dbArg ? dbArg.split("=").slice(1).join("=") : void 0;
      const { executeMigrateV6 } = await import("./migrate-v6-UEHZMQXQ.js");
      const result = await executeMigrateV6({ dryRun, dbPath, limit, fast, repairAll });
      process.stdout.write(`migrated=${result.migrated} resurrected=${result.resurrected} skipped=${result.skipped}
`);
      return;
    }
    case "migrate-v7": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./arg-utils-XGBSYGII.js");
      try {
        assertNoUnknownFlags("migrate-v7", rest, /* @__PURE__ */ new Set([
          "--dry-run",
          "--limit",
          "--db"
        ]));
      } catch (err) {
        if (err instanceof UnknownFlagError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const dryRun = rest.includes("--dry-run");
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : void 0;
      const dbArg = rest.find((a) => a.startsWith("--db="));
      const dbPath = dbArg ? dbArg.split("=").slice(1).join("=") : void 0;
      const { executeMigrateV7 } = await import("./migrate-v7-UP445MKW.js");
      await executeMigrateV7({ dryRun, dbPath, limit, cwd: process.cwd() });
      return;
    }
    case "migrate": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./arg-utils-XGBSYGII.js");
      try {
        assertNoUnknownFlags("migrate", rest, /* @__PURE__ */ new Set(["--dry-run"]));
      } catch (err) {
        if (err instanceof UnknownFlagError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const dryRun = rest.includes("--dry-run");
      const { executeMigrate } = await import("./migrate-v1-to-v2-FCAFODBT.js");
      const r = await executeMigrate({ dryRun });
      process.stdout.write(`Phase 1 \u2192 v2 \u8FC1\u79FB:
`);
      process.stdout.write(`  \u8BFB\u53D6\u6761\u76EE: ${r.readEntries}
`);
      process.stdout.write(`    personal: ${r.byScope.personal}
`);
      process.stdout.write(`    team: ${r.byScope.team}
`);
      process.stdout.write(`    global: ${r.byScope.global}
`);
      if (dryRun) {
        process.stdout.write(`
(dry-run \u6A21\u5F0F\uFF0C\u672A\u5199\u5165 SQLite)
`);
      } else {
        process.stdout.write(`  \u5199\u5165: ${r.written} \u6761; \u62D2\u7EDD: ${r.rejected} \u6761
`);
        if (r.rejectionLog.length > 0) {
          for (const entry of r.rejectionLog) {
            process.stderr.write(`  rejected ${entry.id}: ${entry.reason}
`);
          }
        }
      }
      return;
    }
    case "scan-errors": {
      const scanOpts = parseScanErrorsArgs(rest);
      const output = await executeScanErrors(scanOpts);
      if (output) process.stdout.write(output);
      return;
    }
    case "review-candidates": {
      const reviewOpts = parseReviewCandidatesArgs(rest);
      const output = await executeReviewCandidates(reviewOpts);
      if (output) process.stdout.write(output);
      return;
    }
    case "team-export": {
      const result = executeTeamExport(parseTeamExportArgs(rest));
      process.stdout.write(result.output);
      if (!result.ok) process.exit(1);
      return;
    }
    case "team-import": {
      const result = executeTeamImport(parseTeamImportArgs(rest));
      process.stdout.write(result.output);
      if (!result.ok) process.exit(1);
      return;
    }
    case "sync": {
      let syncArgs;
      try {
        syncArgs = parseGitSyncArgs(rest);
      } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
        process.exit(1);
        return;
      }
      const syncOpts = { ...syncArgs, cwd: syncArgs.cwd ?? process.cwd() };
      const syncResult = syncArgs.subcommand === "push" ? executeGitSyncPush(syncOpts) : executeGitSyncPull(syncOpts);
      process.stdout.write(syncResult.output + "\n");
      if (!syncResult.ok) process.exit(1);
      return;
    }
    case "pr-cycle": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: teamagent pr-cycle [--pr=N] [--wait-ms=300000] [--dry-run]\n\nOptions:\n  --pr=N           Target existing PR number instead of creating one\n  --no-create      Skip PR creation; locate current branch PR\n  --wait-ms=N      Wait N ms before checking review (default 300000)\n  --dry-run        Preview commands without running them\n  --base=BRANCH    Base branch for new PR\n  --title=TITLE    PR title\n  --body=BODY      PR body\n\nCreates/locates a PR, waits, then checks review. Blocks if Codex review\nfinds issues requiring doc/rule updates before code changes.\n"
        );
        return;
      }
      let opts;
      try {
        opts = parsePrCycleArgs(rest);
      } catch (err) {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
        process.exit(1);
        return;
      }
      const result = await executePrCycle(opts);
      if (result.blocked) {
        process.stderr.write(result.output);
        process.exit(2);
        return;
      }
      process.stdout.write(result.output);
      return;
    }
    case "doctor": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(renderDoctorHelp());
        return;
      }
      const opts = parseDoctorArgs(rest);
      const result = await executeDoctor({ ...opts, cwd: opts.cwd ?? process.cwd() });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else if (!opts.postinstall || !result.allPassed) {
        process.stdout.write(renderDoctorResult(result));
      }
      if (!result.allPassed) process.exit(1);
      return;
    }
    case "install-plugins": {
      const opts = parseInstallPluginsArgs(rest);
      const result = await executeInstallPlugins(opts);
      process.stdout.write(renderInstallPluginsResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "warmup": {
      const { runWarmup } = await import("./warmup-BG43KCQI.js");
      let stateFilePath;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--write-state" && rest[i + 1]) {
          stateFilePath = rest[i + 1];
          i++;
        } else if (rest[i]?.startsWith("--write-state=")) {
          stateFilePath = rest[i].slice("--write-state=".length);
        }
      }
      const result = await runWarmup({ stateFilePath });
      process.exit(result.ok ? 0 : 1);
    }
    case "migrate-auto": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./arg-utils-XGBSYGII.js");
      try {
        assertNoUnknownFlags("migrate-auto", rest, /* @__PURE__ */ new Set([]));
      } catch (err) {
        if (err instanceof UnknownFlagError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const { runMigrateAuto } = await import("./migrate-auto-PNP3F6GW.js");
      const r = await runMigrateAuto();
      process.stderr.write(JSON.stringify(r, null, 2) + "\n");
      process.exit(r.ok ? 0 : 1);
    }
    case "update": {
      const { runUpdateCommand, parseUpdateArgs } = await import("./update-M7ZX6U4B.js");
      const { sub, rest: subRest } = parseUpdateArgs(rest);
      const r = await runUpdateCommand(sub, subRest);
      process.stdout.write(r.output);
      process.exit(r.ok ? 0 : 1);
    }
    case "whatsnew": {
      const { executeWhatsNew, parseWhatsNewArgs } = await import("./whatsnew-OJRC7JGR.js");
      const opts = parseWhatsNewArgs(rest);
      const r = executeWhatsNew(opts);
      process.stdout.write(r.output);
      process.exit(r.ok ? 0 : 1);
    }
    case "pair": {
      const parsed = parsePairArgs(rest);
      if (parsed.subcommand === "capsule") {
        const result = executePairCapsule(parsed.options);
        process.stdout.write(renderPairCapsuleResult(result));
        return;
      }
      if (parsed.subcommand === "accept") {
        const result = executePairAccept(parsed.options);
        process.stdout.write(renderPairAcceptResult(result));
        return;
      }
      if (parsed.subcommand === "knock") {
        const opts = parsed.options;
        const result = executePairKnock(opts);
        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        } else {
          process.stdout.write(renderPairKnockResult(result));
        }
        if (!result.ok) process.exit(1);
        return;
      }
      const book = executePairList(parsed.options);
      if (parsed.options.json) {
        process.stdout.write(JSON.stringify(book, null, 2) + "\n");
      } else {
        process.stdout.write(renderPairList(book));
      }
      return;
    }
    case "reclassify": {
      if (rest.includes("--help") || rest.includes("-h") || rest[0] === "--help" || rest[0] === "-h") {
        process.stdout.write(
          "Usage:\n  teamagent reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n  teamagent reclassify rollback --audit <audit-id>\n\nSubcommands:\n  apply      Apply a reclassification plan to rule channel/enforcement in knowledge.db\n  rollback   Reverse a previous apply using its audit-id\n\nOptions for apply:\n  --plan=PATH      JSON plan file produced by scripts/reclassify-rules.ts\n  --dry-run        Preview without writing to DB\n  --min-conf=N     Minimum confidence threshold (default 0.7)\n\nOptions for rollback:\n  --audit=ID       Audit-id from a previous apply\n\nReclassifies rules by scope, changing channel and enforcement fields.\n"
        );
        return;
      }
      const sub = rest[0];
      const subArgs = rest.slice(1);
      const { runReclassifyApply, runReclassifyRollback } = await import("./reclassify-OHWDWLR3.js");
      if (sub === "apply") {
        const planIdx = subArgs.findIndex((a) => a === "--plan");
        const planFile = planIdx >= 0 ? subArgs[planIdx + 1] : void 0;
        if (!planFile) {
          process.stderr.write("Usage: teamagent reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n");
          process.exit(1);
        }
        const dryRun = subArgs.includes("--dry-run");
        const minConfArg = subArgs.find((a) => a.startsWith("--min-conf="));
        const minConfidence = minConfArg ? parseFloat(minConfArg.split("=")[1]) : 0.7;
        runReclassifyApply({ plan: planFile, dryRun, minConfidence });
        return;
      }
      if (sub === "rollback") {
        const auditIdx = subArgs.findIndex((a) => a === "--audit");
        const auditId = auditIdx >= 0 ? subArgs[auditIdx + 1] : void 0;
        if (!auditId) {
          process.stderr.write("Usage: teamagent reclassify rollback --audit <audit-id>\n");
          process.exit(1);
        }
        runReclassifyRollback({ auditId });
        return;
      }
      process.stderr.write(
        "Usage:\n  teamagent reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n  teamagent reclassify rollback --audit <audit-id>\n"
      );
      process.exit(1);
      return;
    }
    case void 0: {
      const { runFirstRunWizard } = await import("./first-run-S66W5IEI.js");
      await runFirstRunWizard();
      return;
    }
    case "--help":
    case "-h":
    case "help": {
      const showAll = isShowAll(rest);
      const fullHelpLines = [
        "teamagent \u2014 TeamAgent CLI",
        "",
        "\u7528\u6CD5:",
        "  teamagent try                    30 \u79D2\u4E00\u952E\u4F53\u9A8C\uFF1A\u4F9D\u6B21\u64AD\u653E 5 \u4E2A\u7ECF\u5178 hook \u62E6\u622A\u573A\u666F\uFF08\u9996\u6B21\u5B89\u88C5\u63A8\u8350\u5165\u53E3\uFF09",
        "  teamagent skeleton-demo          M0 Walking Skeleton \u6F14\u793A",
        "  teamagent m5-infect [--project-root=<path>] [--author=<name>]",
        "                                   [M5-A] \u628A TeamAgent \u75C5\u6BD2\u5F0F\u5951\u7EA6\u5199\u5165\u9879\u76EE\uFF08\u5E42\u7B49\uFF09",
        "  teamagent m5-bootstrap [--project-root=<path>] [--check]",
        "                                   [M5-A] \u8BFB\u9879\u76EE manifest\uFF0C\u62A5\u544A\u672C\u673A\u4E0E\u5951\u7EA6\u7684\u5DEE\u5F02",
        '  teamagent m5-share [--project-root=<path>] --text="<\u89C4\u5219\u6587\u672C>" [--rule-id=<id>] [--scope=personal|team] [--author=<n>]',
        "                                   [M5-B] \u8DD1\u95F8\u95E8 1+2 \u51B3\u5B9A\u89C4\u5219\u5F52\u5BBF\uFF1Bshareable \u7684\u5199\u5230 .teamagent/team/",
        "  teamagent m5-sync [--project-root=<path>]",
        "                                   [M5-C] \u8BFB .teamagent/team/ \u6240\u6709 claim\uFF0CLWW \u5408\u5E76\u62A5\u544A\u56E2\u961F\u89C4\u5219\u96C6",
        "  teamagent m5-delete --rule-id=<id> [--by=<n>] [--reason=<text>]",
        "                                   [M5-C] \u5199 tombstone\uFF08\u4EFB\u610F\u4EBA\u5220\u4EFB\u610F\u89C4\u5219\uFF09",
        "  teamagent m5-status [--project-root=<path>]",
        "                                   [M5-D] \u7EFC\u5408\u9762\u677F\uFF1A\u5951\u7EA6 + \u672C\u673A diff + \u56E2\u961F\u89C4\u5219\u96C6\u7EDF\u8BA1",
        "  teamagent m5-publish [--project-root=<path>] [--push]",
        "                                   [M5-E] \u81EA\u52A8 commit .teamagent/team/ \u5F85\u53D8\u5316\uFF08--push \u540C\u65F6\u63A8 origin\uFF09",
        "  teamagent pitfall                \u624B\u52A8\u8BB0\u5F55\u4E00\u6761\u8E29\u5751\u7ECF\u9A8C (\u4EA4\u4E92)",
        "  teamagent pitfall --non-interactive --trigger=... --wrong=... --correct=... --reason=...",
        "                                   \u975E\u4EA4\u4E92\u6A21\u5F0F (\u53EF\u9009: --category=C|E|S|K --tags=a,b --level=personal|team|global --nature=objective|subjective)",
        "  teamagent stats [--stuck-in-promotion] [--stuck-days=N] [--explain=<id>]",
        "                                   \u5C55\u793A\u77E5\u8BC6\u5E93\u7EDF\u8BA1\uFF1B--stuck-in-promotion \u5217\u51FA\u5361\u5728 probation \u8D85 N \u5929\u7684\u89C4\u5219",
        `  teamagent demo hook <tool> <k=v>...    [advanced] \u79BB\u7EBF\u6A21\u62DF PreToolUse hook\uFF08\u591A\u5B57\u6BB5\u8BF7\u7528\u7A7A\u683C\u5206\u9694\u591A\u4E2A slot\uFF0C\u6216\u4F20\u5355\u4E2A JSON\uFF1A'{"file_path":"a","content":"b"}'\uFF09`,
        "                                   \u4F8B\uFF1Ateamagent demo hook Bash 'command=npm install moment'",
        "                                   \u4F8B\uFF1Ateamagent demo hook Write file_path=a.js content='console.log(1)'",
        "  teamagent install-hook           \u628A PreToolUse hook \u6CE8\u518C\u5230\u5F53\u524D\u9879\u76EE .claude/settings.local.json",
        "  teamagent uninstall-hook         \u79FB\u9664 PreToolUse hook \u6CE8\u518C",
        "  teamagent install-user-hook      \u628A SessionStart hook \u6CE8\u518C\u5230 ~/.claude/settings.json",
        "                                   (\u6253\u5F00\u4EFB\u4F55\u65B0\u9879\u76EE\u65F6\u81EA\u52A8 init, \u4E00\u6B21\u88C5\u6C38\u4E45\u751F\u6548)",
        "  teamagent uninstall-user-hook    \u79FB\u9664\u7528\u6237\u7EA7 SessionStart hook \u6CE8\u518C",
        "  teamagent analyze [--session=<id|path>] [--verbose] [--commit]",
        "                                   \u5206\u6790 Claude Code \u4F1A\u8BDD\u65E5\u5FD7\uFF0C\u8BC6\u522B\u7EA0\u6B63\u65F6\u523B+\u6210\u529F\u4FE1\u53F7",
        "                                   --commit: \u901A\u8FC7 LLM \u63D0\u53D6\u6210\u77E5\u8BC6\u6761\u76EE\u5E76\u5199\u5165\u77E5\u8BC6\u5E93 + \u66F4\u65B0 Skills + \u8C03\u5EA6 docs propagation",
        "  teamagent review [N] [--scope=personal|team|global]",
        "                                   \u5217\u51FA\u6700\u8FD1 N \u6761\u77E5\u8BC6\uFF08\u9ED8\u8BA4 10\uFF09\uFF0C\u4F9B\u4EBA\u5DE5\u590D\u6838",
        "  teamagent init [--dry-run] [--structure] [--skip-hook] [--install-plugins] [--target=claude|codex|both]",
        "                                   \u4E00\u952E\u5B89\u88C5\u5230\u5F53\u524D\u9879\u76EE\uFF1A\u5EFA\u76EE\u5F55 + \u6CE8\u5165\u5143\u539F\u5219 + \u6CE8\u518C\u96C6\u6210 + \u5BFC\u51FA Skills",
        "                                   \u9ED8\u8BA4 target=claude\uFF1Bcodex \u4F1A\u521B\u5EFA .codex/skills \u8F6F\u94FE\u63A5\u4E14\u4E0D\u6CE8\u518C Claude hook",
        "                                   --structure: opt-in\uFF0C\u4ECE CLAUDE.md/AGENTS.md/.cursorrules \u8DD1 LLM \u7ED3\u6784\u5316\u5BFC\u5165\uFF08\u6D88\u8017\u8BA2\u9605\u989D\u5EA6\uFF09\uFF1B\u9ED8\u8BA4\u4E0D\u5BFC\u5165",
        "                                   --install-plugins: \u540C\u65F6\u6CE8\u518C\u56E2\u961F\u6807\u914D\u63D2\u4EF6\uFF08opt-in\uFF0C\u6539\u5199\u7528\u6237\u5168\u5C40 settings\uFF09",
        "                                   TEAMAGENT_VERBOSE_INIT=1: \u5728\u6210\u529F\u8F93\u51FA\u4E2D\u6062\u590D 4-step \u4E0B\u4E00\u6B65\u5217\u8868 + plugin tip + \u{1F195} \u672C\u6B21\u65B0\u589E tail",
        "  teamagent install-codex [--dry-run] [--structure]",
        "                                   Codex \u5FEB\u6377\u5B89\u88C5\uFF1A\u5BFC\u51FA Skills\uFF0C\u5E76\u521B\u5EFA .codex/skills \u8F6F\u94FE\u63A5",
        "                                   --structure: \u540C init\uFF0Copt-in LLM \u7ED3\u6784\u5316\u5BFC\u5165\uFF1B\u9ED8\u8BA4\u4E0D\u5BFC\u5165\u3001\u4E0D\u6D88\u8017\u8BA2\u9605\u989D\u5EA6",
        "  teamagent doctor [--fix [--dry-run]] [--json] [--cwd=<path>] [--help]",
        "                                   \u8BCA\u65AD\u5B89\u88C5\u73AF\u5883\uFF08Node\u7248\u672C/Claude Code/sqlite-vec/Hook/CLAUDE.md\uFF09",
        "                                   --fix: \u81EA\u52A8\u4FEE\u590D\u80FD\u4FEE\u7684\u9879\uFF1B\u5199 CLAUDE.md \u524D\u5148\u5907\u4EFD\u5230 ~/.teamagent/backups/",
        "                                          - \u65E7\u7248 TEAMAGENT:START \u751F\u6210\u5757\uFF08\u5265\u79BB\uFF09",
        "                                          - \u77E5\u8BC6\u5E93\u672A\u521D\u59CB\u5316\uFF08teamagent init\uFF09",
        "                                          - hook \u672A\u6CE8\u518C\uFF08teamagent install-hook\uFF09",
        "                                          \u914D --dry-run \u9884\u89C8 unified diff\uFF0C\u4E0D\u5199\u5165\uFF1B\u8BE6\u7EC6\u5E2E\u52A9\u89C1 `teamagent doctor --help`",
        "                                   --json: \u8F93\u51FA\u673A\u5668\u53EF\u8BFB JSON\uFF08\u542B fixOutcomes \u4E0E dryRun \u5B57\u6BB5\uFF09",
        "  teamagent install-plugins [--dry-run] [--only=a,b] [--scope=user|project|local]",
        "                                   \u6CE8\u518C\u56E2\u961F\u6807\u914D plugins\uFF08\u4E0E .claude/settings.json:enabledPlugins \u540C\u6B65\uFF09",
        "                                   \u901A\u8FC7 'claude plugin marketplace add' + 'claude plugin install' \u8C03 CC CLI",
        "                                   \u9ED8\u8BA4\u88C5\u5168\u90E8\uFF1B--only \u9650\u5B9A\u5B50\u96C6\uFF1B--dry-run \u53EA\u9884\u89C8",
        "  teamagent pair capsule --name=<device> --host=<host> [--user=<user>] [--out=<file>]",
        "                                   \u751F\u6210\u77ED\u671F teammate \u914D\u5BF9\u80F6\u56CA\uFF08\u4E0D\u5305\u542B SSH \u79C1\u94A5\uFF09",
        "  teamagent pair accept <capsule-file|token> [--local-name=<device>]",
        "                                   \u63A5\u53D7\u80F6\u56CA\uFF0C\u5199\u5165 peer \u8D26\u672C\u3001SSH config \u53D7\u7BA1\u5757\u548C\u6536\u636E",
        "  teamagent pair knock <peer> [--json] [--simulate]",
        "                                   \u901A\u8FC7 SSH \u9A8C\u8BC1\u914D\u5BF9\uFF1B--simulate \u7528\u4E8E\u79BB\u7EBF\u9A8C\u6536",
        "  teamagent pair list              \u5217\u51FA\u5DF2\u914D\u5BF9 teammate",
        "  teamagent disable                \u4E34\u65F6\u7981\u7528 Hook\uFF08\u4FDD\u7559\u6570\u636E\uFF09",
        "  teamagent enable                 \u91CD\u65B0\u542F\u7528 Hook",
        "  teamagent uninstall [--delete-data] [--dry-run]",
        "                                   \u5B8C\u5168\u5378\u8F7D\uFF1A\u79FB\u9664 Hook \u6CE8\u518C + \u6E05\u6389 CLAUDE.md \u533A\u5757\uFF1B\u52A0 --delete-data \u540C\u65F6\u6E05\u6570\u636E",
        "  teamagent calibrate [--days=7] [--dry-run]",
        "                                   \u6839\u636E events.jsonl \u91CD\u7B97 confidence + \u81EA\u52A8\u5F52\u6863\u4F4E\u5206\u6761\u76EE",
        "  teamagent verify [--report=path]",
        "  teamagent verify-anchors [--claude-md=<path>] [--docs-root=<path>] [--json]",
        "                                   \u9759\u6001\u6821\u9A8C CLAUDE.md canned-answer anchor \u5361\u7684\u7ED3\u6784\u5B8C\u6574\u6027",
        "                                   (a) \u58F0\u660E\u7684 grep substring \u662F\u5426\u771F\u51FA\u73B0\u5728 anchor sentence\uFF1B",
        "                                   (b) \u5168\u90E8 N \u4E2A\u951A\u70B9 \u7684 N \u662F\u5426\u5BF9\u5F97\u4E0A\uFF1B",
        "                                   (c) \u5F15\u7528\u7684 docs/*.md \u8DEF\u5F84\u662F\u5426\u5B58\u5728\uFF1B",
        "                                   (d) anchor sentence \u662F\u5426\u552F\u4E00\u4E0D\u91CD\u590D\u3002",
        "                                   \u8DD1 5 \u4E2A\u9A8C\u8BC1\u573A\u666F\uFF08\u8E29\u5751\u2192\u5B66\u4E60\u2192\u907F\u5751\uFF09\uFF0C\u8F93\u51FA PRR/KP \u6307\u6807",
        "  teamagent e2e-evaluate [--json] [--keep-temp]",
        "                                   \u771F\u5B9E SQLite + analyze + compile + PreToolUse \u6D4B\u8BC4\u5B66\u4E60\u3001\u89E6\u53D1\u3001\u8BEF\u89E6\u53D1\u548C\u65B0\u6210\u5458\u53EF\u89C1\u6027",
        "  teamagent recording --help",
        "                                   Recording Memory \u5BFC\u5165\u3001\u68C0\u7D22\u3001\u6CE8\u5165\u3001\u6307\u6807\u548C golden benchmark",
        "  teamagent daily [--projects-root=PATH] [--archive] [--format=json|context] [--help]",
        "                                   [issue-371] \u8DE8\u9879\u76EE\u626B ~/.claude/projects \u4ECA\u5929\u6D3B\u52A8\uFF0C\u8F93\u51FA member\xD7project \u4E00\u53E5\u8BDD\u65E5\u62A5\u9AA8\u67B6",
        "  teamagent dogfood-report [--output=path]",
        "                                   \u626B events.jsonl + knowledge.jsonl + git log\uFF0C\u81EA\u52A8\u751F\u6210\u81EA\u4E3E\u62A5\u544A",
        "  teamagent bug-report [--out=path] [--stdout]",
        "                                   \u751F\u6210\u53EF\u9644\u5230 issue \u7684\u8BCA\u65AD\u62A5\u544A\uFF1A\u7CFB\u7EDF\u4FE1\u606F + hook \u914D\u7F6E + \u539F\u59CB\u65E5\u5FD7\uFF08\u81EA\u52A8\u8131\u654F\uFF09",
        "  teamagent dashboard --watch [--open] [--port=8787] [--interval=2s]",
        "                                   \u542F\u52A8\u5B9E\u65F6 HTML dashboard\uFF1A\u751F\u6210 docs/dashboard.html\uFF0C\u5468\u671F\u5237\u65B0\u771F\u5B9E\u89C4\u5219/\u4E8B\u4EF6\u6570\u636E\u5E76\u672C\u5730\u670D\u52A1",
        "  teamagent dashboard --once",
        "                                   \u53EA\u751F\u6210\u4E00\u6B21 docs/dashboard.html\uFF0C\u4E0D\u542F\u52A8\u670D\u52A1\u5668",
        "  teamagent compile [--dry-run] [--skills-only] [--markdown-only] [--force] [--legacy-claude-md] [--target=claude|codex|both]",
        "                                   \u7F16\u8BD1 Agent Skills (stable+)\uFF1BCLAUDE.md \u89C4\u5219\u5757\u8F93\u51FA\u5DF2\u7981\u7528",
        "                                   --legacy-claude-md: \u663E\u5F0F\u6062\u590D\u65E7 CLAUDE.md managed block \u8F93\u51FA",
        "                                   --dry-run: \u9884\u89C8\u5C06\u5199/\u5220\u54EA\u4E9B\u6587\u4EF6\uFF0C\u4E0D\u5B9E\u9645\u5199\u5165",
        "                                   --skills-only / --markdown-only: legacy flags",
        "  teamagent docs-propagate --rule-id=<id>",
        "                                   \u5C06\u65B0\u89C4\u5219\u81EA\u7136\u4F20\u64AD\u5230 docs/ \u5E76\u7528 cheap runner \u9A8C\u8BC1",
        "  teamagent config stop-mode <sync|async>  \u5207\u6362 Stop hook \u8FD0\u884C\u6A21\u5F0F\uFF08\u9ED8\u8BA4 sync\uFF09",
        "  teamagent config show                    \u67E5\u770B\u5F53\u524D\u914D\u7F6E",
        "  teamagent scan-errors [--mode=efficient|full] [--since=<duration|ISO>] [--min-freq=N] [--dry-run] [--quiet]",
        "                                   \u81EA\u52A8\u91C7\u96C6\u9519\u8BEF\u4FE1\u53F7 \u2192 \u63D0\u53D6\u5019\u9009\u89C4\u5219 \u2192 \u5199\u5165\u5019\u9009\u961F\u5217",
        "  teamagent review-candidates [--limit=N] [--approve-scope=personal|team|global]",
        "                                   \u4EA4\u4E92\u5F0F\u5BA1\u6838\u5019\u9009\u89C4\u5219\uFF1A[a]\u6279\u51C6 [r]\u62D2\u7EDD [s]\u8DF3\u8FC7 [q]\u9000\u51FA\uFF1B\u53EF\u628A\u6279\u51C6\u9879\u63D0\u5347\u4E3A\u672C\u5730 team scope",
        "  teamagent team-export [--out=path]",
        "                                   \u5BFC\u51FA\u672C\u5730 active team scope \u89C4\u5219\u5230 JSON\uFF1B\u5BFC\u51FA\u524D\u6267\u884C\u9690\u79C1\u5B88\u95E8",
        "  teamagent team-import [--file=path]",
        "                                   \u4ECE team-export JSON \u5BFC\u5165\u672C\u5730 team scope \u89C4\u5219\uFF0C\u5DF2\u5B58\u5728 id \u4F1A\u8DF3\u8FC7",
        "  teamagent pr-cycle [--pr=N] [--wait-ms=300000] [--dry-run]",
        "                                   \u521B\u5EFA/\u5B9A\u4F4D PR\uFF0C\u7B49\u5F85\u540E\u68C0\u67E5 review\uFF1B\u6709\u53CD\u9988\u65F6\u8981\u6C42\u5148\u66F4\u65B0\u6587\u6863/\u89C4\u5219\u5E76\u7528 claudefast/codexfastg \u9A8C\u8BC1\u7B54\u6848",
        "  teamagent migrate-v6 [--dry-run] [--limit=N] [--db=<path>]",
        "                                   \u8FC1\u79FB\u65E7\u89C4\u5219\uFF08trigger_description \u4E3A\u7A7A\uFF09\u901A\u8FC7 LLM \u751F\u6210\u53CC\u63CF\u8FF0\uFF0C\u5E76\u5199\u5165 vec0 \u548C FTS5",
        "  teamagent migrate-v7 [--dry-run] [--limit=N] [--db=<path>]",
        "                                   \u6279\u91CF\u4E3A\u5B58\u91CF\u89C4\u5219\u751F\u6210 tool_context_description\uFF0C\u5E76\u5199\u5165 knowledge_tool_vec",
        "  teamagent pack list [--json]",
        "                                   \u5217\u51FA\u5DF2\u5B89\u88C5 / \u53EF\u7528\u7684 stack packs\uFF08ADR 0002 \u2014 agent \u51B3\u5B9A\u88C5\u54EA\u4E9B\uFF09",
        "  teamagent pack add <names>       \u4F8B pack add frontend-js,ops-safety\uFF1B\u4ECE seed/packs/<name>.{jsonl,meta.json} \u8BFB\u53D6\u5E76\u6CE8\u5165\u7528\u6237\u5168\u5C40 store",
        "  teamagent pack remove <names>    \u6309 tag pack:<name> \u8FC7\u6EE4\u5220\u9664\u5168\u5C40 store \u4E2D\u5BF9\u5E94\u89C4\u5219",
        "  teamagent ingest --from-insights <path> | --from-audit | --from-pr <n>",
        "                   | --from-git [--since=30d] | --from-ci [--since=30d] | --from-candidates <path>",
        "                                   \u591A\u6E90\u6444\u5165\uFF1AClaude /insights / npm audit / PR review / git hotspot / CI failure",
        "                                   \u534A\u81EA\u52A8\u6E90\u52A0 --dry-run \u53EA\u4EA7\u51FA\u5019\u9009 md \u4F9B\u4EBA\u5DE5\u52FE\u9009",
        "",
        "\u73AF\u5883\u53D8\u91CF:",
        "  TEAMAGENT_VISIBILITY=silent|smart|verbose    \u5F52\u56E0\u6E32\u67D3\u6A21\u5F0F\uFF08\u9ED8\u8BA4 verbose\uFF09",
        ""
      ];
      process.stdout.write(
        showAll ? fullHelpLines.join("\n") : buildStorefrontHelp()
      );
      return;
    }
    default:
      process.stderr.write(`\u672A\u77E5\u547D\u4EE4: ${command}
`);
      process.exit(1);
  }
}
main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
