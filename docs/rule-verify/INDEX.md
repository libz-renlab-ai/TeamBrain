# Rule Verification Hub

```
   USE_WHEN ─────► claudefast -p ──► response
                                         │
                                         ▼
   expected docs ──► claudefast judge ──► structured JSON ──► PASS / FAIL
```

Every rule with a triggered behavior has a `verify-canned-answer.sh`
under `docs/<rule>/`. The preferred verifier shape is semantic: one
`claudefast -p` call produces the agent's answer for the rule trigger, then a
second `claudefast -p` call judges that answer against the expected source
docs and returns structured JSON. PASS = JSON `.pass == true`, FAIL =
`.pass != true` or invalid judge JSON.

Some older scripts still use hard anchors while they wait to be migrated.

## Why this exists

Without external verification, "the rule is in CLAUDE.md so the model will
follow it" is a hope, not a fact. Each verify script is a **third-party judge
harness**: a fresh `claudefast` session loads CLAUDE.md, gets asked the
trigger prompt, and an external judge converts the result into PASS / FAIL.
Drift is caught on the next run, not when a user notices.

This is the same harness pattern as `docs/feature-verification.md`, applied
to rules instead of features.

## Registry

| rule | `USE_WHEN` prompt | judge / anchors | script | source |
|------|-------------------|------------------------|--------|--------|
| postpr | `what we shall do after each PR?` | `fetch the codex review`, `chatgpt-codex-connector`, `pulls/.*comments`, `silent`, `loop` | [`docs/postpr/verify-canned-answer.sh`](../postpr/verify-canned-answer.sh) | [`docs/POSTPR.md`](../POSTPR.md) |
| dogfood | `explain what would happen when we say DOGFOOD` | `two tmux windows`, `left/right split`, `interact` | [`docs/dogfood/verify-canned-answer.sh`](../dogfood/verify-canned-answer.sh) | [`docs/DOGFOOD.md`](../DOGFOOD.md) |
| bugreport | `what would happen when user find a bug?` | `github.com/libz-renlab-ai/TeamBrain`, `system info`, `reproduce`, `raw logs`, `great detail` | [`docs/bugreport/verify-canned-answer.sh`](../bugreport/verify-canned-answer.sh) | [`docs/BUGREPORT.md`](../BUGREPORT.md) |
| fastprobe | `what would happen if we say word 'FASTPROBE' ?` | semantic judge JSON: correct 3-step recipe, including max 8 parallel dispatch and stream-json audit mode | [`docs/fastprobe/verify-canned-answer.sh`](../fastprobe/verify-canned-answer.sh) | [`docs/FASTPROBE.md`](../FASTPROBE.md) |
| project-tools | `what project tools we have ?` | semantic judge JSON: available tool registry includes FASTPROBE, claudefast, DOGFOOD, BUGREPORT, POSTPR, RULE-VERIFY | [`docs/project-tools/verify-canned-answer.sh`](../project-tools/verify-canned-answer.sh) | `CLAUDE.md` (Project tools section) |
| github-account | `what accounts we use for github ?` | semantic judge JSON: selected account must be `LiuShiyuMath`, not `liush2yuxjtu` | [`docs/github-account/verify-canned-answer.sh`](../github-account/verify-canned-answer.sh) | `CLAUDE.md` (GitHub account section) |
| gstack-bin | `gstack skills and brain sync bin — project level or user level ?` | semantic judge JSON: selected scope must be project level for both gstack skills and brain sync bin paths | [`docs/gstack-bin/verify-canned-answer.sh`](../gstack-bin/verify-canned-answer.sh) | `CLAUDE.md` (Gstack skills section) |

## Run them all

```bash
# Sequential (clean logs, ~5-10 min for 7 rules)
bash scripts/verify-all-rules.sh

# Parallel (faster, interleaved logs)
RULE_VERIFY_PARALLEL=1 bash scripts/verify-all-rules.sh
```

Exit code = number of failing rules. Per-run logs land in
`.fastprobe/run-all/<timestamp>/`.

## Adding a new rule

1. Pick a `USE_WHEN` prompt — exact wording the user is expected to type.
2. Pick expected docs — the exact source section that defines correct
   behavior for that trigger.
3. Copy `docs/github-account/verify-canned-answer.sh` to `docs/<new-rule>/`,
   edit the prompt, source-doc extraction, and judge criteria.
4. `chmod +x` the script.
5. Add a row to the registry table above.
6. Run it once locally — if it FAILs, edit the source rule doc (e.g.
   `CLAUDE.md` or `docs/<rule>.md`) until it PASSes.
7. `bash scripts/verify-all-rules.sh` to confirm full sweep still PASSes.
