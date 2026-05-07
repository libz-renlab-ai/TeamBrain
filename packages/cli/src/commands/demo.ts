/**
 * `teamagent demo` — issue #93.
 *
 * Three modes selected by argv:
 *
 *   teamagent demo                    → default: print CTA, poll events.db
 *                                       for a moment-rule attribution within
 *                                       60s, print evidence on hit.
 *   teamagent demo --inline           → spawn the real bin-pre-tool-use.cjs
 *                                       with a canonical mock fixture and
 *                                       render the decision as ANSI text.
 *                                       CI-safe (no IDE required).
 *   teamagent demo --record [path]    → generate docs/landing/demo.tape
 *                                       (vhs config) and, if vhs is on PATH,
 *                                       spawn it to render the gif.
 *
 * The legacy `teamagent demo hook <tool> <key=value>...` subcommand stays
 * intact in bin.ts (handled before this dispatcher is reached).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";
import { createRequire } from "node:module";

// node:sqlite is experimental in Node 22 and not in builtinModules; vite ESM
// resolution chokes on `import("node:sqlite")`. Existing code in adapters uses
// the same `require()` pattern, so do the same here for the events.db poll.
const requireCjs = createRequire(import.meta.url);

// ---------- argv parsing ----------

export type DemoMode = "default" | "inline" | "record" | "unknown";

export interface DemoArgsDefault {
  mode: "default";
}
export interface DemoArgsInline {
  mode: "inline";
}
export interface DemoArgsRecord {
  mode: "record";
  recordPath: string;
}
export interface DemoArgsUnknown {
  mode: "unknown";
  reason?: string;
}
export type DemoArgs =
  | DemoArgsDefault
  | DemoArgsInline
  | DemoArgsRecord
  | DemoArgsUnknown;

export function parseDemoArgs(args: string[]): DemoArgs {
  if (args.length === 0) return { mode: "default" };
  if (args[0] === "hook") {
    return {
      mode: "unknown",
      reason: "hook is handled by `teamagent demo hook` (legacy dispatcher)",
    };
  }
  if (args.includes("--inline")) return { mode: "inline" };
  if (args.includes("--record")) {
    const idx = args.indexOf("--record");
    const next = args[idx + 1];
    const recordPath =
      next && !next.startsWith("--") ? next : path.resolve("demo.gif");
    return { mode: "record", recordPath };
  }
  return { mode: "unknown", reason: `unrecognized arg: ${args[0]}` };
}

// ---------- inline mode ----------

/**
 * Minimal subset of node:child_process.spawn return shape that we depend on.
 * The real `spawn` type is much wider but compatible.
 */
export type SpawnLike = (
  cmd: string,
  args: string[],
  opts: Record<string, unknown>,
) => {
  stdin: { write: (chunk: string) => boolean; end: () => void };
  stdout: { on: (event: string, cb: (d: Buffer) => void) => void };
  stderr: { on: (event: string, cb: (d: Buffer) => void) => void };
  on: (event: string, cb: (code: number) => void) => void;
};

export interface InlineDecision {
  tool_name: string;
  tool_input: Record<string, unknown>;
  decision: "allow" | "deny";
  message: string;
}

export function renderInlineDecisionAnsi(d: InlineDecision): string {
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const inputStr = JSON.stringify(d.tool_input);
  if (d.decision === "deny") {
    return [
      `${RED}${BOLD}🚫 deny${RESET}`,
      `tool: ${d.tool_name}`,
      `input: ${inputStr}`,
      d.message,
    ].join("\n");
  }
  return [
    `✅ allow`,
    `tool: ${d.tool_name}`,
    `input: ${inputStr}`,
    d.message,
  ].join("\n");
}

const DEFAULT_FIXTURE = {
  tool_name: "Bash",
  tool_input: { command: "npm install moment" },
} satisfies { tool_name: string; tool_input: Record<string, unknown> };

export interface InlineOpts {
  spawn: SpawnLike;
  hookBinPath: string;
  fixture?: { tool_name: string; tool_input: Record<string, unknown>; cwd?: string };
}

