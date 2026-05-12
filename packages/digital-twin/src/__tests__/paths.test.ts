import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { digitalTwinPaths, DEFAULT_PATHS } from '../paths.js';

describe('paths', () => {
  describe('digitalTwinPaths()', () => {
    it('uses os.homedir() by default', () => {
      const p = digitalTwinPaths();
      expect(p.teamagentDir).toBe(join(homedir(), '.teamagent'));
    });

    it('respects custom base dir', () => {
      const p = digitalTwinPaths('/tmp/fakehome');
      expect(p.teamagentDir).toBe(join('/tmp/fakehome', '.teamagent'));
      expect(p.digitalTwinDir).toBe(join('/tmp/fakehome', '.teamagent', 'digital-twin'));
    });

    it('configFile is sibling of digitalTwinDir (NOT nested under it)', () => {
      const p = digitalTwinPaths('/x');
      expect(p.configFile).toBe(join('/x', '.teamagent', 'digital-twin.json'));
      expect(p.digitalTwinDir).toBe(join('/x', '.teamagent', 'digital-twin'));
    });

    it('machineIdFile is inside digitalTwinDir', () => {
      const p = digitalTwinPaths('/x');
      expect(p.machineIdFile).toBe(join(p.digitalTwinDir, 'machine-id'));
    });

    it('queue subpaths nest under queue/', () => {
      const p = digitalTwinPaths('/x');
      expect(p.queueDir).toBe(join(p.digitalTwinDir, 'queue'));
      expect(p.pendingDir).toBe(join(p.queueDir, 'pending'));
      expect(p.deadLetterDir).toBe(join(p.queueDir, 'dead-letter'));
      expect(p.recordingTempDir).toBe(join(p.queueDir, 'recording_temp'));
    });

    it('daemonPidFile is at digitalTwinDir/daemon.pid', () => {
      const p = digitalTwinPaths('/x');
      expect(p.daemonPidFile).toBe(join(p.digitalTwinDir, 'daemon.pid'));
    });

    // Issue #283 — hourly scheduler fence + quota cache locations.
    it('lastHourlyScanFile is at digitalTwinDir/last-hourly-scan.txt', () => {
      const p = digitalTwinPaths('/x');
      expect(p.lastHourlyScanFile).toBe(join(p.digitalTwinDir, 'last-hourly-scan.txt'));
    });

    it('quotaCacheFile is at digitalTwinDir/quota-cache.json', () => {
      const p = digitalTwinPaths('/x');
      expect(p.quotaCacheFile).toBe(join(p.digitalTwinDir, 'quota-cache.json'));
    });

    // Issue #368 — uploader daemon stdout/stderr capture target.
    it('uploaderLogFile is at digitalTwinDir/uploader.log', () => {
      const p = digitalTwinPaths('/x');
      expect(p.uploaderLogFile).toBe(join(p.digitalTwinDir, 'uploader.log'));
    });
  });

  describe('DEFAULT_PATHS', () => {
    it('matches digitalTwinPaths() with no args', () => {
      expect(DEFAULT_PATHS).toEqual(digitalTwinPaths());
    });
  });
});
