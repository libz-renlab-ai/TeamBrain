import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_PATHS, digitalTwinPaths } from './paths.js';
import { getUserId as defaultGetUserId, getMachineId as defaultGetMachineId } from './identity.js';

export interface DigitalTwinConfig {
  schema_version: '1';
  identity: {
    user_id: string;
    machine_id: string;
  };
  uploader: {
    enabled: boolean;
    endpoint: string;
    token: string | null;
  };
}

export interface DefaultConfigInput {
  user_id: string;
  machine_id: string;
  endpoint?: string;
}

const DEFAULT_ENDPOINT = 'http://192.168.22.88:8080';

/**
 * Sentinel token written to digital-twin.json when the Stop hook auto-creates
 * a default config on first invocation. Indicates "use the team's shared
 * upload credential" — the prod server accepts this for zero-touch onboarding.
 */
export const TEAM_SHARED_TOKEN = 'team-shared';

export function defaultConfig(input: DefaultConfigInput): DigitalTwinConfig {
  return {
    schema_version: '1',
    identity: {
      user_id: input.user_id,
      machine_id: input.machine_id,
    },
    uploader: {
      enabled: true,
      endpoint: input.endpoint ?? DEFAULT_ENDPOINT,
      token: null,
    },
  };
}

export function loadConfig(file: string = DEFAULT_PATHS.configFile): DigitalTwinConfig | null {
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw) as DigitalTwinConfig;
  } catch {
    return null;
  }
}

export function saveConfig(
  config: DigitalTwinConfig,
  file: string = DEFAULT_PATHS.configFile,
): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), { encoding: 'utf8' });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // Windows: chmod is best-effort
  }
  try {
    renameSync(tmp, file);
  } catch {
    // Windows renameSync may fail on existing target — fall back to unlink + rename
    try {
      unlinkSync(file);
    } catch {
      // file may not exist; ignore
    }
    renameSync(tmp, file);
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort on Windows
  }
}

export function isEnabled(config: DigitalTwinConfig | null): boolean {
  if (!config) return false;
  if (!config.uploader.enabled) return false;
  if (!config.uploader.token) return false;
  return true;
}

export interface EnsureDefaultConfigDeps {
  loadConfig?: typeof loadConfig;
  saveConfig?: typeof saveConfig;
  getUserId?: () => string;
  getMachineId?: (machineIdFile: string) => string;
}

/**
 * Ensure a digital-twin config exists at `digitalTwinPaths(home).configFile`,
 * applying the zero-touch onboarding decision matrix:
 *
 *   File missing                                  → create with team-shared token
 *   Exists, enabled=true, token=null              → patch in team-shared token
 *   Exists, enabled=false                         → leave UNTOUCHED (user paused)
 *   Exists, enabled=true, token=<something>       → leave UNTOUCHED
 *   Exists, malformed JSON                        → leave UNTOUCHED, return null
 *
 * Returns the config the caller should use (null if the file is malformed).
 * Identity (getUserId / getMachineId) is only invoked when actually creating
 * a new config — patching preserves the existing identity.
 */
export function ensureDefaultConfig(
  home: string,
  deps?: EnsureDefaultConfigDeps,
): DigitalTwinConfig | null {
  const paths = digitalTwinPaths(home);
  const file = paths.configFile;
  const load = deps?.loadConfig ?? loadConfig;
  const save = deps?.saveConfig ?? saveConfig;
  const getUid = deps?.getUserId ?? defaultGetUserId;
  const getMid = deps?.getMachineId ?? defaultGetMachineId;

  // Detect malformed JSON: file exists on disk but loadConfig returns null.
  if (existsSync(file)) {
    const existing = load(file);
    if (existing === null) {
      // Malformed JSON — leave alone, behave as before (silent skip upstream).
      return null;
    }
    // Shape-check: a syntactically-valid JSON file may still be missing the
    // expected blocks (e.g. {} or hand-edited). Treat shape-invalid configs
    // like malformed JSON: leave the file untouched, let isEnabled fall to
    // false upstream.
    if (
      typeof existing.uploader !== 'object' ||
      existing.uploader === null ||
      typeof existing.identity !== 'object' ||
      existing.identity === null
    ) {
      return null;
    }
    // Patch case: enabled but no token → inject team-shared sentinel.
    if (existing.uploader.enabled && !existing.uploader.token) {
      const patched: DigitalTwinConfig = {
        ...existing,
        uploader: { ...existing.uploader, token: TEAM_SHARED_TOKEN },
      };
      save(patched, file);
      return patched;
    }
    // enabled=false, or token already set → respect existing config.
    return existing;
  }

  // File missing → auto-create with team-shared token.
  const userId = getUid();
  const machineId = getMid(paths.machineIdFile);
  const fresh: DigitalTwinConfig = {
    ...defaultConfig({ user_id: userId, machine_id: machineId }),
  };
  fresh.uploader.token = TEAM_SHARED_TOKEN;
  save(fresh, file);
  return fresh;
}
