import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digitalTwinPaths } from '../../paths.js';
import { readLastUploaderError } from '../uploader-log.js';

function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'dt-uplog-'));
  // tap-session creates digitalTwinDir before opening uploader.log; mirror that.
  mkdirSync(digitalTwinPaths(home).digitalTwinDir, { recursive: true });
  return home;
}

function writeLog(home: string, body: string): void {
  writeFileSync(digitalTwinPaths(home).uploaderLogFile, body, 'utf-8');
}

describe('readLastUploaderError (issue #368)', () => {
  it('returns null when uploader.log does not exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'dt-uplog-none-'));
    expect(readLastUploaderError(home)).toBeNull();
  });

  it('returns null when the log has only benign diagnostics', () => {
    const home = freshHome();
    writeLog(
      home,
      [
        'digital-twin: daemon exiting (idle)',
        'digital-twin: another daemon is already running — exiting',
        'digital-twin uploader: dry-run OK (all imports resolved)',
      ].join('\n'),
    );
    expect(readLastUploaderError(home)).toBeNull();
  });

  it('surfaces a MODULE_NOT_FOUND crash line with its 1-based line number', () => {
    const home = freshHome();
    writeLog(
      home,
      [
        'digital-twin: daemon exiting (idle)',
        "Error: Cannot find module 'ulid'",
        '    at Module._resolveFilename (node:internal/modules/cjs/loader)',
        "  code: 'MODULE_NOT_FOUND',",
      ].join('\n'),
    );
    const got = readLastUploaderError(home);
    expect(got).not.toBeNull();
    expect(got!.line).toMatch(/MODULE_NOT_FOUND/);
    expect(got!.lineno).toBe(4);
  });

  it('returns the LAST error line when several are present', () => {
    const home = freshHome();
    writeLog(
      home,
      [
        "Error: Cannot find module 'ulid'",
        'digital-twin: daemon exiting (idle)',
        'digital-twin daemon crash: TypeError: boom',
        '',
      ].join('\n'),
    );
    const got = readLastUploaderError(home);
    expect(got).not.toBeNull();
    expect(got!.line).toBe('digital-twin daemon crash: TypeError: boom');
    expect(got!.lineno).toBe(3);
  });

  it('truncates very long lines with an ellipsis', () => {
    const home = freshHome();
    writeLog(home, `Error: ${'x'.repeat(2000)}`);
    const got = readLastUploaderError(home);
    expect(got).not.toBeNull();
    expect(got!.line.length).toBeLessThanOrEqual(401);
    expect(got!.line.endsWith('…')).toBe(true);
  });
});
