```
              judge.md — BPP Milestone 1 acceptance harness (md playbook)
              ===========================================================

   §V1 RUN ──► fixed commands, captured to evidence_dir
        │      drives the USER-FACING surface (teamagent CLI + curl),
        │      NOT library imports — a passing unit test ≠ a usable feature
        ▼
   §V2 DUMP ──► canonical JSON at .judge/<run_id>/judge.json
        │       schema: exit_code / metrics / evidence_dir
        ▼
   §V3 READ ──► separate claudefast -p reads JSON ONLY, grades PASS/FAIL
                never the agent that wrote the code

   Hard rule (docs/PR-PLAN.md): third-party judge harness forbids fixed
   scripts; this is an md playbook. Failed slices rerun by re-dispatching
   §V<n>, NOT by editing a script.
```

# judge.md — BPP Milestone 1 (推送链路) Acceptance Harness

Verifies **里程碑一 · 推送链路** of the frozen acceptance contract
`docs/plans/2026-05-13-bpp-full-system-acceptance.md` §2.

**Why this harness exists.** PR #430 shipped the BPP server skeleton and
claimed "Phase 1-6 ✅ DONE", but the §6 验收过程 ("用户亲自跑 §2 验证脚本")
was never executed before squash-merge. This playbook turns §2 里程碑一's
10-step 验证方法 into a mechanically-runnable gate so no future PR can
re-declare M1 "done" by prose alone.

**Design rule — drive the user-facing surface.** §2 里程碑一 验证方法 says
a third party runs commands "不读任何代码、只跑命令". So §V1 drives the
`teamagent` CLI and `curl`, NOT `@teamagent/digital-twin` library imports.
A step whose user-facing command does not exist **FAILs** — that is the
signal, not a bug in the harness.

`<run_id>` convention: `${ISO_DATE}-bpp-m1` (e.g. `2026-05-14-bpp-m1`).

## §V1 RUN — fixed commands

Capture stdout + stderr to `evidence_dir = .judge/<run_id>/evidence/`.
Each slice maps to numbered steps of §2 里程碑一 验证方法.

### §V1.A — Server foundation + push fan-out (验证方法 steps 1, 4, 5)

```
1.  # step 1 — start a central server instance via the user-facing CLI.
    #   Capture BOTH the top-level help AND the `bpp` namespace help: bpp
    #   subcommands live under `teamagent bpp <sub>`, so bpp-help.txt is the
    #   authoritative per-subcommand surface. Probes anchor on the literal
    #   `teamagent bpp <sub>` prefix — that string only appears on a REAL
    #   command line, never in the namespace help's "coming soon" prose
    #   (which lists bare words `push / inbox / ...`, not `teamagent bpp X`).
    pnpm teamagent --help > evidence_dir/cli-help.txt 2>&1
    pnpm teamagent bpp --help > evidence_dir/bpp-help.txt 2>&1
    grep -nE 'teamagent bpp serve\b' evidence_dir/bpp-help.txt \
      > evidence_dir/A-serve-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/A-serve-cmd.txt
2.  # step 4 — push one BestPractice to the push endpoint. The REAL existence
    #   probe greps bpp-help.txt for the literal `teamagent bpp push` command
    #   line: a command exists only if the CLI lists it as a real command,
    #   never because a doc mentions it and never because the namespace help
    #   names it as a future subcommand. grep_exit=0 here == CLI has it.
    grep -nE 'teamagent bpp push\b' evidence_dir/bpp-help.txt \
      > evidence_dir/A-push-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/A-push-cmd.txt
2b. # SEPARATE probe — fictional-docs detector. The usage/ops guides shipped in
    #   PR #430 instruct `pnpm teamagent bpp ...`; this probe records that the
    #   docs reference commands that do NOT exist in cli-help.txt. grep_exit=0
    #   here is a RED flag (docs promise a CLI that was never wired), NOT a pass.
    grep -rnE 'teamagent .*(bpp|bp-push)|/v1/bp-push' docs/usage/ docs/ops/ \
      > evidence_dir/A-push-docs-fiction.txt 2>&1 ; echo "grep_exit=$?" >> evidence_dir/A-push-docs-fiction.txt
3.  # step 5 — inbox fan-out reachable from a command. Real probe = bpp-help.txt,
    #   anchored on the literal `teamagent bpp inbox` command line.
    grep -nE 'teamagent bpp inbox\b' evidence_dir/bpp-help.txt \
      > evidence_dir/A-inbox-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/A-inbox-cmd.txt
4.  # library-layer cross-check (informational only — proves the SERVER code
    #   works even when the CLI surface does not; keeps the verdict honest)
    npx vitest run packages/digital-twin/src/bpp 2>&1 \
      | tee evidence_dir/A-bpp-vitest.log
```

