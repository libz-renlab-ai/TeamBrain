# judge.md — issue #280 V4 harness

Independent verification harness per `docs/feature-verification.md` V4 and `docs/PLAN-RESEARCH-REPORT.md` 三段铁律 §3. Output is JSON for an LLM judge to render `pass | fail`. The driver and reviewer do **not** read the verdict themselves — it's an external artifact attached to the PR.

Runner is finalized in commit 5: `scripts/judge/issue-280.mjs`.

## §V1 RUN

```bash
# From repo root (or any worktree where node_modules is installed)
node scripts/judge/issue-280.mjs run
```

The runner executes three probes sequentially and writes raw artifacts under `.fixedflow/judge/issue-280/`:

### Probe 1 — `unit.json`

Runs the relevant vitest files in single-thread mode and captures vitest's `--reporter=json` output:

```bash
pnpm vitest run \
  packages/cli/src/__tests__/doctor.test.ts \
  packages/adapters/src/llm/__tests__/claude-code-client.test.ts \
  packages/cli/src/__tests__/bin-session-start-chaos.test.ts \
  --reporter=json --outputFile=.fixedflow/judge/issue-280/unit.json
```

Pass criteria: every test under the `issue-280` / `checkHookSpawn` / `defaultSpawner Windows` / `bin-session-start chaos` describe blocks reports `state: "pass"` and the file-level `numFailedTests` is 0.

### Probe 2 — `chaos.json`

Creates a tmpdir, symlinks the repo's `node_modules` minus `web-tree-sitter` and the transitive xenova/onnxruntime entries that bin-session-start.cjs pulls. Spawns the built `bin-session-start.cjs` with empty stdin and a 10s timeout. Writes:

```json
{
  "name": "chaos-missing-optional-deps",
  "exitCode": <number|null>,
  "stderr": "<tail 5 lines>",
  "stdout": "<tail 5 lines>",
  "timedOut": <bool>,
  "removedDeps": ["web-tree-sitter", "<transitive>"],
  "elapsedMs": <number>
}
```

Pass criteria: `exitCode === 0` AND `stderr` contains the conservative-mode banner string (asserted byte-for-byte against the banner in `ast-context.ts` to anchor the contract).

### Probe 3 — `doctor.json`

Runs `pnpm teamagent doctor --json` twice — once with a deliberately broken hook script registered in a tmp settings.json (broken = a `.cjs` file that throws on `require()` of a missing module), and once with a working hook script. Captures both outputs:

```json
{
  "name": "doctor-spawn-probe-flips-color",
  "broken": { "allPassed": false, "checks": [ /* including hook-spawn fail */ ] },
  "fixed":  { "allPassed": true,  "checks": [ /* including hook-spawn pass */ ] }
}
```

Pass criteria: `broken.allPassed === false` AND any `broken.checks[i].name === "hook-spawn"` has `status === "fail"`; `fixed.allPassed === true` AND its hook-spawn check has `status === "pass"`.

## §V2 DUMP

After all probes run, the harness emits a canonical roll-up at `.fixedflow/judge/issue-280/dump.json`:

```json
{
  "issue": 280,
  "ranAt": "<ISO timestamp>",
  "host": "<hostname>",
  "platform": "<process.platform>",
  "probes": [
    { "name": "unit",   "passed": <bool>, "details": { /* abbreviated unit.json */ } },
    { "name": "chaos",  "passed": <bool>, "details": { /* abbreviated chaos.json */ } },
    { "name": "doctor", "passed": <bool>, "details": { /* abbreviated doctor.json */ } }
  ],
  "overall": <bool>,
  "expectedSchema": "issue-280/v1"
}
```

The dump is the canonical artifact the LLM judge reads. Per-probe `passed` is the harness's mechanical check; `overall` is `probes.every(p => p.passed)`. The dump is purely descriptive — the judge LLM is responsible for the actual verdict (e.g., the judge may flag false positives such as a chaos pass that nevertheless logs a stack trace).

## §V3 READ

A downstream LLM (any model — `claudefast -p`, GPT, Gemini) consumes `dump.json` and writes `.fixedflow/judge/issue-280/verdict.json`:

```json
{
  "verdict": "pass" | "fail" | "uncertain",
  "rationale": "<short prose>",
  "concerns": ["<concern 1>", "..."],
  "reproCommand": "node scripts/judge/issue-280.mjs run",
  "counterExampleInputs": ["<inputs that would flip a true pass to fail>"],
  "judgedAt": "<ISO>",
  "judgeModel": "<name>"
}
```

The judge prompt template (committed in commit 5 alongside the runner):

> You are evaluating whether the implementation of FIXEDFLOW issue #280 satisfies its grill plan. Read `dump.json` (attached). For each probe, determine whether the harness's mechanical `passed` is trustworthy or masks a regression. Return strict JSON with the schema above. Do **not** read the implementation diff — your job is to judge the harness output independently.

The verdict file is attached to the PR as a comment by the maintainer after merge — it is not gating because the LLM judge is itself fallible. The /review skill remains the authoritative termination gate per ADR-0007.

## Reuse

This harness is reusable for any future regression on hook spawn or Windows spawn correctness. Re-run §V1, re-emit §V2 dump, re-judge §V3. The schema version `expectedSchema: "issue-280/v1"` lets future harness changes be detected by the LLM judge.

---

End of judge spec. Runner ships in commit 5.
