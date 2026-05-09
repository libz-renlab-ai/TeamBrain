```
                                          ┌─────────────────────────────┐
   teamagent warmup ────► runWarmup ──────►  haveVectorOptionals?       │
                                           │                             │
                                           │   yes  ─► XenovaEmbedder    │
                                           │           ─► state=ready    │
                                           │           ─► exit 0         │
                                           │                             │
                                           │   no   ─► friendly message  │
                                           │           ─► state=skipped  │
                                           │           ─► exit 0  ◄─── NEW
                                           └─────────────────────────────┘
                                                       │
                       postinstall.mjs ────► same gate ► appendLog stage=warmup
                                                          status=skipped
                                                          reason=optional-not-installed
```

# Plan — issue #160: postinstall warmup graceful skip

## 1. Task description (做什么 / 怎么做 / 不做什么)

**做什么.** When the optional vector deps (`@xenova/transformers` + `onnxruntime-node`) are absent, both `teamagent warmup` and the postinstall warmup gate must (a) emit a friendly skip message instead of an error, (b) exit / record `status=skipped` instead of `exit=1`, (c) leave the state file (`~/.teamagent/.warmup-state.json`) and the postinstall log (`~/.teamagent/postinstall.log`) in a state that downstream tools (`bin-pre-tool-use`, `doctor`, bug-report graders) can read as "skipped on purpose," distinct from "warmup never reached."

**怎么做.**

1. `packages/cli/src/warmup-state.ts` — extend `WarmupStatus` with `"skipped"`; teach `describeWarmupReadiness` to return `{ready: false, reason: "skipped"}` for that status. `bin-pre-tool-use` already falls back to legacy on any non-`ready` reason, so this is a no-op for the runtime matcher path.
2. `packages/cli/src/commands/warmup.ts` — add an injectable `haveVectorOptionals?: () => boolean` option (defaults to a real fs/createRequire check that mirrors `init.ts:haveVectorOptionals` and `postinstall.mjs:vectorOptionalsInstalled`). When `!opts.embedder && !haveVectorOptionals()`, write a friendly stderr message, write `status="skipped"` to the state file, and return `{ok: true, skipped: true, reason: "optional-deps-missing", durationMs}`. With an embedder injected (tests), bypass the gate so existing test patterns stay deterministic.
3. `packages/cli/src/bin.ts` — no change. The existing `process.exit(result.ok ? 0 : 1)` now exits 0 on graceful skip because `ok=true`.
4. `packages/teamagent/postinstall.mjs` — add `recordSetupStatus(stage, status, detail)` helper (symmetric with `recordSetupFailure`); call it on the existing skip / foreground-ok / detached branches so `postinstall.log` records a positive `stage=warmup status=skipped reason=optional-not-installed` (or `status=ok` / `status=detached`) instead of going silent.

**不做什么.**

- No refactor of the duplicated `haveVectorOptionals` logic across `init.ts` / `postinstall.mjs` / `warmup.ts`. Three callers in three boundaries (CLI command, `init` flow, postinstall mjs script) intentionally don't share a module — postinstall.mjs ships standalone without `@teamagent/core`. ADR for de-duping is out of scope.
- No `--help` / `doctor` UX rewrite for vector-matcher discoverability. That intersects with #173 (help UX) and would expand the diff outside the issue spec.
- No change to `optionalDependencies` policy (ADR 0001 §opt-in stands).
- No new env vars; reuse `TEAMAGENT_INCLUDE_OPTIONAL=1` and the existing install instructions from postinstall.mjs banner.

## 2. Expected outputs (可验收交付物)

| Artifact | Acceptance check |
|---|---|
| `packages/cli/src/warmup-state.ts` | `WarmupStatus` includes `"skipped"`; `describeWarmupReadiness` returns `reason: "skipped"` for that status |
| `packages/cli/src/commands/warmup.ts` | `runWarmup` returns `{ok: true, skipped: true, reason: "optional-deps-missing"}` when `haveVectorOptionals()` is false and no embedder is injected; writes `status: "skipped"` to state file; emits friendly stderr (no "失败" wording) |
| `packages/cli/src/bin.ts:1041` | Exits 0 when `result.ok && result.skipped` (no behavior change needed) |
| `packages/teamagent/postinstall.mjs` | New `recordSetupStatus` helper writes `[<ts>] stage=<stage> status=<status> reason=<detail>` lines to `~/.teamagent/postinstall.log`; called from skip / foreground-ok / detached branches |
| `packages/cli/src/__tests__/warmup.test.ts` | 3 new tests for skip path: ok=true skipped=true on missing optionals; state file shows `status: "skipped"`; injected embedder bypasses gate |
| All existing tests | 220 test files / 2401 tests still pass |
| `pnpm typecheck` | Clean |

## 3. How to evaluate from a 3rd-party harness (judge harness)

See `judge.md` in this directory. Three-stage RUN / DUMP / READ playbook. The MAIN agent dispatches probes, the harness emits raw JSON to `.judge/<run>/`, and a separate LLM reads only the raw JSON to render the verdict — never grades its own implementation. Anchors that must appear in the verdict JSON:

- **V1 (unit)**: vitest exit_code=0; warmup.test.ts has ≥3 new tests; warmup-state.test.ts still passes
- **V2 (state file)**: integration probe writes `status:"skipped"` JSON when `haveVectorOptionals=()=>false`; same probe writes `status:"ready"` when an embedder is injected
- **V3 (postinstall.log)**: simulating the optional-deps-absent install path produces a `stage=warmup status=skipped reason=optional-not-installed` line; the old `stage=warmup exit=1` pattern does NOT appear

## 4. claudefast probes (verification)

Run the probes in `judge.md` §V4 to validate that the docs match the diff. Probes target the `/Users/m1/projects/TeamBrain/.codex/worktrees/issue-160` worktree, not the parent checkout — until merge, `origin/main` does not have these symbols.
