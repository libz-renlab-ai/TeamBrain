import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #368 — runtime contract for the staged digital-twin binaries.
 *
 * `bin-uploader.cjs` (and `bin-prod-server.cjs`) are copied to
 * `~/.teamagent/digital-twin/` by `teamagent install-hook` and self-installed
 * by `bin-digital-twin-tap.ts`'s `resolveDaemonBin`. That directory has no
 * `node_modules` tree, so any pure-JS dependency the bundle leaves as an
 * external `require()` call fails with `MODULE_NOT_FOUND` when the daemon is
 * spawned — and because `tap-session.ts` spawns it with stdio captured to a
 * log file (not the terminal), the crash is invisible to the user.
 *
 * Audit scope (grill Q2): the only non-builtin in the uploader's `require()`
 * graph is `ulid`. The 7 hook bins + `bin-digital-twin-tap.cjs` +
 * `bin-updater.cjs` are built by `packages/cli/tsup.hook.config.ts` /
 * `packages/teamagent/tsup.config.ts`, both of which already `noExternal` the
 * workspace packages + `zod` + `ulid` (+ `js-tiktoken`, `@xenova/transformers`);
 * native `.node` addons stay external on purpose. So `ulid` in these two CJS
 * bins is the whole audit. This test locks the fix at the built artifact.
 *
 * Skipped when `dist/` hasn't been built — unit-test CI runs without a build;
 * the build-config.test.ts static check covers that path, and the J1/J2 probes
 * (docs/plans/2026-05-12-issue-368/judge.md) run after a real build.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(HERE, '..', '..', 'dist');

const STAGED_BINS = ['bin-uploader.cjs', 'bin-prod-server.cjs'];
// Pure-JS deps that must be inlined into the staged CJS bins (no node_modules
// at the staging location). Add here whenever a new pure-JS dep enters the
// uploader/prod-server call graph; never add native .node addons.
const REQUIRED_INLINED = ['ulid'];

const distBuilt = STAGED_BINS.every((b) => fs.existsSync(path.join(DIST_DIR, b)));

describe.skipIf(!distBuilt)('digital-twin staged .cjs bundle contract (issue #368)', () => {
  for (const bin of STAGED_BINS) {
    for (const dep of REQUIRED_INLINED) {
      it(`${bin} has no external require("${dep}")`, () => {
        const text = fs.readFileSync(path.join(DIST_DIR, bin), 'utf-8');
        const re = new RegExp(
          `require\\(["']${dep.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}["']\\)`,
        );
        expect(
          re.test(text),
          `dist/${bin} contains an external require("${dep}") — it must be inlined ` +
            `(noExternal in packages/digital-twin/tsup.config.ts), otherwise the staged ` +
            `~/.teamagent/digital-twin/${bin} hits MODULE_NOT_FOUND on spawn (issue #368)`,
        ).toBe(false);
      });
    }
  }
});
