```
   judge.md — third-party harness playbook for PR-375
   ───────────────────────────────────────────────────
   probe 1: vitest ─────────► evidence/probe-1/vitest.json
   probe 2: init+rc ─────────► evidence/probe-2/check.json + stat-sha
   probe 3: m5-infect ──────► evidence/probe-3/output.txt
                                       │
                                       ▼
                              claudefast LLM-judge (separate session)
                              reads ONLY raw JSON + evidence files
                              emits PASS|FAIL on single line
```

# judge.md — issue #284 slice 1

> Per `~/.claude/CLAUDE.md` §plan.md 三段铁律 and user-level memory `feedback_judge_harness_md_playbook.md`: the verdict harness is an MD playbook the main agent dispatches via subagents or `claudefast -p` probes; it is **never** a `scripts/*.sh` runner. The LLM judge reads only the raw probe output (JSON + captured files) and emits a single-line PASS / FAIL. The harness does NOT call CLI self-report (`pnpm teamagent calibrate` logs) or `/review` output as verification, because those are code grading itself inside the system's trust boundary (per `feedback_verification_only_judge_harness.md`).

## Scope

This judge harness gates PR #375 (slice 1 of issue #284). PASS requires all three probes in §3 PASS and the final claudefast judge to emit `PASS` on its first line.

## Pinned PASS thresholds

- Probe 1 vitest: `numFailedTests === 0 && numPassedTests >= 41` (18 required-check + 4 init slice-1 cases + 3 m5-infect deprecation cases + 16 unchanged adjacent cases that must still pass).
- Probe 2 init smoke: exit 0 from `teamagent required-check --project=$TMP --json`; the captured `evidence/probe-2/check.json` has `{status:"ok", schema:"teamagent.required.v1", mode:"required"}`; re-running `teamagent init` yields byte-identical `.teamagent/required.json` and `.claude/hooks/check-teamagent.sh` (sha256 stable).
- Probe 3 m5-infect: stdout of `pnpm teamagent m5-infect --project-root=$TMP` contains the case-insensitive substring `[legacy]` AND the substring `teamagent init`.

## Probes

### Probe 1 — vitest (third-party tool)

```bash
mkdir -p docs/plans/2026-05-12-issue-284/evidence/probe-1
pnpm vitest run \
  packages/cli/src/__tests__/required-check.test.ts \
  packages/cli/src/__tests__/init.test.ts \
  packages/cli/src/__tests__/m5-cli.test.ts \
  --reporter=json \
  --outputFile=docs/plans/2026-05-12-issue-284/evidence/probe-1/vitest.json
```

### Probe 2 — init + required-check smoke (third-party tools: node + bash + sha256sum)

```bash
TMP=$(mktemp -d)
HOME_TMP=$(mktemp -d)
mkdir -p docs/plans/2026-05-12-issue-284/evidence/probe-2

pnpm teamagent init --cwd=$TMP --home=$HOME_TMP --skip-import --skip-warmup --skip-seed --no-user-level-hook \
  > docs/plans/2026-05-12-issue-284/evidence/probe-2/init.txt

ls -la $TMP/.teamagent/required.json $TMP/.claude/hooks/check-teamagent.sh \
  > docs/plans/2026-05-12-issue-284/evidence/probe-2/files.txt

pnpm teamagent required-check --project=$TMP --json \
  > docs/plans/2026-05-12-issue-284/evidence/probe-2/check.json
echo "RC_EXIT=$?" >> docs/plans/2026-05-12-issue-284/evidence/probe-2/check.json

# Idempotency: byte-identical content + sha256 match across runs
SHA_REQ_BEFORE=$(sha256sum $TMP/.teamagent/required.json | awk '{print $1}')
SHA_SH_BEFORE=$(sha256sum $TMP/.claude/hooks/check-teamagent.sh | awk '{print $1}')
pnpm teamagent init --cwd=$TMP --home=$HOME_TMP --skip-import --skip-warmup --skip-seed --no-user-level-hook \
  > /dev/null
SHA_REQ_AFTER=$(sha256sum $TMP/.teamagent/required.json | awk '{print $1}')
SHA_SH_AFTER=$(sha256sum $TMP/.claude/hooks/check-teamagent.sh | awk '{print $1}')

jq -n \
  --arg req_before "$SHA_REQ_BEFORE" --arg req_after "$SHA_REQ_AFTER" \
  --arg sh_before  "$SHA_SH_BEFORE"  --arg sh_after  "$SHA_SH_AFTER" \
  '{required_json:{sha_before:$req_before, sha_after:$req_after, stable:($req_before==$req_after)},
    check_teamagent_sh:{sha_before:$sh_before, sha_after:$sh_after, stable:($sh_before==$sh_after)}}' \
  > docs/plans/2026-05-12-issue-284/evidence/probe-2/idempotency.json
```

