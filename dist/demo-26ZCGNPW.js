import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/demo.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { execFileSync, execSync } from "child_process";
import { createRequire } from "module";
var requireCjs = createRequire(import.meta.url);
function parseDemoArgs(args) {
  if (args.length === 0) return { mode: "default" };
  if (args[0] === "hook") {
    return {
      mode: "unknown",
      reason: "hook is handled by `teamagent demo hook` (legacy dispatcher)"
    };
  }
  if (args.includes("--inline")) return { mode: "inline" };
  if (args.includes("--record")) {
    const idx = args.indexOf("--record");
    const next = args[idx + 1];
    const recordPath = next && !next.startsWith("--") ? next : path.resolve("demo.gif");
    return { mode: "record", recordPath };
  }
  return { mode: "unknown", reason: `unrecognized arg: ${args[0]}` };
}
function renderInlineDecisionAnsi(d) {
  const RED = "\x1B[31m";
  const RESET = "\x1B[0m";
  const BOLD = "\x1B[1m";
  const inputStr = JSON.stringify(d.tool_input);
  if (d.decision === "deny") {
    return [
      `${RED}${BOLD}\u{1F6AB} deny${RESET}`,
      `tool: ${d.tool_name}`,
      `input: ${inputStr}`,
      d.message
    ].join("\n");
  }
  return [
    `\u2705 allow`,
    `tool: ${d.tool_name}`,
    `input: ${inputStr}`,
    d.message
  ].join("\n");
}
var DEFAULT_FIXTURE = {
  tool_name: "Bash",
  tool_input: { command: "npm install moment" }
};
async function executeDemoInlineWithSpawn(opts) {
  const fixture = opts.fixture ?? DEFAULT_FIXTURE;
  return new Promise((resolve) => {
    const child = opts.spawn("node", [opts.hookBinPath], {});
    let stdoutBuf = "";
    child.stdout.on("data", (d) => {
      stdoutBuf += d.toString("utf-8");
    });
    child.on("close", (code) => {
      let parsed = {};
      try {
        parsed = JSON.parse(stdoutBuf);
      } catch {
      }
      const decision = parsed?.hookSpecificOutput?.permissionDecision === "deny" ? "deny" : "allow";
      const reason = parsed?.hookSpecificOutput?.permissionDecisionReason ?? (stdoutBuf.trim() ? "(non-JSON hook output)" : "no rule matched");
      const rendered = renderInlineDecisionAnsi({
        tool_name: fixture.tool_name,
        tool_input: fixture.tool_input,
        decision,
        message: reason
      });
      resolve({ exitCode: code ?? 0, rendered, raw: stdoutBuf });
    });
    child.stdin.write(JSON.stringify(fixture));
    child.stdin.end();
  });
}
function buildVhsTape(opts) {
  const w = opts.width ?? 1200;
  const h = opts.height ?? 600;
  return [
    `# vhs tape for teamagent demo (issue #93)`,
    `# scene 1: user corrects AI; scene 2: next session, AI tries again, gets blocked.`,
    ``,
    `Output ${opts.outputPath}`,
    `Set FontSize 16`,
    `Set Width ${w}`,
    `Set Height ${h}`,
    `Set Padding 20`,
    ``,
    `Type "# scene 1: user corrects AI"`,
    `Sleep 800ms`,
    `Enter`,
    `Type "\u7528 dayjs \u66FF\u4EE3 moment"`,
    `Sleep 1s`,
    `Enter`,
    `Sleep 2s`,
    ``,
    `Type "# scene 2: next session \u2014 AI tries moment again"`,
    `Sleep 800ms`,
    `Enter`,
    `Type "npm install moment"`,
    `Sleep 1s`,
    `Enter`,
    `Sleep 3s`,
    ``,
    `Type "# TeamAgent intercepted (PreToolUse: deny + suggest dayjs)"`,
    `Sleep 1500ms`,
    `Enter`,
    `Sleep 1500ms`,
    ``
  ].join("\n");
}
async function executeDemoRecord(opts) {
  const recordDir = path.dirname(path.resolve(opts.recordPath));
  fs.mkdirSync(recordDir, { recursive: true });
  const tapePath = path.join(recordDir, "demo.tape");
  fs.writeFileSync(
    tapePath,
    buildVhsTape({ outputPath: opts.recordPath }),
    "utf-8"
  );
  const vhsAvailable = opts.checkVhs();
  if (!vhsAvailable) {
    return {
      tapePath,
      vhsAvailable: false,
      message: [
        `\u5DF2\u751F\u6210 ${tapePath}`,
        ``,
        `vhs \u672A\u5728 PATH \u4E0A\u68C0\u6D4B\u5230\u3002\u5B89\u88C5\u540E\u8DD1\uFF1A`,
        `  brew install vhs                                       # macOS`,
        `  go install github.com/charmbracelet/vhs@latest         # Linux`,
        `  vhs ${tapePath} -o ${opts.recordPath}`
      ].join("\n")
    };
  }
  const result = opts.spawnVhs([tapePath, "-o", opts.recordPath]);
  return {
    tapePath,
    vhsAvailable: true,
    spawnResult: result,
    message: result.ok ? `\u2705 vhs \u6E32\u67D3\u5B8C\u6210: ${opts.recordPath}
   tape: ${tapePath}` : `\u26A0\uFE0F vhs \u6E32\u67D3\u5931\u8D25: ${result.error}
   tape \u5DF2\u4FDD\u7559: ${tapePath}`
  };
}
async function executeDemoDefault(opts) {
  const start = Date.now();
  const timeout = opts.timeoutMs ?? 6e4;
  const interval = opts.pollIntervalMs ?? 1e3;
  const since = opts.sinceIso ?? new Date(start).toISOString();
  const matchLike = opts.matchKnowledgeIdLike ?? "moment";
  const eventsPath = path.join(opts.homeDir, ".teamagent", "events.db");
  const { DatabaseSync } = requireCjs("node:sqlite");
  while (Date.now() - start <= timeout) {
    if (fs.existsSync(eventsPath)) {
      try {
        const db = new DatabaseSync(eventsPath, { readOnly: true });
        try {
          const rows = db.prepare(
            "SELECT id, kind, knowledge_id, tool_use_id, timestamp, payload FROM events WHERE timestamp >= ? AND knowledge_id LIKE ? ORDER BY timestamp ASC LIMIT 1"
          ).all(since, `%${matchLike}%`);
          if (rows.length > 0) {
            const r = rows[0];
            return {
              status: "matched",
              event: r,
              elapsedMs: Date.now() - start
            };
          }
        } finally {
          db.close();
        }
      } catch {
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { status: "timeout", elapsedMs: Date.now() - start };
}
async function executeDemo(args) {
  switch (args.mode) {
    case "default": {
      const home = os.homedir();
      const start = (/* @__PURE__ */ new Date()).toISOString();
      const cta = [
        ``,
        `\u{1F3AC} TeamAgent demo`,
        ``,
        `1. \u5728\u4F60\u6B63\u5728\u7528\u7684 Claude Code \u4F1A\u8BDD\u91CC\u8DD1\uFF1A`,
        `   npm install moment`,
        ``,
        `2. \u6211\u4F1A\u5728 60 \u79D2\u5185 poll \`~/.teamagent/events.db\`\uFF0C`,
        `   \u6293\u5230 universal pack \u62E6\u622A moment \u7684 attribution \u4E8B\u4EF6\u3002`,
        ``,
        `(Ctrl-C \u4E2D\u6B62\uFF1BCI \u73AF\u5883\u91CC\u6539\u7528 \`teamagent demo --inline\`\u3002)`,
        ``
      ].join("\n");
      process.stderr.write(cta);
      const r = await executeDemoDefault({
        homeDir: home,
        timeoutMs: 6e4,
        pollIntervalMs: 1e3,
        matchKnowledgeIdLike: "moment",
        sinceIso: start
      });
      if (r.status === "matched" && r.event) {
        const evt = r.event;
        const payloadPreview = evt.payload ? evt.payload.slice(0, 200) : "";
        return {
          output: [
            ``,
            `\u2705 \u6293\u5230\u4E86\uFF01(${r.elapsedMs}ms)`,
            `  rule:      ${evt.knowledge_id}`,
            `  kind:      ${evt.kind}`,
            `  timestamp: ${evt.timestamp}`,
            `  payload:   ${payloadPreview}`,
            ``,
            `\u8FD9\u5C31\u662F\u300C30 \u79D2\u9996\u6B21\u62E6\u622A\u300D\u627F\u8BFA\u7684\u771F\u5B9E\u8BC1\u636E\u3002`
          ].join("\n") + "\n",
          exitCode: 0
        };
      }
      return {
        output: [
          ``,
          `\u23F1\uFE0F  60s \u8D85\u65F6\uFF0C\u6CA1\u6293\u5230 moment \u62E6\u622A\u4E8B\u4EF6\u3002`,
          ``,
          `\u68C0\u67E5\u9879\uFF1A`,
          `  - \u5F53\u524D\u9879\u76EE\u662F\u5426\u5DF2 init\uFF1F\u8DD1 \`teamagent doctor\``,
          `  - universal pack \u662F\u5426\u5230\u4F4D\uFF1F\`teamagent stats | grep moment\``,
          `  - CI \u73AF\u5883\u6539\u8DD1 \`teamagent demo --inline\``
        ].join("\n") + "\n",
        exitCode: 1
      };
    }
    case "inline": {
      const hookBin = resolveHookBinPath();
      const { spawn } = await import("child_process");
      const r = await executeDemoInlineWithSpawn({
        spawn,
        hookBinPath: hookBin
      });
      return { output: r.rendered + "\n", exitCode: r.exitCode };
    }
    case "record": {
      const r = await executeDemoRecord({
        recordPath: args.recordPath,
        checkVhs: () => {
          try {
            execSync("vhs --version", { stdio: "ignore" });
            return true;
          } catch {
            return false;
          }
        },
        spawnVhs: (vhsArgs) => {
          try {
            execFileSync("vhs", vhsArgs, { stdio: "inherit" });
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err.message ?? String(err) };
          }
        }
      });
      return {
        output: r.message + "\n",
        exitCode: r.spawnResult?.ok === false ? 1 : 0
      };
    }
    case "unknown":
    default: {
      const reason = args.reason ?? "unknown";
      return {
        output: [
          `\u672A\u77E5 demo \u6A21\u5F0F: ${reason}`,
          ``,
          `\u7528\u6CD5:`,
          `  teamagent demo                  # default: poll events.db \u7B49\u771F\u62E6\u622A`,
          `  teamagent demo --inline         # CI-safe\uFF0Cspawn hook bin \u6F14\u793A\u4E00\u6B21\u62E6\u622A`,
          `  teamagent demo --record [path]  # \u751F\u6210 vhs tape (+ GIF if vhs \u5728 PATH)`,
          `  teamagent demo hook <tool> ...  # legacy: \u79BB\u7EBF\u6A21\u62DF PreToolUse`
        ].join("\n") + "\n",
        exitCode: 1
      };
    }
  }
}
function resolveHookBinPath() {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    const sibling = path.join(dir, "bin-pre-tool-use.cjs");
    if (fs.existsSync(sibling)) return sibling;
    const dev = path.join(
      dir,
      "packages",
      "teamagent",
      "dist",
      "bin-pre-tool-use.cjs"
    );
    if (fs.existsSync(dev)) return dev;
    const nestedDist = path.join(
      dir,
      "..",
      "teamagent",
      "dist",
      "bin-pre-tool-use.cjs"
    );
    if (fs.existsSync(nestedDist)) return nestedDist;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "bin-pre-tool-use.cjs";
}
export {
  buildVhsTape,
  executeDemo,
  executeDemoDefault,
  executeDemoInlineWithSpawn,
  executeDemoRecord,
  parseDemoArgs,
  renderInlineDecisionAnsi
};
