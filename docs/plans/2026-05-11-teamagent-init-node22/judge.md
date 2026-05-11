```text
   ┌─────────────────────────────────────────────────────────┐
   │  JUDGE: teamagent init must run on Node 22 without ulid │
   │         crash; pass requires v0.11.0 + ulid externalized│
   │  Form: md playbook (NOT a fixed bash script — hard rule │
   │        per docs/HOWTO-PLAN-PR.md "MUST use md playbook")│
   └─────────────────────────────────────────────────────────┘
```

# Judge: ship v0.11.0 to unbrick Node 22 fresh install

This judge harness is the **third-party** verification for `plan.md` in this
folder. Per `docs/PLAN-RESEARCH-REPORT.md` and `docs/HOWTO-PLAN-PR.md` hard
rules: it is a **md playbook**, dispatched by MAIN agent through subagents
or `claudefast -p` probes — **not** a fixed `*.sh` pipeline. PR author,
executing agent, and the code under test are **all** disqualified as judge;
final verdict comes from §V3 below.

Run id format: `2026-05-11-<HHMMSS>`. Evidence files land in
`docs/plans/2026-05-11-teamagent-init-node22/evidence/`. Judge JSONs land in
`.judge/<run_id>/`.

---

## §V1 RUN

Three probes, each may run in parallel.

### Probe A — bundle inspection

Tool: `node + grep` on built dist.

```bash
pnpm --filter teamagent build   # idempotent; tsup
node -e "console.log(require('./packages/teamagent/package.json').version)" \
  > docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-version.txt
grep -c 'ulid@2\.4\.0' packages/teamagent/dist/bin.js \
  > docs/plans/2026-05-11-teamagent-init-node22/evidence/ulid-bundle-check.txt 2>&1 \
  || echo 0 > docs/plans/2026-05-11-teamagent-init-node22/evidence/ulid-bundle-check.txt
grep -n 'secure crypto unusable' packages/teamagent/dist/bin.js \
  >> docs/plans/2026-05-11-teamagent-init-node22/evidence/ulid-bundle-check.txt 2>&1 || true
```

Success metric: `ulid-bundle-check.txt` shows `0` for the inlined `ulid@2.4.0` substring (post-fix the path comment is gone because the import is now externalized).

### Probe B — global install + version

Tool: `npm install -g` and `teamagent --version`.

```bash
npm install -g "$PWD/packages/teamagent" \
  > docs/plans/2026-05-11-teamagent-init-node22/evidence/npm-install-g.stdout.log 2>&1
echo $? > docs/plans/2026-05-11-teamagent-init-node22/evidence/npm-install-g.exitcode.txt
teamagent --version \
  > docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-version-global.txt 2>&1
echo $? > docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-version-global.exitcode.txt
```

Success metric: `teamagent-version-global.txt` contains `0.11.0`; `teamagent-version-global.exitcode.txt` is `0`; stdout/stderr contain no `secure crypto unusable`.

### Probe C — tmux + cd ~/projects/demo-repo + teamagent init

Tool: `tmux` + `teamagent init`.

```bash
mkdir -p ~/projects/demo-repo
cd ~/projects/demo-repo && git init -q
SESSION=tb-verify-$RANDOM
tmux new-session -d -s "$SESSION" \
  "cd ~/projects/demo-repo && teamagent init >stdout 2>&1; echo \$? >exitcode"
# wait up to 120s for either exitcode file or session death
for i in $(seq 1 120); do
  [ -f ~/projects/demo-repo/exitcode ] && break
  tmux has-session -t "$SESSION" 2>/dev/null || break
  sleep 1
done
tmux kill-session -t "$SESSION" 2>/dev/null || true
cp ~/projects/demo-repo/stdout   docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-init.stdout.log
cp ~/projects/demo-repo/exitcode docs/plans/2026-05-11-teamagent-init-node22/evidence/teamagent-init.exitcode.txt
```

Success metric: `teamagent-init.exitcode.txt` is `0`; `teamagent-init.stdout.log` does not contain `secure crypto unusable`; contains evidence of hook registration (substrings like `hook` / `settings.json` / `seed`).

---

## §V2 DUMP

After §V1 finishes, write one JSON per probe at
`.judge/<run_id>/probe-{a,b,c}.json`:

```json
{
  "tool": "<probe name>",
  "exit_code": <int>,
  "metrics": {
    "ulid_bundled": <bool>,
    "teamagent_version": "<x.y.z>",
    "init_exit_code": <int>,
    "init_seconds": <number>
  },
  "evidence_dir": "docs/plans/2026-05-11-teamagent-init-node22/evidence/",
  "stdout_path": "<path under evidence_dir>"
}
```

Each JSON's `metrics` must contain ONLY data extracted from evidence files
(no inference, no manual edits). Probes that did not run (because a prior
probe failed) write `exit_code: null` + `tool: "skipped"`.

---

## §V3 READ — LLM judge

Final verdict by an independent `claudefast -p` (haiku) that ONLY reads
`.judge/<run_id>/probe-*.json` and the first / last 50 lines of each
referenced `stdout_path`. It does NOT read this repo's source.

Rubric:

- **PASS** iff:
  - `probe-a.metrics.ulid_bundled == false`
  - `probe-b.metrics.teamagent_version == "0.11.0"`
  - `probe-c.metrics.init_exit_code == 0`
  - None of the three `stdout_path` files contain `secure crypto unusable`
  - None of the three exit codes are `null` (i.e. all three probes ran)
- **FAIL** iff any of the above is violated.
- **UNCERTAIN** iff a referenced `stdout_path` is missing or unreadable —
  in that case re-dispatch the missing probe and re-judge.

V3 output template:

```
verdict: <pass|fail|uncertain>
why: <one or two sentences citing JSON keys>
next_step: <"merge PR" | "fix <thing>" | "rerun probe-<x>">
```

Forbidden behaviors (auto-fail the harness, not the work):
- Judge reads the plan author's code or run notes (must read only JSONs +
  evidence file slices).
- Judge runs new tools or commands of its own.
- Author / executing agent appends judge text to a probe JSON.

---

## Why this is a third-party harness

- Built artifact (`dist/bin.js`) is tested by an external `node` invocation, not by trusting tsup's claim that ulid is externalized.
- User-visible verification mirrors the user's actual command (`tmux + cd + teamagent init`), so a regression in init that doesn't trigger ulid would still surface.
- Verdict is rendered by an LLM that doesn't see the patch — it cannot rationalize a green when the JSON says red.