export async function executeDemoInlineWithSpawn(
  opts: InlineOpts,
): Promise<{ exitCode: number; rendered: string; raw: string }> {
  const fixture = opts.fixture ?? DEFAULT_FIXTURE;
  return new Promise((resolve) => {
    const child = opts.spawn("node", [opts.hookBinPath], {});
    let stdoutBuf = "";
    child.stdout.on("data", (d: Buffer) => {
      stdoutBuf += d.toString("utf-8");
    });
    child.on("close", (code: number) => {
      let parsed: { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } } = {};
      try {
        parsed = JSON.parse(stdoutBuf);
      } catch {
        /* leave parsed empty so decision falls through to allow */
      }
      const decision: "allow" | "deny" =
        parsed?.hookSpecificOutput?.permissionDecision === "deny" ? "deny" : "allow";
      const reason =
        parsed?.hookSpecificOutput?.permissionDecisionReason ??
        (stdoutBuf.trim() ? "(non-JSON hook output)" : "no rule matched");
      const rendered = renderInlineDecisionAnsi({
        tool_name: fixture.tool_name,
        tool_input: fixture.tool_input,
        decision,
        message: reason,
      });
      resolve({ exitCode: code ?? 0, rendered, raw: stdoutBuf });
    });
    child.stdin.write(JSON.stringify(fixture));
    child.stdin.end();
  });
}

// ---------- record mode ----------

export interface BuildVhsTapeOpts {
  outputPath: string;
  width?: number;
  height?: number;
}

export function buildVhsTape(opts: BuildVhsTapeOpts): string {
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
    `Type "用 dayjs 替代 moment"`,
    `Sleep 1s`,
    `Enter`,
    `Sleep 2s`,
    ``,
    `Type "# scene 2: next session — AI tries moment again"`,
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
    ``,
  ].join("\n");
}

export interface ExecuteRecordOpts {
  recordPath: string;
  checkVhs: () => boolean;
  spawnVhs: (args: string[]) => { ok: boolean; error?: string };
}

export interface ExecuteRecordResult {
  tapePath: string;
  vhsAvailable: boolean;
  spawnResult?: { ok: boolean; error?: string };
  message: string;
}

export async function executeDemoRecord(
  opts: ExecuteRecordOpts,
): Promise<ExecuteRecordResult> {
  const recordDir = path.dirname(path.resolve(opts.recordPath));
  fs.mkdirSync(recordDir, { recursive: true });
  const tapePath = path.join(recordDir, "demo.tape");
  fs.writeFileSync(
    tapePath,
    buildVhsTape({ outputPath: opts.recordPath }),
    "utf-8",
  );

  const vhsAvailable = opts.checkVhs();
  if (!vhsAvailable) {
    return {
      tapePath,
      vhsAvailable: false,
      message: [
        `已生成 ${tapePath}`,
        ``,
        `vhs 未在 PATH 上检测到。安装后跑：`,
        `  brew install vhs                                       # macOS`,
        `  go install github.com/charmbracelet/vhs@latest         # Linux`,
        `  vhs ${tapePath} -o ${opts.recordPath}`,
      ].join("\n"),
    };
  }

  const result = opts.spawnVhs([tapePath, "-o", opts.recordPath]);
  return {
    tapePath,
    vhsAvailable: true,
    spawnResult: result,
    message: result.ok
      ? `✅ vhs 渲染完成: ${opts.recordPath}\n   tape: ${tapePath}`
      : `⚠️ vhs 渲染失败: ${result.error}\n   tape 已保留: ${tapePath}`,
  };
}

// ---------- default mode (poll events.db) ----------

export interface ExecuteDefaultOpts {
  homeDir: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  matchKnowledgeIdLike?: string;
  sinceIso?: string;
  /** Test-aid; not used by production caller. */
  nowIso?: string;
}

export interface DefaultEvent {
  id: string;
  kind: string;
  knowledge_id: string | null;
  tool_use_id: string | null;
  timestamp: string;
  payload: string | null;
}

export interface ExecuteDefaultResult {
  status: "matched" | "timeout" | "error";
  event?: DefaultEvent;
  error?: string;
  elapsedMs: number;
}

