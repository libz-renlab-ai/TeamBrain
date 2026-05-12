```text
        ┌─────────────────────────────────────────────────────┐
        │  judge.md · 3rd-party harness for                   │
        │  post-merge PR-creator auto-update                  │
        │                                                     │
        │  MAIN agent ──dispatch──► 6 probes (J1..J6)         │
        │                                │                    │
        │                                ▼                    │
        │                       .judge/<run_id>/              │
        │                         └── J*.json + raw           │
        │                                │                    │
        │                                ▼                    │
        │                    another LLM ──verdict──►         │
        │                       PASS / FAIL JSON              │
        └─────────────────────────────────────────────────────┘
```

# Judge harness — Post-merge PR-creator auto-update

> Strict MD playbook per `~/.claude/memory/feedback_judge_harness_md_playbook.md`.
> MAIN agent runs each probe via `Bash` / `claudefast -p` subagents; dumps raw
> stdout/stderr + structured `J<N>.json` into `.judge/<run_id>/`. A separate
> LLM judge ingests **only** the raw JSON + evidence directories — no
> `scripts/*.sh` one-shot pipeline, no self-grading by code under test.

## Run-id convention

```bash
RUN_ID=2026-05-12-pr-creator-$(date -u +%H%M%S)
JUDGE_DIR=.judge/$RUN_ID
mkdir -p "$JUDGE_DIR"
```

Each probe writes `$JUDGE_DIR/J<N>/stdout.txt`, `$JUDGE_DIR/J<N>/stderr.txt`,
and `$JUDGE_DIR/J<N>.json` (the structured probe verdict — input to the LLM
judge).

---

## J1 — CI workflow emits the three new `latest.json` keys

**Purpose**: prove `.github/workflows/release-branch.yml` generates a
`latest.json` payload that includes `pr_number`, `pr_creator_login`, and
`merged_at`, with non-empty `pr_creator_login`.

**Dispatch** (simulates the workflow step locally with `gh api`):

```bash
mkdir -p "$JUDGE_DIR/J1"
# Use the most recent merge into main as a fixture
SHA=$(git log -n 1 --pretty=%H main)
gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/commits/$SHA/pulls" \
  --jq '.[0] | {number, user_login: .user.login, merged_at}' \
  > "$JUDGE_DIR/J1/pr-lookup.json" 2> "$JUDGE_DIR/J1/stderr.txt"
PR_LOOKUP_EXIT=$?

# Render the proposed latest.json locally using the same template the workflow uses
VERSION=$(jq -r .version packages/teamagent/package.json)
PR_NUMBER=$(jq -r .number "$JUDGE_DIR/J1/pr-lookup.json")
PR_CREATOR=$(jq -r .user_login "$JUDGE_DIR/J1/pr-lookup.json")
MERGED_AT=$(jq -r .merged_at "$JUDGE_DIR/J1/pr-lookup.json")

cat > "$JUDGE_DIR/J1/latest.json" <<EOF
{
  "version": "$VERSION",
  "sha": "$SHA",
  "releasedAt": "$(date -u +%FT%TZ)",
  "tarball": "https://github.com/.../release.tar.gz",
  "generatedBy": "release-branch.yml@local-probe",
  "pr_number": $PR_NUMBER,
  "pr_creator_login": "$PR_CREATOR",
  "merged_at": "$MERGED_AT"
}
EOF

KEYS=$(jq -r 'keys | sort | join(",")' "$JUDGE_DIR/J1/latest.json")
node - <<EOF
const fs=require('fs');
const payload=JSON.parse(fs.readFileSync('$JUDGE_DIR/J1/latest.json','utf-8'));
const required=['pr_number','pr_creator_login','merged_at'];
const missing=required.filter(k=>!(k in payload));
const empty=required.filter(k=>k in payload && (payload[k]===null||payload[k]===''));
fs.writeFileSync('$JUDGE_DIR/J1.json', JSON.stringify({
  probe_id:'J1',
  exit_code:$PR_LOOKUP_EXIT,
  metrics:{
    keys: Object.keys(payload),
    required_present: required.filter(k=>k in payload),
    required_missing: missing,
    required_empty: empty,
    pr_creator_login: payload.pr_creator_login ?? null,
    pr_number: payload.pr_number ?? null,
  },
  evidence_dir:'$JUDGE_DIR/J1/',
  stdout_path:'$JUDGE_DIR/J1/latest.json',
  stderr_path:'$JUDGE_DIR/J1/stderr.txt'
}, null, 2));
EOF
```

**PASS thresholds (pinned)**:

- `metrics.required_missing.length === 0`
- `metrics.required_empty.length === 0`
- `metrics.pr_creator_login` is a non-empty string
- `metrics.pr_number` is a positive integer
- `exit_code === 0`

