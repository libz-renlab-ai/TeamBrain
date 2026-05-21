import {
  executeDemoHook
} from "./chunk-H5GRZNPU.js";
import "./chunk-NPSW37EI.js";
import "./chunk-MXJDRQEB.js";
import "./chunk-EHS4WAHC.js";
import "./chunk-JJSYX6XZ.js";
import "./chunk-4Y7LCJVR.js";
import "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/try.ts
init_esm_shims();
var TRY_CASES = [
  {
    label: "npm install moment",
    toolName: "Bash",
    toolInput: { command: "npm install moment" }
  },
  {
    label: "rm -rf /",
    toolName: "Bash",
    toolInput: { command: "rm -rf /" }
  },
  {
    label: "git push --force",
    toolName: "Bash",
    toolInput: { command: "git push --force" }
  },
  {
    label: "chmod 777 /etc/passwd",
    toolName: "Bash",
    toolInput: { command: "chmod 777 /etc/passwd" }
  },
  {
    label: "write hardcoded path",
    toolName: "Write",
    toolInput: { file_path: "/Users/me/secret.txt", content: "foo" }
  }
];
var HELP_TEXT = [
  "\u7528\u6CD5:",
  "  teamagent try                \u4F9D\u6B21\u64AD\u653E 5 \u4E2A\u7ECF\u5178 hook \u62E6\u622A\u573A\u666F",
  "  teamagent try --help         \u663E\u793A\u5E2E\u52A9",
  "",
  "\u7528\u4F8B:",
  "  npm install moment    \u2192 moment.js \u62E6\u622A",
  "  rm -rf /              \u2192 \u5371\u9669\u5220\u9664\u62E6\u622A",
  "  git push --force      \u2192 \u5F3A\u63A8\u62E6\u622A",
  "  chmod 777 ...         \u2192 \u4E0D\u5B89\u5168\u6743\u9650\u62E6\u622A",
  "  Write hardcoded path  \u2192 \u786C\u7F16\u7801\u8DEF\u5F84\u62E6\u622A",
  ""
].join("\n");
function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function executeTry(opts = {}) {
  if (opts.help) {
    return { exitCode: 0, output: HELP_TEXT };
  }
  const delayMs = opts.delayMs ?? 1e3;
  const total = TRY_CASES.length;
  const lines = [];
  lines.push(`\u{1F3AC} \u5373\u5C06\u6F14\u793A ${total} \u4E2A\u7ECF\u5178\u573A\u666F\uFF0C\u6BCF\u4E2A 1 \u79D2\uFF1A`);
  lines.push("");
  for (let i = 0; i < TRY_CASES.length; i++) {
    const c = TRY_CASES[i];
    const header = `[${i + 1}/${total}] ${c.label}`;
    lines.push(header);
    try {
      const hookResult = executeDemoHook({
        toolName: c.toolName,
        toolInput: c.toolInput,
        cwd: opts.cwd,
        homeDir: opts.homeDir,
        projectDbPath: opts.projectDbPath,
        userGlobalDbPath: opts.userGlobalDbPath
      });
      const indented = hookResult.output.split("\n").map((ln) => ln.length > 0 ? `   ${ln}` : ln).join("\n");
      lines.push(indented);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const short = msg.length > 200 ? `${msg.slice(0, 200)}\u2026` : msg;
      lines.push(`   \u274C ${c.label}: ${short}`);
    }
    if (i < TRY_CASES.length - 1) {
      await delay(delayMs);
    }
  }
  lines.push("\u2705 \u6F14\u793A\u5B8C\u6210\u3002");
  lines.push(
    "   \u60F3\u4F53\u9A8C TeamAgent \u5728\u4F60\u65E5\u5E38\u5DE5\u4F5C\u4E2D\u7684\u62E6\u622A\uFF0C\u8DD1\uFF1Ateamagent demo hook <tool> <args>"
  );
  lines.push("");
  return { exitCode: 0, output: lines.join("\n") };
}
export {
  executeTry
};
