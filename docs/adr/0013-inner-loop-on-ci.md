```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   ADR-0013 — Inner-loop tests on dedicated CI workflow             │
   │                                                                    │
   │   problem  : N≥4 sessions × `pnpm test` LOCALLY                    │
   │            → loadavg 274 (scheduler overload, NOT thermal)         │
   │   decision : full-suite tests → wip/** push → inner-loop.yml       │
   │              single-file targeted vitest stays LOCAL               │
   │   trade    : 5–10 sec inner loop → 2–5 min inner loop              │
   │              换 macOS 本地永远不进 scheduler-overload 区             │
   └────────────────────────────────────────────────────────────────────┘
```

# 0013 — Inner-loop tests run on dedicated CI workflow

## Status

Accepted — 2026-05-10

## Context

On 2026-05-10, with ≥4 concurrent Claude Code sessions each running `pnpm test`
locally on a developer's Mac, the `toohot` reading was:

- `loadavg`: 274.15 / 273.98 / 258.98 (1m / 5m / 15m)
- `thermal level`: normal (kernel thermal-pressure flag did NOT trip)
- top 8 node processes: ~160% total CPU on a multi-core machine

The kernel thermal flag staying "normal" rules out thermal throttle as the root
cause. The actual mechanism is **scheduler-overload**: a full vitest run forks
short-lived workers + libuv pool threads + tsc + git child-procs; multiplying
that across N sessions saturates the OS scheduler queue while CPU stays ~16%
utilised. The effect on the user is identical to thermal throttle (per-session
test wall-clock balloons, fans spin up) but the mechanism, and therefore the
fix, is different.

TeamBrain's existing workflow actively encourages parallel sessions
(see `docs/TEAMWORK.md` N+1+(2N) pattern, `docs/FIXEDFLOW.md` maintainer-driven
fix-loop). No cap on concurrent test execution exists in any contract.

## Decision

Move full-suite test execution off the developer's local machine onto a
dedicated GitHub Actions workflow.

1. **New** `.github/workflows/inner-loop.yml` triggers on
   `push: branches: [wip/**]`. Runs `pnpm install --frozen-lockfile` +
   `pnpm test` + `pnpm verify` on a single `ubuntu-latest` lane.
   No Windows matrix, no typecheck (those belong on the PR gate).
2. **Existing** `.github/workflows/ci.yml` (master/main push + PR trigger)
   is unchanged. PR-gate retains the full Ubuntu + Windows matrix + typecheck.
3. **Single-file targeted runs** (`pnpm vitest run <path>`) remain allowed
   locally as a development-mode exception. They spawn one worker and do not
   enter the scheduler-overload regime.
4. **Secrets**: a single repo secret `MINIMAX_API_KEY` is injected via
   `env: ANTHROPIC_API_KEY: ${{ secrets.MINIMAX_API_KEY }}` in the workflow YAML
   (the `claudefast` wrapper already aliases the MiniMax token to the
   `ANTHROPIC_API_KEY` env name; CI sticks with the same convention).
   Non-sensitive env values (base URL, model names, disable flags) are written
   plainly in the YAML. Token rotation is a manual user step
   (`gh secret set MINIMAX_API_KEY -b"$NEW_TOKEN"`).

## Consequences

### The deliberate trade-off

Inner-loop test latency moves from ~5–10 seconds (local) to ~2–5 minutes
(CI including queue + cold-start). 12–60× slowdown on every full-suite
iteration, accepted in exchange for permanent removal of scheduler-overload
risk regardless of how many sessions are open.

### Positive

- macOS local stays within scheduler budget regardless of session count.
- Dogfooding is automatic: every wip push self-tests `inner-loop.yml`.
- Repo is public → unlimited Actions minutes → no budget pressure.
- The targeted-exception preserves seconds-level iteration on a single file
  during deep-dive debugging, where the parallelism cost does not exist.

### Negative

- Network round-trip required for every full-suite cycle.
- Tests that need the MiniMax endpoint depend on the GitHub secret being set
  correctly; first-time setup adds a manual step.
- Discipline required to not run `pnpm test` locally out of habit.

### Rollback condition

If `inner-loop.yml` P95 wall-clock exceeds 10 minutes for sustained periods,
the trade-off shifts. At that point reconsider:

- (β) SSH remote-exec to a dev box (paperclipmini / jushi)
- (γ) Hybrid (wip CI + SSH overflow)
- Self-hosted GitHub Actions runner

## Alternatives Considered

| Option | Reject reason |
|---|---|
| ①+② Local cap + preflight gate | Solves nothing if cap is exceeded; either advisory (no enforcement) or new runtime infrastructure equivalent to ③α anyway |
| 🅰️ Modify `ci.yml` to also trigger on `wip/**` | Doubles inner-loop wall-clock by including Windows + typecheck + verify when only the test result is wanted; pollutes the PR-gate workflow's stable scope |
| 🅲️ `workflow_dispatch` manual trigger | Requires an extra `gh workflow run` command per cycle and the wip branch must exist on remote first; UX worse than a `push` trigger |
| (β) SSH to paperclipmini / jushi | 4 new infra problems (rsync vs git-bundle, Node/pnpm version sync, install cache, macOS↔Linux path drift); just transfers `toohot` to another machine you also use |
| (γ) Dual-channel CI + SSH | All costs of (β) plus maintenance of two channels for marginal benefit |
| Strict (α): ban single-file targeted local | 12–60× slowdown for cheap iteration where no scheduler-overload risk exists; over-taxes inner loop |
| Move ALL testing off-device including PR-gate | `feature-verification.md` interactive `/export` path can't run on CI; PR-gate ci.yml has matured infrastructure that doesn't need disturbing |

## Related

- `docs/plans/2026-05-10-inner-loop-on-ci/plan.md` — implementation plan
- `docs/plans/2026-05-10-inner-loop-on-ci/judge.md` — verification harness (J1–J5)
- `docs/INNER-LOOP-TESTING.md` — operating instructions (live doc)
- `docs/TEAMWORK.md` — N+1+(2N) parallel-worker pattern (orthogonal concern)
- `docs/feature-verification.md` — verification gate (canonical-help snapshot)
- `.github/workflows/ci.yml` — PR-gate workflow (unchanged by this ADR)