### §V1.B — Member client + role setup (验证方法 steps 2, 3)

```
1.  # step 2 — start member clients (老张 / 小李 / 小王). acceptance §5 item 2
    #   requires "可运行的成员客户端代码，一键安装自动接入中心服务" — the member
    #   client must be discoverable from the TOP-LEVEL `teamagent --help`, so
    #   this probe stays on cli-help.txt (NOT bpp-help.txt) but is anchored on
    #   the literal `teamagent bpp join` command line. The old loose
    #   `team|member|client|inbox` grep false-matched the `teamagent team init`
    #   line — same false-positive class as the §V1.A `\bpush\b` collision.
    grep -nE 'teamagent bpp join\b' evidence_dir/cli-help.txt \
      > evidence_dir/B-member-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/B-member-cmd.txt
2.  # step 3 — set 老张 as lead (creator = lead, per CEO decision #4)
    pnpm teamagent team init --help > evidence_dir/B-team-init.txt 2>&1 \
      ; echo "exit=$?" >> evidence_dir/B-team-init.txt
3.  # is the command file even wired into the dispatcher?
    grep -rnE 'team-init|team-transfer-lead' packages/cli/src/bin.ts \
      > evidence_dir/B-bin-wiring.txt 2>&1 ; echo "grep_exit=$?" >> evidence_dir/B-bin-wiring.txt
```

### §V1.C — Accept → skill compile → real trigger (验证方法 steps 6, 7)

```
1.  # step 6 — 小李 accepts; verify a skill file lands in the local skill library.
    #   Real probe = bpp-help.txt, anchored on the literal `teamagent bpp accept`
    #   command line (the inbox→accept→compile path is reachable only if the
    #   accept command exists). bpp-help.txt is captured in §V1.A step 1.
    grep -nE 'teamagent bpp accept\b' evidence_dir/bpp-help.txt \
      > evidence_dir/C-accept-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/C-accept-cmd.txt
2.  # compile-to-skill target dir per PR #430 claims
    grep -rnE 'skills/teamagent|\.claude/skills' \
      packages/digital-twin/src/bpp/compile-to-skill.ts \
      > evidence_dir/C-compile-target.txt 2>&1
3.  # step 7 — AGENT-MANUAL. "助手在动手前主动提醒" requires a real interactive
    #   claude session picking up the compiled skill and triggering it. No AI
    #   agent can honestly self-certify this (cf. issue #122 judge.md R6).
    #   Graded MANUAL in §V3 — a human attaches a tmux /export showing the
    #   compiled skill firing, or it stays UNVERIFIED.
    echo "AGENT-MANUAL: see §V3 row C2" > evidence_dir/C-step7-manual.txt
```

### §V1.D — Lead revoke cascade (验证方法 step 8)

