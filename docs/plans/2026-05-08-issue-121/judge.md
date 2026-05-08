```text
                  judge.md — issue #121 third-party harness
                  ==========================================

       §V1 RUN              §V2 DUMP              §V3 READ
   ┌────────────┐       ┌────────────┐       ┌────────────────┐
   │ fixed      │       │ canonical  │       │ separate LLM   │
   │ tools:     │  ───► │ JSON to    │  ───► │ (claudefast    │
   │ bash -n,   │       │ .judge/    │       │  + codex)      │
   │ dry-run,   │       │ <run_id>/  │       │ reads ONLY     │
   │ grep,      │       │ judge.json │       │ raw JSON +     │
   │ gen-sha,   │       │            │       │ evidence_dir.  │
   │ actionlint │       │ +stdout/   │       │ Cross-LLM      │
   │ pnpm test  │       │  stderr to │       │ verdict hard-  │
   │            │       │ evidence/  │       │ matched.       │
   └────────────┘       └────────────┘       └────────────────┘
                                                     │
                                                     ▼
                                          PASS or FAIL+reasons
```

# Issue #121 — Third-Party Judge Harness (md playbook)

> **Hard rule.** Third-party judge harness forbidden fixed scripts; MUST
> use md playbook. No `scripts/*.sh` substitute. Failed sections rerun by
> re-dispatching `§V<n>`, not by editing scripts.

## Run identifier

```
RUN_ID="issue-121-$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR=".judge/${RUN_ID}/evidence"
JUDGE_JSON=".judge/${RUN_ID}/judge.json"
mkdir -p "${EVIDENCE_DIR}"
```

The MAIN agent picks `RUN_ID` once before §V1, exports both env vars,
and uses them throughout. Lead does NOT reuse a previous run's
`evidence_dir`.

---

## §V1 RUN — fixed tools

Each step writes stdout to `${EVIDENCE_DIR}/<step_id>.out` and stderr to
`${EVIDENCE_DIR}/<step_id>.err`. The exit code is captured into a
companion `<step_id>.exit` file (single integer, no newline sensitivity).
Lead invokes each step exactly once per run; on FAIL of an individual
step, the step rerun replaces only that step's evidence files (other
steps untouched).

### V1.1 — install.sh syntax check

```bash
bash -n release/install.sh \
  > "${EVIDENCE_DIR}/v1.1.out" 2> "${EVIDENCE_DIR}/v1.1.err"
echo $? > "${EVIDENCE_DIR}/v1.1.exit"
```

PASS if `v1.1.exit == 0` and `v1.1.err` is empty.

### V1.2 — install-legacy.sh syntax check

```bash
bash -n release/install-legacy.sh \
  > "${EVIDENCE_DIR}/v1.2.out" 2> "${EVIDENCE_DIR}/v1.2.err"
echo $? > "${EVIDENCE_DIR}/v1.2.exit"
```

PASS if `v1.2.exit == 0`. Legacy must still pass `bash -n` (it's POSIX
sh, so bash strict-parses it as a superset).

### V1.3 — install.sh dry-run line count + exit

```bash
bash release/install.sh --dry-run \
  > "${EVIDENCE_DIR}/v1.3.out" 2> "${EVIDENCE_DIR}/v1.3.err"
echo $? > "${EVIDENCE_DIR}/v1.3.exit"
grep -c '^\[dry-run\]' "${EVIDENCE_DIR}/v1.3.out" \
  > "${EVIDENCE_DIR}/v1.3.lines"
```

