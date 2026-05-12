import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDaemon } from '../bin-uploader.js';

/**
 * Issue #368 — `runDaemon({ dryRun: true })` is the install-time / doctor
 * smoke test: it must exit 0 without touching config or the PID lock. Reaching
 * the dry-run branch at all proves all top-level imports (notably `ulid`)
 * resolved — which is exactly the failure the issue describes (the staged
 * `bin-uploader.cjs` crashed with `MODULE_NOT_FOUND` before doing anything).
 */
describe('runDaemon dry-run (issue #368)', () => {
  it('exits 0 and logs "dry-run OK" without reading config', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dt-uploader-dry-'));
    let exitCode: number | undefined;
    const logs: string[] = [];
    await runDaemon({
      homedir: () => home,
      dryRun: true,
      exit: (c) => {
        exitCode = c;
      },
      log: (m) => logs.push(m),
    });
    expect(exitCode).toBe(0);
    expect(logs.join('\n')).toMatch(/dry-run OK/);
  });

  it('exits 2 (config missing) when not in dry-run and no config exists', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dt-uploader-nocfg-'));
    let exitCode: number | undefined;
    await runDaemon({
      homedir: () => home,
      dryRun: false,
      exit: (c) => {
        exitCode = c;
      },
      log: () => {},
    });
    expect(exitCode).toBe(2);
  });
});
