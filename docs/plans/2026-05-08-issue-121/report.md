```text
                    report.md — issue #121 implementation report
                    =============================================

    plan ──► research ──► annotate/implement ──► report (← here)
       │          │              │                   │
       │          │              │                   │
   plan.md     research.md    7 commits             report.md
                              + 2 /review rounds    (this file)
                              + 1 round 2 cleanup
                              + Codex silent
                              + CI green
                              ──► READY TO SQUASH-MERGE
```

# Issue #121 — Implementation Report

PR: <https://github.com/libz-renlab-ai/TeamBrain/pull/180>
Branch: `worktree-issue121` → `main` (squash merge)
Commits: 7 on branch (3 feature + 3 fix + 1 docs)
Status: **READY FOR SQUASH MERGE** (pending user authorization)

## What shipped

The PR delivers all 8 acceptance criteria from issue #121:

| # | Criterion | Delivered by |
|---|-----------|--------------|
| 1 | release-branch.yml publishes both legacy POSIX install.sh AND P4 install.sh | Worker A (`e18412e`) — workflow stages both at /tmp/release-stage/ |
| 2 | install.sh.sha256 published next to install.sh | Worker A v2 (`e18412e`) + Worker A v3 (`0af9460`) — sha256 regenerated from templated copy at deploy time |
| 3 | curl-fetched install.sh passes `bash -n` | Worker B (`9f5dee9`) — confirmed by §V1.1, exit 0 |
| 4 | --dry-run prints 7 [dry-run] lines + exits 0 | Worker B (`9f5dee9`) + R2-F1 alignment fix (`49edde7`) — confirmed by §V1.3 |
| 5 | shasum -a 256 -c on install.sh.sha256 passes | Worker B (`9f5dee9`) — confirmed by §V1.5 |
| 6 | Tarball strategy works (Release asset OR archive fallback) | Worker A v2 (`e18412e`) Release pipeline + Worker B v2 (`c9a605b`) reachable archive fallback |
| 7 | Backward compat: existing curl\|sh users still get a working install | Worker B (`9f5dee9`) — `release/install-legacy.sh` verbatim copy |
| 8 | CI green, no Codex actionable findings | CI ubuntu+windows pass; Codex bot silent (usage-cap message only); /review round 3 PASS |

## Decision log (3a chosen)

User picked "一步到位" (3a — full Release pipeline) over "便宜路线" (3b — archive fallback only). 3a expanded Worker A's scope to include:

- Version detection from `packages/teamagent/package.json`
- Idempotent `gh release create` with 3 assets (tarball + tarball.sha256 + install.sh.sha256)
- `pnpm pack` tarball assembly
- Stage-time templating that sed-replaces install.sh's hardcoded TEAMAGENT_VERSION default with the actual release tag

