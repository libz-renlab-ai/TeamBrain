# research.md — issue #368: digital-twin upload silently broken on fresh install

## Symptom (from grill)
After `teamagent init` + CC restart, no transcripts reach `http://192.168.22.88:8080/`. Dashboard shows zero data for that user. No error surfaced.

## Root cause (confirmed in repo)
- `~/.teamagent/digital-twin/bin-uploader.cjs` is the uploader daemon, staged from `packages/digital-twin/dist/bin-uploader.cjs` (`install-hook.ts:defaultDaemonBinSource` → `<cliRoot>/../digital-twin/dist/bin-uploader.cjs`; also `bin-digital-twin-tap.ts:resolveDaemonBin` self-installs the same monorepo dist file).
- `packages/digital-twin/package.json:scripts.build` = `tsup src/index.ts src/mock-server.ts --format esm --dts && tsup src/bin-prod-server.ts src/bin-uploader.ts --format cjs --target node16 --out-dir dist` — **no `noExternal`**, so the produced `bin-uploader.cjs` keeps `require("ulid")` external. `bin-uploader.ts` → `./index.js` → `identity.ts` (`import { ulid } from 'ulid'`), and `./daemon/process-manager.js` path graph, etc. `~/.teamagent/` has no `node_modules` → `MODULE_NOT_FOUND` at module load → daemon crashes before doing anything.
- `tap-session.ts` spawns the daemon with `stdio: 'ignore'` → the crash is invisible. Queue (`~/.teamagent/digital-twin/queue/pending/`) never drains.

Asymmetry: `packages/cli/tsup.hook.config.ts` and `packages/teamagent/tsup.config.ts` both handle `ulid` (bundle it in the CJS hook bins / npm-install it as a sibling dep for the ESM `bin.js`). Only the `packages/digital-twin` build is missing the `noExternal`.

Note re ESM gotcha (issue #158): `ulid`'s CJS `require("crypto")` only breaks tsup's **ESM** `__require` shim — that's why `teamagent/tsup.config.ts` keeps `ulid` *external* for the ESM `bin.js` entry and ships it as an installed dependency. The digital-twin staged binaries are **CJS** (`--format cjs`), where `require()` works natively — same as `tsup.hook.config.ts`'s CJS hook bins, which already `noExternal: ['ulid']`. So bundling `ulid` into a CJS bundle is the correct, proven fix.

## Other staged .cjs (Q2 audit)
- 7 hook bins + `bin-digital-twin-tap.cjs` + `bin-updater.cjs` + `bin-embedder.cjs` are built by `packages/cli/tsup.hook.config.ts` (dev) and `packages/teamagent/tsup.config.ts` (release). Both configs `noExternal` the workspace packages + `zod` + `ulid` + (cli config) `js-tiktoken` + `@xenova/transformers`; native `.node` addons stay external on purpose. → no un-bundled pure-JS external in those bins.
- `bin-uploader.cjs` (+ `bin-prod-server.cjs`) from `packages/digital-twin` is the only offender. Fixed by Q1.
- `bin-updater.cjs` "session-start:updater-bin-missing" is a *file-presence* symptom (the install table referenced a bundle the release tarball didn't ship), already addressed by `checkInstallTableBundles` in `doctor.ts` (issue #299). Out of scope for #368 beyond the contract test below; not a `require()` issue.

## Plan
- **Q1**: new `packages/digital-twin/tsup.config.ts` (array: esm entries + dts; cjs entries `bin-prod-server`/`bin-uploader` with `noExternal: ['ulid']`). `package.json:scripts.build` → `tsup`. Update `build-config.test.ts` to assert against the config file (entries + `noExternal` includes `ulid`).
- **Q2**: contract test `packages/digital-twin/src/__tests__/uploader-bundle-contract.test.ts` — when `dist/bin-uploader.cjs` exists, assert no `require("ulid")` / `require('ulid')`. Skip when dist absent (so it doesn't force a build in CI unit runs).
- **Q3**: `tap-session.ts` — spawn daemon with stdout/stderr → `~/.teamagent/digital-twin/uploader.log` (append) instead of `'ignore'`. `digital-twin status` (and the doctor check) report queue-pending, dead-letter, daemon pid, **last uploader error** (scan `uploader.log` tail for crash/Error/MODULE_NOT_FOUND lines).
- **Q4**: `bin-uploader.ts` honors `TEAMAGENT_UPLOADER_DRYRUN=1` → load all imports, print `digital-twin uploader: dry-run OK`, exit 0 (before config load). `doctor.ts` `checkDigitalTwinUploader(home)` — if staged bin missing → skip; else spawn `node bin-uploader.cjs` with `TEAMAGENT_UPLOADER_DRYRUN=1` → `pass` if exit 0 & no MODULE_NOT_FOUND, else `fail` with the stderr tail. Surfaces as `digital-twin-uploader: OK|BROKEN`.
- **Q5**: INSTALL.md troubleshooting section — pnpm absent → `npm install -g pnpm`; China network mirror env vars (env-only, don't touch `~/.npmrc`); `teamagent init` "Hook bundle not found" → `pnpm --filter @teamagent/cli build:hook`; full CC restart for Stop hook.
- **Q6**: `docs/plans/2026-05-12-issue-368/judge.md` — J1..J4 probes (J3 = the acceptance red line, manual fresh-install + curl `/api/dates`).

## Acceptance
J3 must PASS: vanilla install, no manual `cp ulid` hack, uploads CC transcripts to the collector. The deterministic proxy for J3 in CI/unit: J1 (build digital-twin, `node -e "require(<abs>/bin-uploader.cjs)"` in a no-node_modules tmp dir → no MODULE_NOT_FOUND) + J2 (grep built bin for `require("ulid")` → absent) + Q4 doctor check.
