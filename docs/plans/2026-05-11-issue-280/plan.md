# plan.md — issue #280

Three-section discipline per `docs/PLAN-RESEARCH-REPORT.md`. Companion to `research.md` (audit) and `judge.md` (V4 harness).

---

## 1. Task description

Fix three bugs that together silently kill teamagent's auto-update and learning loops on a non-trivial subset of Windows users:

1. **Main bug — Windows spawn hits stale npm prefix.** On machines with a relocated npm prefix (`%APPDATA%\npm` left over after switching to a custom `node_global` like `D:\Node2\node_global`), Node's `spawn('claude', shell:false)` does not honor `PATHEXT` and lands on the old `claude.exe` launcher that points to a deleted `cli.js`. `analyze --commit` then logs `correctionsFound=N, extracted=0, failed=N` every cycle and learning halts — but the error is swallowed by `runExtractPipeline`'s inner try/catch and never surfaces to the user.

2. **Adjacent bug — bin-session-start crashes on missing optional deps.** `postinstall` copies `bin-session-start.cjs` to `~/.teamagent/hooks/`, but transitive `require()` of optional peer deps (`web-tree-sitter`, `tree-sitter-*`, indirect `@xenova/transformers` chain) — which #158 removed from `dependencies` — throws `MODULE_NOT_FOUND` at module-load time before any code runs. Every SessionStart silently dies, so `spawnUpdater()` never fires and auto-update has been dormant on these machines for 3+ days.

3. **Hidden bug — doctor reports false green.** `checkHookScript` only verifies the `.cjs` file exists. A script can exist and still crash on top-level `require()`, leaving the user with all-green `teamagent doctor` output while learning + auto-update are both silently dead.

The three are reported together by the user (per issue body) and have a single fix surface (Windows install path + hook spawn correctness), so they ship in one PR as the grill comment specifies.

## 2. Expected outputs

