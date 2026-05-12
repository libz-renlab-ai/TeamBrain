# Judge — issue #315 embedder RAM bomb

> Playbook for the third-party LLM-judge that consumes evidence produced
> by `scripts/judge/issue-315.mjs`. The script is the harness; this
> file is the judge's reading order and verdict criteria.

## §V1 RUN

Run from the repo root after the implementation branch is in place:

```bash
node scripts/judge/issue-315.mjs
```

Six tools, each writes `<tool>.<stdout|exit|stderr|tracker|results>`
under `.fixedflow/judge/issue-315/`. All status info is rolled up
into `judge.json` at the end.

| Tool | Command (the harness invokes) | Pass condition |
|---|---|---|
| V1.1 typecheck | `pnpm typecheck` | exit 0 |
| V1.2 test-cli | `pnpm exec vitest run <5 target test files>` | exit 0 |
| V1.3 test-adapters | `pnpm exec vitest run <2 adapter test files>` | exit 0 |
| V1.4 build | `pnpm -F @teamagent/cli build` | exit 0 + `dist/bin-user-prompt-submit.cjs` exists |
| V1.5 single-tracker | spawn `bin-user-prompt-submit.cjs` once with `TEAMAGENT_XENOVA_TRACKER=<tmp>` | tracker file has **0** lines |
| V1.6 concurrent-tracker | 5×`bin-session-start.cjs` + 5×`bin-pre-tool-use.cjs` in parallel, all sharing `TEAMAGENT_XENOVA_TRACKER` + `TEAMAGENT_XENOVA_TRACKER_FAIL_FAST=1` | tracker file has **≤ 1** line; if 1 line, argv contains `bin-embedder.cjs` |

The concurrent probe sets `FAIL_FAST=1` so the moment any second loader
appears, all 10 child processes self-terminate via `process.exit(2)`
inside the `XenovaRuleEmbedder` ctor. This protects the test machine
from being OOM-spiked by the very bug we are verifying.

## §V2 DUMP

`judge.json` shape:

```json
{
  "run_id": "issue-315-<unix>",
  "issue": 315,
  "startedAt": "<iso>",
  "finishedAt": "<iso>",
  "evidence_dir": ".fixedflow/judge/issue-315/",
  "expected": {
    "typecheck":          { "exit": 0 },
    "test-cli":           { "exit": 0 },
    "test-adapters":      { "exit": 0 },
    "build":              { "exit": 0 },
    "single-tracker":     { "exit": 0, "xenova_loads": 0 },
    "concurrent-tracker": { "xenova_loads_max": 1, "loader_argv_contains": "bin-embedder.cjs" }
  },
  "actual": {
    "<tool>": { "tool": "...", "startedAt": "...", "finishedAt": "...", "passed": true/false, ... }
  },
  "allPassed": true/false
}
```

## §V3 READ — Verdict

The external LLM-judge reads `judge.json` + the raw evidence files
and emits `verdict.json`:

```json
{
  "run_id": "<as above>",
  "verdict": "pass" | "fail" | "uncertain",
  "rationale": "1-3 sentence summary",
  "per_tool": {
    "<tool>": { "expected": ..., "actual": ..., "match": true/false }
  }
}
```

### Pass / Fail logic

- **PASS** iff all six tools `passed: true` AND `allPassed: true`.
- **FAIL** if any tool fails its expected condition, with the
  rationale identifying the failed tool. Specifically:
  - V1.5 fail (`xenovaLoads > 0` on the single bin-user-prompt-submit
    invocation) → A1 regression (UserPromptSubmit still hits in-process
    Xenova).
  - V1.6 fail (`xenovaLoads > 1`) → either A2 regression
    (daemon-unreachable fallback still loads Xenova) or A4 regression
    (race lock missing / broken).
  - typecheck / test failures → trivial regressions.
- **UNCERTAIN** allowed only when the harness itself errored out
  before producing per-tool results (e.g. `node:fs` permission denied
  on the temp dir).

### Rejection reasons

The judge must NOT mark PASS if:

- `concurrent-tracker.actual.loaderArgv` contains anything other than a
  single entry mentioning `bin-embedder.cjs` (a foreign Xenova loader
  is a regression in disguise).
- `concurrent-tracker.actual.childResults` shows any child timed out
  (timeout might mask a regression that wasn't fast enough to trigger
  `FAIL_FAST` exit).
- `build.actual.distExists` is false (we cannot have verified the bins
  if they don't exist).

The judge SHOULD mark UNCERTAIN if `concurrent-tracker` was skipped due
to build failure — that means we don't actually know whether the race
locks work end-to-end, only that the unit tests pass.
