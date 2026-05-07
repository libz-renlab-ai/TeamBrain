#!/usr/bin/env bash
# issue #82 e2e probe orchestrator
# Spec: docs/specs/2026-05-07-issue82-team-sharing-e2e-probe.md
# Plan: docs/specs/2026-05-07-issue82-team-sharing-plan.md
#
# Default: --dry-run (prints what it would do, hits nothing)
# Real:    --real-run (creates GitHub state, spends tokens)
#
# Exit codes:
#   0 PASS for current run
#   1 metric below threshold
#   2 scenarios sha256 mismatch
#   3 attribution chain broken
#   4 system-level failure (claudefast / git / pnpm)
#   5 branch_protection=on but push succeeded (M5 spec broken)

set -euo pipefail

# ── Args & env ──────────────────────────────────────────────────────────────
MODE="dry-run"
for arg in "$@"; do
  case "$arg" in
    --dry-run)  MODE="dry-run" ;;
    --real-run) MODE="real-run" ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 4 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BRANCH_PROTECTION="${BRANCH_PROTECTION:-off}"
PROBE_REPO_OWNER="${PROBE_REPO_OWNER:-libz-renlab-ai}"
PROBE_REPO_NAME="${PROBE_REPO_NAME:-TeamBrain-team-sharing-probe}"
PROBE_AUTHOR_EMAIL="${PROBE_AUTHOR_EMAIL:-alice@probe.example}"
PROBE_TEAMMATE_EMAIL="${PROBE_TEAMMATE_EMAIL:-bob@probe.example}"
K_COUNT="${K_COUNT:-5}"
N_COUNT="${N_COUNT:-20}"
CLAUDEFAST_BIN="${CLAUDEFAST_BIN:-claudefast}"

case "$BRANCH_PROTECTION" in
  off|on) ;;
  *) echo "BRANCH_PROTECTION must be off or on; got '$BRANCH_PROTECTION'" >&2; exit 4 ;;
esac

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/team-sharing-probe/${RUN_ID}"
TRIGGER_PHRASE="${TRIGGER_PHRASE:-PR 合并后必须 fetch codex review 直到 silent}"

# Token-friendly remote URL (HTTPS) + gh credential helper handles auth.
# Never embed token into URL — gh auth setup-git installs credential.helper
# at script start (real-run only) so token never leaks into stdout/stderr.
PROBE_REMOTE_URL="https://github.com/${PROBE_REPO_OWNER}/${PROBE_REPO_NAME}.git"

# ── Helpers ─────────────────────────────────────────────────────────────────
say() { printf '[%s] %s\n' "$MODE" "$*"; }

run() {
  # In dry-run: echo. In real-run: exec.
  if [[ "$MODE" == "dry-run" ]]; then
    printf '  $ %s\n' "$*"
  else
    eval "$@"
  fi
}

require_real() {
  if [[ "$MODE" != "real-run" ]]; then
    say "[skip] $1 — only runs in --real-run"
    return 1
  fi
  return 0
}

# ── Step 0: prep evidence dir ──────────────────────────────────────────────
say "RUN_ID=$RUN_ID"
say "MODE=$MODE  BRANCH_PROTECTION=$BRANCH_PROTECTION"
say "EVIDENCE_DIR=$EVIDENCE_DIR"
say "PROBE_REPO=${PROBE_REPO_OWNER}/${PROBE_REPO_NAME}"
say "K_COUNT=$K_COUNT  N_COUNT=$N_COUNT"
say "TRIGGER_PHRASE=\"$TRIGGER_PHRASE\""

if [[ "$MODE" == "real-run" ]]; then
  mkdir -p "$EVIDENCE_DIR/prompts" "$EVIDENCE_DIR/work"
  STDOUT_LOG="$EVIDENCE_DIR/stdout.log"
  exec > >(tee -a "$STDOUT_LOG") 2>&1
fi

WORK_DIR="$EVIDENCE_DIR/work"
ALICE_DIR="$WORK_DIR/alice"
BOB_DIR="$WORK_DIR/bob"
ALICE_HOME="$WORK_DIR/alice-home"
BOB_HOME="$WORK_DIR/bob-home"

# ── Step 0.5: ensure git uses gh's credential helper so HTTPS+token works ───
# (real-run only; dry-run skips). gh auth setup-git is idempotent.
if [[ "$MODE" == "real-run" ]]; then
  gh auth setup-git
fi

