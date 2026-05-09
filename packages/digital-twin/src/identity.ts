import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname } from 'node:path';
import { ulid } from 'ulid';
import { DEFAULT_PATHS } from './paths.js';

export function getUserId(): string {
  try {
    const email = execSync('git config user.email', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (email) return email;
  } catch {
    // git not available, or user.email not configured
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