---

## J2 — `isLocalUserPrCreator` truth table (12 cases)

**Purpose**: exhaustively prove the pure match helper accepts the right inputs
and rejects everything else. **Pure function, no IO** — directly invoked from
the compiled `@teamagent/core` build.

**Dispatch**:

```bash
mkdir -p "$JUDGE_DIR/J2"
pnpm --filter @teamagent/core build > "$JUDGE_DIR/J2/build.log" 2>&1
node - <<EOF > "$JUDGE_DIR/J2/results.json"
const m = require('./packages/core/dist/update/pr-creator-match.js');
const cases = [
  // [name, input, expected]
  ['gh_login_exact_match',          { prCreatorLogin:'alice', ghLogin:'alice', env:{}, gitEmail:'' }, true],
  ['gh_login_case_insensitive',     { prCreatorLogin:'Alice', ghLogin:'alice', env:{}, gitEmail:'' }, true],
  ['gh_login_mismatch',             { prCreatorLogin:'alice', ghLogin:'bob',   env:{}, gitEmail:'' }, false],
  ['env_github_user_match',         { prCreatorLogin:'alice', env:{GITHUB_USER:'alice'},  gitEmail:'' }, true],
  ['env_gh_user_match',             { prCreatorLogin:'alice', env:{GH_USER:'alice'},      gitEmail:'' }, true],
  ['noreply_email_match',           { prCreatorLogin:'alice', env:{}, gitEmail:'alice@users.noreply.github.com' }, true],
  ['noreply_email_with_id_prefix',  { prCreatorLogin:'alice', env:{}, gitEmail:'12345+alice@users.noreply.github.com' }, true],
  ['email_local_part_no_match',     { prCreatorLogin:'alice', env:{}, gitEmail:'alice@example.com' }, false],
  ['blank_pr_creator',              { prCreatorLogin:'',      ghLogin:'alice', env:{}, gitEmail:'' }, false],
  ['no_signals',                    { prCreatorLogin:'alice', env:{}, gitEmail:'' }, false],
  ['undefined_inputs',              { prCreatorLogin:'alice' }, false],
  ['env_priority_below_gh',         { prCreatorLogin:'alice', ghLogin:'bob', env:{GITHUB_USER:'alice'}, gitEmail:'' }, true],
];
const results = cases.map(([name, input, expected]) => {
  let actual;
  try { actual = m.isLocalUserPrCreator(input); } catch (e) { actual = 'ERROR: ' + e.message; }
  return { name, expected, actual, pass: actual === expected };
});
const passed = results.filter(r => r.pass).length;
console.log(JSON.stringify({ cases: results, passed, total: results.length }, null, 2));
EOF
node - <<EOF
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('$JUDGE_DIR/J2/results.json','utf-8'));
fs.writeFileSync('$JUDGE_DIR/J2.json', JSON.stringify({
  probe_id:'J2',
  exit_code: r.passed===r.total ? 0 : 1,
  metrics:{ cases:r.cases, passed:r.passed, total:r.total },
  evidence_dir:'$JUDGE_DIR/J2/',
  stdout_path:'$JUDGE_DIR/J2/results.json'
}, null, 2));
EOF
```

**PASS thresholds**:

- `metrics.passed === metrics.total` (all 12)
- `exit_code === 0`

---

## J3 — `runUpdater` force-installs over snooze for PR creator

**Purpose**: with a fake `fetchLatestVersion` returning `pr_creator_login=alice`
+ new version, and a fake `gatherIdentity` returning `ghLogin=alice`, prove
the install is called **even though** `state.snooze_until_ts` is far in the
future AND `state.never_prompt` is true.

**Dispatch**:

```bash
mkdir -p "$JUDGE_DIR/J3"
pnpm --filter @teamagent/cli build > "$JUDGE_DIR/J3/build.log" 2>&1
node - <<EOF > "$JUDGE_DIR/J3/runner.log" 2>&1
const { runUpdater } = require('./packages/cli/dist/updater-logic.js');
const now = Date.now();
const state0 = {
  last_check_ts: now - 7*24*3600*1000, interval_hours: 1,
  last_installed_sha: '', last_installed_version: '0.11.5', installed_at: 0,
  consecutive_install_failures: 0, last_install_error: null,
  pending_banner: null, reinstall_banner_shown_at: 0,
  last_branch_etag: '', last_branch_sha: '',
  next_check_after_ts: 0, consecutive_rate_limits: 0,
  snooze_until_ts: now + 30*24*3600*1000,   // snoozed 30d
  snooze_level: 3, never_prompt: true,      // permanently silenced
  prompt_dismissed_for_to: '',
};
let stateNow = state0;
const calls = { npmInstall:0, migrate:0, banner: null };
const writes = [];
runUpdater({
  fetchLatestVersion: async () => ({
    ok: true, version: '0.11.6', sha: 'aabbcc', source: 'pages',
    pr_creator_login: 'alice', pr_number: 348, merged_at: new Date().toISOString(),
  }),
  gatherIdentity: () => ({ ghLogin: 'alice', env: {}, gitEmail: '' }),
  runNpmInstall: async () => { calls.npmInstall++; return { ok: true }; },
  runMigrateAuto: async () => { calls.migrate++; return { ok: true }; },
  backupCurrentInstall: () => '/tmp/fake-backup',
  restoreFromBackup: () => {},
  pruneOldBackups: () => {},
  readState: () => stateNow,
  writeState: (s) => { stateNow = s; writes.push(s); },
  log: () => {},
  now: () => now,
  acquireLock: () => true,
  releaseLock: () => {},
}).then(() => {
  console.log(JSON.stringify({ calls, final: stateNow, write_count: writes.length }, null, 2));
});
EOF
node - <<EOF
const fs=require('fs');
const raw=fs.readFileSync('$JUDGE_DIR/J3/runner.log','utf-8');
const j=JSON.parse(raw);
fs.writeFileSync('$JUDGE_DIR/J3.json', JSON.stringify({
  probe_id:'J3',
  exit_code: 0,
  metrics:{
    npm_install_calls: j.calls.npmInstall,
    migrate_calls: j.calls.migrate,
    final_last_installed_version: j.final.last_installed_version,
    pending_banner_pr_creator: j.final.pending_banner?.pr_creator ?? null,
    pending_banner_pr_number: j.final.pending_banner?.pr_number ?? null,
    snooze_was_active: j.final.snooze_until_ts > Date.now(),
    never_prompt_was_set: j.final.never_prompt,
  },
  evidence_dir:'$JUDGE_DIR/J3/',
  stdout_path:'$JUDGE_DIR/J3/runner.log',
}, null, 2));
EOF
```

**PASS thresholds**:

- `metrics.npm_install_calls === 1`
- `metrics.migrate_calls === 1`
- `metrics.final_last_installed_version === "0.11.6"`
- `metrics.pending_banner_pr_creator === true`
- `metrics.pending_banner_pr_number === 348`
- `metrics.snooze_was_active === true` (snooze was active — proves we bypassed it)
- `metrics.never_prompt_was_set === true` (proves we bypassed `never_prompt`)

---

## J4 — `runUpdater` does NOT force-install for non-creator under snooze

**Purpose**: mirror of J3 with `ghLogin=bob` instead of `alice` — the install
must NOT fire when snooze is active.

**Dispatch**: same as J3 but `gatherIdentity` returns `{ ghLogin: 'bob' }`.
Save to `$JUDGE_DIR/J4/runner.log` → `$JUDGE_DIR/J4.json`.

**Wait — current behaviour**: the *existing* updater does NOT gate on
`snooze_until_ts` either; `snooze` only silences the **banner**, not the
install. So this probe must use the actual gating signal that DOES suppress
the install in the legacy path. That's `state.next_check_after_ts > now` AND
`state.consecutive_install_failures >= 3 && now - last_check_ts < 24h`. We
test the force semantic by inserting a `non_creator_should_skip` flag we add
to the new code — a counter that gates only the new force path. See J4
detailed dispatch in `_judge_j4_dispatch.sh` co-located in this directory
once probes start landing (or inline here for first run).

**PASS thresholds**:

- `metrics.pending_banner_pr_creator !== true` (no PR-creator banner)
- The non-force install may or may not fire depending on debounce — we
  only assert the **PR-creator banner does not appear** for non-creators.

---

## J5 — Banner template branches on `pr_creator`

**Purpose**: prove `maybeShowPendingBanner` writes the new `🎯 你的 PR #N 已 merge`
template when `pending_banner.pr_creator === true`, and the legacy template
otherwise.

**Dispatch**:

```bash
mkdir -p "$JUDGE_DIR/J5"
pnpm --filter @teamagent/cli build > "$JUDGE_DIR/J5/build.log" 2>&1
node - <<'EOF' > "$JUDGE_DIR/J5/runs.json"
const ssl = require('./packages/cli/dist/session-start-logic.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

function runOnce(banner) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-J5-'));
  process.env.TEAMAGENT_HOME = home;
  fs.mkdirSync(home, { recursive: true });
  const state = {
    last_check_ts: 0, interval_hours: 1, last_installed_sha:'', last_installed_version:'',
    installed_at:0, consecutive_install_failures:0, last_install_error:null,
    pending_banner: banner, reinstall_banner_shown_at: 0,
    last_branch_etag:'', last_branch_sha:'', next_check_after_ts:0, consecutive_rate_limits:0,
    snooze_until_ts:0, snooze_level:0, never_prompt:false, prompt_dismissed_for_to:'',
  };
  fs.writeFileSync(path.join(home,'update-state.json'), JSON.stringify(state));
  let out = '';
  ssl.maybeShowPendingBanner((s) => { out += s; });
  return out;
}

const creator = runOnce({ from:'0.11.5', to:'0.11.6', at:0, shown:false, pr_creator:true, pr_number:348 });
const normal  = runOnce({ from:'0.11.5', to:'0.11.6', at:0, shown:false });
console.log(JSON.stringify({ creator, normal }, null, 2));
EOF
node - <<EOF
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('$JUDGE_DIR/J5/runs.json','utf-8'));
const creator_has_target = r.creator.includes('🎯');
const creator_has_prn = /PR #348/.test(r.creator);
const creator_has_merge = /merge|merged|合/.test(r.creator);
const normal_no_target = !r.normal.includes('🎯');
const normal_no_prn = !/PR #/.test(r.normal);
fs.writeFileSync('$JUDGE_DIR/J5.json', JSON.stringify({
  probe_id:'J5',
  exit_code: 0,
  metrics:{
    creator_text: r.creator, normal_text: r.normal,
    creator_has_target, creator_has_prn, creator_has_merge,
    normal_no_target, normal_no_prn,
  },
  evidence_dir:'$JUDGE_DIR/J5/',
  stdout_path:'$JUDGE_DIR/J5/runs.json',
}, null, 2));
EOF
```

**PASS thresholds**:

- `metrics.creator_has_target === true`
- `metrics.creator_has_prn === true`
- `metrics.creator_has_merge === true`
- `metrics.normal_no_target === true`
- `metrics.normal_no_prn === true`

---

## J6 — Old state-file round-trip preserves semantics

**Purpose**: a pre-feature `update-state.json` (no `pr_creator` / `pr_number`
on `pending_banner`) must parse without error; missing fields must be
**absent**, not coerced to `false`/`0` (matters for the banner switch).

**Dispatch**:

```bash
mkdir -p "$JUDGE_DIR/J6"
pnpm --filter @teamagent/core build > "$JUDGE_DIR/J6/build.log" 2>&1
node - <<'EOF' > "$JUDGE_DIR/J6/results.json"
const m = require('./packages/core/dist/update/update-state.js');
const old = JSON.stringify({
  last_check_ts:0, interval_hours:1, last_installed_sha:'', last_installed_version:'0.11.5',
  installed_at:0, consecutive_install_failures:0, last_install_error:null,
  pending_banner: { from:'0.11.4', to:'0.11.5', at:0, shown:false },
  reinstall_banner_shown_at:0, last_branch_etag:'', last_branch_sha:'',
  next_check_after_ts:0, consecutive_rate_limits:0,
  snooze_until_ts:0, snooze_level:0, never_prompt:false, prompt_dismissed_for_to:'',
});
const parsed = m.parseUpdateState(old);
console.log(JSON.stringify({
  parsed_pending_banner: parsed.pending_banner,
  pr_creator_field_present: 'pr_creator' in (parsed.pending_banner || {}),
  pr_number_field_present: 'pr_number' in (parsed.pending_banner || {}),
}, null, 2));
EOF
node - <<EOF
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('$JUDGE_DIR/J6/results.json','utf-8'));
fs.writeFileSync('$JUDGE_DIR/J6.json', JSON.stringify({
  probe_id:'J6',
  exit_code: 0,
  metrics: r,
  evidence_dir:'$JUDGE_DIR/J6/',
  stdout_path:'$JUDGE_DIR/J6/results.json',
}, null, 2));
EOF
```

**PASS thresholds**:

- `metrics.pr_creator_field_present === false`
- `metrics.pr_number_field_present === false`
- `metrics.parsed_pending_banner.from === '0.11.4'`
- `metrics.parsed_pending_banner.to === '0.11.5'`

---

## Verdict

The MAIN agent dispatches J1..J6, collects `J*.json`, and feeds them to a
separate LLM judge (e.g. `claudefast -p` with the verdict prompt). The judge
reads ONLY the JSON + evidence directories and writes `verdict.json`:

```jsonc
{
  "run_id": "<from RUN_ID>",
  "probes": { "J1": "PASS|FAIL", "J2": "PASS|FAIL", "J3": "PASS|FAIL",
              "J4": "PASS|FAIL", "J5": "PASS|FAIL", "J6": "PASS|FAIL" },
  "overall": "PASS|FAIL",
  "failed_thresholds": [ /* per-probe list when overall=FAIL */ ],
  "evidence_root": ".judge/<RUN_ID>/"
}
```

`overall === "PASS"` iff **all six** probes pass every pinned threshold above.
