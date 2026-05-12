# Report — issue #350 (digital-twin → CC runtime status upload + `/api/cc-status` query API)

FIXEDFLOW driver run (`/fixed-flow-driver`), steps 3–5. Closed by PR **#374**,
squash-merged as `183c940` on 2026-05-12.

## Actual chain executed

1. **Sanity gates** — `docs/FIXEDFLOW.md` present; `gh` auth working; issue #350
   open with `grill-ready` label + a valid grill comment ending `--- end grill ---`
   by the issue author, age ≫ 60s. → dispatch allowed.
2. **Pickup** — commented on #350; created worktree `.codex/worktrees/issue-350`
   off `origin/main` (`910bc89`) with branch `feat/issue-350`; wrote `.lock` (no
   competing driver session).
3. **Explore** — Explore subagent mapped the digital-twin uploader / `tap-session` /
   `mock-server.ts` / `quota` subsystem / `teamagent-statusline.cjs` (#337) /
   `tsup.hook.config.ts` / `install-hook.ts`. Read the grill comment as the plan
   (treated as a `docs/HOWTO-PLAN-PR.md` 4-section plan).
4. **Implementation** — 6 atomic commits:
   - `feat(issue-350): cc-status data model + pure compute + server store` —
     `packages/digital-twin/src/cc-status/{types,compute,store,index}.ts` + 24
     unit tests (J1 + roundtrip), re-exported from `@teamagent/digital-twin`.
   - `feat(issue-350): mock-server POST /v1/cc-status + GET /api/cc-status*` —
     `mock-server.ts` ingress + 4 query endpoints + 8 HTTP-level tests (J2 + J5
     HTTP slice). `runProdServer` wraps `startMockServer`, so the prod collector
     (192.168.22.88:8080) gets these for free.
   - `feat(issue-350): statusline pushes CC status snapshot (throttled, detached)` —
     `scripts/teamagent-statusline.cjs` `maybePushCcStatus` + helpers (30s
     throttle via `~/.teamagent/cc-status/.last-push`, transcript-extras scan
     capped at 4 MB, worktree-aware git branch, quota-cache read, detached
     `node -e <fetch>` child) + 5 black-box tests (J2/J5 client slice, J3, J4,
     disabled no-op, huge-transcript perf guard).
   - `docs(issue-350): cc-status feature note + J1-J5 verification harness` —
     `docs/features/cc-status.md`, `docs/features/INDEX.md`,
     `docs/plans/2026-05-12-issue-350/judge.md`.
   - `fix(issue-350): harden cc-status store + statusline push (/review iter 1)` —
     see §`/review` loop below.
   - `docs(issue-350): record /review iter-1 Verification-subagent verdict (pass)`.
5. **`/review` loop** — 2 iterations (terminated on PASS; the loop never ends
   until PASS):
   - **iter 1** — adversarial Claude subagent + maintainability/testing
     specialist subagent (no `codex` on this host). Found **1 P1** (DoS:
     `parseSinceMs` overflow → uncaught `RangeError` in the request handler →
     unauthenticated collector process crash) + several P2/P3 (unbounded
     `.cc-status.jsonl` growth; no string-length caps; `readLatestAllUsers`
     uncapped user scan; `session_id` allowed `..`/Windows reserved names;
     `readLatestPerSession` "last line = freshest" vs non-monotonic clock;
     statusline temp-file leak / misleading throttle comment; `safeUserId`/`dateStamp`
     duplication; `1e12` magic number; dead `reason:'path'` branch; `.cjs`
     missing `filePath` key). All fixed **in-branch** (no follow-up issues, per
     `docs/PR-PLAN.md`); plan: `docs/plans/2026-05-12-issue-350-iter-1-fix-plan.md`.
     A read-only Verification subagent (per `docs/AGENTIC-CODING-POLICY.md` §3)
     verified the fix commit against the plan + ran the judge harness →
     **VERDICT: pass** (109/109 tests, typecheck clean); verdict appended to the
     fix-plan.
   - **iter 2** — fresh adversarial Claude subagent on the hardened diff →
     **no remaining P1/P2** → PASS. P3 nits (unauthenticated `/all` scan
     amplification — bounded by 500-user / 60-date / 500-file caps; concurrent-append
     race — unreachable given the 30s throttle; double `aggregateWindowedTokens`
     per render) noted as acceptable, not fixed.
6. **PR** — pushed `feat/issue-350` (after `gh auth setup-git` resolved a stale
   credential), opened normal PR **#374** (NOT `--draft`) with the 4-section body
   (plan from the grill / expected outputs / how-to-verify→judge.md / claudefast
   probes→N/A explained).
7. **Merge** — `gh api .../branches/main/protection` → `404` (no branch protection
   configured; flagged to the maintainer in the PR body, since configuring it
   needs admin access this account lacks and the repo's established workflow is
   squash-merge without it). Auto-merge disabled on the repo, so polled CI to
   green, then `gh pr merge 374 --squash --delete-branch`. Hit "head branch not
   up to date with the base branch" twice (main is active — moved while CI ran):
   `git rebase origin/main` + force-push the first time, `gh pr update-branch 374`
   the second; re-polled CI green each time. Squash-merged on the third merge
   attempt → `183c940` (the `gh pr merge` local-pull cleanup failed harmlessly —
   `main` is checked out in the parent worktree — but the remote merge +
   `--delete-branch` succeeded).
8. **Cleanup** — removed the worktree (`git worktree remove --force` left the dir,
   then `rm -rf` + `git worktree prune`); `git branch -D feat/issue-350`; remote
   branch already deleted by `--delete-branch`; `git pull --ff-only` on the parent
   `main` → `183c940`; commented + the issue was already auto-closed by
   "Closes #350" in the PR body.

## Iteration count

`/review` loop: **2 iterations** (iter 1 found findings → fixed; iter 2 PASS).
Squash-merge: **3 attempts** (2× "not up to date" → rebase / update-branch → re-CI).

## Token spend

Not instrumented — `.fixedflow/iter-350.json` was carried in the (now-removed)
worktree and never received real token counts (the driver session has no
self-introspection of token usage). N/A.

## Deviations from the grill plan

- **Client push site = the statusline, not a new hook.** The grill's Q3 lists an
  `event` field ("which CC hook fired") and Q9 enumerates per-hook throttle
  behavior, implying a dedicated `bin-cc-status-reporter` hook wired into 7 hook
  entries via `install-hook.ts`. Implemented instead inside
  `scripts/teamagent-statusline.cjs` (`maybePushCcStatus`): it's the only process
  that receives `model` / `cost` / `exceeds_200k_tokens` (those are on the
  statusline's stdin payload, not on hook stdin), it already computes the
  transcript-derived fields (reuses #337's `readLatestUsage` / `aggregateWindowedTokens`),
  and it needs **zero** new hook registration / `tsup.hook.config.ts` /
  `install-hook.ts` churn. `event` is `"Status"`. Throttle is the high-frequency
  case (the statusline renders ≫ every 30s), which maps to the grill's
  PreToolUse/PostToolUse `>30s` rule. Wiring additional push sites onto the
  frequent hooks (UserPromptSubmit / PreToolUse / PostToolUse, throttled) or
  low-frequency ones (Stop / SessionEnd / PreCompact, every time) per grill Q9 is
  a mechanical follow-up using the same `buildCcStatusSnapshot` body shape —
  deliberately out of scope for this PR to keep it reviewable (noted in
  `docs/features/cc-status.md` "Client push site"). The data model
  (`cc-status/compute.ts`) already exposes `shouldPush(...)` and
  `buildCcStatusSnapshot(...)` for that.
- **`session_health` values.** The grill example JSON shows `"OK"`; this ships
  `'OK' | 'OVER_200K'` (cleaner API enum than the statusline's emoji rendering).
- **No `display_name`.** `digital-twin.json` has no `display_name` field today, so
  the snapshot omits it (the type keeps it optional for when one's added).
- **`stale_seconds`** is computed server-side at query time (not stored), exactly
  per the grill's Q5 response shape.
- **J6** (post-shutdown) skipped — Q6b chose no opt-out/pause switch.
- **claudefast probes** — N/A: no CLI `--help` surface or hook-JSON probe for this
  feature (the push path is the statusline, exercised end-to-end by the J2/J4/J5
  black-box tests that spawn the real `.cjs` against a mock server). The judge
  doc's manual smoke (`curl http://192.168.22.88:8080/api/cc-status?user=<id>`
  from a live CC session) is the equivalent.

## Links

- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/374 (squash-merge `183c940`)
- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/350
- Feature note: `docs/features/cc-status.md`
- Verification harness: `docs/plans/2026-05-12-issue-350/judge.md`
- `/review` iter-1 fix-plan + Verification verdict: `docs/plans/2026-05-12-issue-350-iter-1-fix-plan.md`
- Branch commits (squashed into `183c940`): `1488bac` data model · `6c85cb2`
  server endpoints · `d83d870` statusline push · `667c30a` docs · `b0c6f77`
  (was `d0063c0` pre-rebase) iter-1 hardening · `d834654` (was `cb955e9`) verdict.
