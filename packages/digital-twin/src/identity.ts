import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname } from 'node:path';
import { ulid } from 'ulid';
import { DEFAULT_PATHS } from './paths.js';

export interface GetUserIdOptions {
  /**
   * Hard cap (ms) on the `git config user.email` shell-out. When the
   * subprocess overruns, execSync throws and we fall back to
   * `${username}@${hostname()}`. Useful on hooks' critical paths where a
   * stuck git (NFS HOME, slow corporate proxy) would otherwise block the
   * caller. Defaults to undefined (no timeout — preserves prior behavior).
   */
  timeoutMs?: number;
}

export function getUserId(opts: GetUserIdOptions = {}): string {
  try {
    const execOpts: ExecSyncOptionsWithStringEncoding = {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    };
    if (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) {
      execOpts.timeout = opts.timeoutMs;
    }
    const email = execSync('git config user.email', execOpts).trim();
    if (email) return email;
  } catch {
    // git not available, user.email not configured, or timeout exceeded
  }
  return `${userInfo().username}@${hostname()}`;
}

export function getMachineId(machineIdFile: string = DEFAULT_PATHS.machineIdFile): string {
  if (existsSync(machineIdFile)) {
    const cached = readFileSync(machineIdFile, 'utf8').trim();
    if (cached) return cached;
  }
  const id = `${hostname()}-${ulid().slice(-8).toLowerCase()}`;
  mkdirSync(dirname(machineIdFile), { recursive: true });
  writeFileSync(machineIdFile, id, { encoding: 'utf8' });
  try {
    chmodSync(machineIdFile, 0o600);
  } catch {
    // chmod is a no-op on Windows; tolerate ENOTSUP / EPERM
  }
  return id;
}
