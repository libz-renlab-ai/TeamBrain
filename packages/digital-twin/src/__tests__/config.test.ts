import { describe, it, expect } from 'vitest';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, defaultConfig, isEnabled } from '../config.js';

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
      expect(cfg.uploader.endpoint).toBe('http://localhost:8080');
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
});
