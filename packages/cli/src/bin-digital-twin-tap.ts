#!/usr/bin/env node
/**
 * Digital-Twin Stop Hook tap entry.
 *
 * Reads the Claude Code Stop hook stdin payload (StopHookInput), and forwards
 * (cwd, session_id) to `tapSession()` from `@teamagent/digital-twin`. Designed
 * to coexist with the existing TeamAgent learning Stop hook (`bin-stop.ts`)
 * — this entry deliberately does not call the learning pipeline.
 *
 * Hard rules:
 * - NEVER exits non-zero. Stop hook must not block session close.
 * - Returns silently if config disables digital-twin or if no transcript exists.
 * - Best-effort daemon spawn. If daemon binary is absent (PR-2 ships before PR-3),
 *   the queue files persist and a future daemon run picks them up.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  loadConfig,
  isEnabled,
  tapSession,
  digitalTwinPaths,
} from '@teamagent/digital-twin';

interface StopHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name?: string;
}

function isValidStopHookInput(v: unknown): v is StopHookInput {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as StopHookInput).session_id === 'string' &&
    typeof (v as StopHookInput).cwd === 'string'
  );
}

/**
 * Resolve the uploader daemon binary path. PR-3 will ship this binary into
 * `~/.teamagent/digital-twin/bin-uploader.cjs` via the install step. If the
 * binary is not present, return null and the caller skips the spawn — queue
 * files persist for a future daemon run to pick up.
 */
export function resolveDaemonBin(home: string): string | null {
  const paths = digitalTwinPaths(home);
  const prod = path.join(paths.digitalTwinDir, 'bin-uploader.cjs');
  if (existsSync(prod)) return prod;
  return null;
}

export async function main(
  stdinReader: () => Promise<string> = readStdin,
  homedirFn: () => string = homedir,
): Promise<void> {
  const home = homedirFn();
  // Config gate: missing / disabled / no token → silent return.
  let cfg;
  try {
    cfg = loadConfig(digitalTwinPaths(home).configFile);
  } catch {
    return;
  }
  if (!isEnabled(cfg)) return;

  let raw: string;
  try {
    raw = (await stdinReader()).trim();
  } catch {
    return;
  }
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isValidStopHookInput(parsed)) return;

  const daemonBin = resolveDaemonBin(home);
  tapSession(
    { cwd: parsed.cwd, sessionId: parsed.session_id },
    {
      homedir: () => home,
      daemonBin,
    },
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

// Auto-invoke when this bundle is the entry point. Use process.argv[1] —
// works in both ESM (vitest) and CJS (tsup-bundled) contexts.
if (path.basename(process.argv[1] ?? '').startsWith('bin-digital-twin-tap')) {
  main().catch(() => {
    /* never block session close */
  });
}
