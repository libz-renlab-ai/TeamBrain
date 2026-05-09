```text
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  V1  RUN     │ →  │  V2  DUMP    │ →  │  V3  READ    │
   │ fixed tools  │    │ judge.json   │    │ raw JSON     │
   │ exit_code +  │    │ + raw evid   │    │ → LLM judge  │
   │ stdout/err   │    │ (no LLM yet) │    │ PASS / FAIL  │
   └──────────────┘    └──────────────┘    └──────────────┘
```

# Judge harness — Issue #253

Third-party judge: code 不评自己。固定工具跑、固定 JSON 落盘、另一只 LLM 只读 raw artifact 决断。

## V1 RUN — fixed tools

Driver 在 worktree 跑下面 5 步。每步 capture stdout/stderr + exit_code 到 `.judge/2026-05-10-issue-253/raw/<step>.{out,err,exit}`：

```bash
WT=/Users/m1/projects/TeamBrain/.codex/worktrees/issue-253
RUN_DIR=$WT/.judge/2026-05-10-issue-253
mkdir -p "$RUN_DIR/raw"
cd "$WT"

# step 1: codex mirror name-set equality
diff <(ls -1 .claude/skills | sort) <(ls -1 .codex/skills | sort) > "$RUN_DIR/raw/01-mirror.out" 2> "$RUN_DIR/raw/01-mirror.err"; echo $? > "$RUN_DIR/raw/01-mirror.exit"

# step 2: DEFAULT_PLUGINS / DEFAULT_MARKETPLACES content
node --experimental-vm-modules -e '
import("./packages/core/src/init/default-plugins.ts").catch(()=>null);
' > /dev/null 2>&1 || true
pnpm exec tsx -e '
import { DEFAULT_PLUGINS, DEFAULT_MARKETPLACES } from "./packages/core/src/init/default-plugins.ts";
console.log(JSON.stringify({mp: DEFAULT_MARKETPLACES.map(x=>x.name), pl: DEFAULT_PLUGINS.map(x=>x.plugin+"@"+x.marketplace)}, null, 2));
' > "$RUN_DIR/raw/02-defaults.out" 2> "$RUN_DIR/raw/02-defaults.err"; echo $? > "$RUN_DIR/raw/02-defaults.exit"

# step 3: settings.json enabled keys (SoT)
node -e 'const s=require("./.claude/settings.json"); console.log(JSON.stringify({enabled:Object.keys(s.enabledPlugins||{}), mp:Object.keys(s.extraKnownMarketplaces||{})}, null, 2));' > "$RUN_DIR/raw/03-sot.out" 2> "$RUN_DIR/raw/03-sot.err"; echo $? > "$RUN_DIR/raw/03-sot.exit"

# step 4: unit tests
pnpm exec vitest run packages/core/src/init/__tests__/default-plugins.test.ts > "$RUN_DIR/raw/04-vitest.out" 2> "$RUN_DIR/raw/04-vitest.err"; echo $? > "$RUN_DIR/raw/04-vitest.exit"

# step 5: root typecheck (project-canonical)
pnpm typecheck > "$RUN_DIR/raw/05-typecheck.out" 2> "$RUN_DIR/raw/05-typecheck.err"; echo $? > "$RUN_DIR/raw/05-typecheck.exit"
```

## V2 DUMP — `judge.json`

```json
{
  "issue": 253,
  "run_id": "2026-05-10-issue-253",
  "exit_code": <max of step exit codes>,
  "metrics": {
    "codex_mirror_diff_empty": <bool, step 1 exit==0 && stdout empty>,
    "default_marketplaces_count": <int, parsed from step 2 stdout>,
    "default_plugins_count": <int, parsed from step 2 stdout>,
    "default_plugins_set_equals_settings_enabled": <bool, set(step 2 .pl) == set(step 3 .enabled)>,
    "default_marketplace_equals_settings": <bool, set(step 2 .mp) == set(step 3 .mp)>,
    "unit_tests_passed": <bool, step 4 exit==0>,
    "unit_tests_count": <int, parsed from step 4 stdout>,
    "root_typecheck_passed": <bool, step 5 exit==0>
  },
  "evidence_dir": ".judge/2026-05-10-issue-253/raw/",
  "stdout_paths": [
    ".judge/2026-05-10-issue-253/raw/01-mirror.out",
    ".judge/2026-05-10-issue-253/raw/02-defaults.out",
    ".judge/2026-05-10-issue-253/raw/03-sot.out",
    ".judge/2026-05-10-issue-253/raw/04-vitest.out",
    ".judge/2026-05-10-issue-253/raw/05-typecheck.out"
  ]
}
```

## V3 READ — LLM judge prompt (PASS / FAIL gate)

```bash
claudefast -p "$(cat <<EOF
Read .judge/2026-05-10-issue-253/judge.json plus every file in .judge/2026-05-10-issue-253/raw/.
Return exactly one of: PASS / FAIL.

PASS criteria (ALL must hold):
  1. metrics.codex_mirror_diff_empty == true
  2. metrics.default_marketplaces_count == 1
  3. metrics.default_plugins_count == 6
  4. metrics.default_plugins_set_equals_settings_enabled == true
  5. metrics.default_marketplace_equals_settings == true
  6. metrics.unit_tests_passed == true && metrics.unit_tests_count == 10
  7. metrics.root_typecheck_passed == true

If FAIL, give a one-line reason naming the metric that failed and quoting the raw evidence file path.

DO NOT execute code. DO NOT trust your memory. Only read raw artifacts.
EOF
)"
```

## Already-run results (driver, this branch)

| metric | value |
|--------|-------|
| `codex_mirror_diff_empty` | `true` (commit `7a5f971`, `diff` empty in driver step 3 verify) |
| `default_marketplaces_count` | `1` (`claude-plugins-official` only) |
| `default_plugins_count` | `6` (matches `.claude/settings.json:enabledPlugins` keys) |
| `unit_tests_passed` | `true` (`10/10 passed` in `vitest run`) |
| `root_typecheck_passed` | `true` (`pnpm typecheck` at root, exit 0; package-level `@teamagent/core` rootDir error is pre-existing on `origin/main` and out of scope) |

## Pre-existing blocker noted (out of scope)

`pnpm --filter @teamagent/core typecheck` reports `TS6059` for `fixtures/scenarios/*.ts` not being under `packages/core/src` rootDir. This error exists on `origin/main` independently of this PR (verified: I never modified `fixtures/` nor `packages/core/src/scenario/`). The project-canonical gate is root-level `pnpm typecheck` against `tsconfig.base.json`, which passes. Track separately if it needs fixing.
