import {
  normalizeCwd
} from "./chunk-NPSW37EI.js";
import {
  DualLayerStore
} from "./chunk-MXJDRQEB.js";
import {
  matchRules
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/demo-hook.ts
init_esm_shims();
import os from "os";
import path from "path";
import nodeFs from "fs";
function decisionFor(rule) {
  if (rule && rule.enforcement === "block") return "deny";
  return "allow";
}
function formatBlockReason(rule) {
  return [
    `\u{1F6AB} TeamAgent \u62E6\u622A (\u7F6E\u4FE1 ${rule.confidence.toFixed(2)})`,
    `\u5E94\u6539\u7528: ${rule.correct_pattern}`,
    `\u539F\u56E0: ${rule.reasoning}`,
    `(\u89C4\u5219 id: ${rule.id})`
  ].join("\n");
}
function formatWarnMessage(rule) {
  return [
    `\u{1F4A1} TeamAgent \u7ECF\u9A8C (\u7F6E\u4FE1 ${rule.confidence.toFixed(2)})`,
    `\u63A8\u8350: ${rule.correct_pattern}`,
    `\u539F\u56E0: ${rule.reasoning}`
  ].join("\n");
}
function executeDemoHook(opts) {
  const cwd = normalizeCwd(opts.cwd ?? process.cwd());
  const home = opts.homeDir ?? os.homedir();
  const toolName = opts.toolName ?? opts.tool ?? "";
  const toolInput = opts.toolInput ?? opts.input ?? {};
  const projectDbPath = opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db");
  const effectiveProject = nodeFs.existsSync(projectDbPath) ? projectDbPath : ":memory:";
  const effectiveGlobal = nodeFs.existsSync(userGlobalDbPath) ? userGlobalDbPath : ":memory:";
  let rules = [];
  try {
    const store = new DualLayerStore({
      projectDbPath: effectiveProject,
      userGlobalDbPath: effectiveGlobal
    });
    rules = store.findActive();
    store.close();
  } catch {
  }
  const matches = matchRules({ toolName, input: toolInput }, rules);
  if (matches.length === 0) {
    const out2 = [
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      "\u{1F7E2} TeamAgent \xB7 \u6A21\u62DF PreToolUse \u7ED3\u679C",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      `\u25B8 \u5DE5\u5177: ${toolName}`,
      `\u25B8 \u8F93\u5165: ${JSON.stringify(toolInput)}`,
      "\u25B8 \u51B3\u7B56: \u901A\u8FC7 (\u65E0\u89C4\u5219\u547D\u4E2D)",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      ""
    ].join("\n");
    return { output: out2, decision: "allow" };
  }
  const top = matches[0];
  if (top.enforcement === "block") {
    const reason = formatBlockReason(top);
    const out2 = [
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      "\u{1F6AB} TeamAgent \xB7 \u6A21\u62DF PreToolUse \u7ED3\u679C",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      `\u25B8 \u5DE5\u5177: ${toolName}`,
      `\u25B8 \u8F93\u5165: ${JSON.stringify(toolInput)}`,
      "\u25B8 \u51B3\u7B56: deny",
      "\u25B8 \u62E6\u622A\u539F\u56E0:",
      ...reason.split("\n").map((ln) => `    ${ln}`),
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      ""
    ].join("\n");
    return { output: out2, decision: "deny" };
  }
  if (top.enforcement === "warn") {
    const msg = formatWarnMessage(top);
    const out2 = [
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      "\u{1F4A1} TeamAgent \xB7 \u6A21\u62DF PreToolUse \u7ED3\u679C",
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      `\u25B8 \u5DE5\u5177: ${toolName}`,
      `\u25B8 \u8F93\u5165: ${JSON.stringify(toolInput)}`,
      "\u25B8 \u51B3\u7B56: allow",
      "\u25B8 \u7ED9 AI \u7684\u63D0\u793A:",
      ...msg.split("\n").map((ln) => `    ${ln}`),
      `\u25B8 \u9644\u52A0\u4E0A\u4E0B\u6587: ${top.correct_pattern}`,
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
      ""
    ].join("\n");
    return { output: out2, decision: "allow" };
  }
  const out = [
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    "\u{1F7E2} TeamAgent \xB7 \u6A21\u62DF PreToolUse \u7ED3\u679C",
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    `\u25B8 \u5DE5\u5177: ${toolName}`,
    `\u25B8 \u8F93\u5165: ${JSON.stringify(toolInput)}`,
    "\u25B8 \u51B3\u7B56: \u901A\u8FC7 (suggest/passive)",
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    ""
  ].join("\n");
  return { output: out, decision: decisionFor(top) };
}
function parseDemoHookArgs(args) {
  if (args.length === 0) return null;
  const toolName = args[0];
  const rest = args.slice(1);
  if (rest.length === 1) {
    const only = rest[0].trim();
    if (only.startsWith("{") && only.endsWith("}")) {
      try {
        const parsed = JSON.parse(only);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const toolInput2 = parsed;
          return { toolName, toolInput: toolInput2, tool: toolName, input: toolInput2 };
        }
      } catch {
      }
    }
  }
  const toolInput = {};
  for (const a of rest) {
    const idx = a.indexOf("=");
    if (idx < 0) continue;
    const k = a.slice(0, idx);
    const v = a.slice(idx + 1);
    try {
      toolInput[k] = JSON.parse(v);
    } catch {
      toolInput[k] = v;
    }
  }
  return { toolName, toolInput, tool: toolName, input: toolInput };
}

export {
  executeDemoHook,
  parseDemoHookArgs
};
