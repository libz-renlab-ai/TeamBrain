```
        plan ──→ research ──→ annotate ──→ implement ──→ report
          │         │             │            │           │
          │         │             │            │           └─ docs/plans/2026-05-09-fixed-flow/report.md (post-impl)
          │         │             │            └─ commits per phase 1a / 1b / 2 / 3 / 4abcd / 5
          │         │             └─ in-place comments + PR-PLAN per /review iter
          │         └─ docs/plans/2026-05-09-fixed-flow/research.md
          └─ this file
```

# Plan: FIXEDFLOW — lock down TeamBrain issue → PR → merge workflow

> Date: 2026-05-09
> Slug: `2026-05-09-fixed-flow`
> Companion: `research.md` (context dump), `judge.md` (verification playbook)
> Approval: this plan was approved via Claude Code plan-mode `ExitPlanMode` on 2026-05-09 by user.

## §1 Task description

Build a single, fixed end-to-end workflow for TeamBrain:

1. (manual) Reporter writes a <50-word issue from the sole allowed
   GitHub issue template.
2. (manual) Reporter pastes `/grill-me` (web claude.ai) or
   `/grill-with-docs` (CC CLI) output as an issue comment, then adds
   `grill-ready` label.
3. (auto) Local mainpi watcher dispatches a `fixed-flow-driver` skill
   that creates `.codex/worktrees/issue-<N>/` and implements per the
   grill comment.
4. (auto) Driver runs `/review` skill in an **infinite loop** until
   PASS, writing per-iteration `docs/plans/<date>-pr-<N>-fix-plan.md`
   per `docs/PR-PLAN.md` rule, fixing in same PR branch.
5. (auto) Driver opens a normal (non-draft) PR via `gh pr create`,
   then `gh pr merge <N> --squash --auto`. Cleans worktree, writes
   `docs/plans/<date>-issue-<N>/report.md`.

A refusal layer (GitHub Action) closes any non-conformant issue (wrong
template, body > 50 words, or no `grill-ready` within 24 h). First 7 days
runs in `warn` mode; flips to `enforce` after.

A heartbeat layer comments `🤖 queued for local pipeline (last heartbeat:
<ts>)` on `grill-ready` so author sees pipeline engagement even before
driver acts.

A bypass mechanism (`bypass-fixed-flow` label, admin-only via
`gh api ...permission` check) supports dependabot / hotfix /
security patches.

### Do NOT

- Add a FIXEDFLOW canned-answer block to `CLAUDE.md` or `AGENTS.md`
  (POSTPR.md L115 / ADR-0007 forbid).
- Use `.claude/worktrees/` for issue worktrees (AGENTS.md rule:
  `.codex/worktrees/`).
- Open draft PRs (TeamBrain CLAUDE.md rule).
- Use `--merge` or `--rebase` for merge (squash-only memory rule).
- Open follow-up issues when /review fails (PR-PLAN.md: same PR fix).
- Edit user-level files (`/Users/m1/projects/AGENTS.md`,
  `~/.claude/CLAUDE.md`).

## §2 Expected outputs (deliverables)

| Path | Status | Purpose |
|------|--------|---------|
| `docs/FIXEDFLOW.md` | ✅ Phase 1a | Canonical workflow spec, 125 lines |
| `docs/archive/HOW-TO-ISSUE.md` | ✅ Phase 1a | Legacy 3-section convention archived |
| `docs/PROJECT-TOOLS.md` (row 13 edit) | ✅ Phase 1a | HOWTOISSUE → FIXEDFLOW reference swap |
| `docs/plans/2026-05-09-fixed-flow/plan.md` | ⏳ Phase 1b (this) | Canonical plan promotion |
| `docs/plans/2026-05-09-fixed-flow/research.md` | ⏳ Phase 1b | Explore-agent surveys |
| `docs/plans/2026-05-09-fixed-flow/judge.md` | ⏳ Phase 1b | Md playbook §V1/V2/V3 |
| `docs/plans/2026-05-09-fixed-flow/report.md` | ⏳ Phase 6 | Post-impl outcome per Boris |
| `.github/ISSUE_TEMPLATE/config.yml` | ⏳ Phase 2 | `blank_issues_enabled: false` |
| `.github/ISSUE_TEMPLATE/fixed-flow.yml` | ⏳ Phase 2 | Sole allowed template |
| `.github/workflows/issue-conformance.yml` | ⏳ Phase 2 | Refusal Action (warn → enforce) |
| `.github/workflows/fixed-flow-heartbeat.yml` | ⏳ Phase 3 | Heartbeat comment on label |
| `scripts/fixed-flow-watcher.sh` | ⏳ Phase 4a | Local poller, mainpi dispatcher |
| `.claude/skills/fixed-flow-driver/SKILL.md` | ⏳ Phase 4b | Driver skill (CC) |
| `.codex/skills/fixed-flow-driver/SKILL.md` | ⏳ Phase 4b | Codex mirror |
| `.fixedflow/.gitkeep` + `.gitignore` | ⏳ Phase 4c | Runtime state dir |
| `CLAUDE.md` (this worktree, +1 link line) | ⏳ Phase 4d | Single link to docs/FIXEDFLOW.md |

