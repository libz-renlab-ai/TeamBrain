import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  saveConfig,
  defaultConfig,
  isEnabled,
  ensureDefaultConfig,
  TEAM_SHARED_TOKEN,
  type DigitalTwinConfig,
} from '../config.js';
import { digitalTwinPaths } from '../paths.js';

const isPosix = platform() !== 'win32';

describe('config', () => {
  describe('loadConfig', () => {
    it('returns null when file does not exist', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-cfg-'));
      const file = join(dir, 'digital-twin.json');
      expect(loadConfig(file)).toBeNull();
    });

    it('returns null when file is not valid JSON', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-cfg-'));
      const file = join(dir, 'digital-twin.json');
      writeFileSync(file, 'not json');
      expect(loadConfig(file)).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('saveConfig + loadConfig roundtrip', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-cfg-'));
      const file = join(dir, 'digital-twin.json');
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'host-12345678' });
      saveConfig(cfg, file);
      const loaded = loadConfig(file);
      expect(loaded).toEqual(cfg);
    });

    it('overwrites existing file', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-cfg-'));
      const file = join(dir, 'digital-twin.json');
      saveConfig(defaultConfig({ user_id: 'a@b', machine_id: 'h-1' }), file);
      const cfg2 = defaultConfig({ user_id: 'c@d', machine_id: 'h-2' });
      saveConfig(cfg2, file);
      expect(loadConfig(file)).toEqual(cfg2);
    });

    it.skipIf(!isPosix)('sets chmod 600 on POSIX', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-cfg-'));
      const file = join(dir, 'digital-twin.json');
      saveConfig(defaultConfig({ user_id: 'a@b', machine_id: 'h-1' }), file);
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('creates parent directory if missing', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-cfg-'));
      const file = join(dir, 'nested', 'sub', 'digital-twin.json');
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'h-1' });
      saveConfig(cfg, file);
      expect(loadConfig(file)).toEqual(cfg);
    });
  });

  describe('defaultConfig', () => {
    it('returns enabled=true with no token by default', () => {
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'h-1' });
      expect(cfg.uploader.enabled).toBe(true);
      expect(cfg.uploader.token).toBeNull();
      expect(cfg.uploader.endpoint).toBe('http://192.168.22.88:8080');
    });

    it('respects custom endpoint', () => {
      const cfg = defaultConfig({
        user_id: 'a@b',
        machine_id: 'h-1',
        endpoint: 'https://example.com',
      });
      expect(cfg.uploader.endpoint).toBe('https://example.com');
    });

    it('schema_version is "1"', () => {
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'h-1' });
      expect(cfg.schema_version).toBe('1');
    });
  });

  describe('isEnabled', () => {
    it('false when config is null', () => {
      expect(isEnabled(null)).toBe(false);
    });

    it('false when uploader.enabled=false', () => {
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'h-1' });
      cfg.uploader.enabled = false;
      cfg.uploader.token = 'xyz';
      expect(isEnabled(cfg)).toBe(false);
    });

    it('false when token is null (default)', () => {
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'h-1' });
      expect(isEnabled(cfg)).toBe(false);
    });

    it('true when enabled=true and token set', () => {
      const cfg = defaultConfig({ user_id: 'a@b', machine_id: 'h-1' });
      cfg.uploader.token = 'xyz';
      expect(isEnabled(cfg)).toBe(true);
    });
  });

  describe('ensureDefaultConfig', () => {
    function freshHome(): string {
      return mkdtempSync(join(tmpdir(), 'dt-ensure-'));
    }
    const fakeDeps = {
      getUserId: () => 'auto@example.com',
      getMachineId: () => 'auto-host-12345678',
      // Silence the issue #146 F9 banner by default; the dedicated F9
      // tests below override notify to capture and assert.
      notify: () => {},
    };

    it('missing config → creates with team-shared token', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      expect(existsSync(file)).toBe(false);

      const cfg = ensureDefaultConfig(home, fakeDeps);

      expect(cfg).not.toBeNull();
      expect(cfg!.uploader.enabled).toBe(true);
      expect(cfg!.uploader.token).toBe(TEAM_SHARED_TOKEN);
      expect(cfg!.uploader.endpoint).toBe('http://192.168.22.88:8080');
      expect(cfg!.identity.user_id).toBe('auto@example.com');
      expect(cfg!.identity.machine_id).toBe('auto-host-12345678');

      // Persisted to disk identical to returned value.
      expect(existsSync(file)).toBe(true);
      expect(loadConfig(file)).toEqual(cfg);
    });

    it('enabled=true, token=null → patches token (preserves identity)', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      const existing = defaultConfig({ user_id: 'preserved@x', machine_id: 'pre-host' });
      existing.uploader.endpoint = 'http://custom.example:9000';
      saveConfig(existing, file);

      // Identity deps must NOT be invoked when patching.
      let identityCalled = false;
      const deps = {
        getUserId: () => {
          identityCalled = true;
          return 'should-not-be-used';
        },
        getMachineId: () => {
          identityCalled = true;
          return 'should-not-be-used';
        },
      };

      const cfg = ensureDefaultConfig(home, deps);

      expect(identityCalled).toBe(false);
      expect(cfg!.uploader.token).toBe(TEAM_SHARED_TOKEN);
      expect(cfg!.uploader.enabled).toBe(true);
      expect(cfg!.uploader.endpoint).toBe('http://custom.example:9000');
      expect(cfg!.identity.user_id).toBe('preserved@x');
      expect(cfg!.identity.machine_id).toBe('pre-host');
      expect(loadConfig(file)).toEqual(cfg);
    });

    it('enabled=false → returns existing unchanged, file untouched', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      const existing = defaultConfig({ user_id: 'paused@x', machine_id: 'paused-host' });
      existing.uploader.enabled = false;
      saveConfig(existing, file);

      const before = readFileSync(file, 'utf-8');
      const mtimeBefore = statSync(file).mtimeMs;

      const cfg = ensureDefaultConfig(home, fakeDeps);

      expect(cfg).toEqual(existing);
      expect(cfg!.uploader.enabled).toBe(false);
      expect(cfg!.uploader.token).toBeNull();

      // File contents byte-identical (no rewrite).
      const after = readFileSync(file, 'utf-8');
      expect(after).toBe(before);
      // mtime unchanged.
      expect(statSync(file).mtimeMs).toBe(mtimeBefore);
      // isEnabled still false → tap-session will skip.
      expect(isEnabled(cfg)).toBe(false);
    });

    it('enabled=true with real token → returns unchanged', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      const existing = defaultConfig({ user_id: 'real@x', machine_id: 'real-host' });
      existing.uploader.token = 'real-user-token-xyz';
      saveConfig(existing, file);

      const before = readFileSync(file, 'utf-8');
      const mtimeBefore = statSync(file).mtimeMs;

      const cfg = ensureDefaultConfig(home, fakeDeps);

      expect(cfg).toEqual(existing);
      expect(cfg!.uploader.token).toBe('real-user-token-xyz');

      const after = readFileSync(file, 'utf-8');
      expect(after).toBe(before);
      expect(statSync(file).mtimeMs).toBe(mtimeBefore);
    });

    it('malformed JSON → returns null, file untouched', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      const { teamagentDir } = digitalTwinPaths(home);
      // Ensure parent dir exists, then write garbage.
      saveConfig(defaultConfig({ user_id: 'placeholder', machine_id: 'p' }), file);
      writeFileSync(file, '{not valid json', 'utf-8');

      const before = readFileSync(file, 'utf-8');
      const cfg = ensureDefaultConfig(home, fakeDeps);

      expect(cfg).toBeNull();
      const after = readFileSync(file, 'utf-8');
      expect(after).toBe(before);
      // Sanity: dir really existed.
      expect(existsSync(teamagentDir)).toBe(true);
    });

    it('shape-invalid JSON (missing uploader block) → returns null, file untouched', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      // Ensure parent dir exists, then write a JSON-valid but shape-broken
      // config (no uploader, no identity).
      saveConfig(defaultConfig({ user_id: 'placeholder', machine_id: 'p' }), file);
      writeFileSync(file, JSON.stringify({ schema_version: '1' }), 'utf-8');

      const before = readFileSync(file, 'utf-8');
      // Must not throw — earlier versions crashed on undefined.uploader.enabled.
      const cfg = ensureDefaultConfig(home, fakeDeps);

      expect(cfg).toBeNull();
      const after = readFileSync(file, 'utf-8');
      expect(after).toBe(before);
    });

    // Issue #146 F9 — first-run consent banner + consented_at audit field.
    it('missing config: stamps consented_at and emits first-run banner once', () => {
      const home = freshHome();
      const notifications: string[] = [];
      const fixedNow = new Date('2026-05-10T11:22:33.000Z');
      const cfg = ensureDefaultConfig(home, {
        ...fakeDeps,
        now: () => fixedNow,
        notify: (msg) => notifications.push(msg),
      });
      expect(cfg).not.toBeNull();
      expect(cfg!.consented_at).toBe(fixedNow.toISOString());
      // Single banner; mentions both pause + status (so user can navigate).
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toContain('teamagent digital-twin');
      expect(notifications[0]).toMatch(/pause/i);
      expect(notifications[0]).toMatch(/status/i);
    });

    it('pre-F9 patch case (token=null, no consented_at): backfills + emits banner', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      // Hand-craft a pre-F9 config: no consented_at, enabled=true, token=null.
      const preF9: Record<string, unknown> = {
        schema_version: '1',
        identity: { user_id: 'old@x', machine_id: 'old-host' },
        uploader: { enabled: true, endpoint: 'http://x:8080', token: null },
      };
      saveConfig(preF9 as unknown as DigitalTwinConfig, file);

      const notifications: string[] = [];
      const fixedNow = new Date('2026-05-10T11:22:33.000Z');
      const cfg = ensureDefaultConfig(home, {
        ...fakeDeps,
        now: () => fixedNow,
        notify: (msg) => notifications.push(msg),
      });
      expect(cfg!.consented_at).toBe(fixedNow.toISOString());
      expect(cfg!.uploader.token).toBe(TEAM_SHARED_TOKEN);
      // Backfill with token patch counts as the first real-upload moment;
      // banner fires exactly once.
      expect(notifications).toHaveLength(1);
    });

    it('pre-F9 enabled=false (no consented_at): backfills silently (no banner)', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      const preF9: Record<string, unknown> = {
        schema_version: '1',
        identity: { user_id: 'paused@x', machine_id: 'paused-host' },
        uploader: { enabled: false, endpoint: 'http://x:8080', token: null },
      };
      saveConfig(preF9 as unknown as DigitalTwinConfig, file);

      const notifications: string[] = [];
      const fixedNow = new Date('2026-05-10T11:22:33.000Z');
      const cfg = ensureDefaultConfig(home, {
        ...fakeDeps,
        now: () => fixedNow,
        notify: (msg) => notifications.push(msg),
      });
      // Backfill happened but no UX-relevant change (uploads still off) → silent.
      expect(cfg!.consented_at).toBe(fixedNow.toISOString());
      expect(notifications).toHaveLength(0);
    });

    it('config with consented_at already set: no backfill, no banner (idempotent)', () => {
      const home = freshHome();
      const file = digitalTwinPaths(home).configFile;
      const existing = defaultConfig({
        user_id: 'real@x',
        machine_id: 'real-host',
        consented_at: '2026-05-09T00:00:00.000Z',
      });
      existing.uploader.token = 'real-token';
      saveConfig(existing, file);

      const before = readFileSync(file, 'utf-8');
      const notifications: string[] = [];
      const cfg = ensureDefaultConfig(home, {
        ...fakeDeps,
        notify: (msg) => notifications.push(msg),
      });
      expect(cfg!.consented_at).toBe('2026-05-09T00:00:00.000Z');
      expect(notifications).toHaveLength(0);
      // File byte-identical (idempotent path).
      expect(readFileSync(file, 'utf-8')).toBe(before);
    });
  });
});