Belt-and-suspenders: archive fallback in install.sh kept (Worker B v2's CRIT #4 fix made it reachable) for users who pin a pre-3a TEAMAGENT_VERSION.

## /review POSTPR rounds

### Round 1 (after first push)

4 specialists dispatched (testing, maintainability, security, performance) per `/review` skill flow. Findings:
- 4 CRITICAL (3 from security, 1 from maintainability — confirmed 4-way)
- 20 INFORMATIONAL across the 4 specialists

PR-PLAN written at `pr-180-fix-plan.md` per `docs/PR-PLAN.md` strict 3-section shape. TEAMWORK dispatched 3 sonnet workers (A v3 / B v2 / C v2) for 4 CRIT + 6 mechanical INFO; 14 INFO deferred with named reasons (D1-D14).

### Round 2 (after fix push)

3 specialists re-graded (Performance skipped — round 1 perf findings all deferred):
- Security: PASS — 4/4 CRIT resolved, 0 new CRIT, 3 new INFO
- Maintainability: CONDITIONAL_PASS — 7/7 round 1 resolved, 4 new INFO, non-blocking
- Testing: INFORMATIONAL_ONLY — 4/4 resolved or properly deferred, 1 new INFO

Lead applied 4 mechanical regressions inline (commit `49edde7`):
- R2-F1 SAFE_MODE display reads re-fetched copy
- R2-F2 explicit `|| exit 1` intent comment
- R2-F3 judge.md V1.13 ordering note
- R2-F4 workflow rm-before-pack stale-glob safety

4 new INFO deferred (D15-D19).

### Round 3 (after cleanup push)

Focused Security specialist re-grade. Verdict:
```json
{"verdict":"PASS","round1_crit_resolved":4,"round2_regressions":0,"new_findings":0,"new_critical":0}
```

Both deferred items (D16, D17) confirmed pre-existing — not introduced by this PR.

CI ubuntu-latest + windows-latest both green.
Codex bot returned only a usage-cap message (not a finding).

**Loop terminated. Hard PASS achieved.**

## Deferred items (filed for follow-up)

These INFO findings were seen but not addressed in this PR per scope and time constraints. Each is logged with a named reason. Track in a follow-up issue:

| ID | Finding | Source |
|----|---------|--------|
| D1 | install.sh:9 TARBALL_BASE = FALLBACK_BASE redundancy | Maintainability + Performance + Testing |
| D2 | install.sh:74 `--max-redirs 3` magic number | Maintainability |
| D3 | install.sh:71-74 two-curl pattern (TOCTOU + DRY + perf) | Security + Performance + Maintainability |
| D4 | workflow:23 no pnpm cache | Performance |
| D5 | workflow:77 TOCTOU between gh release view + create | Security + Performance |
| D6 | workflow:100 GH_TOKEN in git remote URL | Security (pre-existing) |
| D7 | install.sh:185 SAFE_MODE cat $0 in pipe — RESOLVED by R2-F1 | Security (resolved in round 2) |
| D8 | sed regex doesn't anchor pre-release versions | Testing |
| D9-D11 | bats test infrastructure for shell tests (3 separate gaps) | Testing |
| D12 | vitest test for sed pre-release version handling | Testing |
| D13 | install.sh self-verify pre-existing — RESOLVED by CRIT #1 | Research |
| D14 | Cross-LLM judge §V3.2 (codex) INCONCLUSIVE due to local auth | Run-time |
| D15 | install.sh:169 three-tier degrade chain untested | Testing (no bats infra) |
| D16 | install.sh:79 redirect-guard probe `\|\| true` (pre-existing) | Security |
| D17 | install.sh:186 bare _download_with_fallback for SHA file lacks call-site error | Maintainability |
| D18 | judge.md V1.13 numbering — RESOLVED by R2-F3 | Maintainability |
| D19 | workflow:47 sequential cd in Pack step (style) | Maintainability |

Suggested follow-up issue: "release/install.sh + release-branch.yml polish — defer items D1-D19 from issue #121".

## Out of scope (explicitly NOT done)

- Self-update mechanism (issue #84 §H6 punt; `TEAMAGENT_VERSION` env var still pins a tag)
- External CDN mirror (issue #84 §H5 stands)
- bats / shell test infrastructure (separate concern)
- _curl_safe refactor to single-pass network round-trip (D3)
- pnpm cache in workflow (D4)
- Pre-release version support in semver guard / sed regex (D8 / D12)

## Worktree convention deviation

Per CLAUDE.md, worktrees should live under `.codex/worktrees/<task-name>`. This PR's worktree was created at `.claude/worktrees/issue121/` (also gitignored) before the rule was checked. Per AGENTS.md the violation is observation-only — no functional impact, just process drift. Future worktrees should align with `.codex/worktrees/`.

## What the bot will do on first push to main

When this PR squash-merges:
1. `release-branch.yml` triggers on push to main
2. Workflow: setup-node@v4, pnpm install, pnpm --filter teamagent build
3. Detect version (validates `^[0-9]+\.[0-9]+\.[0-9]+$` against package.json — currently `0.10.1`)
4. `pnpm pack` → `teamagent-v0.10.1.tgz` + `.sha256` in /tmp/release-assets
5. Stage install.sh + install-legacy.sh + install.sh.sha256 (regenerated from templated install.sh) at /tmp/release-stage
6. `gh release view v0.10.1` → not found → `gh release create v0.10.1` with 3 assets
7. Force-push /tmp/release-stage to `origin/release` branch

After 1st run, `curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | bash` will:
1. Fetch the templated install.sh (TEAMAGENT_VERSION defaults to v0.10.1)
2. Re-fetch sha256 + install.sh from SHA-anchored URLs (so self-verify works under pipe-to-bash)
3. Verify both
4. Show the verified script in --safe mode (default)
5. Prompt for confirmation
6. On Y: download teamagent-v0.10.1.tgz from Release assets, verify, npm install -g

## Recommended next step

**`gh pr merge 180 --squash`** — squash merge per user-feedback memory ("ONLY use squah no merge commit or rebase merge"). After merge:
- Bot publishes new install.sh to `origin/release` on first push
- Verify: `curl -fsSL .../release/install.sh | bash -s -- --dry-run` prints 7 [dry-run] lines with v0.10.1 default
- Verify: `gh release view v0.10.1` shows 3 assets uploaded

**Cleanup after merge**:
- Worktree `.claude/worktrees/issue121/` can be removed (`git worktree remove --force .claude/worktrees/issue121`)
- Branch `worktree-issue121` already deleted automatically by squash merge (default GitHub behavior)
- `.judge/issue-121-*` evidence dirs are gitignored; can be deleted at leisure

## See also

- `plan.md` — original PR plan + DECISION LOG (3a chosen)
- `research.md` — context dump (P4 mitigation map, install.sh diff vs draft, decision log echo)
- `judge.md` — md playbook (§V1 17 steps + §V2 schema + §V3 cross-LLM judge)
- `pr-180-fix-plan.md` — POSTPR fix plan with round 1 + round 2 + deferrals