```
1.  # step 8 — 老张 revokes; inbox entry disappears AND accepted skill file deleted.
    #   Real probe = bpp-help.txt, anchored on the literal `teamagent bpp revoke`
    #   command line (bpp-help.txt is captured in §V1.A step 1).
    grep -nE 'teamagent bpp revoke\b' evidence_dir/bpp-help.txt \
      > evidence_dir/D-revoke-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/D-revoke-cmd.txt
2.  # does revoke.ts cascade to skill-file deletion, or only to inbox status?
    #   Pattern is tightened to actual fs-deletion APIs + compiled-skill paths —
    #   the loose `delete|skill` matched error-message string literals and gave
    #   a false grep_exit=0. grep_exit=0 here == revoke really deletes the skill.
    grep -nE 'unlinkSync|rmSync|fs\.rm|removeSync|deleteSkill|compile-to-skill|SKILL\.md|skills/teamagent' \
      packages/digital-twin/src/bpp/revoke.ts \
      > evidence_dir/D-revoke-cascade.txt 2>&1 ; echo "grep_exit=$?" >> evidence_dir/D-revoke-cascade.txt
```

### §V1.E — Audit chain + sub-lead boundary (验证方法 steps 9, 10)

```
1.  # step 9 — audit log records push/accept/revoke. Real probe = bpp-help.txt,
    #   anchored on the literal `teamagent bpp audit` command line (bpp-help.txt
    #   is captured in §V1.A step 1). The old loose `grep audit cli-help.txt`
    #   false-matched `ingest --from-audit` — same false-positive class as the
    #   `\bpush\b` → `m5-publish [--push]` collision §V1.A step 2 already fixed.
    grep -nE 'teamagent bpp audit\b' evidence_dir/bpp-help.txt \
      > evidence_dir/E-audit-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/E-audit-cmd.txt
2.  # step 10 — sub-lead boundary: a command to inspect a user's role tier.
    #   Real probe = bpp-help.txt, anchored on the literal `teamagent bpp role`
    #   command line. The old loose `grep 'role|sub.?lead|transfer' cli-help.txt`
    #   false-matched unrelated top-level help prose.
    grep -nE 'teamagent bpp role\b' evidence_dir/bpp-help.txt \
      > evidence_dir/E-role-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/E-role-cmd.txt
```

### §V1.F — Repo green gate (质量验收 — must stay green)

```
1.  # NOTE: use `--pretty false` explicitly. The bare `pnpm typecheck`
    #   wrapper runs `tsc --noEmit -p tsconfig.base.json` with the default
    #   `--pretty true`, which on Windows deterministically exits 1 with
    #   ZERO output (tsc 5.9.3 pretty-printer / console-encoding flake) even
    #   when the code is clean. `--pretty false` and `--extendedDiagnostics`
    #   both exit 0. Driving the harness off the bare wrapper would record a
    #   false typecheck failure. Baseline 2026-05-14: 1292 files, 0 errors.
    npx tsc --noEmit -p tsconfig.base.json --pretty false 2>&1 \
      | tee evidence_dir/F-typecheck.log ; echo "exit=${PIPESTATUS[0]}" \
      | tee -a evidence_dir/F-typecheck.log
2.  # bpp library suite must stay green. Full `packages/cli/src` E2E suite
    #   runs on CI, not locally (CLAUDE.md 测试在哪里跑 — local concurrent
    #   full runs saturate the scheduler).
    npx vitest run packages/digital-twin/src/bpp 2>&1 \
      | tee evidence_dir/F-vitest.log
```

## §V2 DUMP — canonical JSON

