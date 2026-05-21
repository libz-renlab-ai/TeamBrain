import {
  buildFallbackDescriptions
} from "./chunk-JIMRSSDR.js";
import {
  InMemoryAttributionBus,
  StdoutRenderer,
  XenovaRuleEmbedder,
  makeSkillCompiler
} from "./chunk-NPSW37EI.js";
import {
  DualLayerStore,
  syncRuleVectors,
  syncToolVector
} from "./chunk-MXJDRQEB.js";
import {
  openDb
} from "./chunk-EHS4WAHC.js";
import {
  runM5Share
} from "./chunk-3J4EETNE.js";
import {
  runCompile
} from "./chunk-4Y7LCJVR.js";
import {
  computeEnforcement,
  parseVisibilityMode
} from "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/pitfall.ts
init_esm_shims();
import os2 from "os";
import path2 from "path";
import fs2 from "fs";

// ../cli/src/commands/docs-propagate.ts
init_esm_shims();
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
function resolvePaths(opts) {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  return {
    cwd,
    projectDbPath: opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    logDir: opts.logDir ?? path.join(cwd, ".teamagent", "doc-propagation")
  };
}
function shellQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function defaultRunner(env, cwd) {
  const command = env.TEAMAGENT_DOCS_RUNNER ?? "claudefast -p";
  const timeoutMs = Number.parseInt(env.TEAMAGENT_DOCS_RUNNER_TIMEOUT_MS ?? "", 10) || 18e4;
  return async (prompt) => runPromptCommand(command, prompt, cwd, env, timeoutMs);
}
function buildDocsRunnerCommand(commandTemplate, prompt) {
  const promptMarker = "__TEAMAGENT_DOCS_PROMPT_ARG__";
  const template = commandTemplate.includes("{prompt}") ? commandTemplate.replaceAll("{prompt}", promptMarker) : commandTemplate;
  const parsed = parseCommandLine(template);
  if (parsed.length === 0) {
    throw new Error("docs runner command is empty");
  }
  const replaced = parsed.map((part) => part.replaceAll(promptMarker, prompt));
  const command = replaced[0];
  const args = replaced.slice(1);
  return {
    command,
    args: commandTemplate.includes("{prompt}") ? args : [...args, prompt]
  };
}
function parseCommandLine(input) {
  const args = [];
  let current = "";
  let quote;
  let tokenStarted = false;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) {
        quote = void 0;
      } else {
        current += ch;
      }
      tokenStarted = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += ch;
    tokenStarted = true;
  }
  if (quote) {
    throw new Error("docs runner command has an unterminated quote");
  }
  if (tokenStarted) args.push(current);
  return args;
}
function runPromptCommand(commandTemplate, prompt, cwd, env, timeoutMs) {
  const { command, args } = buildDocsRunnerCommand(commandTemplate, prompt);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`docs runner timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`docs runner exited ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });
  });
}
function ruleUseWhen(entry) {
  return entry.trigger.trim();
}
function ruleDoWhenUsed(entry) {
  return [entry.correct_pattern.trim(), entry.reasoning.trim()].filter(Boolean).join("\uFF1B");
}
function buildUpdatePrompt(entries, attempt, previous) {
  const ruleList = entries.map((e) => [
    `- id: ${e.id}`,
    `  when: ${ruleUseWhen(e)}`,
    `  please: ${ruleDoWhenUsed(e)}`
  ].join("\n")).join("\n");
  const retryContext = previous ? [
    "",
    "Previous verification failed. Fix the documentation gap below:",
    JSON.stringify(previous.checks.map((c) => ({ ruleId: c.ruleId, reason: c.reason })), null, 2)
  ].join("\n") : "";
  return [
    "Update this repository's concise project documentation so a future coding agent naturally follows the learned behavior.",
    "",
    "Rules:",
    "- Prefer updating an existing relevant file under docs/ if one clearly applies.",
    "- If no relevant doc exists, create or update docs/knowledge/INDEX.md.",
    "- Only touch root CLAUDE.md for a short index pointer when necessary.",
    "- Never add a TEAMAGENT:START/END managed block, and never dump generated rule bullets into CLAUDE.md.",
    "- Keep wording natural and concise; document the behavior, not the database row.",
    "",
    `Attempt: ${attempt}`,
    "Learned behavior to propagate:",
    ruleList,
    retryContext
  ].join("\n");
}
function buildJudgePrompt(entry, answer) {
  return [
    "Judge whether the answer teaches the expected behavior.",
    'Return only JSON: {"pass": boolean, "reason": string}',
    "",
    `When: ${ruleUseWhen(entry)}`,
    `Expected behavior: ${ruleDoWhenUsed(entry)}`,
    "",
    "Answer:",
    answer
  ].join("\n");
}
function buildAnswerPrompt(entry) {
  return [
    "Answer from this repository's documentation and project instructions.",
    "If the docs do not teach the behavior, say so plainly.",
    "",
    `Question: what should a coding agent do when ${ruleUseWhen(entry)}?`
  ].join("\n");
}
function parseJudge(raw) {
  const fenced = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const json = start >= 0 && end >= start ? fenced.slice(start, end + 1) : fenced;
  try {
    const parsed = JSON.parse(json);
    return {
      pass: parsed.pass === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : ""
    };
  } catch {
    return { pass: false, reason: `judge returned non-JSON: ${raw.slice(0, 160)}` };
  }
}
function writeLog(paths, result) {
  fs.mkdirSync(paths.logDir, { recursive: true });
  fs.writeFileSync(result.logPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
}
async function executeDocsPropagate(opts) {
  const paths = resolvePaths(opts);
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const ruleIds = Array.from(new Set(opts.ruleIds.map((id) => id.trim()).filter(Boolean)));
  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  const entries = ruleIds.map((id) => store.getById(id)).filter((e) => e !== void 0);
  store.close();
  const missingRuleIds = ruleIds.filter((id) => !entries.some((e) => e.id === id));
  const safeIds = (ruleIds.length > 0 ? ruleIds : ["none"]).join("_").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80);
  const logPath = path.join(
    paths.logDir,
    `${now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${safeIds}.json`
  );
  const result = {
    ok: false,
    ruleIds,
    missingRuleIds,
    attempts: [],
    logPath
  };
  if (entries.length === 0) {
    result.attempts.push({ attempt: 0, checks: [], error: "no matching rules found" });
    writeLog(paths, result);
    return result;
  }
  const env = opts.env ?? process.env;
  const runner = opts.runner ?? defaultRunner(env, paths.cwd);
  const maxAttempts = opts.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLog = { attempt, checks: [] };
    try {
      attemptLog.updateOutput = await runner(
        buildUpdatePrompt(entries, attempt, result.attempts.at(-1)),
        { kind: "update-docs", attempt, ruleIds }
      );
      for (const entry of entries) {
        const answer = await runner(
          buildAnswerPrompt(entry),
          { kind: "answer", attempt, ruleIds }
        );
        const judgeRaw = await runner(
          buildJudgePrompt(entry, answer),
          { kind: "judge", attempt, ruleIds }
        );
        const judge = parseJudge(judgeRaw);
        attemptLog.checks.push({
          ruleId: entry.id,
          answer,
          pass: judge.pass,
          reason: judge.reason
        });
      }
    } catch (err) {
      attemptLog.error = String(err).slice(0, 400);
    }
    result.attempts.push(attemptLog);
    if (missingRuleIds.length === 0 && attemptLog.checks.length === entries.length && attemptLog.checks.every((c) => c.pass)) {
      result.ok = true;
      break;
    }
  }
  writeLog(paths, result);
  return result;
}
function renderDocsPropagationResult(result) {
  const lines = [];
  lines.push(result.ok ? "\u2713 docs propagation verified" : "\u26A0 docs propagation did not verify");
  lines.push(`rules: ${result.ruleIds.join(", ") || "(none)"}`);
  if (result.missingRuleIds.length > 0) {
    lines.push(`missing: ${result.missingRuleIds.join(", ")}`);
  }
  lines.push(`attempts: ${result.attempts.length}`);
  lines.push(`log: ${result.logPath}`);
  return lines.join("\n") + "\n";
}
function parseDocsPropagateArgs(argv) {
  const ruleIds = [];
  let cwd;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rule-id" && argv[i + 1]) {
      ruleIds.push(argv[++i]);
    } else if (a.startsWith("--rule-id=")) {
      ruleIds.push(a.slice("--rule-id=".length));
    } else if (a === "--cwd" && argv[i + 1]) {
      cwd = argv[++i];
    } else if (a.startsWith("--cwd=")) {
      cwd = a.slice("--cwd=".length);
    } else if (!a.startsWith("--")) {
      ruleIds.push(a);
    }
  }
  return { ruleIds, ...cwd ? { cwd } : {} };
}
function scheduleDocsPropagation(ruleIds, opts = {}) {
  const env = opts.env ?? process.env;
  const ids = Array.from(new Set(ruleIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return;
  if (env.TEAMAGENT_DISABLE_DOCS_PROPAGATION === "1") return;
  if (process.env.VITEST === "true" && env.TEAMAGENT_FORCE_DOCS_PROPAGATION !== "1") return;
  const cwd = opts.cwd ?? process.cwd();
  try {
    if (env.TEAMAGENT_DOCS_PROPAGATE_COMMAND) {
      const quotedIds = ids.map((id) => `--rule-id=${shellQuote(id)}`).join(" ");
      const command = `${env.TEAMAGENT_DOCS_PROPAGATE_COMMAND} ${quotedIds} --cwd=${shellQuote(cwd)}`;
      const child = spawn(command, { cwd, shell: true, stdio: "ignore", detached: true, env: { ...process.env, ...env } });
      child.unref();
      return;
    }
    const bin = process.argv[1];
    if (bin?.endsWith(".ts")) {
      const child = spawn("pnpm", ["teamagent", "docs-propagate", ...ids.map((id) => `--rule-id=${id}`), `--cwd=${cwd}`], {
        cwd,
        stdio: "ignore",
        detached: true,
        shell: process.platform === "win32",
        env: { ...process.env, ...env }
      });
      child.on("error", () => {
      });
      child.unref();
    } else if (bin) {
      const child = spawn(process.execPath, [bin, "docs-propagate", ...ids.map((id) => `--rule-id=${id}`), `--cwd=${cwd}`], {
        cwd,
        stdio: "ignore",
        detached: true,
        env: { ...process.env, ...env }
      });
      child.on("error", () => {
      });
      child.unref();
    }
  } catch {
  }
}

// ../cli/src/commands/pitfall.ts
function resolvePaths2(opts) {
  const home = opts.homeDir ?? os2.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    projectDbPath: opts.projectDbPath ?? path2.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path2.join(home, ".teamagent", "global.db"),
    claudeMdPath: opts.claudeMdPath ?? path2.join(cwd, "CLAUDE.md"),
    skillsDir: opts.skillsDir ?? path2.join(home, ".claude", "skills", "teamagent")
  };
}
function generateId(level, ts) {
  const prefix = level === "global" ? "glob" : level === "team" ? "team" : "pers";
  const short = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts.replace(/[-:T.Z]/g, "").slice(0, 14)}-${short}`;
}
function buildEntry(input, now) {
  const rawLevel = input.level ?? "personal";
  const level = rawLevel;
  const nature = input.nature ?? "subjective";
  const confidence = 0.7;
  const enforcement = computeEnforcement(confidence, nature);
  const category = input.category ?? "E";
  const tags = input.tags && input.tags.length > 0 ? input.tags : [category.toLowerCase()];
  return {
    id: generateId(rawLevel, now),
    scope: {
      level,
      ...input.project ? { project: input.project } : {}
    },
    category,
    tags,
    type: input.wrong.trim() === "" ? "practice" : "avoidance",
    nature,
    trigger: input.trigger,
    wrong_pattern: input.wrong,
    correct_pattern: input.correct,
    reasoning: input.reason,
    confidence,
    enforcement,
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: now,
    last_hit_at: "",
    last_validated_at: now,
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical",
    max_tier_ever: "canonical",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0
  };
}
async function executePitfall(input, opts = {}) {
  const paths = resolvePaths2(opts);
  const now = (opts.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();
  const env = opts.env ?? process.env;
  const mode = parseVisibilityMode(env.TEAMAGENT_VISIBILITY);
  fs2.mkdirSync(path2.dirname(paths.projectDbPath), { recursive: true });
  fs2.mkdirSync(path2.dirname(paths.userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  const before = store.getAll().length;
  const entry = buildEntry(input, now);
  store.add(entry);
  let m5Share;
  if (env.TEAMAGENT_M5_AUTOSHARE !== "0") {
    try {
      const cwd = opts.cwd ?? process.cwd();
      const summary = entry.reasoning || entry.correct_pattern || entry.trigger;
      m5Share = await runM5Share({
        projectRoot: cwd,
        text: summary,
        ruleId: entry.id,
        now
      });
    } catch {
    }
  }
  await runCompile({
    store,
    skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir })
  });
  const after = store.getAll().length;
  store.close();
  try {
    const desc = buildFallbackDescriptions({
      trigger: entry.trigger,
      wrong_pattern: entry.wrong_pattern,
      correct_pattern: entry.correct_pattern,
      reasoning: entry.reasoning
    });
    const embedder = opts.embedder ?? new XenovaRuleEmbedder();
    const [tv, pv] = await embedder.embed([desc.trigger_description, desc.pattern_description]);
    if (tv && pv) {
      const vdb = openDb(paths.projectDbPath);
      vdb.prepare(
        "UPDATE knowledge SET trigger_description=?, pattern_description=?, embedder_model_id=? WHERE id=?"
      ).run(desc.trigger_description, desc.pattern_description, "Xenova/multilingual-e5-small", entry.id);
      syncRuleVectors(vdb, entry.id, new Float32Array(tv), new Float32Array(pv));
      vdb.close();
    }
  } catch {
  }
  if (!opts.embedder && process.env.VITEST !== "true" && env.TEAMAGENT_DISABLE_TOOL_CONTEXT !== "1") {
    generateToolContextAsync(entry, paths.projectDbPath).catch(() => {
    });
  }
  try {
    if (opts.docsPropagationScheduler) {
      await opts.docsPropagationScheduler([entry.id]);
    } else {
      scheduleDocsPropagation([entry.id], { cwd: opts.cwd, env });
    }
  } catch {
  }
  const skillMdPath = path2.join(paths.skillsDir, entry.id, "SKILL.md");
  const bus = new InMemoryAttributionBus();
  bus.emit({
    kind: "pitfall.added",
    source: "pitfall",
    knowledgeId: entry.id,
    category: entry.category,
    tag: entry.tags[0] ?? entry.category.toLowerCase(),
    level: entry.scope.level,
    knowledgeCountBefore: before,
    knowledgeCountAfter: after,
    skillMdPath,
    severity: "highlight",
    timestamp: now,
    userFacingValue: entry.type === "avoidance" ? `AI \u9047\u5230 "${entry.wrong_pattern}" \u65F6\u4F1A\u6539\u7528 "${entry.correct_pattern}"\uFF1Bdocs propagation \u5DF2\u8C03\u5EA6` : `AI \u4E0B\u6B21\u5728 "${entry.trigger}" \u573A\u666F\u4F1A\u53C2\u8003: ${entry.correct_pattern}\uFF1Bdocs propagation \u5DF2\u8C03\u5EA6`,
    counterfactual: "\u4F60\u4F1A\u770B\u5230 AI \u7B2C\u4E8C\u6B21\u518D\u8E29\u540C\u4E00\u4E2A\u5751"
  });
  const renderer = new StdoutRenderer();
  return renderer.render(bus.drain(), mode);
}
async function runPitfallInteractive(opts = {}) {
  const readline = await import("readline/promises");
  const { stdin, stdout } = await import("process");
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ask = async (q, fallback = "") => {
    const answer = await rl.question(q);
    return answer.trim() || fallback;
  };
  try {
    stdout.write("\n\u8BB0\u5F55\u4E00\u6761\u8E29\u5751\u7ECF\u9A8C\u2014\u2014\u95EE\u7B54\u5B8C\u6210\u540E\u4F1A\u5199\u5165\u77E5\u8BC6\u5E93 + \u5BFC\u51FA Skill + \u8C03\u5EA6 docs propagation\n\n");
    const trigger = await ask("\u89E6\u53D1\u573A\u666F\uFF08\u4EC0\u4E48\u60C5\u51B5\u4E0B\u4F1A\u8E29\u5230\u8FD9\u4E2A\u5751\uFF1F\uFF09: ");
    const wrong = await ask("\u9519\u8BEF\u505A\u6CD5\uFF08\u7559\u7A7A\u8868\u793A practice \u578B\uFF09: ");
    const correct = await ask("\u6B63\u786E\u505A\u6CD5: ");
    const reason = await ask("\u539F\u56E0: ");
    const categoryRaw = await ask(
      "\u5206\u7C7B [C=\u4EE3\u7801 E=\u5DE5\u7A0B S=\u7B56\u7565 K=\u8BA4\u77E5\uFF0C\u9ED8\u8BA4 E]: ",
      "E"
    );
    const tagsRaw = await ask("\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u53EF\u7A7A\uFF09: ");
    const levelRaw = await ask(
      "\u4F5C\u7528\u57DF [personal/team/global\uFF0C\u9ED8\u8BA4 personal]: ",
      "personal"
    );
    const natureRaw = await ask(
      "\u6027\u8D28 [objective/subjective\uFF0C\u9ED8\u8BA4 subjective]: ",
      "subjective"
    );
    const category = normalizeCategory(categoryRaw);
    const level = normalizeLevel(levelRaw);
    const nature = normalizeNature(natureRaw);
    const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    return await executePitfall(
      { trigger, wrong, correct, reason, category, tags, level, nature },
      opts
    );
  } finally {
    rl.close();
  }
}
function normalizeCategory(raw) {
  const upper = raw.toUpperCase();
  if (upper === "C" || upper === "E" || upper === "S" || upper === "K") return upper;
  return "E";
}
function normalizeLevel(raw) {
  if (raw === "team" || raw === "global") return raw;
  return "personal";
}
function normalizeNature(raw) {
  if (raw === "objective") return "objective";
  return "subjective";
}
function buildToolContextPrompt(entry) {
  return [
    "\u4F60\u662F\u4EE3\u7801\u8D28\u91CF\u89C4\u5219\u5206\u6790\u52A9\u624B\u3002\u7ED9\u5B9A\u4E00\u6761\u7F16\u7A0B\u89C4\u5219\uFF0C\u63CF\u8FF0\u5F53 AI \u4F7F\u7528\u5DE5\u5177\u65F6\uFF0C\u4EC0\u4E48\u6837\u7684\u5177\u4F53\u5DE5\u5177\u64CD\u4F5C\uFF08Bash\u547D\u4EE4\u3001\u6587\u4EF6\u7F16\u8F91\u7B49\uFF09\u4F1A\u89E6\u53D1\u8FD9\u6761\u89C4\u5219\u3002",
    "",
    "\u89C4\u5219\u4FE1\u606F\uFF1A",
    `- \u89E6\u53D1\u573A\u666F: ${entry.trigger}`,
    `- \u9519\u8BEF\u505A\u6CD5: ${entry.wrong_pattern || "(\u65E0)"}`,
    `- \u6B63\u786E\u505A\u6CD5: ${entry.correct_pattern}`,
    `- \u539F\u56E0: ${entry.reasoning}`,
    "",
    "\u75281-2\u53E5\u8BDD\u63CF\u8FF0\uFF1AAI \u4F1A\u6267\u884C\u4EC0\u4E48\u6837\u7684\u5177\u4F53\u5DE5\u5177\u64CD\u4F5C\uFF08\u5982 Bash \u547D\u4EE4\u3001\u5199\u5165\u4EC0\u4E48\u6587\u4EF6\u3001\u7F16\u8F91\u4EC0\u4E48\u4EE3\u7801\uFF09\u624D\u4F1A\u89E6\u53D1\u8FD9\u6761\u89C4\u5219\uFF1F",
    "\u53EA\u63CF\u8FF0\u5DE5\u5177\u64CD\u4F5C\uFF0C\u4E0D\u8981\u8BF4\u573A\u666F\u6216\u539F\u56E0\u3002\u76F4\u63A5\u8F93\u51FA\u63CF\u8FF0\uFF0C\u4E0D\u52A0\u5F15\u53F7\u3002"
  ].join("\n");
}
async function generateToolContextAsync(entry, projectDbPath) {
  const { ClaudeCodeLLMClient, XenovaRuleEmbedder: EmbedderClass, openDb: openDatabase } = await import("./src-F33CQC7S.js");
  const llm = new ClaudeCodeLLMClient({ model: "haiku" });
  const desc = await llm.complete(buildToolContextPrompt(entry));
  if (!desc || desc.trim().length < 5) return;
  const embedder = new EmbedderClass();
  const [vec] = await embedder.embed([desc.trim()]);
  if (!vec) return;
  const vdb = openDatabase(projectDbPath);
  try {
    vdb.prepare(
      "UPDATE knowledge SET tool_context_description = ? WHERE id = ?"
    ).run(desc.trim(), entry.id);
    syncToolVector(vdb, entry.id, new Float32Array(vec));
  } finally {
    vdb.close();
  }
}
var PITFALL_FIELD_MAX = 1e3;
var PitfallValidationError = class extends Error {
  constructor(missing) {
    super(
      `pitfall --non-interactive \u7F3A\u5C11\u5FC5\u586B\u5B57\u6BB5: ${missing.join(", ")}
\u7528\u6CD5: teamagent pitfall --non-interactive --trigger=... --correct=... --reason=... [--wrong=...]`
    );
    this.missing = missing;
    this.name = "PitfallValidationError";
  }
  missing;
};
function parsePitfallArgs(argv) {
  if (!argv.includes("--non-interactive")) return null;
  const getFlag = (name) => {
    const prefix = `--${name}=`;
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : void 0;
  };
  const trigger = (getFlag("trigger") ?? "").trim();
  const wrong = (getFlag("wrong") ?? "").trim();
  const correct = (getFlag("correct") ?? "").trim();
  const reason = (getFlag("reason") ?? "").trim();
  const categoryRaw = getFlag("category");
  let category;
  if (categoryRaw !== void 0) {
    const upper = categoryRaw.toUpperCase();
    if (upper !== "C" && upper !== "E" && upper !== "S" && upper !== "K") {
      throw new PitfallValidationError([`--category \u5FC5\u987B\u662F C/E/S/K \u4E4B\u4E00\uFF0C\u6536\u5230: "${categoryRaw}"`]);
    }
    category = upper;
  }
  const tagsRaw = getFlag("tags");
  const level = getFlag("level");
  const nature = getFlag("nature");
  const project = getFlag("project");
  const missing = [];
  if (!trigger) missing.push("--trigger");
  if (!correct) missing.push("--correct");
  if (!reason) missing.push("--reason");
  if (missing.length > 0) throw new PitfallValidationError(missing);
  const overLong = [];
  if (trigger.length > PITFALL_FIELD_MAX) overLong.push(`--trigger \u957F\u5EA6 ${trigger.length}`);
  if (wrong.length > PITFALL_FIELD_MAX) overLong.push(`--wrong \u957F\u5EA6 ${wrong.length}`);
  if (correct.length > PITFALL_FIELD_MAX) overLong.push(`--correct \u957F\u5EA6 ${correct.length}`);
  if (reason.length > PITFALL_FIELD_MAX) overLong.push(`--reason \u957F\u5EA6 ${reason.length}`);
  if (overLong.length > 0) {
    throw new PitfallValidationError([
      `\u5B57\u6BB5\u8D85\u957F\uFF08\u6BCF\u5B57\u6BB5\u6700\u5927 ${PITFALL_FIELD_MAX} \u5B57\u7B26\uFF09: ${overLong.join(", ")}`
    ]);
  }
  const tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : void 0;
  return {
    trigger,
    wrong,
    correct,
    reason,
    ...category ? { category } : {},
    ...tags ? { tags } : {},
    ...level ? { level } : {},
    ...nature ? { nature } : {},
    ...project ? { project } : {}
  };
}

export {
  executeDocsPropagate,
  renderDocsPropagationResult,
  parseDocsPropagateArgs,
  scheduleDocsPropagation,
  executePitfall,
  runPitfallInteractive,
  PitfallValidationError,
  parsePitfallArgs
};
