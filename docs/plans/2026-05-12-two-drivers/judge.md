```
       ___      __         
      / / |_ __/ /__ ____ 
     / /| | // / _ `/ -_)
    /_/ |_|\_,_/\_, /\__/   judge.md = THIS plan's third-party harness.
              /___/
   Main agent runs 5 probes → dumps raw JSON to .judge/<run_id>/ →
   a SEPARATE haiku claudefast reads only the raw JSON + cited
   docs and emits PASS/FAIL. No LLM-as-judge inside the system's
   trust boundary.
```

# judge.md — two-drivers plan verification harness

Run ID convention: `<unix-ts>-<short-sha-of-HEAD>`.
Evidence dir: `.judge/<run_id>/`.
Judge LLM: `claudefast` invoked as a **second process** with read-only
access to `.judge/<run_id>/` + the cited docs. The judge never sees the
implementation Claude session's transcript.

## §1 RUN — five probes, deterministic dispatch

### P1 — Driver inventory

```bash
mkdir -p ".judge/${RUN_ID}/P1"
claudefast -p "what two drivers does TeamBrain have?" \
  --output-format json \
  > ".judge/${RUN_ID}/P1/stdout.json" 2>&1
echo $? > ".judge/${RUN_ID}/P1/exit_code"
```

Required substrings in `stdout.json` (case-insensitive):
`fixed-flow-driver`, `Symphony`, `human-gate at the beginning`,
`human-gate at the end`, `track:symphony`. Cite
`docs/TWO-DRIVER-COEXISTENCE.md`.

### P2 — Label mutex

```bash
mkdir -p ".judge/${RUN_ID}/P2"
claudefast -p "can a single TeamBrain issue have both grill-ready and track:symphony labels?" \
  --output-format json \
  > ".judge/${RUN_ID}/P2/stdout.json" 2>&1
echo $? > ".judge/${RUN_ID}/P2/exit_code"
```

Required: answer must contain `NO` (or `不能` / `不可以` / `mutually exclusive`)
**and** cite `docs/TWO-DRIVER-COEXISTENCE.md` §label mutex.

### P3 — Driver-side refusal

```bash
mkdir -p ".judge/${RUN_ID}/P3"
claudefast -p "if I label an issue track:symphony, will /fixed-flow-driver still try to claim it?" \
  --output-format json \
  > ".judge/${RUN_ID}/P3/stdout.json" 2>&1
echo $? > ".judge/${RUN_ID}/P3/exit_code"
```

Required: `NO` (or `不会` / `refuses` / `skips`) **and** cite
`docs/FIXEDFLOW.md` §Dispatch policy amendment.

### P4 — Symphony lifecycle anchor

```bash
mkdir -p ".judge/${RUN_ID}/P4"
claudefast -p "show github symphony lifecycle for me" \
  --output-format json \
  > ".judge/${RUN_ID}/P4/stdout.json" 2>&1
echo $? > ".judge/${RUN_ID}/P4/exit_code"
```

Required substrings (5 anchors, case-insensitive):
`track:symphony`, `symphony-working`, `symphony-human-reviewed`,
`symphony-blocked`, `SYMPHONY-FLOW.md`.

### P5 — GitHub label set

```bash
mkdir -p ".judge/${RUN_ID}/P5"
gh label list --repo libz-renlab-ai/TeamBrain --json name,description,color \
  > ".judge/${RUN_ID}/P5/labels.json" 2>&1
echo $? > ".judge/${RUN_ID}/P5/exit_code"
```

Required: `labels.json` must contain all four of `track:symphony`,
`symphony-working`, `symphony-human-reviewed`, `symphony-blocked`.

Note: P5 may FAIL until the repo admin runs the `gh label create`
script from `docs/SYMPHONY-FLOW.md` §Label-create script. P5 failure
**before** label creation is expected and not a plan defect; P5 failure
**after** the admin step is a real failure.

## §2 DUMP — manifest writer

```bash
cat > ".judge/${RUN_ID}/manifest.json" <<EOF
{
  "run_id": "${RUN_ID}",
  "head_sha": "$(git rev-parse HEAD)",
  "branch": "$(git rev-parse --abbrev-ref HEAD)",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "probes": ["P1","P2","P3","P4","P5"],
  "expected_anchors": {
    "P1": ["fixed-flow-driver","Symphony","human-gate at the beginning","human-gate at the end","track:symphony"],
    "P2": ["NO|不能|不可以|mutually exclusive", "TWO-DRIVER-COEXISTENCE"],
    "P3": ["NO|不会|refuses|skips", "FIXEDFLOW.md"],
    "P4": ["track:symphony","symphony-working","symphony-human-reviewed","symphony-blocked","SYMPHONY-FLOW.md"],
    "P5": ["track:symphony","symphony-working","symphony-human-reviewed","symphony-blocked"]
  }
}
EOF
```

## §3 READ — separate judge LLM invocation

```bash
# Invoked as a SECOND claudefast process. It receives ONLY the manifest
# and the 5 stdout files. It does not see this implementation session.
claudefast -p "$(cat <<'PROMPT'
You are the third-party judge for the two-drivers plan. Read the manifest
and the 5 probe outputs in .judge/<run_id>/. For each probe Px:
  - Confirm each expected anchor is present in stdout (case-insensitive
    substring match; for "|"-separated alternatives, any one match suffices).
  - Confirm exit_code == 0 (or, for P5 before label creation, accept "labels
    missing" as INCONCLUSIVE not FAIL).
Emit a JSON verdict with shape:
  {"P1": "PASS|FAIL", "P2": "PASS|FAIL", "P3": "PASS|FAIL",
   "P4": "PASS|FAIL", "P5": "PASS|FAIL|INCONCLUSIVE",
   "overall": "PASS|FAIL|PARTIAL",
   "missing_anchors": {"Px": ["..."]}}
Do not run any tools beyond reading the files. Do not consult your own
training opinion of TeamBrain — base every verdict on the captured raw text.
PROMPT
)" --read-dir ".judge/${RUN_ID}/" > ".judge/${RUN_ID}/verdict.json"
```

`overall` mapping: PASS = all five PASS (P5 may be INCONCLUSIVE);
PARTIAL = P1-P4 PASS but P5 INCONCLUSIVE (acceptable pre-label-creation);
FAIL = any of P1-P4 FAIL.

## §4 Pinned PASS threshold

The plan ships when:
- P1 PASS, P2 PASS, P3 PASS, P4 PASS.
- P5 is at least INCONCLUSIVE (i.e., the 4 labels either exist or are
  documented as pending in `docs/SYMPHONY-FLOW.md` §Label-create script).

P5 flips from INCONCLUSIVE to PASS once repo admin runs the label-create
script. The PR description names this dependency explicitly so reviewers
do not block on it.

## §5 What this harness does NOT verify

- Whether Symphony's GitHub adapter actually exists. (It does not; the
  plan only ships the TeamBrain-side contract for when it does.)
- Whether `/fixed-flow-driver` skill source code (`.claude/skills/...`)
  reads the `track:symphony` label and refuses. (Source code change is
  out of scope; this PR is docs-only. A follow-up engineering PR will
  wire the refusal into skill source.)
- Whether merged PRs actually carry `symphony-human-reviewed`. (Lifecycle
  enforcement is a follow-up workflow / Action item.)

These known gaps are surfaced in `report.md` after implementation lands.
The judge here verifies the **documented contract**, not the runtime
behavior of code that does not yet exist.