### Probe 3 — m5-infect deprecation banner (third-party tools: grep + node + git)

```bash
TMP=$(mktemp -d)
mkdir -p docs/plans/2026-05-12-issue-284/evidence/probe-3
git init -q $TMP
git -C $TMP config user.email tester@example.com
git -C $TMP config user.name tester

pnpm teamagent m5-infect --project-root=$TMP \
  > docs/plans/2026-05-12-issue-284/evidence/probe-3/output.txt

grep -qi '\[legacy\].*teamagent init' \
  docs/plans/2026-05-12-issue-284/evidence/probe-3/output.txt \
  && echo '{"banner_present": true}' \
  || echo '{"banner_present": false}' \
  > docs/plans/2026-05-12-issue-284/evidence/probe-3/grep.json
```

## Final verdict (LLM judge)

```bash
claudefast -p "You are the third-party verdict judge for PR #375 on the TeamBrain repo (issue #284 slice 1).

Read all of the following files (and NOTHING else from the repo). Do not run any code, do not call any other tools.

- docs/plans/2026-05-12-issue-284/plan.md              (the spec the PR claims to deliver)
- docs/plans/2026-05-12-issue-284/judge.md             (this playbook + PASS thresholds)
- docs/plans/2026-05-12-issue-284/evidence/probe-1/vitest.json
- docs/plans/2026-05-12-issue-284/evidence/probe-2/check.json
- docs/plans/2026-05-12-issue-284/evidence/probe-2/files.txt
- docs/plans/2026-05-12-issue-284/evidence/probe-2/idempotency.json
- docs/plans/2026-05-12-issue-284/evidence/probe-3/output.txt
- docs/plans/2026-05-12-issue-284/evidence/probe-3/grep.json

For each of the three probes, apply the pinned PASS thresholds in judge.md §'Pinned PASS thresholds'.

Output rules:
- Line 1 MUST be exactly 'PASS' or 'FAIL' (no other words).
- Lines 2+: one paragraph explaining your reasoning, citing concrete numbers from the JSON files (e.g. 'vitest: 116 passed, 0 failed').
- Do NOT cite or trust /review output, ADR commentary, or PR description.
- Do NOT cite any source not listed above.
"
```

## Why this satisfies the third-party-harness contract

1. **Tools predate the repo**: vitest, node, bash, jq, grep, sha256sum, mktemp, git — all OS / package-manager utilities that existed long before TeamBrain.
2. **Evidence is the source of truth**: the JSON / txt files captured under `evidence/` are byte-for-byte raw output, not LLM-rephrased.
3. **Judge is a separate session**: the final `claudefast -p` runs in its own context window with no shared memory of this PR. It cannot see commit messages, PR description, or this main agent's prior reasoning. It only reads the captured files.
4. **Pinned thresholds**: numeric thresholds (e.g. `numPassedTests >= 41`, sha-256 equality, grep substring) are deterministic, not LLM-fuzzy.
5. **No code grading itself**: vitest is third-party; the .json output captured is the system under test reporting raw facts, which the judge then interprets, not the system writing "I am OK".
