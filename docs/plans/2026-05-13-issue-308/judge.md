# Judge harness — issue #308 PR

This file is the canonical third-party judge harness playbook for the issue
#308 PR. A separate LLM (NOT the implementing agent, NOT the /review skill)
must consume the raw JSON / log artifacts produced by these 5 probes and
output a final PASS / FAIL verdict.

The harness is a **markdown playbook**, not a fixed bash script. The main
agent dispatches each probe via a subagent or `claudefast -p`, captures the
raw output to `judge_out/probe-<N>.json`, and the judge LLM reads ONLY those
files. Per CLAUDE.md user-level memory `feedback_judge_harness_md_playbook.md`.

## Probe directory

```
judge_out/
├── probe-1-state-machine.json     # vitest --reporter=json output
├── probe-2-bin-stop-emit.json     # vitest --reporter=json output
├── probe-3-cli-smoke.json         # { exit_code, stdout, stderr }
├── probe-4-schema-additive.json   # { http_status, response_body }
├── probe-5-privacy-default.json   # { captured_body }
└── verdict.json                   # judge LLM output
```

## Probe 1: state machine 4-态边界

**Goal.** Verify `computePresenceState` returns the correct state for each of
the 4 boundary fixtures.

**Run.**

```bash
cd packages/core
pnpm vitest run src/__tests__/presence-state-machine.test.ts \
  --reporter=json --outputFile=../../judge_out/probe-1-state-machine.json
```

**Pass criteria** (judge LLM reads `probe-1-state-machine.json`):

- `numTotalTests >= 4`
- `numFailedTests === 0`
- At least one test name matches each of: `active`, `idle`, `offline`, `error`.

## Probe 2: Stop hook emits exactly one cc-status POST

**Goal.** Verify that one Stop hook fire produces exactly one POST to
`/v1/cc-status` with `event === "stop"` — the foreground entry emits,
the detached pipeline child does not.

**Run.**

```bash
pnpm vitest run packages/cli/src/__tests__/bin-stop-emit.test.ts \
  --reporter=json --outputFile=judge_out/probe-2-bin-stop-emit.json
```

**Pass criteria.**

- `numFailedTests === 0`
- A test titled "foreground emits, detached child does not (single Stop = single POST)" passes.
- A test titled "returns true when env flag is set AND tmp-file argv[2] exists" passes.

## Probe 3: `pnpm teamagent presence` CLI smoke

**Goal.** Verify the CLI subcommand exits 0 and prints a `state=...` line in
both happy path and unset-URL path. Hits the real receiver route
`/api/cc-status?user=<user>` (NOT `/api/cc-status/latest?user_id=` — see
adversarial-finding #1).

**Run.**

```bash
# Unset URL → state=unknown
unset TEAMAGENT_REALTIME_URL
OUT=$(pnpm teamagent presence 2>&1); EC=$?
jq -n --arg out "$OUT" --argjson ec "$EC" \
  '{exit_code:$ec, stdout:$out, scenario:"unset"}' \
  > judge_out/probe-3a-cli-unset.json

# Mock receiver → state=active|idle|offline|error
# (start packages/digital-twin demo on 9787 first)
TEAMAGENT_REALTIME_URL=http://127.0.0.1:9787 \
OUT=$(pnpm teamagent presence 2>&1); EC=$?
jq -n --arg out "$OUT" --argjson ec "$EC" \
  '{exit_code:$ec, stdout:$out, scenario:"happy"}' \
  > judge_out/probe-3b-cli-happy.json
```

**Pass criteria.**

- 3a: `exit_code === 0 && stdout =~ /state=unknown/`
- 3b: `exit_code === 0 && stdout =~ /^state=(active|idle|offline|error)/`

Also runs as unit tests (no live receiver needed):

```bash
pnpm vitest run packages/cli/src/__tests__/presence-command.test.ts \
  --reporter=json --outputFile=judge_out/probe-3c-cli-unit.json
```

Including "targets the correct receiver route /api/cc-status?user=<user>"
which pins the URL shape against future regression.

## Probe 4: schema is additive (backward-compat)

**Goal.** Verify a receiver that doesn't know `raw_prompt` still accepts the
new payload.

**Run.**

```bash
# Start mock-server (which uses the latest types.ts)
node packages/digital-twin/dist/mock-server.js &
sleep 1
RESP=$(curl -sS -X POST http://127.0.0.1:9787/v1/cc-status \
  -H 'Content-Type: application/json' \
  -d '{"schema_version":1,"session_id":"s1","user_id":"u1","ts":"2026-05-13T00:00:00Z","event":"user_prompt_submit","raw_prompt":"hello world"}' \
  -w '\n%{http_code}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -n -1)
jq -n --argjson s "$STATUS" --arg b "$BODY" \
  '{http_status:$s, response_body:$b}' > judge_out/probe-4-schema-additive.json
```

**Pass criteria.**

- `http_status === 200`
- Server stored snapshot retains `raw_prompt` field (readback via
  `GET /api/cc-status?user=u1`). The `cc-status/store.ts` sanitizer
  whitelists `raw_prompt` in `SNAPSHOT_KEYS` + `STRING_KEYS` + caps it at
  64 KiB in `STRING_FIELD_CAP`; without those entries the field is
  silently dropped (this was adversarial-finding #2 — verify the keys
  are still in the whitelist before declaring PASS).

## Probe 5: privacy default — raw_prompt is OFF unless opt-in

**Goal.** Verify that UserPromptSubmit hook does NOT include `raw_prompt`
when `TEAMAGENT_REALTIME_RAW_PROMPT` is unset.

**Run.**

```bash
pnpm vitest run packages/cli/src/__tests__/realtime-emit.test.ts \
  --reporter=json --outputFile=judge_out/probe-5-privacy-default.json
```

**Pass criteria.**

- A test titled "omits raw_prompt when rawPrompt is undefined (privacy default)" passes.
- A test titled "omits raw_prompt when rawPrompt is empty string (filtered)" passes.
- A test titled "threads raw_prompt only when TEAMAGENT_REALTIME_RAW_PROMPT=1 (defense in depth)" passes.

## Verdict shape

The judge LLM writes `judge_out/verdict.json`:

```json
{
  "issue": 308,
  "pr": "<filled at PR open time>",
  "timestamp": "<iso>",
  "probes": {
    "1": {"verdict": "PASS|FAIL", "notes": "..."},
    "2": {"verdict": "PASS|FAIL", "notes": "..."},
    "3": {"verdict": "PASS|FAIL", "notes": "..."},
    "4": {"verdict": "PASS|FAIL", "notes": "..."},
    "5": {"verdict": "PASS|FAIL", "notes": "..."}
  },
  "overall": "PASS|FAIL"
}
```

`overall === "PASS"` requires all 5 probe verdicts to be `PASS`. The
`/review` skill PASS is still the **authoritative** termination signal per
ADR-0007; this judge harness is supplementary verification per the project's
"third-party judge harness" rule.
