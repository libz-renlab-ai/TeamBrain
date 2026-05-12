import { defineConfig } from 'tsup';

/**
 * Issue #368 — the staged uploader daemon must be self-contained.
 *
 * `bin-uploader.cjs` (and `bin-prod-server.cjs`) are copied to
 * `~/.teamagent/digital-twin/` by `teamagent install-hook`
 * (`stageDaemonBinaryToUser`) and self-installed by `bin-digital-twin-tap.ts`'s
 * `resolveDaemonBin`. That directory has **no `node_modules` tree**, so any
 * external `require()` left in the bundle is a `MODULE_NOT_FOUND` at module
 * load → the daemon (spawned with stdio captured to `uploader.log`) crashes
 * before doing anything → the queue never drains → zero transcripts ever
 * reach the collector. The user sees no error.
 *
 * `ulid` is the only non-builtin in the uploader's `require()` graph
 * (`bin-uploader.ts` → `./index.js` → `identity.ts` `import { ulid }`,
 * `./daemon/process-manager.js` → `./queue.ts`, …). It has zero runtime
 * deps, so inlining it is cheap. Bundling `ulid` here mirrors
 * `packages/cli/tsup.hook.config.ts`, which already `noExternal`s `ulid`
 * for the staged CJS hook bins.
 *
 * Note: `ulid`'s CJS `require("crypto")` only breaks tsup's *ESM* `__require`
 * shim (issue #158) — that's why `packages/teamagent/tsup.config.ts` keeps
 * `ulid` *external* for the ESM `bin.js`. These are CJS bundles, where
 * `require()` works natively, so `noExternal: ['ulid']` is safe here.
 *
 * Native `.node` addons must stay external (esbuild can't bundle them); the
 * uploader graph doesn't pull any in, so the default external behaviour is
 * fine — we only force-bundle `ulid`.
 */
export default defineConfig([
  {
    // Library entry points (consumed by other workspace packages via tsx /
    // direct source import in dev, and by the bundled cli in release).
    entry: ['src/index.ts', 'src/mock-server.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist',
    clean: false,
    sourcemap: false,
    splitting: false,
  },
  {
    // Staged binaries: must run from `~/.teamagent/digital-twin/` with no
    // node_modules → self-contained CJS, ulid inlined.
    entry: ['src/bin-prod-server.ts', 'src/bin-uploader.ts'],
    format: ['cjs'],
    target: 'node16',
    outDir: 'dist',
    clean: false,
    sourcemap: false,
    splitting: false,
    noExternal: ['ulid'],
  },
]);
