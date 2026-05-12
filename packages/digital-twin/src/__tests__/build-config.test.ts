import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue-146 / issue-368 regression guard for the digital-twin build config.
 *
 * issue #146 (original F1 bug): `bin-uploader.ts` existed in source but was
 * never added to the build entry list, so `dist/bin-uploader.cjs` never
 * existed in any release. The Stop hook then silently skipped the daemon
 * spawn → 0 transcripts uploaded.
 *
 * issue #368 (this issue): `bin-uploader.cjs` *was* built, but the build
 * left `require("ulid")` external. The staged `~/.teamagent/digital-twin/
 * bin-uploader.cjs` runs from a dir with no `node_modules` → `MODULE_NOT_FOUND`
 * on module load → the daemon crashes silently on spawn → queue never drains.
 * Fix: a `tsup.config.ts` that `noExternal`s `ulid` for the CJS bin entries.
 *
 * Both checks are static (read the config file) so they catch regressions
 * without requiring an actual build in unit-test CI.
 */
describe('digital-twin tsup build config', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = join(here, '..', '..', 'tsup.config.ts');
  const config = readFileSync(configPath, 'utf-8');
  const pkgJsonPath = join(here, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
    scripts?: { build?: string };
  };

  it('package.json build script delegates to tsup (uses tsup.config.ts)', () => {
    expect(pkg.scripts?.build ?? '').toBe('tsup');
  });

  it('includes bin-uploader.ts in the CJS entry list', () => {
    expect(config).toMatch(/src\/bin-uploader\.ts/);
  });

  it('includes bin-prod-server.ts in the CJS entry list', () => {
    // Sibling regression guard — same class of bug, different binary.
    expect(config).toMatch(/src\/bin-prod-server\.ts/);
  });

  it('still emits the esm library entries (index + mock-server)', () => {
    expect(config).toMatch(/src\/index\.ts/);
    expect(config).toMatch(/src\/mock-server\.ts/);
  });

  it('force-bundles ulid via noExternal so the staged bin-uploader.cjs is self-contained (issue #368)', () => {
    // Capture every noExternal: [...] block; at least one must list "ulid".
    const blocks = [...config.matchAll(/noExternal:\s*\[([\s\S]*?)\]/g)].map((m) => m[1] ?? '');
    expect(blocks.length, 'no noExternal block found in tsup.config.ts').toBeGreaterThan(0);
    expect(
      blocks.some((b) => /["']ulid["']/.test(b)),
      'tsup.config.ts must noExternal "ulid" — otherwise the staged ' +
        '~/.teamagent/digital-twin/bin-uploader.cjs hits MODULE_NOT_FOUND on spawn (issue #368)',
    ).toBe(true);
  });
});
