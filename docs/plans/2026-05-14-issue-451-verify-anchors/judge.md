# Judge Playbook — issue #451 verify-anchors harness

> Third-party MD playbook (per `docs/HOWTO-PLAN-PR.md` § 3b). The MAIN agent
> dispatches the §V1 commands, captures evidence, writes `judge.json`. A
> SEPARATE `claudefast -p` invocation reads `judge.json` only and emits
> `PASS` / `FAIL` / `SKIP`. The implementation under test (`verify-anchors.ts`)
> never grades itself.

## Origin
- Issue: [#451](https://github.com/libz-renlab-ai/TeamBrain/issues/451)
- Plan: [`plan.md`](plan.md)
- Status: **active**

## §V1 RUN

MAIN agent runs these commands sequentially. Save stdout/stderr/exit-code into
`evidence_dir = .judge/verify-anchors-<run_id>/`:

```bash
RUN_ID="$(date +%Y%m%dT%H%M%S)"
EVID=".judge/verify-anchors-${RUN_ID}"
mkdir -p "${EVID}"

# Probe 1: live harness against project CLAUDE.md.
# IMPORTANT: invoke tsx directly, NOT through pnpm — pnpm prepends a 2-line
# "> teamagent@0.1.0 ..." header to stdout that makes the file unparseable as JSON.
npx tsx packages/cli/src/bin.ts verify-anchors --json \
  > "${EVID}/output.json" 2> "${EVID}/stderr.log"
echo $? > "${EVID}/exit_code.txt"

# Probe 2: unit/contract tests for the parser+validator
pnpm vitest run packages/cli/src/__tests__/verify-anchors.test.ts \
  --reporter=json \
  > "${EVID}/vitest.json" 2> "${EVID}/vitest.stderr.log"
echo $? > "${EVID}/vitest_exit.txt"

# Probe 3: typecheck the new module compiles cleanly
( cd packages/cli && pnpm typecheck ) \
  > "${EVID}/typecheck.log" 2>&1
echo $? > "${EVID}/typecheck_exit.txt"

# Probe 4: confirm the 6 doc files now contain their canonical anchor sentences verbatim
for pair in \
  "docs/TWO-DRIVER-COEXISTENCE.md:TeamBrain has two drivers" \
  "docs/3-METHODS-WORKFLOW.md:TeamBrain supports 3 methods of workflow" \
  "docs/SYMPHONY-FLOW.md:TeamBrain Symphony track has 5 phases" \
  "docs/VISUAL-PROOF-PR.md:Visual-proof-guided PR workflow has two steps" \
  "docs/VISUAL-PROOF-FORMAT.md:Visual proof of work HTML must be hosted on public storage the PR proposer fully owns" \
  "docs/VISUAL-PROOF-CONTENT.md:Visual proof of work HTML must include at least these four content categories"; do
  f="${pair%%:*}"
  needle="${pair#*:}"
  grep -cF -- "${needle}" "${f}" > "${EVID}/doc_${f//\//_}.count.txt" 2>&1
done
```

## §V2 DUMP

After §V1 finishes, MAIN agent writes `${EVID}/judge.json`:

```jsonc
{
  "run_id": "<RUN_ID>",
  "exit_code": <int from exit_code.txt>,
  "metrics": {
    "anchor_count":     <verify-anchors output.json totalCount>,
    "pass_count":       <verify-anchors output.json passCount>,
    "fail_count":       <verify-anchors output.json failCount>,
    "vitest_pass_count":<count from vitest.json>,
    "vitest_fail_count":<count from vitest.json>,
    "typecheck_exit":   <int from typecheck_exit.txt>,
    "docs_mirror_hits": {
      "TWO-DRIVER":     <int>,
      "3-METHODS":      <int>,
      "SYMPHONY":       <int>,
      "VISUAL-PROOF-PR":<int>,
      "VP-FORMAT":      <int>,
      "VP-CONTENT":     <int>
    }
  },
  "evidence_dir":   "<EVID>",
  "stdout_path":    "<EVID>/output.json",
  "feature_status": "active"
}
```

All values are mechanically computable from raw probe outputs in `evidence_dir`.
No LLM phrasing required at this stage.

## §V3 READ

A SEPARATE `claudefast -p` invocation reads ONLY `judge.json` and the raw
artifacts in `evidence_dir`. It receives the following prompt verbatim:

```text
Read .judge/verify-anchors-<run_id>/judge.json and the raw artifacts in its
evidence_dir. Emit verdict PASS / FAIL / SKIP. Criteria are pinned and
deterministic — do not infer from project culture or "vibes":

- PASS iff ALL of:
  - exit_code == 0
  - metrics.fail_count == 0
  - metrics.anchor_count >= 15
  - metrics.vitest_pass_count >= 20
  - metrics.vitest_fail_count == 0
  - metrics.typecheck_exit == 0
  - EVERY docs_mirror_hits.* value >= 1

- FAIL otherwise. Report which criterion failed and quote the raw value from
  judge.json. Do NOT propose fixes — that is the implementer's job.

- SKIP only if judge.json is missing or unreadable.

Do not read source code. Do not re-derive metrics. Only read raw artifacts.
```

## Why this counts as a third-party harness

| Property | Satisfied? | How |
|---|---|---|
| Verifier ≠ system under test | ✅ | `verify-anchors.ts` is verified by `vitest` + `tsc` + `grep -cF`, all of which existed before this PR. |
| Probes pinned, not LLM-generated | ✅ | Five concrete shell commands, no model-generated arguments. |
| LLM reads raw bytes, not paraphrased descriptions | ✅ | §V3 prompt explicitly forbids re-derivation; reads JSON + log files only. |
| PASS/FAIL criteria pinned in advance | ✅ | All threshold values inlined in §V3 prompt, can be `grep`-checked. |
| Exit-code surface for CI / regression guard | ✅ | `pnpm teamagent verify-anchors` exits non-zero on any FAIL anchor; can be wired into a future pre-commit / CI step. |

## Re-run cadence

- Manual: `bash docs/plans/2026-05-14-issue-451-verify-anchors/run.sh` (TBD, optional)
- Automatic: any time a `CLAUDE.md` anchor block or a referenced `docs/*.md` is edited.
- Regression guard: surfaces `count-mismatch`, `missing-substring`, `docs-link-missing`,
  `anchor-sentence-not-in-docs`, `duplicate-anchor-sentence` drift instantly.