The runner writes `.judge/<run_id>/judge.json`. It emits metric numbers
only — it does **not** decide PASS/FAIL (that is §V3's job).

```json
{
  "run_id": "2026-05-14-bpp-m1",
  "exit_code": 0,
  "metrics": {
    "cli_has_bpp_serve_cmd": false,
    "cli_has_bp_push_cmd": false,
    "cli_has_inbox_cmd": false,
    "cli_has_team_init_cmd": false,
    "cli_has_member_client_cmd": false,
    "cli_has_revoke_cmd": false,
    "cli_has_audit_cmd": false,
    "cli_has_role_cmd": false,
    "team_init_wired_into_bin": false,
    "bpp_vitest_exit": 0,
    "compile_to_skill_target": "<path or empty>",
    "revoke_cascades_to_skill_file": false,
    "step7_agent_trigger": "AGENT-MANUAL",
    "typecheck_exit": 0,
    "vitest_exit": 0
  },
  "evidence_dir": ".judge/2026-05-14-bpp-m1/evidence/"
}
```

## §V3 READ — LLM judge (read-only)

A separate `claudefast -p` is dispatched with the prompt below. It reads
ONLY `judge.json` + `evidence/**` — never source, never the agent's word.

### Judge prompt template

```text
You are a third-party PR judge. You are NOT the agent that wrote the code.
You may read ONLY:
  .judge/<run_id>/judge.json
  .judge/<run_id>/evidence/**

Grade each acceptance row as PASS / FAIL / MANUAL with a one-line reason
citing the evidence file you used.

Acceptance rows — 里程碑一 推送链路 (acceptance.md §2):

  A1. Central server reachable via CLI   metrics.cli_has_bpp_serve_cmd == true
  A2. Push endpoint usable as a command  metrics.cli_has_bp_push_cmd == true
  A3. Inbox fan-out reachable            metrics.cli_has_inbox_cmd == true
  B1. Member client ships + auto-joins   metrics.cli_has_member_client_cmd == true
  B2. team init makes creator the lead   metrics.cli_has_team_init_cmd == true
                                         AND metrics.team_init_wired_into_bin == true
  C1. Accept writes a skill file         metrics.cli_has_inbox_cmd == true
                                         AND metrics.compile_to_skill_target non-empty
  C2. Accepted skill auto-triggers       MANUAL — human attaches tmux /export of the
                                         compiled skill firing in a real claude session
  D1. Lead revoke cascade                metrics.cli_has_revoke_cmd == true
                                         AND metrics.revoke_cascades_to_skill_file == true
  E1. Audit chain inspectable            metrics.cli_has_audit_cmd == true
  E2. Sub-lead boundary                  metrics.cli_has_role_cmd == true
  F1. Repo green                         metrics.typecheck_exit == 0
                                         AND metrics.vitest_exit == 0

Verdict = PASS only if every row is PASS (C2 may be MANUAL-pending but
must not be FAIL). Output JSON: {"verdict","rows":[{row,verdict,reason,evidence}]}.
```

### Failure recovery

- FAIL on A1/A2/A3/B1/B2/D1/E1/E2 → the user-facing command does not exist.
  Recovery is implementation work (wire the CLI), NOT editing this playbook.
  Each FAIL row is a tracked child issue under the BPP-completion epic.
- FAIL on C1 → `compile-to-skill` does not produce a real skill file; fix the
  compile path, re-dispatch §V1.C.
- C2 stays MANUAL until a human attaches the tmux `/export` evidence — like
  issue #122 R6, no AI agent can honestly self-certify a real agent trigger.
- FAIL on F1 → a regression; fix it and re-dispatch §V1.F. Never paper over.

## Baseline run — 2026-05-14 against `main` @ ce331cb

Recorded in `.judge/2026-05-14-bpp-m1/` (gitignored transient evidence);
`judge.json` copied into this plan dir as `baseline-judge.json`.

**Actual baseline verdict: FAIL — 9 FAIL / 1 PASS / 1 MANUAL.**

Independently re-graded by a process-isolated `claude -p` judge that saw
ONLY `judge.json` + `evidence/**` (no source, no conversation context):
verdict **FAIL**, row-by-row identical to the table below — recorded in
`baseline-judge-v3.json`. The independent re-grade also corrected an
off-by-one in the harness author's first summary draft (9 FAIL, not 10).

| Row | Verdict | Finding |
|-----|---------|---------|
| A1 serve cmd | FAIL | no bpp / central-server command in `teamagent --help` |
| A2 push cmd | FAIL | no bp-push command; **usage docs instruct `pnpm teamagent bpp ...` but those commands do not exist** |
| A3 inbox cmd | FAIL | no inbox command anywhere |
| B1 member client | FAIL | no member-client command (acceptance §5 item 2 unmet) |
| B2 team init | FAIL | `teamagent team init` → `未知命令: team`; `team-init.ts` / `team-transfer-lead.ts` are orphan files never imported by `bin.ts` |
| C1 accept→skill | FAIL | compile-to-skill target path defined in source, but no accept CLI to reach it |
| C2 auto-trigger | MANUAL | needs a human tmux `/export` of the compiled skill firing |
| D1 revoke cascade | FAIL | no revoke command; `revoke.ts` does not cascade to compiled-skill-file deletion |
| E1 audit | FAIL | no bpp audit command (only unrelated `ingest --from-audit`) |
| E2 sub-lead | FAIL | no role / sub-lead / transfer command |
| F1 repo green | PASS | 1292 files typecheck clean, bpp vitest 194 pass / 3 skip |

**Two findings beyond the original hand-evaluation:**

1. **Usage docs ship fictional commands.** `docs/usage/bpp-lead-guide.md`,
   `bpp-member-guide.md` and `docs/ops/bpp-runbook.md` (all shipped in PR #430)
   instruct users to run `pnpm teamagent bpp force-push / revoke / role set /
   audit tail / my-stats / install / ping ...` — **none of these commands exist
   in `teamagent --help`.**
2. **`pnpm typecheck` is unreliable on Windows.** The bare wrapper runs `tsc`
   with the default `--pretty true`, which exits 1 with zero output on this
   Windows box (tsc 5.9.3 flake) even though the code is clean. `--pretty false`
   exits 0. §V1.F is pinned to `--pretty false` so the harness is deterministic.

This is the mechanical confirmation of the gap the PR #430 hand-evaluation
found. Each FAIL row is now a tracked TODO; no future PR can re-declare M1
"done" by prose alone — it must flip these rows by re-running §V1.

## M1 completion run — 2026-05-14 against `main` @ 6fc88f2

Recorded in `.judge/2026-05-14-bpp-m1/` (gitignored transient evidence);
`judge.json` copied into this plan dir as `m1-pass-judge.json`, the §V3
verdict as `m1-pass-judge-v3.json`.

**Actual M1 verdict: PASS — 10 PASS / 1 MANUAL.**

The 9 baseline FAIL rows were flipped by a 5-PR CLI-surface series, each
re-running its §V1 slice to confirm:

| PR | Subcommands shipped | Rows flipped |
|----|---------------------|--------------|
| #470 PR-A | `bpp` namespace + `bpp serve` | A1 |
| #471 PR-B | `bpp push` / `inbox` / `accept` / `reject` | A2, A3, C1 |
| #472 PR-C | `bpp revoke` / `force-push` + skill-file cascade | D1 |
| #474 PR-D | `bpp audit` / `role` + wired `team init` / `transfer-lead` | B2, E1, E2 |
| #475 PR-E | `bpp join` + `POST /v1/members` member self-registration | B1 |

Independently re-graded by a process-isolated `claude -p` judge that saw
ONLY `judge.json` + `evidence/**` (no source, no conversation context):
verdict **PASS**, every one of the 11 rows PASS except C2 which stays
MANUAL-pending (counts toward PASS per the §V3 rule). Recorded in
`m1-pass-judge-v3.json`.

**Two notes carried forward:**

1. **C2 still needs a human.** The "accepted skill auto-triggers in a real
   claude session" row cannot be agent-self-certified — a human must attach a
   tmux `/export` showing the compiled skill firing. This is the one
   outstanding M1 item and it is BLOCKED-ON-HUMAN by design, not a code gap.
2. **Audit events are stored but not hash-chained.** The handlers call
   `appendAudit` directly, not via `linkAuditEvent`; `bpp audit` lists events
   but tamper-evident chain verification is M5 audit-hardening scope (the
   `linkAuditEvent` / `verifyAuditChain` functions exist, labeled "Phase 5
   P5.4", but are not wired into the write path).

The §V1.A.2b fictional-docs probe still matches, but most commands it flags
(`bpp push/inbox/accept/reject/revoke/force-push/audit/role/join`) now exist —
a match there is expected noise post-M1, not a fiction flag.