PASS if `v1.3.exit == 0` AND `v1.3.lines == 7`. (Was 6 in
`install.sh.draft`; bumped to 7 by Worker B's archive-fallback line.)

### V1.4 — gen-sha256 produces matching checksum

```bash
release-prep/gen-sha256.sh release/install.sh /dev/null \
  > "${EVIDENCE_DIR}/v1.4.out" 2> "${EVIDENCE_DIR}/v1.4.err"
echo $? > "${EVIDENCE_DIR}/v1.4.exit"
diff -u release/install.sh.sha256 \
        <(cd release && shasum -a 256 install.sh) \
  > "${EVIDENCE_DIR}/v1.4.diff" 2>&1 || true
```

PASS if `v1.4.exit == 0` AND `v1.4.diff` is empty (committed `.sha256`
matches freshly-computed sha256). NOTE: gen-sha256.sh writes to
`release/install.sh.sha256`; that's the artifact under check.

### V1.5 — sha256 verification roundtrip

```bash
( cd release && shasum -a 256 -c install.sh.sha256 ) \
  > "${EVIDENCE_DIR}/v1.5.out" 2> "${EVIDENCE_DIR}/v1.5.err"
echo $? > "${EVIDENCE_DIR}/v1.5.exit"
```

PASS if `v1.5.exit == 0` AND `v1.5.out` contains the line
`install.sh: OK`.

### V1.6 — TLS / proto flag presence (P4-M03)

```bash
grep -cE '\-\-tlsv1\.2' release/install.sh \
  > "${EVIDENCE_DIR}/v1.6.tls"
grep -cE "\-\-proto '?=https'?" release/install.sh \
  > "${EVIDENCE_DIR}/v1.6.proto"
```

PASS if both files contain `1` or higher.

### V1.7 — redirect domain guard (P4-M05)

```bash
grep -c 'allowed_hosts' release/install.sh \
  > "${EVIDENCE_DIR}/v1.7.out"
```

PASS if value is `≥ 1`.

### V1.8 — fallback chain count (P4-M06)

```bash
( grep -c 'FALLBACK_BASE' release/install.sh; \
  grep -c 'archive/refs/heads/release' release/install.sh ) \
  > "${EVIDENCE_DIR}/v1.8.out"
```

PASS if **sum of the two counts ≥ 5** (4 from FALLBACK_BASE + 1 from
archive fallback). Worker B's archive fallback is what tips this from
the original draft's count of 4 to 5.

### V1.9 — workflow lint

```bash
# Prefer actionlint if installed; fall back to yamllint.
if command -v actionlint >/dev/null 2>&1; then
  actionlint .github/workflows/release-branch.yml \
    > "${EVIDENCE_DIR}/v1.9.out" 2> "${EVIDENCE_DIR}/v1.9.err"
  echo $? > "${EVIDENCE_DIR}/v1.9.exit"
elif command -v yamllint >/dev/null 2>&1; then
  yamllint .github/workflows/release-branch.yml \
    > "${EVIDENCE_DIR}/v1.9.out" 2> "${EVIDENCE_DIR}/v1.9.err"
  echo $? > "${EVIDENCE_DIR}/v1.9.exit"
else
  echo "no linter available" > "${EVIDENCE_DIR}/v1.9.out"
  echo 127 > "${EVIDENCE_DIR}/v1.9.exit"
fi
```

PASS if `v1.9.exit == 0`. If `127` (no linter), the §V3 LLM judge is
told to treat this step as INCONCLUSIVE rather than FAIL.

### V1.10 — workflow stages new files (grep proof)

```bash
( grep -c "install-legacy.sh" .github/workflows/release-branch.yml; \
  grep -c "install.sh.sha256"  .github/workflows/release-branch.yml; \
  grep -cE "gen-sha256.sh|shasum -a 256[^|]*/tmp/release-stage" \
    .github/workflows/release-branch.yml ) \
  > "${EVIDENCE_DIR}/v1.10.out"
```

PASS if all three counts are `≥ 1`. This is the "did Worker A wire
Worker B's outputs into the workflow" cross-check. The third pattern
accepts either invocation of `release-prep/gen-sha256.sh` OR an inline
`shasum -a 256` against the staged path — both are legitimate ways to
produce `install.sh.sha256` for staging. The Worker A v2 refactor
removed the helper-script call in favour of an inline `shasum` because
the workflow regenerates the sha256 AFTER the staged install.sh has
been templated; the source-file helper would generate the wrong hash.

### V1.11 — pnpm test green-baseline

```bash
pnpm test \
  > "${EVIDENCE_DIR}/v1.11.out" 2> "${EVIDENCE_DIR}/v1.11.err"
echo $? > "${EVIDENCE_DIR}/v1.11.exit"
```

PASS if `v1.11.exit == 0`. This PR adds no tests; the bar is
"don't regress".

### V1.12 — pnpm typecheck

```bash
pnpm typecheck \
  > "${EVIDENCE_DIR}/v1.12.out" 2> "${EVIDENCE_DIR}/v1.12.err"
echo $? > "${EVIDENCE_DIR}/v1.12.exit"
```

PASS if `v1.12.exit == 0`.

### V1.14 — workflow contains version-detection + Release-creation logic (3a)

```bash
( grep -c "packages/teamagent/package.json" .github/workflows/release-branch.yml; \
  grep -c "gh release create" .github/workflows/release-branch.yml; \
  grep -c "gh release view" .github/workflows/release-branch.yml ) \
  > "${EVIDENCE_DIR}/v1.14.out"
```

PASS if all three counts are `≥ 1`. (Detect version from package.json,
create release, idempotency check via `release view`.)

### V1.15 — workflow uploads Release assets (3a)

```bash
( grep -cE 'teamagent-v?\$\{?[A-Z_]+\}?\.tgz' .github/workflows/release-branch.yml; \
  grep -c '\.sha256' .github/workflows/release-branch.yml ) \
  > "${EVIDENCE_DIR}/v1.15.out"
```

PASS if both counts `≥ 1`. (Tarball name is parameterised; `.sha256` is
referenced for asset upload.)

### V1.16 — workflow has tarball-build step (3a)

```bash
grep -cE 'pnpm pack|pnpm.*--filter teamagent.*pack' \
  .github/workflows/release-branch.yml \
  > "${EVIDENCE_DIR}/v1.16.out"
```

PASS if value is `≥ 1`. (Worker A must invoke `pnpm pack` to produce
the tarball before `gh release create` uploads it.)

### V1.17 — workflow templates install.sh + regenerates sha256 from staged copy (3a v2 fix)

```bash
( grep -c "sed -i.*TEAMAGENT_VERSION" .github/workflows/release-branch.yml; \
  grep -c "shasum -a 256 /tmp/release-stage" .github/workflows/release-branch.yml ) \
  > "${EVIDENCE_DIR}/v1.17.out"
```

PASS if both counts are `≥ 1`. This guards against the version-drift bug
where `release/install.sh` source defaults to a hardcoded
`TEAMAGENT_VERSION:-v0.9.4` even when the actual release tag is e.g.
`v0.10.1`. The workflow must `sed`-replace the staged copy so the
user-served install.sh tracks the actual release tag, then regenerate
the sha256 from the templated file (so the published `install.sh.sha256`
matches what the user downloads).

### V1.18 — workflow has semver guard for VERSION (PR-180 fix CRIT #2/#3)

```bash
( grep -cE '\$VERSION" =~|VERSION.*=~ \^\[0-9\]' .github/workflows/release-branch.yml; \
  grep -c 'printf .tag=v%s' .github/workflows/release-branch.yml ) \
  > "${EVIDENCE_DIR}/v1.18.out"
```

PASS if both counts are `≥ 1`. Guards against shell-injection / GITHUB_OUTPUT
newline-injection via a malicious `packages/teamagent/package.json` version
field; also avoids `echo`'s `\n`/`\\` interpretation in the GITHUB_OUTPUT
write.

### V1.19 — install.sh re-fetches itself for self-verify (PR-180 fix CRIT #1)

```bash
( grep -c '_download_with_fallback "\$SELF_URL\|_curl_safe "\$SELF_URL' \
    release/install.sh; \
  grep -c 'cp "\$0"' release/install.sh ) \
  > "${EVIDENCE_DIR}/v1.19.out"
```

PASS if first count `≥ 1` AND second count `== 0`. The first re-confirms
SELF_URL is now USED for re-download; the second confirms the broken
`cp "$0"` self-verify pattern was REMOVED.

### V1.20 — _download_with_fallback returns instead of exits (PR-180 fix CRIT #4)

```bash
awk '/^_download_with_fallback\(\)/{flag=1} flag && /^}/{flag=0} flag && /return 1/' \
  release/install.sh \
  | wc -l > "${EVIDENCE_DIR}/v1.20.out"
```

PASS if value `≥ 1`. Confirms the `exit 1` → `return 1` change inside the
function body, making the archive-fallback `[ ! -s ]` guard at line ~168
reachable.

<!--
Ordering note: §V1.13 below is appended AFTER §V1.20 instead of between
§V1.12 and §V1.14 because V1.13 was inserted into the playbook AFTER
V1.14-V1.20 were already numbered (Worker C v2 round 1). Re-numbering
would invalidate §V2 metric keys committed in pr-180-fix-plan.md and
break run_id replays. New step IDs append at the end of §V1.
-->

### V1.13 — dry-run output JSON hard-match (cross-runner)

```bash
bash release/install.sh --dry-run \
  | jq -R -s '{lines: split("\n") | map(select(length>0))}' \
  > "${EVIDENCE_DIR}/v1.13.bash.json"

# Same script via claudefast (will exec it in its sandbox)
claudefast -p \
  --output-format json \
  --permission-mode acceptEdits \
  "Run: bash release/install.sh --dry-run.
   Print only stdout, one [dry-run] line per output line." \
  | jq -r '.result' \
  | jq -R -s '{lines: split("\n") | map(select(length>0))}' \
  > "${EVIDENCE_DIR}/v1.13.fast.json"

diff -u "${EVIDENCE_DIR}/v1.13.bash.json" \
        "${EVIDENCE_DIR}/v1.13.fast.json" \
  > "${EVIDENCE_DIR}/v1.13.diff" 2>&1
echo $? > "${EVIDENCE_DIR}/v1.13.exit"
```

PASS if `v1.13.exit == 0` AND the diff file is empty. This is the
project's `feature-verification.md` 1+2+3 hard-match adapted for a
non-`--help` module: `--dry-run` IS the canonical contract here.

---

## §V2 DUMP — canonical JSON

After §V1 finishes, lead writes this exact schema to `${JUDGE_JSON}`:

```json
{
  "run_id": "issue-121-<UTC ISO8601 compact>",
  "tools_run": [
    "v1.1", "v1.2", "v1.3", "v1.4", "v1.5", "v1.6", "v1.7",
    "v1.8", "v1.9", "v1.10", "v1.11", "v1.12", "v1.13",
    "v1.14", "v1.15", "v1.16", "v1.17", "v1.18", "v1.19", "v1.20"
  ],
  "exit_codes": {
    "v1.1": <int>,
    "v1.2": <int>,
    "v1.3": <int>,
    "v1.4": <int>,
    "v1.5": <int>,
    "v1.9": <int>,
    "v1.11": <int>,
    "v1.12": <int>,
    "v1.13": <int>
  },
  "metrics": {
    "dry_run_line_count": <int>,
    "tls_flag_count": <int>,
    "proto_https_count": <int>,
    "redirect_guard_count": <int>,
    "fallback_chain_count": <int>,
    "workflow_install_legacy_refs": <int>,
    "workflow_sha256_refs": <int>,
    "workflow_gen_sha256_refs": <int>,
    "workflow_release_create_refs": <int>,
    "workflow_release_view_refs": <int>,
    "workflow_pnpm_pack_refs": <int>,
    "workflow_tarball_pattern_refs": <int>,
    "workflow_template_sed_refs": <int>,
    "workflow_staged_shasum_refs": <int>,
    "workflow_semver_guard_refs": <int>,
    "installer_self_url_used": <bool>,
    "installer_fallback_returns": <bool>,
    "tests_passed": <int>,
    "tests_failed": <int>,
    "typecheck_clean": <bool>,
    "bc_compat_legacy_present": <bool>,
    "bc_compat_legacy_syntax_ok": <bool>,
    "ci_green": <bool|null>
  },
  "v1.4_diff_empty": <bool>,
  "v1.13_diff_empty": <bool>,
  "v1.9_inconclusive": <bool>,
  "evidence_dir": ".judge/<run_id>/evidence/",
  "stdout_path": ".judge/<run_id>/evidence/all.out"
}
```

Lead writes the JSON via a small inline shell composition (not a
separate `.sh` file — that would re-introduce the "harness is code" rule
violation). Schema fidelity is checked by Worker C's P1 probe.

After dumping, lead also concatenates all per-step `.out` and `.err`
files into `${EVIDENCE_DIR}/all.out` and `${EVIDENCE_DIR}/all.err` so
§V3 can grep across them without re-walking the tree.

---

## §V3 READ — separate LLM judge

The judge LLM **must not** be Worker C, and **must not** see this
`plan.md`, `judge.md`, or any worker's diff. It reads ONLY the raw
`judge.json` plus arbitrary files inside `evidence_dir`.

### Pre-PR vs post-PR judge mode

Issue #121's Criterion 8 ("CI green, no Codex actionable findings") is
structurally unverifiable until the PR has opened and GitHub Actions
has run. The judge harness therefore distinguishes two modes:

- **Pre-PR judge run** (lead invokes §V3 before opening the PR):
  Criterion 8 is INCONCLUSIVE-pre-PR (not FAIL). When `ci_green` is
  `null`, the judge marks MET=true with a note "pending POSTPR /review
  loop". This avoids a structural deadlock where the judge can never
  PASS pre-PR.
- **Post-PR judge run** (lead re-invokes §V3 after CI completes):
  Criterion 8 is graded against `ci_green` (true/false). FAIL on
  `ci_green=false`; PASS on `ci_green=true`. POSTPR loop drives this
  re-grade until PASS.

A pre-PR SOFT-PASS verdict (7/8 met + Criterion 8 INCONCLUSIVE-pre-PR)
is sufficient for the lead to commit/push and open the PR. Hard PASS
requires a post-PR run after CI green.

### V3.1 — claudefast judge

```bash
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/issue-121/v3-judge.debug.log \
  --permission-mode acceptEdits \
  "$(cat <<'EOF'
You are a third-party judge for TeamBrain issue #121.
Read ONLY:
  - .judge/${RUN_ID}/judge.json
  - .judge/${RUN_ID}/evidence/*

Grade against issue #121's 8 acceptance criteria:
  1. release-branch.yml publishes both legacy POSIX install.sh AND P4 install.sh
  2. install.sh.sha256 published next to install.sh
  3. curl-fetched install.sh passes bash -n
  4. curl-fetched install.sh --dry-run prints 7 [dry-run] lines + exits 0
  5. shasum -a 256 -c on install.sh.sha256 passes
  6. Tarball strategy works (Release asset OR archive fallback)
  7. Backward compat: existing curl|sh users still get a working install
  8. CI green, no Codex actionable findings

For each criterion, emit {criterion: N, met: bool, evidence: "<file:line>"}.
Then emit final {verdict: "PASS" | "FAIL", fail_reasons: [...]}.

DO NOT read plan.md, judge.md, or any worker diff.
DO NOT trust the run_id field for verdict; recompute from exit_codes.

CRITICAL anti-hallucination instruction:
For every bool field in judge.json (v1.4_diff_empty, v1.13_diff_empty,
typecheck_clean, bc_compat_legacy_present, bc_compat_legacy_syntax_ok,
v1.9_inconclusive), DO NOT trust the bool value alone. Open the
corresponding evidence file in evidence_dir and verify:
  - v1.4_diff_empty=true → evidence/v1.4.diff must be empty (0 bytes)
  - v1.13_diff_empty=true → evidence/v1.13.diff must be empty
  - typecheck_clean=true → evidence/v1.12.exit must contain "0"
  - bc_compat_legacy_present=true → evidence/v1.2.exit must contain "0"
    AND release/install-legacy.sh must exist (check via evidence/v1.2.out
    or a separate ls listing in evidence_dir).
If any bool's claimed value disagrees with its evidence file, mark the
corresponding criterion as MET=false with evidence "<file>:bool_mismatch".
EOF
)"
```

### V3.2 — codex judge (cross-LLM)

```bash
codex exec --skip-git-repo-check -s read-only \
  --json \
  "$(cat <<'EOF'
You are a third-party judge for TeamBrain issue #121.
Read ONLY .judge/${RUN_ID}/judge.json + evidence_dir/*.
[same grading rubric as V3.1]
EOF
)"
```

### V3.3 — verdict hard-match

The two judge JSONs are normalised (`jq -S`) and `diff -u`'d. They must
agree on `verdict` and on the per-criterion `met` bools. Disagreement
on `fail_reasons` text is allowed (they're free-form). Disagreement on
`verdict` is a HARD FAIL — lead does NOT proceed to commit/push, and
loops back to §V1 with corrective guidance to the responsible worker.

```bash
jq -S '.verdict, [.criteria[] | {criterion, met}]' \
  .judge/${RUN_ID}/v3-claudefast.json \
  > .judge/${RUN_ID}/v3-claudefast.norm.json

jq -S '.verdict, [.criteria[] | {criterion, met}]' \
  .judge/${RUN_ID}/v3-codex.json \
  > .judge/${RUN_ID}/v3-codex.norm.json

diff -u .judge/${RUN_ID}/v3-claudefast.norm.json \
        .judge/${RUN_ID}/v3-codex.norm.json \
  > .judge/${RUN_ID}/v3.diff 2>&1
echo $? > .judge/${RUN_ID}/v3.match.exit
```

PASS if `v3.match.exit == 0` AND `verdict == "PASS"` in both files.

---

## Failure / re-dispatch protocol

A FAIL on any §V step does NOT mean editing this judge.md. It means
re-running the failed step (and only that step) after Worker A/B/C
fixes the underlying issue. The MAIN agent dispatches the rerun:

```
§V1.X FAIL
   ↓
Lead identifies which Worker owns the affected file
   (V1.1/1.3/1.5–1.8/1.13 → Worker B)
   (V1.2 → Worker B — created install-legacy.sh)
   (V1.4/1.5 also touch Worker B's gen-sha256 output)
   (V1.9/1.10 → Worker A)
   (V1.11/1.12 → none — would be a regression in unrelated code)
   (V1.18 → Worker A v3 — semver guard in workflow)
   (V1.19 → Worker B v2 — SELF_URL re-download + removal of cp "$0")
   (V1.20 → Worker B v2 — _download_with_fallback return-not-exit)
   ↓
Lead sends focused fix instructions to that Worker via SendMessage
   ↓
Worker re-edits its slice, reports back
   ↓
Lead re-runs §V1.X (replacing only that step's evidence files)
   ↓
Lead regenerates §V2 judge.json from the now-mixed evidence
   ↓
Lead re-runs §V3
   ↓
Loop until V3.3 PASS
```

Forbidden: editing this `judge.md` to lower the bar (e.g. accepting 6
dry-run lines instead of 7). The bar is fixed by the issue's
acceptance criteria.

## Anti-patterns (what would defeat this harness)

| Anti-pattern | Why it's banned |
|---|---|
| Replacing §V1.x with `scripts/judge-v1-x.sh` | Re-introduces the "who tests the test" recursion. Steps stay inline in markdown so reviewers can grep judgement logic. |
| §V3 judge LLM also reads `plan.md` | Lets the judge match the rubric to the plan's promised outputs instead of the actual evidence. |
| §V3 judge run by the same agent that wrote `judge.md` | Self-grading. Lead spawns a fresh `claudefast -p` invocation. |
| Lowering line count thresholds when something fails | Bar is set by issue acceptance criteria, not by what's currently easy to pass. |
| Skipping §V3.3 cross-LLM diff | Single-LLM judges hallucinate PASS. The cross-match is the guard. |
| Reusing a previous run's `RUN_ID` / `evidence_dir` | Mixed evidence; the judge can't tell which run produced which file. |

## See also

- `docs/PR-PLAN.md` § ③ — three-section judge harness rule.
- `docs/HOWTO-PLAN-PR.md` § 3b — same rule, pre-PR variant.
- `~/.claude/docs/rules/testing-judge-harness.md` — user-level testing rule.
- `~/.claude/projects/-Users-m1-projects-TeamBrain/memory/feedback_judge_harness_md_playbook.md`
  — memory record of why the harness has to be md, not bash.
- `release-prep/install-sh-checklist.md` — P4 mitigation → install.sh
  line-number map (the source of truth for §V1's grep targets).