End-to-end smoke: one throwaway test issue runs through all 5 steps,
producing PR + squash-merge + `iter-<N>.json` + `report.md`.

## §3 Third-party judge harness

See companion `judge.md`. Driver does NOT self-evaluate; the harness is
an md playbook the MAIN agent dispatches:

- §V1 RUN: 4 probes (claudefast / codex / watcher dry-run / tmux export)
- §V2 DUMP: `.judge/<run_id>/judge.json` with 7 boolean metrics
- §V3 READ: claudefast-as-judge reads only judge.json + evidence_dir,
  emits PASS / FAIL / SKIP

7 anchors gate PASS:
1. claudefast probe contains all 5 step labels
2. codex probe contains all 5 step labels
3. claudefast and codex hard-match on canonical 5-step JSON projection
4. `grep "FIXEDFLOW" CLAUDE.md` returns ONLY the link reference (no canned-answer block)
5. `grep "FIXEDFLOW" AGENTS.md` returns 0 matches at user level (negative anchor)
6. watcher `--dry-run --issue 999` prints `[DRY] would invoke mainpi for issue 999`
7. tmux export contains a `/export` event with FIXEDFLOW prompt-response

## Phase order

1. **Phase 1a** ✅ — docs/FIXEDFLOW.md, archive HOW-TO-ISSUE, PROJECT-TOOLS
2. **Phase 1b** ⏳ — plan dossier (this file + research.md + judge.md)
3. **Phase 2** ⏳ — refusal Action + issue templates (warn mode)
4. **Phase 3** ⏳ — heartbeat Action
5. **Phase 4a-d** ⏳ — watcher + driver skill (gated FIXEDFLOW_DRIVER_ENABLED=0)
6. **Phase 5** ⏳ — judge.md verification dry-run
7. **Phase 6** ⏳ — open PR, /review loop, squash-merge, write report.md
8. **Post-merge** — flip enforcement to `enforce` after 7-day soft-warn

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Mac off → silent pipeline | Heartbeat Action; ⚠️ if heartbeat > 2 h stale |
| Race: label set before grill comment finalized | Driver requires comment age ≥ 60 s OR `--- end grill ---` sentinel; retries 3× then `needs-grill-comment` |
| `/review` infinite loop burns token | PushNotification at iters 10/25/50/100 + per-10-iter token-burn comment; user explicitly chose no hard cap |
| Mis-fired auto-close erodes trust | First 7 days `warn`-only via `vars.FIXEDFLOW_ENFORCEMENT` |
| Squash-merge conflict | Driver rebases once, retries; on second failure adds `needs-human` and bails |
| dependabot / security PRs blocked | `bypass-fixed-flow` label, admin-only via `gh api ...permission` check |

## Reused existing patterns

- `docs/POSTPR.md` — /review loop shape
- `docs/PR-PLAN.md` — per-iter PR fix plan structure
- `docs/HOWTO-PLAN-PR.md` — PR description 4-section structure
- `docs/feature-verification.md` — 1+2+3 verification gates
- `~/.pi/agent/docs/mainpi.md` — mainpi orchestrator pattern
- `scripts/verify-gstack-skill-mirrors.sh` — `scripts/` placement precedent
- `docs/CLAUDEFAST.md` — claudefast non-interactive impl profile

## Self-report

This plan obeys: TOOLADD (PF + ASCII + HTV), plan three-段
(task / outputs / judge harness), Boris workflow (research → plan →
annotate → implement → report). No canned-answer block. Worktree path
`.codex/worktrees/`. Squash-only merge. Non-draft PRs. Same-PR fix loop.
Mainpi venue per user choice. /review infinite loop per user choice
with PushNotification safety net.
