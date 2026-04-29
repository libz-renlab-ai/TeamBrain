import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export interface DashboardOptions {
  watch?: boolean;
  once?: boolean;
  open?: boolean;
  host?: string;
  port?: number;
  intervalMs?: number;
  cwd?: string;
}

export interface DashboardLaunchResult {
  mode: "once" | "watch";
  outputPath: string;
  url?: string;
  host?: string;
  port?: number;
  intervalMs?: number;
}

export class DashboardArgsError extends Error {}

function parseDurationMs(value: string): number {
  const trimmed = value.trim();
  const match = /^(\d+)(ms|s|m)?$/.exec(trimmed);
  if (!match) throw new DashboardArgsError(`invalid interval: ${value}`);
  const n = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (!Number.isFinite(n) || n <= 0) throw new DashboardArgsError(`invalid interval: ${value}`);
  if (unit === "m") return n * 60_000;
  if (unit === "s") return n * 1_000;
  return n;
}

export function parseDashboardArgs(argv: string[]): DashboardOptions {
  const opts: DashboardOptions = {
    host: "127.0.0.1",
    port: 8787,
    intervalMs: 2_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
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
  if (!Number.isInteger(opts.port) || opts.port! < 0 || opts.port! > 65_535) {
    throw new DashboardArgsError(`--port must be an integer between 0 and 65535`);
  }
  if (!opts.watch && !opts.once) opts.watch = true;
  if (opts.watch && opts.once) {
    throw new DashboardArgsError("--watch and --once cannot be used together");
  }
  return opts;
}

function findRepoRoot(cwd: string): string {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) && fs.existsSync(path.join(dir, "scripts", "generate-dashboard.cjs"))) {
      return dir;
    }
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return path.resolve(cwd);
}

function dashboardPaths(cwd: string): { root: string; generatorPath: string; outputPath: string } {
  const root = findRepoRoot(cwd);
  return {
    root,
    generatorPath: path.join(root, "scripts", "generate-dashboard.cjs"),
    outputPath: path.join(root, "docs", "dashboard.html"),
  };
}

export function generateDashboardOnce(cwd = process.cwd()): string {
  const { root, generatorPath, outputPath } = dashboardPaths(cwd);
  if (!fs.existsSync(generatorPath)) {
    throw new Error(`dashboard generator not found: ${generatorPath}`);
  }
  const result = spawnSync(process.execPath, [generatorPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `dashboard generator failed with exit ${result.status ?? "unknown"}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ].filter(Boolean).join("\n"),
    );
  }
  return outputPath;
}

function injectAutoRefresh(html: string, intervalMs: number): string {
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
  return html.includes("</body>") ? html.replace("</body>", `${script}\n</body>`) : `${html}\n${script}`;
}

function openBrowser(url: string): void {
  const platform = os.platform();
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

export async function launchDashboard(options: DashboardOptions = {}): Promise<DashboardLaunchResult> {
  const cwd = options.cwd ?? process.cwd();
  const outputPath = generateDashboardOnce(cwd);
  if (options.once) {
    return { mode: "once", outputPath };
  }

  const intervalMs = options.intervalMs ?? 2_000;
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 8787;

  let lastGeneratedAt = new Date().toISOString();
  let lastError = "";
  const regenerate = (): void => {
    try {
      generateDashboardOnce(cwd);
      lastGeneratedAt = new Date().toISOString();
      lastError = "";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  };
  const timer = setInterval(regenerate, intervalMs);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname === "/health.json") {
      res.writeHead(lastError ? 500 : 200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: !lastError, outputPath, lastGeneratedAt, lastError }, null, 2));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/dashboard.html") {
      try {
        const html = fs.readFileSync(outputPath, "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => resolve());
  });

  server.on("close", () => clearInterval(timer));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${port}/dashboard.html`;
  if (options.open) openBrowser(url);

  return { mode: "watch", outputPath, url, host, port, intervalMs };
}

export function renderDashboardLaunch(result: DashboardLaunchResult): string {
  if (result.mode === "once") {
    return `Dashboard generated: ${result.outputPath}\n`;
  }
  return [
    `Real-time TeamAgent dashboard: ${result.url}`,
    `Serving: ${result.outputPath}`,
    `Refresh interval: ${result.intervalMs}ms`,
    `Press Ctrl+C to stop.`,
    "",
  ].join("\n");
}
