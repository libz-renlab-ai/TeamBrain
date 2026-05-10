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
  /**
   * Issue #146 F9 — ISO timestamp of the first persist event for this
   * config (zero-touch onboarding moment). Forwarded into every uploaded
   * envelope so the server-side audit trail can answer "when did this
   * user first start sending data". null on configs created before F9
   * (we backfill on first patch / load-and-save touchpoint).
   */
  consented_at?: string | null;
}

export interface DefaultConfigInput {
  user_id: string;
  machine_id: string;
  endpoint?: string;
  /** Override consented_at for tests. Defaults to current ISO time. */
  consented_at?: string;
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
    consented_at: input.consented_at ?? new Date().toISOString(),
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
  /** Issue #146 F9 — ISO clock for stamping consented_at. Defaults to Date.now. */
  now?: () => Date;
  /**
   * Issue #146 F9 — first-run visible stderr writer. Called once when the
   * config gets its initial consented_at (either fresh create or pre-F9
   * backfill). Defaults to process.stderr; tests inject a string sink.
   */
  notify?: (msg: string) => void;
}

/**
 * Issue #146 F9 — single-line first-run banner. The text is intentionally
 * short and English so it fits one terminal row even on narrow shells; it
 * mentions both the on/off control (`pause`) and the inspect command
 * (`status`) so a surprised user can investigate in two keystrokes.
 */
export const FIRST_RUN_BANNER =
  '[teamagent digital-twin] uploader enabled (zero-touch); ' +
  'pause: `teamagent digital-twin pause` · status: `teamagent digital-twin status`';

function defaultStderr(msg: string): void {
  process.stderr.write(msg.endsWith('\n') ? msg : `${msg}\n`);
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
  const now = deps?.now ?? (() => new Date());
  const notify = deps?.notify ?? defaultStderr;

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
      // Issue #146 F9: a pre-F9 config that lands here has consented_at
      // missing/null; backfill on this same persist so we don't lose the
      // first-real-upload moment, and emit the first-run banner so the
      // user can see uploads kicking in.
      const needsBackfill = !existing.consented_at;
      const patched: DigitalTwinConfig = {
        ...existing,
        uploader: { ...existing.uploader, token: TEAM_SHARED_TOKEN },
        consented_at: existing.consented_at ?? now().toISOString(),
      };
      save(patched, file);
      if (needsBackfill) notify(FIRST_RUN_BANNER);
      return patched;
    }
    // enabled=false, or token already set → respect existing config.
    // Still backfill consented_at for pre-F9 configs without flipping the
    // banner (no UX-relevant state change happened).
    if (!existing.consented_at) {
      const backfilled: DigitalTwinConfig = {
        ...existing,
        consented_at: now().toISOString(),
      };
      save(backfilled, file);
      return backfilled;
    }
    return existing;
  }

  // File missing → auto-create with team-shared token + show first-run banner.
  const userId = getUid();
  const machineId = getMid(paths.machineIdFile);
  const fresh: DigitalTwinConfig = {
    ...defaultConfig({
      user_id: userId,
      machine_id: machineId,
      consented_at: now().toISOString(),
    }),
  };
  fresh.uploader.token = TEAM_SHARED_TOKEN;
  save(fresh, file);
  notify(FIRST_RUN_BANNER);
  return fresh;
}
