#!/usr/bin/env node
/**
 * Digital-twin uploader daemon entry.
 *
 * Acquires a PID lock, then runs the upload main loop. Exit codes:
 *   0   — clean exit (idle self-shutdown OR stale-lock detected; also dry-run)
 *   1   — auth failed (token invalid; user must re-login)
 *   2   — config missing or daemon disabled (treated as soft exit)
 */
import { homedir as osHomedir } from 'node:os';
import {
  loadConfig,
  isEnabled,
  digitalTwinPaths,
} from './index.js';
import {
  acquirePidLock,
  releasePidLock,
  mainLoop,
  type DaemonConfig,
} from './daemon/process-manager.js';

export interface DaemonRunDeps {
  homedir?: () => string;
  exit?: (code: number) => void;
  log?: (msg: string) => void;
  /**
   * Issue #368 — install-time / `teamagent doctor` smoke test. When true, the
   * daemon proves all top-level imports loaded (no `MODULE_NOT_FOUND` for
   * `ulid` &c.) and exits 0 immediately, without touching config, the PID
   * lock, or the upload loop. Defaults to `process.env.TEAMAGENT_UPLOADER_DRYRUN === '1'`.
   */
  dryRun?: boolean;
}

export async function runDaemon(deps: DaemonRunDeps = {}): Promise<void> {
  const home = (deps.homedir ?? osHomedir)();
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const log = deps.log ?? ((msg: string) => process.stderr.write(`${msg}\n`));

  const dryRun = deps.dryRun ?? process.env.TEAMAGENT_UPLOADER_DRYRUN === '1';
  if (dryRun) {
    // Reaching here at all means every top-level import resolved — that's the
    // whole point of the probe (the issue #368 bug crashed before this line).
    log('digital-twin uploader: dry-run OK (all imports resolved)');
    return exit(0);
  }

  const cfg = loadConfig(digitalTwinPaths(home).configFile);
  if (!isEnabled(cfg)) {
    log('digital-twin: config missing or disabled — daemon exiting');
    return exit(2);
  }

  const acquired = acquirePidLock(home);
  if (!acquired) {
    log('digital-twin: another daemon is already running — exiting');
    return exit(0);
  }

  let exitCode = 0;
  try {
    const daemonCfg: DaemonConfig = {
      endpoint: cfg!.uploader.endpoint,
      token: cfg!.uploader.token!,
      user_id: cfg!.identity.user_id,
      machine_id: cfg!.identity.machine_id,
      // Issue #146 F9: forward consented_at into every envelope so the
      // server-side audit trail can answer "when did this user first agree".
      consented_at: cfg!.consented_at ?? null,
    };
    const result = await mainLoop(daemonCfg, home);
    if (result.reason === 'auth-failed') {
      log('digital-twin: auth failed (HTTP 401) — token invalid');
      exitCode = 1;
    } else {
      log(`digital-twin: daemon exiting (${result.reason})`);
    }
  } finally {
    releasePidLock(home);
  }
  return exit(exitCode);
}

// Auto-invoke when this bundle is the entry point.
const argv1 = process.argv[1] ?? '';
if (argv1.includes('bin-uploader')) {
  runDaemon().catch((err) => {
    process.stderr.write(`digital-twin daemon crash: ${String(err)}\n`);
    process.exit(1);
  });
}