Five atomic commits on `feat/issue-280`, in this order (each commit independently green per project meta-constraint #4 "Walking Skeleton 不断裂"):

1. **`feat(issue-280): doctor 真跑 hook 验证 (warn-only)`**
   - `packages/cli/src/commands/doctor.ts`: add `HookProbe` / `HookProbeResult` types matching the existing `ClaudeProbe` shape; add `defaultHookProbe` (spawns hook with empty stdin, 5s timeout); add `checkHookSpawn(scriptPath, probe?)` returning `pass` on exit 0 and `skip` (⚠️ prefix) on any failure; wire `checkHookSpawn` into `executeDoctor` after `checkHookScript`, gated on `hookScriptCheck.status === "pass"`.
   - `packages/cli/src/__tests__/doctor.test.ts`: vitest cases with injected probes covering `pass`, `timeout`, `non-zero exit`, `spawn error`. Status is `skip` (not `fail`) so `allPassed` is not flipped — this is the warn-only contract.

2. **`fix(issue-280): claude-code-client Windows 上 shell:true 兜底`**
   - `packages/adapters/src/llm/claude-code-client.ts`: in `defaultSpawner`, switch the spawn options to `shell: process.platform === "win32"` while keeping `shell: false` on macOS/Linux. Add a short comment recording the safety reasoning (command is the hard-coded `"claude"`, args are fixed literals, prompt is stdin).
   - `packages/adapters/src/llm/__tests__/claude-code-client.test.ts`: assertion that on Windows the `Spawner` receives spawn options with `shell: true`, and on non-Windows it receives `shell: false`. Reuses `makeSpawner(behavior)` pattern.

3. **`fix(issue-280): bin-session-start 软降级 optional dep`**
   - Trace the actual transitive import that causes `MODULE_NOT_FOUND: web-tree-sitter` from `bin-session-start.cjs` (suspect chain: `daemon-first-embedder` / `embedder-client` / matcher entries). Re-shape each offending site to the `try { require(...) } catch { return null }` factory pattern already used by `packages/core/src/matcher/legacy/ast-context.ts:initAstMatcher`. Log a single conservative-mode banner to stderr if the dep is missing — same words as `ast-context.ts` for consistency.
   - Chaos test in `packages/cli/src/__tests__/`: temporarily rename `node_modules/web-tree-sitter` (and any other transitive culprit found in this commit), spawn the real built `bin-session-start.cjs` with empty stdin, assert exit code 0 and stderr contains the conservative-mode banner.

4. **`fix(issue-280): doctor hook 检查升级强制 fail`**
   - `packages/cli/src/commands/doctor.ts`: flip the four `checkHookSpawn` non-pass return paths from `status: "skip"` (warn) to `status: "fail"` (strict). Now after commits 2 + 3 land, the real bug is fixed; if anything regresses, doctor surfaces red and `allPassed` flips. Existing pass case unchanged.
   - Update doctor.test.ts cases accordingly.

5. **`test(issue-280): judge harness JSON dump for issue-280`**
   - `docs/plans/2026-05-11-issue-280/judge.md` — finalized harness spec (already drafted; commit 5 freezes the runner steps).
   - `scripts/judge/issue-280.mjs` (or equivalent under `scripts/`): three runnable harness probes that dump
     1. `unit.json` — vitest output for the new spawn + hook unit tests
     2. `chaos.json` — exit code + stderr of `bin-session-start.cjs` spawn under chaos-renamed `node_modules/`
     3. `doctor.json` — `teamagent doctor --json` output before vs after applying the hook spawn fix
   - The judge harness is V4 per `docs/feature-verification.md`: produces structured JSON for an independent LLM judge to render a `pass | fail` verdict.

Three planning artifacts must exist by the time the PR opens:

- `docs/plans/2026-05-11-issue-280/research.md` (this folder, written in §0 before code) — explorer-agent audit of the actual source files.
- `docs/plans/2026-05-11-issue-280/plan.md` (this document) — three-section discipline.
- `docs/plans/2026-05-11-issue-280/judge.md` — V4 harness spec; finalized in commit 5.

Output deliverables of the PR (deliverables list, used as the PR-body "expected outputs" section per `docs/HOWTO-PLAN-PR.md`):

- `packages/adapters/src/llm/claude-code-client.ts` — Windows `shell:true` branch.
- `packages/cli/src/commands/doctor.ts` — `HookProbe`, `defaultHookProbe`, `checkHookSpawn` (strict fail after commit 4).
- `packages/cli/src/bin-session-start.ts` and the transitive culprit modules — lazy-degraded optional deps.
- `packages/adapters/src/llm/__tests__/claude-code-client.test.ts` — Windows spawn assertion.
- `packages/cli/src/__tests__/doctor.test.ts` — hook spawn probe cases.
- `packages/cli/src/__tests__/bin-session-start-chaos.test.ts` (new) — chaos rename + real spawn.
- `scripts/judge/issue-280.mjs` (new) and `docs/plans/2026-05-11-issue-280/judge.md` — V4 dump harness.
- `docs/plans/2026-05-11-issue-280/{research,plan,judge}.md` — three planning docs.

## 3. How to eval — 3rd-party harness producing JSON for LLM judge

Per `docs/PLAN-RESEARCH-REPORT.md` 三段铁律 §3, the verifier runs a harness independent of the implementation that emits a "ton of JSON" and lets an LLM judge render PASS/FAIL. Full spec lives in `judge.md`; summary:

- **§V1 RUN**: `node scripts/judge/issue-280.mjs run` executes three probes (unit, chaos, doctor-before-fix vs doctor-after-fix) and writes raw outputs to `.fixedflow/judge/issue-280/`.
- **§V2 DUMP**: the same script emits a canonical `dump.json` snapshot containing per-probe `name | status | exitCode | stdoutTail | stderrTail | observedKey | expectedKey | matches` rows.
- **§V3 READ**: a downstream LLM judge consumes `dump.json` and produces `verdict.json` with `pass | fail | uncertain` plus rationale. The driver does **not** read the verdict itself (no overfitting) — it stays a third-party artifact attached to the PR.

The judge harness is reusable: any future hook-spawn regression can be re-verified by running the same `scripts/judge/issue-280.mjs run` and inspecting the dump.

PR body (per `docs/HOWTO-PLAN-PR.md`):

- **plan**: extracted from the grill comment (linked in PR description).
- **expected outputs**: the deliverables list above.
- **how-to-verify**: link to `docs/plans/2026-05-11-issue-280/judge.md` plus inline copy of §V1 RUN command.
- **claudefast probes**: any `!claudefast -p` probes captured during commit 1 development (per `docs/feature-verification.md` V1).

---

End of plan. Implementation starts at commit 1.