# ── Step 1: prepare probe repo (real-run only) ──────────────────────────────
say "STEP 1: ensure probe repo exists & is at clean state"
if require_real "gh repo + reset"; then
  if ! gh repo view "${PROBE_REPO_OWNER}/${PROBE_REPO_NAME}" >/dev/null 2>&1; then
    say "STEP 1.a: probe repo missing — REQUIRES USER ACTION"
    cat <<EOF >&2
ABORTING: probe repo ${PROBE_REPO_OWNER}/${PROBE_REPO_NAME} not found.
Create it explicitly (this script will not auto-create shared GitHub state):

  gh repo create ${PROBE_REPO_OWNER}/${PROBE_REPO_NAME} --public --confirm

Then re-run this orchestrator.
EOF
    exit 4
  fi
  say "STEP 1.b: hard-reset probe repo to empty README — destructive on probe repo only"
  # Implementation deliberately left as TODO so a human approves the destructive
  # reset before the harness goes live. See spec §6 Step 1.
  cat <<'EOF' >&2
TODO(real-run): reset probe repo to clean state. Suggested:
  - clone ${PROBE_REPO_NAME} into $WORK_DIR/reset
  - git checkout --orphan tmp; git reset --hard; git commit -m "reset" --allow-empty
  - git push -f origin main
This step intentionally requires explicit human approval before going live.
EOF
  exit 4
fi
run "echo would: gh repo view + hard-reset main of probe repo"

# ── Step 2: alice tmux pane — pitfall + m5-publish ──────────────────────────
say "STEP 2: alice writes pitfall, auto-shares to L2, pushes"
run "mkdir -p $ALICE_DIR $ALICE_HOME"
run "git init -q $ALICE_DIR"
run "git -C $ALICE_DIR config user.email '$PROBE_AUTHOR_EMAIL'"
run "git -C $ALICE_DIR config user.name 'alice-probe'"
run "git -C $ALICE_DIR remote add origin '$PROBE_REMOTE_URL'"
# pitfall must run with cwd=ALICE_DIR so .teamagent/ is created in the probe
# project, NOT in REPO_ROOT (TeamBrain itself). The subshell + cd guarantees
# this; --dir REPO_ROOT only locates the pnpm package.json, it does not
# change the spawned process cwd. (codex P1 on PR #129)
run "( cd '$ALICE_DIR' && HOME='$ALICE_HOME' pnpm --silent --dir '$REPO_ROOT' teamagent pitfall \
  --non-interactive \
  '--trigger=$TRIGGER_PHRASE' \
  '--correct=fetch codex review 直到 silent' \
  '--reason=验证 issue #82 e2e probe' \
  '--category=K' '--tags=pr,review,probe' \
  '--level=personal' )"
run "( cd '$ALICE_DIR' && HOME='$ALICE_HOME' pnpm --silent --dir '$REPO_ROOT' teamagent m5-publish \
  --project-root '$ALICE_DIR' )"
run "git -C $ALICE_DIR push origin main \
  > $EVIDENCE_DIR/alice-push.stdout 2> $EVIDENCE_DIR/alice-push.stderr || \
  echo \"push exit=\$?\" > $EVIDENCE_DIR/alice-push.exitcode"
run "git -C $ALICE_DIR log -1 --format=%H > $EVIDENCE_DIR/alice-sync-commit.sha"

# ── Step 3: scenario-designer → scenarios.json ──────────────────────────────
say "STEP 3: blind scenario designer (independent claudefast session) → scenarios.json"
PROMPT_TPL="$REPO_ROOT/docs/features/team-sharing-probe/prompts/scenario-designer.md"
SCENARIOS="$EVIDENCE_DIR/scenarios.json"
run "sed 's|{{TRIGGER_PHRASE}}|$TRIGGER_PHRASE|g' '$PROMPT_TPL' \
  | $CLAUDEFAST_BIN -p --output-format json \
  > '$SCENARIOS'"
run "shasum -a 256 '$SCENARIOS' | awk '{print \$1}' > '$EVIDENCE_DIR/scenarios.sha256'"

# ── Step 4: bob tmux pane — clone + pull + run K+N prompts ──────────────────
say "STEP 4: teammate clones, pulls (post-merge → m5-sync apply), runs $K_COUNT+$N_COUNT prompts"
run "mkdir -p $BOB_DIR $BOB_HOME"
run "git clone '$PROBE_REMOTE_URL' $BOB_DIR"
run "git -C $BOB_DIR config user.email '$PROBE_TEAMMATE_EMAIL'"
run "git -C $BOB_DIR config core.hooksPath .githooks"
# post-merge fires on next pull; force a pull cycle:
run "git -C $BOB_DIR pull --no-rebase origin main"

