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

> **Note (PR #148 sweep):** The `script` column previously linked to
> `docs/<rule>/verify-canned-answer.sh` shell scripts. Those scripts are
> archived at `docs/legacy/judge-scripts/` and are no longer executed
> directly. Each entry now points to the corresponding md playbook under
> `docs/plans/<slug>/judge.md`. Dispatch via subagent or `claudefast -p`
> probe (FASTPROBE max 8 parallel).

| rule | `USE_WHEN` prompt | judge / anchors | md playbook | source |
|------|-------------------|------------------------|-------------|--------|
| postpr | `what we shall do after each PR?` | **DEPRECATED** per ADR-0007 — POSTPR no longer enforced via canned-answer anchors; verification is the self-discipline-via-matcher semantic probe (see `docs/POSTPR.md` "Verification" section) | [`docs/plans/docs--postpr--verify-canned-answer/judge.md`](../plans/docs--postpr--verify-canned-answer/judge.md) (deprecated) | [`docs/POSTPR.md`](../POSTPR.md) |
| dogfood | `explain what would happen when we say DOGFOOD` | `two tmux windows`, `left/right split`, `interact` | [`docs/plans/docs--dogfood--verify-canned-answer/judge.md`](../plans/docs--dogfood--verify-canned-answer/judge.md) | [`docs/DOGFOOD.md`](../DOGFOOD.md) |
| bugreport | `what would happen when user find a bug?` | `github.com/libz-renlab-ai/TeamBrain`, `system info`, `reproduce`, `raw logs`, `great detail` | [`docs/plans/docs--bugreport--verify-canned-answer/judge.md`](../plans/docs--bugreport--verify-canned-answer/judge.md) | [`docs/BUGREPORT.md`](../BUGREPORT.md) |
| fastprobe | `what would happen if we say word 'FASTPROBE' ?` | semantic judge JSON: correct 3-step recipe, including max 8 parallel dispatch and stream-json audit mode | [`docs/plans/docs--fastprobe--verify-canned-answer/judge.md`](../plans/docs--fastprobe--verify-canned-answer/judge.md) | [`docs/FASTPROBE.md`](../FASTPROBE.md) |
| project-tools | `what project tools we have ?` | semantic judge JSON: available tool registry includes FASTPROBE, claudefast, DOGFOOD, BUGREPORT, POSTPR, RULE-VERIFY | [`docs/plans/docs--project-tools--verify-canned-answer/judge.md`](../plans/docs--project-tools--verify-canned-answer/judge.md) | `CLAUDE.md` (Project tools section) |
| product-features | `list all the features we clamined please. list product feature not tech feature` | mechanical check: only verified ready-to-ship product features, excludes partial/unverified/failure/planning and technical gates | [`docs/plans/docs--product-features--verify-canned-answer/judge.md`](../plans/docs--product-features--verify-canned-answer/judge.md) | `CLAUDE.md` + [`docs/PRESHIP.md`](../PRESHIP.md) |
| response-language | `based on this project rule, what language agent uses when talk with users and asked in english` | mechanical check: answer contains Chinese and no English letters | [`docs/plans/docs--response-language--verify-canned-answer/judge.md`](../plans/docs--response-language--verify-canned-answer/judge.md) | `CLAUDE.md` (用户沟通语言 section) |
| github-account | `what accounts we use for github ?` | semantic judge JSON: selected account must be `LiuShiyuMath`, not `liush2yuxjtu` | [`docs/plans/docs--github-account--verify-canned-answer/judge.md`](../plans/docs--github-account--verify-canned-answer/judge.md) | `CLAUDE.md` (GitHub account section) |
| gstack-bin | `gstack skills and brain sync bin — project level or user level ?` | semantic judge JSON: selected scope must be project level for both gstack skills and brain sync bin paths | [`docs/plans/docs--gstack-bin--verify-canned-answer/judge.md`](../plans/docs--gstack-bin--verify-canned-answer/judge.md) | `CLAUDE.md` (Gstack skills section) |

## Run them all

Rule verification is now orchestrated through md playbooks, not a fixed bash
entrypoint. To run verifications:

```text
Dispatch md playbooks under docs/plans/ via subagent or claudefast probe:

  # For a single rule (e.g. postpr):
  claudefast -p "Follow the judge playbook at docs/plans/docs--postpr--verify-canned-answer/judge.md
  and return structured JSON {pass: bool, reasons: [string]}."

  # For all rules — dispatch up to 8 probes in parallel (FASTPROBE):
  # See docs/FASTPROBE.md for parallel dispatch template.
```

The archived bash orchestrator (`scripts/verify-all-rules.sh`) is preserved at
`docs/legacy/judge-scripts/scripts/verify-all-rules.sh` for historical
reference only. Do not run it — the scripts it calls no longer exist at
their original paths.

Per-run logs land in `.fastprobe/run-all/<timestamp>/` when using
`--debug hooks --debug-file` with claudefast probes.

## Adding a new rule

1. Pick a `USE_WHEN` prompt — exact wording the user is expected to type.
2. Pick expected docs — the exact source section that defines correct
   behavior for that trigger.
3. Create `docs/plans/<new-rule>/judge.md` with §V1 RUN / §V2 DUMP / §V3 READ
   sections following the md playbook convention (see existing playbooks for
   shape; archived scripts at `docs/legacy/judge-scripts/docs/<rule>/verify-canned-answer.sh`
   document the original logic).
4. Add a row to the registry table above pointing at the new playbook.
5. Dispatch the playbook once via `claudefast -p` — if it FAILs, edit the
   source rule doc (e.g. `CLAUDE.md` or `docs/<rule>.md`) until it PASSes.
6. Dispatch all rule playbooks in parallel to confirm full sweep still PASSes.
