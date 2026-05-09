```
                  report.md — issue #122 V1 dogfood enablement
                  ============================================

   plan.md ──► research.md ──► judge.md ──► TEAMWORK 5-slice exec
                                    │
                                    ▼
                          opus 1M reporter PASS
                                    │
                                    ▼
                            PR #177 opened (normal, not draft)
                                    │
                                    ▼
                         /review pre-landing pass
                            ├─ structured: 1 finding (auto-fixed)
                            └─ adversarial: 9 findings (auto-fixed)
                                    │
                                    ▼
                      this report — what shipped vs plan
```

# Report — Issue #122 V1 真用户 Dogfood Enablement

Per AGENTS.md rule 9, written when the plan completes. This records
what actually shipped vs. `plan.md`'s design, what slipped, and what
remains as follow-up work.

## What shipped

PR #177 (normal, squash-merge target) on branch `worktree-122` →
`main`, with 4 commits:

1. `42599fc docs(issue-122)` — plan + research + judge harness +
   `.judge/` to `.gitignore`
2. `7c025e6 fix(landing)` — `apps/landing/public/double-moment.gif`
   (62 KB GIF89a 800×450) + `apps/landing/src/index.html` swap
3. `4d5eceb docs(issue-84)` — `docs/plans/issue-84/v1-dogfood/`
   recording protocol + ledger template
4. `dba737f fix(landing)` — relative GIF path so local preview also
   resolves (auto-fix from /review structured pass)
5. *(plus a single review-fixes commit consolidating /review
   adversarial findings — see "Review iterations" below)*

External state changed:

- `github-pages` env: added `main` to `custom_branch_policies` via
  `gh api …/deployment-branch-policies`. Verifiable with the same
  endpoint. Documented in `research.md` "Operational note" section
  so a future maintainer who reverts the policy via UI knows the
  re-apply command.
- `landing-deploy.yml` run `25563553674` succeeded on `main` (build +
  deploy both `success`). `https://libz-renlab-ai.github.io/TeamBrain/`
  returns HTTP/2 200.

Closes:

- #120 (hero GIF placeholder removed; GIF asset present)
- #122 acceptance R1–R5 (R6 deferred to manual post-merge step;
  closed by human comment on the issue when the dogfood run
  finishes)

## Slice-by-slice outcomes vs plan

| Slice | Plan | Actual | Delta |
|---|---|---|---|
| A — Pages env-policy | `gh api` add `main` to deploy branch policies | Done; `total_count` went 1→2; admin auth available | none |
| B — Re-trigger + verify | workflow_dispatch + curl 200 | Done; deploy `success`, page 6926 bytes, `looks_like_landing: true` | none |
| C — Hero GIF + HTML swap | Drop GIF (recorded asciinema → agg) + `<img>` swap | Done as planned. Initial commit (`7c025e6`) shipped a python-pil placeholder; later commit (`dcc4119`) replaced it with a real `asciinema 3.2.0` + `agg 1.7.0` recording of `pnpm teamagent skeleton-demo` (787×450 ↦ 16:9 hero, 37705 bytes, ~4 s). Cast saved at `docs/plans/issue-84/v1-dogfood/landing-hero-demo.cast` for reference. **As-built path:** relative `double-moment.gif` (review auto-fix from initial absolute `/TeamBrain/double-moment.gif`). | none after `dcc4119`; placeholder→real swap was a user-gated step before merge |
| D — Dogfood scaffold | `README.md` + `template-comment.md` + `.gitkeep` | Done; 280 + 188 + 0 lines. Threshold sources unified (ASCII art now defers to abort signals table after /review adversarial finding). | none |
| E — 1+2+3 hardmatch | `pnpm --filter landing build` claudefast/codex hardmatch | Module substituted to `pnpm teamagent --help` (landing build script has no `--help`). Codex substituted to direct shell exec (`OPENAI_API_KEY` unset in env, HTTP 401). Hardmatch byte-clean (0 bytes diff). tmux `/export` left as a placeholder for the lead — not run interactively. | both substitutions disclosed in PR description and `judge.md` "as-built note" |

## Review iterations

Two passes ran on the open PR:

1. **/review structured pass** — found 1 INFORMATIONAL finding:
   `apps/landing/src/index.html:53` `src="/TeamBrain/double-moment.gif"`
   breaks `npx serve dist` local preview. Auto-fixed in commit
   `dba737f` to a relative `src="double-moment.gif"`.