# Each prompt runs in its own claudefast invocation; jq drives the loop.
run "jq -r '(.k_set + .n_set) | .[] | [.id, .prompt] | @tsv' '$SCENARIOS' \
  | while IFS=\$'\t' read -r id prompt; do
      ( cd '$BOB_DIR' && HOME='$BOB_HOME' \
        $CLAUDEFAST_BIN -p --output-format stream-json \
          --include-partial-messages --verbose \
          --debug hooks --debug-file '$EVIDENCE_DIR/teammate-'\"\$id\"'.debug' \
          \"\$prompt\" \
        > '$EVIDENCE_DIR/teammate-'\"\$id\"'.jsonl' ) || \
        echo \"prompt \$id exit=\$?\" >> '$EVIDENCE_DIR/teammate.errors'
    done"

# ── Step 5: collect calibrator events + git log ─────────────────────────────
say "STEP 5: collect hook events + git log"
run "find $BOB_DIR/.teamagent/events -type f -name '*.jsonl' \
  -exec cat {} + > $EVIDENCE_DIR/hook-events.jsonl 2>/dev/null || \
  : > $EVIDENCE_DIR/hook-events.jsonl"
run "git -C $BOB_DIR log --all --format=fuller > $EVIDENCE_DIR/git-log.txt"

# ── Step 6: judge LLM verdict ───────────────────────────────────────────────
say "STEP 6: independent judge LLM produces judge-verdict.json"
JUDGE_PROMPT_TPL="$REPO_ROOT/docs/features/team-sharing-probe/prompts/judge.md"
SYNC_SHA="$(cat "$EVIDENCE_DIR/alice-sync-commit.sha" 2>/dev/null || echo TBD)"
SCENARIOS_SHA="$(cat "$EVIDENCE_DIR/scenarios.sha256" 2>/dev/null || echo TBD)"
run "sed -e 's|{{RUN_ID}}|$RUN_ID|g' \
        -e 's|{{BRANCH_PROTECTION}}|$BRANCH_PROTECTION|g' \
        -e 's|{{ORIGINAL_AUTHOR}}|alice-probe|g' \
        -e 's|{{SYNC_COMMIT_SHA}}|$SYNC_SHA|g' \
        -e 's|{{SCENARIOS_SHA256}}|$SCENARIOS_SHA|g' \
        -e 's|{{EVIDENCE_DIR}}|$EVIDENCE_DIR|g' \
        -e 's|{{RULE_ID}}|TBD-from-events|g' \
        '$JUDGE_PROMPT_TPL' \
  | $CLAUDEFAST_BIN -p --output-format json \
  > '$EVIDENCE_DIR/judge-verdict.json'"

# ── Step 7: synthesize final judge.json ─────────────────────────────────────
say "STEP 7: synthesize judge.json"
run "jq -n \
  --arg run_id '$RUN_ID' \
  --arg bp '$BRANCH_PROTECTION' \
  --arg sha '$SCENARIOS_SHA' \
  --argjson k '$K_COUNT' --argjson n '$N_COUNT' \
  --slurpfile verdict '$EVIDENCE_DIR/judge-verdict.json' \
  '{run_id:\$run_id, topology:{transport:\"T3a\",instance:\"C3-hybrid\",branch_protection:\$bp,k_count:\$k,n_count:\$n,model:env.CLAUDEFAST_MODEL // \"unknown\"}, scenarios_sha256:\$sha, verdict:\$verdict[0]}' \
  > '$EVIDENCE_DIR/judge.json'"

# ── Step 8: derive exit code from verdict ───────────────────────────────────
say "STEP 8: read verdict.pass and exit"
if [[ "$MODE" == "dry-run" ]]; then
  say "[dry-run] would: jq -r '.verdict_pass' < judge-verdict.json && exit accordingly"
  say "[dry-run] DONE — no real artifacts created"
  exit 0
fi

PASS="$(jq -r '.verdict_pass // false' "$EVIDENCE_DIR/judge-verdict.json" 2>/dev/null || echo false)"
if [[ "$PASS" == "true" ]]; then
  say "RESULT: PASS"
  exit 0
fi
say "RESULT: FAIL — see $EVIDENCE_DIR/judge-verdict.json"
# Distinguish the structural failure modes per spec §7.
REASON="$(jq -r '.reason // "unknown"' "$EVIDENCE_DIR/judge-verdict.json" 2>/dev/null || echo unknown)"
case "$REASON" in
  *sha256*)              exit 2 ;;
  *attribution*)         exit 3 ;;
  *push*succeeded*)      exit 5 ;;
  *)                     exit 1 ;;
esac