export async function executeDemoDefault(
  opts: ExecuteDefaultOpts,
): Promise<ExecuteDefaultResult> {
  const start = Date.now();
  const timeout = opts.timeoutMs ?? 60_000;
  const interval = opts.pollIntervalMs ?? 1_000;
  const since = opts.sinceIso ?? new Date(start).toISOString();
  const matchLike = opts.matchKnowledgeIdLike ?? "moment";
  const eventsPath = path.join(opts.homeDir, ".teamagent", "events.db");

  const { DatabaseSync } = requireCjs("node:sqlite") as typeof import("node:sqlite");

  while (Date.now() - start <= timeout) {
    if (fs.existsSync(eventsPath)) {
      try {
        const db = new DatabaseSync(eventsPath, { readOnly: true });
        try {
          const rows = db
            .prepare(
              "SELECT id, kind, knowledge_id, tool_use_id, timestamp, payload FROM events " +
                "WHERE timestamp >= ? AND knowledge_id LIKE ? " +
                "ORDER BY timestamp ASC LIMIT 1",
            )
            .all(since, `%${matchLike}%`);
          if (rows.length > 0) {
            const r = rows[0] as unknown as DefaultEvent;
            return {
              status: "matched",
              event: r,
              elapsedMs: Date.now() - start,
            };
          }
        } finally {
          db.close();
        }
      } catch {
        // table may not exist yet; keep polling
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { status: "timeout", elapsedMs: Date.now() - start };
}

// ---------- top-level executeDemo (called from bin.ts) ----------

export async function executeDemo(
  args: DemoArgs,
): Promise<{ output: string; exitCode: number }> {
  switch (args.mode) {
    case "default": {
      const home = os.homedir();
      const start = new Date().toISOString();
      const cta = [
        ``,
        `🎬 TeamAgent demo`,
        ``,
        `1. 在你正在用的 Claude Code 会话里跑：`,
        `   npm install moment`,
        ``,
        `2. 我会在 60 秒内 poll \`~/.teamagent/events.db\`，`,
        `   抓到 universal pack 拦截 moment 的 attribution 事件。`,
        ``,
        `(Ctrl-C 中止；CI 环境里改用 \`teamagent demo --inline\`。)`,
        ``,
      ].join("\n");
      process.stderr.write(cta);
      const r = await executeDemoDefault({
        homeDir: home,
        timeoutMs: 60_000,
        pollIntervalMs: 1_000,
        matchKnowledgeIdLike: "moment",
        sinceIso: start,
      });
      if (r.status === "matched" && r.event) {
        const evt = r.event;
        const payloadPreview = evt.payload ? evt.payload.slice(0, 200) : "";
        return {
          output:
            [
              ``,
              `✅ 抓到了！(${r.elapsedMs}ms)`,
              `  rule:      ${evt.knowledge_id}`,
              `  kind:      ${evt.kind}`,
              `  timestamp: ${evt.timestamp}`,
              `  payload:   ${payloadPreview}`,
              ``,
              `这就是「30 秒首次拦截」承诺的真实证据。`,
            ].join("\n") + "\n",
          exitCode: 0,
        };
      }
      return {
        output:
          [
            ``,
            `⏱️  60s 超时，没抓到 moment 拦截事件。`,
            ``,
            `检查项：`,
            `  - 当前项目是否已 init？跑 \`teamagent doctor\``,
            `  - universal pack 是否到位？\`teamagent stats | grep moment\``,
            `  - CI 环境改跑 \`teamagent demo --inline\``,
          ].join("\n") + "\n",
        exitCode: 1,
      };
    }
    case "inline": {
      const hookBin = resolveHookBinPath();
      const { spawn } = await import("node:child_process");
      const r = await executeDemoInlineWithSpawn({
        spawn: spawn as unknown as SpawnLike,
        hookBinPath: hookBin,
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
            return { ok: false, error: (err as Error).message ?? String(err) };
          }
        },
      });
      return {
        output: r.message + "\n",
        exitCode: r.spawnResult?.ok === false ? 1 : 0,
      };
    }
    case "unknown":
    default: {
      const reason = (args as DemoArgsUnknown).reason ?? "unknown";
      return {
        output:
          [
            `未知 demo 模式: ${reason}`,
            ``,
            `用法:`,
            `  teamagent demo                  # default: poll events.db 等真拦截`,
            `  teamagent demo --inline         # CI-safe，spawn hook bin 演示一次拦截`,
            `  teamagent demo --record [path]  # 生成 vhs tape (+ GIF if vhs 在 PATH)`,
            `  teamagent demo hook <tool> ...  # legacy: 离线模拟 PreToolUse`,
          ].join("\n") + "\n",
        exitCode: 1,
      };
    }
  }
}

function resolveHookBinPath(): string {
  // Search upward from this module for a built bin-pre-tool-use.cjs.
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
      "bin-pre-tool-use.cjs",
    );
    if (fs.existsSync(dev)) return dev;
    const nestedDist = path.join(
      dir,
      "..",
      "teamagent",
      "dist",
      "bin-pre-tool-use.cjs",
    );
    if (fs.existsSync(nestedDist)) return nestedDist;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: rely on PATH (mostly useful in tests where spawn is mocked).
  return "bin-pre-tool-use.cjs";
}
