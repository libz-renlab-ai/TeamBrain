import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUserId, getMachineId } from '../identity.js';

describe('identity', () => {
  describe('getUserId', () => {
    it('returns a non-empty string', () => {
      const id = getUserId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('includes @ separator (either email or username@hostname)', () => {
      const id = getUserId();
      expect(id).toContain('@');
    });
  });

  describe('getMachineId', () => {
    it('creates machine-id file when missing', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-machine-'));
      const file = join(dir, 'machine-id');
      expect(existsSync(file)).toBe(false);
      const id = getMachineId(file);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8').trim()).toBe(id);
    });

    it('returns same id on second call (cached on disk)', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-machine-'));
      const file = join(dir, 'machine-id');
      const a = getMachineId(file);
      const b = getMachineId(file);
      expect(a).toBe(b);
    });

    it('format ends with -<8 alphanumeric>', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-machine-'));
      const file = join(dir, 'machine-id');
      const id = getMachineId(file);
      expect(id).toMatch(/-[a-z0-9]{8}$/i);
    });

    it('creates parent directory if missing', () => {
      const dir = mkdtempSync(join(tmpdir(), 'dt-machine-'));
      const file = join(dir, 'nested', 'subdir', 'machine-id');
      const id = getMachineId(file);
      expect(existsSync(file)).toBe(true);
      expect(id.length).toBeGreaterThan(0);
    });
  });
});
