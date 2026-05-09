```
existing gates                           gap (issue #160)              fix
─────────────────                       ───────────────                ───────────────
postinstall.mjs:vectorOptionalsInstalled  no symmetric positive log      recordSetupStatus()
init.ts:haveVectorOptionals               not consulted by `teamagent     defaultHaveVectorOptionals()
                                          warmup` directly               in runWarmup
warmup.ts:runWarmup                       returns ok=false on missing    skipped path returns
                                          @xenova → exit=1               ok=true skipped=true
warmup-state.ts:WarmupStatus              "downloading|ready|failed"      adds "skipped"
```

# Research — issue #160 graceful skip

## Existing checks (pre-issue)

The repo already has a `haveVectorOptionals` gate in **two** places:

1. `packages/teamagent/postinstall.mjs:24` — `vectorOptionalsInstalled(pkgDir)` does a bounded fs walk + pnpm-aware `createRequire` resolution. When false, postinstall short-circuits Stage 2 with `warmupStatus = "vector-deps-absent"` and never spawns warmup. Landed in `be65c31` (2026-05-07).
2. `packages/cli/src/commands/init.ts:262` — `haveVectorOptionals` (closure) does the same thing for the `teamagent init` flow. When false, `init` records `{step:"warmup", status:"skipped"}` in its return.

The two implementations are intentionally duplicated: postinstall.mjs ships standalone (no `@teamagent/core` import) and the `init.ts` closure runs in TS land. ADR for de-duping is out of scope of this issue.

## What was missing (the actual #160 gap)

Despite those two gates, the `runWarmup` function inside `packages/cli/src/commands/warmup.ts` did **not** check optional deps. So:

- `teamagent warmup` invoked manually (no postinstall, no init) attempted to load `@teamagent/adapters → XenovaRuleEmbedder`, which then tried to import `@xenova/transformers`. When missing, the embedder throws → `runWarmup` returns `{ok: false, error: "Cannot find package '@xenova/transformers'..."}`. The CLI wiring in `bin.ts:1041` (`process.exit(result.ok ? 0 : 1)`) then exits 1.
- The state file went to `status: "failed"` even though the failure was structural (missing optional dep), not transient (network).
- `~/.teamagent/postinstall.log` was silent on the skip path. `recordSetupFailure` only triggered for `recordSetupFailure("warmup", err)` — i.e., genuine spawn failures during foreground/detached. The skip branch wrote nothing, leaving doctor / bug-report tools unable to distinguish "skipped on purpose" from "warmup never reached" (e.g., postinstall.mjs crashed before Stage 2).

## Issue body's reproducer (timestamp drift)

The issue (filed 2026-05-08) referenced a log line dated 2026-05-06 with `stage=warmup exit=1`. By 2026-05-08, `be65c31` had landed (2026-05-07), so the postinstall path was already gated. But the **manual** `teamagent warmup` reproducer in the issue's "现象" block was still valid — and that's the gap this PR closes.

## Files touched

```
packages/cli/src/warmup-state.ts                    +5/-1   add "skipped" status, reason union
packages/cli/src/commands/warmup.ts                 +95/-2  haveVectorOptionals option, skip branch
packages/teamagent/postinstall.mjs                  +29/-0  recordSetupStatus, 4 call sites
packages/cli/src/__tests__/warmup.test.ts           +63/-1  3 new skip-path tests
docs/plans/2026-05-09-issue-160/{plan,judge,research}.md  new  per Boris workflow
```

## Decisions deferred

- **Doctor row for "vector matcher: not installed"** — the issue's point 3 asks for clearer doctor / `--help` UX. That intersects with #173 (help UX rewrite) and would expand the PR scope. Punt.
- **Refactor `haveVectorOptionals` to a shared helper** — three callers, three boundaries, intentionally duplicated. No refactor.
- **Change `optionalDependencies` in `package.json`** — out of scope (ADR 0001 §opt-in stands).
