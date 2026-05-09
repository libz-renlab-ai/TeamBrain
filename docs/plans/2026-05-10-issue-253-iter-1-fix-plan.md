```text
   /review iter-1 finding (CRITICAL × 2)
   ════════════════════════════════════
   install-plugins.test.ts L66-76     install-plugins.test.ts L116-131
   "--only filters plugins"           "propagates installer failure"
       │                                  │
       │  hard-codes "sales"              │  hard-codes p.plugin === "sales"
       │  & "sales@knowledge-work-...     │  & sales finding lookup
       │                                  │
       └────────── same root ─────────────┘
                    ▼
   sales is no longer in DEFAULT_PLUGINS (removed in 6457d10
   per user instruction "do not install them"). Tests that
   used `sales` as a known plugin must switch to a plugin
   that IS in the new bundle.
                    ▼
   FIX in same PR branch (PR-PLAN, no follow-up issues)
```

# PR-PLAN — `feat/issue-253` iter-1 fix plan

`/review` iter-1 against `origin/main` produced 2 CRITICAL findings in `packages/cli/src/__tests__/install-plugins.test.ts`. Both share root cause: the tests had ambient knowledge that `sales@knowledge-work-plugins` was a member of `DEFAULT_PLUGINS`. After commit `6457d10` removed `sales`, those literals must move to a plugin that IS in the new bundle.

## 1. Task

**Fix 2 broken tests** in `packages/cli/src/__tests__/install-plugins.test.ts`:

- **F1** L66-76 `executeInstallPlugins > --only filters plugins but still registers all required marketplaces` — replace `only: ["sales"]` + `expect(...).toBe("sales@knowledge-work-plugins")` + marketplace assertion `["knowledge-work-plugins"]` with a plugin that IS in the post-`6457d10` `DEFAULT_PLUGINS`. Pick `code-review` (in bundle, marketplace `claude-plugins-official`).
- **F2** L116-131 `executeInstallPlugins > propagates installer failure without aborting remaining items` — replace `p.plugin === "sales"` + `r.name.startsWith("sales@")` with a different plugin that IS in the bundle. Pick `commit-commands` (different from F1 to avoid coupling between the two cases).

Don't touch L45-46 (`parseInstallPluginsArgs` test for `--only=superpowers,sales` CSV parsing): that test asserts parser behavior on arbitrary string input, not bundle membership; passes as-is and removing the stale literals would be unrelated cleanup churn.

Don't touch L147-179 (`renderInstallPluginsResult` shape test): hard-coded input data; pure rendering check; passes as-is.

## 2. Expected outputs

| change | path | notes |
|--------|------|-------|
| edit | `packages/cli/src/__tests__/install-plugins.test.ts` L66-76 | substitute `code-review` / `code-review@claude-plugins-official` / marketplace `["claude-plugins-official"]` |
| edit | `packages/cli/src/__tests__/install-plugins.test.ts` L116-131 | substitute `commit-commands` / `commit-commands@` |
| commit | `feat/issue-253` | message: `fix(issue-253): /review iter-1 — fix install-plugins tests for new DEFAULT_PLUGINS bundle` |

Also do a separate non-fix concern in this same iteration:

| change | path | notes |
|--------|------|-------|
| rebase | `feat/issue-253` | `git fetch && git rebase origin/main` to incorporate `8ffd9cc` (issue-146-f1) and `29ecf6f` landed after worktree was cut. No conflict expected (different files). |

## 3. Judge harness (third-party, JSON-shaped)

V1 RUN — fixed tools:

```bash
WT=/Users/m1/projects/TeamBrain/.codex/worktrees/issue-253
RUN_DIR=$WT/.judge/2026-05-10-issue-253-iter-1
mkdir -p "$RUN_DIR/raw"; cd "$WT"
pnpm exec vitest run packages/cli/src/__tests__/install-plugins.test.ts > "$RUN_DIR/raw/01-vitest.out" 2> "$RUN_DIR/raw/01-vitest.err"; echo $? > "$RUN_DIR/raw/01-vitest.exit"
pnpm exec vitest run packages/core/src/init/__tests__/default-plugins.test.ts > "$RUN_DIR/raw/02-vitest-defaults.out" 2> "$RUN_DIR/raw/02-vitest-defaults.err"; echo $? > "$RUN_DIR/raw/02-vitest-defaults.exit"
pnpm typecheck > "$RUN_DIR/raw/03-typecheck.out" 2> "$RUN_DIR/raw/03-typecheck.err"; echo $? > "$RUN_DIR/raw/03-typecheck.exit"
git -C "$WT" log --oneline origin/main..HEAD > "$RUN_DIR/raw/04-commits.out"; echo $? > "$RUN_DIR/raw/04-commits.exit"
```

V2 DUMP — `judge.json`:

```json
{
  "iter": 1,
  "exit_code": "<max of step exit codes>",
  "metrics": {
    "install_plugins_tests_passed": "<bool, step 1 exit==0 + 12 passed in stdout>",
    "default_plugins_tests_passed": "<bool, step 2 exit==0 + 10 passed in stdout>",
    "root_typecheck_passed": "<bool, step 3 exit==0>",
    "rebased_onto_origin_main": "<bool, step 4 stdout shows no commits in origin/main..HEAD beyond the 3 issue-253 commits + the iter-1 fix>"
  },
  "evidence_dir": ".judge/2026-05-10-issue-253-iter-1/raw/"
}
```

V3 READ — LLM judge gate:

```bash
claudefast -p "Read .judge/2026-05-10-issue-253-iter-1/judge.json + raw/. Return PASS/FAIL. PASS only if all 4 metrics are true."
```
