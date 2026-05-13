```
   ____    _ _      _   _ _   ____            _
  / ___|  | |_|__ _| | | | | |  _ \  ___ _ __| |__   _ _ __
  \___ \ _| | __/ _` | | | | |_| |_) |/ _ \ '_  _ \  | '_ \
   ___) | |_ |  _| (_| | |_| | _| |_) |  __/ |  | | |_| | | |
  |____/_|_|\__|\__,_|\___/  |____/ \___|_|  |_|\___|_| |_|

         ADR-0015 — Symphony (autonomous) replaces FIXEDFLOW
                    (manual /fixed-flow-driver in Claude Code)
```

# ADR-0015 — Symphony-driven autonomous dispatch replaces manual FIXEDFLOW

**Status**: accepted (2026-05-14). Implementation lives in fork
[`LiuShiyuMath/symphony#claude-multi-provider`](https://github.com/LiuShiyuMath/symphony/tree/claude-multi-provider).
Phase 1 (this PR) lands docs only; Phase 2 (operational cutover +
root `CLAUDE.md` rewrite) is a follow-up.

**Supersedes**: mainline dispatch lifecycle in `docs/FIXEDFLOW.md`,
"do not let fixed-flow touch this" parking semantics of `track:symphony`,
and `禁止任何 watcher / 后台轮询 / 自动 dispatch` rule in root `CLAUDE.md`.

**Related**: ADR-0007 (`/review` POSTPR gate — preserved),
`docs/SYMPHONY-FLOW.md` (Q0-Q5 lifecycle; runtime status flipped here),
`docs/TWO-DRIVER-COEXISTENCE.md` (cross-track refusal — still valid since
manual `/fixed-flow-driver` stays as fallback).

## Context

FIXEDFLOW was designed when Symphony's upstream shipped only a Linear
tracker adapter and a Codex agent runner. Two structural mismatches
blocked using Symphony to drive TeamBrain:

1. **Tracker**: TeamBrain runs on GitHub Issues + FIXEDFLOW labels
   (`grill-ready`, `docs-grill-ready`, ...). Symphony only polled Linear.
2. **Agent**: TeamBrain culture expects Claude Code. Symphony only knew
   `codex app-server` JSON-RPC.

Manual `/fixed-flow-driver` is the current workaround — works but
hand-driven; the maintainer becomes the dispatcher.

Two pieces landed in `LiuShiyuMath/symphony#claude-multi-provider`
that remove both blockers:

- **Multi-provider Agent Runner** (`SymphonyElixir.AgentRunner.Behaviour`)
  with `claude -p` headless runner. Verified end-to-end via
  `mix symphony.claude_smoke` returning `:turn_completed` + `:ok`.
- **GitHub Tracker adapter** (`SymphonyElixir.Tracker.Github`) that
  calls `gh` CLI for issue fetch / comment creation, deriving Symphony
  state strings from the issue's label set
  (`required_labels` + `forbidden_labels` + `in_progress_label`).

With both in place, Symphony can act as TeamBrain's autonomous driver
without losing the existing FIXEDFLOW label semantics or `/review` gate.

## Decision

Adopt Symphony as the **default driver** for issue→PR→merge on
TeamBrain. Manual `/fixed-flow-driver` remains as the **fallback** for
hotfix / synchronous control / Symphony self-debugging.

Specifically:

1. **Routing**: Symphony dispatches an issue iff its label set satisfies
   the fork's `WORKFLOW.teambrain.md` filter (`required_labels =
   [grill-ready, docs-grill-ready]`, `forbidden_labels = [grill-working,
   non-conformant, bypass-fixed-flow, ready-for-human, epic,
   needs-grill-comment, needs-docs-grill]`). The `track:symphony` label
   is no longer required — its previous parking semantics fold into the
   Symphony default.
2. **Human gate**: Symphony opens a PR autonomously; merge waits for a
   human PR review (`gh pr review <PR> --approve`) plus the
   `symphony-human-reviewed` label, per `docs/SYMPHONY-FLOW.md`
   §Human review. The 5-phase lifecycle Q0-Q5 is unchanged.
3. **`/review` skill is preserved** (ADR-0007). The runner agent invokes
   `/review` inside its workspace until PASS before opening the PR.
4. **Manual `/fixed-flow-driver` remains supported** so maintainers can
   step in for hotfixes. `grill-working` label still serves as
   cross-host mutex (`docs/PRE-IMPLEMENT-CLAIM.md`); Symphony respects
   it via `forbidden_labels`.
5. **Watcher / polling is now permitted** for the Symphony daemon
   specifically. Root `CLAUDE.md`'s "禁止 watcher" hard rule is
   replaced (Phase 2 follow-up PR) with a conditional rule: allowed iff
   it's the Symphony daemon configured by `WORKFLOW.teambrain.md`. Any
   other ad-hoc watcher is still forbidden.

## Consequences

**Positive** — reduces maintainer attention cost; SYMPHONY-FLOW.md
becomes executable contract; same `gh` auth + label semantics, no new
credentials; provider abstraction lets us swap Claude ↔ Codex ↔ other
by editing one config field; ADR-0007 `/review` contract preserved.

**Negative** — bus factor concentrated on the maintainer who built the
fork (upstream PR planned in Phase 3); the Symphony daemon needs a host
to run on (maintainer's box for v1); root `CLAUDE.md` watcher rule needs
rewriting (touches multiple canned-answer anchors that grep for "禁止
watcher").

**Risks** — fork drifts from upstream `openai/symphony` (mitigate via
atomic commits, already enforced); `claude -p` headless mode requires
Claude Code CLI on Symphony host; hooks misconfiguration on the daemon
host surfaces as `:malformed` events (tolerated by runner but can mask
real errors).

## Migration

**Phase 1 (this PR)** — docs land the policy shift:

- This ADR merged.
- `docs/SYMPHONY-FLOW.md` runtime status flipped to "executable via fork".
- `docs/FIXEDFLOW.md` gets a deprecation banner pointing at SYMPHONY-FLOW.md
  + this ADR.
- Root `CLAUDE.md` watcher rule **not** yet rewritten (Phase 2; keeps
  this PR small + reversible).

**Phase 2 (follow-up PR)** — operational cutover:

- Stand up Symphony daemon on a known host (maintainer's box v1,
  dedicated VM later).
- Rewrite root `CLAUDE.md`'s "禁止 watcher" rule into a conditional
  ("allowed iff Symphony daemon configured by `WORKFLOW.teambrain.md`").
- Update grill-via-web / grill-with-docs canned answers to mention
  autonomous pickup post-grill-ready.
- Add `track:fixed-flow` opt-out label (inverse of today's
  `track:symphony` opt-in).
- One-week monitor before deprecating `/fixed-flow-driver`.

**Phase 3 (further follow-up)** — open PR to upstream `openai/symphony`
for the agent-runner abstraction + GitHub adapter; deprecate the fork
once landed.

## Alternatives considered

1. Keep FIXEDFLOW manual forever — rejected; conflicts with TeamBrain's
   "实时知道项目成员进展" business feature.
2. Build a TeamBrain-specific daemon from scratch — rejected; Symphony
   already encodes orchestration (workspaces, hooks, retry backoff,
   worker pool, workpad). Reusing the Elixir codebase via fork is
   cheaper.
3. Run Symphony against Linear (existing adapter) — rejected; mirroring
   GitHub→Linear is operationally expensive (sync drift,
   double-vocabulary).
4. Wait for upstream GitHub adapter — rejected; no public roadmap, and
   working code exists in the fork now.

## How to verify

- `cd /Users/m1/projects/symphony/elixir && mise exec -- mix test
  --exclude live` → 276 tests, 0 failures modulo 2 pre-existing timer
  flakes (same flakes exist on Symphony `main`, see ADR-0013 pattern).
- `mise exec -- mix symphony.claude_smoke --workflow
  ./WORKFLOW.claude-smoke.md` → end-to-end `claude -p` dispatch returns
  `:turn_completed` and `:ok`.
- `claudefast -p "show github symphony lifecycle for me"` continues to
  hit the 5-anchor lifecycle described in `docs/SYMPHONY-FLOW.md` (no
  canned-answer drift from this ADR).
