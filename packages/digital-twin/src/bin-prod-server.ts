#!/usr/bin/env node
/**
 * Production receiver entry — long-running HTTP server for team data collection.
 *
 * Wraps startMockServer with production defaults:
 *   - Bind 0.0.0.0 (LAN-visible) instead of 127.0.0.1
 *   - outputDir from $TEAMAGENT_COLLECTOR_DIR (default $HOME/teamagent-collector)
 *   - Logs each request line to stderr
 *   - SIGTERM / SIGINT trigger graceful shutdown
 *
 * Env vars:
 *   PORT                       (default 8080)
 *   HOST                       (default 0.0.0.0)
 *   TEAMAGENT_COLLECTOR_DIR    (default $HOME/teamagent-collector)
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startMockServer } from './mock-server.js';

export interface RunProdServerDeps {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: (msg: string) => void;
  onReady?: (info: { url: string; outputDir: string }) => void;
}

export async function runProdServer(deps: RunProdServerDeps = {}): Promise<() => Promise<void>> {
  const env = deps.env ?? process.env;
  const home = (deps.homedir ?? homedir)();
  const log = deps.log ?? ((msg: string) => process.stderr.write(`${msg}\n`));

  const portRaw = env.PORT ?? '8080';
  const portParsed = Number(portRaw);
  if (!Number.isInteger(portParsed) || portParsed < 0 || portParsed > 65535) {
    throw new Error(
      `[teamagent-collector] invalid PORT='${portRaw}' — must be an integer 0-65535`,
    );
  }
  const port = portParsed;
  const host = env.HOST ?? '0.0.0.0';
  const outputDir = env.TEAMAGENT_COLLECTOR_DIR ?? join(home, 'teamagent-collector');

  const handle = await startMockServer({ port, host, outputDir });
  log(`[teamagent-collector] listening on ${handle.url}`);
  log(`[teamagent-collector] outputDir = ${handle.outputDir}`);
  deps.onReady?.({ url: handle.url, outputDir: handle.outputDir });

  return handle.close;
}

const argv1 = process.argv[1] ?? '';
if (argv1.includes('bin-prod-server')) {
  runProdServer()
    .then((close) => {
      const shutdown = (signal: string) => {
        process.stderr.write(`[teamagent-collector] ${signal} received — shutting down\n`);
        close()
          .then(() => process.exit(0))
          .catch((err) => {
            process.stderr.write(`shutdown error: ${String(err)}\n`);
            process.exit(1);
          });
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      process.stderr.write(`[teamagent-collector] fatal: ${String(err)}\n`);
      process.exit(1);
    });
}