2. **/review adversarial subagent (Step 5.7)** — found 9
   INFORMATIONAL findings; all auto-fixed inline. *(Note: at the time
   of this list the GIF was still a python-pil placeholder. A
   follow-up commit (`dcc4119`, after a user-gated decision) replaced
   it with a real asciinema-recorded GIF; see Slice C row above and
   the updated alt text on `index.html:53`.)*:
   - `loading="lazy"` → `loading="eager"` + added `fetchpriority="high"`
     (hero is above the fold; lazy delays LCP).
   - `apps/landing/public/.gitkeep` removed (no longer needed; was
     also shipping to Pages artifact as
     `https://libz-renlab-ai.github.io/TeamBrain/.gitkeep`).
   - `plan.md` Slice C row updated to record relative path + eager
     loading as the as-built choice.
   - `judge.md` §V1.C step 4 rewritten to check the actual ledger
     template (was checking a non-existent `scripts/dogfood/tthw-record.sh`).
   - `judge.md` §V1.E got an "as-built note" recording the module +
     codex substitution.
   - `index.html` alt text softened to acknowledge placeholder.
   - `README.md` ASCII art now defers to the abort signals table for
     thresholds (was contradicting the per-step budget).
   - This `report.md` — written per AGENTS.md rule 9.
   - `research.md` got an "Operational note" section pointing the
     env-policy command at maintainers.

No critical findings; no merge blocks; no follow-up issues opened
(per `docs/PR-PLAN.md` no-follow-up-issue rule, all P1/P2 must be
fixed in this PR — and none were P1/P2).

## R6 — what remains (manual, post-merge)

The acceptance row R6 — "≥1 real stranger TTHW ≤ 300 s with recording
attached" — is intentionally not closed by this PR. Per #84
acceptance, no AI agent / Codex / CI / sandbox session qualifies as
the stranger; only a human-led recruitment + recording satisfies it.
After this PR squash-merges:

1. Re-run `judge.md` §V1.A + §V1.B against the live site to confirm
   the new GIF is on the deployed page (currently still on `main`'s
   pre-merge state). Comment outcome on #122.
2. Recruit ≥1 real stranger per `docs/plans/issue-84/v1-dogfood/README.md`
   recruitment criteria.
3. Record the run with `asciinema rec` (or fallback `.mov`); save the
   `.cast` file under `docs/plans/issue-84/v1-dogfood/<user-handle>.cast`.
4. Paste the filled `template-comment.md` as a comment on issue #122.
5. Comment on issue #84 with link, closing R6.
6. **If TTHW > 300 s:** record what tripped the user, file follow-up
   *issues* (this is post-merge UX iteration, not the PR-PLAN
   no-follow-up-issue rule which targets in-PR review findings — see
   `README.md` Abort 后做什么 §).
7. *(Resolved pre-merge in commit `dcc4119`: the placeholder GIF was
   replaced with a real `asciinema` + `agg` recording of
   `pnpm teamagent skeleton-demo`. No public-launch follow-up needed
   for the GIF asset itself; the dogfood result may still surface
   wording / install-flow follow-ups per item 6.)*

## Risks and known limitations

- ~~**Placeholder GIF**~~ — *resolved in commit `dcc4119` before merge:
  the python-pil placeholder was replaced with a real asciinema-recorded
  GIF of `pnpm teamagent skeleton-demo` (787×450, 37 KB, ~4 s; cast
  saved under `docs/plans/issue-84/v1-dogfood/landing-hero-demo.cast`).
  The PR now ships a real demo asset.*
- **Codex substitution in §V1.E**: full cross-LLM determinism is not
  proven for this PR — only `claudefast` actually participated as an
  LLM. Mitigation: the substituted artefact still shows byte-identity
  on a deterministic CLI command, which is the spirit of the gate.
  Future PRs touching the landing surface should configure a working
  Codex auth before relying on §V1.E.
- **Worktree path** is `.claude/worktrees/122/` not `.codex/worktrees/`
  per CLAUDE.md preference. Pre-existing; relocation cost > benefit.
  Documented in PR description.
- **Pages env-policy state lives outside the repo**: a repo admin
  could revert the policy via UI and silently break Pages. Mitigated
  by `research.md` Operational note + `judge.md` §V1.A capturing the
  state on every harness run (so the next dogfood attempt would
  detect a regression).

## References

- PR #177: feat(issue-122) unblock V1 dogfood
- Issue #122: V1 真用户 dogfood
- Issue #120: hero GIF placeholder (closed by this PR)
- Issue #84: parent acceptance — TTHW ≤ 5 min
- PR #115: landing scaffolding + workflow that exposed the env-policy gap
- ADR-0007: replaces Codex bot with `/review` skill as POSTPR gate
- `docs/PR-PLAN.md`: no follow-up issues for in-PR review findings
- `docs/HOWTO-PLAN-PR.md`: 4-section PR plan structure
- `docs/TEAMWORK.md`: N+1+(2N) execution pattern used for slice exec
