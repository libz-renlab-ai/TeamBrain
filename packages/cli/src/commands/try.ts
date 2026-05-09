/*
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  teamagent try — 5-case headline demo (issue 174 / W2)   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  argv ──> parse ──> 5x executeDemoHook ──> stdout         │
 *   │            │                  │                           │
 *   │            └─ --help ─> usage block (Chinese)             │
 *   │                               │                           │
 *   │                               └─ delayMs (test=0, prod=1s)│
 *   └──────────────────────────────────────────────────────────┘
 */
import { executeDemoHook } from "./demo-hook.js";

export interface TryOptions {
  /** Print help block and exit 0. */
  help?: boolean;
  /** Per-case pacing in ms. Defaults to 1000 (prod); tests pass 0. */
  delayMs?: number;
  /** Override cwd for tests / sandboxes. */
  cwd?: string;
  /** Override $HOME for tests / sandboxes. */
  homeDir?: string;
  /** Explicit DB paths (mostly for tests). */
  projectDbPath?: string;
  userGlobalDbPath?: string;
}

export interface TryResult {
  exitCode: number;
  output: string;
}

interface TryCase {
  label: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/** Five canonical fixture cases that exercise TeamAgent hook interception. */
const TRY_CASES: readonly TryCase[] = [
  {
    label: "npm install moment",
    toolName: "Bash",
    toolInput: { command: "npm install moment" },
  },
  {
    label: "rm -rf /",
    toolName: "Bash",
    toolInput: { command: "rm -rf /" },
  },
  {
    label: "git push --force",
    toolName: "Bash",
    toolInput: { command: "git push --force" },
  },
  {
    label: "chmod 777 /etc/passwd",
    toolName: "Bash",
    toolInput: { command: "chmod 777 /etc/passwd" },
  },
  {
    label: "write hardcoded path",
    toolName: "Write",
    toolInput: { file_path: "/Users/me/secret.txt", content: "foo" },
  },
] as const;

const HELP_TEXT = [
  "用法:",
  "  teamagent try                依次播放 5 个经典 hook 拦截场景",
  "  teamagent try --help         显示帮助",
  "",
  "用例:",
  "  npm install moment    → moment.js 拦截",
  "  rm -rf /              → 危险删除拦截",
  "  git push --force      → 强推拦截",
  "  chmod 777 ...         → 不安全权限拦截",
  "  Write hardcoded path  → 硬编码路径拦截",
  "",
].join("\n");

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `teamagent try` — 30-second headline demo.
 *
 * Plays 5 fixture cases sequentially through executeDemoHook (real offline
 * PreToolUse simulator). Renders Chinese intro + each case's real hook
 * output + closing CTA. Pacing = `delayMs` between cases (default 1000ms;
 * tests pass 0).
 *
 * IRON LAW: must reuse executeDemoHook (which respects B-066: no events.db
 * mutation, no hit_count drift). Do not stub the rendering.
 */
export async function executeTry(opts: TryOptions = {}): Promise<TryResult> {
  if (opts.help) {
    return { exitCode: 0, output: HELP_TEXT };
  }

  const delayMs = opts.delayMs ?? 1000;
  const total = TRY_CASES.length;
  const lines: string[] = [];

  lines.push(`🎬 即将演示 ${total} 个经典场景，每个 1 秒：`);
  lines.push("");

  for (let i = 0; i < TRY_CASES.length; i++) {
    const c = TRY_CASES[i]!;
    const header = `[${i + 1}/${total}] ${c.label}`;
    lines.push(header);

    // PR #183 fix: isolate each case in its own try/catch so that one
    // throwing fixture (e.g. a future matcher regression, a missing DB,
    // a corrupted rule) doesn't abort the whole 5-case demo and leave the
    // user staring at a half-rendered `[2/5]` block with no closing line.
    // The promise of "5 cases, 30 seconds" must hold under partial failure.
    try {
      const hookResult = executeDemoHook({
        toolName: c.toolName,
        toolInput: c.toolInput,
        cwd: opts.cwd,
        homeDir: opts.homeDir,
        projectDbPath: opts.projectDbPath,
        userGlobalDbPath: opts.userGlobalDbPath,
      });

      // Indent the hook's multi-line output so it visually nests under the case
      // header, matching the spec's "   <real hook output>" indentation.
      const indented = hookResult.output
        .split("\n")
        .map((ln) => (ln.length > 0 ? `   ${ln}` : ln))
        .join("\n");
      lines.push(indented);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Truncate to keep the demo's per-case footprint small.
      const short = msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
      lines.push(`   ❌ ${c.label}: ${short}`);
    }

    if (i < TRY_CASES.length - 1) {
      await delay(delayMs);
    }
  }

  lines.push("✅ 演示完成。");
  lines.push(
    "   想体验 TeamAgent 在你日常工作中的拦截，跑：teamagent demo hook <tool> <args>",
  );
  lines.push("");

  return { exitCode: 0, output: lines.join("\n") };
}
