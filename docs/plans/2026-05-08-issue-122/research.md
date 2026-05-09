```
                    research.md — issue #122 prereq state
                    =====================================

   Pages 404 ─┐
              │   gh api environments/github-pages
              │   deployment-branch-policy: only [gh-pages]
              │   workflow runs from main → REJECTED
              ▼
        ROOT CAUSE: env protection rule blocks main deploy

   #120 GIF ─┐
             │   apps/landing/public/ contains only .gitkeep
             ▼   apps/landing/src/index.html: .gif-placeholder div
        ROOT CAUSE: GIF asset never landed; placeholder div renders
```

# Research — issue #122 (V1 真用户 dogfood)

Context dump for the plan. Sources: live `gh api` calls + repo state on
`worktree-122` branch as of 2026-05-08. **Not** the plan; the plan
references this file.

## Issue #122 scope (verbatim from issue body)

- Goal: 陌生用户从看到 landing page 到跑通 `teamagent demo` ≤ 5 分钟。
- Recruitment constraint: ≥ 1 真实陌生用户，**不能是** 队友 / Codex / GitHub
  Actions / sandbox。
- Recording: asciinema `.cast` (+ optional `agg` GIF), saved under
  `docs/plans/issue-84/v1-dogfood/<user>.cast`.
- Acceptance: TTHW ≤ 300s, recording attached, per-step breakdown commented
  on issue #122, friction notes captured, issue #84 commented with link.

## Prereq gate state (live, as of 2026-05-08)

| Gate | Source | State |
|---|---|---|
| PR #115 merged | `gh pr view 115` | ✅ MERGED 2026-05-07 07:01:14Z, commit `5f69b00b…` |
| `https://libz-renlab-ai.github.io/TeamBrain/` returns 200 | `curl -sIL` | ❌ HTTP/2 404 |
| `landing-deploy.yml` last run status | `gh run list` | ❌ failure (run `25533775082` 2026-05-08 02:47, `25481108956` 2026-05-07 07:01) |
| Issue #120 closed | `gh issue view 120` | ❌ OPEN, `closedAt: null` |
| `apps/landing/public/double-moment.gif` exists | `ls apps/landing/public/` | ❌ only `.gitkeep` |
| `release/install.sh` hardened | (not yet checked — out of immediate path) | ⚠ optional gate per issue body |

## Pages deploy failure — root cause

`gh run view 25533775082` annotation:

> ❌ Branch "main" is not allowed to deploy to github-pages due to
> environment protection rules.

`gh api /repos/libz-renlab-ai/TeamBrain/environments/github-pages` returns:

```json
{
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  },
  "protection_rules": [{"type": "branch_policy"}]
}
```

`gh api …/environments/github-pages/deployment-branch-policies`:

```json
{
  "total_count": 1,
  "branch_policies": [{"name": "gh-pages", "type": "branch"}]
}
```

The `landing-deploy.yml` workflow uploads a Pages artifact from a `main`
push and then `actions/deploy-pages@v4` tries to deploy. The
`github-pages` environment only allows `gh-pages` as a deploy branch, so
the deploy job is rejected before running. **Build succeeds (15s); deploy
fails in 1s with "rejected".**

Two fix options:

1. **Add `main` to `custom_branch_policies`** via:
   ```bash
   gh api -X POST \
     /repos/libz-renlab-ai/TeamBrain/environments/github-pages/deployment-branch-policies \
     -F name=main -F type=branch
   ```
   (Admin token required.)
2. **Switch `protected_branches: true`** so any protected branch (i.e.
   `main`) can deploy. Same `gh api` family, different field.

Option 1 is narrower / safer. Plan defaults to option 1.

## Issue #120 — GIF state

- `apps/landing/public/` contains only `.gitkeep`.
- `apps/landing/src/index.html` line 18 defines `.gif-placeholder` CSS
  class; the rendered page shows a grey placeholder where the GIF
  should be.
- Issue #120 title: `record double-moment demo GIF for landing page hero`.
- Two scope choices:
  - **Tight**: leave #120 to its own PR; #122 just unblocks Pages and
    builds dogfood scaffolding. Risk: dogfood meaningless without GIF
    (acceptance step "First PreToolUse intercept visible" is hard to
    sell when the hero is grey).
  - **Wide**: bundle #120 fix into this PR — record asciinema → convert
    to GIF → drop into `apps/landing/public/double-moment.gif` →
    replace `.gif-placeholder` div with `<img>`. Closes both #120 and
    #122 in one PR.

Plan defaults to **wide** (bundle), because #120 is explicitly listed as
a #122 gate in the issue body.

## Branch + worktree state

- Current branch: `worktree-122` (not `main`, TEAMWORK Step 0 OK).
- Worktree path: `/Users/m1/projects/TeamBrain/.claude/worktrees/122`.
  CLAUDE.md prefers `.codex/worktrees/<task>` but this worktree already
  exists; the cost of relocating is high vs benefit. Plan does not
  relocate; PR description will note this deviation.

## Recording toolchain availability

- `asciinema rec` — needs `brew install asciinema` on the recorder's
  machine (per existing pattern in #120). Not required on CI.
- `agg` (asciinema GIF generator) — `brew install agg` or `cargo install
  agg`. Generates the `.gif` from `.cast`.
- The plan ships scaffolding (recording script template, output dir
  layout) but the actual recording is performed by a human (the lead +
  the recruited stranger). Codex / GH Actions cannot be the stranger
  per #84 acceptance.

## Anti-goal map (what this PR does NOT touch)

- TeamAgent runtime / hooks code — not part of dogfood scope.
- `pnpm test` / `pnpm typecheck` baselines — must remain green; PR
  doesn't touch core packages.
- `release-branch.yml`, `nightly-llm-smoke.yml`, `claudefast-anchors.yml`
  workflows — out of scope. Only `landing-deploy.yml` is in scope (and
  only if the env-policy fix alone isn't enough; first attempt is
  config-only via `gh api`, no workflow file edit).
- `apps/landing/src/index.html` other than the `.gif-placeholder` div
  swap — copy/CTAs/install one-liner all stay as PR #115 left them.

## Probe results to cite in plan

The TTHW probe lives at `.fastprobe/issue84/p7.json` per the issue;
plan re-references rather than re-running it.

## Operational note — Pages env-policy maintenance

The fix for the Pages 404 is a GitHub repo Settings change applied
via `gh api`, not a workflow file edit. It lives outside the repo, so
a fresh clone has no automatic record of it. **If a repo admin
reverts the policy via the GitHub UI** (Settings → Environments →
`github-pages` → Deployment branches), all subsequent `main` pushes
to Pages will silently fail at the deploy job with the same
"Branch 'main' is not allowed to deploy to github-pages…" rejection.

**Re-apply command** (admin scope required):

```
gh api -X POST \
  /repos/libz-renlab-ai/TeamBrain/environments/github-pages/deployment-branch-policies \
  -F name=main -F type=branch
```

**Verify**:

```
gh api /repos/libz-renlab-ai/TeamBrain/environments/github-pages/deployment-branch-policies
```

The response should list both `gh-pages` and `main` under
`branch_policies`. If only `gh-pages` is present, re-apply.

This is also captured in `judge.md` §V1.A — every harness run
re-checks the policy state, so a regression would be caught the next
time someone runs the §V1 RUN block of the dogfood judge.
