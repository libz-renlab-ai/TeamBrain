// BPP (Best-Practice Push) CLI namespace.
//
// Wires the user-facing `teamagent bpp <subcommand>` surface onto the
// digital-twin BPP server + handlers (which shipped in PR #430 but had no
// CLI entry point). Acceptance contract:
//   docs/plans/2026-05-13-bpp-full-system-acceptance.md §2 里程碑一.
//
// PR-A scope: the namespace dispatcher + `bpp serve`. Later PRs add
// push / inbox / accept / reject / revoke / audit / role under the same
// dispatcher.

import { runProdServer } from "@teamagent/digital-twin";

/** Thrown for malformed `bpp` invocations — bin.ts maps this to exit 2. */
export class BppArgError extends Error {}

// ── bpp serve ─────────────────────────────────────────────────────────────

export interface BppServeArgs {
  port?: number;
  host?: string;
  dir?: string;
  help: boolean;
}

export function parseBppServeArgs(argv: string[]): BppServeArgs {
  const out: BppServeArgs = { help: false };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--port=")) {
      out.port = Number(a.slice("--port=".length));
    } else if (a.startsWith("--host=")) {
      out.host = a.slice("--host=".length);
    } else if (a.startsWith("--dir=")) {
      out.dir = a.slice("--dir=".length);
    } else {
      throw new BppArgError(`bpp serve: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppServeHelp(): string {
  return [
    "teamagent bpp serve — 启动 BPP 中心服务",
    "",
    "用法:",
    "  teamagent bpp serve [--port=<n>] [--host=<host>] [--dir=<path>]",
    "",
    "  --port=<n>     监听端口（默认 8080，或环境变量 PORT）",
    "  --host=<host>  绑定地址（默认 0.0.0.0，或环境变量 HOST）",
    "  --dir=<path>   数据落盘目录（默认 ~/teamagent-collector，或 TEAMAGENT_COLLECTOR_DIR）",
    "",
    "服务器进程持续运行，直到收到 SIGINT / SIGTERM。",
  ].join("\n");
}

export interface BppServeHandle {
  url: string;
  outputDir: string;
  close: () => Promise<void>;
}

export interface RunBppServeDeps {
  /** Injectable for tests — defaults to the real digital-twin entry. */
  runProdServer: typeof runProdServer;
  /** When true (CLI default) wire SIGINT/SIGTERM → graceful shutdown → exit. */
  installSignalHandlers: boolean;
  /** Diagnostic sink — defaults to stderr. */
  log: (msg: string) => void;
}

/**
 * Start the BPP central server. Resolves once the server is listening; the
 * returned handle keeps the process alive (the HTTP server holds the event
 * loop) until `close()` is called or a signal triggers shutdown.
 */
export async function runBppServe(
  args: BppServeArgs,
  deps: Partial<RunBppServeDeps> = {},
): Promise<BppServeHandle> {
  const _runProdServer = deps.runProdServer ?? runProdServer;
  const installSignalHandlers = deps.installSignalHandlers ?? true;
  const log = deps.log ?? ((m: string) => process.stderr.write(m + "\n"));

  if (
    args.port !== undefined &&
    (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535)
  ) {
    throw new BppArgError(
      `bpp serve: --port 必须是 0-65535 的整数（收到 ${args.port}）`,
    );
  }

  // CLI flags override inherited env; runProdServer reads PORT / HOST /
  // TEAMAGENT_COLLECTOR_DIR off the env object we pass.
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (args.port !== undefined) env.PORT = String(args.port);
  if (args.host !== undefined) env.HOST = args.host;
  if (args.dir !== undefined) env.TEAMAGENT_COLLECTOR_DIR = args.dir;

  let captured: { url: string; outputDir: string } | undefined;
  const close = await _runProdServer({
    env,
    log,
    onReady: (info) => {
      captured = info;
    },
  });

  if (captured === undefined) {
    // onReady fires synchronously inside runProdServer before it resolves,
    // so this is purely defensive.
    await close();
    throw new Error("bpp serve: 服务器已启动但未上报就绪信息");
  }

  if (installSignalHandlers) {
    const shutdown = (signal: string): void => {
      log(`[teamagent bpp serve] 收到 ${signal}，正在关闭`);
      close()
        .then(() => process.exit(0))
        .catch((err) => {
          log(`关闭出错: ${String(err)}`);
          process.exit(1);
        });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  return { url: captured.url, outputDir: captured.outputDir, close };
}

// ── bpp namespace dispatcher ──────────────────────────────────────────────

export function renderBppHelp(): string {
  return [
    "teamagent bpp — Best-Practice Push（团队最佳实践推送）",
    "",
    "用法:",
    "  teamagent bpp serve [--port=<n>] [--host=<host>] [--dir=<path>]",
    "                              启动 BPP 中心服务",
    "",
    "更多子命令（push / inbox / accept / revoke / audit / role）将在后续 PR 接入。",
  ].join("\n");
}

/**
 * `teamagent bpp <subcommand> ...` dispatcher. For `serve`, this resolves
 * once the server is listening; the process then stays alive on the HTTP
 * server's open handle until a signal triggers shutdown.
 */
export async function runBpp(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);

  if (sub === undefined || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(renderBppHelp() + "\n");
    return;
  }

  if (sub === "serve") {
    const args = parseBppServeArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppServeHelp() + "\n");
      return;
    }
    const handle = await runBppServe(args);
    process.stdout.write(`bpp serve 已监听 ${handle.url}\n`);
    process.stdout.write(`bpp serve 数据目录 ${handle.outputDir}\n`);
    return;
  }

  throw new BppArgError(`未知 bpp 子命令: ${sub}`);
}
