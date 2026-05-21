import {
  installHook,
  uninstallHook
} from "./chunk-NBY7IFQJ.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/uninstall.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
var BLOCK_START_RE = /<!--\s*TEAMAGENT:START[^>]*-->/;
var BLOCK_END_RE = /<!--\s*TEAMAGENT:END[^>]*-->/;
function disable(opts = {}) {
  return uninstallHook(opts);
}
function enable(opts = {}) {
  return installHook(opts);
}
function uninstall(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  const dryRun = opts.dryRun ?? false;
  const actions = [];
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  if (fs.existsSync(settingsPath)) {
    if (dryRun) {
      actions.push(`(dry-run) \u4F1A\u4ECE ${settingsPath} \u79FB\u9664 TeamAgent hook`);
    } else {
      try {
        const r = uninstallHook({ cwd });
        actions.push(
          r.removed ? `\u5DF2\u79FB\u9664 hook \u6CE8\u518C: ${r.settingsPath}` : `hook \u6CE8\u518C\u672A\u53D1\u73B0\uFF08\u5DF2\u65E0\uFF09\uFF0C\u8DF3\u8FC7: ${r.settingsPath}`
        );
      } catch (err) {
        actions.push(`\u26A0 \u79FB\u9664 hook \u5931\u8D25: ${String(err).slice(0, 160)}`);
      }
    }
  } else {
    actions.push(`\u65E0 .claude/settings.local.json\uFF0C\u8DF3\u8FC7 hook \u5378\u8F7D`);
  }
  const claudeMd = path.join(cwd, "CLAUDE.md");
  if (fs.existsSync(claudeMd)) {
    if (dryRun) {
      actions.push(`(dry-run) \u4F1A\u4ECE ${claudeMd} \u79FB\u9664 TEAMAGENT \u533A\u5757`);
    } else {
      try {
        const stripped = stripTeamagentBlock(
          fs.readFileSync(claudeMd, "utf-8")
        );
        if (stripped.changed) {
          if (stripped.content.trim().length === 0) {
            fs.unlinkSync(claudeMd);
            actions.push(`\u5DF2\u4ECE CLAUDE.md \u79FB\u9664 TEAMAGENT \u533A\u5757\uFF08\u5269\u4F59\u7A7A\u767D\uFF0C\u5DF2\u5220\u9664\u7A7A\u6587\u4EF6\uFF09`);
          } else {
            fs.writeFileSync(claudeMd, stripped.content, "utf-8");
            actions.push(`\u5DF2\u4ECE CLAUDE.md \u79FB\u9664 TEAMAGENT \u533A\u5757`);
          }
        } else {
          actions.push(`CLAUDE.md \u65E0 TEAMAGENT \u533A\u5757\uFF0C\u8DF3\u8FC7`);
        }
      } catch (err) {
        actions.push(`\u26A0 \u5904\u7406 CLAUDE.md \u5931\u8D25: ${String(err).slice(0, 160)}`);
      }
    }
  } else {
    actions.push(`\u65E0 CLAUDE.md\uFF0C\u8DF3\u8FC7\u533A\u5757\u6E05\u7406`);
  }
  if (opts.deleteData) {
    const dirs = [
      path.join(home, ".teamagent"),
      path.join(cwd, ".teamagent")
    ];
    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        actions.push(`\u6570\u636E\u76EE\u5F55\u4E0D\u5B58\u5728\uFF0C\u8DF3\u8FC7: ${d}`);
        continue;
      }
      if (dryRun) {
        actions.push(`(dry-run) \u4F1A\u5220\u9664 ${d}`);
      } else {
        try {
          fs.rmSync(d, { recursive: true, force: true });
          actions.push(`\u5DF2\u5220\u9664: ${d}`);
        } catch (err) {
          actions.push(`\u26A0 \u5220\u9664\u5931\u8D25 ${d}: ${String(err).slice(0, 160)}`);
        }
      }
    }
  } else {
    actions.push(
      "\u4FDD\u7559\u77E5\u8BC6\u6570\u636E\uFF08~/.teamagent \u548C ./.teamagent\uFF09\u3002\u52A0 --delete-data \u540C\u65F6\u6E05\u7406"
    );
  }
  return { dryRun, actions };
}
function stripTeamagentBlock(content) {
  const startMatch = content.match(BLOCK_START_RE);
  if (!startMatch) return { content, changed: false };
  const startIdx = startMatch.index;
  const afterStart = content.slice(startIdx + startMatch[0].length);
  const endMatch = afterStart.match(BLOCK_END_RE);
  if (!endMatch) return { content, changed: false };
  const endOfBlock = startIdx + startMatch[0].length + endMatch.index + endMatch[0].length;
  const before = content.slice(0, startIdx).replace(/\s+$/, "");
  const after = content.slice(endOfBlock).replace(/^\s+/, "");
  const glue = before && after ? "\n\n" : "";
  const joined = before + glue + after;
  return { content: joined.endsWith("\n") ? joined : joined + "\n", changed: true };
}
var UNINSTALL_KNOWN_FLAGS = /* @__PURE__ */ new Set(["--delete-data", "--dry-run"]);
var UninstallArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UninstallArgError";
  }
};
function parseUninstallArgs(argv) {
  const opts = {};
  for (const a of argv) {
    if (a === "--delete-data") opts.deleteData = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--")) {
      const base = a.split("=")[0];
      if (!UNINSTALL_KNOWN_FLAGS.has(base)) {
        throw new UninstallArgError(
          `uninstall: unknown flag "${a}". Run 'teamagent --help' for valid flags.`
        );
      }
    }
  }
  return opts;
}
function renderUninstallResult(r) {
  const lines = [];
  lines.push(r.dryRun ? "\u{1F50D} TeamAgent Uninstall (dry-run)" : "\u{1F5D1}\uFE0F  TeamAgent Uninstall");
  lines.push("");
  for (const a of r.actions) lines.push(`  ${a}`);
  lines.push("");
  const removedSomething = !r.dryRun && r.actions.some((a) => a.startsWith("\u5DF2"));
  if (removedSomething) {
    lines.push("\u{1F501} \u60F3\u6062\u590D\uFF08\u91CD\u65B0\u542F\u7528 statusline + PreToolUse / PostToolUse / UserPromptSubmit / Stop hooks\uFF09\uFF1F\u8DD1\uFF1A");
    lines.push("    pnpm teamagent install-hook    # \u4EC5\u91CD\u88C5 hook + statusline\uFF0C\u6700\u5C0F\u6539\u52A8");
    lines.push("    pnpm teamagent init             # \u987A\u4FBF\u91CD\u65B0\u9884\u70ED\u5411\u91CF\u6A21\u578B + \u6CE8\u5165 universal pack");
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

export {
  disable,
  enable,
  uninstall,
  stripTeamagentBlock,
  UninstallArgError,
  parseUninstallArgs,
  renderUninstallResult
};
